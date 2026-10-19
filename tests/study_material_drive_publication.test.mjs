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
import {
  fetchDriveSubjectFiles,
  publishFromDriveFile,
  formatFileSize,
  formatDate
} from '../src/services/studyMaterialService.js';

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
console.log(' SANGAM PHASE D — STUDY MATERIAL DRIVE PUBLICATION');
console.log(' Selection, Scoping, Publication Lifecycle & Security');
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
          data: () => JSON.parse(JSON.stringify(d))
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
}

const mockDb = new MockFirestore();
subjectService.setTestDb(mockDb);
studyMaterialService.setTestDb(mockDb);
googleDriveService.setTestDb(mockDb);

// -----------------------------------------------------------------------------
// Mock Google Drive API
// -----------------------------------------------------------------------------
class MockDriveApi {
  constructor() {
    this.folders = new Map();
    this.files = new Map();

    // Seed root coursework folder
    this.folders.set('folder_root_sharma', {
      id: 'folder_root_sharma',
      name: 'Sangam Coursework',
      parents: ['root'],
      trashed: false
    });
  }

  async verifyFolder(folderId, accessToken) {
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

// Fetch redirect for client wrappers
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  let url = typeof input === 'string' ? input : input.url;
  if (url.startsWith('http://localhost:3001')) {
    url = url.replace('http://localhost:3001', baseUrl);
  }
  return originalFetch(url, init);
};

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
  const body = Buffer.concat(parts);
  const contentType = `multipart/form-data; boundary=${boundary}`;
  return { body, contentType };
}

async function apiMultipartRequest({ path: reqPath, token, fields, file }) {
  const url = new URL(reqPath, baseUrl);
  const { body, contentType } = createMultipartPayload(fields, file);
  const headers = {
    'Content-Type': contentType,
    'Content-Length': body.length
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  return new Promise((resolve, reject) => {
    const req = http.request(url, { method: 'POST', headers }, (res) => {
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
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// -----------------------------------------------------------------------------
// Seed Data: Teacher Sharma, Students, Subjects, Allocations
// -----------------------------------------------------------------------------
const TEACHER_UID = 'teacher_sharma';
const TEACHER_TOKEN = 'token_sharma';
const STUDENT_A_UID = 'student_arjun_sec_a';
const STUDENT_A_TOKEN = 'token_arjun_sec_a';
const STUDENT_B_UID = 'student_riya_sec_b';
const STUDENT_B_TOKEN = 'token_riya_sec_b';
const STUDENT_C_UID = 'student_kavita_sec_c';
const STUDENT_C_TOKEN = 'token_kavita_sec_c';

const SUBJECT_ID = 'sub_cs302_algo';

registerToken(TEACHER_TOKEN, { uid: TEACHER_UID, email: 'r.sharma@uem.edu' });
registerToken(STUDENT_A_TOKEN, { uid: STUDENT_A_UID, email: 'arjun@student.uem.edu' });
registerToken(STUDENT_B_TOKEN, { uid: STUDENT_B_UID, email: 'riya@student.uem.edu' });
registerToken(STUDENT_C_TOKEN, { uid: STUDENT_C_UID, email: 'kavita@student.uem.edu' });

mockDb.store.users[TEACHER_UID] = {
  uid: TEACHER_UID,
  name: 'Dr. R. Sharma',
  email: 'r.sharma@uem.edu',
  role: 'faculty',
  institution: 'UEMK',
  department: 'Computer Science',
  status: 'active'
};

mockDb.store.users[STUDENT_A_UID] = {
  uid: STUDENT_A_UID,
  name: 'Arjun Gupta',
  email: 'arjun@student.uem.edu',
  role: 'student',
  institution: 'UEMK',
  department: 'Computer Science',
  year: '3rd Year',
  section: 'Section A',
  status: 'active'
};

mockDb.store.users[STUDENT_B_UID] = {
  uid: STUDENT_B_UID,
  name: 'Riya Roy',
  email: 'riya@student.uem.edu',
  role: 'student',
  institution: 'UEMK',
  department: 'Computer Science',
  year: '3rd Year',
  section: 'Section B',
  status: 'active'
};

mockDb.store.users[STUDENT_C_UID] = {
  uid: STUDENT_C_UID,
  name: 'Kavita Patel',
  email: 'kavita@student.uem.edu',
  role: 'student',
  institution: 'UEMK',
  department: 'Computer Science',
  year: '3rd Year',
  section: 'Section C',
  status: 'active'
};

// Teacher Allocations: Sharma teaches Sections A and B in CSE 3rd Year
mockDb.store.teacher_allocations['alloc_sharma_3a'] = {
  teacherUid: TEACHER_UID,
  teacherEmail: 'r.sharma@uem.edu',
  institution: 'UEMK',
  department: 'Computer Science',
  year: '3rd Year',
  section: 'Section A',
  authorized: true
};

mockDb.store.teacher_allocations['alloc_sharma_3b'] = {
  teacherUid: TEACHER_UID,
  teacherEmail: 'r.sharma@uem.edu',
  institution: 'UEMK',
  department: 'Computer Science',
  year: '3rd Year',
  section: 'Section B',
  authorized: true
};

// Subject: Advanced Algorithms (CS302)
mockDb.store.subjects[SUBJECT_ID] = {
  id: SUBJECT_ID,
  name: 'Advanced Algorithms',
  code: 'CS302',
  institution: 'UEMK',
  department: 'Computer Science',
  year: '3rd Year',
  active: true,
  createdAt: new Date().toISOString()
};

// Teacher-Subject Assignment
mockDb.store.teacher_subject_assignments['assign_sharma_cs302'] = {
  id: 'assign_sharma_cs302',
  subjectId: SUBJECT_ID,
  teacherUid: TEACHER_UID,
  institution: 'UEMK',
  department: 'Computer Science',
  year: '3rd Year',
  status: 'active',
  active: true,
  scope: 'all'
};

// Google Drive Integration for Teacher Sharma
const encKey = process.env.TOKEN_ENCRYPTION_KEY;
const encAccess = encrypt('mock_access_token_sharma', encKey);
const encRefresh = encrypt('mock_refresh_token_sharma', encKey);

mockDb.store.faculty_storage_integrations[TEACHER_UID] = {
  teacherUid: TEACHER_UID,
  teacherEmail: 'r.sharma@uem.edu',
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

// =============================================================================
// TEST EXECUTION
// =============================================================================

let uploadedDraft1 = null;
let uploadedDraft2 = null;
let publishedYearWide = null;
let publishedSecA = null;
let publishedSecB = null;

// -----------------------------------------------------------------------------
// SECTION 1: Drive File Selection & Publication Workflow
// -----------------------------------------------------------------------------
console.log('--- SECTION 1: Drive File Selection & Publication Workflow ---');

await runAsyncTest('1.1: Teacher uploads private draft PDF to subject Drive folder', async () => {
  const dummyBuffer = Buffer.from('%PDF-1.4 Mock Algorithms Lecture Notes Draft Content');
  const uploadRes = await apiMultipartRequest({
    path: '/api/study-materials/drive/upload',
    token: TEACHER_TOKEN,
    fields: { subjectId: SUBJECT_ID },
    file: { filename: 'Algo_Dynamic_Programming.pdf', buffer: dummyBuffer }
  });

  assert.strictEqual(uploadRes.status, 201);
  assert.strictEqual(uploadRes.body.success, true);
  uploadedDraft1 = uploadRes.body.file;
  assert.ok(uploadedDraft1.id);
  assert.strictEqual(uploadedDraft1.name, 'Algo_Dynamic_Programming.pdf');

  // Verify file in mock drive
  assert.strictEqual(mockDriveApi.files.size, 1);

  // Verify zero study_materials docs created (private draft)
  assert.strictEqual(Object.keys(mockDb.store.study_materials).length, 0);

  // Verify student cannot see draft in study materials list
  const studentListRes = await apiRequest({
    method: 'GET',
    path: '/api/study-materials',
    token: STUDENT_A_TOKEN
  });
  assert.strictEqual(studentListRes.status, 200);
  assert.strictEqual(studentListRes.body.materials.length, 0);
});

await runAsyncTest('1.2: Select and publish Drive file with Year-Wide scope without file duplication', async () => {
  const initialDriveFileCount = mockDriveApi.files.size;

  const pubRes = await apiRequest({
    method: 'POST',
    path: '/api/study-materials/publish-from-drive',
    token: TEACHER_TOKEN,
    body: {
      subjectId: SUBJECT_ID,
      driveFileId: uploadedDraft1.id,
      title: 'Dynamic Programming Lecture Notes',
      scope: 'year',
      category: 'Lecture Notes',
      description: 'Comprehensive overview of DP paradigms.',
      isYearWide: true
    }
  });

  assert.strictEqual(pubRes.status, 201);
  assert.strictEqual(pubRes.body.success, true);
  publishedYearWide = pubRes.body.material;

  assert.ok(publishedYearWide.id);
  assert.strictEqual(publishedYearWide.driveFileId, uploadedDraft1.id);
  assert.strictEqual(publishedYearWide.title, 'Dynamic Programming Lecture Notes');
  assert.strictEqual(publishedYearWide.isPublished, true);
  assert.strictEqual(publishedYearWide.isYearWide, true);

  // Crucial check: mock Drive file count must remain identical (zero file duplication!)
  assert.strictEqual(
    mockDriveApi.files.size,
    initialDriveFileCount,
    'Publishing from Drive must NEVER create duplicate Drive files'
  );
});

await runAsyncTest('1.3: Year-Wide published material is accessible to both Section A and Section B students', async () => {
  // Query by student in Section A
  const resSecA = await apiRequest({
    method: 'GET',
    path: '/api/study-materials',
    token: STUDENT_A_TOKEN
  });
  assert.strictEqual(resSecA.status, 200);
  assert.strictEqual(resSecA.body.materials.length, 1);
  assert.strictEqual(resSecA.body.materials[0].id, publishedYearWide.id);

  // Query by student in Section B
  const resSecB = await apiRequest({
    method: 'GET',
    path: '/api/study-materials',
    token: STUDENT_B_TOKEN
  });
  assert.strictEqual(resSecB.status, 200);
  assert.strictEqual(resSecB.body.materials.length, 1);
  assert.strictEqual(resSecB.body.materials[0].id, publishedYearWide.id);
});

// -----------------------------------------------------------------------------
// SECTION 2: Scoping, Conflict Detection & Multi-Section Publication
// -----------------------------------------------------------------------------
console.log('\n--- SECTION 2: Scoping, Conflicts & Multi-Section Publication ---');

await runAsyncTest('2.1: Re-publishing same file for Year-Wide scope is rejected with 409 ALREADY_PUBLISHED', async () => {
  const dupRes = await apiRequest({
    method: 'POST',
    path: '/api/study-materials/publish-from-drive',
    token: TEACHER_TOKEN,
    body: {
      subjectId: SUBJECT_ID,
      driveFileId: uploadedDraft1.id,
      title: 'Duplicate Attempt',
      scope: 'year',
      isYearWide: true
    }
  });

  assert.strictEqual(dupRes.status, 409);
  assert.strictEqual(dupRes.body.code, 'ALREADY_PUBLISHED');
});

await runAsyncTest('2.2: Upload a second draft file and publish to Section A only', async () => {
  const labBuffer = Buffer.from('%PDF-1.4 Mock Lab 1 Manual Content');
  const uploadRes = await apiMultipartRequest({
    path: '/api/study-materials/drive/upload',
    token: TEACHER_TOKEN,
    fields: { subjectId: SUBJECT_ID },
    file: { filename: 'Lab1_Graphs.pdf', buffer: labBuffer }
  });

  assert.strictEqual(uploadRes.status, 201);
  uploadedDraft2 = uploadRes.body.file;

  const pubRes = await apiRequest({
    method: 'POST',
    path: '/api/study-materials/publish-from-drive',
    token: TEACHER_TOKEN,
    body: {
      subjectId: SUBJECT_ID,
      driveFileId: uploadedDraft2.id,
      title: 'Lab 1: Graph Traversal (Section A)',
      scope: 'section',
      section: 'Section A',
      category: 'Lab Manual'
    }
  });

  assert.strictEqual(pubRes.status, 201);
  publishedSecA = pubRes.body.material;
  assert.strictEqual(publishedSecA.scope, 'section');
  assert.strictEqual(publishedSecA.section, 'Section A');

  // Verify visible to Section A, invisible to Section B
  const viewSecA = await apiRequest({ method: 'GET', path: '/api/study-materials', token: STUDENT_A_TOKEN });
  const viewSecB = await apiRequest({ method: 'GET', path: '/api/study-materials', token: STUDENT_B_TOKEN });

  assert.ok(viewSecA.body.materials.some(m => m.id === publishedSecA.id));
  assert.ok(!viewSecB.body.materials.some(m => m.id === publishedSecA.id));
});

await runAsyncTest('2.3: Publish SAME file to Section B creating independent publication record', async () => {
  const driveCountBefore = mockDriveApi.files.size;

  const pubRes = await apiRequest({
    method: 'POST',
    path: '/api/study-materials/publish-from-drive',
    token: TEACHER_TOKEN,
    body: {
      subjectId: SUBJECT_ID,
      driveFileId: uploadedDraft2.id,
      title: 'Lab 1: Graph Traversal (Section B)',
      scope: 'section',
      section: 'Section B',
      category: 'Lab Manual'
    }
  });

  assert.strictEqual(pubRes.status, 201);
  publishedSecB = pubRes.body.material;
  assert.strictEqual(publishedSecB.scope, 'section');
  assert.strictEqual(publishedSecB.section, 'Section B');
  assert.strictEqual(publishedSecB.driveFileId, uploadedDraft2.id);

  // Independent record with unique ID
  assert.notStrictEqual(publishedSecB.id, publishedSecA.id);

  // Check Drive file count untouched (no duplication)
  assert.strictEqual(mockDriveApi.files.size, driveCountBefore);

  // Both Section A and Section B students now see their respective publications
  const viewSecB = await apiRequest({ method: 'GET', path: '/api/study-materials', token: STUDENT_B_TOKEN });
  assert.ok(viewSecB.body.materials.some(m => m.id === publishedSecB.id));
});

await runAsyncTest('2.4: Attempting to publish to Section C where teacher has NO allocation is rejected with 403', async () => {
  const res = await apiRequest({
    method: 'POST',
    path: '/api/study-materials/publish-from-drive',
    token: TEACHER_TOKEN,
    body: {
      subjectId: SUBJECT_ID,
      driveFileId: uploadedDraft2.id,
      title: 'Lab 1: Unauthorized Section C',
      scope: 'section',
      section: 'Section C'
    }
  });

  assert.strictEqual(res.status, 403);
  assert.strictEqual(res.body.code, 'FORBIDDEN_SCOPE');
});

// -----------------------------------------------------------------------------
// SECTION 3: Publication Management & Unpublish Immediacy
// -----------------------------------------------------------------------------
console.log('\n--- SECTION 3: Publication Management & Unpublish Immediacy ---');

await runAsyncTest('3.1: Unpublishing Section A material immediately revokes Section A student access', async () => {
  const unpubRes = await apiRequest({
    method: 'PATCH',
    path: `/api/study-materials/${publishedSecA.id}/publish`,
    token: TEACHER_TOKEN,
    body: { isPublished: false }
  });

  assert.strictEqual(unpubRes.status, 200);
  assert.strictEqual(unpubRes.body.material.isPublished, false);

  // Student in Section A immediately cannot list it
  const viewSecA = await apiRequest({ method: 'GET', path: '/api/study-materials', token: STUDENT_A_TOKEN });
  assert.ok(!viewSecA.body.materials.some(m => m.id === publishedSecA.id));

  // Student in Section A download attempt is rejected with 403 MATERIAL_UNPUBLISHED
  const dlRes = await apiRequest({
    method: 'GET',
    path: `/api/study-materials/${publishedSecA.id}/download`,
    token: STUDENT_A_TOKEN
  });
  assert.strictEqual(dlRes.status, 403);
  assert.strictEqual(dlRes.body.code, 'MATERIAL_UNPUBLISHED');
});

await runAsyncTest('3.2: Unpublishing Section A leaves Section B publication completely active and unaffected', async () => {
  const viewSecB = await apiRequest({ method: 'GET', path: '/api/study-materials', token: STUDENT_B_TOKEN });
  assert.ok(viewSecB.body.materials.some(m => m.id === publishedSecB.id));

  // Section B student can still download their published copy
  const dlRes = await apiRequest({
    method: 'GET',
    path: `/api/study-materials/${publishedSecB.id}/download`,
    token: STUDENT_B_TOKEN
  });
  assert.strictEqual(dlRes.status, 200);
  assert.strictEqual(dlRes.headers['content-type'], 'application/pdf');
});

await runAsyncTest('3.3: Unpublishing NEVER deletes the original file in Google Drive', async () => {
  const fileMeta = await mockDriveApi.getFileMetadata(uploadedDraft2.id);
  assert.ok(fileMeta, 'Physical Google Drive file must exist');
  assert.strictEqual(fileMeta.trashed, false, 'File must not be trashed in Google Drive');
});

// -----------------------------------------------------------------------------
// SECTION 4: Revocation Safety & Private Draft Protection
// -----------------------------------------------------------------------------
console.log('\n--- SECTION 4: Revocation Safety & Draft Protection ---');

await runAsyncTest('4.1: Revoking teacher assignment immediately blocks new Drive publications', async () => {
  // Revoke teacher Sharma assignment for CS302
  mockDb.store.teacher_subject_assignments['assign_sharma_cs302'].status = 'revoked';
  mockDb.store.teacher_subject_assignments['assign_sharma_cs302'].active = false;

  const res = await apiRequest({
    method: 'POST',
    path: '/api/study-materials/publish-from-drive',
    token: TEACHER_TOKEN,
    body: {
      subjectId: SUBJECT_ID,
      driveFileId: uploadedDraft1.id,
      title: 'Post-Revocation Attempt',
      scope: 'year'
    }
  });

  assert.strictEqual(res.status, 403);
  assert.strictEqual(res.body.code, 'FORBIDDEN_SUBJECT');

  // Restore active assignment for subsequent tests
  mockDb.store.teacher_subject_assignments['assign_sharma_cs302'].status = 'active';
  mockDb.store.teacher_subject_assignments['assign_sharma_cs302'].active = true;
});

// -----------------------------------------------------------------------------
// SECTION 5: Frontend UI & Contract Verification
// -----------------------------------------------------------------------------
console.log('\n--- SECTION 5: Frontend UI & Contract Verification ---');

runTest('5.1: StudyMaterialView imports and uses publishFromDriveFile and fetchDriveSubjectFiles', () => {
  const smvPath = path.resolve(process.cwd(), 'src/pages/Teacher/StudyMaterialView.jsx');
  const content = fs.readFileSync(smvPath, 'utf-8');

  assert.ok(
    content.includes('fetchDriveSubjectFiles') && content.includes('publishFromDriveFile'),
    'StudyMaterialView must import fetchDriveSubjectFiles and publishFromDriveFile'
  );
  assert.ok(
    content.includes("uploadSourceMode === 'drive'"),
    'StudyMaterialView must support drive selection mode'
  );
  assert.ok(
    content.includes('Select from Faculty Drive'),
    "Must include 'Select from Faculty Drive' UI toggle/header action"
  );
});

runTest('5.2: UploadMaterialForm provides dual modes with Drive file browsing and duplicate warning', () => {
  const smvPath = path.resolve(process.cwd(), 'src/pages/Teacher/StudyMaterialView.jsx');
  const content = fs.readFileSync(smvPath, 'utf-8');

  assert.ok(
    content.includes('driveFiles.map('),
    'UploadMaterialForm must render Drive files list'
  );
  assert.ok(
    content.includes('Publish from Google Drive'),
    'Submit button must display "Publish from Google Drive" in drive mode'
  );
  assert.ok(
    content.includes('driveConflictWarning'),
    'Must perform duplicate conflict detection in UI'
  );
});

runTest('5.3: AcademicSpacesView wires studyMaterialHandoff to StudyMaterialView', () => {
  const asvPath = path.resolve(process.cwd(), 'src/pages/Teacher/AcademicSpacesView.jsx');
  const content = fs.readFileSync(asvPath, 'utf-8');

  assert.ok(
    content.includes('studyMaterialHandoff = null'),
    'AcademicSpacesView must accept studyMaterialHandoff prop'
  );
  assert.ok(
    content.includes('studyMaterialHandoff={studyMaterialHandoff}'),
    'AcademicSpacesView must pass studyMaterialHandoff to StudyMaterialView'
  );
});

runTest('5.4: TeacherApp coordinates handoff between FacultyDriveView and AcademicSpacesView', () => {
  const appPath = path.resolve(process.cwd(), 'src/pages/Teacher/TeacherApp.jsx');
  const content = fs.readFileSync(appPath, 'utf-8');

  assert.ok(
    content.includes('studyMaterialHandoff'),
    'TeacherApp must manage studyMaterialHandoff state'
  );
  assert.ok(
    content.includes('handleNavigate'),
    'TeacherApp must pass handleNavigate with handoff payload to views'
  );
});

// -----------------------------------------------------------------------------
// CLEANUP & SUMMARY
// -----------------------------------------------------------------------------
if (testServer) {
  testServer.close();
}

console.log('\n======================================================');
console.log(` SUMMARY: ${passed} passed, ${failed} failed`);
console.log('======================================================\n');

if (failed > 0) {
  process.exit(1);
}
