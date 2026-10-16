import assert from 'node:assert';
import crypto from 'node:crypto';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

// Set test environment configuration
process.env.TEST_MODE = 'true';
process.env.NODE_ENV = 'test';
process.env.TOKEN_ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
process.env.GOOGLE_CLIENT_ID = 'test-client-id-student-submission.apps.googleusercontent.com';
process.env.GOOGLE_CLIENT_SECRET = 'test-mock-google-client-secret';
process.env.GOOGLE_REDIRECT_URI = 'http://localhost:3001/api/storage/google/callback';
process.env.FRONTEND_URL = 'http://localhost:5173';
process.env.MAX_SUBMISSION_FILE_SIZE = String(512 * 1024); // 512 KB limit for fast testing

import {
  googleDriveService,
  GoogleDriveService,
  CANONICAL_DEPARTMENT_MAP,
  isMatchingDepartment,
  isMatchingSection,
  isAssignmentPastDue
} from '../server/services/googleDriveService.js';
import { encrypt } from '../server/services/encryptionService.js';
import { app } from '../server.js';
import {
  handleUploadSubmission,
  handleGetStudentSubmissions,
  handleGetAssignmentSubmission,
  MAX_SUBMISSION_FILE_SIZE
} from '../server/routes/storageRoutes.js';
import {
  submitStudentAssignment,
  getStudentSubmissions,
  getAssignmentSubmission
} from '../src/services/storageService.js';

let passed = 0;
let failed = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`  [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`  [FAIL] ${name}:`, err.message);
    failed++;
  }
}

async function runAsyncTest(name, fn) {
  try {
    await fn();
    console.log(`  [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`  [FAIL] ${name}:`, err.message);
    failed++;
  }
}

console.log('\n======================================================');
console.log(' SANGAM STUDENT ASSIGNMENT SUBMISSION — STAGE 7 TEST SUITE');
console.log(' Notice: Tests use deterministic local mocked Firestore');
console.log(' and Google Drive API doubles for secure regression validation.');
console.log(' Real Google account verification requires live OAuth credentials.');
console.log('======================================================\n');

// -----------------------------------------------------------------------------
// High-fidelity Mock Firestore with support for queries and collections
// -----------------------------------------------------------------------------
class MockFirestore {
  constructor() {
    this.store = new Map(); // path -> { data: any, version: number }
  }

  collection(collName) {
    const self = this;
    return {
      doc: (docId) => {
        const path = `${collName}/${docId}`;
        return {
          id: docId,
          path,
          set: async (data, options) => {
            const current = self.store.get(path);
            const currentVersion = current ? current.version : 0;
            if (options && options.merge && current) {
              self.store.set(path, {
                data: { ...current.data, ...data },
                version: currentVersion + 1
              });
            } else {
              self.store.set(path, {
                data: JSON.parse(JSON.stringify(data)),
                version: currentVersion + 1
              });
            }
          },
          get: async () => {
            const current = self.store.get(path);
            return {
              exists: Boolean(current),
              id: docId,
              data: () => (current ? JSON.parse(JSON.stringify(current.data)) : undefined)
            };
          },
          delete: async () => {
            self.store.delete(path);
          }
        };
      },
      where: (field, op, val) => {
        const filters = [{ field, op, val }];
        const queryObj = {
          where: (f, o, v) => {
            filters.push({ field: f, op: o, val: v });
            return queryObj;
          },
          get: async () => {
            const docs = [];
            for (const [key, record] of self.store.entries()) {
              if (key.startsWith(`${collName}/`)) {
                let matches = true;
                for (const filter of filters) {
                  if (filter.op === '==' && record.data[filter.field] !== filter.val) {
                    matches = false;
                    break;
                  }
                  if (filter.op === '<' && !(record.data[filter.field] < filter.val)) {
                    matches = false;
                    break;
                  }
                }
                if (matches) {
                  docs.push({
                    id: key.split('/')[1],
                    ref: { path: key },
                    data: () => JSON.parse(JSON.stringify(record.data))
                  });
                }
              }
            }
            return {
              empty: docs.length === 0,
              docs,
              forEach: (callback) => docs.forEach(callback)
            };
          }
        };
        return queryObj;
      },
      get: async () => {
        const docs = [];
        for (const [key, record] of self.store.entries()) {
          if (key.startsWith(`${collName}/`)) {
            docs.push({
              id: key.split('/')[1],
              ref: { path: key },
              data: () => JSON.parse(JSON.stringify(record.data))
            });
          }
        }
        return {
          empty: docs.length === 0,
          docs,
          forEach: (callback) => docs.forEach(callback)
        };
      }
    };
  }

  async runTransaction(updateFn) {
    const transaction = {
      get: async (docRef) => docRef.get(),
      set: async (docRef, data, options) => docRef.set(data, options),
      delete: async (docRef) => docRef.delete()
    };
    return await updateFn(transaction);
  }
}

// -----------------------------------------------------------------------------
// Mock Google Drive API Double
// -----------------------------------------------------------------------------
class MockDriveApi {
  constructor() {
    this.folders = new Map(); // folderId -> { id, name, trashed: false }
    this.files = new Map();   // fileId -> { id, name, folderId, size, mimeType, buffer }
    this.shouldTimeout = false;
    this.shouldFailAuth = false;
  }

  async verifyFolder(folderId, accessToken) {
    if (this.shouldFailAuth) {
      const err = new Error('Google authorization has been revoked or expired.');
      err.statusCode = 401;
      err.code = 'GOOGLE_AUTH_REVOKED';
      throw err;
    }
    const folder = this.folders.get(folderId);
    if (!folder) {
      return { exists: false, trashed: true };
    }
    return { exists: !folder.trashed, trashed: folder.trashed, name: folder.name };
  }

  async createFolder(name, accessToken) {
    if (this.shouldFailAuth) {
      const err = new Error('Google authorization has been revoked or expired.');
      err.statusCode = 401;
      err.code = 'GOOGLE_AUTH_REVOKED';
      throw err;
    }
    const id = `folder_${crypto.randomBytes(8).toString('hex')}`;
    const folder = { id, name, trashed: false };
    this.folders.set(id, folder);
    return folder;
  }

  async uploadFile(folderId, fileName, mimeType, buffer, accessToken, options = {}) {
    if (this.shouldTimeout) {
      const err = new Error('Upstream Google Drive service timed out after 30000ms.');
      err.statusCode = 504;
      err.code = 'ETIMEDOUT';
      throw err;
    }
    if (this.shouldFailAuth) {
      const err = new Error('Google authorization error: invalid_grant');
      err.statusCode = 401;
      throw err;
    }

    const fileId = `file_${crypto.randomBytes(8).toString('hex')}`;
    const file = {
      id: fileId,
      name: fileName,
      folderId,
      size: buffer.length,
      mimeType,
      buffer,
      description: options.description
    };
    this.files.set(fileId, file);
    return {
      id: fileId,
      name: fileName,
      mimeType,
      size: buffer.length
    };
  }
}

// -----------------------------------------------------------------------------
// Helper to seed baseline test records in mock Firestore
// -----------------------------------------------------------------------------
function seedBaselineRecords(mockDb, mockDrive) {
  const encKey = process.env.TOKEN_ENCRYPTION_KEY;

  // 1. Teacher account
  mockDb.store.set('users/teacher_sarah', {
    data: {
      uid: 'teacher_sarah',
      email: 's.jenkins@sangam.edu',
      name: 'Dr. Sarah Jenkins',
      role: 'faculty',
      status: 'active',
      department: 'Computer Science',
      institution: 'UEMK',
      createdAt: '2026-01-01T00:00:00Z'
    },
    version: 1
  });

  // 2. Connected Google Drive integration for teacher_sarah
  const encryptedTokens = encrypt(
    JSON.stringify({
      access_token: 'mock-valid-access-token-1234',
      refresh_token: 'mock-refresh-token-5678',
      expires_in: 3600
    }),
    encKey
  );

  const folderId = 'folder_sarah_coursework_101';
  mockDrive.folders.set(folderId, { id: folderId, name: 'Sangam Coursework', trashed: false });

  mockDb.store.set('faculty_storage_integrations/teacher_sarah', {
    data: {
      facultyUid: 'teacher_sarah',
      provider: 'google',
      status: 'connected',
      accountEmail: 'sarah.jenkins.drive@gmail.com',
      accountName: 'Sarah Jenkins',
      encryptedAccessToken: encryptedTokens.encryptedData,
      accessTokenIv: encryptedTokens.iv,
      accessTokenAuthTag: encryptedTokens.authTag,
      encryptedRefreshToken: encryptedTokens.encryptedData,
      refreshTokenIv: encryptedTokens.iv,
      refreshTokenAuthTag: encryptedTokens.authTag,
      tokenExpiresAt: Date.now() + 3600000,
      rootFolderId: folderId,
      rootFolderName: 'Sangam Coursework',
      connectedAt: '2026-10-01T10:00:00Z',
      updatedAt: '2026-10-01T10:00:00Z'
    },
    version: 1
  });

  // 3. Disconnected teacher
  mockDb.store.set('users/teacher_disconnected', {
    data: {
      uid: 'teacher_disconnected',
      email: 'disconnected@sangam.edu',
      name: 'Prof. Disconnected',
      role: 'faculty',
      status: 'active',
      department: 'Computer Science',
      institution: 'UEMK',
      createdAt: '2026-01-01T00:00:00Z'
    },
    version: 1
  });

  mockDb.store.set('faculty_storage_integrations/teacher_disconnected', {
    data: {
      facultyUid: 'teacher_disconnected',
      provider: 'google',
      status: 'disconnected',
      accountEmail: 'disconnected@gmail.com',
      updatedAt: '2026-10-01T10:00:00Z'
    },
    version: 1
  });

  // 4. Assignments created by teacher_sarah
  // a) Active assignment for CSE AI, 2nd Year, Sec C (future due date)
  mockDb.store.set('assignments/asg_active_dsa', {
    data: {
      id: 'asg_active_dsa',
      teacherUid: 'teacher_sarah',
      teacherEmail: 's.jenkins@sangam.edu',
      institution: 'UEMK',
      department: 'CSE AI',
      year: '2nd Year',
      section: 'Sec C',
      subject: 'DSA',
      title: 'Binary Trees Implementation',
      dueDate: '2026-11-20',
      storageProvider: 'google',
      driveFileId: 'asg_file_trees_01',
      driveFileName: 'Assignment_Binary_Trees.pdf',
      createdAt: '2026-10-15T10:00:00Z',
      updatedAt: '2026-10-15T10:00:00Z'
    },
    version: 1
  });

  // b) Past-due assignment
  mockDb.store.set('assignments/asg_past_due', {
    data: {
      id: 'asg_past_due',
      teacherUid: 'teacher_sarah',
      teacherEmail: 's.jenkins@sangam.edu',
      institution: 'UEMK',
      department: 'CSE AI',
      year: '2nd Year',
      section: 'Sec C',
      subject: 'DSA',
      title: 'Recursion Basics',
      dueDate: '2026-10-01', // definitely in the past relative to 2026-10-16
      storageProvider: 'google',
      driveFileId: 'asg_file_recursion_01',
      driveFileName: 'Assignment_Recursion.pdf',
      createdAt: '2026-09-15T10:00:00Z',
      updatedAt: '2026-09-15T10:00:00Z'
    },
    version: 1
  });

  // c) Assignment owned by disconnected teacher
  mockDb.store.set('assignments/asg_disconnected_teacher', {
    data: {
      id: 'asg_disconnected_teacher',
      teacherUid: 'teacher_disconnected',
      teacherEmail: 'disconnected@sangam.edu',
      institution: 'UEMK',
      department: 'CSE AI',
      year: '2nd Year',
      section: 'Sec C',
      subject: 'AI',
      title: 'Neural Networks 101',
      dueDate: '2026-11-20',
      storageProvider: 'google',
      driveFileId: 'asg_file_nn_01',
      driveFileName: 'Assignment_NN.pdf',
      createdAt: '2026-10-15T10:00:00Z',
      updatedAt: '2026-10-15T10:00:00Z'
    },
    version: 1
  });

  // 5. Eligible student: Alex Carter (CSE AI, 2nd Year, Sec C, UEMK)
  mockDb.store.set('users/student_alex', {
    data: {
      uid: 'student_alex',
      email: 'alex.carter@sangam.edu',
      name: 'Alex Carter',
      roll: 'CS21001',
      role: 'student',
      status: 'active',
      department: 'CSE AI',
      year: '2nd Year',
      section: 'Sec C',
      institution: 'UEMK',
      createdAt: '2026-01-01T00:00:00Z'
    },
    version: 1
  });

  // 6. Student in mismatched section: Priya Sharma (Sec A)
  mockDb.store.set('users/student_priya_sec_a', {
    data: {
      uid: 'student_priya_sec_a',
      email: 'priya.sharma@sangam.edu',
      name: 'Priya Sharma',
      roll: 'CS21002',
      role: 'student',
      status: 'active',
      department: 'CSE AI',
      year: '2nd Year',
      section: 'Sec A',
      institution: 'UEMK',
      createdAt: '2026-01-01T00:00:00Z'
    },
    version: 1
  });

  // 7. Student in mismatched department: Rahul (Mechanical Engineering)
  mockDb.store.set('users/student_rahul_me', {
    data: {
      uid: 'student_rahul_me',
      email: 'rahul.me@sangam.edu',
      name: 'Rahul Verma',
      roll: 'ME21003',
      role: 'student',
      status: 'active',
      department: 'Mechanical Engineering',
      year: '2nd Year',
      section: 'Sec C',
      institution: 'UEMK',
      createdAt: '2026-01-01T00:00:00Z'
    },
    version: 1
  });

  // 8. Inactive / pending student
  mockDb.store.set('users/student_pending', {
    data: {
      uid: 'student_pending',
      email: 'pending@sangam.edu',
      name: 'Pending Student',
      roll: 'CS21099',
      role: 'student',
      status: 'pending_approval',
      department: 'CSE AI',
      year: '2nd Year',
      section: 'Sec C',
      institution: 'UEMK',
      createdAt: '2026-01-01T00:00:00Z'
    },
    version: 1
  });
}

function wireServiceDoubles(mockDb, mockDrive) {
  googleDriveService.setTestDb(mockDb);
  googleDriveService.customDriveApi = mockDrive;
  googleDriveService.verifyFolder = (folderId, token) => mockDrive.verifyFolder(folderId, token);
  googleDriveService.createDriveFolder = (name, token) => mockDrive.createFolder(name, token);
  googleDriveService.uploadFileToFolder = (folderId, fileName, mimeType, buffer, token, opts) =>
    mockDrive.uploadFile(folderId, fileName, mimeType, buffer, token, opts);
}

// Valid minimal PDF buffer starting with %PDF-
const VALID_PDF_BUFFER = Buffer.from('%PDF-1.5 minimal valid test PDF content for student submission');

// -----------------------------------------------------------------------------
// TEST RUNNER
// -----------------------------------------------------------------------------
async function runAllTests() {
  const mockDb = new MockFirestore();
  const mockDrive = new MockDriveApi();
  seedBaselineRecords(mockDb, mockDrive);
  wireServiceDoubles(mockDb, mockDrive);

  console.log('--- SECTION 1: Academic Scope & Student Eligibility Verification ---');

  await runAsyncTest('1.1: Authorized active student in matching scope passes authorization and uploads submission', async () => {
    const result = await googleDriveService.uploadStudentSubmission({
      studentUid: 'student_alex',
      studentEmail: 'alex.carter@sangam.edu',
      assignmentId: 'asg_active_dsa',
      fileBuffer: VALID_PDF_BUFFER,
      originalFileName: 'Alex_Binary_Trees.pdf',
      fileSize: VALID_PDF_BUFFER.length
    });

    assert.ok(result.submission, 'Expected submission object');
    assert.strictEqual(result.submission.studentUid, 'student_alex');
    assert.strictEqual(result.submission.assignmentId, 'asg_active_dsa');
    assert.strictEqual(result.submission.teacherUid, 'teacher_sarah');
    assert.strictEqual(result.submission.storageProvider, 'google_drive');
    assert.ok(result.submission.driveFileId, 'Expected driveFileId');
    assert.strictEqual(result.isReplay, false);

    // Verify stored in Firestore submissions collection
    const stored = await mockDb.collection('submissions').doc('asg_active_dsa_student_alex').get();
    assert.ok(stored.exists, 'Submission must be stored in submissions collection');
    assert.strictEqual(stored.data().driveFileId, result.submission.driveFileId);
  });

  await runAsyncTest('1.2: Student in mismatched section (Sec A vs Sec C) is rejected with 403 FORBIDDEN_SCOPE', async () => {
    try {
      await googleDriveService.uploadStudentSubmission({
        studentUid: 'student_priya_sec_a',
        studentEmail: 'priya.sharma@sangam.edu',
        assignmentId: 'asg_active_dsa',
        fileBuffer: VALID_PDF_BUFFER,
        originalFileName: 'Priya_Trees.pdf',
        fileSize: VALID_PDF_BUFFER.length
      });
      assert.fail('Should have thrown 403');
    } catch (err) {
      assert.strictEqual(err.statusCode, 403);
      assert.strictEqual(err.code, 'FORBIDDEN_SCOPE');
      assert.ok(err.message.includes('section'));
    }
  });

  await runAsyncTest('1.3: Student in mismatched department (Mechanical vs CSE AI) is rejected with 403 FORBIDDEN_SCOPE', async () => {
    try {
      await googleDriveService.uploadStudentSubmission({
        studentUid: 'student_rahul_me',
        studentEmail: 'rahul.me@sangam.edu',
        assignmentId: 'asg_active_dsa',
        fileBuffer: VALID_PDF_BUFFER,
        originalFileName: 'Rahul_Trees.pdf',
        fileSize: VALID_PDF_BUFFER.length
      });
      assert.fail('Should have thrown 403');
    } catch (err) {
      assert.strictEqual(err.statusCode, 403);
      assert.strictEqual(err.code, 'FORBIDDEN_SCOPE');
      assert.ok(err.message.includes('department'));
    }
  });

  await runAsyncTest('1.4: Canonical department alias matching (Computer Science <-> CSE AI) succeeds', async () => {
    // Temporarily set student department to "Computer Science"
    await mockDb.collection('users').doc('student_alex').set({ department: 'Computer Science' }, { merge: true });

    const result = await googleDriveService.uploadStudentSubmission({
      studentUid: 'student_alex',
      studentEmail: 'alex.carter@sangam.edu',
      assignmentId: 'asg_active_dsa',
      fileBuffer: VALID_PDF_BUFFER,
      originalFileName: 'Alex_CS_Trees.pdf',
      fileSize: VALID_PDF_BUFFER.length
    });

    assert.ok(result.submission, 'Should succeed via canonical department mapping');

    // Restore department
    await mockDb.collection('users').doc('student_alex').set({ department: 'CSE AI' }, { merge: true });
  });

  await runAsyncTest('1.5: Canonical section alias matching (Section C <-> Sec C) succeeds', async () => {
    // Temporarily set student section to "Section C"
    await mockDb.collection('users').doc('student_alex').set({ section: 'Section C' }, { merge: true });

    const result = await googleDriveService.uploadStudentSubmission({
      studentUid: 'student_alex',
      studentEmail: 'alex.carter@sangam.edu',
      assignmentId: 'asg_active_dsa',
      fileBuffer: VALID_PDF_BUFFER,
      originalFileName: 'Alex_SectionC_Trees.pdf',
      fileSize: VALID_PDF_BUFFER.length
    });

    assert.ok(result.submission, 'Should succeed via section alias matching');

    // Restore section
    await mockDb.collection('users').doc('student_alex').set({ section: 'Sec C' }, { merge: true });
  });

  await runAsyncTest('1.6: Non-student role (e.g. teacher_sarah) rejected with 403 FORBIDDEN_ROLE', async () => {
    try {
      await googleDriveService.uploadStudentSubmission({
        studentUid: 'teacher_sarah',
        studentEmail: 's.jenkins@sangam.edu',
        assignmentId: 'asg_active_dsa',
        fileBuffer: VALID_PDF_BUFFER,
        originalFileName: 'Teacher_Submission.pdf',
        fileSize: VALID_PDF_BUFFER.length
      });
      assert.fail('Should have thrown 403');
    } catch (err) {
      assert.strictEqual(err.statusCode, 403);
      assert.strictEqual(err.code, 'FORBIDDEN_ROLE');
    }
  });

  await runAsyncTest('1.7: Inactive / pending student rejected with 403 ACCOUNT_INACTIVE', async () => {
    try {
      await googleDriveService.uploadStudentSubmission({
        studentUid: 'student_pending',
        studentEmail: 'pending@sangam.edu',
        assignmentId: 'asg_active_dsa',
        fileBuffer: VALID_PDF_BUFFER,
        originalFileName: 'Pending_Trees.pdf',
        fileSize: VALID_PDF_BUFFER.length
      });
      assert.fail('Should have thrown 403');
    } catch (err) {
      assert.strictEqual(err.statusCode, 403);
      assert.strictEqual(err.code, 'ACCOUNT_INACTIVE');
    }
  });

  await runAsyncTest('1.8: Non-existent student profile rejected with 403 STUDENT_NOT_FOUND', async () => {
    try {
      await googleDriveService.uploadStudentSubmission({
        studentUid: 'non_existent_student_999',
        studentEmail: 'ghost@sangam.edu',
        assignmentId: 'asg_active_dsa',
        fileBuffer: VALID_PDF_BUFFER,
        originalFileName: 'Ghost.pdf',
        fileSize: VALID_PDF_BUFFER.length
      });
      assert.fail('Should have thrown 403');
    } catch (err) {
      assert.strictEqual(err.statusCode, 403);
      assert.strictEqual(err.code, 'STUDENT_NOT_FOUND');
    }
  });

  console.log('\n--- SECTION 2: Assignment State & Due-Date Enforcement ---');

  await runAsyncTest('2.1: Non-existent assignment ID rejected with 404 ASSIGNMENT_NOT_FOUND', async () => {
    try {
      await googleDriveService.uploadStudentSubmission({
        studentUid: 'student_alex',
        studentEmail: 'alex.carter@sangam.edu',
        assignmentId: 'non_existent_assignment_404',
        fileBuffer: VALID_PDF_BUFFER,
        originalFileName: 'Missing.pdf',
        fileSize: VALID_PDF_BUFFER.length
      });
      assert.fail('Should have thrown 404');
    } catch (err) {
      assert.strictEqual(err.statusCode, 404);
      assert.strictEqual(err.code, 'ASSIGNMENT_NOT_FOUND');
    }
  });

  await runAsyncTest('2.2: Assignment without teacherUid rejected with 500 CORRUPTED_ASSIGNMENT', async () => {
    await mockDb.collection('assignments').doc('asg_corrupted_no_teacher').set({
      id: 'asg_corrupted_no_teacher',
      title: 'Corrupted Assignment',
      department: 'CSE AI',
      year: '2nd Year',
      section: 'Sec C',
      dueDate: '2026-11-20'
      // missing teacherUid
    });

    try {
      await googleDriveService.uploadStudentSubmission({
        studentUid: 'student_alex',
        studentEmail: 'alex.carter@sangam.edu',
        assignmentId: 'asg_corrupted_no_teacher',
        fileBuffer: VALID_PDF_BUFFER,
        originalFileName: 'Corrupt.pdf',
        fileSize: VALID_PDF_BUFFER.length
      });
      assert.fail('Should have thrown 500');
    } catch (err) {
      assert.strictEqual(err.statusCode, 500);
      assert.strictEqual(err.code, 'CORRUPTED_ASSIGNMENT');
    }
  });

  await runAsyncTest('2.3: Submission on past-due assignment rejected with 400 PAST_DUE', async () => {
    try {
      await googleDriveService.uploadStudentSubmission({
        studentUid: 'student_alex',
        studentEmail: 'alex.carter@sangam.edu',
        assignmentId: 'asg_past_due',
        fileBuffer: VALID_PDF_BUFFER,
        originalFileName: 'Late_Submission.pdf',
        fileSize: VALID_PDF_BUFFER.length
      });
      assert.fail('Should have thrown 400 PAST_DUE');
    } catch (err) {
      assert.strictEqual(err.statusCode, 400);
      assert.strictEqual(err.code, 'PAST_DUE');
      assert.ok(err.message.includes('due date'));
    }
  });

  runTest('2.4: isAssignmentPastDue evaluates date-only strings as end-of-day', () => {
    // If today is 2026-10-16 12:00:00
    const nowEpoch = new Date('2026-10-16T12:00:00.000Z').getTime();

    // Due date of same day 2026-10-16 is NOT past due at noon (good until 23:59:59.999)
    assert.strictEqual(isAssignmentPastDue('2026-10-16', nowEpoch), false);

    // Due date of yesterday is past due
    assert.strictEqual(isAssignmentPastDue('2026-10-15', nowEpoch), true);

    // Due date in future is not past due
    assert.strictEqual(isAssignmentPastDue('2026-11-01', nowEpoch), false);
  });

  console.log('\n--- SECTION 3: Teacher Storage & Private Google Drive Upload Pipeline ---');

  await runAsyncTest('3.1: Rejects submission when teacher has disconnected Google Drive with 424 TEACHER_DRIVE_DISCONNECTED', async () => {
    try {
      await googleDriveService.uploadStudentSubmission({
        studentUid: 'student_alex',
        studentEmail: 'alex.carter@sangam.edu',
        assignmentId: 'asg_disconnected_teacher',
        fileBuffer: VALID_PDF_BUFFER,
        originalFileName: 'NN_Answer.pdf',
        fileSize: VALID_PDF_BUFFER.length
      });
      assert.fail('Should have thrown 424');
    } catch (err) {
      assert.strictEqual(err.statusCode, 424);
      assert.strictEqual(err.code, 'TEACHER_DRIVE_DISCONNECTED');
      assert.ok(err.message.includes('Google Drive is not connected'));
    }
  });

  await runAsyncTest('3.2: Handles revoked teacher token with 401', async () => {
    mockDrive.shouldFailAuth = true;
    try {
      await googleDriveService.uploadStudentSubmission({
        studentUid: 'student_alex',
        studentEmail: 'alex.carter@sangam.edu',
        assignmentId: 'asg_active_dsa',
        fileBuffer: VALID_PDF_BUFFER,
        originalFileName: 'Answer_Trees.pdf',
        fileSize: VALID_PDF_BUFFER.length
      });
      assert.fail('Should have thrown 401 on revoked auth');
    } catch (err) {
      assert.strictEqual(err.statusCode, 401);
    } finally {
      mockDrive.shouldFailAuth = false;
    }
  });

  await runAsyncTest('3.3: Destination teacher and coursework folder are derived strictly from trusted assignment record', async () => {
    const result = await googleDriveService.uploadStudentSubmission({
      studentUid: 'student_alex',
      studentEmail: 'alex.carter@sangam.edu',
      assignmentId: 'asg_active_dsa',
      fileBuffer: VALID_PDF_BUFFER,
      originalFileName: 'Alex_Solution.pdf',
      fileSize: VALID_PDF_BUFFER.length
    });

    assert.strictEqual(result.submission.teacherUid, 'teacher_sarah', 'Must match trusted assignment teacherUid');

    // Verify uploaded file in mock drive is placed in teacher_sarah's coursework folder
    const uploadedFile = mockDrive.files.get(result.submission.driveFileId);
    assert.ok(uploadedFile, 'File must exist in Drive');
    assert.strictEqual(uploadedFile.folderId, 'folder_sarah_coursework_101', 'Must be inside teacher folder');
  });

  console.log('\n--- SECTION 4: Idempotency, Concurrency & Failure Recovery ---');

  await runAsyncTest('4.1: Retrying with identical idempotency key returns cached submission without duplicate Drive upload', async () => {
    const key = `key_idem_${Date.now()}`;
    const initialFilesCount = mockDrive.files.size;

    const res1 = await googleDriveService.uploadStudentSubmission({
      studentUid: 'student_alex',
      studentEmail: 'alex.carter@sangam.edu',
      assignmentId: 'asg_active_dsa',
      fileBuffer: VALID_PDF_BUFFER,
      originalFileName: 'Alex_Trees_Idem.pdf',
      fileSize: VALID_PDF_BUFFER.length,
      idempotencyKey: key
    });
    assert.strictEqual(res1.isReplay, false);
    const filesAfterFirst = mockDrive.files.size;
    assert.strictEqual(filesAfterFirst, initialFilesCount + 1);

    // Second call with same key
    const res2 = await googleDriveService.uploadStudentSubmission({
      studentUid: 'student_alex',
      studentEmail: 'alex.carter@sangam.edu',
      assignmentId: 'asg_active_dsa',
      fileBuffer: VALID_PDF_BUFFER,
      originalFileName: 'Alex_Trees_Idem.pdf',
      fileSize: VALID_PDF_BUFFER.length,
      idempotencyKey: key
    });
    assert.strictEqual(res2.isReplay, true);
    assert.strictEqual(res2.submission.driveFileId, res1.submission.driveFileId);
    assert.strictEqual(mockDrive.files.size, filesAfterFirst, 'No additional file should be uploaded to Drive');
  });

  await runAsyncTest('4.2: Concurrent active lock returns 409 SUBMISSION_IN_PROGRESS', async () => {
    const key = `key_lock_${Date.now()}`;
    const idempotencyDocId = `student_alex_asg_active_dsa_${key}`;

    // Simulate active in-flight lock
    await mockDb.collection('submission_idempotency').doc(idempotencyDocId).set({
      studentUid: 'student_alex',
      assignmentId: 'asg_active_dsa',
      status: 'in_progress',
      lockedUntil: Date.now() + 15000
    });

    try {
      await googleDriveService.uploadStudentSubmission({
        studentUid: 'student_alex',
        studentEmail: 'alex.carter@sangam.edu',
        assignmentId: 'asg_active_dsa',
        fileBuffer: VALID_PDF_BUFFER,
        originalFileName: 'Alex_Lock.pdf',
        fileSize: VALID_PDF_BUFFER.length,
        idempotencyKey: key
      });
      assert.fail('Should have thrown 409');
    } catch (err) {
      assert.strictEqual(err.statusCode, 409);
      assert.strictEqual(err.code, 'SUBMISSION_IN_PROGRESS');
    }
  });

  await runAsyncTest('4.3: Crash recovery: Reuses existing driveFileId if Drive upload succeeded but DB write failed', async () => {
    const key = `key_recover_${Date.now()}`;
    const idempotencyDocId = `student_alex_asg_active_dsa_${key}`;
    const preExistingFileId = 'pre_uploaded_drive_file_999';

    // Simulate state where Drive upload recorded driveFileId in idempotency record, but status is not completed
    await mockDb.collection('submission_idempotency').doc(idempotencyDocId).set({
      studentUid: 'student_alex',
      assignmentId: 'asg_active_dsa',
      status: 'in_progress',
      driveFileId: preExistingFileId,
      driveFileName: 'Submission_Alex_PreUploaded.pdf',
      lockedUntil: Date.now() - 1000 // lock expired
    });

    const initialFilesCount = mockDrive.files.size;

    const res = await googleDriveService.uploadStudentSubmission({
      studentUid: 'student_alex',
      studentEmail: 'alex.carter@sangam.edu',
      assignmentId: 'asg_active_dsa',
      fileBuffer: VALID_PDF_BUFFER,
      originalFileName: 'Alex_Recover.pdf',
      fileSize: VALID_PDF_BUFFER.length,
      idempotencyKey: key
    });

    assert.strictEqual(res.submission.driveFileId, preExistingFileId, 'Must reuse pre-uploaded driveFileId');
    assert.strictEqual(mockDrive.files.size, initialFilesCount, 'Did not make duplicate Drive upload');
  });

  await runAsyncTest('4.4: Repeated submission policy: Subsequent submission for same student replaces active record in Firestore', async () => {
    const firstSubmission = await googleDriveService.uploadStudentSubmission({
      studentUid: 'student_alex',
      studentEmail: 'alex.carter@sangam.edu',
      assignmentId: 'asg_active_dsa',
      fileBuffer: VALID_PDF_BUFFER,
      originalFileName: 'Alex_Attempt_1.pdf',
      fileSize: VALID_PDF_BUFFER.length
    });

    const secondPdfBuffer = Buffer.from('%PDF-1.5 Alex Attempt 2 with improved algorithm implementation');
    const secondSubmission = await googleDriveService.uploadStudentSubmission({
      studentUid: 'student_alex',
      studentEmail: 'alex.carter@sangam.edu',
      assignmentId: 'asg_active_dsa',
      fileBuffer: secondPdfBuffer,
      originalFileName: 'Alex_Attempt_2.pdf',
      fileSize: secondPdfBuffer.length
    });

    assert.notStrictEqual(secondSubmission.submission.driveFileId, firstSubmission.submission.driveFileId);

    // Check that Firestore contains only the updated record for student_alex on asg_active_dsa
    const current = await mockDb.collection('submissions').doc('asg_active_dsa_student_alex').get();
    assert.strictEqual(current.data().driveFileId, secondSubmission.submission.driveFileId);
  });

  console.log('\n--- SECTION 5: HTTP Endpoint, File Validation & Cleanup ---');

  await runAsyncTest('5.1: handleUploadSubmission rejects missing file with 400 MISSING_FILE', async () => {
    const req = {
      userId: 'student_alex',
      userEmail: 'alex.carter@sangam.edu',
      file: null,
      body: { assignmentId: 'asg_active_dsa' }
    };
    let capturedStatus = 0;
    let capturedBody = null;
    const res = {
      status: (s) => { capturedStatus = s; return res; },
      json: (b) => { capturedBody = b; return res; },
      setHeader: () => {}
    };

    await handleUploadSubmission(req, res);
    assert.strictEqual(capturedStatus, 400);
    assert.strictEqual(capturedBody.code, 'MISSING_FILE');
  });

  await runAsyncTest('5.2: handleUploadSubmission rejects 0-byte file with 400 EMPTY_FILE and cleans up temp file', async () => {
    const tempFile = path.resolve('uploads/submissions/test_empty.pdf');
    fs.writeFileSync(tempFile, Buffer.alloc(0));

    const req = {
      userId: 'student_alex',
      userEmail: 'alex.carter@sangam.edu',
      file: { path: tempFile, size: 0, mimetype: 'application/pdf', originalname: 'empty.pdf' },
      body: { assignmentId: 'asg_active_dsa' }
    };
    let capturedStatus = 0;
    let capturedBody = null;
    const res = {
      status: (s) => { capturedStatus = s; return res; },
      json: (b) => { capturedBody = b; return res; },
      setHeader: () => {}
    };

    await handleUploadSubmission(req, res);
    assert.strictEqual(capturedStatus, 400);
    assert.strictEqual(capturedBody.code, 'EMPTY_FILE');
    assert.strictEqual(fs.existsSync(tempFile), false, 'Temporary empty file must be cleaned up');
  });

  await runAsyncTest('5.3: handleUploadSubmission rejects non-PDF MIME type with 400 INVALID_MIME_TYPE', async () => {
    const tempFile = path.resolve('uploads/submissions/test_mimetype.txt');
    fs.writeFileSync(tempFile, Buffer.from('hello world'));

    const req = {
      userId: 'student_alex',
      userEmail: 'alex.carter@sangam.edu',
      file: { path: tempFile, size: 11, mimetype: 'text/plain', originalname: 'file.txt' },
      body: { assignmentId: 'asg_active_dsa' }
    };
    let capturedStatus = 0;
    let capturedBody = null;
    const res = {
      status: (s) => { capturedStatus = s; return res; },
      json: (b) => { capturedBody = b; return res; },
      setHeader: () => {}
    };

    await handleUploadSubmission(req, res);
    assert.strictEqual(capturedStatus, 400);
    assert.strictEqual(capturedBody.code, 'INVALID_MIME_TYPE');
    assert.strictEqual(fs.existsSync(tempFile), false, 'Temporary file must be cleaned up');
  });

  await runAsyncTest('5.4: handleUploadSubmission rejects non-PDF file extension with 400 INVALID_FILE_EXTENSION', async () => {
    const tempFile = path.resolve('uploads/submissions/test_ext.docx');
    fs.writeFileSync(tempFile, Buffer.from('%PDF-fake docx'));

    const req = {
      userId: 'student_alex',
      userEmail: 'alex.carter@sangam.edu',
      file: { path: tempFile, size: 14, mimetype: 'application/pdf', originalname: 'document.docx' },
      body: { assignmentId: 'asg_active_dsa' }
    };
    let capturedStatus = 0;
    let capturedBody = null;
    const res = {
      status: (s) => { capturedStatus = s; return res; },
      json: (b) => { capturedBody = b; return res; },
      setHeader: () => {}
    };

    await handleUploadSubmission(req, res);
    assert.strictEqual(capturedStatus, 400);
    assert.strictEqual(capturedBody.code, 'INVALID_FILE_EXTENSION');
    assert.strictEqual(fs.existsSync(tempFile), false, 'Temporary file must be cleaned up');
  });

  await runAsyncTest('5.5: handleUploadSubmission rejects fake PDF without %PDF- magic bytes with 400 INVALID_PDF_SIGNATURE', async () => {
    const tempFile = path.resolve('uploads/submissions/test_fake.pdf');
    fs.writeFileSync(tempFile, Buffer.from('NOT A PDF FILE AT ALL'));

    const req = {
      userId: 'student_alex',
      userEmail: 'alex.carter@sangam.edu',
      file: { path: tempFile, size: 21, mimetype: 'application/pdf', originalname: 'fake.pdf' },
      body: { assignmentId: 'asg_active_dsa' }
    };
    let capturedStatus = 0;
    let capturedBody = null;
    const res = {
      status: (s) => { capturedStatus = s; return res; },
      json: (b) => { capturedBody = b; return res; },
      setHeader: () => {}
    };

    await handleUploadSubmission(req, res);
    assert.strictEqual(capturedStatus, 400);
    assert.strictEqual(capturedBody.code, 'INVALID_PDF_SIGNATURE');
    assert.strictEqual(fs.existsSync(tempFile), false, 'Temporary file must be cleaned up');
  });

  await runAsyncTest('5.6: handleUploadSubmission rejects missing assignmentId with 400 MISSING_ASSIGNMENT_ID', async () => {
    const tempFile = path.resolve('uploads/submissions/test_no_asg.pdf');
    fs.writeFileSync(tempFile, VALID_PDF_BUFFER);

    const req = {
      userId: 'student_alex',
      userEmail: 'alex.carter@sangam.edu',
      file: { path: tempFile, size: VALID_PDF_BUFFER.length, mimetype: 'application/pdf', originalname: 'no_asg.pdf' },
      body: {}
    };
    let capturedStatus = 0;
    let capturedBody = null;
    const res = {
      status: (s) => { capturedStatus = s; return res; },
      json: (b) => { capturedBody = b; return res; },
      setHeader: () => {}
    };

    await handleUploadSubmission(req, res);
    assert.strictEqual(capturedStatus, 400);
    assert.strictEqual(capturedBody.code, 'MISSING_ASSIGNMENT_ID');
    assert.strictEqual(fs.existsSync(tempFile), false, 'Temporary file must be cleaned up');
  });

  await runAsyncTest('5.7: handleUploadSubmission successfully processes valid PDF upload and cleans up temp file', async () => {
    const tempFile = path.resolve('uploads/submissions/test_valid.pdf');
    fs.writeFileSync(tempFile, VALID_PDF_BUFFER);

    const req = {
      userId: 'student_alex',
      userEmail: 'alex.carter@sangam.edu',
      file: { path: tempFile, size: VALID_PDF_BUFFER.length, mimetype: 'application/pdf', originalname: 'valid.pdf' },
      body: { assignmentId: 'asg_active_dsa' },
      headers: {}
    };
    let capturedStatus = 0;
    let capturedBody = null;
    const res = {
      status: (s) => { capturedStatus = s; return res; },
      json: (b) => { capturedBody = b; return res; },
      setHeader: () => {}
    };

    await handleUploadSubmission(req, res);
    assert.strictEqual(capturedStatus, 201);
    assert.strictEqual(capturedBody.success, true);
    assert.ok(capturedBody.submission);
    assert.strictEqual(fs.existsSync(tempFile), false, 'Temporary file must be unlinked on success');
  });

  console.log('\n--- SECTION 6: Cross-Student Data Isolation & Submission History ---');

  await runAsyncTest('6.1: getStudentSubmissions returns only the authenticated student submissions', async () => {
    // Seed a submission for student_alex and a submission for student_priya_sec_a
    mockDb.store.set('submissions/asg_active_dsa_student_alex', {
      data: {
        id: 'asg_active_dsa_student_alex',
        assignmentId: 'asg_active_dsa',
        studentUid: 'student_alex',
        studentName: 'Alex Carter',
        studentEmail: 'alex.carter@sangam.edu',
        storageProvider: 'google_drive',
        driveFileId: 'drive_alex_001',
        submittedAt: '2026-10-16T12:00:00Z'
      },
      version: 1
    });

    mockDb.store.set('submissions/asg_active_dsa_student_priya_sec_a', {
      data: {
        id: 'asg_active_dsa_student_priya_sec_a',
        assignmentId: 'asg_active_dsa',
        studentUid: 'student_priya_sec_a',
        studentName: 'Priya Sharma',
        studentEmail: 'priya.sharma@sangam.edu',
        storageProvider: 'google_drive',
        driveFileId: 'drive_priya_002',
        submittedAt: '2026-10-16T12:05:00Z'
      },
      version: 1
    });

    const alexSubmissions = await googleDriveService.getStudentSubmissions('student_alex');
    assert.strictEqual(alexSubmissions.length, 1);
    assert.strictEqual(alexSubmissions[0].studentUid, 'student_alex');
    assert.strictEqual(alexSubmissions[0].driveFileId, 'drive_alex_001');

    const priyaSubmissions = await googleDriveService.getStudentSubmissions('student_priya_sec_a');
    assert.strictEqual(priyaSubmissions.length, 1);
    assert.strictEqual(priyaSubmissions[0].studentUid, 'student_priya_sec_a');
    assert.strictEqual(priyaSubmissions[0].driveFileId, 'drive_priya_002');
  });

  await runAsyncTest('6.2: handleGetStudentSubmissions HTTP handler returns only caller submissions', async () => {
    const req = { userId: 'student_alex' };
    let capturedStatus = 0;
    let capturedBody = null;
    const res = {
      status: (s) => { capturedStatus = s; return res; },
      json: (b) => { capturedBody = b; return res; }
    };

    await handleGetStudentSubmissions(req, res);
    assert.strictEqual(capturedBody.success, true);
    assert.ok(Array.isArray(capturedBody.submissions));
    assert.ok(capturedBody.submissions.every(s => s.studentUid === 'student_alex'), 'Cross-student isolation violated if Priya is returned');
  });

  await runAsyncTest('6.3: Submission metadata response strictly excludes credentials, tokens, and encryption fields', async () => {
    const alexSubmissions = await googleDriveService.getStudentSubmissions('student_alex');
    assert.ok(alexSubmissions.length > 0);
    const sub = alexSubmissions[0];
    assert.strictEqual(sub.encryptedAccessToken, undefined);
    assert.strictEqual(sub.accessTokenIv, undefined);
    assert.strictEqual(sub.encryptedRefreshToken, undefined);
    assert.strictEqual(sub.rootFolderId, undefined);
  });

  console.log('\n--- SECTION 7: Frontend Service Validation & Regressions ---');

  await runAsyncTest('7.1: submitStudentAssignment rejects missing file with MISSING_FILE', async () => {
    try {
      await submitStudentAssignment({ file: null, assignmentId: 'asg_active_dsa' });
      assert.fail('Should have thrown MISSING_FILE');
    } catch (err) {
      assert.strictEqual(err.code, 'MISSING_FILE');
    }
  });

  await runAsyncTest('7.2: submitStudentAssignment rejects non-PDF file with INVALID_MIME_TYPE', async () => {
    const fakeFile = new Blob(['hello'], { type: 'text/plain' });
    fakeFile.name = 'notes.txt';
    try {
      await submitStudentAssignment({ file: fakeFile, assignmentId: 'asg_active_dsa' });
      assert.fail('Should have thrown INVALID_MIME_TYPE');
    } catch (err) {
      assert.strictEqual(err.code, 'INVALID_MIME_TYPE');
    }
  });

  await runAsyncTest('7.3: submitStudentAssignment rejects empty file with EMPTY_FILE', async () => {
    const emptyFile = new Blob([], { type: 'application/pdf' });
    emptyFile.name = 'empty.pdf';
    try {
      await submitStudentAssignment({ file: emptyFile, assignmentId: 'asg_active_dsa' });
      assert.fail('Should have thrown EMPTY_FILE');
    } catch (err) {
      assert.strictEqual(err.code, 'EMPTY_FILE');
    }
  });

  await runAsyncTest('7.4: submitStudentAssignment rejects missing assignmentId with VALIDATION_FAILED', async () => {
    const validBlob = new Blob(['%PDF-1.5 test'], { type: 'application/pdf' });
    validBlob.name = 'solution.pdf';
    try {
      await submitStudentAssignment({ file: validBlob, assignmentId: '' });
      assert.fail('Should have thrown VALIDATION_FAILED');
    } catch (err) {
      assert.strictEqual(err.code, 'VALIDATION_FAILED');
    }
  });

  await runAsyncTest('7.5: [REGRESSION] GET /api/health returns healthy', async () => {
    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;

    try {
      const res = await fetch(`http://localhost:${port}/api/health`);
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.status, 'healthy');
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  await runAsyncTest('7.6: [REGRESSION] POST /api/submissions/upload rejects unauthenticated requests with 401', async () => {
    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;

    try {
      const res = await fetch(`http://localhost:${port}/api/submissions/upload`, {
        method: 'POST'
      });
      assert.strictEqual(res.status, 401, 'Endpoint must require Firebase authentication');
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  console.log('\n======================================================');
  console.log(` RESULTS: ${passed} passed, ${failed} failed`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runAllTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
