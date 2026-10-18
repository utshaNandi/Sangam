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
import { setCustomAuthService } from '../server/middleware/authMiddleware.js';
import { getCanonicalDepartmentFromPath } from '../src/services/academicHierarchyUtils.js';

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
console.log(' SANGAM PHASE 2 VERIFICATION TEST SUITE');
console.log(' Curriculum Subject Navigation & Subject Editing');
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
          docs: matching,
          size: matching.length,
          forEach: (cb) => matching.forEach(cb)
        };
      }
    });

    return createQueryObj();
  }
}

// -----------------------------------------------------------------------------
// Test Users & Fixtures
// -----------------------------------------------------------------------------
const mockDb = new MockFirestore();
subjectService.setTestDb(mockDb);
studyMaterialService.setTestDb(mockDb);

const directorUser = {
  uid: 'director_uemk_01',
  role: 'director',
  institution: 'UEMK',
  department: 'Computer Science',
  status: 'active',
  email: 'director@uemk.edu.in'
};

const otherInstitutionDirector = {
  uid: 'director_other_01',
  role: 'director',
  institution: 'OTHER_INST',
  department: 'Computer Science',
  status: 'active',
  email: 'director@other.edu.in'
};

const teacherUser = {
  uid: 'teacher_cs_01',
  role: 'faculty',
  institution: 'UEMK',
  department: 'Computer Science',
  status: 'active',
  email: 'teacher@uemk.edu.in'
};

const studentUser = {
  uid: 'student_cs_01',
  role: 'student',
  institution: 'UEMK',
  department: 'Computer Science',
  year: '2nd Year',
  section: 'Section A',
  status: 'active',
  email: 'student@uemk.edu.in'
};

// Seed users
mockDb.store.users[directorUser.uid] = directorUser;
mockDb.store.users[otherInstitutionDirector.uid] = otherInstitutionDirector;
mockDb.store.users[teacherUser.uid] = teacherUser;
mockDb.store.users[studentUser.uid] = studentUser;

// Configure Auth Middleware Double
setCustomAuthService({
  verifyIdToken: async (token) => {
    if (token === 'TOKEN_DIRECTOR') return { uid: directorUser.uid, role: 'director' };
    if (token === 'TOKEN_OTHER_DIRECTOR') return { uid: otherInstitutionDirector.uid, role: 'director' };
    if (token === 'TOKEN_TEACHER') return { uid: teacherUser.uid, role: 'faculty' };
    if (token === 'TOKEN_STUDENT') return { uid: studentUser.uid, role: 'student' };
    throw new Error('Invalid token');
  }
});

// Helper for HTTP requests against Express app
function makeRequest(server, options, body = null) {
  return new Promise((resolve, reject) => {
    const port = server.address().port;
    const reqOptions = {
      hostname: '127.0.0.1',
      port,
      path: options.path,
      method: options.method,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    };

    const req = http.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch { /* ignore */ }
        resolve({ status: res.statusCode, data: json, raw: data });
      });
    });

    req.on('error', reject);
    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

// -----------------------------------------------------------------------------
// Test Runner
// -----------------------------------------------------------------------------
async function runAllTests() {
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));

  try {
    console.log('--- TEST 1: Authorized Director Successfully Edits a Subject ---');
    // Seed Subject
    const initialSubject = await subjectService.createSubject({
      callerUid: directorUser.uid,
      name: 'Data Structures',
      code: 'CS201',
      department: 'Computer Science',
      year: '2nd Year',
      description: 'Original description',
      institution: 'UEMK'
    });

    await runAsyncTest('1.1: PATCH /api/subjects/:subjectId updates name, code, description', async () => {
      const res = await makeRequest(server, {
        method: 'PATCH',
        path: `/api/subjects/${initialSubject.id}`,
        headers: { 'Authorization': 'Bearer TOKEN_DIRECTOR' }
      }, {
        name: 'Data Structures and Algorithms',
        code: 'CS201-ADV',
        description: 'Updated comprehensive syllabus description.'
      });

      assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}: ${res.raw}`);
      assert.strictEqual(res.data.success, true);
      assert.strictEqual(res.data.subject.name, 'Data Structures and Algorithms');
      assert.strictEqual(res.data.subject.code, 'CS201-ADV');
      assert.strictEqual(res.data.subject.description, 'Updated comprehensive syllabus description.');

      // Check DB
      const inDb = mockDb.store.subjects[initialSubject.id];
      assert.strictEqual(inDb.name, 'Data Structures and Algorithms');
      assert.strictEqual(inDb.code, 'CS201-ADV');
      assert.strictEqual(inDb.id, initialSubject.id, 'Subject ID must remain immutable');
      assert.strictEqual(inDb.department, 'Computer Science', 'Department must remain immutable');
      assert.strictEqual(inDb.year, '2nd Year', 'Year must remain immutable');
      assert.strictEqual(inDb.institution, 'UEMK', 'Institution must remain immutable');
      assert.ok(inDb.updatedAt, 'updatedAt timestamp must be set');
      assert.strictEqual(inDb.updatedBy, directorUser.uid);
    });

    console.log('\n--- TEST 2: Duplicate Name is Rejected ---');
    // Seed a second subject in same department & year
    const secondSubject = await subjectService.createSubject({
      callerUid: directorUser.uid,
      name: 'Database Management Systems',
      code: 'CS202',
      department: 'Computer Science',
      year: '2nd Year',
      description: 'DBMS fundamentals',
      institution: 'UEMK'
    });

    await runAsyncTest('2.1: Rejects updating Subject B to the same name as Subject A (409 Conflict)', async () => {
      const res = await makeRequest(server, {
        method: 'PATCH',
        path: `/api/subjects/${secondSubject.id}`,
        headers: { 'Authorization': 'Bearer TOKEN_DIRECTOR' }
      }, {
        name: 'Data Structures and Algorithms', // Same as Subject A
        code: 'CS202'
      });

      assert.strictEqual(res.status, 409, `Expected 409 Conflict, got ${res.status}`);
      assert.strictEqual(res.data.code, 'SUBJECT_ALREADY_EXISTS');
    });

    await runAsyncTest('2.2: Allows updating a subject without changing its own name (no self-conflict)', async () => {
      const res = await makeRequest(server, {
        method: 'PATCH',
        path: `/api/subjects/${secondSubject.id}`,
        headers: { 'Authorization': 'Bearer TOKEN_DIRECTOR' }
      }, {
        name: 'Database Management Systems', // Keep same name
        code: 'CS202-V2',
        description: 'New DBMS description'
      });

      assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
      assert.strictEqual(res.data.subject.code, 'CS202-V2');
    });

    console.log('\n--- TEST 3: Duplicate Code is Rejected ---');
    await runAsyncTest('3.1: Rejects updating Subject B to the same code as Subject A (409 Conflict)', async () => {
      const res = await makeRequest(server, {
        method: 'PATCH',
        path: `/api/subjects/${secondSubject.id}`,
        headers: { 'Authorization': 'Bearer TOKEN_DIRECTOR' }
      }, {
        name: 'Advanced Database Management',
        code: 'CS201-ADV' // Same as Subject A
      });

      assert.strictEqual(res.status, 409, `Expected 409 Conflict, got ${res.status}`);
      assert.strictEqual(res.data.code, 'SUBJECT_ALREADY_EXISTS');
    });

    console.log('\n--- TEST 4: Unauthorized Users Cannot Edit Subjects ---');
    await runAsyncTest('4.1: Teacher cannot edit subjects (403 Forbidden)', async () => {
      const res = await makeRequest(server, {
        method: 'PATCH',
        path: `/api/subjects/${initialSubject.id}`,
        headers: { 'Authorization': 'Bearer TOKEN_TEACHER' }
      }, {
        name: 'Hacked Subject Name'
      });

      assert.strictEqual(res.status, 403);
      assert.strictEqual(res.data.code, 'FORBIDDEN_ROLE');
    });

    await runAsyncTest('4.2: Student cannot edit subjects (403 Forbidden)', async () => {
      const res = await makeRequest(server, {
        method: 'PATCH',
        path: `/api/subjects/${initialSubject.id}`,
        headers: { 'Authorization': 'Bearer TOKEN_STUDENT' }
      }, {
        name: 'Hacked By Student'
      });

      assert.strictEqual(res.status, 403);
      assert.strictEqual(res.data.code, 'FORBIDDEN_ROLE');
    });

    await runAsyncTest('4.3: Unauthenticated request is rejected (401 Unauthorized)', async () => {
      const res = await makeRequest(server, {
        method: 'PATCH',
        path: `/api/subjects/${initialSubject.id}`
      }, {
        name: 'Unauthenticated Edit'
      });

      assert.strictEqual(res.status, 401);
    });

    await runAsyncTest('4.4: Director from another institution cannot edit subject (403 Forbidden)', async () => {
      const res = await makeRequest(server, {
        method: 'PATCH',
        path: `/api/subjects/${initialSubject.id}`,
        headers: { 'Authorization': 'Bearer TOKEN_OTHER_DIRECTOR' }
      }, {
        name: 'Cross Institution Edit'
      });

      assert.strictEqual(res.status, 403);
      assert.strictEqual(res.data.code, 'FORBIDDEN_INSTITUTION');
    });

    console.log('\n--- TEST 5: Invalid Subject IDs and Invalid Fields are Handled Safely ---');
    await runAsyncTest('5.1: Non-existent subjectId returns 404', async () => {
      const res = await makeRequest(server, {
        method: 'PATCH',
        path: '/api/subjects/non_existent_subject_id_99999',
        headers: { 'Authorization': 'Bearer TOKEN_DIRECTOR' }
      }, {
        name: 'Some Name',
        code: 'CS999'
      });

      assert.strictEqual(res.status, 404);
      assert.strictEqual(res.data.code, 'SUBJECT_NOT_FOUND');
    });

    await runAsyncTest('5.2: Empty subject name returns 400', async () => {
      const res = await makeRequest(server, {
        method: 'PATCH',
        path: `/api/subjects/${initialSubject.id}`,
        headers: { 'Authorization': 'Bearer TOKEN_DIRECTOR' }
      }, {
        name: '   ',
        code: 'CS201'
      });

      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.data.code, 'INVALID_SUBJECT_NAME');
    });

    await runAsyncTest('5.3: Subject name shorter than 2 characters returns 400', async () => {
      const res = await makeRequest(server, {
        method: 'PATCH',
        path: `/api/subjects/${initialSubject.id}`,
        headers: { 'Authorization': 'Bearer TOKEN_DIRECTOR' }
      }, {
        name: 'X'
      });

      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.data.code, 'INVALID_SUBJECT_NAME');
    });

    console.log('\n--- TEST 6: Editing Preserves Teacher Assignments and Study Materials ---');
    // Setup an allocation and assignment for initialSubject
    const allocId = 'alloc_001';
    mockDb.store.teacher_allocations[allocId] = {
      teacherUid: teacherUser.uid,
      department: 'Computer Science',
      year: '2nd Year',
      section: 'Section A',
      institution: 'UEMK',
      authorized: true
    };

    const assignmentResult = await subjectService.assignTeacherToSubject({
      callerUid: directorUser.uid,
      subjectId: initialSubject.id,
      teacherUid: teacherUser.uid,
      section: 'Section A'
    });
    const assignment = assignmentResult.assignment;

    // Seed study material associated with initialSubject
    const materialId = 'mat_001';
    mockDb.store.study_materials[materialId] = {
      id: materialId,
      title: 'Trees & Graphs Lecture Notes',
      subjectId: initialSubject.id,
      subjectName: initialSubject.name,
      department: 'Computer Science',
      year: '2nd Year',
      scope: 'section',
      section: 'Section A',
      googleDriveFileId: 'drive_file_123',
      fileUrl: 'https://drive.google.com/open?id=drive_file_123',
      category: 'Lecture Notes',
      uploadedBy: teacherUser.uid,
      institution: 'UEMK',
      isPublished: true
    };

    await runAsyncTest('6.1: Editing subject updates cached metadata in assignments and leaves assignment/material intact', async () => {
      // Edit subject name and code
      const updatedSubject = await subjectService.updateSubject({
        callerUid: directorUser.uid,
        subjectId: initialSubject.id,
        name: 'Data Structures and Algorithms Masterclass',
        code: 'CS201-MC'
      });

      // Assignment must still exist
      const assignInDb = mockDb.store.teacher_subject_assignments[assignment.id];
      assert.ok(assignInDb, 'Teacher assignment must be preserved');
      assert.strictEqual(assignInDb.teacherUid, teacherUser.uid);
      assert.strictEqual(assignInDb.section, 'Section A');
      assert.strictEqual(assignInDb.subjectName, 'Data Structures and Algorithms Masterclass', 'Cached subjectName in assignment must sync');
      assert.strictEqual(assignInDb.subjectCode, 'CS201-MC', 'Cached subjectCode in assignment must sync');

      // Study material must remain completely intact
      const materialInDb = mockDb.store.study_materials[materialId];
      assert.ok(materialInDb, 'Study material must be preserved');
      assert.strictEqual(materialInDb.subjectId, initialSubject.id);
      assert.strictEqual(materialInDb.googleDriveFileId, 'drive_file_123');
      assert.strictEqual(materialInDb.fileUrl, 'https://drive.google.com/open?id=drive_file_123');
      assert.strictEqual(materialInDb.isPublished, true);
      assert.strictEqual(materialInDb.uploadedBy, teacherUser.uid);
    });

    console.log('\n--- TEST 7: Scoped Navigation Shows the Correct Branch/Year Subjects ---');
    runTest('7.1: getCanonicalDepartmentFromPath correctly maps academic spaces paths', () => {
      assert.strictEqual(getCanonicalDepartmentFromPath(['UEMK', 'B.Tech', 'CSE', 'AI', '2nd Year']), 'CSE AI');
      assert.strictEqual(getCanonicalDepartmentFromPath(['UEMK', 'B.Tech', 'CSE', 'Core', '2nd Year']), 'Computer Science');
      assert.strictEqual(getCanonicalDepartmentFromPath(['UEMK', 'B.Tech', 'ME', 'Core', '3rd Year']), 'Mechanical Engineering');
      assert.strictEqual(getCanonicalDepartmentFromPath(['UEMK', 'B.Tech', 'CE', 'Core', '1st Year']), 'Civil Engineering');
      assert.strictEqual(getCanonicalDepartmentFromPath(['UEMK', 'B.Tech', 'BT', 'Core', '4th Year']), 'Biotechnology');
      assert.strictEqual(getCanonicalDepartmentFromPath(['UEMK', 'B.Tech', 'ECE', 'Core', '2nd Year']), 'Electronics & Communication');
      assert.strictEqual(getCanonicalDepartmentFromPath(['UEMK', 'B.Tech', 'ESE', 'Core', '2nd Year']), 'Electronics & Communication');
      assert.strictEqual(getCanonicalDepartmentFromPath(['UEMK', 'BBA', 'Core', '1st Year']), 'Management');
      assert.strictEqual(getCanonicalDepartmentFromPath(['UEMK', 'BCA', 'Core', '1st Year']), 'Computer Science');
    });

    await runAsyncTest('7.2: fetchSubjects/getSubjects filters accurately by department and academic year', async () => {
      // Create subjects in distinct scopes
      await subjectService.createSubject({
        callerUid: directorUser.uid,
        name: 'Thermodynamics',
        code: 'ME301',
        department: 'Mechanical Engineering',
        year: '3rd Year',
        institution: 'UEMK'
      });

      await subjectService.createSubject({
        callerUid: directorUser.uid,
        name: 'Fluid Mechanics',
        code: 'ME201',
        department: 'Mechanical Engineering',
        year: '2nd Year',
        institution: 'UEMK'
      });

      // Query for ME 3rd Year only
      const me3rdYear = await subjectService.getSubjects({
        callerUid: directorUser.uid,
        department: 'Mechanical Engineering',
        year: '3rd Year'
      });

      assert.strictEqual(me3rdYear.length, 1);
      assert.strictEqual(me3rdYear[0].code, 'ME301');

      // Query for ME 2nd Year only
      const me2ndYear = await subjectService.getSubjects({
        callerUid: directorUser.uid,
        department: 'Mechanical Engineering',
        year: '2nd Year'
      });

      assert.strictEqual(me2ndYear.length, 1);
      assert.strictEqual(me2ndYear[0].code, 'ME201');
    });

    console.log('\n--- TEST 8: Subject Creation From Scoped Mode Uses Selected Scope ---');
    await runAsyncTest('8.1: Subject created with scoped department and year is bound strictly to that scope', async () => {
      const scopedPath = ['UEMK', 'B.Tech', 'CSE', 'AI', '2nd Year'];
      const targetDept = getCanonicalDepartmentFromPath(scopedPath); // 'CSE AI'
      const targetYear = scopedPath.find(p => p.includes('Year')); // '2nd Year'

      const created = await subjectService.createSubject({
        callerUid: directorUser.uid,
        name: 'Artificial Intelligence & Neural Networks',
        code: 'CSAI201',
        department: targetDept,
        year: targetYear,
        description: 'Deep Learning & Neural Networks',
        institution: 'UEMK'
      });

      assert.strictEqual(created.department, 'CSE AI');
      assert.strictEqual(created.year, '2nd Year');

      // Scoped query for CSE AI 2nd Year finds it
      const scopedList = await subjectService.getSubjects({
        callerUid: directorUser.uid,
        department: 'CSE AI',
        year: '2nd Year'
      });

      const found = scopedList.find(s => s.code === 'CSAI201');
      assert.ok(found, 'Created subject must be in the scoped query');
      assert.strictEqual(found.name, 'Artificial Intelligence & Neural Networks');
    });

    console.log('\n======================================================');
    console.log(` SUMMARY: ${passed} passed, ${failed} failed`);
    console.log('======================================================\n');

  } finally {
    server.close();
  }

  if (failed > 0) {
    process.exit(1);
  }
}

runAllTests().catch(err => {
  console.error('Test runner unhandled rejection:', err);
  process.exit(1);
});
