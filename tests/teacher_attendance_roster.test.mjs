import assert from 'node:assert/strict';
import { deduplicateStudentRoster } from '../src/services/attendanceService.js';

console.log('Running Teacher Attendance Roster Unit & Deduplication Tests...\n');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`[PASS] ${name}`);
  } catch (err) {
    failed++;
    console.error(`[FAIL] ${name} -> ${err.message}`);
  }
}

// ---------------------------------------------------------------------
// Test 1: Empty or invalid input handling
// ---------------------------------------------------------------------
test('deduplicateStudentRoster returns empty array on null, undefined, or empty inputs', () => {
  assert.deepEqual(deduplicateStudentRoster(null), []);
  assert.deepEqual(deduplicateStudentRoster(undefined), []);
  assert.deepEqual(deduplicateStudentRoster([]), []);
  assert.deepEqual(deduplicateStudentRoster('not-an-array'), []);
});

// ---------------------------------------------------------------------
// Test 2: Single student passes through intact
// ---------------------------------------------------------------------
test('Single active student is returned intact with all profile metadata preserved', () => {
  const students = [
    {
      id: 'qfQnwVbU6ZWbXyc0LxasTeBNRq13',
      uid: 'qfQnwVbU6ZWbXyc0LxasTeBNRq13',
      name: 'Test Student',
      roll: 'qfQnwVbU',
      email: 'test_student_1791818183865@test.com',
      department: 'Computer Science',
      year: '2nd Year',
      section: 'Sec A',
      institution: 'UEMK'
    }
  ];

  const result = deduplicateStudentRoster(students);
  assert.equal(result.length, 1);
  assert.equal(result[0].uid, 'qfQnwVbU6ZWbXyc0LxasTeBNRq13');
  assert.equal(result[0].name, 'Test Student');
  assert.equal(result[0].email, 'test_student_1791818183865@test.com');
  assert.equal(result[0].department, 'Computer Science');
  assert.equal(result[0].year, '2nd Year');
  assert.equal(result[0].section, 'Sec A');
});

// ---------------------------------------------------------------------
// Test 3: Deduplication of Test Student when both active and obsolete profiles are present
// ---------------------------------------------------------------------
test('Deduplication keeps active student qfQnw... and excludes duplicate by email', () => {
  const students = [
    {
      id: 'qfQnwVbU6ZWbXyc0LxasTeBNRq13',
      uid: 'qfQnwVbU6ZWbXyc0LxasTeBNRq13',
      name: 'Test Student',
      roll: 'qfQnwVbU',
      email: 'test_student_1791818183865@test.com',
      department: 'Computer Science',
      year: '2nd Year',
      section: 'Sec A',
      institution: 'UEMK'
    },
    {
      id: 'MXE8Ip0nD4YnLPGIfyjALctKR7n2',
      uid: 'MXE8Ip0nD4YnLPGIfyjALctKR7n2',
      name: 'Test Student',
      roll: 'MXE8Ip0n',
      email: 'test_student_1791818183865@test.com',
      department: 'Computer Science',
      year: '2nd Year',
      section: 'Sec A',
      institution: 'UEMK'
    }
  ];

  const result = deduplicateStudentRoster(students);
  assert.equal(result.length, 1, 'Roster must contain exactly 1 student');
  assert.equal(result[0].uid, 'qfQnwVbU6ZWbXyc0LxasTeBNRq13');
  assert.equal(result[0].name, 'Test Student');
  assert.equal(result.some(s => s.uid === 'MXE8Ip0nD4YnLPGIfyjALctKR7n2'), false, 'Obsolete UID MXE8I... must not appear');
});

// ---------------------------------------------------------------------
// Test 4: Deduplication with mixed email casing and whitespace
// ---------------------------------------------------------------------
test('Deduplication normalizes email casing and trims whitespace', () => {
  const students = [
    {
      id: 'qfQnwVbU6ZWbXyc0LxasTeBNRq13',
      uid: 'qfQnwVbU6ZWbXyc0LxasTeBNRq13',
      name: 'Test Student',
      email: '  TEST_student_1791818183865@test.com  ',
      department: 'Computer Science'
    },
    {
      id: 'MXE8Ip0nD4YnLPGIfyjALctKR7n2',
      uid: 'MXE8Ip0nD4YnLPGIfyjALctKR7n2',
      name: 'Test Student',
      email: 'test_student_1791818183865@test.COM',
      department: 'Computer Science'
    }
  ];

  const result = deduplicateStudentRoster(students);
  assert.equal(result.length, 1);
  assert.equal(result[0].uid, 'qfQnwVbU6ZWbXyc0LxasTeBNRq13');
});

// ---------------------------------------------------------------------
// Test 5: Multi-student roster preserves all distinct students sorted alphabetically
// ---------------------------------------------------------------------
test('Multi-student roster preserves distinct students and sorts them by name', () => {
  const students = [
    {
      id: 'qfQnwVbU6ZWbXyc0LxasTeBNRq13',
      uid: 'qfQnwVbU6ZWbXyc0LxasTeBNRq13',
      name: 'Test Student',
      email: 'test_student_1791818183865@test.com'
    },
    {
      id: 'student_alice',
      uid: 'student_alice_uid',
      name: 'Alice Johnson',
      email: 'alice.johnson@uemk.edu'
    },
    {
      id: 'student_bob',
      uid: 'student_bob_uid',
      name: 'Bob Smith',
      email: 'bob.smith@uemk.edu'
    },
    // Duplicate of Alice
    {
      id: 'student_alice_dup',
      uid: 'student_alice_dup_uid',
      name: 'Alice Johnson Duplicate',
      email: 'alice.johnson@uemk.edu'
    }
  ];

  const result = deduplicateStudentRoster(students);
  assert.equal(result.length, 3, 'Must contain exactly 3 distinct students');
  assert.equal(result[0].name, 'Alice Johnson');
  assert.equal(result[1].name, 'Bob Smith');
  assert.equal(result[2].name, 'Test Student');
});

// ---------------------------------------------------------------------
// Test 6: Duplicate UID check (same UID with empty email or alternative email)
// ---------------------------------------------------------------------
test('Deduplication prevents duplicate entries sharing the same UID', () => {
  const students = [
    {
      id: 'qfQnwVbU6ZWbXyc0LxasTeBNRq13',
      uid: 'qfQnwVbU6ZWbXyc0LxasTeBNRq13',
      name: 'Test Student',
      email: 'primary@test.com'
    },
    {
      id: 'qfQnwVbU6ZWbXyc0LxasTeBNRq13',
      uid: 'qfQnwVbU6ZWbXyc0LxasTeBNRq13',
      name: 'Test Student (Secondary)',
      email: 'secondary@test.com'
    }
  ];

  const result = deduplicateStudentRoster(students);
  assert.equal(result.length, 1);
  assert.equal(result[0].uid, 'qfQnwVbU6ZWbXyc0LxasTeBNRq13');
  assert.equal(result[0].email, 'primary@test.com');
});

console.log(`\n========================================`);
console.log(`TEACHER ROSTER TESTS: ${passed} PASSED, ${failed} FAILED`);
console.log(`========================================\n`);

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
