import assert from 'node:assert';
import crypto from 'node:crypto';

// Configure test environment
process.env.TEST_MODE = 'true';
process.env.NODE_ENV = 'test';
process.env.TOKEN_ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');

import { subjectService, formatSubjectFolderName } from '../server/services/subjectService.js';
import { googleDriveService } from '../server/services/googleDriveService.js';
import { encrypt } from '../server/services/encryptionService.js';

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
console.log(' SANGAM PHASE A — DRIVE FOLDER PROVISIONING TEST SUITE');
console.log(' Backend Drive Folder Management & Subject Folder Sync');
console.log('======================================================\n');

// -----------------------------------------------------------------------------
// High-Fidelity Mock Firestore
// -----------------------------------------------------------------------------
class MockFirestore {
  constructor() {
    this.store = {
      users: {},
      subjects: {},
      teacher_allocations: {},
      teacher_subject_assignments: {},
      faculty_subject_folders: {},
      faculty_storage_integrations: {}
    };
  }

  collection(name) {
    if (!this.store[name]) {
      this.store[name] = {};
    }
    const collStore = this.store[name];

    const createQueryObj = (predicates = []) => ({
      where: (field, op, val) => createQueryObj([...predicates, { field, op, val }]),
      doc: (id) => ({
        id,
        get: async () => {
          const data = collStore[id];
          return {
            exists: Boolean(data),
            id,
            data: () => (data ? JSON.parse(JSON.stringify(data)) : undefined)
          };
        },
        set: async (data, options) => {
          if (options && options.merge && collStore[id]) {
            collStore[id] = { ...collStore[id], ...JSON.parse(JSON.stringify(data)) };
          } else {
            collStore[id] = JSON.parse(JSON.stringify(data));
          }
        },
        delete: async () => {
          delete collStore[id];
        }
      }),
      get: async () => {
        let matching = Object.entries(collStore).map(([id, d]) => ({
          exists: true,
          id,
          data: () => JSON.parse(JSON.stringify(d))
        }));

        for (const { field, op, val } of predicates) {
          if (op === '==') {
            matching = matching.filter(item => item.data()[field] === val);
          }
        }

        return {
          empty: matching.length === 0,
          size: matching.length,
          docs: matching,
          forEach: (cb) => matching.forEach(cb)
        };
      }
    });

    return createQueryObj();
  }
}

// -----------------------------------------------------------------------------
// High-Fidelity Mock Google Drive API
// -----------------------------------------------------------------------------
class MockDriveApi {
  constructor() {
    this.folders = new Map();
    this.files = new Map();
    this.createdFoldersCount = 0;
    this.renamedCount = 0;

    // Seed root coursework folder
    this.folders.set('folder_root_turing', {
      id: 'folder_root_turing',
      name: 'Sangam Coursework',
      parents: ['root'],
      trashed: false
    });
  }

  async verifyFolder(folderId, accessToken) {
    const f = this.folders.get(folderId);
    if (!f || f.trashed) {
      return { exists: false };
    }
    return { exists: true, name: f.name };
  }

  async createFolder(folderName, accessToken) {
    return this.createSubfolder('root', folderName, accessToken);
  }

  async createSubfolder(parentFolderId, folderName, accessToken, description = '') {
    this.createdFoldersCount++;
    const folderId = `drive_folder_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const record = {
      id: folderId,
      name: folderName,
      parents: [parentFolderId],
      trashed: false,
      description
    };
    this.folders.set(folderId, record);
    return {
      id: folderId,
      name: folderName,
      parents: [parentFolderId]
    };
  }

  async findFolderByName(parentFolderId, folderName, accessToken) {
    for (const folder of this.folders.values()) {
      if (
        folder.parents.includes(parentFolderId) &&
        folder.name === folderName &&
        !folder.trashed
      ) {
        return {
          id: folder.id,
          name: folder.name,
          exists: true
        };
      }
    }
    return null;
  }

  async getFileMetadata(fileId, accessToken) {
    const folder = this.folders.get(fileId);
    if (folder) {
      return {
        id: folder.id,
        name: folder.name,
        mimeType: 'application/vnd.google-apps.folder',
        size: 0,
        trashed: folder.trashed,
        exists: !folder.trashed,
        parents: folder.parents,
        createdTime: new Date().toISOString(),
        modifiedTime: new Date().toISOString()
      };
    }
    const file = this.files.get(fileId);
    if (file) {
      return {
        id: file.id,
        name: file.name,
        mimeType: file.mimeType || 'application/pdf',
        size: file.size || 1024,
        trashed: file.trashed,
        exists: !file.trashed,
        parents: file.parents,
        createdTime: new Date().toISOString(),
        modifiedTime: new Date().toISOString()
      };
    }
    return null;
  }

  async listFilesInFolder(folderId, accessToken) {
    const result = [];
    for (const file of this.files.values()) {
      if (file.parents.includes(folderId) && !file.trashed) {
        result.push({
          id: file.id,
          name: file.name,
          mimeType: file.mimeType || 'application/octet-stream',
          size: file.size || 0,
          createdTime: new Date().toISOString(),
          modifiedTime: new Date().toISOString()
        });
      }
    }
    return result;
  }

  async updateFileName(fileId, newName, accessToken) {
    this.renamedCount++;
    if (this.folders.has(fileId)) {
      const f = this.folders.get(fileId);
      f.name = newName;
      return { id: fileId, name: newName };
    }
    if (this.files.has(fileId)) {
      const f = this.files.get(fileId);
      f.name = newName;
      return { id: fileId, name: newName };
    }
    throw new Error(`File or folder '${fileId}' not found in mock Drive.`);
  }
}

// -----------------------------------------------------------------------------
// Test Setup & Fixtures
// -----------------------------------------------------------------------------
const mockDb = new MockFirestore();
const mockDrive = new MockDriveApi();

subjectService.setTestDb(mockDb);
googleDriveService.setTestDb(mockDb);
googleDriveService.setCustomDriveApi(mockDrive);

const TEST_KEY = process.env.TOKEN_ENCRYPTION_KEY;

// Users
mockDb.store.users['director_curie'] = {
  uid: 'director_curie',
  name: 'Director Curie',
  email: 'curie@uem.edu',
  role: 'director',
  institution: 'UEMK',
  status: 'active'
};

mockDb.store.users['teacher_turing'] = {
  uid: 'teacher_turing',
  name: 'Alan Turing',
  email: 'turing@faculty.edu',
  role: 'faculty',
  institution: 'UEMK',
  department: 'Computer Science',
  year: '2nd Year',
  status: 'active'
};

mockDb.store.users['teacher_lovelace'] = {
  uid: 'teacher_lovelace',
  name: 'Ada Lovelace',
  email: 'lovelace@faculty.edu',
  role: 'faculty',
  institution: 'UEMK',
  department: 'Computer Science',
  year: '2nd Year',
  status: 'active'
};

// Turing's Drive integration (connected)
const encAccess = encrypt('mock_access_token_turing', TEST_KEY);
const encRefresh = encrypt('mock_refresh_token_turing', TEST_KEY);

mockDb.store.faculty_storage_integrations['teacher_turing'] = {
  teacherUid: 'teacher_turing',
  status: 'connected',
  rootFolderId: 'folder_root_turing',
  rootFolderName: 'Sangam Coursework',
  courseworkFolderId: 'folder_root_turing',
  courseworkFolderName: 'Sangam Coursework',
  encryptedAccessToken: encAccess.encryptedData,
  accessTokenIv: encAccess.iv,
  accessTokenAuthTag: encAccess.authTag,
  encryptedRefreshToken: encRefresh.encryptedData,
  refreshTokenIv: encRefresh.iv,
  refreshTokenAuthTag: encRefresh.authTag,
  tokenExpiresAt: Date.now() + 3600 * 1000,
  updatedAt: new Date().toISOString()
};

// Teacher Allocations in Academic Spaces
mockDb.store.teacher_allocations['alloc_turing_cs_2nd'] = {
  teacherUid: 'teacher_turing',
  institution: 'UEMK',
  department: 'Computer Science',
  year: '2nd Year',
  section: null,
  authorized: true
};

mockDb.store.teacher_allocations['alloc_lovelace_cs_2nd'] = {
  teacherUid: 'teacher_lovelace',
  institution: 'UEMK',
  department: 'Computer Science',
  year: '2nd Year',
  section: null,
  authorized: true
};

// Subjects
mockDb.store.subjects['sub_algorithms'] = {
  id: 'sub_algorithms',
  name: 'Data Structures & Algorithms',
  code: 'CS201',
  department: 'Computer Science',
  year: '2nd Year',
  institution: 'UEMK',
  createdBy: 'director_curie'
};

mockDb.store.subjects['sub_seminar'] = {
  id: 'sub_seminar',
  name: 'Technical Seminar',
  code: '',
  department: 'Computer Science',
  year: '2nd Year',
  institution: 'UEMK',
  createdBy: 'director_curie'
};

mockDb.store.subjects['sub_databases'] = {
  id: 'sub_databases',
  name: 'Database Management Systems',
  code: 'CS202',
  department: 'Computer Science',
  year: '2nd Year',
  institution: 'UEMK',
  createdBy: 'director_curie'
};

// -----------------------------------------------------------------------------
// TEST RUNNER
// -----------------------------------------------------------------------------
async function executeTests() {
  console.log('--- TEST SECTION 1: Folder Naming Convention ---');
  runTest('1.1: Folder name formats as [CODE] Name when code is provided', () => {
    const formatted = formatSubjectFolderName({ name: 'Data Structures & Algorithms', code: 'CS201' });
    assert.strictEqual(formatted, '[CS201] Data Structures & Algorithms');
  });

  runTest('1.2: Folder name omits prefix when code is empty or missing', () => {
    assert.strictEqual(formatSubjectFolderName({ name: 'Technical Seminar', code: '' }), 'Technical Seminar');
    assert.strictEqual(formatSubjectFolderName({ name: 'Technical Seminar', code: null }), 'Technical Seminar');
    assert.strictEqual(formatSubjectFolderName({ name: 'Technical Seminar' }), 'Technical Seminar');
  });

  console.log('\n--- TEST SECTION 2: Initial Provisioning & Exact Creation ---');
  await runAsyncTest('2.1: Director assigning connected teacher provisions Drive folder exactly once', async () => {
    const initialCreateCount = mockDrive.createdFoldersCount;

    const res = await subjectService.assignTeacherToSubject({
      callerUid: 'director_curie',
      teacherUid: 'teacher_turing',
      subjectId: 'sub_algorithms'
    });

    assert.strictEqual(res.isExisting, false);
    assert.strictEqual(res.assignment.driveFolderStatus, 'active');
    assert.ok(res.assignment.driveFolderId);
    assert.strictEqual(res.assignment.driveFolderName, '[CS201] Data Structures & Algorithms');

    // Verify stored mapping in faculty_subject_folders
    const mappingDoc = mockDb.store.faculty_subject_folders['teacher_turing_sub_algorithms'];
    assert.ok(mappingDoc, 'Mapping record must exist in faculty_subject_folders');
    assert.strictEqual(mappingDoc.status, 'active');
    assert.strictEqual(mappingDoc.driveFolderId, res.assignment.driveFolderId);
    assert.strictEqual(mappingDoc.driveFolderName, '[CS201] Data Structures & Algorithms');
    assert.strictEqual(mappingDoc.rootFolderId, 'folder_root_turing');

    // Exactly one folder was created in Drive
    assert.strictEqual(mockDrive.createdFoldersCount, initialCreateCount + 1);
  });

  console.log('\n--- TEST SECTION 3: Deduplication & Existing Folder Reuse ---');
  await runAsyncTest('3.1: Re-provisioning or re-assignment reuses existing mapped folder without duplicating', async () => {
    const countBefore = mockDrive.createdFoldersCount;

    // Call getOrCreateSubjectFolder directly
    const folderRes = await subjectService.getOrCreateSubjectFolder({
      teacherUid: 'teacher_turing',
      subjectId: 'sub_algorithms',
      encryptionKey: TEST_KEY
    });

    assert.strictEqual(folderRes.status, 'active');
    assert.strictEqual(folderRes.isExisting, true);
    assert.strictEqual(folderRes.driveFolderName, '[CS201] Data Structures & Algorithms');

    // No new folder was created
    assert.strictEqual(mockDrive.createdFoldersCount, countBefore);
  });

  await runAsyncTest('3.2: Existing unmapped Drive folder is discovered and mapped without creating duplicate', async () => {
    const countBefore = mockDrive.createdFoldersCount;

    // Simulate an existing folder in Turing's root coursework folder created outside Sangam
    const preExistingFolderId = 'folder_existing_dbms_123';
    mockDrive.folders.set(preExistingFolderId, {
      id: preExistingFolderId,
      name: '[CS202] Database Management Systems',
      parents: ['folder_root_turing'],
      trashed: false
    });

    // Verify no mapping exists yet
    assert.strictEqual(mockDb.store.faculty_subject_folders['teacher_turing_sub_databases'], undefined);

    // Assign Turing to Database Management Systems
    const assignRes = await subjectService.assignTeacherToSubject({
      callerUid: 'director_curie',
      teacherUid: 'teacher_turing',
      subjectId: 'sub_databases'
    });

    assert.strictEqual(assignRes.assignment.driveFolderStatus, 'active');
    assert.strictEqual(assignRes.assignment.driveFolderId, preExistingFolderId);

    // Check that mapping points to preExistingFolderId
    const mappingDoc = mockDb.store.faculty_subject_folders['teacher_turing_sub_databases'];
    assert.ok(mappingDoc);
    assert.strictEqual(mappingDoc.driveFolderId, preExistingFolderId);

    // Crucial: No new folder was created in Drive!
    assert.strictEqual(mockDrive.createdFoldersCount, countBefore);
  });

  console.log('\n--- TEST SECTION 4: Concurrency & In-Flight Deduplication ---');
  await runAsyncTest('4.1: Concurrent provisioning calls deduplicate via subjectFolderLocks and create only one folder', async () => {
    // Subject without code: Technical Seminar
    const countBefore = mockDrive.createdFoldersCount;

    // Create active assignment first
    mockDb.store.teacher_subject_assignments['tsa_teacher_turing_sub_seminar_all'] = {
      id: 'tsa_teacher_turing_sub_seminar_all',
      teacherUid: 'teacher_turing',
      subjectId: 'sub_seminar',
      status: 'active'
    };

    // Run 5 simultaneous requests for the same teacher and subject
    const promises = Array.from({ length: 5 }, () =>
      subjectService.getOrCreateSubjectFolder({
        teacherUid: 'teacher_turing',
        subjectId: 'sub_seminar',
        encryptionKey: TEST_KEY
      })
    );

    const results = await Promise.all(promises);

    // All results must return the exact same driveFolderId
    const firstFolderId = results[0].driveFolderId;
    assert.ok(firstFolderId);
    for (const res of results) {
      assert.strictEqual(res.driveFolderId, firstFolderId);
      assert.strictEqual(res.status, 'active');
    }

    // Exactly 1 new folder was created in Drive
    assert.strictEqual(mockDrive.createdFoldersCount, countBefore + 1);
  });

  console.log('\n--- TEST SECTION 5: Deferred Provisioning for Disconnected Teachers ---');
  await runAsyncTest('5.1: Disconnected teacher assignment succeeds with deferred provisioning (Director not blocked)', async () => {
    const countBefore = mockDrive.createdFoldersCount;

    // Lovelace has NOT connected Google Drive
    const assignRes = await subjectService.assignTeacherToSubject({
      callerUid: 'director_curie',
      teacherUid: 'teacher_lovelace',
      subjectId: 'sub_algorithms'
    });

    // Assignment succeeds (201 / active)
    assert.strictEqual(assignRes.isExisting, false);
    assert.strictEqual(assignRes.assignment.status, 'active');
    assert.strictEqual(assignRes.assignment.driveFolderStatus, 'deferred');
    assert.strictEqual(assignRes.assignment.driveFolderReason, 'DRIVE_NOT_CONNECTED');
    assert.strictEqual(assignRes.assignment.driveFolderId, null);

    // No folder created in Drive
    assert.strictEqual(mockDrive.createdFoldersCount, countBefore);
  });

  console.log('\n--- TEST SECTION 6: Inactive & Revoked Assignment Safety ---');
  await runAsyncTest('6.1: Subject folder is NOT provisioned for unassigned or revoked subjects', async () => {
    // Turing is not assigned to a non-existent or unassigned subject
    let rejected = false;
    try {
      await subjectService.getOrCreateSubjectFolder({
        teacherUid: 'teacher_lovelace',
        subjectId: 'sub_databases'
      });
    } catch (err) {
      rejected = true;
      assert.strictEqual(err.code, 'ASSIGNMENT_NOT_ACTIVE');
    }
    assert.strictEqual(rejected, true, 'Must reject provisioning for unassigned teacher');
  });

  console.log('\n--- TEST SECTION 7: Subject Renaming Preserves Existing Folder ID ---');
  await runAsyncTest('7.1: Updating subject name/code renames Drive folder without creating duplicate folder ID', async () => {
    const countBefore = mockDrive.createdFoldersCount;
    const renamesBefore = mockDrive.renamedCount;

    const existingMapping = mockDb.store.faculty_subject_folders['teacher_turing_sub_algorithms'];
    const originalFolderId = existingMapping.driveFolderId;
    assert.ok(originalFolderId);

    // Director renames CS201 to CS201-ADV "Advanced Data Structures & Algorithms"
    await subjectService.updateSubject({
      callerUid: 'director_curie',
      subjectId: 'sub_algorithms',
      name: 'Advanced Data Structures & Algorithms',
      code: 'CS201-ADV'
    });

    // Check mapping doc: driveFolderId is PRESERVED!
    const updatedMapping = mockDb.store.faculty_subject_folders['teacher_turing_sub_algorithms'];
    assert.strictEqual(updatedMapping.driveFolderId, originalFolderId);
    assert.strictEqual(updatedMapping.driveFolderName, '[CS201-ADV] Advanced Data Structures & Algorithms');

    // Drive folder name was updated in Drive API
    const driveFolder = mockDrive.folders.get(originalFolderId);
    assert.strictEqual(driveFolder.name, '[CS201-ADV] Advanced Data Structures & Algorithms');

    // No new folder was created in Drive
    assert.strictEqual(mockDrive.createdFoldersCount, countBefore);
    assert.ok(mockDrive.renamedCount > renamesBefore);
  });

  console.log('\n--- TEST SECTION 8: Assignment Revocation Safety ---');
  await runAsyncTest('8.1: Revoking assignment marks mapping revoked but NEVER deletes Drive folders or files', async () => {
    const existingMapping = mockDb.store.faculty_subject_folders['teacher_turing_sub_algorithms'];
    const folderId = existingMapping.driveFolderId;

    // Place a mock file in Turing's subject folder
    mockDrive.files.set('file_syllabus_pdf', {
      id: 'file_syllabus_pdf',
      name: 'Syllabus.pdf',
      parents: [folderId],
      trashed: false,
      size: 4096,
      mimeType: 'application/pdf'
    });

    const assignmentId = 'tsa_teacher_turing_sub_algorithms_all';
    const revokeRes = await subjectService.deleteTeacherSubjectAssignment({
      callerUid: 'director_curie',
      assignmentId
    });

    assert.strictEqual(revokeRes.success, true);

    // Assignment doc is removed from active assignments
    assert.strictEqual(mockDb.store.teacher_subject_assignments[assignmentId], undefined);

    // Mapping doc is marked 'revoked'
    const revokedMapping = mockDb.store.faculty_subject_folders['teacher_turing_sub_algorithms'];
    assert.strictEqual(revokedMapping.status, 'revoked');

    // CRITICAL: Google Drive folder STILL EXISTS and is NOT trashed
    const driveFolder = mockDrive.folders.get(folderId);
    assert.ok(driveFolder, 'Folder must still exist in Drive');
    assert.strictEqual(driveFolder.trashed, false);

    // CRITICAL: Google Drive files in the folder STILL EXIST and are NOT trashed
    const driveFile = mockDrive.files.get('file_syllabus_pdf');
    assert.ok(driveFile, 'File must still exist in Drive');
    assert.strictEqual(driveFile.trashed, false);
  });

  await runAsyncTest('8.2: Stored folder ID does NOT grant authorization after assignment revocation', async () => {
    // verifyTeacherSubjectAuthorization must return false
    const isAuthorized = await subjectService.verifyTeacherSubjectAuthorization('teacher_turing', 'sub_algorithms');
    assert.strictEqual(isAuthorized, false, 'Revoked teacher must not be authorized');

    // Attempting to provision or fetch folder for revoked subject fails with ASSIGNMENT_NOT_ACTIVE
    let failedClosed = false;
    try {
      await subjectService.getOrCreateSubjectFolder({
        teacherUid: 'teacher_turing',
        subjectId: 'sub_algorithms',
        encryptionKey: TEST_KEY
      });
    } catch (err) {
      failedClosed = true;
      assert.strictEqual(err.code, 'ASSIGNMENT_NOT_ACTIVE');
    }
    assert.strictEqual(failedClosed, true, 'Revoked assignment must fail closed');
  });

  console.log('\n--- TEST SECTION 9: Drive File Listing & Metadata Verification ---');
  await runAsyncTest('9.1: listFilesInFolder returns only active files excluding trashed files', async () => {
    const testFolderId = 'folder_listing_test';
    mockDrive.folders.set(testFolderId, { id: testFolderId, name: 'Listing Test', parents: ['root'], trashed: false });

    // 1 active file, 1 trashed file
    mockDrive.files.set('active_file_1', {
      id: 'active_file_1',
      name: 'Lecture1.pdf',
      parents: [testFolderId],
      trashed: false,
      size: 2048,
      mimeType: 'application/pdf'
    });
    mockDrive.files.set('trashed_file_2', {
      id: 'trashed_file_2',
      name: 'OldLecture.pdf',
      parents: [testFolderId],
      trashed: true,
      size: 1024,
      mimeType: 'application/pdf'
    });

    const files = await googleDriveService.listFilesInFolder(testFolderId, 'mock_token');
    assert.strictEqual(files.length, 1);
    assert.strictEqual(files[0].id, 'active_file_1');
    assert.strictEqual(files[0].name, 'Lecture1.pdf');
  });

  await runAsyncTest('9.2: getFileMetadata returns valid metadata and reflects trashed status', async () => {
    const metaActive = await googleDriveService.getFileMetadata('active_file_1', 'mock_token');
    assert.ok(metaActive);
    assert.strictEqual(metaActive.id, 'active_file_1');
    assert.strictEqual(metaActive.trashed, false);
    assert.strictEqual(metaActive.exists, true);

    const metaTrashed = await googleDriveService.getFileMetadata('trashed_file_2', 'mock_token');
    assert.ok(metaTrashed);
    assert.strictEqual(metaTrashed.id, 'trashed_file_2');
    assert.strictEqual(metaTrashed.trashed, true);
    assert.strictEqual(metaTrashed.exists, false);
  });

  console.log('\n======================================================');
  console.log(` SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

executeTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
