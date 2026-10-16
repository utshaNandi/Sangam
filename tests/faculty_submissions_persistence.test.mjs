/**
 * Sangam Test Suite: Faculty Submissions, Assignment Persistence & Hardcoded Data Removal
 *
 * Verifies all 11 acceptance requirements:
 * 1. Faculty can retrieve submissions for their own assignment.
 * 2. Each submission identifies the correct student and PDF filename.
 * 3. Faculty can download an authorized submission PDF.
 * 4. Unauthorized faculty cannot access another section's submissions.
 * 5. Students cannot access other students' submissions or submission rosters.
 * 6. Two students can submit to the same assignment without overwriting each other.
 * 7. A student upload does not remove the original assignment from the faculty list.
 * 8. Faculty assignment lists contain only real backend data, not hardcoded demo records.
 * 9. Section student lists contain only real, correctly scoped student profiles.
 * 10. Empty, loading, and error states work without mock-data fallbacks.
 * 11. Existing teacher assignment uploads and student PDF submissions continue to work.
 */

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { app } from '../server.js';
import { googleDriveService } from '../server/services/googleDriveService.js';
import { encrypt } from '../server/services/encryptionService.js';

let passedTests = 0;
let failedTests = 0;

function pass(name) {
  console.log(`  [PASS] ${name}`);
  passedTests++;
}

function fail(name, err) {
  console.error(`  [FAIL] ${name}:`, err.message || err);
  failedTests++;
}

// Ensure encryption key is present for tests
process.env.TOKEN_ENCRYPTION_KEY = process.env.TOKEN_ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

// Deterministic in-memory database simulation
class MockCollection {
  constructor(name, store) {
    this.name = name;
    this.store = store;
  }

  doc(id) {
    return {
      id,
      set: async (data, opts = {}) => {
        const existing = this.store[this.name]?.[id] || {};
        if (opts.merge) {
          this.store[this.name][id] = { ...existing, ...data };
        } else {
          this.store[this.name][id] = { ...data };
        }
        return { writeTime: new Date() };
      },
      get: async () => {
        const data = this.store[this.name]?.[id];
        return {
          id,
          exists: Boolean(data),
          data: () => (data ? { ...data } : undefined)
        };
      },
      delete: async () => {
        if (this.store[this.name]?.[id]) {
          delete this.store[this.name][id];
        }
      }
    };
  }

  where(field, op, val) {
    return {
      get: async () => {
        const col = this.store[this.name] || {};
        const docs = [];
        for (const [id, data] of Object.entries(col)) {
          if (op === '==' && data[field] === val) {
            docs.push({ id, data: () => ({ ...data }) });
          }
        }
        return {
          docs,
          empty: docs.length === 0,
          size: docs.length,
          forEach: (fn) => docs.forEach(fn)
        };
      }
    };
  }

  async get() {
    const col = this.store[this.name] || {};
    const docs = Object.entries(col).map(([id, data]) => ({
      id,
      data: () => ({ ...data })
    }));
    return {
      docs,
      empty: docs.length === 0,
      size: docs.length,
      forEach: (fn) => docs.forEach(fn)
    };
  }
}

class MockFirestore {
  constructor() {
    this.store = {
      users: {},
      teacher_allocations: {},
      assignments: {},
      submissions: {},
      google_integrations: {}
    };
  }

  collection(name) {
    if (!this.store[name]) {
      this.store[name] = {};
    }
    return new MockCollection(name, this.store);
  }
}

console.log('\n======================================================');
console.log(' SANGAM: FACULTY SUBMISSIONS & ASSIGNMENT PERSISTENCE');
console.log(' Complete Verification Suite (Requirements 1 - 11)');
console.log('======================================================\n');

async function runTestSuite() {
  const mockDb = new MockFirestore();
  const originalGetDb = googleDriveService.getDb;
  googleDriveService.getDb = () => mockDb;

  // Mock Google Drive binary fetch double
  const samplePdfBuffer = Buffer.from('%PDF-1.4 Mock submission binary content for Sangam testing %%EOF');
  googleDriveService.downloadFile = async (fileId) => samplePdfBuffer;
  googleDriveService.getValidAccessToken = async () => 'mock_valid_access_token_xyz';

  // Seed baseline users
  mockDb.store.users = {
    teacher_sarah: {
      uid: 'teacher_sarah',
      role: 'faculty',
      name: 'Prof. Sarah Jenkins',
      email: 'sarah.jenkins@uem.edu.in',
      institution: 'UEMK',
      status: 'active'
    },
    teacher_unauthorized: {
      uid: 'teacher_unauthorized',
      role: 'faculty',
      name: 'Prof. Alan Turing',
      email: 'alan.turing@uem.edu.in',
      institution: 'UEMK',
      status: 'active'
    },
    student_alice: {
      uid: 'student_alice',
      role: 'student',
      name: 'Alice Roy',
      roll: 'CSE-101',
      email: 'alice.roy@student.uem.edu.in',
      institution: 'UEMK',
      department: 'Computer Science',
      year: '2nd Year',
      section: 'Section A',
      status: 'active'
    },
    student_bob: {
      uid: 'student_bob',
      role: 'student',
      name: 'Bob Mukherjee',
      roll: 'CSE-102',
      email: 'bob.m@student.uem.edu.in',
      institution: 'UEMK',
      department: 'Computer Science',
      year: '2nd Year',
      section: 'Section A',
      status: 'active'
    },
    student_charlie_other_section: {
      uid: 'student_charlie_other_section',
      role: 'student',
      name: 'Charlie Brown',
      roll: 'ECE-201',
      email: 'charlie.b@student.uem.edu.in',
      institution: 'UEMK',
      department: 'Electronics & Communication',
      year: '3rd Year',
      section: 'Section B',
      status: 'active'
    },
    student_inactive: {
      uid: 'student_inactive',
      role: 'student',
      name: 'Inactive Student',
      roll: 'CSE-199',
      email: 'inactive@student.uem.edu.in',
      institution: 'UEMK',
      department: 'Computer Science',
      year: '2nd Year',
      section: 'Section A',
      status: 'inactive'
    }
  };

  // Seed teacher allocations: Sarah teaches Computer Science, 2nd Year, Section A and 3rd Year, Section C
  mockDb.store.teacher_allocations = {
    alloc_sarah_1: {
      id: 'alloc_sarah_1',
      teacherUid: 'teacher_sarah',
      department: 'Computer Science',
      year: '2nd Year',
      section: 'Section A',
      subject: 'Data Structures',
      authorized: true
    },
    alloc_sarah_empty: {
      id: 'alloc_sarah_empty',
      teacherUid: 'teacher_sarah',
      department: 'Computer Science',
      year: '3rd Year',
      section: 'Section C',
      subject: 'Algorithms',
      authorized: true
    }
  };

  // Seed teacher's connected Google Drive integration
  const encKey = process.env.TOKEN_ENCRYPTION_KEY;
  const encryptedTokens = encrypt(
    JSON.stringify({
      access_token: 'mock-valid-access-token-sarah-1234',
      refresh_token: 'mock-refresh-token-sarah-5678',
      expires_in: 3600
    }),
    encKey
  );

  mockDb.store.faculty_storage_integrations = {
    teacher_sarah: {
      facultyUid: 'teacher_sarah',
      provider: 'google',
      status: 'connected',
      accountEmail: 'sarah.jenkins@uem.edu.in',
      accountName: 'Sarah Jenkins',
      encryptedAccessToken: encryptedTokens.encryptedData,
      accessTokenIv: encryptedTokens.iv,
      accessTokenAuthTag: encryptedTokens.authTag,
      encryptedRefreshToken: encryptedTokens.encryptedData,
      refreshTokenIv: encryptedTokens.iv,
      refreshTokenAuthTag: encryptedTokens.authTag,
      tokenExpiresAt: Date.now() + 3600000,
      rootFolderId: 'folder_coursework_sarah',
      rootFolderName: 'Sangam Coursework',
      connectedAt: '2026-10-01T10:00:00Z',
      updatedAt: '2026-10-01T10:00:00Z'
    }
  };

  // Mock Google Drive API actions
  const mockDrive = {
    verifyFolder: async (folderId, token) => ({ exists: true, trashed: false, name: 'Sangam Coursework' }),
    createFolder: async (name, token) => ({ id: `folder_${Date.now()}`, name, trashed: false }),
    uploadFile: async (folderId, fileName, mimeType, buffer, token, opts) => ({
      id: `drive_file_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      name: fileName,
      mimeType,
      size: buffer.length
    }),
    getFileStream: async (fileId, token) => {
      return Buffer.from('%PDF-1.4 Mock Stream Binary Content %%EOF');
    }
  };
  googleDriveService.verifyFolder = (folderId, token) => mockDrive.verifyFolder(folderId, token);
  googleDriveService.createDriveFolder = (name, token) => mockDrive.createFolder(name, token);
  googleDriveService.uploadFileToFolder = (folderId, fileName, mimeType, buffer, token, opts) =>
    mockDrive.uploadFile(folderId, fileName, mimeType, buffer, token, opts);
  googleDriveService.getFileStream = (fileId, token) => mockDrive.getFileStream(fileId, token);

  // Seed baseline assignment created by teacher_sarah
  const testAssignmentId = 'asg_data_structures_101';
  mockDb.store.assignments[testAssignmentId] = {
    id: testAssignmentId,
    teacherUid: 'teacher_sarah',
    teacherName: 'Prof. Sarah Jenkins',
    teacherEmail: 'sarah.jenkins@uem.edu.in',
    institution: 'UEMK',
    department: 'Computer Science',
    year: '2nd Year',
    section: 'Section A',
    subject: 'Data Structures',
    title: 'Data Structures Lab Assignment 1',
    description: 'Implement binary search trees in C/C++',
    dueDate: '2026-12-31',
    storageProvider: 'google',
    driveFileId: 'drive_file_teacher_asg_1',
    driveFileName: 'Assignment_Data_Structures_Lab_1.pdf',
    fileSizeBytes: 204850,
    mimeType: 'application/pdf',
    createdAt: new Date().toISOString()
  };

  // ---------------------------------------------------------------------------
  // TEST 1: Faculty can retrieve submissions for their own assignment
  // ---------------------------------------------------------------------------
  console.log('--- REQ 1 & 2: Faculty Submission Retrieval & Real Student Metadata ---');
  try {
    // Seed an initial submission for Alice
    const submissionIdAlice = `${testAssignmentId}_student_alice`;
    mockDb.store.submissions[submissionIdAlice] = {
      id: submissionIdAlice,
      assignmentId: testAssignmentId,
      studentUid: 'student_alice',
      studentName: 'Alice Roy',
      studentEmail: 'alice.roy@student.uem.edu.in',
      studentRoll: 'CSE-101',
      teacherUid: 'teacher_sarah',
      department: 'Computer Science',
      year: '2nd Year',
      section: 'Section A',
      driveFileId: 'drive_file_alice_sub_1',
      driveFileName: 'Submission_Alice_BST.pdf',
      originalFileName: 'Alice_Roy_Lab1_Final.pdf',
      fileSizeBytes: 102400,
      mimeType: 'application/pdf',
      status: 'Submitted',
      submittedAt: new Date(Date.now() - 3600000).toISOString(),
      createdAt: new Date(Date.now() - 3600000).toISOString()
    };

    const res = await googleDriveService.getAssignmentSubmissions(testAssignmentId, 'teacher_sarah');
    assert.strictEqual(res.success, true, 'Result should report success: true');
    assert.strictEqual(res.totalSubmissions, 1, 'Should find exactly 1 submission');
    assert.strictEqual(res.submissions.length, 1, 'Submissions array should contain 1 item');
    pass('1.1: Authorized faculty (Prof. Sarah) successfully retrieves submissions for own assignment');

    // ---------------------------------------------------------------------------
    // TEST 2: Each submission identifies the correct student and PDF filename
    // ---------------------------------------------------------------------------
    const sub = res.submissions[0];
    assert.strictEqual(sub.studentUid, 'student_alice', 'Correct student UID');
    assert.strictEqual(sub.studentName, 'Alice Roy', 'Correct real student name');
    assert.strictEqual(sub.studentRoll, 'CSE-101', 'Correct student enrollment/roll number');
    assert.strictEqual(sub.originalFileName, 'Alice_Roy_Lab1_Final.pdf', 'Correct original PDF filename');
    assert.strictEqual(sub.status, 'Submitted', 'Correct status Submitted');
    assert.ok(sub.submittedAt, 'Submission timestamp must be present');
    pass('2.1: Submission record includes real student name, roll number, PDF filename, and timestamp');
  } catch (err) {
    fail('REQ 1 & 2', err);
  }

  // ---------------------------------------------------------------------------
  // TEST 3: Faculty can download an authorized submission PDF
  // ---------------------------------------------------------------------------
  console.log('\n--- REQ 3: Authenticated & Authorized Submission PDF Download ---');
  try {
    const submissionIdAlice = `${testAssignmentId}_student_alice`;
    const downloadRes = await googleDriveService.getSubmissionFile(submissionIdAlice, 'teacher_sarah');
    assert.ok(downloadRes.fileBuffer instanceof Buffer, 'Should return a binary Buffer');
    assert.strictEqual(downloadRes.fileName, 'Alice_Roy_Lab1_Final.pdf', 'Should return the student PDF filename');
    assert.strictEqual(downloadRes.mimeType, 'application/pdf', 'Should return application/pdf MIME type');
    assert.ok(downloadRes.fileBuffer.toString().startsWith('%PDF-'), 'Buffer contains genuine PDF header');
    pass('3.1: Authorized teacher (Prof. Sarah) can download student Alice submission PDF stream');

    // Submitting student can also download their own submission
    const studentDownloadRes = await googleDriveService.getSubmissionFile(submissionIdAlice, 'student_alice');
    assert.ok(studentDownloadRes.fileBuffer instanceof Buffer, 'Student can download own submission');
    pass('3.2: Submitting student (Alice) can download their own submitted PDF');
  } catch (err) {
    fail('REQ 3', err);
  }

  // ---------------------------------------------------------------------------
  // TEST 4: Unauthorized faculty cannot access another section's submissions
  // ---------------------------------------------------------------------------
  console.log('\n--- REQ 4: Unauthorized Faculty Cross-Section Protection ---');
  try {
    let rejected = false;
    try {
      await googleDriveService.getAssignmentSubmissions(testAssignmentId, 'teacher_unauthorized');
    } catch (err) {
      rejected = true;
      assert.strictEqual(err.statusCode, 403, 'Must return 403 Forbidden');
      assert.strictEqual(err.code, 'FORBIDDEN_SCOPE', 'Must return FORBIDDEN_SCOPE error code');
    }
    assert.ok(rejected, 'Unauthorized teacher must be rejected');
    pass('4.1: Unauthorized faculty (Alan Turing) rejected with 403 FORBIDDEN_SCOPE on assignment submissions');

    let downloadBlocked = false;
    try {
      const submissionIdAlice = `${testAssignmentId}_student_alice`;
      await googleDriveService.getSubmissionFile(submissionIdAlice, 'teacher_unauthorized');
    } catch (err) {
      downloadBlocked = true;
      assert.strictEqual(err.statusCode, 403, 'Must return 403 Forbidden for unauthorized download');
    }
    assert.ok(downloadBlocked, 'Unauthorized teacher must be blocked from downloading submission PDF');
    pass('4.2: Unauthorized faculty blocked from downloading submission PDF (403)');
  } catch (err) {
    fail('REQ 4', err);
  }

  // ---------------------------------------------------------------------------
  // TEST 5: Students cannot access other students' submissions
  // ---------------------------------------------------------------------------
  console.log('\n--- REQ 5: Student Access Isolation ---');
  try {
    let studentBlockedFromList = false;
    try {
      await googleDriveService.getAssignmentSubmissions(testAssignmentId, 'student_alice');
    } catch (err) {
      studentBlockedFromList = true;
      assert.strictEqual(err.statusCode, 403, 'Student cannot list assignment submissions');
      assert.strictEqual(err.code, 'FORBIDDEN_ROLE');
    }
    assert.ok(studentBlockedFromList, 'Student must be blocked from calling getAssignmentSubmissions');
    pass('5.1: Students blocked from calling assignment submissions roster (403 FORBIDDEN_ROLE)');

    let studentBlockedFromOtherFile = false;
    try {
      const submissionIdAlice = `${testAssignmentId}_student_alice`;
      await googleDriveService.getSubmissionFile(submissionIdAlice, 'student_bob');
    } catch (err) {
      studentBlockedFromOtherFile = true;
      assert.strictEqual(err.statusCode, 403, 'Student Bob cannot download Student Alice submission');
    }
    assert.ok(studentBlockedFromOtherFile, 'Student Bob blocked from downloading Alice PDF');
    pass('5.2: Student Bob cannot download Student Alice submission PDF (403)');
  } catch (err) {
    fail('REQ 5', err);
  }

  // ---------------------------------------------------------------------------
  // TEST 6: Two students can submit to the same assignment without overwriting each other
  // ---------------------------------------------------------------------------
  console.log('\n--- REQ 6: Multi-Student Submission Persistence & Non-Collision ---');
  try {
    // Student Alice submits
    const subAlice = await googleDriveService.uploadStudentSubmission({
      studentUid: 'student_alice',
      studentEmail: 'alice.roy@student.uem.edu.in',
      assignmentId: testAssignmentId,
      fileBuffer: Buffer.from('%PDF-1.4 Alice Submission Binary Content %%EOF'),
      originalFileName: 'Alice_Roy_Solution.pdf',
      fileSize: 50120,
      idempotencyKey: 'idem_alice_unique_1'
    });

    // Student Bob submits to the SAME assignment
    const subBob = await googleDriveService.uploadStudentSubmission({
      studentUid: 'student_bob',
      studentEmail: 'bob.m@student.uem.edu.in',
      assignmentId: testAssignmentId,
      fileBuffer: Buffer.from('%PDF-1.4 Bob Submission Binary Content %%EOF'),
      originalFileName: 'Bob_Mukherjee_Solution.pdf',
      fileSize: 61400,
      idempotencyKey: 'idem_bob_unique_1'
    });

    assert.ok(subAlice.submission, 'Alice submission created');
    assert.ok(subBob.submission, 'Bob submission created');
    assert.notStrictEqual(subAlice.submission.id, subBob.submission.id, 'Submissions must have separate document IDs');

    // Verify both submissions exist in database concurrently
    const docAlice = await mockDb.collection('submissions').doc(subAlice.submission.id).get();
    const docBob = await mockDb.collection('submissions').doc(subBob.submission.id).get();

    assert.ok(docAlice.exists, 'Alice submission exists in Firestore');
    assert.ok(docBob.exists, 'Bob submission exists in Firestore');
    assert.strictEqual(docAlice.data().studentUid, 'student_alice');
    assert.strictEqual(docBob.data().studentUid, 'student_bob');

    // Retrieve submissions as teacher: both must be returned
    const teacherCheck = await googleDriveService.getAssignmentSubmissions(testAssignmentId, 'teacher_sarah');
    assert.strictEqual(teacherCheck.totalSubmissions, 2, 'Teacher must see both student submissions');
    const uids = teacherCheck.submissions.map(s => s.studentUid);
    assert.ok(uids.includes('student_alice'), 'Alice included in teacher view');
    assert.ok(uids.includes('student_bob'), 'Bob included in teacher view');
    pass('6.1: Two students submit to the same assignment and both persist independently without collision');
  } catch (err) {
    fail('REQ 6', err);
  }

  // ---------------------------------------------------------------------------
  // TEST 7: A student upload does not remove the original assignment from the faculty list
  // ---------------------------------------------------------------------------
  console.log('\n--- REQ 7: Faculty Assignment Persistence After Student Submissions ---');
  try {
    // Verify assignment document was NOT modified, deleted, or overwritten by student uploads
    const assignmentDoc = await mockDb.collection('assignments').doc(testAssignmentId).get();
    assert.ok(assignmentDoc.exists, 'Assignment record remains present in database');
    const asgData = assignmentDoc.data();
    assert.strictEqual(asgData.id, testAssignmentId, 'Assignment ID unchanged');
    assert.strictEqual(asgData.teacherUid, 'teacher_sarah', 'Teacher UID remains Prof. Sarah');
    assert.strictEqual(asgData.driveFileId, 'drive_file_teacher_asg_1', 'Teacher Drive file ID intact');

    // Retrieve teacher's assignment list: assignment must still be returned
    const teacherAssignments = await googleDriveService.getAssignmentsForUser('teacher_sarah');
    const foundAsg = teacherAssignments.find(a => a.id === testAssignmentId);
    assert.ok(foundAsg, 'Original assignment remains visible in faculty assignments list');
    assert.strictEqual(foundAsg.title, 'Data Structures Lab Assignment 1');
    pass('7.1: Student submission does NOT delete, overwrite, or hide the original faculty assignment');
  } catch (err) {
    fail('REQ 7', err);
  }

  // ---------------------------------------------------------------------------
  // TEST 8: Faculty assignment lists contain only real backend data, not hardcoded demo records
  // ---------------------------------------------------------------------------
  console.log('\n--- REQ 8: Elimination of Hardcoded Fake Assignments in Production ---');
  try {
    const assignmentsList = await googleDriveService.getAssignmentsForUser('teacher_sarah');
    // None of the records should have fake ids like a-seed-i or local-
    const fakeMatches = assignmentsList.filter(a => a.id && a.id.startsWith('a-') && a.id.includes('-assignments-'));
    assert.strictEqual(fakeMatches.length, 0, 'Zero hardcoded demo assignments in backend listing');
    assert.ok(assignmentsList.every(a => a.id && a.createdAt), 'All assignments are real Firestore records with createdAt');
    pass('8.1: Faculty assignment listing returns strictly real Firestore records without fake generators');
  } catch (err) {
    fail('REQ 8', err);
  }

  // ---------------------------------------------------------------------------
  // TEST 9: Section student lists contain only real, correctly scoped student profiles
  // ---------------------------------------------------------------------------
  console.log('\n--- REQ 9: Real Scoped Student Directory Retrieval ---');
  try {
    const rosterRes = await googleDriveService.getStudentsForSection({
      department: 'Computer Science',
      year: '2nd Year',
      section: 'Section A',
      institution: 'UEMK',
      requestingUserId: 'teacher_sarah'
    });

    assert.strictEqual(rosterRes.success, true);
    assert.strictEqual(rosterRes.totalStudents, 2, 'Should only find Alice and Bob in Computer Science 2nd Year Sec A');
    
    const rosterNames = rosterRes.students.map(s => s.name);
    assert.ok(rosterNames.includes('Alice Roy'), 'Alice Roy is present');
    assert.ok(rosterNames.includes('Bob Mukherjee'), 'Bob Mukherjee is present');
    assert.ok(!rosterNames.includes('Charlie Brown'), 'Charlie (ECE, 3rd Year, Sec B) must be excluded');
    assert.ok(!rosterNames.includes('Inactive Student'), 'Inactive student must be excluded');
    assert.ok(!rosterNames.includes('Prof. Sarah Jenkins'), 'Faculty accounts must be excluded');

    pass('9.1: Section student list returns only active students matching department, year, and section');

    // Students cannot enumerate section rosters
    let studentRosterBlocked = false;
    try {
      await googleDriveService.getStudentsForSection({
        department: 'Computer Science',
        year: '2nd Year',
        section: 'Section A',
        requestingUserId: 'student_alice'
      });
    } catch (err) {
      studentRosterBlocked = true;
      assert.strictEqual(err.statusCode, 403);
      assert.strictEqual(err.code, 'FORBIDDEN_ROLE');
    }
    assert.ok(studentRosterBlocked, 'Student blocked from section roster');
    pass('9.2: Students are strictly forbidden from enumerating section rosters (403)');
  } catch (err) {
    fail('REQ 9', err);
  }

  // ---------------------------------------------------------------------------
  // TEST 10: Empty, loading, and error states work without mock-data fallbacks
  // ---------------------------------------------------------------------------
  console.log('\n--- REQ 10: Clean Empty and Error Handling Without Mock Fallbacks ---');
  try {
    // Query section with 0 students (Sarah is allocated to 3rd Year Section C, which has 0 enrolled students)
    const emptyRoster = await googleDriveService.getStudentsForSection({
      department: 'Computer Science',
      year: '3rd Year',
      section: 'Section C',
      institution: 'UEMK',
      requestingUserId: 'teacher_sarah'
    });
    assert.strictEqual(emptyRoster.totalStudents, 0);
    assert.deepStrictEqual(emptyRoster.students, []);
    pass('10.1: Empty class section returns totalStudents: 0 and empty array without fake fallbacks');

    // Create a new assignment with 0 submissions
    const emptyAsgId = 'asg_new_zero_subs';
    mockDb.store.assignments[emptyAsgId] = {
      id: emptyAsgId,
      teacherUid: 'teacher_sarah',
      department: 'Computer Science',
      year: '2nd Year',
      section: 'Section A',
      title: 'New Unsubmitted Assignment'
    };

    const emptySubmissions = await googleDriveService.getAssignmentSubmissions(emptyAsgId, 'teacher_sarah');
    assert.strictEqual(emptySubmissions.totalSubmissions, 0);
    assert.deepStrictEqual(emptySubmissions.submissions, []);
    pass('10.2: Assignment with 0 submissions returns totalSubmissions: 0 without synthetic mock entries');
  } catch (err) {
    fail('REQ 10', err);
  }

  // ---------------------------------------------------------------------------
  // TEST 11: Existing teacher assignment uploads and student PDF submissions continue to work
  // ---------------------------------------------------------------------------
  console.log('\n--- REQ 11: Existing Upload Workflows & Idempotency Preservation ---');
  try {
    // Teacher upload regression
    const teacherUploadRes = await googleDriveService.uploadAssignmentPdf({
      teacherUid: 'teacher_sarah',
      fileBuffer: Buffer.from('%PDF-1.4 OS Lab Assignment %%EOF'),
      originalFileName: 'OS_Lab_Assignment.pdf',
      fileSize: 40960,
      assignmentData: {
        department: 'Computer Science',
        year: '2nd Year',
        section: 'Section A',
        title: 'Operating Systems Scheduling Lab',
        description: 'Implement round robin scheduling algorithm in C',
        dueDate: '2026-11-30'
      },
      idempotencyKey: 'idem_sarah_os_lab_1'
    });

    assert.ok(teacherUploadRes.assignment, 'Assignment uploaded');
    assert.strictEqual(teacherUploadRes.assignment.title, 'Operating Systems Scheduling Lab');
    assert.strictEqual(teacherUploadRes.assignment.teacherUid, 'teacher_sarah');
    pass('11.1: Teacher assignment upload to Google Drive creates persistent record with idempotency');

    // Replay with identical key returns cached assignment (idempotent replay)
    const replayRes = await googleDriveService.uploadAssignmentPdf({
      teacherUid: 'teacher_sarah',
      fileBuffer: Buffer.from('%PDF-1.4 OS Lab Assignment %%EOF'),
      originalFileName: 'OS_Lab_Assignment.pdf',
      fileSize: 40960,
      assignmentData: {
        department: 'Computer Science',
        year: '2nd Year',
        section: 'Section A',
        title: 'Operating Systems Scheduling Lab',
        description: 'Implement round robin scheduling algorithm in C',
        dueDate: '2026-11-30'
      },
      idempotencyKey: 'idem_sarah_os_lab_1'
    });
    assert.strictEqual(replayRes.isReplay, true, 'Should detect idempotent replay');
    pass('11.2: Idempotent replay protection for teacher uploads remains fully operational');
  } catch (err) {
    fail('REQ 11', err);
  }

  // Restore original DB
  googleDriveService.getDb = originalGetDb;

  console.log('\n======================================================');
  console.log(` RESULTS: ${passedTests} passed, ${failedTests} failed`);
  console.log('======================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runTestSuite().catch(err => {
  console.error('Test runner fatal error:', err);
  process.exit(1);
});
