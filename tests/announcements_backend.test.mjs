import assert from 'node:assert';
import http from 'node:http';
import crypto from 'node:crypto';

// Configure test environment
process.env.TEST_MODE = 'true';
process.env.NODE_ENV = 'test';
process.env.TOKEN_ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');

import { app } from '../server.js';
import { announcementService } from '../server/services/announcementService.js';
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
console.log(' SANGAM ANNOUNCEMENTS BACKEND — COMPREHENSIVE TEST SUITE');
console.log(' Tests cover Director, Teacher, and Student permissions,');
console.log(' allocation verification, canonical aliases, scoping & pagination.');
console.log('======================================================\n');

// -----------------------------------------------------------------------------
// High-Fidelity Mock Firestore for Announcements
// -----------------------------------------------------------------------------
class MockFirestore {
  constructor() {
    this.store = {
      users: {},
      teacher_allocations: {},
      announcements: {}
    };
  }

  collection(name) {
    if (!this.store[name]) {
      this.store[name] = {};
    }
    const collStore = this.store[name];

    return {
      doc: (id) => ({
        get: async () => {
          const data = collStore[id];
          return {
            exists: Boolean(data),
            id,
            data: () => (data ? { ...data } : undefined)
          };
        },
        set: async (data) => {
          collStore[id] = { ...data };
        },
        delete: async () => {
          delete collStore[id];
        }
      }),
      where: (field, op, val) => ({
        get: async () => {
          const docs = [];
          for (const [id, data] of Object.entries(collStore)) {
            if (op === '==' && data[field] === val) {
              docs.push({
                exists: true,
                id,
                data: () => ({ ...data })
              });
            }
          }
          return {
            docs,
            forEach: (cb) => docs.forEach(cb)
          };
        }
      }),
      get: async () => {
        const docs = Object.entries(collStore).map(([id, data]) => ({
          exists: true,
          id,
          data: () => ({ ...data })
        }));
        return {
          docs,
          forEach: (cb) => docs.forEach(cb)
        };
      }
    };
  }
}

const mockDb = new MockFirestore();
announcementService.setTestDb(mockDb);

// Mock Auth Service to verify tokens deterministically
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

// Helper to register mock user tokens
function registerToken(token, userPayload) {
  tokenStore.set(token, userPayload);
}

// HTTP request helper against the Express app
let testServer = null;
let baseUrl = '';

beforeTests: {
  // Start server on an ephemeral port
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
      {
        method,
        headers
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
    if (payload) {
      req.write(payload);
    }
    req.end();
  });
}

// -----------------------------------------------------------------------------
// Seed Profiles & Data Fixtures
// -----------------------------------------------------------------------------
const INST_A = 'Institute of Engineering & Management';
const INST_B = 'Other University';

// Active Director
const DIR_UID = 'uid_director_iem';
const DIR_TOKEN = 'token_dir_iem';
mockDb.store.users[DIR_UID] = {
  uid: DIR_UID,
  email: 'director@iem.edu',
  name: 'Prof. Director',
  role: 'director',
  status: 'active',
  institution: INST_A
};
registerToken(DIR_TOKEN, { uid: DIR_UID, email: 'director@iem.edu' });

// Pending / Inactive Director
const INACTIVE_DIR_UID = 'uid_director_pending';
const INACTIVE_DIR_TOKEN = 'token_dir_pending';
mockDb.store.users[INACTIVE_DIR_UID] = {
  uid: INACTIVE_DIR_UID,
  email: 'pending_dir@iem.edu',
  name: 'Pending Director',
  role: 'director',
  status: 'pending_approval',
  institution: INST_A
};
registerToken(INACTIVE_DIR_TOKEN, { uid: INACTIVE_DIR_UID, email: 'pending_dir@iem.edu' });

// Active Teacher (allocated to CSE AI • 2nd Year • Sec A)
const TEACHER_CS_UID = 'uid_teacher_cs';
const TEACHER_CS_TOKEN = 'token_teacher_cs';
mockDb.store.users[TEACHER_CS_UID] = {
  uid: TEACHER_CS_UID,
  email: 'teacher.cs@iem.edu',
  name: 'Dr. CS Teacher',
  role: 'faculty',
  status: 'active',
  institution: INST_A,
  department: 'Computer Science'
};
registerToken(TEACHER_CS_TOKEN, { uid: TEACHER_CS_UID, email: 'teacher.cs@iem.edu' });

// Active Teacher Allocation in teacher_allocations
const ALLOC_CS_ID = `${TEACHER_CS_UID}_CSE AI_2nd Year_Sec A`;
mockDb.store.teacher_allocations[ALLOC_CS_ID] = {
  teacherUid: TEACHER_CS_UID,
  institution: INST_A,
  department: 'CSE AI',
  year: '2nd Year',
  section: 'Sec A',
  authorized: true
};

// Revoked Allocation
const REVOKED_ALLOC_ID = `${TEACHER_CS_UID}_CSE AI_3rd Year_Sec B`;
mockDb.store.teacher_allocations[REVOKED_ALLOC_ID] = {
  teacherUid: TEACHER_CS_UID,
  institution: INST_A,
  department: 'CSE AI',
  year: '3rd Year',
  section: 'Sec B',
  authorized: false
};

// Active Student 1 (CSE AI • 2nd Year • Sec A)
const STUDENT_1_UID = 'uid_student_cs_2a';
const STUDENT_1_TOKEN = 'token_student_cs_2a';
mockDb.store.users[STUDENT_1_UID] = {
  uid: STUDENT_1_UID,
  email: 'student.2a@iem.edu',
  name: 'Alice Student',
  role: 'student',
  status: 'active',
  institution: INST_A,
  department: 'Computer Science',
  year: '2nd Year',
  section: 'Section A'
};
registerToken(STUDENT_1_TOKEN, { uid: STUDENT_1_UID, email: 'student.2a@iem.edu' });

// Active Student 2 (Mechanical Engineering • 3rd Year • Sec B)
const STUDENT_2_UID = 'uid_student_me_3b';
const STUDENT_2_TOKEN = 'token_student_me_3b';
mockDb.store.users[STUDENT_2_UID] = {
  uid: STUDENT_2_UID,
  email: 'student.me@iem.edu',
  name: 'Bob Mech',
  role: 'student',
  status: 'active',
  institution: INST_A,
  department: 'Mechanical Engineering',
  year: '3rd Year',
  section: 'Section B'
};
registerToken(STUDENT_2_TOKEN, { uid: STUDENT_2_UID, email: 'student.me@iem.edu' });

// Pending Student
const PENDING_STUDENT_UID = 'uid_student_pending';
const PENDING_STUDENT_TOKEN = 'token_student_pending';
mockDb.store.users[PENDING_STUDENT_UID] = {
  uid: PENDING_STUDENT_UID,
  email: 'pending.student@iem.edu',
  name: 'Pending Student',
  role: 'student',
  status: 'pending_approval',
  institution: INST_A,
  department: 'Computer Science',
  year: '2nd Year',
  section: 'Section A'
};
registerToken(PENDING_STUDENT_TOKEN, { uid: PENDING_STUDENT_UID, email: 'pending.student@iem.edu' });

// Active Student 3 (CSE AI • 2nd Year • Sec B) - Same dept and year, different section
const STUDENT_3_UID = 'uid_student_cs_2b';
const STUDENT_3_TOKEN = 'token_student_cs_2b';
mockDb.store.users[STUDENT_3_UID] = {
  uid: STUDENT_3_UID,
  email: 'student.2b@iem.edu',
  name: 'Charlie Student',
  role: 'student',
  status: 'active',
  institution: INST_A,
  department: 'Computer Science',
  year: '2nd Year',
  section: 'Section B'
};
registerToken(STUDENT_3_TOKEN, { uid: STUDENT_3_UID, email: 'student.2b@iem.edu' });

// Active Student 4 (CSE AI • 3rd Year • Sec A) - Same dept and section, different year
const STUDENT_4_UID = 'uid_student_cs_3a';
const STUDENT_4_TOKEN = 'token_student_cs_3a';
mockDb.store.users[STUDENT_4_UID] = {
  uid: STUDENT_4_UID,
  email: 'student.3a@iem.edu',
  name: 'David Student',
  role: 'student',
  status: 'active',
  institution: INST_A,
  department: 'Computer Science',
  year: '3rd Year',
  section: 'Section A'
};
registerToken(STUDENT_4_TOKEN, { uid: STUDENT_4_UID, email: 'student.3a@iem.edu' });

// Active Student from different institution (INST_B)
const STUDENT_INST_B_UID = 'uid_student_inst_b';
const STUDENT_INST_B_TOKEN = 'token_student_inst_b';
mockDb.store.users[STUDENT_INST_B_UID] = {
  uid: STUDENT_INST_B_UID,
  email: 'student@other.edu',
  name: 'Other Inst Student',
  role: 'student',
  status: 'active',
  institution: INST_B,
  department: 'Computer Science',
  year: '2nd Year',
  section: 'Section A'
};
registerToken(STUDENT_INST_B_TOKEN, { uid: STUDENT_INST_B_UID, email: 'student@other.edu' });

// Active Teacher in Mechanical Engineering
const TEACHER_ME_UID = 'uid_teacher_me';
const TEACHER_ME_TOKEN = 'token_teacher_me';
mockDb.store.users[TEACHER_ME_UID] = {
  uid: TEACHER_ME_UID,
  email: 'teacher.me@iem.edu',
  name: 'Dr. ME Teacher',
  role: 'faculty',
  status: 'active',
  institution: INST_A,
  department: 'Mechanical Engineering'
};
registerToken(TEACHER_ME_TOKEN, { uid: TEACHER_ME_UID, email: 'teacher.me@iem.edu' });

const ALLOC_ME_ID = `${TEACHER_ME_UID}_Mechanical Engineering_3rd Year_Sec B`;
mockDb.store.teacher_allocations[ALLOC_ME_ID] = {
  teacherUid: TEACHER_ME_UID,
  institution: INST_A,
  department: 'Mechanical Engineering',
  year: '3rd Year',
  section: 'Sec B',
  authorized: true
};

// -----------------------------------------------------------------------------
// SECTION 1: Account Status & Role Validation
// -----------------------------------------------------------------------------
console.log('--- SECTION 1: Account Status & Role Validation ---');

await runAsyncTest('1.1: Missing Authorization token is rejected with 401 Unauthorized', async () => {
  const res = await apiRequest({ method: 'GET', path: '/api/announcements' });
  assert.strictEqual(res.status, 401);
  assert.strictEqual(res.body.success, false);
});

await runAsyncTest('1.2: Inactive / pending user cannot read announcements (403 Forbidden)', async () => {
  const res = await apiRequest({
    method: 'GET',
    path: '/api/announcements',
    token: INACTIVE_DIR_TOKEN
  });
  assert.strictEqual(res.status, 403);
  assert.strictEqual(res.body.code, 'ACCOUNT_INACTIVE');
});

await runAsyncTest('1.3: Inactive / pending user cannot publish announcements (403 Forbidden)', async () => {
  const res = await apiRequest({
    method: 'POST',
    path: '/api/announcements',
    token: PENDING_STUDENT_TOKEN,
    body: {
      title: 'Should Fail',
      content: 'Pending account publish test',
      scopeType: 'institution'
    }
  });
  assert.strictEqual(res.status, 403);
  assert.strictEqual(res.body.code, 'ACCOUNT_INACTIVE');
});

await runAsyncTest('1.4: Non-existent user profile cannot access announcements (403 Forbidden)', async () => {
  const unregToken = 'token_unregistered';
  registerToken(unregToken, { uid: 'uid_does_not_exist', email: 'ghost@iem.edu' });
  const res = await apiRequest({
    method: 'GET',
    path: '/api/announcements',
    token: unregToken
  });
  assert.strictEqual(res.status, 403);
  assert.strictEqual(res.body.code, 'USER_NOT_FOUND');
});

// -----------------------------------------------------------------------------
// SECTION 2: Director Permissions & Scoping
// -----------------------------------------------------------------------------
console.log('\n--- SECTION 2: Director Permissions & Scoping ---');

let instAnnouncementId = null;
let csBranchAnnouncementId = null;

await runAsyncTest('2.1: Director can publish institution-wide announcement', async () => {
  const res = await apiRequest({
    method: 'POST',
    path: '/api/announcements',
    token: DIR_TOKEN,
    body: {
      title: 'Campus Spring Fest 2026',
      content: 'All faculty and students are invited to the annual festival.',
      scopeType: 'institution',
      priority: 'normal'
    }
  });
  assert.strictEqual(res.status, 201);
  assert.strictEqual(res.body.success, true);
  assert.strictEqual(res.body.announcement.scopeType, 'institution');
  assert.strictEqual(res.body.announcement.institution, INST_A);
  assert.strictEqual(res.body.announcement.authorUid, DIR_UID);
  instAnnouncementId = res.body.announcement.id;
});

await runAsyncTest('2.2: Director can publish department-wide announcement (e.g. Computer Science)', async () => {
  const res = await apiRequest({
    method: 'POST',
    path: '/api/announcements',
    token: DIR_TOKEN,
    body: {
      title: 'CS Research Symposium',
      content: 'Call for papers for all Computer Science scholars.',
      scopeType: 'branch',
      department: 'Computer Science'
    }
  });
  assert.strictEqual(res.status, 201);
  assert.strictEqual(res.body.success, true);
  assert.strictEqual(res.body.announcement.scopeType, 'branch');
  assert.strictEqual(res.body.announcement.department, 'Computer Science');
  csBranchAnnouncementId = res.body.announcement.id;
});

let csYearAnnouncementId = null;
let csSectionAnnouncementId = null;

await runAsyncTest('2.3a: Director can publish department + year announcement', async () => {
  const res = await apiRequest({
    method: 'POST',
    path: '/api/announcements',
    token: DIR_TOKEN,
    body: {
      title: 'CS 2nd Year Project Deadline',
      content: 'All 2nd year CS students must submit project proposals.',
      scopeType: 'year',
      department: 'Computer Science',
      year: '2nd Year'
    }
  });
  assert.strictEqual(res.status, 201);
  assert.strictEqual(res.body.success, true);
  assert.strictEqual(res.body.announcement.scopeType, 'year');
  assert.strictEqual(res.body.announcement.department, 'Computer Science');
  assert.strictEqual(res.body.announcement.year, '2nd Year');
  assert.strictEqual(res.body.announcement.section, null);
  csYearAnnouncementId = res.body.announcement.id;
});

await runAsyncTest('2.3b: Director can publish exact department + year + section announcement', async () => {
  const res = await apiRequest({
    method: 'POST',
    path: '/api/announcements',
    token: DIR_TOKEN,
    body: {
      title: 'CS 2nd Year Sec A Lab Reschedule',
      content: 'Class Section A lab moved to Thursday.',
      scopeType: 'section',
      department: 'Computer Science',
      year: '2nd Year',
      section: 'Section A'
    }
  });
  assert.strictEqual(res.status, 201);
  assert.strictEqual(res.body.success, true);
  assert.strictEqual(res.body.announcement.scopeType, 'section');
  assert.strictEqual(res.body.announcement.department, 'Computer Science');
  assert.strictEqual(res.body.announcement.year, '2nd Year');
  assert.strictEqual(res.body.announcement.section, 'Section A');
  csSectionAnnouncementId = res.body.announcement.id;
});

await runAsyncTest('2.3c: Director publishing branch without department fails (400 Bad Request)', async () => {
  const res = await apiRequest({
    method: 'POST',
    path: '/api/announcements',
    token: DIR_TOKEN,
    body: {
      title: 'Missing Dept Notice',
      content: 'Content here',
      scopeType: 'branch'
    }
  });
  assert.strictEqual(res.status, 400);
  assert.strictEqual(res.body.code, 'MISSING_DEPARTMENT');
});

await runAsyncTest('2.3d: Director publishing year without year fails (400 Bad Request)', async () => {
  const res = await apiRequest({
    method: 'POST',
    path: '/api/announcements',
    token: DIR_TOKEN,
    body: {
      title: 'Missing Year Notice',
      content: 'Content here',
      scopeType: 'year',
      department: 'Computer Science'
    }
  });
  assert.strictEqual(res.status, 400);
  assert.strictEqual(res.body.code, 'MISSING_YEAR');
});

await runAsyncTest('2.3e: Director publishing section without section fails (400 Bad Request)', async () => {
  const res = await apiRequest({
    method: 'POST',
    path: '/api/announcements',
    token: DIR_TOKEN,
    body: {
      title: 'Missing Section Notice',
      content: 'Content here',
      scopeType: 'section',
      department: 'Computer Science',
      year: '2nd Year'
    }
  });
  assert.strictEqual(res.status, 400);
  assert.strictEqual(res.body.code, 'MISSING_SECTION');
});

await runAsyncTest('2.4: Director cannot spoof institution via request body (server enforces profile institution)', async () => {
  const res = await apiRequest({
    method: 'POST',
    path: '/api/announcements',
    token: DIR_TOKEN,
    body: {
      title: 'Spoofed Institution Notice',
      content: 'Trying to post to another institution.',
      scopeType: 'institution',
      institution: INST_B // Ignored!
    }
  });
  assert.strictEqual(res.status, 201);
  assert.strictEqual(res.body.announcement.institution, INST_A);
});

await runAsyncTest('2.5: Director can read all announcements for their institution', async () => {
  const res = await apiRequest({
    method: 'GET',
    path: '/api/announcements',
    token: DIR_TOKEN
  });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.success, true);
  assert.ok(res.body.announcements.length >= 2);
  const titles = res.body.announcements.map((a) => a.title);
  assert.ok(titles.includes('Campus Spring Fest 2026'));
  assert.ok(titles.includes('CS Research Symposium'));
});

// -----------------------------------------------------------------------------
// SECTION 3: Teacher Permissions & Allocation Verification
// -----------------------------------------------------------------------------
console.log('\n--- SECTION 3: Teacher Permissions & Allocation Verification ---');

let teacherSecAnnouncementId = null;

await runAsyncTest('3.1: Teacher can publish to an authorized allocated section', async () => {
  const res = await apiRequest({
    method: 'POST',
    path: '/api/announcements',
    token: TEACHER_CS_TOKEN,
    body: {
      title: 'Midterm Exam Preparation Guide',
      content: 'Please review chapters 1 to 4 for the upcoming midterm.',
      scopeType: 'section',
      department: 'CSE AI',
      year: '2nd Year',
      section: 'Sec A'
    }
  });
  assert.strictEqual(res.status, 201);
  assert.strictEqual(res.body.success, true);
  assert.strictEqual(res.body.announcement.scopeType, 'section');
  assert.strictEqual(res.body.announcement.authorUid, TEACHER_CS_UID);
  teacherSecAnnouncementId = res.body.announcement.id;
});

await runAsyncTest('3.2: Teacher can publish using canonical alias (Computer Science <-> CSE AI)', async () => {
  const res = await apiRequest({
    method: 'POST',
    path: '/api/announcements',
    token: TEACHER_CS_TOKEN,
    body: {
      title: 'Lab 3 Due Date Extension',
      content: 'Lab 3 is extended until Friday.',
      scopeType: 'section',
      department: 'Computer Science', // Canonical map resolves to same as CSE AI
      year: '2nd Year',
      section: 'Section A' // Canonical section alias for Sec A
    }
  });
  assert.strictEqual(res.status, 201);
  assert.strictEqual(res.body.success, true);
});

await runAsyncTest('3.3: Teacher cannot publish institution-wide (403 Forbidden)', async () => {
  const res = await apiRequest({
    method: 'POST',
    path: '/api/announcements',
    token: TEACHER_CS_TOKEN,
    body: {
      title: 'Teacher Global Notice',
      content: 'Attempting to publish to whole institution.',
      scopeType: 'institution'
    }
  });
  assert.strictEqual(res.status, 403);
  assert.strictEqual(res.body.code, 'TEACHER_SCOPE_FORBIDDEN');
});

await runAsyncTest('3.4: Teacher cannot publish department-wide (403 Forbidden)', async () => {
  const res = await apiRequest({
    method: 'POST',
    path: '/api/announcements',
    token: TEACHER_CS_TOKEN,
    body: {
      title: 'Teacher Branch Notice',
      content: 'Attempting to publish to entire branch.',
      scopeType: 'branch',
      department: 'Computer Science'
    }
  });
  assert.strictEqual(res.status, 403);
  assert.strictEqual(res.body.code, 'TEACHER_SCOPE_FORBIDDEN');
});

await runAsyncTest('3.5: Teacher cannot publish to an unallocated section (403 Forbidden)', async () => {
  const res = await apiRequest({
    method: 'POST',
    path: '/api/announcements',
    token: TEACHER_CS_TOKEN,
    body: {
      title: 'Mechanical Notice',
      content: 'Notice for mechanical engineering.',
      scopeType: 'section',
      department: 'Mechanical Engineering',
      year: '3rd Year',
      section: 'Sec B'
    }
  });
  assert.strictEqual(res.status, 403);
  assert.strictEqual(res.body.code, 'UNAUTHORIZED_ALLOCATION');
});

await runAsyncTest('3.6: Teacher cannot publish to a revoked allocation (authorized: false) (403 Forbidden)', async () => {
  const res = await apiRequest({
    method: 'POST',
    path: '/api/announcements',
    token: TEACHER_CS_TOKEN,
    body: {
      title: 'Revoked Section Notice',
      content: 'Notice for 3rd Year Sec B where authorization was revoked.',
      scopeType: 'section',
      department: 'CSE AI',
      year: '3rd Year',
      section: 'Sec B'
    }
  });
  assert.strictEqual(res.status, 403);
  assert.strictEqual(res.body.code, 'UNAUTHORIZED_ALLOCATION');
});

await runAsyncTest('3.7: Teacher reads scoped: receives institution, department, and allocated sections', async () => {
  const res = await apiRequest({
    method: 'GET',
    path: '/api/announcements',
    token: TEACHER_CS_TOKEN
  });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.success, true);
  const titles = res.body.announcements.map((a) => a.title);
  assert.ok(titles.includes('Campus Spring Fest 2026'), 'Should include institution-wide notice');
  assert.ok(titles.includes('CS Research Symposium'), 'Should include CS department notice');
  assert.ok(titles.includes('Midterm Exam Preparation Guide'), 'Should include allocated section notice');
});

// -----------------------------------------------------------------------------
// SECTION 4: Student Permissions & Isolation
// -----------------------------------------------------------------------------
console.log('\n--- SECTION 4: Student Permissions & Isolation ---');

await runAsyncTest('4.1: Student cannot publish official announcements (403 Forbidden)', async () => {
  const res = await apiRequest({
    method: 'POST',
    path: '/api/announcements',
    token: STUDENT_1_TOKEN,
    body: {
      title: 'Student Announcement',
      content: 'Trying to publish official announcement.',
      scopeType: 'section',
      department: 'Computer Science',
      year: '2nd Year',
      section: 'Section A'
    }
  });
  assert.strictEqual(res.status, 403);
  assert.strictEqual(res.body.code, 'STUDENT_CANNOT_PUBLISH');
});

await runAsyncTest('4.2: Student 1 receives applicable institution, department, and section announcements', async () => {
  const res = await apiRequest({
    method: 'GET',
    path: '/api/announcements',
    token: STUDENT_1_TOKEN
  });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.success, true);
  const titles = res.body.announcements.map((a) => a.title);
  assert.ok(titles.includes('Campus Spring Fest 2026'), 'Student receives institution-wide notice');
  assert.ok(titles.includes('CS Research Symposium'), 'Student receives CS department notice');
  assert.ok(titles.includes('Midterm Exam Preparation Guide'), 'Student receives matching section notice');
});

await runAsyncTest('4.3: Student 2 (Mechanical) does NOT receive CS department or CS section announcements', async () => {
  const res = await apiRequest({
    method: 'GET',
    path: '/api/announcements',
    token: STUDENT_2_TOKEN
  });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.success, true);
  const titles = res.body.announcements.map((a) => a.title);
  assert.ok(titles.includes('Campus Spring Fest 2026'), 'Student 2 receives institution notice');
  assert.strictEqual(titles.includes('CS Research Symposium'), false, 'Student 2 must NOT see CS branch notice');
  assert.strictEqual(titles.includes('Midterm Exam Preparation Guide'), false, 'Student 2 must NOT see CS section notice');
});

await runAsyncTest('4.4: Student cannot bypass scope using query parameters', async () => {
  const res = await apiRequest({
    method: 'GET',
    path: '/api/announcements?department=Computer%20Science&section=Section%20A',
    token: STUDENT_2_TOKEN // Student 2 is Mechanical Engineering
  });
  assert.strictEqual(res.status, 200);
  const titles = res.body.announcements.map((a) => a.title);
  assert.strictEqual(titles.includes('CS Research Symposium'), false, 'Query param spoofing must fail');
  assert.strictEqual(titles.includes('Midterm Exam Preparation Guide'), false, 'Query param spoofing must fail');
});

// -----------------------------------------------------------------------------
// SECTION 5: Scoped GET-by-ID
// -----------------------------------------------------------------------------
console.log('\n--- SECTION 5: Scoped GET-by-ID ---');

await runAsyncTest('5.1: In-scope student can retrieve announcement by ID (200 OK)', async () => {
  const res = await apiRequest({
    method: 'GET',
    path: `/api/announcements/${teacherSecAnnouncementId}`,
    token: STUDENT_1_TOKEN
  });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.success, true);
  assert.strictEqual(res.body.announcement.id, teacherSecAnnouncementId);
});

await runAsyncTest('5.2: Out-of-scope student is forbidden from retrieving announcement by ID (403 Forbidden)', async () => {
  const res = await apiRequest({
    method: 'GET',
    path: `/api/announcements/${teacherSecAnnouncementId}`,
    token: STUDENT_2_TOKEN // Mechanical student attempting to view CS Section A notice
  });
  assert.strictEqual(res.status, 403);
  assert.strictEqual(res.body.code, 'FORBIDDEN_SCOPE');
});

await runAsyncTest('5.3: Non-existent announcement ID returns 404 Not Found', async () => {
  const res = await apiRequest({
    method: 'GET',
    path: '/api/announcements/ann_non_existent_12345',
    token: DIR_TOKEN
  });
  assert.strictEqual(res.status, 404);
  assert.strictEqual(res.body.code, 'ANNOUNCEMENT_NOT_FOUND');
});

// -----------------------------------------------------------------------------
// SECTION 6: Pagination & Limits
// -----------------------------------------------------------------------------
console.log('\n--- SECTION 6: Pagination & Limits ---');

await runAsyncTest('6.1: GET /api/announcements returns pagination metadata', async () => {
  const res = await apiRequest({
    method: 'GET',
    path: '/api/announcements?page=1&limit=2',
    token: DIR_TOKEN
  });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.announcements.length, 2);
  assert.strictEqual(res.body.pagination.page, 1);
  assert.strictEqual(res.body.pagination.limit, 2);
  assert.ok(res.body.pagination.total >= 4);
  assert.strictEqual(res.body.pagination.hasMore, true);
});

await runAsyncTest('6.2: Page 2 retrieves the next slice correctly', async () => {
  const res1 = await apiRequest({
    method: 'GET',
    path: '/api/announcements?page=1&limit=2',
    token: DIR_TOKEN
  });
  const res2 = await apiRequest({
    method: 'GET',
    path: '/api/announcements?page=2&limit=2',
    token: DIR_TOKEN
  });
  assert.strictEqual(res2.status, 200);
  assert.strictEqual(res2.body.pagination.page, 2);
  // Ensure disjoint sets
  const ids1 = res1.body.announcements.map((a) => a.id);
  const ids2 = res2.body.announcements.map((a) => a.id);
  for (const id of ids2) {
    assert.strictEqual(ids1.includes(id), false, 'Page 2 should not overlap with Page 1');
  }
});

await runAsyncTest('6.3: Limit is capped at 100', async () => {
  const res = await apiRequest({
    method: 'GET',
    path: '/api/announcements?limit=500',
    token: DIR_TOKEN
  });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.pagination.limit, 100);
});

// -----------------------------------------------------------------------------
// SECTION 7: Input Validation
// -----------------------------------------------------------------------------
console.log('\n--- SECTION 7: Input Validation ---');

await runAsyncTest('7.1: Missing title returns 400 Bad Request', async () => {
  const res = await apiRequest({
    method: 'POST',
    path: '/api/announcements',
    token: DIR_TOKEN,
    body: {
      content: 'No title provided',
      scopeType: 'institution'
    }
  });
  assert.strictEqual(res.status, 400);
  assert.strictEqual(res.body.code, 'INVALID_TITLE');
});

await runAsyncTest('7.2: Missing content returns 400 Bad Request', async () => {
  const res = await apiRequest({
    method: 'POST',
    path: '/api/announcements',
    token: DIR_TOKEN,
    body: {
      title: 'Valid Title',
      scopeType: 'institution'
    }
  });
  assert.strictEqual(res.status, 400);
  assert.strictEqual(res.body.code, 'INVALID_CONTENT');
});

await runAsyncTest('7.3: Invalid scopeType returns 400 Bad Request', async () => {
  const res = await apiRequest({
    method: 'POST',
    path: '/api/announcements',
    token: DIR_TOKEN,
    body: {
      title: 'Valid Title',
      content: 'Valid content',
      scopeType: 'global_universe'
    }
  });
  assert.strictEqual(res.status, 400);
  assert.strictEqual(res.body.code, 'INVALID_SCOPE_TYPE');
  assert.strictEqual(
    res.body.error,
    "Invalid scopeType 'global_universe'. Must be 'institution', 'branch', 'year', or 'section'."
  );
});

await runAsyncTest('7.4: Title exceeding 200 characters returns 400 Bad Request', async () => {
  const res = await apiRequest({
    method: 'POST',
    path: '/api/announcements',
    token: DIR_TOKEN,
    body: {
      title: 'A'.repeat(201),
      content: 'Valid content',
      scopeType: 'institution'
    }
  });
  assert.strictEqual(res.status, 400);
  assert.strictEqual(res.body.code, 'TITLE_TOO_LONG');
});

// -----------------------------------------------------------------------------
// SECTION 8: Four-Scope Targeting & Isolation Suite
// -----------------------------------------------------------------------------
console.log('\n--- SECTION 8: Four-Scope Targeting & Isolation Suite ---');

await runAsyncTest('8.1: Student 1 (CS • 2nd Year • Sec A) receives all 4 matching scopes', async () => {
  const res = await apiRequest({
    method: 'GET',
    path: '/api/announcements',
    token: STUDENT_1_TOKEN
  });
  assert.strictEqual(res.status, 200);
  const ids = res.body.announcements.map((a) => a.id);
  assert.strictEqual(ids.includes(instAnnouncementId), true, 'Should receive institution-wide');
  assert.strictEqual(ids.includes(csBranchAnnouncementId), true, 'Should receive CS branch-wide');
  assert.strictEqual(ids.includes(csYearAnnouncementId), true, 'Should receive CS 2nd Year');
  assert.strictEqual(ids.includes(csSectionAnnouncementId), true, 'Should receive CS 2nd Year Sec A');
});

await runAsyncTest('8.2: Student 3 (CS • 2nd Year • Sec B) receives institution, branch, and year, but NOT Sec A', async () => {
  const res = await apiRequest({
    method: 'GET',
    path: '/api/announcements',
    token: STUDENT_3_TOKEN
  });
  assert.strictEqual(res.status, 200);
  const ids = res.body.announcements.map((a) => a.id);
  assert.strictEqual(ids.includes(instAnnouncementId), true, 'Should receive institution-wide');
  assert.strictEqual(ids.includes(csBranchAnnouncementId), true, 'Should receive CS branch-wide');
  assert.strictEqual(ids.includes(csYearAnnouncementId), true, 'Should receive CS 2nd Year');
  assert.strictEqual(ids.includes(csSectionAnnouncementId), false, 'Should NOT receive Sec A notice');
});

await runAsyncTest('8.3: Student 4 (CS • 3rd Year • Sec A) receives institution and branch, but NOT 2nd Year notices', async () => {
  const res = await apiRequest({
    method: 'GET',
    path: '/api/announcements',
    token: STUDENT_4_TOKEN
  });
  assert.strictEqual(res.status, 200);
  const ids = res.body.announcements.map((a) => a.id);
  assert.strictEqual(ids.includes(instAnnouncementId), true, 'Should receive institution-wide');
  assert.strictEqual(ids.includes(csBranchAnnouncementId), true, 'Should receive CS branch-wide');
  assert.strictEqual(ids.includes(csYearAnnouncementId), false, 'Should NOT receive 2nd Year notice');
  assert.strictEqual(ids.includes(csSectionAnnouncementId), false, 'Should NOT receive 2nd Year Sec A notice');
});

await runAsyncTest('8.4: Student 2 (Mech • 3rd Year • Sec B) receives institution notice, but NO CS notices', async () => {
  const res = await apiRequest({
    method: 'GET',
    path: '/api/announcements',
    token: STUDENT_2_TOKEN
  });
  assert.strictEqual(res.status, 200);
  const ids = res.body.announcements.map((a) => a.id);
  assert.strictEqual(ids.includes(instAnnouncementId), true, 'Should receive institution-wide');
  assert.strictEqual(ids.includes(csBranchAnnouncementId), false, 'Should NOT receive CS branch');
  assert.strictEqual(ids.includes(csYearAnnouncementId), false, 'Should NOT receive CS year');
  assert.strictEqual(ids.includes(csSectionAnnouncementId), false, 'Should NOT receive CS section');
});

await runAsyncTest('8.5: Student in INST_B receives NO announcements from INST_A', async () => {
  const res = await apiRequest({
    method: 'GET',
    path: '/api/announcements',
    token: STUDENT_INST_B_TOKEN
  });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.announcements.length, 0);
});

await runAsyncTest('8.6: Teacher CS receives institution, CS branch, CS 2nd Year, and allocated Sec A notice', async () => {
  const res = await apiRequest({
    method: 'GET',
    path: '/api/announcements',
    token: TEACHER_CS_TOKEN
  });
  assert.strictEqual(res.status, 200);
  const ids = res.body.announcements.map((a) => a.id);
  assert.strictEqual(ids.includes(instAnnouncementId), true, 'Teacher receives institution');
  assert.strictEqual(ids.includes(csBranchAnnouncementId), true, 'Teacher receives CS branch');
  assert.strictEqual(ids.includes(csYearAnnouncementId), true, 'Teacher receives CS 2nd Year');
  assert.strictEqual(ids.includes(csSectionAnnouncementId), true, 'Teacher receives CS 2nd Year Sec A');
});

await runAsyncTest('8.7: Teacher ME (Mech 3rd Year Sec B) does NOT receive CS Sec A notice', async () => {
  const res = await apiRequest({
    method: 'GET',
    path: '/api/announcements',
    token: TEACHER_ME_TOKEN
  });
  assert.strictEqual(res.status, 200);
  const ids = res.body.announcements.map((a) => a.id);
  assert.strictEqual(ids.includes(instAnnouncementId), true, 'ME teacher receives institution');
  assert.strictEqual(ids.includes(csSectionAnnouncementId), false, 'ME teacher should NOT receive CS Sec A');
});

await runAsyncTest('8.8: Teacher cannot publish with scopeType "year" (403 Forbidden)', async () => {
  const res = await apiRequest({
    method: 'POST',
    path: '/api/announcements',
    token: TEACHER_CS_TOKEN,
    body: {
      title: 'Teacher year attempt',
      content: 'This should fail',
      scopeType: 'year',
      department: 'Computer Science',
      year: '2nd Year'
    }
  });
  assert.strictEqual(res.status, 403);
  assert.strictEqual(res.body.code, 'TEACHER_SCOPE_FORBIDDEN');
});

await runAsyncTest('8.9: Student cannot publish under any scope (institution, branch, year, section)', async () => {
  for (const s of ['institution', 'branch', 'year', 'section']) {
    const res = await apiRequest({
      method: 'POST',
      path: '/api/announcements',
      token: STUDENT_1_TOKEN,
      body: {
        title: 'Student notice attempt',
        content: 'Should always fail',
        scopeType: s,
        department: 'Computer Science',
        year: '2nd Year',
        section: 'Section A'
      }
    });
    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.body.code, 'STUDENT_CANNOT_PUBLISH');
  }
});

await runAsyncTest('8.10: Scoped GET-by-ID strictly enforces scope isolation for all 4 scopes', async () => {
  // Student 3 (Sec B) cannot get Sec A announcement by ID
  const res1 = await apiRequest({
    method: 'GET',
    path: `/api/announcements/${csSectionAnnouncementId}`,
    token: STUDENT_3_TOKEN
  });
  assert.strictEqual(res1.status, 403);
  assert.strictEqual(res1.body.code, 'FORBIDDEN_SCOPE');

  // Student 4 (3rd Year) cannot get 2nd Year announcement by ID
  const res2 = await apiRequest({
    method: 'GET',
    path: `/api/announcements/${csYearAnnouncementId}`,
    token: STUDENT_4_TOKEN
  });
  assert.strictEqual(res2.status, 403);
  assert.strictEqual(res2.body.code, 'FORBIDDEN_SCOPE');

  // Student 2 (Mech) cannot get CS branch announcement by ID
  const res3 = await apiRequest({
    method: 'GET',
    path: `/api/announcements/${csBranchAnnouncementId}`,
    token: STUDENT_2_TOKEN
  });
  assert.strictEqual(res3.status, 403);
  assert.strictEqual(res3.body.code, 'FORBIDDEN_SCOPE');
});

// Clean up server
if (testServer) {
  testServer.close();
}

console.log('\n======================================================');
console.log(` RESULTS: ${passed} passed, ${failed} failed`);
console.log('======================================================\n');

if (failed > 0) {
  process.exit(1);
}
