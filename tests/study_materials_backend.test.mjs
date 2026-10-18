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
console.log(' SANGAM STUDY MATERIAL & SUBJECT MANAGEMENT TEST SUITE');
console.log(' Phase 2, Step 1: Backend Data and API Foundation');
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

import { encrypt } from '../server/services/encryptionService.js';

// -----------------------------------------------------------------------------
// Mock Google Drive API
// -----------------------------------------------------------------------------
class MockDriveApi {
  constructor() {
    this.uploadedFiles = new Map();
  }

  async verifyFolder(folderId, accessToken) {
    return { exists: true, name: 'Sangam Coursework' };
  }

  async createFolder(folderName, accessToken) {
    return { id: 'folder_coursework_turing', name: folderName };
  }

  async uploadFile(folderId, fileName, mimeType, fileBuffer, accessToken, metadataExtra = {}) {
    const fileId = `drive_file_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const record = {
      id: fileId,
      name: fileName,
      mimeType,
      size: fileBuffer.length,
      folderId,
      buffer: fileBuffer,
      ...metadataExtra
    };
    this.uploadedFiles.set(fileId, record);
    return record;
  }

  async downloadFile(driveFileId, accessToken) {
    const record = this.uploadedFiles.get(driveFileId);
    if (!record) {
      throw new Error(`Drive file not found: ${driveFileId}`);
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
// Seed Test Accounts
// -----------------------------------------------------------------------------
const DIRECTOR_UID = 'uid_director_ramanujan';
const TEACHER_UID = 'uid_teacher_turing';
const TEACHER2_UID = 'uid_teacher_curie';
const STUDENT_SECA_UID = 'uid_student_lovelace';
const STUDENT_SECB_UID = 'uid_student_shannon';

registerToken('token_director', { uid: DIRECTOR_UID, email: 'director@sangam.edu' });
registerToken('token_teacher', { uid: TEACHER_UID, email: 'turing@sangam.edu' });
registerToken('token_teacher2', { uid: TEACHER2_UID, email: 'curie@sangam.edu' });
registerToken('token_student_seca', { uid: STUDENT_SECA_UID, email: 'lovelace@sangam.edu' });
registerToken('token_student_secb', { uid: STUDENT_SECB_UID, email: 'shannon@sangam.edu' });

await mockDb.collection('users').doc(DIRECTOR_UID).set({
  uid: DIRECTOR_UID,
  email: 'director@sangam.edu',
  name: 'Director Ramanujan',
  role: 'director',
  status: 'active',
  institution: 'UEMK'
});

await mockDb.collection('users').doc(TEACHER_UID).set({
  uid: TEACHER_UID,
  email: 'turing@sangam.edu',
  name: 'Prof. Alan Turing',
  role: 'faculty',
  status: 'active',
  institution: 'UEMK',
  department: 'CSE AI'
});

await mockDb.collection('users').doc(TEACHER2_UID).set({
  uid: TEACHER2_UID,
  email: 'curie@sangam.edu',
  name: 'Prof. Marie Curie',
  role: 'faculty',
  status: 'active',
  institution: 'UEMK',
  department: 'Mechanical Engineering'
});

await mockDb.collection('users').doc(STUDENT_SECA_UID).set({
  uid: STUDENT_SECA_UID,
  email: 'lovelace@sangam.edu',
  name: 'Ada Lovelace',
  role: 'student',
  status: 'active',
  institution: 'UEMK',
  department: 'CSE AI',
  year: '2nd Year',
  section: 'Section A'
});

await mockDb.collection('users').doc(STUDENT_SECB_UID).set({
  uid: STUDENT_SECB_UID,
  email: 'shannon@sangam.edu',
  name: 'Claude Shannon',
  role: 'student',
  status: 'active',
  institution: 'UEMK',
  department: 'CSE AI',
  year: '2nd Year',
  section: 'Section B'
});

// Seed teacher class allocations in teacher_allocations
await mockDb.collection('teacher_allocations').doc(`${TEACHER_UID}_CSE AI_2nd Year_Section A`).set({
  teacherUid: TEACHER_UID,
  institution: 'UEMK',
  department: 'CSE AI',
  year: '2nd Year',
  section: 'Section A',
  authorized: true
});

await mockDb.collection('teacher_allocations').doc(`${TEACHER_UID}_CSE AI_2nd Year_Section B`).set({
  teacherUid: TEACHER_UID,
  institution: 'UEMK',
  department: 'CSE AI',
  year: '2nd Year',
  section: 'Section B',
  authorized: true
});

// Seed mock teacher Google Drive integration
const encKey = process.env.TOKEN_ENCRYPTION_KEY;
const encAccess = encrypt('token_mock_access_123', encKey);
const encRefresh = encrypt('token_mock_refresh_123', encKey);

await mockDb.collection('faculty_storage_integrations').doc(TEACHER_UID).set({
  facultyUid: TEACHER_UID,
  provider: 'google',
  accountEmail: 'turing.drive@gmail.com',
  status: 'connected',
  rootFolderId: 'folder_coursework_turing',
  scope: 'https://www.googleapis.com/auth/drive.file',
  encryptedAccessToken: encAccess.encryptedData,
  accessTokenIv: encAccess.iv,
  accessTokenAuthTag: encAccess.authTag,
  encryptedRefreshToken: encRefresh.encryptedData,
  refreshTokenIv: encRefresh.iv,
  refreshTokenAuthTag: encRefresh.authTag,
  tokenExpiresAt: Date.now() + 3600000
});

// =============================================================================
// SECTION 1: Subject CRUD & Validation
// =============================================================================
console.log('--- SECTION 1: Subject CRUD & Validation ---');

let createdSubjectId = null;

await runAsyncTest('1.1: Director can create subject with valid fields (201 Created)', async () => {
  const res = await apiRequest({
    method: 'POST',
    path: '/api/subjects',
    token: 'token_director',
    body: {
      name: 'Data Structures & Algorithms',
      code: 'CS201',
      department: 'CSE AI',
      year: '2nd Year',
      description: 'Core DSA syllabus and problem-solving.'
    }
  });

  assert.strictEqual(res.status, 201);
  assert.strictEqual(res.body.success, true);
  assert.strictEqual(res.body.subject.name, 'Data Structures & Algorithms');
  assert.strictEqual(res.body.subject.code, 'CS201');
  assert.strictEqual(res.body.subject.institution, 'UEMK');
  assert.ok(res.body.subject.id.startsWith('sub_'));
  createdSubjectId = res.body.subject.id;
});

await runAsyncTest('1.2: Prevents duplicate subjects in identical department & year (409 Conflict)', async () => {
  const res = await apiRequest({
    method: 'POST',
    path: '/api/subjects',
    token: 'token_director',
    body: {
      name: 'Data Structures & Algorithms', // duplicate name
      code: 'CS201-ALT',
      department: 'Computer Science', // Canonical alias for CSE AI
      year: '2nd Year'
    }
  });

  assert.strictEqual(res.status, 409);
  assert.strictEqual(res.body.code, 'SUBJECT_ALREADY_EXISTS');
});

await runAsyncTest('1.3: Non-director (Teacher / Student) cannot create subjects (403 Forbidden)', async () => {
  const resTeacher = await apiRequest({
    method: 'POST',
    path: '/api/subjects',
    token: 'token_teacher',
    body: { name: 'Compilers', department: 'CSE AI', year: '3rd Year' }
  });
  assert.strictEqual(resTeacher.status, 403);

  const resStudent = await apiRequest({
    method: 'POST',
    path: '/api/subjects',
    token: 'token_student_seca',
    body: { name: 'Compilers', department: 'CSE AI', year: '3rd Year' }
  });
  assert.strictEqual(resStudent.status, 403);
});

await runAsyncTest('1.4: Scoped Subject Listing enforces role boundaries', async () => {
  // Director can list all in institution
  const dirRes = await apiRequest({ path: '/api/subjects', token: 'token_director' });
  assert.strictEqual(dirRes.status, 200);
  assert.ok(dirRes.body.subjects.some(s => s.id === createdSubjectId));

  // Student in CSE AI 2nd Year sees DSA
  const stuRes = await apiRequest({ path: '/api/subjects', token: 'token_student_seca' });
  assert.strictEqual(stuRes.status, 200);
  assert.ok(stuRes.body.subjects.some(s => s.id === createdSubjectId));
});

// =============================================================================
// SECTION 2: Teacher-Subject Allocation Verification
// =============================================================================
console.log('\n--- SECTION 2: Teacher-Subject Allocation Verification ---');

let createdAssignmentId = null;

await runAsyncTest('2.1: Rejects subject assignment if teacher lacks authorized class allocation (403 Forbidden)', async () => {
  // Prof. Curie is in ME, not allocated to CSE AI 2nd Year
  const res = await apiRequest({
    method: 'POST',
    path: '/api/subjects/assignments',
    token: 'token_director',
    body: {
      assignedTeacherUid: TEACHER2_UID,
      subjectId: createdSubjectId
    }
  });

  assert.strictEqual(res.status, 403);
  assert.strictEqual(res.body.code, 'ALLOCATION_REQUIRED');
});

await runAsyncTest('2.2: Succeeds when teacher has authorized class allocation in teacher_allocations (201 Created)', async () => {
  const res = await apiRequest({
    method: 'POST',
    path: '/api/subjects/assignments',
    token: 'token_director',
    body: {
      assignedTeacherUid: TEACHER_UID,
      subjectId: createdSubjectId,
      section: 'Section A'
    }
  });

  assert.strictEqual(res.status, 201);
  assert.strictEqual(res.body.success, true);
  assert.strictEqual(res.body.assignment.teacherUid, TEACHER_UID);
  assert.strictEqual(res.body.assignment.subjectId, createdSubjectId);
  createdAssignmentId = res.body.assignment.id;
});

await runAsyncTest('2.3: Teacher can query their assigned subjects via /api/subjects/my-subjects', async () => {
  const res = await apiRequest({
    method: 'GET',
    path: '/api/subjects/my-subjects',
    token: 'token_teacher'
  });

  assert.strictEqual(res.status, 200);
  assert.ok(res.body.assignments.some(a => a.subjectId === createdSubjectId));
});

await runAsyncTest('2.4: Safe Deletion: Prevents subject deletion while assigned to teacher (409 Conflict)', async () => {
  const res = await apiRequest({
    method: 'DELETE',
    path: `/api/subjects/${createdSubjectId}`,
    token: 'token_director'
  });

  assert.strictEqual(res.status, 409);
  assert.strictEqual(res.body.code, 'SUBJECT_IN_USE');
});

// =============================================================================
// SECTION 3: Study Material Upload & Drive Isolation
// =============================================================================
console.log('\n--- SECTION 3: Study Material Upload & Google Drive Isolation ---');

let yearWideMaterialId = null;
let sectionSpecificMaterialId = null;

await runAsyncTest('3.1: Rejects upload when teacher has not connected Google Drive (424 Failed Dependency)', async () => {
  // Give Prof. Curie an authorized allocation so allocation check passes, but leave Drive unconnected
  await mockDb.collection('teacher_allocations').doc(`${TEACHER2_UID}_CSE AI_2nd Year_Section A`).set({
    teacherUid: TEACHER2_UID,
    institution: 'UEMK',
    department: 'CSE AI',
    year: '2nd Year',
    section: 'Section A',
    authorized: true
  });

  const pdfBuffer = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');
  const res = await apiMultipartRequest({
    path: '/api/study-materials/upload',
    token: 'token_teacher2',
    fields: {
      title: 'Thermodynamics Notes',
      subjectId: createdSubjectId,
      department: 'CSE AI',
      year: '2nd Year',
      scope: 'year'
    },
    file: {
      fieldname: 'file',
      filename: 'thermo.pdf',
      mime: 'application/pdf',
      buffer: pdfBuffer
    }
  });

  assert.strictEqual(res.status, 424);
  assert.strictEqual(res.body.code, 'DRIVE_NOT_CONNECTED');
});

await runAsyncTest('3.2: Rejects upload from student role (403 Forbidden)', async () => {
  const pdfBuffer = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');
  const res = await apiMultipartRequest({
    path: '/api/study-materials/upload',
    token: 'token_student_seca',
    fields: {
      title: 'Hacked Notes',
      subjectId: createdSubjectId,
      department: 'CSE AI',
      year: '2nd Year'
    },
    file: {
      fieldname: 'file',
      filename: 'hacked.pdf',
      mime: 'application/pdf',
      buffer: pdfBuffer
    }
  });

  assert.strictEqual(res.status, 403);
});

await runAsyncTest('3.3: Authorized teacher uploads Year-Wide study material to connected Google Drive (201 Created)', async () => {
  const pdfBuffer = Buffer.from('%PDF-1.4\nDSA Lecture 1 Slides Content\n%%EOF');
  const res = await apiMultipartRequest({
    path: '/api/study-materials/upload',
    token: 'token_teacher',
    fields: {
      title: 'Lecture 1: Asymptotic Analysis & Big-O',
      subjectId: createdSubjectId,
      department: 'CSE AI',
      year: '2nd Year',
      scope: 'year',
      category: 'Lecture Notes',
      description: 'Comprehensive analysis slides.'
    },
    file: {
      fieldname: 'file',
      filename: 'lecture1_big_o.pdf',
      mime: 'application/pdf',
      buffer: pdfBuffer
    }
  });

  assert.strictEqual(res.status, 201);
  assert.strictEqual(res.body.success, true);
  assert.strictEqual(res.body.material.title, 'Lecture 1: Asymptotic Analysis & Big-O');
  assert.strictEqual(res.body.material.scope, 'year');
  assert.strictEqual(res.body.material.isYearWide, true);
  assert.strictEqual(res.body.material.isPublished, true);
  assert.ok(res.body.material.driveFileId.startsWith('drive_file_'));

  yearWideMaterialId = res.body.material.id;
});

await runAsyncTest('3.4: Authorized teacher uploads Section-Specific study material (201 Created)', async () => {
  const pdfBuffer = Buffer.from('%PDF-1.4\nLab 1 Guidelines for Section A\n%%EOF');
  const res = await apiMultipartRequest({
    path: '/api/study-materials/upload',
    token: 'token_teacher',
    fields: {
      title: 'Lab 1: Memory Allocation Guidelines',
      subjectId: createdSubjectId,
      department: 'CSE AI',
      year: '2nd Year',
      scope: 'section',
      section: 'Section A',
      category: 'Lab Manual',
      description: 'Strictly for Section A lab batch.'
    },
    file: {
      fieldname: 'file',
      filename: 'lab1_sec_a.pdf',
      mime: 'application/pdf',
      buffer: pdfBuffer
    }
  });

  assert.strictEqual(res.status, 201);
  assert.strictEqual(res.body.material.scope, 'section');
  assert.strictEqual(res.body.material.isYearWide, false);
  assert.strictEqual(res.body.material.section, 'Section A');

  sectionSpecificMaterialId = res.body.material.id;
});

// =============================================================================
// SECTION 4: Year-Wide vs Section-Specific Scoping
// =============================================================================
console.log('\n--- SECTION 4: Year-Wide vs Section-Specific Scoping ---');

await runAsyncTest('4.1: Year-wide material is accessible to ALL sections in the academic year', async () => {
  // Student in Section A
  const resSecA = await apiRequest({
    path: '/api/study-materials',
    token: 'token_student_seca'
  });
  assert.strictEqual(resSecA.status, 200);
  assert.ok(resSecA.body.materials.some(m => m.id === yearWideMaterialId));

  // Student in Section B
  const resSecB = await apiRequest({
    path: '/api/study-materials',
    token: 'token_student_secb'
  });
  assert.strictEqual(resSecB.status, 200);
  assert.ok(resSecB.body.materials.some(m => m.id === yearWideMaterialId));
});

await runAsyncTest('4.2: Section-specific material is accessible ONLY to matching section', async () => {
  // Student in Section A (authorized section) -> Can see Section A material
  const resSecA = await apiRequest({
    path: '/api/study-materials',
    token: 'token_student_seca'
  });
  assert.ok(resSecA.body.materials.some(m => m.id === sectionSpecificMaterialId));

  // Student in Section B -> Strictly filtered out
  const resSecB = await apiRequest({
    path: '/api/study-materials',
    token: 'token_student_secb'
  });
  assert.ok(!resSecB.body.materials.some(m => m.id === sectionSpecificMaterialId));

  // Student in Section B attempting direct download is rejected (403 Forbidden)
  const downloadAttempt = await apiRequest({
    path: `/api/study-materials/${sectionSpecificMaterialId}/download`,
    token: 'token_student_secb'
  });
  assert.strictEqual(downloadAttempt.status, 403);
});

// =============================================================================
// SECTION 5: Publication Status & Access Revocation
// =============================================================================
console.log('\n--- SECTION 5: Publication Status & Access Revocation ---');

await runAsyncTest('5.1: Teacher unpublishes material -> Student access is immediately revoked', async () => {
  // Unpublish year-wide material
  const unpublishRes = await apiRequest({
    method: 'PATCH',
    path: `/api/study-materials/${yearWideMaterialId}/publish`,
    token: 'token_teacher',
    body: { isPublished: false }
  });

  assert.strictEqual(unpublishRes.status, 200);
  assert.strictEqual(unpublishRes.body.material.isPublished, false);

  // Student A query now excludes the unpublished material
  const stuListRes = await apiRequest({
    path: '/api/study-materials',
    token: 'token_student_seca'
  });
  assert.ok(!stuListRes.body.materials.some(m => m.id === yearWideMaterialId));

  // Student A direct download attempt is blocked with 403 MATERIAL_UNPUBLISHED
  const stuDownloadRes = await apiRequest({
    path: `/api/study-materials/${yearWideMaterialId}/download`,
    token: 'token_student_seca'
  });
  assert.strictEqual(stuDownloadRes.status, 403);
  assert.strictEqual(stuDownloadRes.body.code, 'MATERIAL_UNPUBLISHED');

  // But the authoring teacher CAN still view and download their unpublished material
  const teacherListRes = await apiRequest({
    path: '/api/study-materials',
    token: 'token_teacher'
  });
  assert.ok(teacherListRes.body.materials.some(m => m.id === yearWideMaterialId));

  const teacherDownloadRes = await apiRequest({
    path: `/api/study-materials/${yearWideMaterialId}/download`,
    token: 'token_teacher'
  });
  assert.strictEqual(teacherDownloadRes.status, 200);
});

await runAsyncTest('5.2: Teacher re-publishes material -> Student access is immediately restored', async () => {
  const republishRes = await apiRequest({
    method: 'PATCH',
    path: `/api/study-materials/${yearWideMaterialId}/publish`,
    token: 'token_teacher',
    body: { isPublished: true }
  });

  assert.strictEqual(republishRes.status, 200);
  assert.strictEqual(republishRes.body.material.isPublished, true);

  // Student A can now list and download again
  const stuListRes = await apiRequest({
    path: '/api/study-materials',
    token: 'token_student_seca'
  });
  assert.ok(stuListRes.body.materials.some(m => m.id === yearWideMaterialId));

  const stuDownloadRes = await apiRequest({
    path: `/api/study-materials/${yearWideMaterialId}/download`,
    token: 'token_student_seca'
  });
  assert.strictEqual(stuDownloadRes.status, 200);
});

// =============================================================================
// SECTION 6: Safe Deletion & Role Boundaries
// =============================================================================
console.log('\n--- SECTION 6: Safe Deletion & Role Boundaries ---');

await runAsyncTest('6.1: Non-owning teacher cannot delete or unpublish another teacher\'s material (403 Forbidden)', async () => {
  const res = await apiRequest({
    method: 'DELETE',
    path: `/api/study-materials/${yearWideMaterialId}`,
    token: 'token_teacher2'
  });
  assert.strictEqual(res.status, 403);
});

await runAsyncTest('6.2: Student cannot delete study material (403 Forbidden)', async () => {
  const res = await apiRequest({
    method: 'DELETE',
    path: `/api/study-materials/${yearWideMaterialId}`,
    token: 'token_student_seca'
  });
  assert.strictEqual(res.status, 403);
});

await runAsyncTest('6.3: Owning teacher can delete their study material metadata (200 OK)', async () => {
  const res = await apiRequest({
    method: 'DELETE',
    path: `/api/study-materials/${sectionSpecificMaterialId}`,
    token: 'token_teacher'
  });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.success, true);
});

afterTests: {
  if (testServer) {
    await new Promise((resolve) => testServer.close(resolve));
  }
}

console.log('\n======================================================');
console.log(` SUMMARY: ${passed} passed, ${failed} failed`);
console.log('======================================================\n');

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
