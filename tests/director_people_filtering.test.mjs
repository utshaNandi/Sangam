import assert from 'node:assert/strict';
import { partitionStudentRecords } from '../src/pages/Director/studentPartition.js';

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

console.log(`\n========================================`);
console.log(`FILTERING TESTS: ${passed} PASSED, ${failed} FAILED`);
console.log(`========================================\n`);

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
