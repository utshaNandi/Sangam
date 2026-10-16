import assert from 'node:assert/strict';
import { partitionStudentRecords, deduplicateFacultyRecords } from '../src/pages/Director/studentPartition.js';

console.log('Running Director People Section filtering tests...\n');

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
// Test 1: Active student (avia18169@gmail.com) is in activeList and excluded from pendingList
// ---------------------------------------------------------------------
test('Active student (avia18169@gmail.com) is included in activeList and excluded from pendingList', () => {
  const records = [
    {
      id: 'kFenxbrGFjeYmLPPk9RACHeSzfF3',
      uid: 'kFenxbrGFjeYmLPPk9RACHeSzfF3',
      name: 'Avia Student',
      email: 'avia18169@gmail.com',
      role: 'student',
      status: 'active',
      department: 'Computer Science',
      year: '1st Year',
      section: 'Section A',
      createdAt: '2026-10-12T10:00:00.000Z'
    },
    {
      id: 'pending_student_01',
      uid: 'pending_student_01',
      name: 'Pending Bob',
      email: 'bob.pending@gmail.com',
      role: 'student',
      status: 'pending_approval',
      createdAt: '2026-10-12T11:00:00.000Z'
    }
  ];

  const { pendingList, activeList } = partitionStudentRecords(records);

  assert.equal(activeList.length, 1, 'activeList should contain exactly 1 student');
  assert.equal(activeList[0].email, 'avia18169@gmail.com');
  assert.equal(activeList[0].status, 'active');

  assert.equal(pendingList.length, 1, 'pendingList should contain exactly 1 student');
  assert.equal(pendingList[0].email, 'bob.pending@gmail.com');
  assert.equal(pendingList[0].status, 'pending_approval');

  // Verify avia18169@gmail.com is NOT in pendingList
  const aviaInPending = pendingList.some(s => s.email === 'avia18169@gmail.com');
  assert.equal(aviaInPending, false, 'Active student avia18169@gmail.com must NOT appear in pendingList');
});

// ---------------------------------------------------------------------
// Test 2: Duplicate / overlapping records for the same student never appear in both lists
// ---------------------------------------------------------------------
test('Duplicate or overlapping records for the same student (avia18169@gmail.com) resolve to active only', () => {
  const records = [
    {
      id: 'kFenxbrGFjeYmLPPk9RACHeSzfF3',
      uid: 'kFenxbrGFjeYmLPPk9RACHeSzfF3',
      name: 'Avia Student',
      email: 'avia18169@gmail.com',
      role: 'student',
      status: 'active',
      department: 'Computer Science',
      year: '1st Year',
      section: 'Section A',
      createdAt: '2026-10-12T12:00:00.000Z'
    },
    {
      id: 'old_orphaned_doc_99',
      uid: 'old_orphaned_doc_99',
      name: 'Avia Student (Duplicate)',
      email: 'avia18169@gmail.com',
      role: 'student',
      status: 'pending_approval',
      createdAt: '2026-10-12T09:00:00.000Z'
    }
  ];

  const { pendingList, activeList } = partitionStudentRecords(records);

  assert.equal(activeList.length, 1, 'activeList should contain the active record');
  assert.equal(activeList[0].email, 'avia18169@gmail.com');

  // Must be completely excluded from pendingList because active status takes precedence
  assert.equal(pendingList.length, 0, 'pendingList must exclude any student who is already active');
});

// ---------------------------------------------------------------------
// Test 3: Status string whitespace and casing are safely normalized
// ---------------------------------------------------------------------
test('Whitespace and casing in status field (e.g. " active ", " PENDING_APPROVAL ") are handled correctly', () => {
  const records = [
    {
      id: 'student_ws_active',
      email: 'active.whitespace@sangam.edu',
      status: ' active ',
      role: 'student'
    },
    {
      id: 'student_ws_pending',
      email: 'pending.whitespace@sangam.edu',
      status: ' Pending_Approval ',
      role: 'student'
    },
    {
      id: 'student_invalid',
      email: 'invalid@sangam.edu',
      status: 'suspended',
      role: 'student'
    }
  ];

  const { pendingList, activeList } = partitionStudentRecords(records);

  assert.equal(activeList.length, 1);
  assert.equal(activeList[0].id, 'student_ws_active');

  assert.equal(pendingList.length, 1);
  assert.equal(pendingList[0].id, 'student_ws_pending');
});

// ---------------------------------------------------------------------
// Test 4: Mutual exclusivity - zero overlap between pending and active
// ---------------------------------------------------------------------
test('Guaranteed mutual exclusivity: no student ID or email exists in both lists', () => {
  const records = [
    { id: 's1', email: 's1@sangam.edu', status: 'active' },
    { id: 's2', email: 's2@sangam.edu', status: 'pending_approval' },
    { id: 's3', email: 's3@sangam.edu', status: 'active' },
    { id: 's4', email: 's4@sangam.edu', status: 'pending_approval' },
    { id: 's1_dup', email: 's1@sangam.edu', status: 'pending_approval' },
    { id: 's5', email: 's5@sangam.edu', status: 'pending_approval' }
  ];

  const { pendingList, activeList } = partitionStudentRecords(records);

  const activeEmails = new Set(activeList.map(s => s.email.toLowerCase()));
  const activeIds = new Set(activeList.map(s => s.id));

  for (const pending of pendingList) {
    assert.equal(activeEmails.has(pending.email.toLowerCase()), false, `Email ${pending.email} must not be in both lists`);
    assert.equal(activeIds.has(pending.id), false, `ID ${pending.id} must not be in both lists`);
  }
});

// ---------------------------------------------------------------------
// Test 5: Post-approval transition dynamically updates lists
// ---------------------------------------------------------------------
test('Simulating approval update transitions student from pendingList to activeList', () => {
  let records = [
    { id: 'st_01', email: 'st01@sangam.edu', status: 'pending_approval', createdAt: '2026-10-12T01:00:00Z' },
    { id: 'st_02', email: 'st02@sangam.edu', status: 'active', createdAt: '2026-10-12T02:00:00Z' }
  ];

  // Before approval
  const before = partitionStudentRecords(records);
  assert.equal(before.pendingList.length, 1);
  assert.equal(before.activeList.length, 1);

  // Director approves st_01
  records = records.map(r => r.id === 'st_01' ? { ...r, status: 'active', department: 'CSE', year: '1st Year', section: 'A' } : r);

  // After approval
  const after = partitionStudentRecords(records);
  assert.equal(after.pendingList.length, 0, 'Pending list must now be empty');
  assert.equal(after.activeList.length, 2, 'Active list must now contain 2 students');
  assert.equal(after.activeList.some(s => s.id === 'st_01'), true);
});

// ---------------------------------------------------------------------
// Test 6: An active duplicate record does not cause an unrelated student to be excluded
// ---------------------------------------------------------------------
test('An active duplicate does NOT cause unrelated pending students to be excluded', () => {
  const records = [
    // Duplicate active records for Student A (avia)
    { id: 'docA1', uid: 'uid_A', email: 'avia18169@gmail.com', status: 'active', createdAt: '2026-10-12T10:00:00Z' },
    { id: 'docA2', uid: 'uid_A', email: 'avia18169@gmail.com', status: 'active', createdAt: '2026-10-12T09:00:00Z' },
    // Unrelated pending student B
    { id: 'docB', uid: 'uid_B', email: 'unrelated.student@sangam.edu', status: 'pending_approval', createdAt: '2026-10-12T11:00:00Z' },
    // Unrelated pending student C (no email, only UID)
    { id: 'docC', uid: 'uid_C', email: '', status: 'pending_approval', createdAt: '2026-10-12T08:00:00Z' }
  ];

  const { pendingList, activeList } = partitionStudentRecords(records);

  // Active list contains only 1 deduplicated record for Student A
  assert.equal(activeList.length, 1);
  assert.equal(activeList[0].email, 'avia18169@gmail.com');

  // Pending list must contain BOTH unrelated pending students B and C
  assert.equal(pendingList.length, 2, 'Both unrelated pending students must be preserved');
  assert.equal(pendingList.some(s => s.id === 'docB'), true, 'Student B must be in pending list');
  assert.equal(pendingList.some(s => s.id === 'docC'), true, 'Student C must be in pending list');

  // Neither Student B nor Student C appears in activeList
  assert.equal(activeList.some(s => s.id === 'docB'), false);
  assert.equal(activeList.some(s => s.id === 'docC'), false);
});

// ---------------------------------------------------------------------
// Test 7: Null or empty fields do not collide or falsely exclude students
// ---------------------------------------------------------------------
test('Missing or null email/UID values do not falsely match or collide', () => {
  const records = [
    { id: 'active_no_email', uid: 'uid_active_no_mail', email: null, status: 'active' },
    { id: 'pending_no_email', uid: 'uid_pending_no_mail', email: '', status: 'pending_approval' }
  ];

  const { pendingList, activeList } = partitionStudentRecords(records);

  assert.equal(activeList.length, 1);
  assert.equal(activeList[0].id, 'active_no_email');

  assert.equal(pendingList.length, 1);
  assert.equal(pendingList[0].id, 'pending_no_email');
});

// ---------------------------------------------------------------------
// Test 8: Duplicate faculty records for ayanagarwal40@gmail.com are deduplicated to verified Auth UID
// ---------------------------------------------------------------------
test('Duplicate faculty records for ayanagarwal40@gmail.com deduplicate by Firebase Auth UID using document UID consistently', () => {
  const ayanVerifiedUid = 'WgHtT4v015T18CfZnc7EejeWcJz2';
  const facultyRecords = [
    // Canonical document: users/WgHtT4v015T18CfZnc7EejeWcJz2
    {
      id: ayanVerifiedUid,
      uid: ayanVerifiedUid,
      name: 'Ayan Agarwal',
      email: 'ayanagarwal40@gmail.com',
      role: 'faculty',
      status: 'active',
      department: 'Computer Science',
      institution: 'UEMK',
      createdAt: '2026-10-12T10:00:00.000Z'
    },
    // Miskeyed duplicate: users/ayanagarwal40@gmail.com with uid = WgHtT4v015T18CfZnc7EejeWcJz2
    {
      id: 'ayanagarwal40@gmail.com',
      uid: ayanVerifiedUid,
      name: 'Ayan Agarwal',
      email: 'ayanagarwal40@gmail.com',
      role: 'faculty',
      status: 'active',
      department: 'Computer Science',
      institution: 'UEMK',
      createdAt: '2026-10-12T09:00:00.000Z'
    }
  ];

  const result = deduplicateFacultyRecords(facultyRecords);

  assert.equal(result.length, 1, 'Duplicate faculty profiles must resolve to exactly 1 card');
  assert.equal(result[0].uid, ayanVerifiedUid, 'Faculty UID must match verified Firebase Auth UID');
  assert.equal(result[0].id, ayanVerifiedUid, 'Document ID must consistently match verified Firebase Auth UID');
  assert.equal(result[0].email, 'ayanagarwal40@gmail.com');
  assert.equal(result[0].department, 'Computer Science');
});

// ---------------------------------------------------------------------
// Test 9: Deduplication correctly prefers canonical docId even when miskeyed document is first
// ---------------------------------------------------------------------
test('Canonical document ID users/WgHtT4v015T18CfZnc7EejeWcJz2 is selected regardless of query return order', () => {
  const ayanVerifiedUid = 'WgHtT4v015T18CfZnc7EejeWcJz2';
  const facultyRecords = [
    // Miskeyed document listed first
    {
      id: 'ayanagarwal40@gmail.com',
      uid: ayanVerifiedUid,
      name: 'Ayan Agarwal',
      email: 'ayanagarwal40@gmail.com',
      role: 'faculty',
      status: 'active',
      department: 'Computer Science',
      institution: 'UEMK'
    },
    // Canonical document listed second
    {
      id: ayanVerifiedUid,
      uid: ayanVerifiedUid,
      name: 'Ayan Agarwal (Canonical)',
      email: 'ayanagarwal40@gmail.com',
      role: 'faculty',
      status: 'active',
      department: 'Computer Science',
      institution: 'UEMK'
    }
  ];

  const result = deduplicateFacultyRecords(facultyRecords);

  assert.equal(result.length, 1);
  assert.equal(result[0].id, ayanVerifiedUid, 'Must consistently use canonical document UID');
  assert.equal(result[0].uid, ayanVerifiedUid);
});

// ---------------------------------------------------------------------
// Test 10: Accounts with different Auth UIDs are NEVER merged, even with similar/identical emails
// ---------------------------------------------------------------------
test('Distinct faculty accounts with different Auth UIDs are not merged even if emails look similar', () => {
  const facultyRecords = [
    {
      id: 'uid_faculty_primary',
      uid: 'uid_faculty_primary',
      name: 'Ayan Primary',
      email: 'ayanagarwal40@gmail.com',
      role: 'faculty',
      department: 'Computer Science'
    },
    {
      id: 'uid_faculty_secondary',
      uid: 'uid_faculty_secondary',
      name: 'Ayan Work Account',
      email: 'ayanagarwal40@gmail.com', // identical email on distinct auth account
      role: 'faculty',
      department: 'Computer Science'
    },
    {
      id: 'uid_faculty_similar',
      uid: 'uid_faculty_similar',
      name: 'Ayan Alt',
      email: 'ayanagarwal40+alt@gmail.com', // similar alias
      role: 'faculty',
      department: 'Computer Science'
    }
  ];

  const result = deduplicateFacultyRecords(facultyRecords);

  assert.equal(result.length, 3, 'All 3 distinct accounts must be preserved; no false merges based on email similarity');
  const uids = result.map(f => f.uid);
  assert.ok(uids.includes('uid_faculty_primary'));
  assert.ok(uids.includes('uid_faculty_secondary'));
  assert.ok(uids.includes('uid_faculty_similar'));
});

// ---------------------------------------------------------------------
// Test 11: Multi-faculty roster with duplicates resolves correctly
// ---------------------------------------------------------------------
test('Faculty roster containing multiple staff and duplicates deduplicates cleanly', () => {
  const ayanVerifiedUid = 'WgHtT4v015T18CfZnc7EejeWcJz2';
  const facultyRecords = [
    { id: 'faculty_alan', uid: 'faculty_alan', name: 'Alan Turing', email: 'alan@sangam.edu', role: 'faculty' },
    { id: 'faculty_tesla', uid: 'faculty_tesla', name: 'Nikola Tesla', email: 'tesla@sangam.edu', role: 'faculty' },
    { id: ayanVerifiedUid, uid: ayanVerifiedUid, name: 'Ayan Agarwal', email: 'ayanagarwal40@gmail.com', role: 'faculty' },
    { id: 'ayanagarwal40@gmail.com', uid: ayanVerifiedUid, name: 'Ayan Agarwal Duplicate', email: 'ayanagarwal40@gmail.com', role: 'faculty' }
  ];

  const result = deduplicateFacultyRecords(facultyRecords);

  assert.equal(result.length, 3, 'Must produce exactly 3 faculty members');
  assert.equal(result.some(f => f.id === ayanVerifiedUid && f.uid === ayanVerifiedUid), true);
  assert.equal(result.some(f => f.id === 'faculty_alan' && f.uid === 'faculty_alan'), true);
  assert.equal(result.some(f => f.id === 'faculty_tesla' && f.uid === 'faculty_tesla'), true);
});

// ---------------------------------------------------------------------
// Test 12: Recreated Test Student vs Obsolete Profile in Director Partitioning
// ---------------------------------------------------------------------
test('Recreated Test Student (qfQnw...) is active; obsolete account (MXE8I...) is excluded from pending and active', () => {
  const records = [
    {
      id: 'MXE8Ip0nD4YnLPGIfyjALctKR7n2',
      uid: 'MXE8Ip0nD4YnLPGIfyjALctKR7n2',
      name: 'Test Student',
      email: 'test_student_1791818183865@test.com',
      role: 'student',
      status: 'pending_approval',
      department: 'Computer Science',
      year: '2nd Year',
      section: 'Sec A',
      institution: 'UEMK',
      createdAt: '2026-10-12T10:00:00.000Z'
    },
    {
      id: 'qfQnwVbU6ZWbXyc0LxasTeBNRq13',
      uid: 'qfQnwVbU6ZWbXyc0LxasTeBNRq13',
      name: 'Test Student',
      email: 'test_student_1791818183865@test.com',
      role: 'student',
      status: 'active',
      department: 'Computer Science',
      year: '2nd Year',
      section: 'Sec A',
      institution: 'UEMK',
      createdAt: '2026-10-13T10:00:00.000Z'
    }
  ];

  const { pendingList, activeList } = partitionStudentRecords(records);

  assert.equal(activeList.length, 1, 'activeList must contain exactly 1 student');
  assert.equal(activeList[0].uid, 'qfQnwVbU6ZWbXyc0LxasTeBNRq13', 'Active student must have UID qfQnwVbU6ZWbXyc0LxasTeBNRq13');
  assert.equal(activeList[0].name, 'Test Student');
  assert.equal(activeList[0].status, 'active');

  // Obsolete record must NOT appear in pendingList because active student has the same email
  assert.equal(pendingList.length, 0, 'pendingList must exclude obsolete record MXE8Ip0nD4YnLPGIfyjALctKR7n2');
  assert.equal(activeList.some(s => s.uid === 'MXE8Ip0nD4YnLPGIfyjALctKR7n2'), false);
  assert.equal(pendingList.some(s => s.uid === 'MXE8Ip0nD4YnLPGIfyjALctKR7n2'), false);
});

// ---------------------------------------------------------------------
// Test 13: Multiple active accounts for same email deduplicate to exactly 1 active student
// ---------------------------------------------------------------------
test('Multiple active student documents for same email deduplicate to exactly 1 active student', () => {
  const records = [
    {
      id: 'MXE8Ip0nD4YnLPGIfyjALctKR7n2',
      uid: 'MXE8Ip0nD4YnLPGIfyjALctKR7n2',
      name: 'Test Student',
      email: 'test_student_1791818183865@test.com',
      role: 'student',
      status: 'active',
      department: 'Computer Science',
      year: '2nd Year',
      section: 'Sec A',
      createdAt: '2026-10-12T10:00:00.000Z'
    },
    {
      id: 'qfQnwVbU6ZWbXyc0LxasTeBNRq13',
      uid: 'qfQnwVbU6ZWbXyc0LxasTeBNRq13',
      name: 'Test Student',
      email: 'test_student_1791818183865@test.com',
      role: 'student',
      status: 'active',
      department: 'Computer Science',
      year: '2nd Year',
      section: 'Sec A',
      createdAt: '2026-10-13T10:00:00.000Z'
    }
  ];

  const { pendingList, activeList } = partitionStudentRecords(records);

  assert.equal(activeList.length, 1, 'activeList must contain exactly 1 student even if both had status active');
  assert.equal(activeList[0].uid, 'qfQnwVbU6ZWbXyc0LxasTeBNRq13', 'Newer active record must be selected');
  assert.equal(pendingList.length, 0);
});

console.log(`\n========================================`);
console.log(`FILTERING TESTS: ${passed} PASSED, ${failed} FAILED`);
console.log(`========================================\n`);

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
