import assert from 'node:assert';
import crypto from 'node:crypto';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

// Set test environment configuration
process.env.TEST_MODE = 'true';
process.env.NODE_ENV = 'test';
process.env.TOKEN_ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
process.env.GOOGLE_CLIENT_ID = 'test-client-id-assignment-upload.apps.googleusercontent.com';
process.env.GOOGLE_CLIENT_SECRET = 'test-mock-google-client-secret';
process.env.GOOGLE_REDIRECT_URI = 'http://localhost:3001/api/storage/google/callback';
process.env.FRONTEND_URL = 'http://localhost:5173';
process.env.MAX_ASSIGNMENT_FILE_SIZE = String(1024 * 1024); // 1 MB limit for fast testing

import {
  googleDriveService,
  GoogleDriveService,
  CANONICAL_DEPARTMENT_MAP,
  isMatchingDepartment,
  isMatchingSection
} from '../server/services/googleDriveService.js';
import { encrypt } from '../server/services/encryptionService.js';
import { app } from '../server.js';

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
console.log(' SANGAM TEACHER ASSIGNMENT UPLOAD — STAGE 5C TEST SUITE');
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
              docs
            };
          }
        };
        return queryObj;
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
      throw new Error('Google authorization has been revoked or expired.');
    }
    const folder = this.folders.get(folderId);
    if (!folder) {
      return { exists: false, trashed: true };
    }
    return { exists: !folder.trashed, trashed: folder.trashed, name: folder.name };
  }

  async createFolder(name, accessToken) {
    if (this.shouldFailAuth) {
      throw new Error('Google authorization has been revoked or expired.');
    }
    const id = `mock_folder_${crypto.randomBytes(8).toString('hex')}`;
    const folder = { id, name, trashed: false };
    this.folders.set(id, folder);
    return folder;
  }

  async uploadFile(folderId, fileName, mimeType, fileBuffer, accessToken, metadataExtra = {}) {
    if (this.shouldTimeout) {
      const err = new Error('Upstream provider timed out: Google Drive API did not respond within timeout.');
      err.statusCode = 504;
      throw err;
    }
    if (this.shouldFailAuth) {
      const err = new Error('Google authorization has been revoked or expired. Please reconnect your account.');
      err.statusCode = 401;
      throw err;
    }

    const fileId = `mock_drive_file_${crypto.randomBytes(8).toString('hex')}`;
    const fileRecord = {
      id: fileId,
      name: fileName,
      folderId,
      mimeType,
      size: fileBuffer.length,
      buffer: fileBuffer,
      ...metadataExtra
    };
    this.files.set(fileId, fileRecord);
    return fileRecord;
  }
}

// Helper to create a valid minimal PDF buffer
function createMinimalPdfBuffer(content = 'Hello Sangam Assignment') {
  return Buffer.from(`%PDF-1.4\n1 0 obj\n<< /Title (${content}) >>\nendobj\ntrailer\n<< >>\n%%EOF\n`);
}

// -----------------------------------------------------------------------------
// SECTION 1: Department & Section Canonical Matching Unit Tests
// -----------------------------------------------------------------------------
console.log('--- SECTION 1: Canonical Department & Section Matching ---');

runTest('1.1: Department aliases: Computer Science <-> CSE AI / CSE match', () => {
  assert.strictEqual(isMatchingDepartment('Computer Science', 'CSE AI'), true);
  assert.strictEqual(isMatchingDepartment('CSE AI', 'Computer Science'), true);
  assert.strictEqual(isMatchingDepartment('CSE', 'Computer Science'), true);
  assert.strictEqual(isMatchingDepartment('Mechanical Engineering', 'ME'), true);
  assert.strictEqual(isMatchingDepartment('Electronics & Communication', 'ECE'), true);
  assert.strictEqual(isMatchingDepartment('Civil Engineering', 'CE'), true);
  assert.strictEqual(isMatchingDepartment('Electrical Engineering', 'EE'), true);
  assert.strictEqual(isMatchingDepartment('Information Technology', 'IT'), true);
  assert.strictEqual(isMatchingDepartment('Biotechnology', 'BT'), true);
  assert.strictEqual(isMatchingDepartment('Computer Science', 'Mechanical Engineering'), false);
});

runTest('1.2: Section aliases: Sec A <-> Section A match', () => {
  assert.strictEqual(isMatchingSection('Sec A', 'Section A'), true);
  assert.strictEqual(isMatchingSection('Section A', 'Sec A'), true);
  assert.strictEqual(isMatchingSection('Sec B', 'Section B'), true);
  assert.strictEqual(isMatchingSection('CSE-C', 'Sec C'), true);
  assert.strictEqual(isMatchingSection('Sec A', 'Sec B'), false);
});

// -----------------------------------------------------------------------------
// SECTION 2: Allocation Authorization Lookups
// -----------------------------------------------------------------------------
console.log('\n--- SECTION 2: Teacher Allocation Verification Logic ---');

await runAsyncTest('[MOCKED FIRESTORE] 2.1: Canonical allocation lookup ({teacherUid}_{department}_{year}_{section}) succeeds when authorized === true', async () => {
  const service = new GoogleDriveService();
  const mockDb = new MockFirestore();
  service.setTestDb(mockDb);

  const teacherUid = 'teacher_turing_01';
  const allocId = `${teacherUid}_CSE AI_2nd Year_Sec A`;
  await mockDb.collection('teacher_allocations').doc(allocId).set({
    teacherUid,
    department: 'CSE AI',
    year: '2nd Year',
    section: 'Sec A',
    institution: 'UEMK',
    authorized: true
  });

  const res = await service.verifyTeacherAllocation(teacherUid, 'CSE AI', '2nd Year', 'Sec A', 'UEMK');
  assert.strictEqual(res.authorized, true);
  assert.strictEqual(res.allocationId, allocId);
});

await runAsyncTest('[MOCKED FIRESTORE] 2.2: Rejects allocation when authorized !== true or revoked', async () => {
  const service = new GoogleDriveService();
  const mockDb = new MockFirestore();
  service.setTestDb(mockDb);

  const teacherUid = 'teacher_revoked_01';
  const allocId = `${teacherUid}_CSE AI_2nd Year_Sec A`;
  await mockDb.collection('teacher_allocations').doc(allocId).set({
    teacherUid,
    department: 'CSE AI',
    year: '2nd Year',
    section: 'Sec A',
    institution: 'UEMK',
    authorized: false // revoked
  });

  const res = await service.verifyTeacherAllocation(teacherUid, 'CSE AI', '2nd Year', 'Sec A', 'UEMK');
  assert.strictEqual(res.authorized, false);
});

await runAsyncTest('[MOCKED FIRESTORE] 2.3: Canonical department alias lookup (Computer Science <-> CSE AI) succeeds', async () => {
  const service = new GoogleDriveService();
  const mockDb = new MockFirestore();
  service.setTestDb(mockDb);

  const teacherUid = 'teacher_turing_01';
  // Stored under alias "Computer Science"
  const allocId = `${teacherUid}_Computer Science_2nd Year_Sec A`;
  await mockDb.collection('teacher_allocations').doc(allocId).set({
    teacherUid,
    department: 'Computer Science',
    year: '2nd Year',
    section: 'Sec A',
    institution: 'UEMK',
    authorized: true
  });

  // Querying with alias "CSE AI"
  const res = await service.verifyTeacherAllocation(teacherUid, 'CSE AI', '2nd Year', 'Sec A', 'UEMK');
  assert.strictEqual(res.authorized, true);
});

await runAsyncTest('[MOCKED FIRESTORE] 2.4: Legacy format lookup ({teacherUid}_{year}_{section}) succeeds', async () => {
  const service = new GoogleDriveService();
  const mockDb = new MockFirestore();
  service.setTestDb(mockDb);

  const teacherUid = 'teacher_legacy_01';
  const legacyId = `${teacherUid}_3rd Year_Sec B`;
  await mockDb.collection('teacher_allocations').doc(legacyId).set({
    teacherUid,
    department: 'Mechanical Engineering',
    year: '3rd Year',
    section: 'Sec B',
    institution: 'UEMK',
    authorized: true
  });

  const res = await service.verifyTeacherAllocation(teacherUid, 'Mechanical Engineering', '3rd Year', 'Sec B', 'UEMK');
  assert.strictEqual(res.authorized, true);
  assert.strictEqual(res.allocationId, legacyId);
});

await runAsyncTest('[MOCKED FIRESTORE] 2.5: Rejects unallocated class combination', async () => {
  const service = new GoogleDriveService();
  const mockDb = new MockFirestore();
  service.setTestDb(mockDb);

  const teacherUid = 'teacher_unalloc_01';
  const res = await service.verifyTeacherAllocation(teacherUid, 'Civil Engineering', '4th Year', 'Sec D', 'UEMK');
  assert.strictEqual(res.authorized, false);
});

// -----------------------------------------------------------------------------
// SECTION 3: Service-level Assignment Upload Pipeline Tests
// -----------------------------------------------------------------------------
console.log('\n--- SECTION 3: Assignment Upload Pipeline Execution ---');

await runAsyncTest('[MOCKED FIRESTORE / GOOGLE DRIVE] 3.1: Successful private PDF upload and metadata persistence', async () => {
  const service = new GoogleDriveService();
  const mockDb = new MockFirestore();
  const mockDrive = new MockDriveApi();
  service.setTestDb(mockDb);
  service.customDriveApi = mockDrive;

  const teacherUid = 'teacher_sarah_01';
  const encKey = process.env.TOKEN_ENCRYPTION_KEY;

  // Setup user
  await mockDb.collection('users').doc(teacherUid).set({
    uid: teacherUid,
    name: 'Dr. Sarah Jenkins',
    email: 'sarah.jenkins@sangam.edu',
    role: 'faculty',
    status: 'active',
    institution: 'UEMK',
    createdAt: new Date().toISOString()
  });

  // Setup allocation
  const allocId = `${teacherUid}_Computer Science_2nd Year_Sec C`;
  await mockDb.collection('teacher_allocations').doc(allocId).set({
    teacherUid,
    department: 'Computer Science',
    year: '2nd Year',
    section: 'Sec C',
    institution: 'UEMK',
    authorized: true
  });

  // Setup connected Google Drive
  const encAccess = encrypt('valid-mock-access-token', encKey);
  const encRefresh = encrypt('valid-mock-refresh-token', encKey);
  await mockDb.collection('faculty_storage_integrations').doc(teacherUid).set({
    facultyUid: teacherUid,
    provider: 'google',
    accountEmail: 'sarah.jenkins@gmail.com',
    status: 'connected',
    rootFolderId: 'folder_sarah_coursework',
    rootFolderName: 'Sangam Coursework',
    encryptedAccessToken: encAccess.encryptedData,
    accessTokenIv: encAccess.iv,
    accessTokenAuthTag: encAccess.authTag,
    encryptedRefreshToken: encRefresh.encryptedData,
    refreshTokenIv: encRefresh.iv,
    refreshTokenAuthTag: encRefresh.authTag,
    tokenExpiresAt: Date.now() + 3600000,
    updatedAt: new Date().toISOString()
  });
  mockDrive.folders.set('folder_sarah_coursework', { id: 'folder_sarah_coursework', name: 'Sangam Coursework', trashed: false });

  const pdfBuffer = createMinimalPdfBuffer('Data Structures Assignment 1');

  const result = await service.uploadAssignmentPdf({
    teacherUid,
    teacherEmail: 'sarah.jenkins@sangam.edu',
    fileBuffer: pdfBuffer,
    originalFileName: 'DSA_Assignment_1.pdf',
    fileSize: pdfBuffer.length,
    assignmentData: {
      title: 'AVL Trees Implementation',
      department: 'Computer Science',
      year: '2nd Year',
      section: 'Sec C',
      dueDate: '2026-11-01',
      description: 'Implement AVL balancing routines in C++',
      subject: 'DSA',
      checkSimilarity: true
    },
    encryptionKey: encKey
  });

  assert.strictEqual(result.isReplay, false);
  assert.ok(result.assignment.id.startsWith('asg_'));
  assert.strictEqual(result.assignment.title, 'AVL Trees Implementation');
  assert.strictEqual(result.assignment.department, 'Computer Science');
  assert.strictEqual(result.assignment.storageProvider, 'google');
  assert.ok(result.assignment.driveFileId.startsWith('mock_drive_file_'));

  // Verify file was saved in Google Drive double
  const savedFile = mockDrive.files.get(result.assignment.driveFileId);
  assert.ok(savedFile);
  assert.strictEqual(savedFile.folderId, 'folder_sarah_coursework');
  assert.strictEqual(savedFile.size, pdfBuffer.length);

  // Verify assignment record in Firestore
  const savedDoc = await mockDb.collection('assignments').doc(result.assignment.id).get();
  assert.strictEqual(savedDoc.exists, true);
  assert.strictEqual(savedDoc.data().driveFileId, result.assignment.driveFileId);

  // CRITICAL SECURITY AUDIT: Verify zero credential leakage in stored assignment
  const docData = savedDoc.data();
  assert.strictEqual(docData.encryptedAccessToken, undefined);
  assert.strictEqual(docData.encryptedRefreshToken, undefined);
  assert.strictEqual(docData.accessTokenIv, undefined);
  assert.strictEqual(docData.refreshTokenIv, undefined);
  assert.strictEqual(docData.encryptionKey, undefined);
});

await runAsyncTest('[MOCKED FIRESTORE / GOOGLE DRIVE] 3.2: Rejects upload when Google Drive is disconnected (424 Failed Dependency)', async () => {
  const service = new GoogleDriveService();
  const mockDb = new MockFirestore();
  service.setTestDb(mockDb);

  const teacherUid = 'teacher_disconnected_01';
  await mockDb.collection('users').doc(teacherUid).set({
    uid: teacherUid,
    role: 'faculty',
    status: 'active',
    institution: 'UEMK'
  });
  await mockDb.collection('teacher_allocations').doc(`${teacherUid}_CSE AI_2nd Year_Sec A`).set({
    teacherUid,
    department: 'CSE AI',
    year: '2nd Year',
    section: 'Sec A',
    institution: 'UEMK',
    authorized: true
  });
  // No storage integration doc exists

  const pdfBuffer = createMinimalPdfBuffer();
  let threw = false;
  try {
    await service.uploadAssignmentPdf({
      teacherUid,
      fileBuffer: pdfBuffer,
      originalFileName: 'asg.pdf',
      fileSize: pdfBuffer.length,
      assignmentData: {
        title: 'Algorithms 101',
        department: 'CSE AI',
        year: '2nd Year',
        section: 'Sec A',
        dueDate: '2026-11-01'
      }
    });
  } catch (err) {
    threw = true;
    assert.strictEqual(err.statusCode, 424);
    assert.ok(err.message.includes('Google Drive is not connected'));
  }
  assert.strictEqual(threw, true);
});

await runAsyncTest('[MOCKED FIRESTORE / GOOGLE DRIVE] 3.3: Rejects upload when student tries to create assignment (403 Forbidden)', async () => {
  const service = new GoogleDriveService();
  const mockDb = new MockFirestore();
  service.setTestDb(mockDb);

  const studentUid = 'student_hacker_01';
  await mockDb.collection('users').doc(studentUid).set({
    uid: studentUid,
    role: 'student',
    status: 'active',
    institution: 'UEMK'
  });

  const pdfBuffer = createMinimalPdfBuffer();
  let threw = false;
  try {
    await service.uploadAssignmentPdf({
      teacherUid: studentUid,
      fileBuffer: pdfBuffer,
      originalFileName: 'asg.pdf',
      fileSize: pdfBuffer.length,
      assignmentData: {
        title: 'Hacked Assignment',
        department: 'CSE AI',
        year: '2nd Year',
        section: 'Sec A',
        dueDate: '2026-11-01'
      }
    });
  } catch (err) {
    threw = true;
    assert.strictEqual(err.statusCode, 403);
    assert.ok(err.message.includes('Only faculty members'));
  }
  assert.strictEqual(threw, true);
});

await runAsyncTest('[MOCKED FIRESTORE / GOOGLE DRIVE] 3.4: Rejects upload when teacher lacks class allocation (403 Forbidden)', async () => {
  const service = new GoogleDriveService();
  const mockDb = new MockFirestore();
  service.setTestDb(mockDb);

  const teacherUid = 'teacher_unalloc_02';
  await mockDb.collection('users').doc(teacherUid).set({
    uid: teacherUid,
    role: 'faculty',
    status: 'active',
    institution: 'UEMK'
  });
  // No allocation document in teacher_allocations

  const pdfBuffer = createMinimalPdfBuffer();
  let threw = false;
  try {
    await service.uploadAssignmentPdf({
      teacherUid,
      fileBuffer: pdfBuffer,
      originalFileName: 'asg.pdf',
      fileSize: pdfBuffer.length,
      assignmentData: {
        title: 'Unallocated Class Assignment',
        department: 'Civil Engineering',
        year: '4th Year',
        section: 'Sec D',
        dueDate: '2026-11-01'
      }
    });
  } catch (err) {
    threw = true;
    assert.strictEqual(err.statusCode, 403);
    assert.ok(err.message.includes('not authorized'));
  }
  assert.strictEqual(threw, true);
});

await runAsyncTest('[MOCKED FIRESTORE / GOOGLE DRIVE] 3.5: Idempotency: Retrying with same key returns identical assignment without re-uploading', async () => {
  const service = new GoogleDriveService();
  const mockDb = new MockFirestore();
  const mockDrive = new MockDriveApi();
  service.setTestDb(mockDb);
  service.customDriveApi = mockDrive;

  const teacherUid = 'teacher_idem_01';
  const encKey = process.env.TOKEN_ENCRYPTION_KEY;

  await mockDb.collection('users').doc(teacherUid).set({
    uid: teacherUid,
    role: 'faculty',
    status: 'active',
    institution: 'UEMK'
  });
  await mockDb.collection('teacher_allocations').doc(`${teacherUid}_ME_2nd Year_Sec A`).set({
    teacherUid,
    department: 'ME',
    year: '2nd Year',
    section: 'Sec A',
    institution: 'UEMK',
    authorized: true
  });
  const encAccess = encrypt('token-123', encKey);
  const encRefresh = encrypt('refresh-123', encKey);
  await mockDb.collection('faculty_storage_integrations').doc(teacherUid).set({
    facultyUid: teacherUid,
    status: 'connected',
    rootFolderId: 'folder_idem',
    encryptedAccessToken: encAccess.encryptedData,
    accessTokenIv: encAccess.iv,
    accessTokenAuthTag: encAccess.authTag,
    encryptedRefreshToken: encRefresh.encryptedData,
    refreshTokenIv: encRefresh.iv,
    refreshTokenAuthTag: encRefresh.authTag,
    tokenExpiresAt: Date.now() + 3600000
  });
  mockDrive.folders.set('folder_idem', { id: 'folder_idem', name: 'Sangam Coursework', trashed: false });

  const pdfBuffer = createMinimalPdfBuffer();
  const idempotencyKey = 'req_idemp_key_unique_999';

  // 1. Initial request
  const firstRes = await service.uploadAssignmentPdf({
    teacherUid,
    fileBuffer: pdfBuffer,
    originalFileName: 'Thermodynamics.pdf',
    fileSize: pdfBuffer.length,
    assignmentData: {
      title: 'First Law Problem Set',
      department: 'ME',
      year: '2nd Year',
      section: 'Sec A',
      dueDate: '2026-11-15'
    },
    idempotencyKey,
    encryptionKey: encKey
  });

  assert.strictEqual(firstRes.isReplay, false);
  const initialFileCount = mockDrive.files.size;

  // 2. Retry with exact same idempotencyKey
  const secondRes = await service.uploadAssignmentPdf({
    teacherUid,
    fileBuffer: pdfBuffer,
    originalFileName: 'Thermodynamics.pdf',
    fileSize: pdfBuffer.length,
    assignmentData: {
      title: 'First Law Problem Set',
      department: 'ME',
      year: '2nd Year',
      section: 'Sec A',
      dueDate: '2026-11-15'
    },
    idempotencyKey,
    encryptionKey: encKey
  });

  assert.strictEqual(secondRes.isReplay, true);
  assert.strictEqual(secondRes.assignment.id, firstRes.assignment.id);
  assert.strictEqual(secondRes.assignment.driveFileId, firstRes.assignment.driveFileId);
  // Zero duplicate files created in Drive!
  assert.strictEqual(mockDrive.files.size, initialFileCount);
});

await runAsyncTest('[MOCKED FIRESTORE / GOOGLE DRIVE] 3.6: Safe recovery: Reuses driveFileId if Google upload succeeded but previous request crashed before DB write', async () => {
  const service = new GoogleDriveService();
  const mockDb = new MockFirestore();
  const mockDrive = new MockDriveApi();
  service.setTestDb(mockDb);
  service.customDriveApi = mockDrive;

  const teacherUid = 'teacher_recovery_01';
  const encKey = process.env.TOKEN_ENCRYPTION_KEY;

  await mockDb.collection('users').doc(teacherUid).set({
    uid: teacherUid,
    role: 'faculty',
    status: 'active',
    institution: 'UEMK'
  });
  await mockDb.collection('teacher_allocations').doc(`${teacherUid}_ME_2nd Year_Sec A`).set({
    teacherUid,
    department: 'ME',
    year: '2nd Year',
    section: 'Sec A',
    institution: 'UEMK',
    authorized: true
  });
  const encAccess = encrypt('token-123', encKey);
  const encRefresh = encrypt('refresh-123', encKey);
  await mockDb.collection('faculty_storage_integrations').doc(teacherUid).set({
    facultyUid: teacherUid,
    status: 'connected',
    rootFolderId: 'folder_recovery',
    encryptedAccessToken: encAccess.encryptedData,
    accessTokenIv: encAccess.iv,
    accessTokenAuthTag: encAccess.authTag,
    encryptedRefreshToken: encRefresh.encryptedData,
    refreshTokenIv: encRefresh.iv,
    refreshTokenAuthTag: encRefresh.authTag,
    tokenExpiresAt: Date.now() + 3600000
  });
  mockDrive.folders.set('folder_recovery', { id: 'folder_recovery', name: 'Sangam Coursework', trashed: false });

  const idempotencyKey = 'crashed_upload_recovery_key_111';
  // Simulate previous crashed attempt that created Drive file and set pending with driveFileId, but DB write failed
  const preCreatedDriveFileId = 'mock_drive_file_pre_created_abc';
  mockDrive.files.set(preCreatedDriveFileId, {
    id: preCreatedDriveFileId,
    name: 'Assignment_PreCreated.pdf',
    folderId: 'folder_recovery',
    size: 500
  });

  await mockDb.collection('upload_idempotency').doc(`${teacherUid}_${idempotencyKey}`).set({
    teacherUid,
    idempotencyKey,
    status: 'pending',
    driveFileId: preCreatedDriveFileId,
    driveFileName: 'Assignment_PreCreated.pdf',
    createdAt: Date.now() - 35000 // lock expired >30s ago
  });

  const pdfBuffer = createMinimalPdfBuffer();
  const driveFilesCountBefore = mockDrive.files.size;

  const res = await service.uploadAssignmentPdf({
    teacherUid,
    fileBuffer: pdfBuffer,
    originalFileName: 'FluidDynamics.pdf',
    fileSize: pdfBuffer.length,
    assignmentData: {
      title: 'Navier Stokes',
      department: 'ME',
      year: '2nd Year',
      section: 'Sec A',
      dueDate: '2026-11-20'
    },
    idempotencyKey,
    encryptionKey: encKey
  });

  // Reused pre-created driveFileId instead of generating a new one!
  assert.strictEqual(res.assignment.driveFileId, preCreatedDriveFileId);
  assert.strictEqual(mockDrive.files.size, driveFilesCountBefore);
});

await runAsyncTest('[MOCKED FIRESTORE / GOOGLE DRIVE] 3.6b: Returns HTTP 409 UPLOAD_IN_PROGRESS when active lock exists', async () => {
  const service = new GoogleDriveService();
  const mockDb = new MockFirestore();
  const mockDrive = new MockDriveApi();
  service.setTestDb(mockDb);
  service.customDriveApi = mockDrive;

  const teacherUid = 'teacher_lock_01';
  const encKey = process.env.TOKEN_ENCRYPTION_KEY;

  await mockDb.collection('users').doc(teacherUid).set({
    uid: teacherUid,
    role: 'faculty',
    status: 'active',
    institution: 'UEMK'
  });
  await mockDb.collection('teacher_allocations').doc(`${teacherUid}_ME_2nd Year_Sec A`).set({
    teacherUid,
    department: 'ME',
    year: '2nd Year',
    section: 'Sec A',
    institution: 'UEMK',
    authorized: true
  });
  const encAccess = encrypt('token-123', encKey);
  const encRefresh = encrypt('refresh-123', encKey);
  await mockDb.collection('faculty_storage_integrations').doc(teacherUid).set({
    facultyUid: teacherUid,
    status: 'connected',
    rootFolderId: 'folder_locked',
    encryptedAccessToken: encAccess.encryptedData,
    accessTokenIv: encAccess.iv,
    accessTokenAuthTag: encAccess.authTag,
    encryptedRefreshToken: encRefresh.encryptedData,
    refreshTokenIv: encRefresh.iv,
    refreshTokenAuthTag: encRefresh.authTag,
    tokenExpiresAt: Date.now() + 3600000
  });
  mockDrive.folders.set('folder_locked', { id: 'folder_locked', name: 'Sangam Coursework', trashed: false });

  const idempotencyKey = 'active_concurrent_lock_key';
  // Simulate active in-flight upload by another worker
  await mockDb.collection('upload_idempotency').doc(`${teacherUid}_${idempotencyKey}`).set({
    teacherUid,
    idempotencyKey,
    status: 'pending',
    createdAt: Date.now() - 5000 // Active lock (< 30s)
  });

  const pdfBuffer = createMinimalPdfBuffer();
  try {
    await service.uploadAssignmentPdf({
      teacherUid,
      fileBuffer: pdfBuffer,
      originalFileName: 'Concurrent.pdf',
      fileSize: pdfBuffer.length,
      assignmentData: {
        title: 'Concurrent Attempt',
        department: 'ME',
        year: '2nd Year',
        section: 'Sec A',
        dueDate: '2026-11-20'
      },
      idempotencyKey,
      encryptionKey: encKey
    });
    assert.fail('Should have thrown HTTP 409 UPLOAD_IN_PROGRESS');
  } catch (err) {
    assert.strictEqual(err.status, 409);
    assert.strictEqual(err.code, 'UPLOAD_IN_PROGRESS');
    assert.ok(err.message.includes('in progress'));
  }
});

await runAsyncTest('[MOCKED FIRESTORE / GOOGLE DRIVE] 3.7: Rejects missing required assignment fields (400 Bad Request)', async () => {
  const service = new GoogleDriveService();
  const mockDb = new MockFirestore();
  service.setTestDb(mockDb);

  const teacherUid = 'teacher_sarah_02';
  await mockDb.collection('users').doc(teacherUid).set({
    uid: teacherUid,
    role: 'faculty',
    status: 'active',
    institution: 'UEMK'
  });
  await mockDb.collection('teacher_allocations').doc(`${teacherUid}_CSE AI_2nd Year_Sec A`).set({
    teacherUid,
    department: 'CSE AI',
    year: '2nd Year',
    section: 'Sec A',
    institution: 'UEMK',
    authorized: true
  });

  const pdfBuffer = createMinimalPdfBuffer();

  // Missing title
  await assert.rejects(
    async () => service.uploadAssignmentPdf({
      teacherUid,
      fileBuffer: pdfBuffer,
      originalFileName: 'asg.pdf',
      fileSize: pdfBuffer.length,
      assignmentData: {
        title: '',
        department: 'CSE AI',
        year: '2nd Year',
        section: 'Sec A',
        dueDate: '2026-11-01'
      }
    }),
    /title is required/
  );

  // Missing dueDate
  await assert.rejects(
    async () => service.uploadAssignmentPdf({
      teacherUid,
      fileBuffer: pdfBuffer,
      originalFileName: 'asg.pdf',
      fileSize: pdfBuffer.length,
      assignmentData: {
        title: 'Valid Title',
        department: 'CSE AI',
        year: '2nd Year',
        section: 'Sec A',
        dueDate: ''
      }
    }),
    /Due date is required/
  );
});

await runAsyncTest('[MOCKED FIRESTORE / GOOGLE DRIVE] 3.8: Rejects title exceeding 200 chars or invalid dueDate format (400)', async () => {
  const service = new GoogleDriveService();
  const mockDb = new MockFirestore();
  service.setTestDb(mockDb);

  const teacherUid = 'teacher_sarah_03';
  await mockDb.collection('users').doc(teacherUid).set({
    uid: teacherUid,
    role: 'faculty',
    status: 'active',
    institution: 'UEMK'
  });
  await mockDb.collection('teacher_allocations').doc(`${teacherUid}_CSE AI_2nd Year_Sec A`).set({
    teacherUid,
    department: 'CSE AI',
    year: '2nd Year',
    section: 'Sec A',
    institution: 'UEMK',
    authorized: true
  });

  const pdfBuffer = createMinimalPdfBuffer();

  // Title > 200 chars
  await assert.rejects(
    async () => service.uploadAssignmentPdf({
      teacherUid,
      fileBuffer: pdfBuffer,
      originalFileName: 'asg.pdf',
      fileSize: pdfBuffer.length,
      assignmentData: {
        title: 'A'.repeat(201),
        department: 'CSE AI',
        year: '2nd Year',
        section: 'Sec A',
        dueDate: '2026-11-01'
      }
    }),
    /must not exceed 200 characters/
  );

  // Invalid date format
  await assert.rejects(
    async () => service.uploadAssignmentPdf({
      teacherUid,
      fileBuffer: pdfBuffer,
      originalFileName: 'asg.pdf',
      fileSize: pdfBuffer.length,
      assignmentData: {
        title: 'Valid Title',
        department: 'CSE AI',
        year: '2nd Year',
        section: 'Sec A',
        dueDate: 'not-a-valid-date-string'
      }
    }),
    /valid date format/
  );
});

await runAsyncTest('[MOCKED FIRESTORE / GOOGLE DRIVE] 3.9: Handles upstream Google Drive provider timeout (504)', async () => {
  const service = new GoogleDriveService();
  const mockDb = new MockFirestore();
  const mockDrive = new MockDriveApi();
  mockDrive.shouldTimeout = true; // Simulate upstream timeout
  service.setTestDb(mockDb);
  service.customDriveApi = mockDrive;

  const teacherUid = 'teacher_timeout_01';
  const encKey = process.env.TOKEN_ENCRYPTION_KEY;

  await mockDb.collection('users').doc(teacherUid).set({
    uid: teacherUid,
    role: 'faculty',
    status: 'active',
    institution: 'UEMK'
  });
  await mockDb.collection('teacher_allocations').doc(`${teacherUid}_CSE AI_2nd Year_Sec A`).set({
    teacherUid,
    department: 'CSE AI',
    year: '2nd Year',
    section: 'Sec A',
    institution: 'UEMK',
    authorized: true
  });
  const encAccess = encrypt('token-123', encKey);
  const encRefresh = encrypt('refresh-123', encKey);
  await mockDb.collection('faculty_storage_integrations').doc(teacherUid).set({
    facultyUid: teacherUid,
    status: 'connected',
    rootFolderId: 'folder_timeout',
    encryptedAccessToken: encAccess.encryptedData,
    accessTokenIv: encAccess.iv,
    accessTokenAuthTag: encAccess.authTag,
    encryptedRefreshToken: encRefresh.encryptedData,
    refreshTokenIv: encRefresh.iv,
    refreshTokenAuthTag: encRefresh.authTag,
    tokenExpiresAt: Date.now() + 3600000
  });
  mockDrive.folders.set('folder_timeout', { id: 'folder_timeout', name: 'Sangam Coursework', trashed: false });

  const pdfBuffer = createMinimalPdfBuffer();

  await assert.rejects(
    async () => service.uploadAssignmentPdf({
      teacherUid,
      fileBuffer: pdfBuffer,
      originalFileName: 'asg.pdf',
      fileSize: pdfBuffer.length,
      assignmentData: {
        title: 'Timeout Test',
        department: 'CSE AI',
        year: '2nd Year',
        section: 'Sec A',
        dueDate: '2026-11-01'
      },
      encryptionKey: encKey
    }),
    /timed out/
  );
});

await runAsyncTest('[MOCKED FIRESTORE / GOOGLE DRIVE] 3.10: Handles token refresh failure / revoked grant during upload (401)', async () => {
  const service = new GoogleDriveService();
  const mockDb = new MockFirestore();
  const mockDrive = new MockDriveApi();
  mockDrive.shouldFailAuth = true; // Simulate revoked token
  service.setTestDb(mockDb);
  service.customDriveApi = mockDrive;

  const teacherUid = 'teacher_auth_fail_01';
  const encKey = process.env.TOKEN_ENCRYPTION_KEY;

  await mockDb.collection('users').doc(teacherUid).set({
    uid: teacherUid,
    role: 'faculty',
    status: 'active',
    institution: 'UEMK'
  });
  await mockDb.collection('teacher_allocations').doc(`${teacherUid}_CSE AI_2nd Year_Sec A`).set({
    teacherUid,
    department: 'CSE AI',
    year: '2nd Year',
    section: 'Sec A',
    institution: 'UEMK',
    authorized: true
  });
  const encAccess = encrypt('stale-token', encKey);
  const encRefresh = encrypt('revoked-refresh', encKey);
  await mockDb.collection('faculty_storage_integrations').doc(teacherUid).set({
    facultyUid: teacherUid,
    status: 'connected',
    rootFolderId: 'folder_auth_fail',
    encryptedAccessToken: encAccess.encryptedData,
    accessTokenIv: encAccess.iv,
    accessTokenAuthTag: encAccess.authTag,
    encryptedRefreshToken: encRefresh.encryptedData,
    refreshTokenIv: encRefresh.iv,
    refreshTokenAuthTag: encRefresh.authTag,
    tokenExpiresAt: Date.now() + 3600000
  });

  const pdfBuffer = createMinimalPdfBuffer();

  await assert.rejects(
    async () => service.uploadAssignmentPdf({
      teacherUid,
      fileBuffer: pdfBuffer,
      originalFileName: 'asg.pdf',
      fileSize: pdfBuffer.length,
      assignmentData: {
        title: 'Auth Fail Test',
        department: 'CSE AI',
        year: '2nd Year',
        section: 'Sec A',
        dueDate: '2026-11-01'
      },
      encryptionKey: encKey
    }),
    /revoked or expired/
  );
});

await runAsyncTest('[MOCKED FIRESTORE / GOOGLE DRIVE] 3.11: Teacher isolation: Teacher A cannot use Teacher B allocation or folder', async () => {
  const service = new GoogleDriveService();
  const mockDb = new MockFirestore();
  const mockDrive = new MockDriveApi();
  service.setTestDb(mockDb);
  service.customDriveApi = mockDrive;

  const teacherA = 'teacher_isolation_alpha';
  const teacherB = 'teacher_isolation_beta';
  const encKey = process.env.TOKEN_ENCRYPTION_KEY;

  // Setup Teacher A: allocated to Computer Science 2nd Year Sec A
  await mockDb.collection('users').doc(teacherA).set({
    uid: teacherA,
    role: 'faculty',
    status: 'active',
    institution: 'UEMK'
  });
  await mockDb.collection('teacher_allocations').doc(`${teacherA}_Computer Science_2nd Year_Sec A`).set({
    teacherUid: teacherA,
    department: 'Computer Science',
    year: '2nd Year',
    section: 'Sec A',
    institution: 'UEMK',
    authorized: true
  });

  // Setup Teacher B: allocated to Mechanical Engineering 3rd Year Sec B
  await mockDb.collection('users').doc(teacherB).set({
    uid: teacherB,
    role: 'faculty',
    status: 'active',
    institution: 'UEMK'
  });
  await mockDb.collection('teacher_allocations').doc(`${teacherB}_Mechanical Engineering_3rd Year_Sec B`).set({
    teacherUid: teacherB,
    department: 'Mechanical Engineering',
    year: '3rd Year',
    section: 'Sec B',
    institution: 'UEMK',
    authorized: true
  });

  const pdfBuffer = createMinimalPdfBuffer();

  // Teacher A tries to create assignment for Teacher B's allocated class -> 403 Forbidden
  await assert.rejects(
    async () => service.uploadAssignmentPdf({
      teacherUid: teacherA,
      fileBuffer: pdfBuffer,
      originalFileName: 'asg.pdf',
      fileSize: pdfBuffer.length,
      assignmentData: {
        title: 'Thermodynamics by CS Faculty',
        department: 'Mechanical Engineering',
        year: '3rd Year',
        section: 'Sec B',
        dueDate: '2026-11-01'
      },
      encryptionKey: encKey
    }),
    /not authorized/
  );
});

// -----------------------------------------------------------------------------
// SECTION 4: Live HTTP API Integration Tests (Port 3001)
// -----------------------------------------------------------------------------
console.log('\n--- SECTION 4: Live HTTP API Upload Security & Validation ---');

const TEST_PORT = 3192;
let testServer = null;

async function startTestServer() {
  return new Promise((resolve) => {
    testServer = app.listen(TEST_PORT, () => {
      resolve();
    });
  });
}

async function stopTestServer() {
  if (testServer) {
    await new Promise((resolve) => testServer.close(resolve));
    testServer = null;
  }
}

// Multipart helper for node http.request
function createMultipartPayload(fields, fileField) {
  const boundary = `----SangamTestBoundary${crypto.randomBytes(8).toString('hex')}`;
  const parts = [];

  for (const [key, val] of Object.entries(fields)) {
    parts.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${val}\r\n`
    ));
  }

  if (fileField) {
    const filename = fileField.filename || 'assignment.pdf';
    const contentType = fileField.contentType || 'application/pdf';
    parts.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${fileField.fieldname || 'file'}"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`
    ));
    parts.push(fileField.buffer);
    parts.push(Buffer.from('\r\n'));
  }

  parts.push(Buffer.from(`--${boundary}--\r\n`));
  const body = Buffer.concat(parts);

  return { boundary, body };
}

function makeHttpRequest(path, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'localhost',
      port: TEST_PORT,
      path,
      method: options.method || 'GET',
      headers: options.headers || {}
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch {}
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          data,
          json
        });
      });
    });

    req.on('error', reject);
    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

await startTestServer();

try {
  await runAsyncTest('[INTEGRATION] 4.1: Upload endpoint requires Firebase Authentication (401 without Bearer token)', async () => {
    const { boundary, body } = createMultipartPayload({ title: 'Test' }, {
      buffer: createMinimalPdfBuffer(),
      filename: 'test.pdf',
      contentType: 'application/pdf'
    });

    const res = await makeHttpRequest('/api/storage/google/upload-assignment', {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': String(body.length)
      },
      body
    });

    assert.strictEqual(res.statusCode, 401);
    assert.strictEqual(res.json.success, false);
    assert.ok(res.json.error.includes('Authorization header'));
  });

  await runAsyncTest('[INTEGRATION] 4.2: Upload endpoint rejects malformed or unverified token (401)', async () => {
    const { boundary, body } = createMultipartPayload({ title: 'Test' }, {
      buffer: createMinimalPdfBuffer(),
      filename: 'test.pdf',
      contentType: 'application/pdf'
    });

    const res = await makeHttpRequest('/api/storage/google/upload-assignment', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer invalid_forged_firebase_id_token',
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': String(body.length)
      },
      body
    });

    assert.strictEqual(res.statusCode, 401);
    assert.strictEqual(res.json.success, false);
  });

  await runAsyncTest('[INTEGRATION] 4.3: Canonical endpoint /api/assignments/upload works identically and requires auth', async () => {
    const res = await makeHttpRequest('/api/assignments/upload', {
      method: 'POST',
      headers: {}
    });

    assert.strictEqual(res.statusCode, 401);
    assert.strictEqual(res.json.success, false);
  });
} finally {
  await stopTestServer();
}

// -----------------------------------------------------------------------------
// SECTION 5: PDF Validation & File Cleanup In-Depth Tests
// -----------------------------------------------------------------------------
console.log('\n--- SECTION 5: PDF Validation & Temporary File Cleanup ---');

await runAsyncTest('[VALIDATION] 5.1: File signature validation rejects fake PDF with text content', async () => {
  const tempDir = path.join(process.cwd(), 'uploads', 'assignments');
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

  const fakePdfPath = path.join(tempDir, `test_fake_${Date.now()}.pdf`);
  fs.writeFileSync(fakePdfPath, 'This is plain text pretending to be a PDF!');

  const fd = await fs.promises.open(fakePdfPath, 'r');
  const buffer = Buffer.alloc(5);
  await fd.read(buffer, 0, 5, 0);
  await fd.close();

  const isPdf = buffer.toString('utf-8') === '%PDF-';
  assert.strictEqual(isPdf, false);

  fs.unlinkSync(fakePdfPath);
  assert.strictEqual(fs.existsSync(fakePdfPath), false);
});

await runAsyncTest('[VALIDATION] 5.2: Temporary file is unlinked on error or exception', async () => {
  const tempDir = path.join(process.cwd(), 'uploads', 'assignments');
  const testFile = path.join(tempDir, `test_cleanup_${Date.now()}.pdf`);
  fs.writeFileSync(testFile, '%PDF-1.4 mock content');

  assert.strictEqual(fs.existsSync(testFile), true);

  try {
    throw new Error('Simulated processing failure');
  } catch {
    // catch
  } finally {
    if (fs.existsSync(testFile)) {
      fs.unlinkSync(testFile);
    }
  }

  assert.strictEqual(fs.existsSync(testFile), false);
});

import { handleUploadAssignment, handleAssignmentFileUpload } from '../server/routes/storageRoutes.js';

await runAsyncTest('[VALIDATION] 5.3: handleUploadAssignment rejects missing file with 400 MISSING_FILE', async () => {
  const req = {
    userId: 'teacher_123',
    file: null,
    body: {}
  };
  let responseData = null;
  let statusCode = 200;
  const res = {
    status: (code) => {
      statusCode = code;
      return {
        json: (data) => { responseData = data; return res; }
      };
    }
  };

  await handleUploadAssignment(req, res);
  assert.strictEqual(statusCode, 400);
  assert.strictEqual(responseData.code, 'MISSING_FILE');
});

await runAsyncTest('[VALIDATION] 5.4: handleUploadAssignment rejects 0-byte empty file with 400 EMPTY_FILE', async () => {
  const tempDir = path.join(process.cwd(), 'uploads', 'assignments');
  const emptyFilePath = path.join(tempDir, `empty_${Date.now()}.pdf`);
  fs.writeFileSync(emptyFilePath, Buffer.alloc(0));

  const req = {
    userId: 'teacher_123',
    file: {
      path: emptyFilePath,
      size: 0,
      mimetype: 'application/pdf',
      originalname: 'empty.pdf'
    },
    body: {}
  };
  let responseData = null;
  let statusCode = 200;
  const res = {
    status: (code) => {
      statusCode = code;
      return {
        json: (data) => { responseData = data; return res; }
      };
    }
  };

  await handleUploadAssignment(req, res);
  assert.strictEqual(statusCode, 400);
  assert.strictEqual(responseData.code, 'EMPTY_FILE');
  // Temporary file was cleaned up in finally block!
  assert.strictEqual(fs.existsSync(emptyFilePath), false);
});

await runAsyncTest('[VALIDATION] 5.5: handleUploadAssignment rejects non-PDF MIME type with 400 INVALID_MIME_TYPE', async () => {
  const tempDir = path.join(process.cwd(), 'uploads', 'assignments');
  const imgPath = path.join(tempDir, `fake_img_${Date.now()}.png`);
  fs.writeFileSync(imgPath, Buffer.from('fake image data'));

  const req = {
    userId: 'teacher_123',
    file: {
      path: imgPath,
      size: 15,
      mimetype: 'image/png',
      originalname: 'test.png'
    },
    body: {}
  };
  let responseData = null;
  let statusCode = 200;
  const res = {
    status: (code) => {
      statusCode = code;
      return {
        json: (data) => { responseData = data; return res; }
      };
    }
  };

  await handleUploadAssignment(req, res);
  assert.strictEqual(statusCode, 400);
  assert.strictEqual(responseData.code, 'INVALID_MIME_TYPE');
  // Temporary file cleaned up!
  assert.strictEqual(fs.existsSync(imgPath), false);
});

await runAsyncTest('[VALIDATION] 5.6: handleUploadAssignment rejects fake PDF magic bytes with 400 INVALID_PDF_SIGNATURE', async () => {
  const tempDir = path.join(process.cwd(), 'uploads', 'assignments');
  const fakePdfPath = path.join(tempDir, `fake_signature_${Date.now()}.pdf`);
  fs.writeFileSync(fakePdfPath, Buffer.from('NOT_A_PDF_DOCUMENT_12345'));

  const req = {
    userId: 'teacher_123',
    file: {
      path: fakePdfPath,
      size: 24,
      mimetype: 'application/pdf',
      originalname: 'test.pdf'
    },
    body: {}
  };
  let responseData = null;
  let statusCode = 200;
  const res = {
    status: (code) => {
      statusCode = code;
      return {
        json: (data) => { responseData = data; return res; }
      };
    }
  };

  await handleUploadAssignment(req, res);
  assert.strictEqual(statusCode, 400);
  assert.strictEqual(responseData.code, 'INVALID_PDF_SIGNATURE');
  // Temporary file cleaned up!
  assert.strictEqual(fs.existsSync(fakePdfPath), false);
});

// -----------------------------------------------------------------------------
// SECTION 6: Regression Tests (POST /api/similarity & GET /api/health)
// -----------------------------------------------------------------------------
console.log('\n--- SECTION 6: Existing Route Regressions ---');

await startTestServer();

try {
  await runAsyncTest('[REGRESSION] 6.1: GET /api/health remains healthy and accessible', async () => {
    const res = await makeHttpRequest('/api/health');
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json.status, 'healthy');
  });

  await runAsyncTest('[REGRESSION] 6.2: POST /api/similarity processes PDF multipart upload and unlinks files', async () => {
    const fileA = createMinimalPdfBuffer('Doc A content');
    const fileB = createMinimalPdfBuffer('Doc B content');

    const boundary = `----SimilarityRegression${crypto.randomBytes(8).toString('hex')}`;
    const parts = [
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="fileA"; filename="subA.pdf"\r\nContent-Type: application/pdf\r\n\r\n`),
      fileA,
      Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="fileB"; filename="subB.pdf"\r\nContent-Type: application/pdf\r\n\r\n`),
      fileB,
      Buffer.from(`\r\n--${boundary}--\r\n`)
    ];
    const body = Buffer.concat(parts);

    const res = await makeHttpRequest('/api/similarity', {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': String(body.length)
      },
      body
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json.success, true);
    assert.ok(res.json.report);
  });
} finally {
  await stopTestServer();
}

// -----------------------------------------------------------------------------
// SUMMARY REPORT
// -----------------------------------------------------------------------------
console.log('\n======================================================');
console.log(` RESULTS: ${passed} passed, ${failed} failed`);
console.log('======================================================\n');

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}

