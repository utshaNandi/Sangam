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
import { encrypt } from '../server/services/encryptionService.js';
import { setCustomAuthService } from '../server/middleware/authMiddleware.js';

import {
  fetchDriveSubjectFiles,
  uploadToDriveFolder,
  publishFromDriveFile,
  MAX_STUDY_MATERIAL_FILE_SIZE
} from '../src/services/studyMaterialService.js';

import { auth as clientAuth } from '../src/firebase/config.js';

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
console.log(' SANGAM PHASE B — FACULTY DRIVE LIBRARY TEST SUITE');
console.log(' Drive Browsing, Upload Backend APIs & Client Wrappers');
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
      faculty_storage_integrations: {},
      study_materials: {}
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

const mockDb = new MockFirestore();
subjectService.setTestDb(mockDb);
studyMaterialService.setTestDb(mockDb);
googleDriveService.setTestDb(mockDb);

// -----------------------------------------------------------------------------
// High-Fidelity Mock Google Drive API
// -----------------------------------------------------------------------------
class MockDriveApi {
  constructor() {
    this.folders = new Map();
    this.files = new Map();
    this.createdFoldersCount = 0;
    this.uploadCallsCount = 0;

    // Seed root coursework folders for teachers
    this.folders.set('folder_root_turing', {
      id: 'folder_root_turing',
      name: 'Sangam Coursework',
      parents: ['root'],
      trashed: false
    });

    this.folders.set('folder_root_hopper', {
      id: 'folder_root_hopper',
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

  async uploadFile(folderId, fileName, mimeType, fileBuffer, accessToken, metadataExtra = {}) {
    this.uploadCallsCount++;
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
        createdTime: file.createdTime || new Date().toISOString(),
        modifiedTime: file.modifiedTime || new Date().toISOString()
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
          mimeType: file.mimeType || 'application/pdf',
          size: file.size || 0,
          createdTime: file.createdTime || new Date().toISOString(),
          modifiedTime: file.modifiedTime || new Date().toISOString()
        });
      }
    }
    return result;
  }

  async downloadFile(driveFileId, accessToken) {
    const record = this.files.get(driveFileId);
    if (!record || record.trashed) {
      throw new Error(`Drive file not found or trashed: ${driveFileId}`);
    }
    return record.buffer;
  }
}

const mockDriveApi = new MockDriveApi();
googleDriveService.customDriveApi = mockDriveApi;

// -----------------------------------------------------------------------------
// Mock Auth Service for Express verifyFirebaseToken
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

// -----------------------------------------------------------------------------
// HTTP Client Helper
// -----------------------------------------------------------------------------
let testServer = null;
let baseUrl = '';

beforeTests: {
  testServer = http.createServer(app);
  await new Promise((resolve) => testServer.listen(0, '127.0.0.1', resolve));
  const port = testServer.address().port;
  baseUrl = `http://127.0.0.1:${port}`;
}

async function apiRequest({ method = 'GET', path, token, body }) {
  const url = new URL(path, baseUrl);
  const headers = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const payload = body ? JSON.stringify(body) : null;
  if (payload) {
    headers['Content-Length'] = Buffer.byteLength(payload);
  }

  return new Promise((resolve, reject) => {
    const req = http.request(
      url,
      { method, headers },
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
    if (payload) {
      req.write(payload);
    }
    req.end();
  });
}

function createMultipartPayload(fields, file) {
  const boundary = `----SangamBoundary${crypto.randomBytes(8).toString('hex')}`;
  const crlf = '\r\n';
  const parts = [];

  for (const [name, value] of Object.entries(fields)) {
    if (value !== undefined && value !== null) {
      parts.push(Buffer.from(
        `--${boundary}${crlf}Content-Disposition: form-data; name="${name}"${crlf}${crlf}${value}${crlf}`
      ));
    }
  }

  if (file) {
    const filename = file.filename || 'notes.pdf';
    const mime = file.mime || 'application/pdf';
    parts.push(Buffer.from(
      `--${boundary}${crlf}Content-Disposition: form-data; name="${file.fieldname || 'file'}"; filename="${filename}"${crlf}Content-Type: ${mime}${crlf}${crlf}`
    ));
    parts.push(Buffer.isBuffer(file.buffer) ? file.buffer : Buffer.from(file.buffer));
    parts.push(Buffer.from(crlf));
  }

  parts.push(Buffer.from(`--${boundary}--${crlf}`));
  const body = Buffer.concat(parts);
  const contentType = `multipart/form-data; boundary=${boundary}`;
  return { body, contentType };
}

async function apiMultipartRequest({ path, token, fields, file }) {
  const url = new URL(path, baseUrl);
  const { body, contentType } = createMultipartPayload(fields, file);
  const headers = {
    'Content-Type': contentType,
    'Content-Length': body.length
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  return new Promise((resolve, reject) => {
    const req = http.request(
      url,
      { method: 'POST', headers },
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
    req.write(body);
    req.end();
  });
}

// -----------------------------------------------------------------------------
// Seed Data: Users, Subjects, Allocations & Storage Integrations
// -----------------------------------------------------------------------------
const TEACHER1_UID = 'teacher_alan_turing';
const TEACHER1_TOKEN = 'token_alan_turing';

const TEACHER2_UID = 'teacher_grace_hopper';
const TEACHER2_TOKEN = 'token_grace_hopper';

const TEACHER_DISCONNECTED_UID = 'teacher_no_drive';
const TEACHER_DISCONNECTED_TOKEN = 'token_no_drive';

const STUDENT_A_UID = 'student_sec_a';
const STUDENT_A_TOKEN = 'token_student_sec_a';

const STUDENT_B_UID = 'student_sec_b';
const STUDENT_B_TOKEN = 'token_student_sec_b';

const STUDENT_C_UID = 'student_sec_c';
const STUDENT_C_TOKEN = 'token_student_sec_c';

const SUBJECT1_ID = 'sub_cs301_cn';
const SUBJECT_UNASSIGNED_ID = 'sub_cs302_os';

// 1. Users
mockDb.store.users[TEACHER1_UID] = {
  name: 'Alan Turing',
  email: 'turing@uemk.ac.in',
  role: 'faculty',
  department: 'Computer Science & Engineering',
  institution: 'UEMK',
  status: 'active'
};

mockDb.store.users[TEACHER2_UID] = {
  name: 'Grace Hopper',
  email: 'hopper@uemk.ac.in',
  role: 'faculty',
  department: 'Computer Science & Engineering',
  institution: 'UEMK',
  status: 'active'
};

mockDb.store.users[TEACHER_DISCONNECTED_UID] = {
  name: 'Disconnected Teacher',
  email: 'nodrive@uemk.ac.in',
  role: 'faculty',
  department: 'Computer Science & Engineering',
  institution: 'UEMK',
  status: 'active'
};

mockDb.store.users[STUDENT_A_UID] = {
  name: 'Alice Student',
  email: 'alice@uemk.ac.in',
  role: 'student',
  department: 'Computer Science & Engineering',
  year: '3rd Year',
  section: 'Section A',
  institution: 'UEMK',
  status: 'active'
};

mockDb.store.users[STUDENT_B_UID] = {
  name: 'Bob Student',
  email: 'bob@uemk.ac.in',
  role: 'student',
  department: 'Computer Science & Engineering',
  year: '3rd Year',
  section: 'Section B',
  institution: 'UEMK',
  status: 'active'
};

mockDb.store.users[STUDENT_C_UID] = {
  name: 'Charlie Student',
  email: 'charlie@uemk.ac.in',
  role: 'student',
  department: 'Computer Science & Engineering',
  year: '3rd Year',
  section: 'Section C',
  institution: 'UEMK',
  status: 'active'
};

// 2. Auth Tokens
registerToken(TEACHER1_TOKEN, { uid: TEACHER1_UID, email: 'turing@uemk.ac.in' });
registerToken(TEACHER2_TOKEN, { uid: TEACHER2_UID, email: 'hopper@uemk.ac.in' });
registerToken(TEACHER_DISCONNECTED_TOKEN, { uid: TEACHER_DISCONNECTED_UID, email: 'nodrive@uemk.ac.in' });
registerToken(STUDENT_A_TOKEN, { uid: STUDENT_A_UID, email: 'alice@uemk.ac.in' });
registerToken(STUDENT_B_TOKEN, { uid: STUDENT_B_UID, email: 'bob@uemk.ac.in' });
registerToken(STUDENT_C_TOKEN, { uid: STUDENT_C_UID, email: 'charlie@uemk.ac.in' });

// 3. Subjects
mockDb.store.subjects[SUBJECT1_ID] = {
  id: SUBJECT1_ID,
  name: 'Computer Networks',
  code: 'CS301',
  department: 'Computer Science & Engineering',
  year: '3rd Year',
  institution: 'UEMK',
  active: true,
  createdAt: new Date().toISOString()
};

mockDb.store.subjects[SUBJECT_UNASSIGNED_ID] = {
  id: SUBJECT_UNASSIGNED_ID,
  name: 'Operating Systems',
  code: 'CS302',
  department: 'Computer Science & Engineering',
  year: '3rd Year',
  institution: 'UEMK',
  active: true,
  createdAt: new Date().toISOString()
};

// 4. Teacher Allocations: Turing teaches CSE 3rd Year Section A and Section B
mockDb.store.teacher_allocations['alloc_turing_secA'] = {
  teacherUid: TEACHER1_UID,
  teacherEmail: 'turing@uemk.ac.in',
  department: 'Computer Science & Engineering',
  year: '3rd Year',
  section: 'Section A',
  institution: 'UEMK',
  authorized: true
};

mockDb.store.teacher_allocations['alloc_turing_secB'] = {
  teacherUid: TEACHER1_UID,
  teacherEmail: 'turing@uemk.ac.in',
  department: 'Computer Science & Engineering',
  year: '3rd Year',
  section: 'Section B',
  institution: 'UEMK',
  authorized: true
};

// Hopper teaches CSE 3rd Year Section C
mockDb.store.teacher_allocations['alloc_hopper_secC'] = {
  teacherUid: TEACHER2_UID,
  teacherEmail: 'hopper@uemk.ac.in',
  department: 'Computer Science & Engineering',
  year: '3rd Year',
  section: 'Section C',
  institution: 'UEMK',
  authorized: true
};

// 5. Subject Assignments: Turing is actively assigned to CS301
mockDb.store.teacher_subject_assignments['assign_turing_cs301'] = {
  id: 'assign_turing_cs301',
  teacherUid: TEACHER1_UID,
  subjectId: SUBJECT1_ID,
  institution: 'UEMK',
  department: 'Computer Science & Engineering',
  year: '3rd Year',
  active: true,
  status: 'active',
  driveFolderId: null // Will be auto-provisioned or created
};

// Hopper is assigned to CS302
mockDb.store.teacher_subject_assignments['assign_hopper_cs302'] = {
  id: 'assign_hopper_cs302',
  teacherUid: TEACHER2_UID,
  subjectId: SUBJECT_UNASSIGNED_ID,
  institution: 'UEMK',
  department: 'Computer Science & Engineering',
  year: '3rd Year',
  active: true,
  status: 'active',
  driveFolderId: null
};

// 6. Google Drive Integrations
const ENC_KEY = process.env.TOKEN_ENCRYPTION_KEY;
const encAccess1 = encrypt('mock_access_token_turing', ENC_KEY);
const encRefresh1 = encrypt('mock_refresh_token_turing', ENC_KEY);

mockDb.store.faculty_storage_integrations[TEACHER1_UID] = {
  teacherUid: TEACHER1_UID,
  teacherEmail: 'turing@uemk.ac.in',
  provider: 'google_drive',
  status: 'connected',
  rootFolderId: 'folder_root_turing',
  rootFolderName: 'Sangam Coursework',
  courseworkFolderId: 'folder_root_turing',
  courseworkFolderName: 'Sangam Coursework',
  encryptedAccessToken: encAccess1.encryptedData,
  accessTokenIv: encAccess1.iv,
  accessTokenAuthTag: encAccess1.authTag,
  encryptedRefreshToken: encRefresh1.encryptedData,
  refreshTokenIv: encRefresh1.iv,
  refreshTokenAuthTag: encRefresh1.authTag,
  tokenExpiresAt: Date.now() + 3600 * 1000,
  updatedAt: new Date().toISOString()
};

const encAccess2 = encrypt('mock_access_token_hopper', ENC_KEY);
const encRefresh2 = encrypt('mock_refresh_token_hopper', ENC_KEY);

mockDb.store.faculty_storage_integrations[TEACHER2_UID] = {
  teacherUid: TEACHER2_UID,
  teacherEmail: 'hopper@uemk.ac.in',
  provider: 'google_drive',
  status: 'connected',
  rootFolderId: 'folder_root_hopper',
  rootFolderName: 'Sangam Coursework',
  courseworkFolderId: 'folder_root_hopper',
  courseworkFolderName: 'Sangam Coursework',
  encryptedAccessToken: encAccess2.encryptedData,
  accessTokenIv: encAccess2.iv,
  accessTokenAuthTag: encAccess2.authTag,
  encryptedRefreshToken: encRefresh2.encryptedData,
  refreshTokenIv: encRefresh2.iv,
  refreshTokenAuthTag: encRefresh2.authTag,
  tokenExpiresAt: Date.now() + 3600 * 1000,
  updatedAt: new Date().toISOString()
};

// Wire up global fetch redirection for client wrappers in Node test environment
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  let url = typeof input === 'string' ? input : input.url;
  if (url.startsWith('http://localhost:3001')) {
    url = url.replace('http://localhost:3001', baseUrl);
  }
  return originalFetch(url, init);
};

// =============================================================================
// TEST SUITE EXECUTION
// =============================================================================

let uploadedDraftFileId1 = null;
let uploadedDraftFileId2 = null;
let t2UploadedDraftFileId = null;

// -----------------------------------------------------------------------------
// SECTION 1: Authentication & Authorization Controls
// -----------------------------------------------------------------------------
console.log('--- SECTION 1: Authentication & Role Enforcement ---');

await runAsyncTest('1.1: GET /drive/files rejects unauthenticated request (401)', async () => {
  const res = await apiRequest({
    method: 'GET',
    path: `/api/study-materials/drive/files?subjectId=${SUBJECT1_ID}`
  });
  assert.strictEqual(res.status, 401);
});

await runAsyncTest('1.2: POST /drive/upload rejects unauthenticated request (401)', async () => {
  const res = await apiMultipartRequest({
    path: '/api/study-materials/drive/upload',
    fields: { subjectId: SUBJECT1_ID },
    file: { filename: 'test.pdf', buffer: Buffer.from('%PDF-1.4 test') }
  });
  assert.strictEqual(res.status, 401);
});

await runAsyncTest('1.3: POST /publish-from-drive rejects unauthenticated request (401)', async () => {
  const res = await apiRequest({
    method: 'POST',
    path: '/api/study-materials/publish-from-drive',
    body: { subjectId: SUBJECT1_ID, driveFileId: 'any_id' }
  });
  assert.strictEqual(res.status, 401);
});

await runAsyncTest('1.4: Student role rejected from /drive/files (403 Forbidden)', async () => {
  const res = await apiRequest({
    method: 'GET',
    path: `/api/study-materials/drive/files?subjectId=${SUBJECT1_ID}`,
    token: STUDENT_A_TOKEN
  });
  assert.strictEqual(res.status, 403);
  assert.strictEqual(res.body.code, 'FORBIDDEN_ROLE');
});

await runAsyncTest('1.5: Student role rejected from /drive/upload (403 Forbidden)', async () => {
  const res = await apiMultipartRequest({
    path: '/api/study-materials/drive/upload',
    token: STUDENT_A_TOKEN,
    fields: { subjectId: SUBJECT1_ID },
    file: { filename: 'test.pdf', buffer: Buffer.from('%PDF-1.4 test') }
  });
  assert.strictEqual(res.status, 403);
  assert.strictEqual(res.body.code, 'FORBIDDEN_ROLE');
});

await runAsyncTest('1.6: Student role rejected from /publish-from-drive (403 Forbidden)', async () => {
  const res = await apiRequest({
    method: 'POST',
    path: '/api/study-materials/publish-from-drive',
    token: STUDENT_A_TOKEN,
    body: { subjectId: SUBJECT1_ID, driveFileId: 'any_id' }
  });
  assert.strictEqual(res.status, 403);
  assert.strictEqual(res.body.code, 'FORBIDDEN_ROLE');
});

await runAsyncTest('1.7: Disconnected Drive teacher receives 424 DRIVE_NOT_CONNECTED', async () => {
  // Disconnected teacher has no integration record
  mockDb.store.teacher_subject_assignments['assign_nodrive_cs301'] = {
    teacherUid: TEACHER_DISCONNECTED_UID,
    subjectId: SUBJECT1_ID,
    active: true,
    status: 'active'
  };

  const res = await apiRequest({
    method: 'GET',
    path: `/api/study-materials/drive/files?subjectId=${SUBJECT1_ID}`,
    token: TEACHER_DISCONNECTED_TOKEN
  });
  assert.strictEqual(res.status, 424);
  assert.strictEqual(res.body.code, 'DRIVE_NOT_CONNECTED');
});

// -----------------------------------------------------------------------------
// SECTION 2: Active Subject Assignment & Revocation Enforcement
// -----------------------------------------------------------------------------
console.log('\n--- SECTION 2: Subject Assignment & Revocation ---');

await runAsyncTest('2.1: Teacher querying unassigned subject is rejected with 403 FORBIDDEN_SUBJECT', async () => {
  // Turing is assigned to CS301, NOT CS302
  const res = await apiRequest({
    method: 'GET',
    path: `/api/study-materials/drive/files?subjectId=${SUBJECT_UNASSIGNED_ID}`,
    token: TEACHER1_TOKEN
  });
  assert.strictEqual(res.status, 403);
  assert.strictEqual(res.body.code, 'FORBIDDEN_SUBJECT');
});

await runAsyncTest('2.2: Teacher uploading to unassigned subject is rejected with 403 FORBIDDEN_SUBJECT', async () => {
  const res = await apiMultipartRequest({
    path: '/api/study-materials/drive/upload',
    token: TEACHER1_TOKEN,
    fields: { subjectId: SUBJECT_UNASSIGNED_ID },
    file: { filename: 'test.pdf', buffer: Buffer.from('%PDF-1.4 test') }
  });
  assert.strictEqual(res.status, 403);
  assert.strictEqual(res.body.code, 'FORBIDDEN_SUBJECT');
});

await runAsyncTest('2.3: Teacher publishing to unassigned subject is rejected with 403 FORBIDDEN_SUBJECT', async () => {
  const res = await apiRequest({
    method: 'POST',
    path: '/api/study-materials/publish-from-drive',
    token: TEACHER1_TOKEN,
    body: { subjectId: SUBJECT_UNASSIGNED_ID, driveFileId: 'dummy_file_id' }
  });
  assert.strictEqual(res.status, 403);
  assert.strictEqual(res.body.code, 'FORBIDDEN_SUBJECT');
});

// -----------------------------------------------------------------------------
// SECTION 3: File Listing & Draft Upload (PDF Only, <= 25MB)
// -----------------------------------------------------------------------------
console.log('\n--- SECTION 3: File Listing & Draft Upload ---');

await runAsyncTest('3.1: Initial file listing returns empty array and provisions subject folder', async () => {
  const res = await apiRequest({
    method: 'GET',
    path: `/api/study-materials/drive/files?subjectId=${SUBJECT1_ID}`,
    token: TEACHER1_TOKEN
  });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.success, true);
  assert.ok(res.body.folderId, 'Must return provisioned folderId');
  assert.strictEqual(res.body.folderName, '[CS301] Computer Networks');
  assert.deepStrictEqual(res.body.files, []);
});

await runAsyncTest('3.2: Uploading valid PDF draft succeeds (201 Created) without creating study_materials document', async () => {
  const initialStudyMatsCount = Object.keys(mockDb.store.study_materials).length;
  const pdfBuffer = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF');

  const res = await apiMultipartRequest({
    path: '/api/study-materials/drive/upload',
    token: TEACHER1_TOKEN,
    fields: { subjectId: SUBJECT1_ID },
    file: { filename: 'Unit1_OSI_Model.pdf', buffer: pdfBuffer, mime: 'application/pdf' }
  });

  assert.strictEqual(res.status, 201);
  assert.strictEqual(res.body.success, true);
  assert.ok(res.body.file.id, 'Must return Drive file id');
  assert.strictEqual(res.body.file.name, 'Unit1_OSI_Model.pdf');
  uploadedDraftFileId1 = res.body.file.id;

  // CRITICAL CHECK: ZERO study_materials documents created on draft upload!
  const finalStudyMatsCount = Object.keys(mockDb.store.study_materials).length;
  assert.strictEqual(finalStudyMatsCount, initialStudyMatsCount, 'Draft upload must NOT create study_materials document');
});

await runAsyncTest('3.3: Rejects non-PDF file upload with 400 INVALID_FILE_TYPE', async () => {
  const res = await apiMultipartRequest({
    path: '/api/study-materials/drive/upload',
    token: TEACHER1_TOKEN,
    fields: { subjectId: SUBJECT1_ID },
    file: { filename: 'malware.exe', buffer: Buffer.from('MZ...'), mime: 'application/x-msdownload' }
  });

  assert.strictEqual(res.status, 400);
  assert.strictEqual(res.body.code, 'INVALID_FILE_TYPE');
});

await runAsyncTest('3.4: Rejects file exceeding 25MB limit with 413 FILE_TOO_LARGE', async () => {
  // Test route-level / multer-level or service-level rejection
  const oversizedBuffer = Buffer.alloc(MAX_STUDY_MATERIAL_FILE_SIZE + 1024);

  const res = await apiMultipartRequest({
    path: '/api/study-materials/drive/upload',
    token: TEACHER1_TOKEN,
    fields: { subjectId: SUBJECT1_ID },
    file: { filename: 'huge_book.pdf', buffer: oversizedBuffer, mime: 'application/pdf' }
  });

  assert.strictEqual(res.status, 413);
  assert.strictEqual(res.body.code, 'FILE_TOO_LARGE');
});

await runAsyncTest('3.5: Listing files reflects uploaded draft with isPublished: false', async () => {
  const res = await apiRequest({
    method: 'GET',
    path: `/api/study-materials/drive/files?subjectId=${SUBJECT1_ID}`,
    token: TEACHER1_TOKEN
  });

  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.files.length, 1);
  const fileEntry = res.body.files[0];
  assert.strictEqual(fileEntry.id, uploadedDraftFileId1);
  assert.strictEqual(fileEntry.name, 'Unit1_OSI_Model.pdf');
  assert.strictEqual(fileEntry.isPublished, false, 'Draft must have isPublished === false');
  assert.deepStrictEqual(fileEntry.publications, [], 'Draft must have empty publications array');
});

// -----------------------------------------------------------------------------
// SECTION 4: Draft Isolation — Students Cannot See or Access Drafts
// -----------------------------------------------------------------------------
console.log('\n--- SECTION 4: Student Draft Invisibility ---');

await runAsyncTest('4.1: Students query GET /api/study-materials receives 0 materials while files are in draft state', async () => {
  const res = await apiRequest({
    method: 'GET',
    path: '/api/study-materials',
    token: STUDENT_A_TOKEN
  });

  assert.strictEqual(res.status, 200);
  assert.deepStrictEqual(res.body.materials, [], 'Student must receive empty list while file is unpublished draft');
});

await runAsyncTest('4.2: Direct download attempt for unpublished draft file ID fails (404 Not Found)', async () => {
  // Since no study_materials document exists for draft, download endpoint returns 404
  const res = await apiRequest({
    method: 'GET',
    path: `/api/study-materials/${uploadedDraftFileId1}/download`,
    token: STUDENT_A_TOKEN
  });

  assert.strictEqual(res.status, 404);
  assert.strictEqual(res.body.code, 'MATERIAL_NOT_FOUND');
});

// -----------------------------------------------------------------------------
// SECTION 5: Publishing Existing Drive File Without Duplication
// -----------------------------------------------------------------------------
console.log('\n--- SECTION 5: Publishing Existing Drive File Without Duplication ---');

let publishedMat1 = null;

await runAsyncTest('5.1: Publish existing Drive file for Year-Wide scope succeeds (201 Created)', async () => {
  const driveFilesBefore = mockDriveApi.files.size;

  const res = await apiRequest({
    method: 'POST',
    path: '/api/study-materials/publish-from-drive',
    token: TEACHER1_TOKEN,
    body: {
      subjectId: SUBJECT1_ID,
      driveFileId: uploadedDraftFileId1,
      title: 'OSI Reference Model Lecture Notes',
      scope: 'year',
      category: 'Lecture Notes',
      description: 'Comprehensive 7-layer architecture guide'
    }
  });

  assert.strictEqual(res.status, 201);
  assert.strictEqual(res.body.success, true);
  publishedMat1 = res.body.material;
  assert.strictEqual(publishedMat1.driveFileId, uploadedDraftFileId1);
  assert.strictEqual(publishedMat1.scope, 'year');
  assert.strictEqual(publishedMat1.isYearWide, true);
  assert.strictEqual(publishedMat1.isPublished, true);

  // CRITICAL CHECK: No duplicate files created in Drive!
  const driveFilesAfter = mockDriveApi.files.size;
  assert.strictEqual(driveFilesAfter, driveFilesBefore, 'Drive file count must not increase on publish');
});

await runAsyncTest('5.2: File listing now reflects isPublished: true and contains publication metadata', async () => {
  const res = await apiRequest({
    method: 'GET',
    path: `/api/study-materials/drive/files?subjectId=${SUBJECT1_ID}`,
    token: TEACHER1_TOKEN
  });

  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.files.length, 1);
  const fileEntry = res.body.files[0];
  assert.strictEqual(fileEntry.id, uploadedDraftFileId1);
  assert.strictEqual(fileEntry.isPublished, true);
  assert.strictEqual(fileEntry.publications.length, 1);
  assert.strictEqual(fileEntry.publications[0].scope, 'year');
  assert.strictEqual(fileEntry.publications[0].title, 'OSI Reference Model Lecture Notes');
});

await runAsyncTest('5.3: Year-Wide published material is immediately visible to students in CSE 3rd Year', async () => {
  // Alice in Section A
  const resA = await apiRequest({
    method: 'GET',
    path: '/api/study-materials',
    token: STUDENT_A_TOKEN
  });
  assert.strictEqual(resA.status, 200);
  assert.strictEqual(resA.body.materials.length, 1);
  assert.strictEqual(resA.body.materials[0].title, 'OSI Reference Model Lecture Notes');

  // Bob in Section B
  const resB = await apiRequest({
    method: 'GET',
    path: '/api/study-materials',
    token: STUDENT_B_TOKEN
  });
  assert.strictEqual(resB.status, 200);
  assert.strictEqual(resB.body.materials.length, 1);
});

await runAsyncTest('5.4: Attempting to re-publish the SAME file for Year-Wide scope is rejected (409 ALREADY_PUBLISHED)', async () => {
  const res = await apiRequest({
    method: 'POST',
    path: '/api/study-materials/publish-from-drive',
    token: TEACHER1_TOKEN,
    body: {
      subjectId: SUBJECT1_ID,
      driveFileId: uploadedDraftFileId1,
      title: 'Duplicate Attempt',
      scope: 'year'
    }
  });

  assert.strictEqual(res.status, 409);
  assert.strictEqual(res.body.code, 'ALREADY_PUBLISHED');
});

// -----------------------------------------------------------------------------
// SECTION 6: Publishing Same File to Different Authorized Sections
// -----------------------------------------------------------------------------
console.log('\n--- SECTION 6: Publishing Same File to Different Sections ---');

await runAsyncTest('6.1: Upload second draft file: Lab_Assignment_1.pdf', async () => {
  const pdfBuffer = Buffer.from('%PDF-1.4\nLab 1 Socket Programming');
  const res = await apiMultipartRequest({
    path: '/api/study-materials/drive/upload',
    token: TEACHER1_TOKEN,
    fields: { subjectId: SUBJECT1_ID },
    file: { filename: 'Lab_Assignment_1.pdf', buffer: pdfBuffer, mime: 'application/pdf' }
  });

  assert.strictEqual(res.status, 201);
  uploadedDraftFileId2 = res.body.file.id;
});

await runAsyncTest('6.2: Publish file to Section A succeeds (201 Created)', async () => {
  const res = await apiRequest({
    method: 'POST',
    path: '/api/study-materials/publish-from-drive',
    token: TEACHER1_TOKEN,
    body: {
      subjectId: SUBJECT1_ID,
      driveFileId: uploadedDraftFileId2,
      title: 'Socket Programming Lab (Sec A)',
      scope: 'section',
      section: 'Section A',
      category: 'Lab Manual'
    }
  });

  assert.strictEqual(res.status, 201);
  assert.strictEqual(res.body.material.scope, 'section');
  assert.strictEqual(res.body.material.section, 'Section A');
});

await runAsyncTest('6.3: Publish SAME file to Section B succeeds without re-uploading or duplicating Drive file', async () => {
  const driveFilesBefore = mockDriveApi.files.size;

  const res = await apiRequest({
    method: 'POST',
    path: '/api/study-materials/publish-from-drive',
    token: TEACHER1_TOKEN,
    body: {
      subjectId: SUBJECT1_ID,
      driveFileId: uploadedDraftFileId2,
      title: 'Socket Programming Lab (Sec B)',
      scope: 'section',
      section: 'Section B',
      category: 'Lab Manual'
    }
  });

  assert.strictEqual(res.status, 201);
  assert.strictEqual(res.body.material.scope, 'section');
  assert.strictEqual(res.body.material.section, 'Section B');
  assert.strictEqual(res.body.material.driveFileId, uploadedDraftFileId2);

  // Verify Drive file was not duplicated
  assert.strictEqual(mockDriveApi.files.size, driveFilesBefore);
});

await runAsyncTest('6.4: Re-publishing to Section A again is rejected with 409 ALREADY_PUBLISHED', async () => {
  const res = await apiRequest({
    method: 'POST',
    path: '/api/study-materials/publish-from-drive',
    token: TEACHER1_TOKEN,
    body: {
      subjectId: SUBJECT1_ID,
      driveFileId: uploadedDraftFileId2,
      title: 'Repeat Publication to Section A',
      scope: 'section',
      section: 'Section A'
    }
  });

  assert.strictEqual(res.status, 409);
  assert.strictEqual(res.body.code, 'ALREADY_PUBLISHED');
});

await runAsyncTest('6.5: Listing files reflects both Section A and Section B publications on the same Drive file', async () => {
  const res = await apiRequest({
    method: 'GET',
    path: `/api/study-materials/drive/files?subjectId=${SUBJECT1_ID}`,
    token: TEACHER1_TOKEN
  });

  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.files.length, 2);

  const labFile = res.body.files.find(f => f.id === uploadedDraftFileId2);
  assert.ok(labFile);
  assert.strictEqual(labFile.isPublished, true);
  assert.strictEqual(labFile.publications.length, 2);

  const sections = labFile.publications.map(p => p.section).sort();
  assert.deepStrictEqual(sections, ['Section A', 'Section B']);
});

await runAsyncTest('6.6: Section-specific scoping enforces student access boundaries', async () => {
  // Alice (Section A) sees OSI Notes (year-wide) + Lab (Sec A), NOT Sec B
  const resA = await apiRequest({
    method: 'GET',
    path: '/api/study-materials',
    token: STUDENT_A_TOKEN
  });
  const titlesA = resA.body.materials.map(m => m.title);
  assert.ok(titlesA.includes('OSI Reference Model Lecture Notes'));
  assert.ok(titlesA.includes('Socket Programming Lab (Sec A)'));
  assert.ok(!titlesA.includes('Socket Programming Lab (Sec B)'));

  // Bob (Section B) sees OSI Notes (year-wide) + Lab (Sec B), NOT Sec A
  const resB = await apiRequest({
    method: 'GET',
    path: '/api/study-materials',
    token: STUDENT_B_TOKEN
  });
  const titlesB = resB.body.materials.map(m => m.title);
  assert.ok(titlesB.includes('OSI Reference Model Lecture Notes'));
  assert.ok(titlesB.includes('Socket Programming Lab (Sec B)'));
  assert.ok(!titlesB.includes('Socket Programming Lab (Sec A)'));

  // Charlie (Section C) sees only the Year-Wide OSI Notes, NEITHER Section A nor Section B lab
  const resC = await apiRequest({
    method: 'GET',
    path: '/api/study-materials',
    token: STUDENT_C_TOKEN
  });
  const titlesC = resC.body.materials.map(m => m.title);
  assert.ok(titlesC.includes('OSI Reference Model Lecture Notes'));
  assert.strictEqual(titlesC.length, 1);
});

// -----------------------------------------------------------------------------
// SECTION 7: Cross-Teacher File Hijacking & Trashed File Prevention
// -----------------------------------------------------------------------------
console.log("\n--- SECTION 7: Preventing Publication of Another Teacher's File ---");

await runAsyncTest('7.1: Teacher 2 uploads a file to their own subject folder', async () => {
  const pdfBuffer = Buffer.from('%PDF-1.4\nHopper Operating Systems Draft');
  const res = await apiMultipartRequest({
    path: '/api/study-materials/drive/upload',
    token: TEACHER2_TOKEN,
    fields: { subjectId: SUBJECT_UNASSIGNED_ID },
    file: { filename: 'OS_Kernel_Draft.pdf', buffer: pdfBuffer, mime: 'application/pdf' }
  });

  assert.strictEqual(res.status, 201);
  t2UploadedDraftFileId = res.body.file.id;
  assert.ok(t2UploadedDraftFileId);
});

await runAsyncTest('7.2: Teacher 1 attempting to publish Teacher 2 file is rejected with 403 UNAUTHORIZED_FILE_ACCESS', async () => {
  // Teacher 1 attempts to pass Teacher 2's driveFileId under Teacher 1's subject CS301
  const res = await apiRequest({
    method: 'POST',
    path: '/api/study-materials/publish-from-drive',
    token: TEACHER1_TOKEN,
    body: {
      subjectId: SUBJECT1_ID,
      driveFileId: t2UploadedDraftFileId,
      title: 'Stolen File Attempt',
      scope: 'year'
    }
  });

  assert.strictEqual(res.status, 403);
  assert.strictEqual(res.body.code, 'UNAUTHORIZED_FILE_ACCESS');
});

await runAsyncTest('7.3: Publishing non-existent Drive file is rejected with 404 FILE_NOT_FOUND', async () => {
  const res = await apiRequest({
    method: 'POST',
    path: '/api/study-materials/publish-from-drive',
    token: TEACHER1_TOKEN,
    body: {
      subjectId: SUBJECT1_ID,
      driveFileId: 'drive_file_ghost_99999',
      title: 'Ghost File',
      scope: 'year'
    }
  });

  assert.strictEqual(res.status, 404);
  assert.strictEqual(res.body.code, 'FILE_NOT_FOUND');
});

await runAsyncTest('7.4: Publishing a trashed Drive file is rejected with 404 FILE_NOT_FOUND', async () => {
  // Upload a file and mark it trashed in Drive
  const pdfBuffer = Buffer.from('%PDF-1.4\nTrashed file');
  const upRes = await apiMultipartRequest({
    path: '/api/study-materials/drive/upload',
    token: TEACHER1_TOKEN,
    fields: { subjectId: SUBJECT1_ID },
    file: { filename: 'to_be_trashed.pdf', buffer: pdfBuffer, mime: 'application/pdf' }
  });
  const trashedId = upRes.body.file.id;

  // Mark file trashed in Mock Drive
  const fileRecord = mockDriveApi.files.get(trashedId);
  fileRecord.trashed = true;

  const res = await apiRequest({
    method: 'POST',
    path: '/api/study-materials/publish-from-drive',
    token: TEACHER1_TOKEN,
    body: {
      subjectId: SUBJECT1_ID,
      driveFileId: trashedId,
      title: 'Publish Trashed',
      scope: 'year'
    }
  });

  assert.strictEqual(res.status, 404);
  assert.strictEqual(res.body.code, 'FILE_NOT_FOUND');
});

// -----------------------------------------------------------------------------
// SECTION 8: Scope and Teacher Allocation Validation
// -----------------------------------------------------------------------------
console.log('\n--- SECTION 8: Scope & Allocation Validation ---');

await runAsyncTest('8.1: Publishing with scope: section but missing section parameter is rejected with 400 MISSING_SECTION', async () => {
  const res = await apiRequest({
    method: 'POST',
    path: '/api/study-materials/publish-from-drive',
    token: TEACHER1_TOKEN,
    body: {
      subjectId: SUBJECT1_ID,
      driveFileId: uploadedDraftFileId1,
      title: 'Missing Section Parameter',
      scope: 'section'
    }
  });

  assert.strictEqual(res.status, 400);
  assert.strictEqual(res.body.code, 'MISSING_SECTION');
});

await runAsyncTest('8.2: Publishing to a section where teacher lacks allocation is rejected with 403 FORBIDDEN_SCOPE', async () => {
  // Turing is allocated to Section A and Section B, NOT Section C
  const res = await apiRequest({
    method: 'POST',
    path: '/api/study-materials/publish-from-drive',
    token: TEACHER1_TOKEN,
    body: {
      subjectId: SUBJECT1_ID,
      driveFileId: uploadedDraftFileId2,
      title: 'Unauthorized Section Attempt',
      scope: 'section',
      section: 'Section C'
    }
  });

  assert.strictEqual(res.status, 403);
  assert.strictEqual(res.body.code, 'FORBIDDEN_SCOPE');
});

await runAsyncTest('8.3: Revoking teacher subject assignment immediately blocks publishing, uploading, and listing', async () => {
  // Revoke Turing's assignment for CS301
  mockDb.store.teacher_subject_assignments['assign_turing_cs301'].active = false;
  mockDb.store.teacher_subject_assignments['assign_turing_cs301'].status = 'revoked';

  // 1. Listing rejected
  const listRes = await apiRequest({
    method: 'GET',
    path: `/api/study-materials/drive/files?subjectId=${SUBJECT1_ID}`,
    token: TEACHER1_TOKEN
  });
  assert.strictEqual(listRes.status, 403);
  assert.strictEqual(listRes.body.code, 'FORBIDDEN_SUBJECT');

  // 2. Upload rejected
  const upRes = await apiMultipartRequest({
    path: '/api/study-materials/drive/upload',
    token: TEACHER1_TOKEN,
    fields: { subjectId: SUBJECT1_ID },
    file: { filename: 'revoked_upload.pdf', buffer: Buffer.from('%PDF-1.4 test') }
  });
  assert.strictEqual(upRes.status, 403);
  assert.strictEqual(upRes.body.code, 'FORBIDDEN_SUBJECT');

  // 3. Publish rejected
  const pubRes = await apiRequest({
    method: 'POST',
    path: '/api/study-materials/publish-from-drive',
    token: TEACHER1_TOKEN,
    body: {
      subjectId: SUBJECT1_ID,
      driveFileId: uploadedDraftFileId1,
      title: 'Revoked Publish',
      scope: 'year'
    }
  });
  assert.strictEqual(pubRes.status, 403);
  assert.strictEqual(pubRes.body.code, 'FORBIDDEN_SUBJECT');

  // Restore for subsequent checks
  mockDb.store.teacher_subject_assignments['assign_turing_cs301'].active = true;
  mockDb.store.teacher_subject_assignments['assign_turing_cs301'].status = 'active';
});

// -----------------------------------------------------------------------------
// SECTION 9: Client Wrappers Validation
// -----------------------------------------------------------------------------
console.log('\n--- SECTION 9: Client Service Wrappers ---');

await runAsyncTest('9.1: Client wrappers client-side validation rejects invalid inputs', async () => {
  // fetchDriveSubjectFiles requires subjectId
  await assert.rejects(
    async () => await fetchDriveSubjectFiles(''),
    /subjectId is required/
  );

  // uploadToDriveFolder requires subjectId and file
  await assert.rejects(
    async () => await uploadToDriveFolder('', {}),
    /subjectId is required/
  );
  await assert.rejects(
    async () => await uploadToDriveFolder(SUBJECT1_ID, null),
    /File is required/
  );

  // publishFromDriveFile requires subjectId and driveFileId
  await assert.rejects(
    async () => await publishFromDriveFile({ subjectId: '', driveFileId: '123' }),
    /subjectId is required/
  );
  await assert.rejects(
    async () => await publishFromDriveFile({ subjectId: SUBJECT1_ID, driveFileId: '' }),
    /driveFileId is required/
  );
});

await runAsyncTest('9.2: fetchDriveSubjectFiles wrapper fetches files over HTTP', async () => {
  // Configure clientAuth mock
  clientAuth.currentUser = {
    getIdToken: async () => TEACHER1_TOKEN
  };

  const data = await fetchDriveSubjectFiles(SUBJECT1_ID);
  assert.strictEqual(data.success, true);
  assert.ok(data.folderId);
  assert.strictEqual(data.folderName, '[CS301] Computer Networks');
  assert.ok(Array.isArray(data.files));
  assert.strictEqual(data.files.length, 2);
});

await runAsyncTest('9.3: uploadToDriveFolder wrapper uploads PDF draft over HTTP', async () => {
  clientAuth.currentUser = {
    getIdToken: async () => TEACHER1_TOKEN
  };

  const fileBlob = new Blob(['%PDF-1.4\nClient Wrapper Upload Test'], { type: 'application/pdf' });
  fileBlob.name = 'client_wrapper_test.pdf';

  const uploadedFile = await uploadToDriveFolder(SUBJECT1_ID, fileBlob);
  assert.ok(uploadedFile);
  assert.ok(uploadedFile.id);
  assert.strictEqual(uploadedFile.name, 'client_wrapper_test.pdf');
});

await runAsyncTest('9.4: publishFromDriveFile wrapper publishes file over HTTP', async () => {
  clientAuth.currentUser = {
    getIdToken: async () => TEACHER2_TOKEN
  };

  // Hopper publishes t2UploadedDraftFileId for Section C
  const published = await publishFromDriveFile({
    subjectId: SUBJECT_UNASSIGNED_ID,
    driveFileId: t2UploadedDraftFileId,
    title: 'Operating Systems Kernel Design',
    scope: 'section',
    section: 'Section C',
    category: 'Lecture Notes',
    description: 'Published via client wrapper'
  });

  assert.ok(published);
  assert.strictEqual(published.title, 'Operating Systems Kernel Design');
  assert.strictEqual(published.section, 'Section C');
  assert.strictEqual(published.isPublished, true);
});

// -----------------------------------------------------------------------------
// CLEANUP & SUMMARY
// -----------------------------------------------------------------------------
if (testServer) {
  await new Promise((resolve) => testServer.close(resolve));
}
globalThis.fetch = originalFetch;

console.log('\n======================================================');
console.log(` SUMMARY: ${passed} passed, ${failed} failed`);
console.log('======================================================\n');

if (failed > 0) {
  process.exit(1);
}
