import assert from 'node:assert';
import crypto from 'node:crypto';
import http from 'node:http';

// Configure test environment
process.env.TEST_MODE = 'true';
process.env.NODE_ENV = 'test';
process.env.TOKEN_ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');

import { app } from '../server.js';
import { subjectService } from '../server/services/subjectService.js';
import { studyMaterialService } from '../server/services/studyMaterialService.js';
import { googleDriveService } from '../server/services/googleDriveService.js';
import { setCustomAuthService } from '../server/middleware/authMiddleware.js';
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
console.log(' SANGAM PHASE F — STUDY MATERIAL HISTORY & ARCHIVE');
console.log(' Preserving Lifecycle History & Single Source of Truth');
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
      study_materials: {},
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
        update: async (data) => {
          if (collStore[id]) {
            collStore[id] = { ...collStore[id], ...JSON.parse(JSON.stringify(data)) };
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
          data: () => JSON.parse(JSON.stringify(d)),
          ref: {
            id,
            set: async (data, options) => {
              if (options && options.merge && collStore[id]) {
                collStore[id] = { ...collStore[id], ...JSON.parse(JSON.stringify(data)) };
              } else {
                collStore[id] = JSON.parse(JSON.stringify(data));
              }
            },
            update: async (data) => {
              if (collStore[id]) {
                collStore[id] = { ...collStore[id], ...JSON.parse(JSON.stringify(data)) };
              }
            },
            delete: async () => {
              delete collStore[id];
            }
          }
        }));

        for (const { field, op, val } of predicates) {
          if (op === '==') {
            matching = matching.filter((item) => item.data()[field] === val);
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

  batch() {
    const operations = [];
    return {
      update: (ref, data) => {
        operations.push(() => (ref.update ? ref.update(data) : ref.set(data, { merge: true })));
      },
      set: (ref, data, opts) => {
        operations.push(() => ref.set(data, opts));
      },
      delete: (ref) => {
        operations.push(() => ref.delete());
      },
      commit: async () => {
        for (const op of operations) {
          await op();
        }
      }
    };
  }
}

const mockDb = new MockFirestore();
subjectService.setTestDb(mockDb);
studyMaterialService.setTestDb(mockDb);
googleDriveService.setTestDb(mockDb);

// -----------------------------------------------------------------------------
// Controllable Mock Google Drive API
// -----------------------------------------------------------------------------
class MockDriveApi {
  constructor() {
    this.folders = new Map();
    this.files = new Map();
    this.simulatedOutage = false;
    this.simulatedAuthRevoked = false;

    // Seed root coursework folder
    this.folders.set('folder_root_sharma', {
      id: 'folder_root_sharma',
      name: 'Sangam Coursework',
      parents: ['root'],
      trashed: false
    });
  }

  async verifyFolder(folderId, accessToken) {
    if (this.simulatedAuthRevoked) {
      const err = new Error('Google authorization has been revoked.');
      err.statusCode = 401;
      err.code = 'GOOGLE_AUTH_REVOKED';
      throw err;
    }
    const f = this.folders.get(folderId);
    if (!f || f.trashed) return { exists: false };
    return { exists: true, name: f.name };
  }

  async createFolder(folderName, accessToken) {
    return this.createSubfolder('root', folderName, accessToken);
  }

  async createSubfolder(parentFolderId, folderName, accessToken, description = '') {
    const folderId = `drive_folder_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const record = {
      id: folderId,
      name: folderName,
      parents: [parentFolderId],
      trashed: false,
      description
    };
    this.folders.set(folderId, record);
    return record;
  }

  async findFolderByName(parentFolderId, folderName, accessToken) {
    for (const folder of this.folders.values()) {
      if (folder.parents.includes(parentFolderId) && folder.name === folderName && !folder.trashed) {
        return { id: folder.id, name: folder.name, exists: true };
      }
    }
    return null;
  }

  async uploadFile(folderId, fileName, mimeType, fileBuffer, accessToken, metadataExtra = {}) {
    if (this.simulatedAuthRevoked) {
      const err = new Error('Google authorization has been revoked.');
      err.statusCode = 401;
      err.code = 'GOOGLE_AUTH_REVOKED';
      throw err;
    }
    const fileId = `drive_file_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const record = {
      id: fileId,
      name: fileName,
      mimeType: mimeType || 'application/pdf',
      size: fileBuffer.length,
      parents: [folderId],
      folderId,
      buffer: fileBuffer,
      trashed: false,
      createdTime: new Date().toISOString(),
      modifiedTime: new Date().toISOString(),
      ...metadataExtra
    };
    this.files.set(fileId, record);
    return {
      id: fileId,
      name: fileName,
      mimeType: record.mimeType,
      size: record.size,
      folderId
    };
  }

  async getFileMetadata(fileId, accessToken) {
    if (this.simulatedAuthRevoked) {
      const err = new Error('Google authorization has been revoked or expired.');
      err.statusCode = 401;
      err.code = 'GOOGLE_AUTH_REVOKED';
      throw err;
    }
    if (this.simulatedOutage) {
      const err = new Error('Google Drive service is temporarily unavailable (503 Service Unavailable).');
      err.statusCode = 503;
      err.code = 'DRIVE_TEMPORARY_ERROR';
      err.isTemporary = true;
      throw err;
    }

    const folder = this.folders.get(fileId);
    if (folder) {
      return {
        id: folder.id,
        name: folder.name,
        mimeType: 'application/vnd.google-apps.folder',
        size: 0,
        trashed: folder.trashed,
        exists: !folder.trashed,
        parents: folder.parents
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
        createdTime: file.createdTime,
        modifiedTime: file.modifiedTime
      };
    }
    return null;
  }

  async listFilesInFolder(folderId, accessToken) {
    if (this.simulatedAuthRevoked) {
      const err = new Error('Google authorization has been revoked.');
      err.statusCode = 401;
      err.code = 'GOOGLE_AUTH_REVOKED';
      throw err;
    }
    if (this.simulatedOutage) {
      const err = new Error('Google Drive service is temporarily unavailable (503 Service Unavailable).');
      err.statusCode = 503;
      err.code = 'DRIVE_TEMPORARY_ERROR';
      err.isTemporary = true;
      throw err;
    }

    const list = [];
    for (const file of this.files.values()) {
      if (file.parents.includes(folderId) && !file.trashed) {
        list.push({
          id: file.id,
          name: file.name,
          mimeType: file.mimeType,
          size: file.size,
          createdTime: file.createdTime,
          modifiedTime: file.modifiedTime
        });
      }
    }
    return list;
  }

  async downloadFileStream(fileId, accessToken) {
    if (this.simulatedAuthRevoked) {
      const err = new Error('Google authorization has been revoked or expired.');
      err.statusCode = 401;
      err.code = 'GOOGLE_AUTH_REVOKED';
      throw err;
    }
    if (this.simulatedOutage) {
      const err = new Error('Google Drive temporary error.');
      err.statusCode = 503;
      err.code = 'DRIVE_TEMPORARY_ERROR';
      err.isTemporary = true;
      throw err;
    }

    const file = this.files.get(fileId);
    if (!file || file.trashed) {
      const err = new Error(file && file.trashed ? 'File is in Google Drive trash.' : 'File not found on Google Drive.');
      err.statusCode = file && file.trashed ? 410 : 404;
      err.code = file && file.trashed ? 'FILE_TRASHED' : 'FILE_NOT_FOUND';
      throw err;
    }

    const { Readable } = await import('node:stream');
    return Readable.from([file.buffer || Buffer.from('%PDF-1.4 Mock Stream Data')]);
  }
}

const mockDriveApi = new MockDriveApi();
googleDriveService.customDriveApi = mockDriveApi;
googleDriveService.setTestDriveApi(mockDriveApi);

// -----------------------------------------------------------------------------
// Test Users Setup
// -----------------------------------------------------------------------------
const TEACHER_UID = 'teacher_history_prof';
const TEACHER_OTHER_UID = 'teacher_history_other';
const STUDENT_A_UID = 'student_history_secA';
const STUDENT_B_UID = 'student_history_secB';
const DIRECTOR_UID = 'director_history_dept';

const testUsers = {
  [TEACHER_UID]: {
    uid: TEACHER_UID,
    email: 'sharma@uem.edu.in',
    name: 'Prof. History Sharma',
    role: 'Faculty',
    department: 'Computer Science',
    institution: 'UEMK'
  },
  [TEACHER_OTHER_UID]: {
    uid: TEACHER_OTHER_UID,
    email: 'other@uem.edu.in',
    name: 'Prof. Other Faculty',
    role: 'Faculty',
    department: 'Computer Science',
    institution: 'UEMK'
  },
  [STUDENT_A_UID]: {
    uid: STUDENT_A_UID,
    email: 'studentA@uem.edu.in',
    name: 'Alice Student (Sec A)',
    role: 'Student',
    department: 'Computer Science',
    year: '3rd Year',
    section: 'A',
    institution: 'UEMK'
  },
  [STUDENT_B_UID]: {
    uid: STUDENT_B_UID,
    email: 'studentB@uem.edu.in',
    name: 'Bob Student (Sec B)',
    role: 'Student',
    department: 'Computer Science',
    year: '3rd Year',
    section: 'B',
    institution: 'UEMK'
  },
  [DIRECTOR_UID]: {
    uid: DIRECTOR_UID,
    email: 'director@uem.edu.in',
    name: 'Dr. Director CS',
    role: 'Director',
    department: 'Computer Science',
    institution: 'UEMK'
  }
};

for (const [uid, profile] of Object.entries(testUsers)) {
  mockDb.store.users[uid] = profile;
}

// Teacher Google Drive Integration (AES-256-GCM encrypted mock token)
const encKey = process.env.TOKEN_ENCRYPTION_KEY;
const encAccess = encrypt('mock_access_token_sharma', encKey);
const encRefresh = encrypt('mock_refresh_token_sharma', encKey);

mockDb.store.faculty_storage_integrations[TEACHER_UID] = {
  teacherUid: TEACHER_UID,
  teacherEmail: 'sharma@uem.edu.in',
  provider: 'google_drive',
  status: 'connected',
  rootFolderId: 'folder_root_sharma',
  rootFolderName: 'Sangam Coursework',
  courseworkFolderId: 'folder_root_sharma',
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

// Seed Subject: CS601 Operating Systems
const SUBJECT_ID = 'sub_cs601_history';
mockDb.store.subjects[SUBJECT_ID] = {
  id: SUBJECT_ID,
  code: 'CS601',
  name: 'Operating Systems',
  department: 'Computer Science',
  year: '3rd Year',
  institution: 'UEMK',
  status: 'active'
};

// Teacher Allocations for Section A and Section B
mockDb.store.teacher_allocations[`alloc_${TEACHER_UID}_csea`] = {
  teacherUid: TEACHER_UID,
  teacherEmail: 'sharma@uem.edu.in',
  institution: 'UEMK',
  department: 'Computer Science',
  year: '3rd Year',
  section: 'A',
  authorized: true
};

mockDb.store.teacher_allocations[`alloc_${TEACHER_UID}_cseb`] = {
  teacherUid: TEACHER_UID,
  teacherEmail: 'sharma@uem.edu.in',
  institution: 'UEMK',
  department: 'Computer Science',
  year: '3rd Year',
  section: 'B',
  authorized: true
};

// Teacher Subject Assignment
mockDb.store.teacher_subject_assignments[`assign_${TEACHER_UID}_${SUBJECT_ID}`] = {
  id: `assign_${TEACHER_UID}_${SUBJECT_ID}`,
  teacherUid: TEACHER_UID,
  subjectId: SUBJECT_ID,
  institution: 'UEMK',
  department: 'Computer Science',
  year: '3rd Year',
  scope: 'all',
  status: 'active',
  authorized: true
};

// Seed subject folder in Drive
const driveSubjectFolder = await mockDriveApi.createSubfolder(
  'folder_root_sharma',
  'CS601 - Operating Systems',
  'mock_token'
);

mockDb.store.subjects[SUBJECT_ID].driveFolderId = driveSubjectFolder.id;
mockDb.store.subjects[SUBJECT_ID].driveFolderName = driveSubjectFolder.name;

// Faculty Subject Folders Mapping
if (!mockDb.store.faculty_subject_folders) {
  mockDb.store.faculty_subject_folders = {};
}
mockDb.store.faculty_subject_folders[`${TEACHER_UID}_${SUBJECT_ID}`] = {
  id: `${TEACHER_UID}_${SUBJECT_ID}`,
  teacherUid: TEACHER_UID,
  subjectId: SUBJECT_ID,
  driveFolderId: driveSubjectFolder.id,
  driveFolderName: driveSubjectFolder.name,
  status: 'active'
};

// -----------------------------------------------------------------------------
// Auth Service Mock for Express Tests
// -----------------------------------------------------------------------------
setCustomAuthService({
  verifyIdToken: async (token) => {
    const user = testUsers[token];
    if (!user) {
      const err = new Error('Invalid test ID token');
      err.code = 'auth/invalid-id-token';
      throw err;
    }
    return {
      uid: user.uid,
      email: user.email,
      role: user.role
    };
  }
});

// -----------------------------------------------------------------------------
// Test HTTP Server Helper
// -----------------------------------------------------------------------------
let server;
let serverPort;

function startServer() {
  return new Promise((resolve) => {
    server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      serverPort = server.address().port;
      resolve();
    });
  });
}

function stopServer() {
  return new Promise((resolve) => {
    if (server) {
      server.close(() => resolve());
    } else {
      resolve();
    }
  });
}

async function apiRequest({ method = 'GET', path, token, body = null }) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: serverPort,
        path,
        method,
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(payload
            ? {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload)
              }
            : {})
        }
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => {
          let data = null;
          try {
            data = JSON.parse(raw);
          } catch {
            data = raw;
          }
          resolve({ status: res.statusCode, headers: res.headers, body: data });
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// =============================================================================
// PHASE F SUITE: 11 Targeted Test Scenarios
// =============================================================================

await startServer();

try {
  // ---------------------------------------------------------------------------
  // SCENARIO 1: Publishing a Drive file preserves a historical record
  // ---------------------------------------------------------------------------
  await runAsyncTest('1. Publishing a Drive file preserves a historical record with lifecycleHistory', async () => {
    // 1. Upload a file into teacher's connected drive
    const driveFile1 = await mockDriveApi.uploadFile(
      driveSubjectFolder.id,
      'lecture_os_intro.pdf',
      'application/pdf',
      Buffer.from('%PDF-1.4 OS Intro Slides')
    );

    // 2. Publish the file for Section A
    const pubRes = await apiRequest({
      method: 'POST',
      path: '/api/study-materials/publish-from-drive',
      token: TEACHER_UID,
      body: {
        subjectId: SUBJECT_ID,
        driveFileId: driveFile1.id,
        title: 'Lecture 1: Introduction to OS',
        scope: 'section',
        section: 'A',
        category: 'Lecture Notes',
        description: 'Covers process concepts and memory layout.'
      }
    });

    assert.strictEqual(pubRes.status, 201, `Expected 201, got ${pubRes.status}`);
    const material = pubRes.body.material;
    assert.ok(material.id, 'Material must have an ID');
    assert.strictEqual(material.status, 'active');
    assert.strictEqual(material.isPublished, true);
    assert.ok(material.uploadedAt, 'Material must have uploadedAt');
    assert.ok(material.publishedAt, 'Material must have publishedAt');
    assert.ok(Array.isArray(material.lifecycleHistory), 'Material must have lifecycleHistory array');

    // Verify initial lifecycle events recorded: created + published
    const historyActions = material.lifecycleHistory.map((e) => e.action);
    assert.ok(historyActions.includes('created'), 'Lifecycle history should record creation');
    assert.ok(historyActions.includes('published'), 'Lifecycle history should record publication');

    // Query teacher history endpoint
    const historyRes = await apiRequest({
      method: 'GET',
      path: `/api/study-materials/history?subjectId=${SUBJECT_ID}&department=Computer+Science&year=3rd+Year&section=A`,
      token: TEACHER_UID
    });

    assert.strictEqual(historyRes.status, 200);
    assert.ok(Array.isArray(historyRes.body.history));
    const historyItem = historyRes.body.history.find((h) => h.id === material.id);
    assert.ok(historyItem, 'Published material must be present in history');
    assert.strictEqual(historyItem.isDownloadable, true);
    assert.strictEqual(historyItem.status, 'active');
    assert.strictEqual(historyItem.isPublished, true);
  });

  // ---------------------------------------------------------------------------
  // SCENARIO 2: Deleting or trashing the Drive file changes its availability
  //             status but retains its history record
  // ---------------------------------------------------------------------------
  await runAsyncTest('2. Deleting or trashing Drive file marks material unavailable but retains history record', async () => {
    // Upload and publish a document
    const driveFile2 = await mockDriveApi.uploadFile(
      driveSubjectFolder.id,
      'lecture_processes.pdf',
      'application/pdf',
      Buffer.from('%PDF-1.4 Processes and Threads')
    );

    const pubRes = await apiRequest({
      method: 'POST',
      path: '/api/study-materials/publish-from-drive',
      token: TEACHER_UID,
      body: {
        subjectId: SUBJECT_ID,
        driveFileId: driveFile2.id,
        title: 'Lecture 2: Processes & Threads',
        scope: 'section',
        section: 'A',
        category: 'Lecture Notes'
      }
    });

    const materialId = pubRes.body.material.id;
    const originalUploadedAt = pubRes.body.material.uploadedAt;
    const originalPublishedAt = pubRes.body.material.publishedAt;

    // Simulate deleting the file from Google Drive externally
    mockDriveApi.files.delete(driveFile2.id);

    // Call active materials endpoint (triggers reconcileStaleDrivePublications)
    const listRes = await apiRequest({
      method: 'GET',
      path: `/api/study-materials?department=Computer+Science&year=3rd+Year&section=A`,
      token: TEACHER_UID
    });

    assert.strictEqual(listRes.status, 200);
    // Deleted file must NOT be returned in active listing
    const inActive = listRes.body.materials.find((m) => m.id === materialId);
    assert.strictEqual(inActive, undefined, 'Deleted file must not be in active coursework materials');

    // Fetch history view: historical record MUST still exist
    const historyRes = await apiRequest({
      method: 'GET',
      path: `/api/study-materials/history?subjectId=${SUBJECT_ID}&department=Computer+Science&year=3rd+Year`,
      token: TEACHER_UID
    });

    assert.strictEqual(historyRes.status, 200);
    const archivedItem = historyRes.body.history.find((h) => h.id === materialId);
    assert.ok(archivedItem, 'Deleted file MUST remain preserved in faculty history archive');
    assert.strictEqual(archivedItem.status, 'unavailable');
    assert.strictEqual(archivedItem.availabilityStatus, 'deleted');
    assert.strictEqual(archivedItem.isDownloadable, false, 'Unavailable file must not be downloadable');
    assert.ok(archivedItem.unavailabilityDetectedAt, 'Must record unavailability detection timestamp');

    // Verify deletion audit event was appended to lifecycleHistory
    const deleteEvent = (archivedItem.lifecycleHistory || []).find((e) => e.action === 'deleted_from_drive');
    assert.ok(deleteEvent, 'lifecycleHistory must contain deleted_from_drive event');
  });

  // ---------------------------------------------------------------------------
  // SCENARIO 3: Repeated reconciliation does not create duplicate history events
  // ---------------------------------------------------------------------------
  await runAsyncTest('3. Repeated reconciliation does not create duplicate history events (idempotence)', async () => {
    // Upload and publish
    const driveFile3 = await mockDriveApi.uploadFile(
      driveSubjectFolder.id,
      'lecture_memory.pdf',
      'application/pdf',
      Buffer.from('%PDF-1.4 Memory Management')
    );

    const pubRes = await apiRequest({
      method: 'POST',
      path: '/api/study-materials/publish-from-drive',
      token: TEACHER_UID,
      body: {
        subjectId: SUBJECT_ID,
        driveFileId: driveFile3.id,
        title: 'Lecture 3: Memory Management',
        scope: 'section',
        section: 'A',
        category: 'Lecture Notes'
      }
    });

    const materialId = pubRes.body.material.id;

    // Simulate deleting in Drive
    mockDriveApi.files.delete(driveFile3.id);

    // Call history/listing 5 times in succession
    for (let i = 0; i < 5; i++) {
      await apiRequest({
        method: 'GET',
        path: `/api/study-materials?department=Computer+Science&year=3rd+Year&section=A`,
        token: TEACHER_UID
      });
      await apiRequest({
        method: 'GET',
        path: `/api/study-materials/history?subjectId=${SUBJECT_ID}&department=Computer+Science&year=3rd+Year`,
        token: TEACHER_UID
      });
    }

    // Inspect doc in mockDb
    const docData = mockDb.store.study_materials[materialId];
    assert.strictEqual(docData.status, 'unavailable');
    assert.strictEqual(docData.availabilityStatus, 'deleted');

    const deleteEvents = (docData.lifecycleHistory || []).filter((e) => e.action === 'deleted_from_drive');
    assert.strictEqual(
      deleteEvents.length,
      1,
      `Expected exactly 1 deleted_from_drive event after repeated reconciliation, got ${deleteEvents.length}`
    );
  });

  // ---------------------------------------------------------------------------
  // SCENARIO 4: Upload and publication timestamps remain unchanged during
  //             deletion reconciliation
  // ---------------------------------------------------------------------------
  await runAsyncTest('4. Upload and publication timestamps remain unchanged during deletion reconciliation', async () => {
    const driveFile4 = await mockDriveApi.uploadFile(
      driveSubjectFolder.id,
      'lecture_io.pdf',
      'application/pdf',
      Buffer.from('%PDF-1.4 I/O Systems')
    );

    const pubRes = await apiRequest({
      method: 'POST',
      path: '/api/study-materials/publish-from-drive',
      token: TEACHER_UID,
      body: {
        subjectId: SUBJECT_ID,
        driveFileId: driveFile4.id,
        title: 'Lecture 4: I/O Systems',
        scope: 'year',
        category: 'Lecture Notes'
      }
    });

    const originalUploadedAt = pubRes.body.material.uploadedAt;
    const originalPublishedAt = pubRes.body.material.publishedAt;
    const originalCreatedAt = pubRes.body.material.createdAt;

    assert.ok(originalUploadedAt, 'Must have original uploadedAt');
    assert.ok(originalPublishedAt, 'Must have original publishedAt');

    // Simulate file being moved to trash in Drive
    const driveRecord = mockDriveApi.files.get(driveFile4.id);
    driveRecord.trashed = true;

    // Trigger reconciliation
    await apiRequest({
      method: 'GET',
      path: `/api/study-materials?department=Computer+Science&year=3rd+Year`,
      token: TEACHER_UID
    });

    const docAfter = mockDb.store.study_materials[pubRes.body.material.id];
    assert.strictEqual(docAfter.status, 'unavailable');
    assert.strictEqual(docAfter.availabilityStatus, 'trashed');

    // Timestamps must remain identical
    assert.strictEqual(docAfter.uploadedAt, originalUploadedAt, 'uploadedAt must not change');
    assert.strictEqual(docAfter.publishedAt, originalPublishedAt, 'publishedAt must not change');
    assert.strictEqual(docAfter.createdAt, originalCreatedAt, 'createdAt must not change');
    assert.ok(docAfter.unavailabilityDetectedAt, 'Must set unavailabilityDetectedAt');
  });

  // ---------------------------------------------------------------------------
  // SCENARIO 5: Unpublishing retains publication history and disables student access
  // ---------------------------------------------------------------------------
  await runAsyncTest('5. Unpublishing retains publication history and disables student access', async () => {
    const driveFile5 = await mockDriveApi.uploadFile(
      driveSubjectFolder.id,
      'lab_assignment1.pdf',
      'application/pdf',
      Buffer.from('%PDF-1.4 Lab Assignment 1')
    );

    const pubRes = await apiRequest({
      method: 'POST',
      path: '/api/study-materials/publish-from-drive',
      token: TEACHER_UID,
      body: {
        subjectId: SUBJECT_ID,
        driveFileId: driveFile5.id,
        title: 'Lab 1: Shell Programming',
        scope: 'section',
        section: 'A',
        category: 'Assignments & Problem Sets'
      }
    });

    const materialId = pubRes.body.material.id;

    // Student A can initially see the published assignment
    const studentBefore = await apiRequest({
      method: 'GET',
      path: '/api/study-materials',
      token: STUDENT_A_UID
    });
    assert.ok(
      studentBefore.body.materials.some((m) => m.id === materialId),
      'Student A must initially see published material'
    );

    // Unpublish the material
    const unpubRes = await apiRequest({
      method: 'PATCH',
      path: `/api/study-materials/${materialId}/publish`,
      token: TEACHER_UID,
      body: { isPublished: false }
    });
    assert.strictEqual(unpubRes.status, 200);
    assert.strictEqual(unpubRes.body.material.isPublished, false);
    assert.strictEqual(unpubRes.body.material.status, 'unpublished');
    assert.ok(unpubRes.body.material.unpublishedAt, 'Must set unpublishedAt');

    // Verify unpublish event recorded in lifecycleHistory
    const unpubHistory = unpubRes.body.material.lifecycleHistory || [];
    assert.ok(
      unpubHistory.some((e) => e.action === 'unpublished'),
      'lifecycleHistory must record unpublished event'
    );

    // Student A can NO LONGER see the unpublished material in active materials
    const studentAfter = await apiRequest({
      method: 'GET',
      path: '/api/study-materials',
      token: STUDENT_A_UID
    });
    assert.strictEqual(
      studentAfter.body.materials.some((m) => m.id === materialId),
      false,
      'Student A must not see unpublished material in active materials'
    );

    // Faculty history view shows it clearly as unpublished
    const facultyHistory = await apiRequest({
      method: 'GET',
      path: `/api/study-materials/history?subjectId=${SUBJECT_ID}&department=Computer+Science&year=3rd+Year`,
      token: TEACHER_UID
    });
    const historyItem = facultyHistory.body.history.find((h) => h.id === materialId);
    assert.ok(historyItem, 'Unpublished material must remain in faculty history');
    assert.strictEqual(historyItem.status, 'unpublished');
    assert.strictEqual(historyItem.isDownloadable, true, 'Intact Drive file remains downloadable for teacher');
  });

  // ---------------------------------------------------------------------------
  // SCENARIO 6: Temporary Drive outages do not create false deletion history
  // ---------------------------------------------------------------------------
  await runAsyncTest('6. Temporary Drive outages (503) do not create false deletion history', async () => {
    const driveFile6 = await mockDriveApi.uploadFile(
      driveSubjectFolder.id,
      'lecture_virtual_memory.pdf',
      'application/pdf',
      Buffer.from('%PDF-1.4 Virtual Memory')
    );

    const pubRes = await apiRequest({
      method: 'POST',
      path: '/api/study-materials/publish-from-drive',
      token: TEACHER_UID,
      body: {
        subjectId: SUBJECT_ID,
        driveFileId: driveFile6.id,
        title: 'Lecture 6: Virtual Memory',
        scope: 'section',
        section: 'A',
        category: 'Lecture Notes'
      }
    });

    const materialId = pubRes.body.material.id;

    // Simulate temporary 503 outage on Google Drive API
    mockDriveApi.simulatedOutage = true;

    try {
      // Reconcile/list call
      const listRes = await apiRequest({
        method: 'GET',
        path: `/api/study-materials?department=Computer+Science&year=3rd+Year&section=A`,
        token: TEACHER_UID
      });

      // Status must NOT change to unavailable during outage
      const doc = mockDb.store.study_materials[materialId];
      assert.strictEqual(doc.status, 'active', 'Material must remain active during transient Drive outage');
      assert.strictEqual(doc.availabilityStatus, 'available');
      const deleteEvents = (doc.lifecycleHistory || []).filter((e) => e.action === 'deleted_from_drive');
      assert.strictEqual(deleteEvents.length, 0, 'Outage must not append deleted_from_drive event');
    } finally {
      mockDriveApi.simulatedOutage = false;
    }
  });

  // ---------------------------------------------------------------------------
  // SCENARIO 7: Re-uploading a same-named PDF creates a distinct file lifecycle
  // ---------------------------------------------------------------------------
  await runAsyncTest('7. Re-uploading a same-named PDF creates a distinct file lifecycle', async () => {
    const fileName = 'syllabus_2026.pdf';

    // 1. First upload & publish
    const file1 = await mockDriveApi.uploadFile(
      driveSubjectFolder.id,
      fileName,
      'application/pdf',
      Buffer.from('%PDF-1.4 Syllabus v1')
    );

    const pub1 = await apiRequest({
      method: 'POST',
      path: '/api/study-materials/publish-from-drive',
      token: TEACHER_UID,
      body: {
        subjectId: SUBJECT_ID,
        driveFileId: file1.id,
        title: 'Course Syllabus 2026',
        scope: 'year',
        category: 'Syllabus & Course Plans'
      }
    });

    const materialId1 = pub1.body.material.id;

    // 2. Delete file 1 from Google Drive
    mockDriveApi.files.delete(file1.id);

    // Reconcile to mark file 1 as unavailable
    await apiRequest({
      method: 'GET',
      path: `/api/study-materials?department=Computer+Science&year=3rd+Year`,
      token: TEACHER_UID
    });

    assert.strictEqual(mockDb.store.study_materials[materialId1].status, 'unavailable');

    // 3. Upload a brand new PDF with the same filename to Drive
    const file2 = await mockDriveApi.uploadFile(
      driveSubjectFolder.id,
      fileName,
      'application/pdf',
      Buffer.from('%PDF-1.4 Syllabus v2 Updated')
    );

    // Different Drive file ID
    assert.notStrictEqual(file1.id, file2.id);

    // 4. Publish replacement file
    const pub2 = await apiRequest({
      method: 'POST',
      path: '/api/study-materials/publish-from-drive',
      token: TEACHER_UID,
      body: {
        subjectId: SUBJECT_ID,
        driveFileId: file2.id,
        title: 'Course Syllabus 2026 (Revised)',
        scope: 'year',
        category: 'Syllabus & Course Plans'
      }
    });

    const materialId2 = pub2.body.material.id;
    assert.notStrictEqual(materialId1, materialId2, 'Replacement must create a new distinct material record');

    // Old archived file remains unavailable and intact in history
    const oldDoc = mockDb.store.study_materials[materialId1];
    assert.strictEqual(oldDoc.status, 'unavailable');
    assert.strictEqual(oldDoc.driveFileId, file1.id);

    // New file is active with its own Drive ID and fresh lifecycleHistory
    const newDoc = mockDb.store.study_materials[materialId2];
    assert.strictEqual(newDoc.status, 'active');
    assert.strictEqual(newDoc.driveFileId, file2.id);
  });

  // ---------------------------------------------------------------------------
  // SCENARIO 8: Different section publication histories remain independent
  // ---------------------------------------------------------------------------
  await runAsyncTest('8. Different section publication histories remain independent', async () => {
    const sharedDriveFile = await mockDriveApi.uploadFile(
      driveSubjectFolder.id,
      'lab_manual_section_specific.pdf',
      'application/pdf',
      Buffer.from('%PDF-1.4 Lab Manual')
    );

    // Publish to Section A
    const pubSecA = await apiRequest({
      method: 'POST',
      path: '/api/study-materials/publish-from-drive',
      token: TEACHER_UID,
      body: {
        subjectId: SUBJECT_ID,
        driveFileId: sharedDriveFile.id,
        title: 'Lab Manual (Section A Schedule)',
        scope: 'section',
        section: 'A',
        category: 'Lab Manuals & Code'
      }
    });

    // Publish to Section B
    const pubSecB = await apiRequest({
      method: 'POST',
      path: '/api/study-materials/publish-from-drive',
      token: TEACHER_UID,
      body: {
        subjectId: SUBJECT_ID,
        driveFileId: sharedDriveFile.id,
        title: 'Lab Manual (Section B Schedule)',
        scope: 'section',
        section: 'B',
        category: 'Lab Manuals & Code'
      }
    });

    assert.notStrictEqual(pubSecA.body.material.id, pubSecB.body.material.id);

    // Unpublish Section A only
    await apiRequest({
      method: 'PATCH',
      path: `/api/study-materials/${pubSecA.body.material.id}/publish`,
      token: TEACHER_UID,
      body: { isPublished: false }
    });

    const docA = mockDb.store.study_materials[pubSecA.body.material.id];
    const docB = mockDb.store.study_materials[pubSecB.body.material.id];

    assert.strictEqual(docA.isPublished, false, 'Section A must be unpublished');
    assert.strictEqual(docB.isPublished, true, 'Section B must remain published');
    assert.ok(
      docA.lifecycleHistory.some((e) => e.action === 'unpublished'),
      'Section A must record unpublished'
    );
    assert.strictEqual(
      docB.lifecycleHistory.some((e) => e.action === 'unpublished'),
      false,
      'Section B must not have unpublished event'
    );
  });

  // ---------------------------------------------------------------------------
  // SCENARIO 9: Students cannot see history belonging to unauthorized sections
  // ---------------------------------------------------------------------------
  await runAsyncTest('9. Students cannot see history belonging to unauthorized sections (sanitized & scoped)', async () => {
    // Student B requests their history archive
    const studentBRes = await apiRequest({
      method: 'GET',
      path: '/api/study-materials/student-history',
      token: STUDENT_B_UID
    });

    assert.strictEqual(studentBRes.status, 200);
    const historyB = studentBRes.body.history || [];

    // Verify none of Section A's private materials appear for Student B
    for (const item of historyB) {
      if (item.scope === 'section') {
        assert.strictEqual(item.section, 'B', `Student B should only see Section B, found ${item.section}`);
      }
      // Verify complete sanitization: NO driveFileId, driveFolderId, or storage provider tokens
      assert.strictEqual(item.driveFileId, undefined, 'Student response must not expose driveFileId');
      assert.strictEqual(item.driveFolderId, undefined, 'Student response must not expose driveFolderId');
      assert.strictEqual(item.accessToken, undefined, 'Student response must not expose tokens');
      assert.strictEqual(item.refreshToken, undefined, 'Student response must not expose refresh tokens');
    }
  });

  // ---------------------------------------------------------------------------
  // SCENARIO 10: Archived files cannot be downloaded through direct API requests
  // ---------------------------------------------------------------------------
  await runAsyncTest('10. Archived / unavailable files cannot be downloaded through direct API requests', async () => {
    // Upload, publish, and delete file from Drive
    const driveFile10 = await mockDriveApi.uploadFile(
      driveSubjectFolder.id,
      'archived_secret.pdf',
      'application/pdf',
      Buffer.from('%PDF-1.4 Secret Examination Notes')
    );

    const pubRes = await apiRequest({
      method: 'POST',
      path: '/api/study-materials/publish-from-drive',
      token: TEACHER_UID,
      body: {
        subjectId: SUBJECT_ID,
        driveFileId: driveFile10.id,
        title: 'Archived Notes',
        scope: 'section',
        section: 'A',
        category: 'Reference Books & Papers'
      }
    });

    const materialId = pubRes.body.material.id;

    // Delete in Drive
    mockDriveApi.files.delete(driveFile10.id);

    // Reconcile
    await apiRequest({
      method: 'GET',
      path: `/api/study-materials?department=Computer+Science&year=3rd+Year&section=A`,
      token: TEACHER_UID
    });

    // Attempt direct download as student
    const downloadRes = await apiRequest({
      method: 'GET',
      path: `/api/study-materials/${materialId}/download`,
      token: STUDENT_A_UID
    });

    // Must be rejected with 404 or 410, never returning file bytes
    assert.ok(
      downloadRes.status === 404 || downloadRes.status === 410,
      `Expected 404 or 410 for deleted file download, got ${downloadRes.status}`
    );
    assert.strictEqual(downloadRes.body.success, false);
    assert.ok(
      downloadRes.body.code === 'FILE_NOT_FOUND' || downloadRes.body.code === 'FILE_TRASHED',
      `Expected FILE_NOT_FOUND or FILE_TRASHED, got ${downloadRes.body.code}`
    );
  });

  // ---------------------------------------------------------------------------
  // SCENARIO 11: Direct unauthorized callers cannot access faculty history
  // ---------------------------------------------------------------------------
  await runAsyncTest('11. Direct unauthorized callers cannot access faculty history endpoint', async () => {
    // Unauthenticated request
    const noAuth = await apiRequest({
      method: 'GET',
      path: '/api/study-materials/history'
    });
    assert.strictEqual(noAuth.status, 401, 'Unauthenticated request must be 401');

    // Student caller requesting faculty history
    const studentAuth = await apiRequest({
      method: 'GET',
      path: '/api/study-materials/history',
      token: STUDENT_A_UID
    });
    assert.strictEqual(studentAuth.status, 403, 'Student requesting faculty history must be 403');

    // Faculty caller can access
    const facultyAuth = await apiRequest({
      method: 'GET',
      path: '/api/study-materials/history',
      token: TEACHER_UID
    });
    assert.strictEqual(facultyAuth.status, 200, 'Faculty requesting faculty history must be 200');

    // Director caller can access
    const directorAuth = await apiRequest({
      method: 'GET',
      path: '/api/study-materials/history',
      token: DIRECTOR_UID
    });
    assert.strictEqual(directorAuth.status, 200, 'Director requesting faculty history must be 200');
  });

} finally {
  await stopServer();
}

console.log('\n======================================================');
console.log(` RESULTS: ${passed} passed, ${failed} failed`);
console.log('======================================================\n');

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
