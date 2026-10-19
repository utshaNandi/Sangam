import assert from 'node:assert';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
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
console.log(' SANGAM PHASE E — GOOGLE DRIVE AS SINGLE SOURCE OF TRUTH');
console.log(' Deletion, Trash, Outage, Revocation & Re-upload Independence');
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
      const err = new Error('Google Drive service is temporarily unavailable.');
      err.statusCode = 503;
      err.code = 'DRIVE_TEMPORARY_ERROR';
      err.isTemporary = true;
      throw err;
    }

    const result = [];
    for (const file of this.files.values()) {
      if (file.parents.includes(folderId) && !file.trashed) {
        result.push({
          id: file.id,
          name: file.name,
          mimeType: file.mimeType || 'application/pdf',
          size: file.size || 0,
          createdTime: file.createdTime,
          modifiedTime: file.modifiedTime
        });
      }
    }
    return result;
  }

  async downloadFile(driveFileId, accessToken) {
    if (this.simulatedAuthRevoked) {
      const err = new Error('Google authorization has been revoked or expired.');
      err.statusCode = 401;
      err.code = 'GOOGLE_AUTH_REVOKED';
      throw err;
    }
    if (this.simulatedOutage) {
      const err = new Error('Google Drive service is temporarily unavailable.');
      err.statusCode = 503;
      err.code = 'DRIVE_TEMPORARY_ERROR';
      err.isTemporary = true;
      throw err;
    }

    const record = this.files.get(driveFileId);
    if (!record) {
      const err = new Error(`File '${driveFileId}' not found in Google Drive.`);
      err.statusCode = 404;
      err.code = 'FILE_NOT_FOUND';
      throw err;
    }
    if (record.trashed) {
      const err = new Error(`File '${driveFileId}' is trashed in Google Drive.`);
      err.statusCode = 410;
      err.code = 'FILE_TRASHED';
      throw err;
    }
    return record.buffer;
  }
}

const mockDriveApi = new MockDriveApi();
googleDriveService.customDriveApi = mockDriveApi;

// -----------------------------------------------------------------------------
// Mock Auth & Server Setup
// -----------------------------------------------------------------------------
const tokenStore = new Map();
const mockAuthService = {
  verifyIdToken: async (token) => {
    if (!tokenStore.has(token)) {
      const err = new Error('Invalid Firebase ID token format or signature.');
      err.code = 'auth/invalid-id-token';
      throw err;
    }
    return tokenStore.get(token);
  }
};
setCustomAuthService(mockAuthService);

function registerToken(token, userPayload) {
  tokenStore.set(token, userPayload);
}

let testServer = null;
let baseUrl = '';

testServer = http.createServer(app);
await new Promise((resolve) => testServer.listen(0, '127.0.0.1', resolve));
const { port } = testServer.address();
baseUrl = `http://127.0.0.1:${port}`;

async function apiRequest({ method = 'GET', path: reqPath, token, body }) {
  const url = new URL(reqPath, baseUrl);
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  return new Promise((resolve, reject) => {
    const req = http.request(
      url,
      { method, headers },
      (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
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
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function createMultipartPayload(fields = {}, file = null) {
  const boundary = `----WebKitFormBoundary${crypto.randomBytes(16).toString('hex')}`;
  const crlf = '\r\n';
  const parts = [];

  for (const [key, value] of Object.entries(fields)) {
    parts.push(Buffer.from(
      `--${boundary}${crlf}Content-Disposition: form-data; name="${key}"${crlf}${crlf}${value}${crlf}`
    ));
  }

  if (file) {
    const filename = file.filename || 'document.pdf';
    const mime = file.mimeType || 'application/pdf';
    parts.push(Buffer.from(
      `--${boundary}${crlf}Content-Disposition: form-data; name="${file.fieldname || 'file'}"; filename="${filename}"${crlf}Content-Type: ${mime}${crlf}${crlf}`
    ));
    parts.push(Buffer.isBuffer(file.buffer) ? file.buffer : Buffer.from(file.buffer));
    parts.push(Buffer.from(crlf));
  }

  parts.push(Buffer.from(`--${boundary}--${crlf}`));

  return {
    contentType: `multipart/form-data; boundary=${boundary}`,
    body: Buffer.concat(parts)
  };
}

async function apiMultipartRequest({ path: reqPath, token, fields = {}, file = null }) {
  const url = new URL(reqPath, baseUrl);
  const { contentType, body } = createMultipartPayload(fields, file);
  const headers = {
    'Content-Type': contentType,
    'Content-Length': body.length
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  return new Promise((resolve, reject) => {
    const req = http.request(
      url,
      { method: 'POST', headers },
      (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
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
    req.write(body);
    req.end();
  });
}

// -----------------------------------------------------------------------------
// Seed Test Database
// -----------------------------------------------------------------------------
const TEACHER_UID = 'teacher_sharma_e';
const TEACHER_TOKEN = 'tok_sharma_e';

const STUDENT_A_UID = 'student_csea_e';
const STUDENT_A_TOKEN = 'tok_student_csea_e';

const STUDENT_B_UID = 'student_cseb_e';
const STUDENT_B_TOKEN = 'tok_student_cseb_e';

const STUDENT_OUTSIDER_UID = 'student_outsider_e';
const STUDENT_OUTSIDER_TOKEN = 'tok_student_outsider_e';

registerToken(TEACHER_TOKEN, { uid: TEACHER_UID, email: 'sharma@uem.edu' });
registerToken(STUDENT_A_TOKEN, { uid: STUDENT_A_UID, email: 'student_a@uem.edu' });
registerToken(STUDENT_B_TOKEN, { uid: STUDENT_B_UID, email: 'student_b@uem.edu' });
registerToken(STUDENT_OUTSIDER_TOKEN, { uid: STUDENT_OUTSIDER_UID, email: 'student_out@uem.edu' });

// Users
mockDb.store.users[TEACHER_UID] = {
  uid: TEACHER_UID,
  name: 'Prof. Sharma',
  email: 'sharma@uem.edu',
  role: 'Faculty',
  institution: 'UEMK',
  department: 'Computer Science'
};

mockDb.store.users[STUDENT_A_UID] = {
  uid: STUDENT_A_UID,
  name: 'Student Sec A',
  email: 'student_a@uem.edu',
  role: 'Student',
  institution: 'UEMK',
  department: 'Computer Science',
  year: '3rd Year',
  section: 'Section A'
};

mockDb.store.users[STUDENT_B_UID] = {
  uid: STUDENT_B_UID,
  name: 'Student Sec B',
  email: 'student_b@uem.edu',
  role: 'Student',
  institution: 'UEMK',
  department: 'Computer Science',
  year: '3rd Year',
  section: 'Section B'
};

mockDb.store.users[STUDENT_OUTSIDER_UID] = {
  uid: STUDENT_OUTSIDER_UID,
  name: 'Student ECE',
  email: 'student_out@uem.edu',
  role: 'Student',
  institution: 'UEMK',
  department: 'Electronics & Communication',
  year: '3rd Year',
  section: 'Section A'
};

// Subject
const SUBJECT_ID = 'sub_operating_systems_e';
mockDb.store.subjects[SUBJECT_ID] = {
  id: SUBJECT_ID,
  name: 'Operating Systems',
  code: 'CS301',
  department: 'Computer Science',
  year: '3rd Year',
  institution: 'UEMK'
};

// Teacher Allocations (Covers both Section A and Section B)
mockDb.store.teacher_allocations[`alloc_${TEACHER_UID}_csea`] = {
  teacherUid: TEACHER_UID,
  teacherEmail: 'sharma@uem.edu',
  institution: 'UEMK',
  department: 'Computer Science',
  year: '3rd Year',
  section: 'Section A',
  authorized: true
};

mockDb.store.teacher_allocations[`alloc_${TEACHER_UID}_cseb`] = {
  teacherUid: TEACHER_UID,
  teacherEmail: 'sharma@uem.edu',
  institution: 'UEMK',
  department: 'Computer Science',
  year: '3rd Year',
  section: 'Section B',
  authorized: true
};

// Teacher Subject Assignment
mockDb.store.teacher_subject_assignments[`assign_${TEACHER_UID}_${SUBJECT_ID}`] = {
  id: `assign_${TEACHER_UID}_${SUBJECT_ID}`,
  subjectId: SUBJECT_ID,
  teacherUid: TEACHER_UID,
  institution: 'UEMK',
  department: 'Computer Science',
  year: '3rd Year',
  status: 'active',
  active: true,
  scope: 'all',
  driveFolderId: 'folder_os_sharma',
  driveFolderName: '[CS301] Operating Systems'
};

// Faculty Subject Folders Mapping
if (!mockDb.store.faculty_subject_folders) {
  mockDb.store.faculty_subject_folders = {};
}
mockDb.store.faculty_subject_folders[`${TEACHER_UID}_${SUBJECT_ID}`] = {
  id: `${TEACHER_UID}_${SUBJECT_ID}`,
  teacherUid: TEACHER_UID,
  subjectId: SUBJECT_ID,
  driveFolderId: 'folder_os_sharma',
  driveFolderName: '[CS301] Operating Systems',
  status: 'active'
};

// Teacher's Subject Folder in Google Drive
mockDriveApi.folders.set('folder_os_sharma', {
  id: 'folder_os_sharma',
  name: '[CS301] Operating Systems',
  parents: ['folder_root_sharma'],
  trashed: false
});

// Teacher Google Drive Integration (AES-256-GCM encrypted mock token)
const encKey = process.env.TOKEN_ENCRYPTION_KEY;
const encAccess = encrypt('mock_access_token_sharma', encKey);
const encRefresh = encrypt('mock_refresh_token_sharma', encKey);

mockDb.store.faculty_storage_integrations[TEACHER_UID] = {
  teacherUid: TEACHER_UID,
  teacherEmail: 'sharma@uem.edu',
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

// Shared test variables
let draftFileId = '';
let publishedMaterialId = '';
const SAMPLE_PDF_BUFFER = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Title (OS Process Scheduling) >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF');

// =============================================================================
// TEST SUITE: 13 SCENARIOS FOR GOOGLE DRIVE AS SINGLE SOURCE OF TRUTH
// =============================================================================

console.log('--- REQUIREMENT 1: Upload from device to Drive & Private Draft Listing ---');

await runAsyncTest('1.1: Upload from device directly to Google Drive subject folder creates private draft', async () => {
  const res = await apiMultipartRequest({
    path: '/api/study-materials/drive/upload',
    token: TEACHER_TOKEN,
    fields: { subjectId: SUBJECT_ID },
    file: {
      fieldname: 'file',
      filename: 'Process_Scheduling.pdf',
      mimeType: 'application/pdf',
      buffer: SAMPLE_PDF_BUFFER
    }
  });

  assert.strictEqual(res.status, 201, `Expected 201, got ${res.status}: ${JSON.stringify(res.body)}`);
  assert.strictEqual(res.body.success, true);
  assert.ok(res.body.file.id, 'Expected returned file ID');
  draftFileId = res.body.file.id;

  // Verify file exists in mock Drive
  assert.ok(mockDriveApi.files.has(draftFileId), 'File must exist in Google Drive');
  assert.strictEqual(mockDriveApi.files.get(draftFileId).name, 'Process_Scheduling.pdf');

  // Verify NO study_materials document was created in Firestore (pure private draft)
  const allMaterials = Object.values(mockDb.store.study_materials);
  const matches = allMaterials.filter((m) => m.driveFileId === draftFileId);
  assert.strictEqual(matches.length, 0, 'Private draft upload must NOT create a study_materials publication document');
});

await runAsyncTest('1.2: Faculty Drive file listing shows uploaded draft with isPublished: false', async () => {
  const res = await apiRequest({
    method: 'GET',
    path: `/api/study-materials/drive/files?subjectId=${SUBJECT_ID}`,
    token: TEACHER_TOKEN
  });

  assert.strictEqual(res.status, 200);
  const targetFile = res.body.files.find((f) => f.id === draftFileId);
  assert.ok(targetFile, 'Uploaded draft file must be present in teacher Drive listing');
  assert.strictEqual(targetFile.isPublished, false, 'Draft file must have isPublished: false');
});

await runAsyncTest('1.3: Students cannot see private draft in study materials list', async () => {
  const res = await apiRequest({
    method: 'GET',
    path: `/api/study-materials?subjectId=${SUBJECT_ID}`,
    token: STUDENT_A_TOKEN
  });

  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.materials.length, 0, 'Students must see 0 materials while file is in draft state');
});

console.log('\n--- REQUIREMENT 2: Publication without Second File Copy ---');

await runAsyncTest('2.1: Publish Drive file for Year-Wide scope creates metadata only without duplicating file', async () => {
  const preFileCount = mockDriveApi.files.size;

  const res = await apiRequest({
    method: 'POST',
    path: '/api/study-materials/publish-from-drive',
    token: TEACHER_TOKEN,
    body: {
      subjectId: SUBJECT_ID,
      driveFileId: draftFileId,
      title: 'OS Lecture: Process Scheduling',
      category: 'Lecture Notes',
      scope: 'year',
      isYearWide: true
    }
  });

  assert.strictEqual(res.status, 201, `Expected 201, got ${res.status}: ${JSON.stringify(res.body)}`);
  assert.strictEqual(res.body.success, true);
  publishedMaterialId = res.body.material.id;
  assert.ok(publishedMaterialId, 'Publication must return a material ID');

  // Verify Drive file was NOT duplicated
  const postFileCount = mockDriveApi.files.size;
  assert.strictEqual(postFileCount, preFileCount, 'Publishing MUST NOT create a second physical copy in Google Drive');

  // Verify Firestore document references the original driveFileId
  const storedDoc = mockDb.store.study_materials[publishedMaterialId];
  assert.ok(storedDoc, 'Firestore publication document must exist');
  assert.strictEqual(storedDoc.driveFileId, draftFileId, 'Must store original Google Drive file ID');
  assert.strictEqual(storedDoc.isPublished, true);
  assert.strictEqual(storedDoc.storageProvider, 'google');
});

await runAsyncTest('2.2: Published material is immediately visible to students in Section A & B', async () => {
  const resA = await apiRequest({
    method: 'GET',
    path: `/api/study-materials?subjectId=${SUBJECT_ID}`,
    token: STUDENT_A_TOKEN
  });
  assert.strictEqual(resA.status, 200);
  assert.strictEqual(resA.body.materials.length, 1);
  assert.strictEqual(resA.body.materials[0].id, publishedMaterialId);

  const resB = await apiRequest({
    method: 'GET',
    path: `/api/study-materials?subjectId=${SUBJECT_ID}`,
    token: STUDENT_B_TOKEN
  });
  assert.strictEqual(resB.status, 200);
  assert.strictEqual(resB.body.materials.length, 1);
});

console.log('\n--- REQUIREMENT 3 & 5: Deleting Original Drive File Reconciles & Removes Access ---');

await runAsyncTest('3.1: Manually deleting PDF from Google Drive removes it from student available materials', async () => {
  // Simulate faculty deleting original PDF directly in Google Drive
  mockDriveApi.files.delete(draftFileId);

  // Student fetches study materials
  const res = await apiRequest({
    method: 'GET',
    path: `/api/study-materials?subjectId=${SUBJECT_ID}`,
    token: STUDENT_A_TOKEN
  });

  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.materials.length, 0, 'Deleted Drive file must be immediately excluded from student materials list');

  // Verify Firestore publication was automatically reconciled to unavailable
  const doc = mockDb.store.study_materials[publishedMaterialId];
  assert.strictEqual(doc.isPublished, false, 'Stale publication document must be marked isPublished: false');
  assert.strictEqual(doc.status, 'unavailable', 'Document status must be unavailable');
  assert.strictEqual(doc.availabilityStatus, 'deleted', 'availabilityStatus must be deleted');
});

await runAsyncTest('3.2: Faculty Drive view and Study Material view exclude the deleted file', async () => {
  // Faculty Drive files listing
  const driveRes = await apiRequest({
    method: 'GET',
    path: `/api/study-materials/drive/files?subjectId=${SUBJECT_ID}`,
    token: TEACHER_TOKEN
  });
  assert.strictEqual(driveRes.status, 200);
  const foundInDrive = driveRes.body.files.some((f) => f.id === draftFileId);
  assert.strictEqual(foundInDrive, false, 'Deleted file must not appear in faculty Drive file list');

  // Faculty Study Material management listing
  const matRes = await apiRequest({
    method: 'GET',
    path: `/api/study-materials?subjectId=${SUBJECT_ID}`,
    token: TEACHER_TOKEN
  });
  assert.strictEqual(matRes.status, 200);
  const foundInMaterials = matRes.body.materials.some((m) => m.id === publishedMaterialId);
  assert.strictEqual(foundInMaterials, false, 'Faculty Study Material view must stop presenting deleted file as available');
});

console.log('\n--- REQUIREMENT 6: Direct Download of Deleted File Fails Safely ---');

await runAsyncTest('6.1: Direct download request for deleted file returns 404 FILE_NOT_FOUND', async () => {
  const res = await apiRequest({
    method: 'GET',
    path: `/api/study-materials/${publishedMaterialId}/download`,
    token: STUDENT_A_TOKEN
  });

  assert.strictEqual(res.status, 404, `Expected 404, got ${res.status}`);
  assert.strictEqual(res.body.success, false);
  assert.strictEqual(res.body.code, 'FILE_NOT_FOUND');
});

console.log('\n--- REQUIREMENT 4: Trashing a Drive File Blocks Access ---');

let trashedDriveFileId = '';
let trashedMaterialId = '';

await runAsyncTest('4.1: Upload and publish second file to test Google Drive trash behavior', async () => {
  const uploadRes = await apiMultipartRequest({
    path: '/api/study-materials/drive/upload',
    token: TEACHER_TOKEN,
    fields: { subjectId: SUBJECT_ID },
    file: {
      fieldname: 'file',
      filename: 'Deadlock_Handling.pdf',
      mimeType: 'application/pdf',
      buffer: SAMPLE_PDF_BUFFER
    }
  });
  assert.strictEqual(uploadRes.status, 201);
  trashedDriveFileId = uploadRes.body.file.id;

  const pubRes = await apiRequest({
    method: 'POST',
    path: '/api/study-materials/publish-from-drive',
    token: TEACHER_TOKEN,
    body: {
      subjectId: SUBJECT_ID,
      driveFileId: trashedDriveFileId,
      title: 'OS Lecture: Deadlock Handling',
      category: 'Lecture Notes',
      scope: 'year',
      isYearWide: true
    }
  });
  assert.strictEqual(pubRes.status, 201);
  trashedMaterialId = pubRes.body.material.id;
});

await runAsyncTest('4.2: Moving original file to Google Drive trash blocks student listing and download', async () => {
  // Simulate faculty sending file to Google Drive trash
  const fileObj = mockDriveApi.files.get(trashedDriveFileId);
  fileObj.trashed = true;

  // 1. Student listing must exclude trashed file
  const listRes = await apiRequest({
    method: 'GET',
    path: `/api/study-materials?subjectId=${SUBJECT_ID}`,
    token: STUDENT_A_TOKEN
  });
  assert.strictEqual(listRes.status, 200);
  const foundInList = listRes.body.materials.some((m) => m.id === trashedMaterialId);
  assert.strictEqual(foundInList, false, 'Trashed Drive file must be excluded from student listing');

  // 2. Direct download request must fail with 410 FILE_TRASHED (or 404)
  const dlRes = await apiRequest({
    method: 'GET',
    path: `/api/study-materials/${trashedMaterialId}/download`,
    token: STUDENT_A_TOKEN
  });
  assert.strictEqual(dlRes.status === 410 || dlRes.status === 404, true, `Expected 410/404 for trashed file, got ${dlRes.status}`);
  assert.strictEqual(dlRes.body.code, 'FILE_TRASHED');

  // 3. Firestore document must be reconciled to trashed
  const doc = mockDb.store.study_materials[trashedMaterialId];
  assert.strictEqual(doc.isPublished, false);
  assert.strictEqual(doc.status, 'unavailable');
  assert.strictEqual(doc.availabilityStatus, 'trashed');
});

console.log('\n--- REQUIREMENT 7: Unpublishing Blocks Access While Drive File Exists ---');

let unpublishDriveFileId = '';
let unpublishMaterialId = '';

await runAsyncTest('7.1: Upload and publish a third file for unpublish testing', async () => {
  const uploadRes = await apiMultipartRequest({
    path: '/api/study-materials/drive/upload',
    token: TEACHER_TOKEN,
    fields: { subjectId: SUBJECT_ID },
    file: {
      fieldname: 'file',
      filename: 'Memory_Management.pdf',
      mimeType: 'application/pdf',
      buffer: SAMPLE_PDF_BUFFER
    }
  });
  assert.strictEqual(uploadRes.status, 201);
  unpublishDriveFileId = uploadRes.body.file.id;

  const pubRes = await apiRequest({
    method: 'POST',
    path: '/api/study-materials/publish-from-drive',
    token: TEACHER_TOKEN,
    body: {
      subjectId: SUBJECT_ID,
      driveFileId: unpublishDriveFileId,
      title: 'OS Lecture: Memory Management',
      category: 'Lecture Notes',
      scope: 'year',
      isYearWide: true
    }
  });
  assert.strictEqual(pubRes.status, 201);
  unpublishMaterialId = pubRes.body.material.id;
});

await runAsyncTest('7.2: Unpublishing immediately blocks student visibility and download while Drive file remains intact', async () => {
  const unpubRes = await apiRequest({
    method: 'POST',
    path: `/api/study-materials/${unpublishMaterialId}/unpublish`,
    token: TEACHER_TOKEN
  });
  assert.strictEqual(unpubRes.status, 200);

  // Student listing must exclude it
  const listRes = await apiRequest({
    method: 'GET',
    path: `/api/study-materials?subjectId=${SUBJECT_ID}`,
    token: STUDENT_A_TOKEN
  });
  const found = listRes.body.materials.some((m) => m.id === unpublishMaterialId);
  assert.strictEqual(found, false, 'Unpublished material must not be visible to students');

  // Student download must fail with 403 MATERIAL_UNPUBLISHED
  const dlRes = await apiRequest({
    method: 'GET',
    path: `/api/study-materials/${unpublishMaterialId}/download`,
    token: STUDENT_A_TOKEN
  });
  assert.strictEqual(dlRes.status, 403);
  assert.strictEqual(dlRes.body.code, 'MATERIAL_UNPUBLISHED');

  // Google Drive file MUST still exist in Google Drive
  assert.ok(mockDriveApi.files.has(unpublishDriveFileId), 'Unpublishing must NEVER delete the original Google Drive file');
  assert.strictEqual(mockDriveApi.files.get(unpublishDriveFileId).trashed, false);
});

console.log('\n--- REQUIREMENT 8: Revoking Drive Permissions Blocks Access Without Fallback ---');

await runAsyncTest('8.1: Re-publishing file succeeds while authorized', async () => {
  const pubRes = await apiRequest({
    method: 'PATCH',
    path: `/api/study-materials/${unpublishMaterialId}/publish`,
    token: TEACHER_TOKEN,
    body: { isPublished: true }
  });
  assert.strictEqual(pubRes.status, 200);
});

await runAsyncTest('8.2: Revoked Google Drive credentials block downloads with 401 GOOGLE_AUTH_REVOKED without fallback', async () => {
  // Simulate token revocation in Google Drive API
  mockDriveApi.simulatedAuthRevoked = true;

  const dlRes = await apiRequest({
    method: 'GET',
    path: `/api/study-materials/${unpublishMaterialId}/download`,
    token: STUDENT_A_TOKEN
  });

  assert.strictEqual(dlRes.status, 401, `Expected 401 for revoked auth, got ${dlRes.status}`);
  assert.strictEqual(dlRes.body.code, 'GOOGLE_AUTH_REVOKED');

  // Reset simulated revocation
  mockDriveApi.simulatedAuthRevoked = false;
});

console.log('\n--- REQUIREMENT 9: Temporary Outage Does Not Falsely Mark Permanent Deletion ---');

await runAsyncTest('9.1: Temporary 503 outage fails closed for downloads but preserves metadata', async () => {
  // Simulate temporary Google Drive API 503 outage
  mockDriveApi.simulatedOutage = true;

  const dlRes = await apiRequest({
    method: 'GET',
    path: `/api/study-materials/${unpublishMaterialId}/download`,
    token: STUDENT_A_TOKEN
  });

  assert.strictEqual(dlRes.status, 503, `Expected 503 for outage, got ${dlRes.status}`);
  assert.strictEqual(dlRes.body.code, 'DRIVE_TEMPORARY_ERROR');

  // Crucial: The Firestore publication record must NOT be marked permanently deleted
  const doc = mockDb.store.study_materials[unpublishMaterialId];
  assert.notStrictEqual(doc.availabilityStatus, 'deleted', 'Temporary outage must NOT mark document as permanently deleted');

  // Clear simulated outage
  mockDriveApi.simulatedOutage = false;

  // Once outage clears, student download succeeds directly without re-publishing
  const recoveryDl = await apiRequest({
    method: 'GET',
    path: `/api/study-materials/${unpublishMaterialId}/download`,
    token: STUDENT_A_TOKEN
  });
  assert.strictEqual(recoveryDl.status, 200, 'Download must succeed immediately when Google Drive recovers');
});

console.log('\n--- REQUIREMENT 10: Re-uploading Same-Named File Does Not Revive Old Publication ---');

await runAsyncTest('10.1: Re-uploading PDF with identical filename gets new Drive ID and remains private draft', async () => {
  // First, permanently delete the existing Memory_Management file
  mockDriveApi.files.delete(unpublishDriveFileId);

  // Trigger reconciliation via list call
  await apiRequest({
    method: 'GET',
    path: `/api/study-materials?subjectId=${SUBJECT_ID}`,
    token: STUDENT_A_TOKEN
  });
  assert.strictEqual(mockDb.store.study_materials[unpublishMaterialId].isPublished, false);

  // Re-upload a new file with the exact same name "Memory_Management.pdf"
  const reUploadRes = await apiMultipartRequest({
    path: '/api/study-materials/drive/upload',
    token: TEACHER_TOKEN,
    fields: { subjectId: SUBJECT_ID },
    file: {
      fieldname: 'file',
      filename: 'Memory_Management.pdf',
      mimeType: 'application/pdf',
      buffer: SAMPLE_PDF_BUFFER
    }
  });

  assert.strictEqual(reUploadRes.status, 201);
  const newDriveFileId = reUploadRes.body.file.id;
  assert.notStrictEqual(newDriveFileId, unpublishDriveFileId, 'New upload must receive a distinct Drive file ID');

  // Old publication record must NOT be revived
  const oldDoc = mockDb.store.study_materials[unpublishMaterialId];
  assert.strictEqual(oldDoc.isPublished, false, 'Old publication record must NOT be revived by new upload');
  assert.strictEqual(oldDoc.driveFileId, unpublishDriveFileId);

  // Students must still see 0 publications for this subject
  const studentList = await apiRequest({
    method: 'GET',
    path: `/api/study-materials?subjectId=${SUBJECT_ID}`,
    token: STUDENT_A_TOKEN
  });
  assert.strictEqual(studentList.body.materials.length, 0, 'New file remains a private draft and is not student-visible');
});

console.log('\n--- REQUIREMENT 11: Multi-Section Publications Remain Independent ---');

let multiSecDriveFileId = '';
let secAMatId = '';
let secBMatId = '';

await runAsyncTest('11.1: Upload one Drive file and publish separately to Section A and Section B', async () => {
  const uploadRes = await apiMultipartRequest({
    path: '/api/study-materials/drive/upload',
    token: TEACHER_TOKEN,
    fields: { subjectId: SUBJECT_ID },
    file: {
      fieldname: 'file',
      filename: 'Concurrency_Semaphores.pdf',
      mimeType: 'application/pdf',
      buffer: SAMPLE_PDF_BUFFER
    }
  });
  assert.strictEqual(uploadRes.status, 201);
  multiSecDriveFileId = uploadRes.body.file.id;

  // Publish to Section A
  const pubA = await apiRequest({
    method: 'POST',
    path: '/api/study-materials/publish-from-drive',
    token: TEACHER_TOKEN,
    body: {
      subjectId: SUBJECT_ID,
      driveFileId: multiSecDriveFileId,
      title: 'Concurrency Notes (Sec A)',
      scope: 'section',
      section: 'Section A'
    }
  });
  assert.strictEqual(pubA.status, 201);
  secAMatId = pubA.body.material.id;

  // Publish same file to Section B
  const pubB = await apiRequest({
    method: 'POST',
    path: '/api/study-materials/publish-from-drive',
    token: TEACHER_TOKEN,
    body: {
      subjectId: SUBJECT_ID,
      driveFileId: multiSecDriveFileId,
      title: 'Concurrency Notes (Sec B)',
      scope: 'section',
      section: 'Section B'
    }
  });
  assert.strictEqual(pubB.status, 201);
  secBMatId = pubB.body.material.id;
});

await runAsyncTest('11.2: Unpublishing Section A leaves Section B completely active', async () => {
  // Unpublish Section A
  const unpubA = await apiRequest({
    method: 'POST',
    path: `/api/study-materials/${secAMatId}/unpublish`,
    token: TEACHER_TOKEN
  });
  assert.strictEqual(unpubA.status, 200);

  // Section A student cannot access
  const listA = await apiRequest({
    method: 'GET',
    path: `/api/study-materials?subjectId=${SUBJECT_ID}`,
    token: STUDENT_A_TOKEN
  });
  const foundA = listA.body.materials.some((m) => m.id === secAMatId);
  assert.strictEqual(foundA, false, 'Section A student must not see unpublished Section A material');

  // Section B student still has full access
  const listB = await apiRequest({
    method: 'GET',
    path: `/api/study-materials?subjectId=${SUBJECT_ID}`,
    token: STUDENT_B_TOKEN
  });
  const foundB = listB.body.materials.some((m) => m.id === secBMatId);
  assert.strictEqual(foundB, true, 'Section B publication must remain active and visible to Section B');

  const dlB = await apiRequest({
    method: 'GET',
    path: `/api/study-materials/${secBMatId}/download`,
    token: STUDENT_B_TOKEN
  });
  assert.strictEqual(dlB.status, 200, 'Section B download must succeed');
});

await runAsyncTest('11.3: Deleting Section A publication does not delete Drive file or Section B publication', async () => {
  // Delete Section A publication record
  const delA = await apiRequest({
    method: 'DELETE',
    path: `/api/study-materials/${secAMatId}`,
    token: TEACHER_TOKEN
  });
  assert.strictEqual(delA.status, 200);

  // Original Drive file MUST still exist in Drive
  assert.ok(mockDriveApi.files.has(multiSecDriveFileId), 'Deleting Section A publication must not delete Drive file');

  // Section B publication remains valid in Firestore
  assert.ok(mockDb.store.study_materials[secBMatId], 'Section B publication record must remain intact');
  assert.strictEqual(mockDb.store.study_materials[secBMatId].isPublished, true);
});

await runAsyncTest('11.4: Deleting the original Drive file blocks all sections', async () => {
  // Permanently delete physical file in Drive
  mockDriveApi.files.delete(multiSecDriveFileId);

  // Section B download now fails safely with 404
  const dlB = await apiRequest({
    method: 'GET',
    path: `/api/study-materials/${secBMatId}/download`,
    token: STUDENT_B_TOKEN
  });
  assert.strictEqual(dlB.status, 404);
  assert.strictEqual(dlB.body.code, 'FILE_NOT_FOUND');

  // Section B listing excludes the material
  const listB = await apiRequest({
    method: 'GET',
    path: `/api/study-materials?subjectId=${SUBJECT_ID}`,
    token: STUDENT_B_TOKEN
  });
  assert.strictEqual(listB.body.materials.some((m) => m.id === secBMatId), false);
});

console.log('\n--- REQUIREMENT 12: Existing Non-Drive / Local Materials Compatibility ---');

await runAsyncTest('12.1: Non-Drive study materials retain intended behavior without Drive checks', async () => {
  const localMatId = 'mat_local_legacy_notes';
  mockDb.store.study_materials[localMatId] = {
    id: localMatId,
    title: 'Legacy Course Syllabus (Local)',
    subjectId: SUBJECT_ID,
    subjectName: 'Operating Systems',
    subjectCode: 'CS301',
    department: 'Computer Science',
    year: '3rd Year',
    scope: 'year',
    isYearWide: true,
    institution: 'UEMK',
    teacherUid: TEACHER_UID,
    storageProvider: 'local',
    isPublished: true,
    createdAt: new Date().toISOString()
  };

  const listRes = await apiRequest({
    method: 'GET',
    path: `/api/study-materials?subjectId=${SUBJECT_ID}`,
    token: STUDENT_A_TOKEN
  });

  assert.strictEqual(listRes.status, 200);
  const found = listRes.body.materials.find((m) => m.id === localMatId);
  assert.ok(found, 'Local study material must be accessible and returned');
  assert.strictEqual(found.storageProvider, 'local');
});

console.log('\n--- REQUIREMENT 13: Scope, Authentication & Authorization Boundaries Pass ---');

await runAsyncTest('13.1: Unauthenticated request to /api/study-materials is rejected with 401', async () => {
  const res = await apiRequest({
    method: 'GET',
    path: `/api/study-materials?subjectId=${SUBJECT_ID}`
  });
  assert.strictEqual(res.status, 401);
});

await runAsyncTest('13.2: Student outside academic scope (ECE) cannot view Computer Science study materials', async () => {
  const res = await apiRequest({
    method: 'GET',
    path: `/api/study-materials?subjectId=${SUBJECT_ID}`,
    token: STUDENT_OUTSIDER_TOKEN
  });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.materials.length, 0, 'Outsider student must not see CS department materials');
});

await runAsyncTest('13.3: Teacher cannot publish Drive file to subject they are not actively assigned to', async () => {
  // Revoke teacher subject assignment
  mockDb.store.teacher_subject_assignments[`assign_${TEACHER_UID}_${SUBJECT_ID}`].status = 'revoked';

  // Upload a fresh file to test publishing rejection on unassigned subject
  const unassignedFile = await mockDriveApi.uploadFile('folder_os_sharma', 'Unassigned.pdf', 'application/pdf', SAMPLE_PDF_BUFFER, 'token');

  const res = await apiRequest({
    method: 'POST',
    path: '/api/study-materials/publish-from-drive',
    token: TEACHER_TOKEN,
    body: {
      subjectId: SUBJECT_ID,
      driveFileId: unassignedFile.id,
      title: 'Unauthorized Publication'
    }
  });

  assert.strictEqual(res.status, 403);
  assert.strictEqual(res.body.code, 'FORBIDDEN_SUBJECT');

  // Restore for cleanliness
  mockDb.store.teacher_subject_assignments[`assign_${TEACHER_UID}_${SUBJECT_ID}`].status = 'active';
});

// Teardown test server
await new Promise((resolve) => testServer.close(resolve));

console.log('\n======================================================');
console.log(` SUMMARY: ${passed} passed, ${failed} failed`);
console.log('======================================================\n');

if (failed > 0) {
  process.exit(1);
}
