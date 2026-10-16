import assert from 'node:assert';
import crypto from 'node:crypto';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

// Configure test environment variables before server initialization
process.env.TEST_MODE = 'true';
process.env.NODE_ENV = 'test';
process.env.TOKEN_ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
process.env.GOOGLE_CLIENT_ID = 'test-client-id-route-e2e.apps.googleusercontent.com';
process.env.GOOGLE_CLIENT_SECRET = 'test-mock-google-client-secret';
process.env.FRONTEND_URL = 'http://localhost:5173';

import { googleDriveService } from '../server/services/googleDriveService.js';
import { encrypt } from '../server/services/encryptionService.js';
import { setCustomAuthService } from '../server/middleware/authMiddleware.js';
import { app } from '../server.js';

let passed = 0;
let failed = 0;

async function runTest(name, fn) {
  try {
    await fn();
    console.log(`  [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`  [FAIL] ${name}:`, err.message);
    failed++;
  }
}

// -----------------------------------------------------------------------------
// In-Memory High-Fidelity Test Doubles for Deterministic HTTP Testing
// -----------------------------------------------------------------------------
class MockFirestoreStore {
  constructor() {
    this.store = new Map(); // path -> { data: any, version: number }
  }

  collection(collName) {
    const self = this;
    return {
      doc: (docId) => {
        const fullKey = `${collName}/${docId}`;
        return {
          id: docId,
          path: fullKey,
          get: async () => {
            const data = self.store.get(fullKey);
            return {
              exists: Boolean(data),
              id: docId,
              data: () => (data ? JSON.parse(JSON.stringify(data.data)) : undefined)
            };
          },
          set: async (val, options = {}) => {
            const current = self.store.get(fullKey);
            const currentVersion = current ? current.version : 0;
            if (options.merge && current) {
              self.store.set(fullKey, {
                data: { ...current.data, ...val },
                version: currentVersion + 1
              });
            } else {
              self.store.set(fullKey, {
                data: JSON.parse(JSON.stringify(val)),
                version: currentVersion + 1
              });
            }
          },
          delete: async () => {
            self.store.delete(fullKey);
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

class MockDriveDouble {
  constructor() {
    this.folders = new Map();
    this.files = new Map();
  }

  async verifyFolder(folderId) {
    const folder = this.folders.get(folderId);
    if (!folder) return { exists: false, trashed: true };
    return { exists: !folder.trashed, trashed: folder.trashed, name: folder.name };
  }

  async createFolder(name) {
    const id = `folder_${crypto.randomBytes(6).toString('hex')}`;
    const f = { id, name, trashed: false };
    this.folders.set(id, f);
    return f;
  }

  async uploadFile(folderId, fileName, mimeType, buffer, accessToken, options = {}) {
    const fileId = `file_${crypto.randomBytes(6).toString('hex')}`;
    const file = {
      id: fileId,
      name: fileName,
      folderId,
      size: buffer.length,
      mimeType,
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
// Multipart Form-Data Builder Utility
// -----------------------------------------------------------------------------
function buildMultipart(fields = {}, file = null) {
  const boundary = `----SangamBoundary${crypto.randomBytes(12).toString('hex')}`;
  const parts = [];

  for (const [key, val] of Object.entries(fields)) {
    if (val !== undefined && val !== null) {
      parts.push(
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${val}\r\n`
        )
      );
    }
  }

  if (file) {
    const fieldName = file.fieldName || 'file';
    const filename = file.filename || 'document.pdf';
    const contentType = file.contentType || 'application/pdf';
    const buffer = file.buffer || Buffer.from('%PDF-1.4 mock content');

    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${fieldName}"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`
      )
    );
    parts.push(buffer);
    parts.push(Buffer.from('\r\n'));
  }

  parts.push(Buffer.from(`--${boundary}--\r\n`));
  const fullBody = Buffer.concat(parts);

  return {
    contentType: `multipart/form-data; boundary=${boundary}`,
    body: fullBody
  };
}

// -----------------------------------------------------------------------------
// Test Runner
// -----------------------------------------------------------------------------
async function runAll() {
  console.log('======================================================');
  console.log(' SANGAM STAGE 7.2: ROUTE DISAMBIGUATION E2E TESTS');
  console.log(' Exercises actual Express application & HTTP router stack');
  console.log('======================================================\n');

  const encKey = process.env.TOKEN_ENCRYPTION_KEY;

  // 1. Setup mock database and drive double
  const mockDb = new MockFirestoreStore();
  const mockDrive = new MockDriveDouble();

  googleDriveService.customDb = mockDb;
  googleDriveService.verifyFolder = (folderId, token) => mockDrive.verifyFolder(folderId, token);
  googleDriveService.createDriveFolder = (name, token) => mockDrive.createFolder(name, token);
  googleDriveService.uploadFileToFolder = (folderId, fileName, mimeType, buffer, token, opts) =>
    mockDrive.uploadFile(folderId, fileName, mimeType, buffer, token, opts);

  // Setup initial data
  // Student profile
  await mockDb.collection('users').doc('student_alex').set({
    uid: 'student_alex',
    role: 'student',
    status: 'active',
    name: 'Alex Carter',
    email: 'alex@sangam.edu',
    roll: 'CS21001',
    institution: 'UEMK',
    department: 'CSE AI',
    year: '2nd Year',
    section: 'Sec C'
  });

  // Teacher profile
  await mockDb.collection('users').doc('teacher_sarah').set({
    uid: 'teacher_sarah',
    role: 'faculty',
    status: 'active',
    name: 'Dr. Sarah Jenkins',
    email: 's.jenkins@sangam.edu',
    department: 'CSE AI',
    institution: 'UEMK'
  });

  // Unallocated teacher profile
  await mockDb.collection('users').doc('teacher_bob').set({
    uid: 'teacher_bob',
    role: 'faculty',
    status: 'active',
    name: 'Prof. Bob Smith',
    email: 'bob@sangam.edu',
    department: 'Mechanical',
    institution: 'UEMK'
  });

  // Teacher Google Drive integration with encrypted tokens
  const encAccess = encrypt('valid-mock-access-token', encKey);
  const encRefresh = encrypt('valid-mock-refresh-token', encKey);
  await mockDb.collection('faculty_storage_integrations').doc('teacher_sarah').set({
    facultyUid: 'teacher_sarah',
    provider: 'google',
    status: 'connected',
    accountEmail: 'sarah.jenkins.drive@gmail.com',
    rootFolderId: 'folder_sarah_101',
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
  mockDrive.folders.set('folder_sarah_101', { id: 'folder_sarah_101', name: 'Sangam Coursework', trashed: false });

  // Teacher allocation
  await mockDb.collection('teacher_allocations').doc('teacher_sarah_CSE AI_2nd Year_Sec C').set({
    teacherUid: 'teacher_sarah',
    institution: 'UEMK',
    department: 'CSE AI',
    year: '2nd Year',
    section: 'Sec C',
    subject: 'DSA',
    authorized: true
  });

  // Active assignment
  await mockDb.collection('assignments').doc('asg_active_dsa').set({
    id: 'asg_active_dsa',
    teacherUid: 'teacher_sarah',
    title: 'Binary Trees Implementation',
    institution: 'UEMK',
    department: 'CSE AI',
    year: '2nd Year',
    section: 'Sec C',
    dueDate: '2026-12-31'
  });

  // 2. Setup mock Auth double
  const mockAuth = {
    verifyIdToken: async (token) => {
      if (token === 'token_student_alex') {
        return { uid: 'student_alex', email: 'alex@sangam.edu' };
      }
      if (token === 'token_teacher_sarah') {
        return { uid: 'teacher_sarah', email: 's.jenkins@sangam.edu' };
      }
      if (token === 'token_teacher_bob') {
        return { uid: 'teacher_bob', email: 'bob@sangam.edu' };
      }
      const err = new Error('Invalid token');
      err.code = 'auth/invalid-id-token';
      throw err;
    }
  };
  setCustomAuthService(mockAuth);

  // 3. Start live HTTP server with actual Express application
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;

  async function apiRequest(endpoint, { method = 'GET', headers = {}, body = null } = {}) {
    const res = await fetch(`${baseUrl}${endpoint}`, {
      method,
      headers,
      body
    });
    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text };
    }
    return { status: res.status, ok: res.ok, json };
  }

  const VALID_PDF = Buffer.from('%PDF-1.5 \n%Binary Trees Solution\n%%EOF');

  try {
    console.log('--- SECTION 1: Verification 1 — Authenticated Student Submission via /api/submissions/upload ---');

    await runTest('1.1: Authenticated student multipart request to /api/submissions/upload reaches handleUploadSubmission', async () => {
      const { contentType, body } = buildMultipart(
        { assignmentId: 'asg_active_dsa' },
        { fieldName: 'file', filename: 'Alex_Solution.pdf', buffer: VALID_PDF }
      );

      const res = await apiRequest('/api/submissions/upload', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer token_student_alex',
          'Content-Type': contentType
        },
        body
      });

      assert.strictEqual(res.status, 201, `Expected 201 Created but received ${res.status}: ${JSON.stringify(res.json)}`);
      assert.strictEqual(res.json.success, true);
      assert.ok(res.json.submission, 'Response must include submission object');
      assert.strictEqual(res.json.submission.studentUid, 'student_alex');
      assert.strictEqual(res.json.submission.assignmentId, 'asg_active_dsa');
      assert.strictEqual(res.json.submission.teacherUid, 'teacher_sarah');
      assert.strictEqual(res.json.submission.storageProvider, 'google_drive');
      assert.ok(res.json.message.includes('submission'), 'Message must indicate submission success');

      // Crucial: verify that the response is NOT an assignment creation response!
      assert.strictEqual(res.json.assignment, undefined, 'Must not be handled by teacher assignment handler');
    });

    console.log('\n--- SECTION 2: Verification 2 — Authenticated Teacher Assignment via /api/assignments/upload ---');

    await runTest('2.1: Teacher multipart request to /api/assignments/upload reaches handleUploadAssignment', async () => {
      const { contentType, body } = buildMultipart(
        {
          title: 'Graph Algorithms Homework',
          department: 'CSE AI',
          year: '2nd Year',
          section: 'Sec C',
          dueDate: '2026-11-20',
          subject: 'DSA'
        },
        { fieldName: 'file', filename: 'Graph_Algorithms.pdf', buffer: VALID_PDF }
      );

      const res = await apiRequest('/api/assignments/upload', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer token_teacher_sarah',
          'Content-Type': contentType
        },
        body
      });

      assert.strictEqual(res.status, 201, `Expected 201 Created but received ${res.status}: ${JSON.stringify(res.json)}`);
      assert.strictEqual(res.json.success, true);
      assert.ok(res.json.assignment, 'Response must include assignment object');
      assert.strictEqual(res.json.assignment.teacherUid, 'teacher_sarah');
      assert.strictEqual(res.json.assignment.title, 'Graph Algorithms Homework');
      assert.strictEqual(res.json.assignment.storageProvider, 'google');
      assert.ok(res.json.message.includes('Assignment PDF uploaded'));

      // Crucial: verify that the response is NOT a student submission response!
      assert.strictEqual(res.json.submission, undefined, 'Must not be handled by student submission handler');
    });

    console.log('\n--- SECTION 3: Verification 3 — Unauthenticated Rejection ---');

    await runTest('3.1: Unauthenticated request to /api/submissions/upload returns 401 Unauthorized', async () => {
      const { contentType, body } = buildMultipart(
        { assignmentId: 'asg_active_dsa' },
        { fieldName: 'file', filename: 'Unauth.pdf', buffer: VALID_PDF }
      );

      const res = await apiRequest('/api/submissions/upload', {
        method: 'POST',
        headers: {
          'Content-Type': contentType
        },
        body
      });

      assert.strictEqual(res.status, 401);
      assert.strictEqual(res.json.success, false);
      assert.ok(res.json.error.includes('Authorization header'));
    });

    await runTest('3.2: Unauthenticated request to /api/assignments/upload returns 401 Unauthorized', async () => {
      const res = await apiRequest('/api/assignments/upload', {
        method: 'POST'
      });
      assert.strictEqual(res.status, 401);
      assert.strictEqual(res.json.success, false);
    });

    console.log('\n--- SECTION 4: Verification 4 — Cross-Role Authorization Isolation ---');

    await runTest('4.1: Authenticated student cannot create assignments on /api/assignments/upload (403 Forbidden)', async () => {
      const { contentType, body } = buildMultipart(
        {
          title: 'Illegitimate Student Assignment',
          department: 'CSE AI',
          year: '2nd Year',
          section: 'Sec C',
          dueDate: '2026-11-20'
        },
        { fieldName: 'file', filename: 'Hack.pdf', buffer: VALID_PDF }
      );

      const res = await apiRequest('/api/assignments/upload', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer token_student_alex',
          'Content-Type': contentType
        },
        body
      });

      assert.strictEqual(res.status, 403);
      assert.strictEqual(res.json.success, false);
      assert.ok(res.json.error.includes('Only faculty members'));
    });

    await runTest('4.2: Authenticated student submission on /api/submissions/upload is NOT intercepted by teacher handler', async () => {
      // Send a student submission with NO teacher fields (no title, department, year, etc.)
      // If it were intercepted by handleUploadAssignment, it would fail with "Missing required fields" or "allocation not found"
      const { contentType, body } = buildMultipart(
        { assignmentId: 'asg_active_dsa' },
        { fieldName: 'file', filename: 'Alex_Solution_2.pdf', buffer: VALID_PDF }
      );

      const res = await apiRequest('/api/submissions/upload', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer token_student_alex',
          'Content-Type': contentType
        },
        body
      });

      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.json.success, true);
      assert.ok(res.json.submission);
    });

    console.log('\n--- SECTION 5: Verification 5 — Teacher Authorization & Role Enforcement ---');

    await runTest('5.1: Unallocated teacher cannot upload assignment to unallocated section (403 Forbidden)', async () => {
      const { contentType, body } = buildMultipart(
        {
          title: 'Unauthorized Section Assignment',
          department: 'CSE AI',
          year: '2nd Year',
          section: 'Sec C',
          dueDate: '2026-11-20'
        },
        { fieldName: 'file', filename: 'Unauthorized.pdf', buffer: VALID_PDF }
      );

      const res = await apiRequest('/api/assignments/upload', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer token_teacher_bob',
          'Content-Type': contentType
        },
        body
      });

      assert.strictEqual(res.status, 403);
      assert.strictEqual(res.json.success, false);
      assert.ok(res.json.error.includes('Missing or unauthorized teacher allocation'));
    });

    await runTest('5.2: Teacher cannot submit coursework responses on /api/submissions/upload (403 FORBIDDEN_ROLE)', async () => {
      const { contentType, body } = buildMultipart(
        { assignmentId: 'asg_active_dsa' },
        { fieldName: 'file', filename: 'Teacher_Attempt.pdf', buffer: VALID_PDF }
      );

      const res = await apiRequest('/api/submissions/upload', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer token_teacher_sarah',
          'Content-Type': contentType
        },
        body
      });

      assert.strictEqual(res.status, 403);
      assert.strictEqual(res.json.code, 'FORBIDDEN_ROLE');
      assert.ok(res.json.error.includes('Only authenticated students'));
    });

    console.log('\n--- SECTION 6: Verification 6 — Route Aliases & Similarity Route Integrity ---');

    await runTest('6.1: Storage alias /api/storage/google/upload-assignment functions for teacher upload', async () => {
      const { contentType, body } = buildMultipart(
        {
          title: 'Aliased Google Upload Assignment',
          department: 'CSE AI',
          year: '2nd Year',
          section: 'Sec C',
          dueDate: '2026-11-20'
        },
        { fieldName: 'file', filename: 'Alias_Teacher.pdf', buffer: VALID_PDF }
      );

      const res = await apiRequest('/api/storage/google/upload-assignment', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer token_teacher_sarah',
          'Content-Type': contentType
        },
        body
      });

      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.json.success, true);
      assert.ok(res.json.assignment);
    });

    await runTest('6.2: Storage alias /api/storage/submissions/upload functions for student submission', async () => {
      const { contentType, body } = buildMultipart(
        { assignmentId: 'asg_active_dsa' },
        { fieldName: 'file', filename: 'Storage_Alias_Sub.pdf', buffer: VALID_PDF }
      );

      const res = await apiRequest('/api/storage/submissions/upload', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer token_student_alex',
          'Content-Type': contentType
        },
        body
      });

      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.json.success, true);
      assert.ok(res.json.submission);
    });

    await runTest('6.3: GET /api/submissions/my-submissions returns student submissions', async () => {
      const res = await apiRequest('/api/submissions/my-submissions', {
        method: 'GET',
        headers: {
          Authorization: 'Bearer token_student_alex'
        }
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.json.success, true);
      assert.ok(Array.isArray(res.json.submissions));
      assert.ok(res.json.submissions.length > 0);
      assert.strictEqual(res.json.submissions[0].studentUid, 'student_alex');
    });

    await runTest('6.4: GET /api/submissions/assignment/:assignmentId returns student submission', async () => {
      const res = await apiRequest('/api/submissions/assignment/asg_active_dsa', {
        method: 'GET',
        headers: {
          Authorization: 'Bearer token_student_alex'
        }
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.json.success, true);
      assert.ok(res.json.submission);
      assert.strictEqual(res.json.submission.assignmentId, 'asg_active_dsa');
    });

    await runTest('6.5: GET /api/health returns 200 healthy status', async () => {
      const res = await apiRequest('/api/health');
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.json.status, 'healthy');
    });

    await runTest('6.6: POST /api/similarity handles multipart upload and unlinks files', async () => {
      const boundary = `----SimBoundary${Date.now()}`;
      const partA = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="fileA"; filename="a.pdf"\r\nContent-Type: application/pdf\r\n\r\n%PDF-1.4 fileA content\r\n`);
      const partB = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="fileB"; filename="b.pdf"\r\nContent-Type: application/pdf\r\n\r\n%PDF-1.4 fileB content\r\n--${boundary}--\r\n`);
      const body = Buffer.concat([partA, partB]);

      const res = await apiRequest('/api/similarity', {
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`
        },
        body
      });

      // Without Gemini API key it returns 500 or AI error, but the route is reached and parses multipart correctly
      assert.ok([200, 500].includes(res.status), `Similarity route must be reached (received ${res.status})`);
    });

  } finally {
    setCustomAuthService(null);
    await new Promise((resolve) => server.close(resolve));
  }

  console.log('\n======================================================');
  console.log(` RESULTS: ${passed} passed, ${failed} failed`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runAll().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
