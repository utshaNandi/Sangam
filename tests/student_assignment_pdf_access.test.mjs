import assert from 'node:assert';
import crypto from 'node:crypto';
import http from 'node:http';

// Configure test environment variables before server initialization
process.env.TEST_MODE = 'true';
process.env.NODE_ENV = 'test';
process.env.TOKEN_ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
process.env.GOOGLE_CLIENT_ID = 'test-client-id-pdf-access.apps.googleusercontent.com';
process.env.GOOGLE_CLIENT_SECRET = 'test-mock-google-client-secret';
process.env.GOOGLE_REDIRECT_URI = 'http://localhost:3001/api/storage/google/callback';
process.env.FRONTEND_URL = 'http://localhost:5173';

import {
  googleDriveService,
  isMatchingDepartment,
  isMatchingSection
} from '../server/services/googleDriveService.js';
import { encrypt } from '../server/services/encryptionService.js';
import { setCustomAuthService } from '../server/middleware/authMiddleware.js';
import { app } from '../server.js';
import {
  handleGetAssignments,
  handleDownloadAssignmentFile
} from '../server/routes/storageRoutes.js';

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
// High-Fidelity Mock Firestore for PDF Access Verification
// -----------------------------------------------------------------------------
class MockFirestoreStore {
  constructor() {
    this.store = new Map();
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
      get: async () => {
        const docs = [];
        for (const [key, record] of self.store.entries()) {
          if (key.startsWith(`${collName}/`)) {
            const docId = key.replace(`${collName}/`, '');
            docs.push({
              id: docId,
              data: () => JSON.parse(JSON.stringify(record.data))
            });
          }
        }
        return {
          docs,
          empty: docs.length === 0,
          forEach: (cb) => docs.forEach(cb)
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
                }
                if (matches) {
                  const docId = key.replace(`${collName}/`, '');
                  docs.push({
                    id: docId,
                    data: () => JSON.parse(JSON.stringify(record.data))
                  });
                }
              }
            }
            return {
              docs,
              empty: docs.length === 0,
              forEach: (cb) => docs.forEach(cb)
            };
          }
        };
        return queryObj;
      }
    };
  }
}

// -----------------------------------------------------------------------------
// HTTP Request Helper
// -----------------------------------------------------------------------------
function makeHttpRequest(server, { method, path, headers = {}, body = null }) {
  return new Promise((resolve, reject) => {
    const address = server.address();
    const port = address.port;
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path,
        method,
        headers
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const rawBuffer = Buffer.concat(chunks);
          let json = null;
          try {
            json = JSON.parse(rawBuffer.toString('utf-8'));
          } catch {
            // Not JSON (e.g. binary PDF)
          }
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: json,
            rawBuffer
          });
        });
      }
    );

    req.on('error', reject);
    if (body) {
      if (Buffer.isBuffer(body)) {
        req.write(body);
      } else if (typeof body === 'object') {
        req.write(JSON.stringify(body));
      } else {
        req.write(String(body));
      }
    }
    req.end();
  });
}

console.log('\n======================================================');
console.log(' SANGAM STUDENT ASSIGNMENT PDF ACCESS TEST SUITE');
console.log(' Notice: Tests use deterministic mock Firestore & Drive double');
console.log(' for local verification without live Google network calls.');
console.log('======================================================\n');

async function runAllTests() {
  const mockDb = new MockFirestoreStore();
  googleDriveService.setTestDb(mockDb);

  // Set up mock Drive API for file downloading
  const driveFiles = new Map();
  googleDriveService.customDriveApi = {
    downloadFile: async (driveFileId, accessToken) => {
      if (!accessToken || !accessToken.startsWith('valid_access_token_')) {
        const authErr = new Error('Invalid or expired Google access token.');
        authErr.statusCode = 401;
        authErr.code = 'GOOGLE_AUTH_REVOKED';
        throw authErr;
      }
      if (!driveFiles.has(driveFileId)) {
        const notFoundErr = new Error(`File '${driveFileId}' not found in Google Drive.`);
        notFoundErr.statusCode = 404;
        notFoundErr.code = 'FILE_NOT_FOUND';
        throw notFoundErr;
      }
      return driveFiles.get(driveFileId);
    }
  };

  // Seed sample PDF files in mock Drive
  const samplePdfBytes = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Title (CS301_Assignment1) >>\nendobj\ntrailer\n<<>>\n%%EOF');
  driveFiles.set('drive_file_cs301_pdf', samplePdfBytes);

  // Seed Teacher Integration
  const encAccess = encrypt('valid_access_token_teacher_sarah');
  const encRefresh = encrypt('valid_refresh_token_teacher_sarah');
  await mockDb.collection('faculty_storage_integrations').doc('teacher_sarah').set({
    facultyUid: 'teacher_sarah',
    status: 'connected',
    provider: 'google',
    accountEmail: 'sarah.jenkins@university.edu',
    accountName: 'Dr. Sarah Jenkins',
    encryptedAccessToken: encAccess.encryptedData,
    accessTokenIv: encAccess.iv,
    accessTokenAuthTag: encAccess.authTag,
    encryptedRefreshToken: encRefresh.encryptedData,
    refreshTokenIv: encRefresh.iv,
    refreshTokenAuthTag: encRefresh.authTag,
    tokenExpiresAt: Date.now() + 3600000
  });

  // Seed Users
  await mockDb.collection('users').doc('teacher_sarah').set({
    uid: 'teacher_sarah',
    name: 'Dr. Sarah Jenkins',
    email: 'sarah.jenkins@university.edu',
    role: 'faculty',
    status: 'active',
    institution: 'Apex Institute of Technology',
    department: 'Computer Science'
  });

  await mockDb.collection('users').doc('student_alice_sec_c').set({
    uid: 'student_alice_sec_c',
    name: 'Alice Smith',
    email: 'alice.c@apex.edu',
    role: 'student',
    status: 'active',
    institution: 'Apex Institute of Technology',
    department: 'CSE AI', // Canonical alias for Computer Science
    year: '2nd Year',
    section: 'Section C',
    roll: 'CSE-2024-042'
  });

  await mockDb.collection('users').doc('student_bob_sec_a').set({
    uid: 'student_bob_sec_a',
    name: 'Bob Jones',
    email: 'bob.a@apex.edu',
    role: 'student',
    status: 'active',
    institution: 'Apex Institute of Technology',
    department: 'Computer Science',
    year: '2nd Year',
    section: 'Section A',
    roll: 'CSE-2024-010'
  });

  await mockDb.collection('users').doc('student_charlie_mech').set({
    uid: 'student_charlie_mech',
    name: 'Charlie Brown',
    email: 'charlie.m@apex.edu',
    role: 'student',
    status: 'active',
    institution: 'Apex Institute of Technology',
    department: 'Mechanical Engineering',
    year: '2nd Year',
    section: 'Section C',
    roll: 'ME-2024-005'
  });

  await mockDb.collection('users').doc('student_david_inactive').set({
    uid: 'student_david_inactive',
    name: 'David Inactive',
    email: 'david.i@apex.edu',
    role: 'student',
    status: 'pending', // Inactive account
    institution: 'Apex Institute of Technology',
    department: 'Computer Science',
    year: '2nd Year',
    section: 'Section C'
  });

  // Seed Assignments
  // Assignment 1: Targeted at Computer Science • 2nd Year • Sec C (uploaded by Sarah)
  await mockDb.collection('assignments').doc('asg_cse_sec_c_1').set({
    id: 'asg_cse_sec_c_1',
    teacherUid: 'teacher_sarah',
    teacherName: 'Dr. Sarah Jenkins',
    teacherEmail: 'sarah.jenkins@university.edu',
    institution: 'Apex Institute of Technology',
    department: 'Computer Science',
    year: '2nd Year',
    section: 'Sec C',
    subject: 'Data Structures & Algorithms',
    title: 'Assignment 1: Binary Trees and Graph Traversal',
    description: 'Implement BFS and DFS in C++ and analyze time complexity.',
    dueDate: '2026-11-01',
    storageProvider: 'google',
    driveFileId: 'drive_file_cs301_pdf',
    driveFileName: 'Assignment_BinaryTrees_GraphTraversal.pdf',
    fileSizeBytes: samplePdfBytes.length,
    mimeType: 'application/pdf',
    createdAt: new Date().toISOString()
  });

  // Assignment 2: Targeted at Computer Science • 2nd Year • Sec A (uploaded by Sarah)
  await mockDb.collection('assignments').doc('asg_cse_sec_a_1').set({
    id: 'asg_cse_sec_a_1',
    teacherUid: 'teacher_sarah',
    teacherName: 'Dr. Sarah Jenkins',
    teacherEmail: 'sarah.jenkins@university.edu',
    institution: 'Apex Institute of Technology',
    department: 'Computer Science',
    year: '2nd Year',
    section: 'Sec A',
    subject: 'Algorithms',
    title: 'Section A Assignment: Dynamic Programming',
    dueDate: '2026-11-05',
    storageProvider: 'google',
    driveFileId: 'drive_file_cs301_pdf',
    driveFileName: 'Section_A_DP.pdf',
    fileSizeBytes: samplePdfBytes.length,
    mimeType: 'application/pdf',
    createdAt: new Date().toISOString()
  });

  // Assignment 3: Without a PDF file
  await mockDb.collection('assignments').doc('asg_no_pdf').set({
    id: 'asg_no_pdf',
    teacherUid: 'teacher_sarah',
    teacherName: 'Dr. Sarah Jenkins',
    teacherEmail: 'sarah.jenkins@university.edu',
    institution: 'Apex Institute of Technology',
    department: 'Computer Science',
    year: '2nd Year',
    section: 'Sec C',
    subject: 'Operating Systems',
    title: 'OS Quiz Instructions (No PDF)',
    dueDate: '2026-11-10',
    driveFileId: null,
    createdAt: new Date().toISOString()
  });

  // Seed a submission for Alice on Assignment 1
  await mockDb.collection('submissions').doc('asg_cse_sec_c_1_student_alice_sec_c').set({
    id: 'asg_cse_sec_c_1_student_alice_sec_c',
    assignmentId: 'asg_cse_sec_c_1',
    assignmentTitle: 'Assignment 1: Binary Trees and Graph Traversal',
    studentUid: 'student_alice_sec_c',
    studentName: 'Alice Smith',
    studentEmail: 'alice.c@apex.edu',
    studentRoll: 'CSE-2024-042',
    teacherUid: 'teacher_sarah',
    storageProvider: 'google_drive',
    driveFileId: 'drive_file_submission_alice',
    fileName: 'Submission_CSE-2024-042_Alice_Smith.pdf',
    originalFileName: 'Alice_DSA_Assg1.pdf',
    fileSizeBytes: 12040,
    submittedAt: new Date().toISOString()
  });

  console.log('--- SECTION 1: Student Assignment Listing & Academic Scope Filtering ---');

  await runTest('1.1: Student in matching scope (Alice: CSE AI, 2nd Year, Section C) receives eligible assignment', async () => {
    const list = await googleDriveService.getAssignmentsForUser('student_alice_sec_c');
    assert(Array.isArray(list), 'Expected assignments list to be an array');
    
    // Alice matches asg_cse_sec_c_1 (via CSE AI alias & Section C alias) and asg_no_pdf
    const matchIds = list.map(a => a.id);
    assert(matchIds.includes('asg_cse_sec_c_1'), 'Alice should see asg_cse_sec_c_1');
    assert(matchIds.includes('asg_no_pdf'), 'Alice should see asg_no_pdf');
    
    // Alice MUST NOT see Sec A assignment
    assert(!matchIds.includes('asg_cse_sec_a_1'), 'Alice must NOT see Section A assignment');

    const asg1 = list.find(a => a.id === 'asg_cse_sec_c_1');
    assert.strictEqual(asg1.title, 'Assignment 1: Binary Trees and Graph Traversal');
    assert.strictEqual(asg1.teacherName, 'Dr. Sarah Jenkins');
    assert.strictEqual(asg1.hasFile, true);
    assert.strictEqual(asg1.fileName, 'Assignment_BinaryTrees_GraphTraversal.pdf');
    assert.strictEqual(asg1.fileSizeBytes, samplePdfBytes.length);
    assert.strictEqual(asg1.isSubmitted, true, 'Alice submission should be reflected in isSubmitted');
    assert(asg1.submission, 'Alice submission object should be attached');
    assert.strictEqual(asg1.submission.fileName, 'Submission_CSE-2024-042_Alice_Smith.pdf');
  });

  await runTest('1.2: Student in different section (Bob: Sec A) receives only Sec A assignments', async () => {
    const list = await googleDriveService.getAssignmentsForUser('student_bob_sec_a');
    const matchIds = list.map(a => a.id);
    assert(matchIds.includes('asg_cse_sec_a_1'), 'Bob should see asg_cse_sec_a_1');
    assert(!matchIds.includes('asg_cse_sec_c_1'), 'Bob must NOT see Section C assignment');
    assert(!matchIds.includes('asg_no_pdf'), 'Bob must NOT see Section C assignment');
    
    const asgA = list.find(a => a.id === 'asg_cse_sec_a_1');
    assert.strictEqual(asgA.isSubmitted, false, 'Bob has not submitted this assignment');
  });

  await runTest('1.3: Student in different department (Charlie: Mechanical) does not see Computer Science assignments', async () => {
    const list = await googleDriveService.getAssignmentsForUser('student_charlie_mech');
    assert.strictEqual(list.length, 0, 'Charlie in Mechanical Engineering should not see CSE assignments');
  });

  await runTest('1.4: Inactive student (David) receives zero assignments', async () => {
    const list = await googleDriveService.getAssignmentsForUser('student_david_inactive');
    assert.strictEqual(list.length, 0, 'Inactive student should receive empty list');
  });

  await runTest('1.5: Teacher receives assignments they created', async () => {
    const list = await googleDriveService.getAssignmentsForUser('teacher_sarah');
    assert(list.length >= 3, 'Sarah should see all 3 assignments created by her');
  });

  console.log('\n--- SECTION 2: Secure Assignment PDF Download & Access Control ---');

  await runTest('2.1: Eligible student (Alice) downloads original teacher PDF successfully', async () => {
    const result = await googleDriveService.getAssignmentFile('asg_cse_sec_c_1', 'student_alice_sec_c');
    assert(result, 'Expected download result');
    assert(Buffer.isBuffer(result.fileBuffer), 'Expected binary Buffer');
    assert.strictEqual(result.fileBuffer.toString('utf-8'), samplePdfBytes.toString('utf-8'));
    assert.strictEqual(result.fileName, 'Assignment_BinaryTrees_GraphTraversal.pdf');
    assert.strictEqual(result.mimeType, 'application/pdf');
    assert.strictEqual(result.fileSizeBytes, samplePdfBytes.length);
  });

  await runTest('2.2: Owning teacher (Sarah) downloads her own assignment PDF', async () => {
    const result = await googleDriveService.getAssignmentFile('asg_cse_sec_c_1', 'teacher_sarah');
    assert(Buffer.isBuffer(result.fileBuffer));
    assert.strictEqual(result.fileBuffer.toString('utf-8'), samplePdfBytes.toString('utf-8'));
  });

  await runTest('2.3: Ineligible student (Bob in Sec A) is blocked from downloading Sec C PDF (403 FORBIDDEN_SCOPE)', async () => {
    await assert.rejects(
      async () => {
        await googleDriveService.getAssignmentFile('asg_cse_sec_c_1', 'student_bob_sec_a');
      },
      (err) => {
        assert.strictEqual(err.statusCode, 403);
        assert.strictEqual(err.code, 'FORBIDDEN_SCOPE');
        return true;
      }
    );
  });

  await runTest('2.4: Student in different department (Charlie) is blocked from downloading PDF (403 FORBIDDEN_SCOPE)', async () => {
    await assert.rejects(
      async () => {
        await googleDriveService.getAssignmentFile('asg_cse_sec_c_1', 'student_charlie_mech');
      },
      (err) => {
        assert.strictEqual(err.statusCode, 403);
        assert.strictEqual(err.code, 'FORBIDDEN_SCOPE');
        return true;
      }
    );
  });

  await runTest('2.5: Non-existent assignment ID rejected with 404 ASSIGNMENT_NOT_FOUND', async () => {
    await assert.rejects(
      async () => {
        await googleDriveService.getAssignmentFile('non_existent_asg_id', 'student_alice_sec_c');
      },
      (err) => {
        assert.strictEqual(err.statusCode, 404);
        assert.strictEqual(err.code, 'ASSIGNMENT_NOT_FOUND');
        return true;
      }
    );
  });

  await runTest('2.6: Assignment without attached PDF rejected with 404 FILE_NOT_FOUND', async () => {
    await assert.rejects(
      async () => {
        await googleDriveService.getAssignmentFile('asg_no_pdf', 'student_alice_sec_c');
      },
      (err) => {
        assert.strictEqual(err.statusCode, 404);
        assert.strictEqual(err.code, 'FILE_NOT_FOUND');
        return true;
      }
    );
  });

  console.log('\n--- SECTION 3: HTTP API Endpoint Integration & Security Headers ---');

  // Start HTTP server for E2E route testing
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  // Configure custom auth double for Express middleware testing
  setCustomAuthService({
    verifyIdToken: async (token) => {
      if (token === 'token_alice_sec_c') {
        return { uid: 'student_alice_sec_c', email: 'alice.c@apex.edu' };
      }
      if (token === 'token_bob_sec_a') {
        return { uid: 'student_bob_sec_a', email: 'bob.a@apex.edu' };
      }
      if (token === 'token_teacher_sarah') {
        return { uid: 'teacher_sarah', email: 'sarah.jenkins@university.edu' };
      }
      throw new Error('Invalid Firebase token');
    }
  });

  try {
    await runTest('3.1: GET /api/assignments rejects unauthenticated requests with 401', async () => {
      const res = await makeHttpRequest(server, {
        method: 'GET',
        path: '/api/assignments'
      });
      assert.strictEqual(res.statusCode, 401);
      assert.strictEqual(res.body.success, false);
    });

    await runTest('3.2: GET /api/assignments returns filtered assignments for authenticated student Alice', async () => {
      const res = await makeHttpRequest(server, {
        method: 'GET',
        path: '/api/assignments',
        headers: {
          Authorization: 'Bearer token_alice_sec_c'
        }
      });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
      assert(Array.isArray(res.body.assignments));
      
      const ids = res.body.assignments.map(a => a.id);
      assert(ids.includes('asg_cse_sec_c_1'), 'Should include Sec C assignment');
      assert(!ids.includes('asg_cse_sec_a_1'), 'Must not include Sec A assignment');

      const asg1 = res.body.assignments.find(a => a.id === 'asg_cse_sec_c_1');
      assert.strictEqual(asg1.isSubmitted, true);
      assert.strictEqual(asg1.hasFile, true);
      assert.strictEqual(asg1.fileName, 'Assignment_BinaryTrees_GraphTraversal.pdf');
    });

    await runTest('3.3: GET /api/assignments/:id/file rejects unauthenticated download with 401', async () => {
      const res = await makeHttpRequest(server, {
        method: 'GET',
        path: '/api/assignments/asg_cse_sec_c_1/file'
      });
      assert.strictEqual(res.statusCode, 401);
    });

    await runTest('3.4: GET /api/assignments/:id/file serves binary PDF stream to eligible student Alice', async () => {
      const res = await makeHttpRequest(server, {
        method: 'GET',
        path: '/api/assignments/asg_cse_sec_c_1/file',
        headers: {
          Authorization: 'Bearer token_alice_sec_c'
        }
      });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.headers['content-type'], 'application/pdf');
      assert(res.headers['content-disposition'].includes('Assignment_BinaryTrees_GraphTraversal.pdf'));
      assert.strictEqual(res.rawBuffer.toString('utf-8'), samplePdfBytes.toString('utf-8'));
    });

    await runTest('3.5: GET /api/assignments/:id/file rejects unauthorized student Bob (Sec A) with 403', async () => {
      const res = await makeHttpRequest(server, {
        method: 'GET',
        path: '/api/assignments/asg_cse_sec_c_1/file',
        headers: {
          Authorization: 'Bearer token_bob_sec_a'
        }
      });
      assert.strictEqual(res.statusCode, 403);
      assert.strictEqual(res.body.code, 'FORBIDDEN_SCOPE');
    });

    await runTest('3.6: GET /api/assignments/:id/download alias works identically', async () => {
      const res = await makeHttpRequest(server, {
        method: 'GET',
        path: '/api/assignments/asg_cse_sec_c_1/download',
        headers: {
          Authorization: 'Bearer token_alice_sec_c'
        }
      });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.headers['content-type'], 'application/pdf');
      assert.strictEqual(res.rawBuffer.toString('utf-8'), samplePdfBytes.toString('utf-8'));
    });

  } finally {
    setCustomAuthService(null);
    server.close();
  }

  console.log('\n======================================================');
  console.log(` RESULTS: ${passed} passed, ${failed} failed`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runAllTests().catch((err) => {
  console.error('Test suite failed unexpectedly:', err);
  process.exit(1);
});
