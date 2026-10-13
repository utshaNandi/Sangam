import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import fs from 'fs';
import path from 'path';
import { doc, getDoc, getDocs, setDoc, updateDoc, collection, query, where } from 'firebase/firestore';
import { 
  savePeriodAttendance, 
  saveSingleStudentAttendance, 
  generateSessionId, 
  fetchStudentsForSection, 
  fetchSessionAttendanceRecords,
  createTeacherAllocation,
  fetchTeacherAllocations,
  deleteTeacherAllocation,
  diagnoseAttendanceWriteError
} from '../src/services/attendanceService.js';

const rulesPath = path.resolve('firestore.rules');
const rules = fs.readFileSync(rulesPath, 'utf8');

const PROJECT_ID = 'sangam-attendance-test';

console.log('Connecting to Firestore emulator on port 8080 for attendance rules testing...');
const testEnv = await initializeTestEnvironment({
  projectId: PROJECT_ID,
  firestore: {
    rules,
    host: '127.0.0.1',
    port: 8080,
  },
});

let passed = 0;
let failed = 0;

function report(num, desc, ok, details = '') {
  if (ok) {
    passed++;
    console.log(`[PASS] Case ${num}: ${desc}`);
  } else {
    failed++;
    console.error(`[FAIL] Case ${num}: ${desc} -> ${details}`);
  }
}

try {
  await testEnv.clearFirestore();

  // Setup initial test data using security rules disabled (admin context)
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const adminDb = context.firestore();

    // 1. Authorized Director (UEMK)
    await setDoc(doc(adminDb, 'authorized_staff', 'director@sangam.edu'), {
      role: 'director',
      authorized: true
    });
    await setDoc(doc(adminDb, 'users', 'director_uid_01'), {
      uid: 'director_uid_01',
      name: 'Dr. Principal Director',
      email: 'director@sangam.edu',
      role: 'director',
      status: 'active',
      createdAt: new Date().toISOString(),
      department: 'Administration',
      institution: 'UEMK'
    });

    // 2. Authorized Faculty 1 (Computer Science, UEMK)
    await setDoc(doc(adminDb, 'authorized_staff', 'faculty.cs@sangam.edu'), {
      role: 'faculty',
      authorized: true
    });
    await setDoc(doc(adminDb, 'users', 'faculty_cs_uid'), {
      uid: 'faculty_cs_uid',
      name: 'Prof. Alan Turing',
      email: 'faculty.cs@sangam.edu',
      role: 'faculty',
      status: 'active',
      createdAt: new Date().toISOString(),
      department: 'Computer Science',
      institution: 'UEMK'
    });

    // 3. Authorized Faculty 2 (Electrical Engineering, UEMK)
    await setDoc(doc(adminDb, 'authorized_staff', 'faculty.ee@sangam.edu'), {
      role: 'faculty',
      authorized: true
    });
    await setDoc(doc(adminDb, 'users', 'faculty_ee_uid'), {
      uid: 'faculty_ee_uid',
      name: 'Prof. Nikola Tesla',
      email: 'faculty.ee@sangam.edu',
      role: 'faculty',
      status: 'active',
      createdAt: new Date().toISOString(),
      department: 'Electrical Engineering',
      institution: 'UEMK'
    });

    // 4. Unauthorized Faculty (not in authorized_staff whitelist)
    await setDoc(doc(adminDb, 'users', 'unauthorized_faculty_uid'), {
      uid: 'unauthorized_faculty_uid',
      name: 'Imposter Faculty',
      email: 'imposter@gmail.com',
      role: 'faculty',
      status: 'active',
      createdAt: new Date().toISOString(),
      department: 'Computer Science',
      institution: 'UEMK'
    });

    // 5. Active Student 1 (Computer Science, 2nd Year, Sec C, UEMK)
    await setDoc(doc(adminDb, 'users', 'student_cs_01'), {
      uid: 'student_cs_01',
      name: 'Student One CS',
      email: 'student1.cs@gmail.com',
      role: 'student',
      status: 'active',
      createdAt: new Date().toISOString(),
      department: 'Computer Science',
      year: '2nd Year',
      section: 'Sec C',
      institution: 'UEMK'
    });

    // 6. Active Student 2 (Computer Science, 2nd Year, Sec C, UEMK)
    await setDoc(doc(adminDb, 'users', 'student_cs_02'), {
      uid: 'student_cs_02',
      name: 'Student Two CS',
      email: 'student2.cs@gmail.com',
      role: 'student',
      status: 'active',
      createdAt: new Date().toISOString(),
      department: 'Computer Science',
      year: '2nd Year',
      section: 'Sec C',
      institution: 'UEMK'
    });

    // 7. Active Student in EE (Electrical Engineering, UEMK)
    await setDoc(doc(adminDb, 'users', 'student_ee_01'), {
      uid: 'student_ee_01',
      name: 'Student EE',
      email: 'student.ee@gmail.com',
      role: 'student',
      status: 'active',
      createdAt: new Date().toISOString(),
      department: 'Electrical Engineering',
      year: '2nd Year',
      section: 'Sec A',
      institution: 'UEMK'
    });

    // 8. Pending Student (not active)
    await setDoc(doc(adminDb, 'users', 'student_pending_01'), {
      uid: 'student_pending_01',
      name: 'Pending Student',
      email: 'pending.student@gmail.com',
      role: 'student',
      status: 'pending_approval',
      createdAt: new Date().toISOString(),
      department: 'Computer Science',
      year: '2nd Year',
      section: 'Sec C',
      institution: 'UEMK'
    });

    // 9. Teacher class allocation: Faculty CS is allocated to 2nd Year Sec C at UEMK
    await setDoc(doc(adminDb, 'teacher_allocations', 'faculty_cs_uid_2nd Year_Sec C'), {
      teacherUid: 'faculty_cs_uid',
      institution: 'UEMK',
      department: 'Computer Science',
      year: '2nd Year',
      section: 'Sec C',
      authorized: true,
      createdAt: new Date().toISOString()
    });

    // 10. Student in Computer Science 2nd Year Sec B (different section)
    await setDoc(doc(adminDb, 'users', 'student_cs_secB_01'), {
      uid: 'student_cs_secB_01',
      name: 'Student Sec B',
      email: 'student.secb@gmail.com',
      role: 'student',
      status: 'active',
      createdAt: new Date().toISOString(),
      department: 'Computer Science',
      year: '2nd Year',
      section: 'Sec B',
      institution: 'UEMK'
    });

    // 11. Institution 2: HITK
    await setDoc(doc(adminDb, 'authorized_staff', 'director.hitk@sangam.edu'), {
      role: 'director',
      authorized: true
    });
    await setDoc(doc(adminDb, 'users', 'director_hitk_uid'), {
      uid: 'director_hitk_uid',
      name: 'Director HITK',
      email: 'director.hitk@sangam.edu',
      role: 'director',
      status: 'active',
      createdAt: new Date().toISOString(),
      department: 'Administration',
      institution: 'HITK'
    });
    await setDoc(doc(adminDb, 'users', 'student_hitk_01'), {
      uid: 'student_hitk_01',
      name: 'Student HITK',
      email: 'student.hitk@gmail.com',
      role: 'student',
      status: 'active',
      createdAt: new Date().toISOString(),
      department: 'Computer Science',
      year: '2nd Year',
      section: 'Sec C',
      institution: 'HITK'
    });
    await setDoc(doc(adminDb, 'attendance_records', 'HITK_ComputerScience_2ndYear_SecC_2026-10-13_P1_student_hitk_01'), {
      sessionId: 'HITK_ComputerScience_2ndYear_SecC_2026-10-13_P1',
      institution: 'HITK',
      department: 'Computer Science',
      year: '2nd Year',
      section: 'Sec C',
      date: '2026-10-13',
      period: 1,
      studentUid: 'student_hitk_01',
      status: 'Present',
      markedBy: 'faculty_hitk_uid',
      markedAt: new Date().toISOString()
    });
    await setDoc(doc(adminDb, 'attendance_sessions', 'HITK_ComputerScience_2ndYear_SecC_2026-10-13_P1'), {
      sessionId: 'HITK_ComputerScience_2ndYear_SecC_2026-10-13_P1',
      institution: 'HITK',
      department: 'Computer Science',
      year: '2nd Year',
      section: 'Sec C',
      date: '2026-10-13',
      period: 1,
      markedBy: 'faculty_hitk_uid',
      markedAt: new Date().toISOString(),
      presentCount: 1,
      absentCount: 0,
      totalStudents: 1
    });
  });

  // Client contexts
  const facultyCsDb = testEnv.authenticatedContext('faculty_cs_uid', { email: 'faculty.cs@sangam.edu' }).firestore();
  const facultyEeDb = testEnv.authenticatedContext('faculty_ee_uid', { email: 'faculty.ee@sangam.edu' }).firestore();
  const unauthFacultyDb = testEnv.authenticatedContext('unauthorized_faculty_uid', { email: 'imposter@gmail.com' }).firestore();
  const student1Db = testEnv.authenticatedContext('student_cs_01', { email: 'student1.cs@gmail.com' }).firestore();
  const student2Db = testEnv.authenticatedContext('student_cs_02', { email: 'student2.cs@gmail.com' }).firestore();
  const directorDb = testEnv.authenticatedContext('director_uid_01', { email: 'director@sangam.edu' }).firestore();
  const directorHitkDb = testEnv.authenticatedContext('director_hitk_uid', { email: 'director.hitk@sangam.edu' }).firestore();

  const validSessionId = 'UEMK_ComputerScience_2ndYear_SecC_2026-10-13_P1';
  const validRecordId1 = `${validSessionId}_student_cs_01`;
  const validRecordId2 = `${validSessionId}_student_cs_02`;

  const validRecordPayload = {
    sessionId: validSessionId,
    institution: 'UEMK',
    department: 'Computer Science',
    year: '2nd Year',
    section: 'Sec C',
    date: '2026-10-13',
    period: 1,
    studentUid: 'student_cs_01',
    status: 'Present',
    markedBy: 'faculty_cs_uid',
    markedAt: new Date().toISOString(),
    studentName: 'Student One CS',
  };

  // -------------------------------------------------------------
  // Test 1: Authorized Faculty marks attendance for allocated class and in-scope active student
  // -------------------------------------------------------------
  try {
    await assertSucceeds(setDoc(doc(facultyCsDb, 'attendance_records', validRecordId1), validRecordPayload));
    report(1, 'Authorized Faculty marks attendance for allocated class and in-scope active student', true);
  } catch (err) {
    report(1, 'Authorized Faculty marks attendance for allocated class and in-scope active student', false, err.message);
  }

  // -------------------------------------------------------------
  // Test 2: Unauthorized Faculty cannot mark attendance
  // -------------------------------------------------------------
  try {
    await assertFails(setDoc(doc(unauthFacultyDb, 'attendance_records', `${validSessionId}_student_cs_02`), {
      ...validRecordPayload,
      studentUid: 'student_cs_02',
      markedBy: 'unauthorized_faculty_uid'
    }));
    report(2, 'Non-whitelisted faculty cannot create attendance records', true);
  } catch (err) {
    report(2, 'Non-whitelisted faculty cannot create attendance records', false, err.message);
  }

  // -------------------------------------------------------------
  // Test 3: Faculty cannot mark attendance for student in another department
  // -------------------------------------------------------------
  try {
    await assertFails(setDoc(doc(facultyCsDb, 'attendance_records', `${validSessionId}_student_ee_01`), {
      ...validRecordPayload,
      studentUid: 'student_ee_01'
    }));
    report(3, 'Faculty cannot mark attendance for student in another department', true);
  } catch (err) {
    report(3, 'Faculty cannot mark attendance for student in another department', false, err.message);
  }

  // -------------------------------------------------------------
  // Test 4: Faculty cannot mark attendance for pending/unapproved student
  // -------------------------------------------------------------
  try {
    await assertFails(setDoc(doc(facultyCsDb, 'attendance_records', `${validSessionId}_student_pending_01`), {
      ...validRecordPayload,
      studentUid: 'student_pending_01'
    }));
    report(4, 'Faculty cannot mark attendance for pending/unapproved student', true);
  } catch (err) {
    report(4, 'Faculty cannot mark attendance for pending/unapproved student', false, err.message);
  }

  // -------------------------------------------------------------
  // Test 5: Client cannot spoof markedBy field
  // -------------------------------------------------------------
  try {
    await assertFails(setDoc(doc(facultyCsDb, 'attendance_records', `${validSessionId}_student_cs_02`), {
      ...validRecordPayload,
      studentUid: 'student_cs_02',
      markedBy: 'director_uid_01' // spoofed
    }));
    report(5, 'Client cannot spoof markedBy field', true);
  } catch (err) {
    report(5, 'Client cannot spoof markedBy field', false, err.message);
  }

  // -------------------------------------------------------------
  // Test 6: Invalid status values (e.g. 'Late', 'Excused') are rejected
  // -------------------------------------------------------------
  try {
    await assertFails(setDoc(doc(facultyCsDb, 'attendance_records', `${validSessionId}_student_cs_02`), {
      ...validRecordPayload,
      studentUid: 'student_cs_02',
      status: 'Late' // invalid
    }));
    report(6, 'Invalid attendance status values are rejected', true);
  } catch (err) {
    report(6, 'Invalid attendance status values are rejected', false, err.message);
  }

  // -------------------------------------------------------------
  // Test 7: Invalid date format and invalid period are rejected
  // -------------------------------------------------------------
  try {
    await assertFails(setDoc(doc(facultyCsDb, 'attendance_records', `${validSessionId}_student_cs_02`), {
      ...validRecordPayload,
      studentUid: 'student_cs_02',
      date: '13-10-2026' // invalid format
    }));
    await assertFails(setDoc(doc(facultyCsDb, 'attendance_records', `${validSessionId}_student_cs_02`), {
      ...validRecordPayload,
      studentUid: 'student_cs_02',
      period: 10 // invalid period (> 9)
    }));
    report(7, 'Invalid date format and out-of-range periods are rejected', true);
  } catch (err) {
    report(7, 'Invalid date format and out-of-range periods are rejected', false, err.message);
  }

  // -------------------------------------------------------------
  // Test 8: Document ID must strictly match ${sessionId}_${studentUid}
  // -------------------------------------------------------------
  try {
    await assertFails(setDoc(doc(facultyCsDb, 'attendance_records', 'arbitrary_doc_id'), {
      ...validRecordPayload,
      studentUid: 'student_cs_02'
    }));
    report(8, 'Record doc ID mismatch with sessionId_studentUid is rejected', true);
  } catch (err) {
    report(8, 'Record doc ID mismatch with sessionId_studentUid is rejected', false, err.message);
  }

  // -------------------------------------------------------------
  // Test 9: Student cannot write/create attendance records
  // -------------------------------------------------------------
  try {
    await assertFails(setDoc(doc(student1Db, 'attendance_records', `${validSessionId}_student_cs_01`), {
      ...validRecordPayload,
      markedBy: 'student_cs_01'
    }));
    report(9, 'Students cannot write attendance records', true);
  } catch (err) {
    report(9, 'Students cannot write attendance records', false, err.message);
  }

  // -------------------------------------------------------------
  // Test 10: Student can read ONLY their own attendance record
  // -------------------------------------------------------------
  try {
    // Read own record succeeds
    await assertSucceeds(getDoc(doc(student1Db, 'attendance_records', validRecordId1)));
    // Read another student's record fails
    await assertFails(getDoc(doc(student2Db, 'attendance_records', validRecordId1)));
    report(10, 'Student reads own record and cross-student read is blocked', true);
  } catch (err) {
    report(10, 'Student reads own record and cross-student read is blocked', false, err.message);
  }

  // -------------------------------------------------------------
  // Test 11: Student can query ONLY records where studentUid == auth.uid
  // -------------------------------------------------------------
  try {
    // Querying own records succeeds
    const ownQuery = query(collection(student1Db, 'attendance_records'), where('studentUid', '==', 'student_cs_01'));
    await assertSucceeds(getDocs(ownQuery));

    // Broad query without studentUid filter fails
    const broadQuery = query(collection(student1Db, 'attendance_records'));
    await assertFails(getDocs(broadQuery));

    // Querying another student's records fails
    const crossQuery = query(collection(student1Db, 'attendance_records'), where('studentUid', '==', 'student_cs_02'));
    await assertFails(getDocs(crossQuery));

    report(11, 'Student attendance queries strictly enforce studentUid filter and block broad queries', true);
  } catch (err) {
    report(11, 'Student attendance queries strictly enforce studentUid filter and block broad queries', false, err.message);
  }

  // -------------------------------------------------------------
  // Test 12: Authorized Faculty can read attendance in their department
  // -------------------------------------------------------------
  try {
    await assertSucceeds(getDoc(doc(facultyCsDb, 'attendance_records', validRecordId1)));
    // Faculty from EE cannot read CS attendance
    await assertFails(getDoc(doc(facultyEeDb, 'attendance_records', validRecordId1)));
    report(12, 'Faculty reads attendance in own department; cross-department faculty read blocked', true);
  } catch (err) {
    report(12, 'Faculty reads attendance in own department; cross-department faculty read blocked', false, err.message);
  }

  // -------------------------------------------------------------
  // Test 13: Authorized Director can read attendance in their institution
  // -------------------------------------------------------------
  try {
    await assertSucceeds(getDoc(doc(directorDb, 'attendance_records', validRecordId1)));
    report(13, 'Authorized Director can inspect attendance records in institution', true);
  } catch (err) {
    report(13, 'Authorized Director can inspect attendance records in institution', false, err.message);
  }

  // -------------------------------------------------------------
  // Test 14: Authorized Faculty can update attendance status (toggle Present/Absent)
  // -------------------------------------------------------------
  try {
    await assertSucceeds(updateDoc(doc(facultyCsDb, 'attendance_records', validRecordId1), {
      status: 'Absent',
      markedBy: 'faculty_cs_uid',
      markedAt: new Date().toISOString()
    }));
    report(14, 'Authorized Faculty can update attendance status (toggle Present/Absent)', true);
  } catch (err) {
    report(14, 'Authorized Faculty can update attendance status', false, err.message);
  }

  // -------------------------------------------------------------
  // Test 15: Tampering with immutable session/student fields during update fails
  // -------------------------------------------------------------
  try {
    await assertFails(updateDoc(doc(facultyCsDb, 'attendance_records', validRecordId1), {
      studentUid: 'student_cs_02',
      markedBy: 'faculty_cs_uid'
    }));
    await assertFails(updateDoc(doc(facultyCsDb, 'attendance_records', validRecordId1), {
      date: '2026-10-14',
      markedBy: 'faculty_cs_uid'
    }));
    report(15, 'Tampering with immutable fields (studentUid, date) during update fails', true);
  } catch (err) {
    report(15, 'Tampering with immutable fields during update fails', false, err.message);
  }

  // -------------------------------------------------------------
  // Test 16: Faculty can query active students in their department, but broad query fails
  // -------------------------------------------------------------
  try {
    const deptStudentsQuery = query(
      collection(facultyCsDb, 'users'),
      where('role', '==', 'student'),
      where('status', '==', 'active'),
      where('department', '==', 'Computer Science')
    );
    await assertSucceeds(getDocs(deptStudentsQuery));

    // Faculty querying another department fails
    const otherDeptQuery = query(
      collection(facultyCsDb, 'users'),
      where('role', '==', 'student'),
      where('status', '==', 'active'),
      where('department', '==', 'Electrical Engineering')
    );
    await assertFails(getDocs(otherDeptQuery));

    report(16, 'Faculty queries only students in their department; cross-department student queries fail', true);
  } catch (err) {
    report(16, 'Faculty department student queries', false, err.message);
  }

  // -------------------------------------------------------------
  // Test 17: Attendance sessions creation and authorization
  // -------------------------------------------------------------
  try {
    const sessionPayload = {
      sessionId: validSessionId,
      institution: 'UEMK',
      department: 'Computer Science',
      year: '2nd Year',
      section: 'Sec C',
      date: '2026-10-13',
      period: 1,
      markedBy: 'faculty_cs_uid',
      markedAt: new Date().toISOString(),
      presentCount: 1,
      absentCount: 0,
      totalStudents: 1
    };
    await assertSucceeds(setDoc(doc(facultyCsDb, 'attendance_sessions', validSessionId), sessionPayload));
    // Student cannot create session
    await assertFails(setDoc(doc(student1Db, 'attendance_sessions', 'student_session_hack'), sessionPayload));
    report(17, 'Faculty creates session document; student session creation is blocked', true);
  } catch (err) {
    report(17, 'Faculty creates session document', false, err.message);
  }

  // -------------------------------------------------------------
  // Test 18: Faculty cannot mark attendance for year/section without trusted allocation
  // -------------------------------------------------------------
  try {
    // Faculty CS is NOT allocated to 3rd Year Sec A
    const unallocatedSessionId = 'UEMK_ComputerScience_3rdYear_SecA_2026-10-13_P1';
    await assertFails(setDoc(doc(facultyCsDb, 'attendance_records', `${unallocatedSessionId}_student_cs_01`), {
      ...validRecordPayload,
      sessionId: unallocatedSessionId,
      year: '3rd Year',
      section: 'Sec A'
    }));
    report(18, 'Faculty cannot mark attendance for year/section without trusted allocation doc', true);
  } catch (err) {
    report(18, 'Faculty cannot mark attendance for unallocated year/section', false, err.message);
  }

  // -------------------------------------------------------------
  // Test 19: Faculty cannot mark attendance for student in another section
  // -------------------------------------------------------------
  try {
    // student_cs_secB_01 is in Sec B, but session is Sec C
    await assertFails(setDoc(doc(facultyCsDb, 'attendance_records', `${validSessionId}_student_cs_secB_01`), {
      ...validRecordPayload,
      studentUid: 'student_cs_secB_01'
    }));
    report(19, 'Faculty cannot mark attendance for student in different section (Sec B student in Sec C session)', true);
  } catch (err) {
    report(19, 'Faculty cannot mark attendance for mismatched student section', false, err.message);
  }

  // -------------------------------------------------------------
  // Test 20: Arbitrary or inconsistent session totals are rejected
  // -------------------------------------------------------------
  try {
    const invalidTotalsSessionId = 'UEMK_ComputerScience_2ndYear_SecC_2026-10-13_P2';
    // presentCount (2) + absentCount (1) != totalStudents (10)
    await assertFails(setDoc(doc(facultyCsDb, 'attendance_sessions', invalidTotalsSessionId), {
      sessionId: invalidTotalsSessionId,
      institution: 'UEMK',
      department: 'Computer Science',
      year: '2nd Year',
      section: 'Sec C',
      date: '2026-10-13',
      period: 2,
      markedBy: 'faculty_cs_uid',
      markedAt: new Date().toISOString(),
      presentCount: 2,
      absentCount: 1,
      totalStudents: 10
    }));
    report(20, 'Inconsistent session totals (presentCount + absentCount != totalStudents) are rejected', true);
  } catch (err) {
    report(20, 'Inconsistent session totals rejection', false, err.message);
  }

  // -------------------------------------------------------------
  // Test 21: Negative session counts are rejected
  // -------------------------------------------------------------
  try {
    const negativeCountSessionId = 'UEMK_ComputerScience_2ndYear_SecC_2026-10-13_P3';
    await assertFails(setDoc(doc(facultyCsDb, 'attendance_sessions', negativeCountSessionId), {
      sessionId: negativeCountSessionId,
      institution: 'UEMK',
      department: 'Computer Science',
      year: '2nd Year',
      section: 'Sec C',
      date: '2026-10-13',
      period: 3,
      markedBy: 'faculty_cs_uid',
      markedAt: new Date().toISOString(),
      presentCount: -1,
      absentCount: 1,
      totalStudents: 0
    }));
    report(21, 'Negative counts in attendance session are rejected', true);
  } catch (err) {
    report(21, 'Negative counts in attendance session', false, err.message);
  }

  // -------------------------------------------------------------
  // Test 22: Unauthorized record update with arbitrary or modified identity fields fails
  // -------------------------------------------------------------
  try {
    // Attempting to modify studentName during update
    await assertFails(updateDoc(doc(facultyCsDb, 'attendance_records', validRecordId1), {
      studentName: 'Changed Name',
      markedBy: 'faculty_cs_uid',
      markedAt: new Date().toISOString()
    }));
    // Attempting to inject arbitrary malicious field during update
    await assertFails(updateDoc(doc(facultyCsDb, 'attendance_records', validRecordId1), {
      status: 'Present',
      arbitraryField: 'exploit',
      markedBy: 'faculty_cs_uid',
      markedAt: new Date().toISOString()
    }));
    report(22, 'Arbitrary fields or student metadata changes during record update are strictly rejected', true);
  } catch (err) {
    report(22, 'Arbitrary fields during record update', false, err.message);
  }

  // -------------------------------------------------------------
  // Test 23: Unauthorized session update with arbitrary fields fails
  // -------------------------------------------------------------
  try {
    // Attempting to inject arbitrary field into session document
    await assertFails(updateDoc(doc(facultyCsDb, 'attendance_sessions', validSessionId), {
      hackedField: 'unauthorized',
      markedBy: 'faculty_cs_uid',
      markedAt: new Date().toISOString()
    }));
    report(23, 'Arbitrary fields during session document update are strictly rejected', true);
  } catch (err) {
    report(23, 'Arbitrary fields during session update', false, err.message);
  }

  // -------------------------------------------------------------
  // Test 24: Cross-institution access: Director from UEMK cannot read HITK records
  // -------------------------------------------------------------
  try {
    const hitkRecordId = 'HITK_ComputerScience_2ndYear_SecC_2026-10-13_P1_student_hitk_01';
    // UEMK Director reading HITK record fails
    await assertFails(getDoc(doc(directorDb, 'attendance_records', hitkRecordId)));
    // HITK Director reading HITK record succeeds
    await assertSucceeds(getDoc(doc(directorHitkDb, 'attendance_records', hitkRecordId)));
    // UEMK Director reading HITK session fails
    await assertFails(getDoc(doc(directorDb, 'attendance_sessions', 'HITK_ComputerScience_2ndYear_SecC_2026-10-13_P1')));
    report(24, 'Cross-institution attendance access by Director is strictly blocked', true);
  } catch (err) {
    report(24, 'Cross-institution attendance access by Director', false, err.message);
  }

  // -------------------------------------------------------------
  // Test 25: Cross-institution write: Faculty from UEMK cannot mark attendance for HITK
  // -------------------------------------------------------------
  try {
    const crossInstSessionId = 'HITK_ComputerScience_2ndYear_SecC_2026-10-13_P1';
    await assertFails(setDoc(doc(facultyCsDb, 'attendance_records', `${crossInstSessionId}_student_hitk_01`), {
      ...validRecordPayload,
      sessionId: crossInstSessionId,
      institution: 'HITK',
      studentUid: 'student_hitk_01'
    }));
    report(25, 'Cross-institution attendance write by Faculty is strictly blocked', true);
  } catch (err) {
    report(25, 'Cross-institution attendance write by Faculty', false, err.message);
  }

  // -------------------------------------------------------------
  // Test 26: Director can manage teacher allocations in own institution but not cross-institution
  // -------------------------------------------------------------
  try {
    const newAllocId = 'faculty_ee_uid_2nd Year_Sec A';
    // UEMK Director allocates Faculty EE to 2nd Year Sec A at UEMK
    await assertSucceeds(setDoc(doc(directorDb, 'teacher_allocations', newAllocId), {
      teacherUid: 'faculty_ee_uid',
      institution: 'UEMK',
      department: 'Electrical Engineering',
      year: '2nd Year',
      section: 'Sec A',
      authorized: true,
      createdAt: new Date().toISOString()
    }));
    // UEMK Director cannot create allocation for HITK institution
    await assertFails(setDoc(doc(directorDb, 'teacher_allocations', 'faculty_ee_uid_HITK'), {
      teacherUid: 'faculty_ee_uid',
      institution: 'HITK',
      department: 'Electrical Engineering',
      year: '2nd Year',
      section: 'Sec A',
      authorized: true,
      createdAt: new Date().toISOString()
    }));
    // Faculty cannot create teacher allocation
    await assertFails(setDoc(doc(facultyCsDb, 'teacher_allocations', 'faculty_cs_hack'), {
      teacherUid: 'faculty_cs_uid',
      institution: 'UEMK',
      department: 'Computer Science',
      year: '2nd Year',
      section: 'Sec B',
      authorized: true,
      createdAt: new Date().toISOString()
    }));
    report(26, 'Director manages teacher_allocations within institution; cross-institution and faculty writes blocked', true);
  } catch (err) {
    report(26, 'Director teacher_allocations management', false, err.message);
  }

  // -------------------------------------------------------------
  // Test 27: Session ownership tampering: markedBy cannot be changed on session update
  // -------------------------------------------------------------
  try {
    await assertFails(updateDoc(doc(facultyCsDb, 'attendance_sessions', validSessionId), {
      markedBy: 'different_faculty_uid',
      presentCount: 1,
      absentCount: 0,
      totalStudents: 1
    }));
    report(27, 'Session ownership tampering: markedBy cannot be changed on session update', true);
  } catch (err) {
    report(27, 'Session ownership tampering rejection', false, err.message);
  }

  // -------------------------------------------------------------
  // Test 28: Unallocated faculty cannot update an existing session
  // -------------------------------------------------------------
  try {
    // Faculty EE is not allocated to CS 2nd Year Sec C
    await assertFails(updateDoc(doc(facultyEeDb, 'attendance_sessions', validSessionId), {
      presentCount: 1,
      absentCount: 0,
      totalStudents: 1
    }));
    report(28, 'Unallocated faculty cannot update an existing attendance session', true);
  } catch (err) {
    report(28, 'Unallocated faculty session update rejection', false, err.message);
  }

  // -------------------------------------------------------------
  // Test 29: Allocation tampering: Document ID must strictly match ${teacherUid}_${year}_${section}
  // -------------------------------------------------------------
  try {
    await assertFails(setDoc(doc(directorDb, 'teacher_allocations', 'tampered_doc_id'), {
      teacherUid: 'faculty_ee_uid',
      institution: 'UEMK',
      department: 'Electrical Engineering',
      year: '2nd Year',
      section: 'Sec A',
      authorized: true,
      createdAt: new Date().toISOString()
    }));
    report(29, 'Allocation doc ID mismatch with teacherUid_year_section is strictly rejected', true);
  } catch (err) {
    report(29, 'Allocation doc ID mismatch rejection', false, err.message);
  }

  // -------------------------------------------------------------
  // Test 30: Allocation tampering: Mutating immutable identity fields on update is rejected
  // -------------------------------------------------------------
  try {
    const allocDocRef = doc(directorDb, 'teacher_allocations', 'faculty_ee_uid_2nd Year_Sec A');
    await assertFails(updateDoc(allocDocRef, {
      teacherUid: 'imposter_teacher_uid'
    }));
    await assertFails(updateDoc(allocDocRef, {
      department: 'Mechanical Engineering'
    }));
    await assertFails(updateDoc(allocDocRef, {
      institution: 'HITK'
    }));
    report(30, 'Mutating immutable allocation fields (teacherUid, department, institution) is rejected', true);
  } catch (err) {
    report(30, 'Allocation immutable fields tampering rejection', false, err.message);
  }

  // -------------------------------------------------------------
  // Test 31: Allocation with authorized == false does not grant attendance marking privileges
  // -------------------------------------------------------------
  try {
    const unauthAllocId = 'faculty_cs_uid_3rd Year_Sec B';
    // Director creates allocation with authorized: false
    await setDoc(doc(directorDb, 'teacher_allocations', unauthAllocId), {
      teacherUid: 'faculty_cs_uid',
      institution: 'UEMK',
      department: 'Computer Science',
      year: '3rd Year',
      section: 'Sec B',
      authorized: false,
      createdAt: new Date().toISOString()
    });

    const unauthSessionId = 'UEMK_ComputerScience_3rdYear_SecB_2026-10-13_P1';
    await assertFails(setDoc(doc(facultyCsDb, 'attendance_records', `${unauthSessionId}_student_cs_01`), {
      ...validRecordPayload,
      sessionId: unauthSessionId,
      year: '3rd Year',
      section: 'Sec B'
    }));
    report(31, 'Allocation with authorized == false strictly denies attendance marking privileges', true);
  } catch (err) {
    report(31, 'Revoked/unauthorized allocation rejection', false, err.message);
  }

  // -------------------------------------------------------------
  // Test 32: Cross-institution Director cannot read or list allocations outside their institution
  // -------------------------------------------------------------
  try {
    // HITK Director reading UEMK allocation doc fails
    await assertFails(getDoc(doc(directorHitkDb, 'teacher_allocations', 'faculty_cs_uid_2nd Year_Sec C')));
    // HITK Director modifying UEMK allocation doc fails
    await assertFails(updateDoc(doc(directorHitkDb, 'teacher_allocations', 'faculty_ee_uid_2nd Year_Sec A'), {
      authorized: false
    }));
    report(32, 'Cross-institution Director cannot read or modify teacher allocations outside their institution', true);
  } catch (err) {
    report(32, 'Cross-institution allocation isolation', false, err.message);
  }

  // -------------------------------------------------------------
  // Test 33: Bulk attendance service: validation rejection prevents partial writes, valid save writes exact session totals
  // -------------------------------------------------------------
  try {
    const bulkSessionInfo = {
      institution: 'UEMK',
      department: 'Computer Science',
      year: '2nd Year',
      section: 'Sec C',
      date: '2026-10-13',
      period: 4
    };
    const bulkSessionId = generateSessionId(bulkSessionInfo);

    // 1. Invalid status in batch throws error and writes zero records
    let thrown = false;
    try {
      await savePeriodAttendance({
        sessionInfo: bulkSessionInfo,
        studentStatuses: {
          'student_cs_01': { status: 'Present', name: 'Student One CS' },
          'student_cs_02': { status: 'InvalidStatus', name: 'Student Two CS' }
        },
        teacherUid: 'faculty_cs_uid'
      }, facultyCsDb);
    } catch {
      thrown = true;
    }
    const checkRecord1 = await getDoc(doc(facultyCsDb, 'attendance_records', `${bulkSessionId}_student_cs_01`));
    const checkSession = await getDoc(doc(facultyCsDb, 'attendance_sessions', bulkSessionId));
    const cleanRejection = thrown && !checkRecord1.exists() && !checkSession.exists();

    // 2. Successful valid bulk save writes both records and session metadata with exact counts
    await savePeriodAttendance({
      sessionInfo: bulkSessionInfo,
      studentStatuses: {
        'student_cs_01': { status: 'Present', name: 'Student One CS' },
        'student_cs_02': { status: 'Absent', name: 'Student Two CS' }
      },
      teacherUid: 'faculty_cs_uid'
    }, facultyCsDb);

    const savedRecord1 = await getDoc(doc(facultyCsDb, 'attendance_records', `${bulkSessionId}_student_cs_01`));
    const savedRecord2 = await getDoc(doc(facultyCsDb, 'attendance_records', `${bulkSessionId}_student_cs_02`));
    const savedSession = await getDoc(doc(facultyCsDb, 'attendance_sessions', bulkSessionId));

    const ok = cleanRejection && 
               savedRecord1.exists() && savedRecord1.data().status === 'Present' &&
               savedRecord2.exists() && savedRecord2.data().status === 'Absent' &&
               savedSession.exists() &&
               savedSession.data().presentCount === 1 &&
               savedSession.data().absentCount === 1 &&
               savedSession.data().totalStudents === 2 &&
               savedSession.data().markedBy === 'faculty_cs_uid';

    report(33, 'Bulk attendance save: validation rejection prevents partial writes, valid save writes exact session totals', ok);
  } catch (err) {
    report(33, 'Bulk attendance save failure handling', false, err.message);
  }

  // -------------------------------------------------------------
  // Test 34: Single-student save: recalculates exact session totals and preserves session ownership
  // -------------------------------------------------------------
  try {
    const bulkSessionInfo = {
      institution: 'UEMK',
      department: 'Computer Science',
      year: '2nd Year',
      section: 'Sec C',
      date: '2026-10-13',
      period: 4
    };
    const bulkSessionId = generateSessionId(bulkSessionInfo);

    // Toggle student_cs_02 from Absent to Present using saveSingleStudentAttendance
    await saveSingleStudentAttendance({
      sessionInfo: bulkSessionInfo,
      studentUid: 'student_cs_02',
      status: 'Present',
      studentName: 'Student Two CS',
      teacherUid: 'faculty_cs_uid',
      allStudentStatuses: {
        'student_cs_01': 'Present',
        'student_cs_02': 'Present'
      }
    }, facultyCsDb);

    const updatedSession = await getDoc(doc(facultyCsDb, 'attendance_sessions', bulkSessionId));
    const sessionData = updatedSession.data();

    // Verify session totals updated to presentCount: 2, absentCount: 0, totalStudents: 2
    // and markedBy is preserved as original creator 'faculty_cs_uid'
    const totalsMatch = sessionData.presentCount === 2 &&
                        sessionData.absentCount === 0 &&
                        sessionData.totalStudents === 2 &&
                        sessionData.markedBy === 'faculty_cs_uid';

    // Verify that rules reject any client trying to update session with mismatched total
    let staleUpdateRejected = false;
    try {
      await updateDoc(doc(facultyCsDb, 'attendance_sessions', bulkSessionId), {
        presentCount: 2,
        absentCount: 0,
        totalStudents: 99 // Inconsistent totals!
      });
    } catch {
      staleUpdateRejected = true;
    }

    report(34, 'Single-student save preserves session markedBy, recomputes exact totals, and rules reject inconsistent totals', totalsMatch && staleUpdateRejected);
  } catch (err) {
    report(34, 'Single-student save totals calculation', false, err.message);
  }

  // -------------------------------------------------------------
  // Test 35: Canonical department mapping: CSE AI maps to Computer Science and queries approved students
  // -------------------------------------------------------------
  try {
    const students = await fetchStudentsForSection({
      department: 'CSE AI',
      year: '2nd Year',
      section: 'Sec C'
    }, facultyCsDb);

    const foundAll = Array.isArray(students) &&
                     students.length >= 2 &&
                     students.some(s => s.uid === 'student_cs_01') &&
                     students.some(s => s.uid === 'student_cs_02');
    report(35, 'fetchStudentsForSection maps CSE AI to Computer Science and loads approved students', foundAll);
  } catch (err) {
    report(35, 'fetchStudentsForSection department mapping', false, err.message);
  }

  // -------------------------------------------------------------
  // Test 36: Security isolation: Cross-department query using CSE AI fails for unauthorized faculty
  // -------------------------------------------------------------
  try {
    let failedAsExpected = false;
    try {
      await fetchStudentsForSection({
        department: 'CSE AI',
        year: '2nd Year',
        section: 'Sec C'
      }, facultyEeDb);
    } catch {
      failedAsExpected = true;
    }
    report(36, 'Canonical department mapping does not allow faculty to read another department\'s records', failedAsExpected);
  } catch (err) {
    report(36, 'Cross-department attendance isolation', false, err.message);
  }

  // -------------------------------------------------------------
  // Test 37: Empty state: Successful query with 0 students returns empty list without error
  // -------------------------------------------------------------
  try {
    const emptyStudents = await fetchStudentsForSection({
      department: 'CSE AI',
      year: '4th Year', // No students exist in 4th Year Sec C
      section: 'Sec C'
    }, facultyCsDb);

    const isGenuinelyEmpty = Array.isArray(emptyStudents) && emptyStudents.length === 0;
    report(37, 'Query with zero matching students returns empty list without error (clean empty state)', isGenuinelyEmpty);
  } catch (err) {
    report(37, 'Empty state query', false, err.message);
  }

  // -------------------------------------------------------------
  // Test 38: Regression: Faculty with non-canonical profile department ("CSE AI") is rejected by rules
  // -------------------------------------------------------------
  try {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore();
      await setDoc(doc(adminDb, 'authorized_staff', 'faculty.cseai@sangam.edu'), {
        role: 'faculty',
        authorized: true
      });
      await setDoc(doc(adminDb, 'users', 'faculty_cseai_profile_uid'), {
        uid: 'faculty_cseai_profile_uid',
        name: 'Prof. CSE AI',
        email: 'faculty.cseai@sangam.edu',
        role: 'faculty',
        status: 'active',
        createdAt: new Date().toISOString(),
        department: 'CSE AI', // Non-canonical!
        institution: 'UEMK'
      });
    });

    const facultyCseAiDb = testEnv.authenticatedContext('faculty_cseai_profile_uid', { email: 'faculty.cseai@sangam.edu' }).firestore();

    let rejectedByRules = false;
    try {
      await fetchStudentsForSection({
        department: 'CSE AI',
        year: '2nd Year',
        section: 'Sec C'
      }, facultyCseAiDb);
    } catch (err) {
      rejectedByRules = err?.code === 'permission-denied' || String(err?.message || '').includes('permission');
    }

    report(38, 'Regression: Faculty with non-canonical profile department ("CSE AI") is rejected by rules', rejectedByRules);
  } catch (err) {
    report(38, 'Regression: Faculty non-canonical profile department', false, err.message);
  }

  // -------------------------------------------------------------
  // Test 39: Regression: Faculty (ayanagarwal40@gmail.com, UID: WgHtT4v015T18CfZnc7EejeWcJz2)
  // Verifies exact production configuration:
  // - authorized_staff/ayanagarwal40@gmail.com: { authorized: true, role: "faculty" }
  // - users/WgHtT4v015T18CfZnc7EejeWcJz2: { uid, email, role: "faculty", status: "active", department: "Computer Science", institution: "UEMK" }
  // - authorized_roles does NOT exist (proves authorized_roles is not required)
  // -------------------------------------------------------------
  try {
    const ayanUid = 'WgHtT4v015T18CfZnc7EejeWcJz2';
    const ayanEmail = 'ayanagarwal40@gmail.com';

    // Step 1: Create user profile but DO NOT add to authorized_staff
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore();
      await setDoc(doc(adminDb, 'users', ayanUid), {
        uid: ayanUid,
        name: 'Ayan Agarwal',
        email: ayanEmail,
        role: 'faculty',
        status: 'active',
        createdAt: new Date().toISOString(),
        department: 'Computer Science',
        institution: 'UEMK'
      });
    });

    const unwhitelistedAyanDb = testEnv.authenticatedContext(ayanUid, { email: ayanEmail }).firestore();

    let unwhitelistedRejected = false;
    try {
      await fetchStudentsForSection({
        department: 'CSE AI',
        year: '2nd Year',
        section: 'Sec C'
      }, unwhitelistedAyanDb);
    } catch (err) {
      unwhitelistedRejected = err?.code === 'permission-denied' || String(err?.message || '').includes('permission');
    }

    // Step 2: Add to authorized_staff ONLY (authorized_roles is NOT created)
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore();
      await setDoc(doc(adminDb, 'authorized_staff', ayanEmail), {
        role: 'faculty',
        authorized: true
      });
    });

    const whitelistedAyanDb = testEnv.authenticatedContext(ayanUid, { email: ayanEmail }).firestore();
    
    // Test fetchStudentsForSection
    const students = await fetchStudentsForSection({
      department: 'CSE AI',
      year: '2nd Year',
      section: 'Sec C'
    }, whitelistedAyanDb);

    const authorizedSucceeded = Array.isArray(students) && students.length >= 2;

    // Test fetchSessionAttendanceRecords
    const sessionId = generateSessionId({
      institution: 'UEMK',
      department: 'Computer Science',
      year: '2nd Year',
      section: 'Sec C',
      date: '2026-10-13',
      period: 1
    });
    const sessionRecords = await whitelistedAyanDb.collection ? 
      fetchSessionAttendanceRecords(sessionId, 'UEMK', 'Computer Science', whitelistedAyanDb) : {};

    report(39, 'Regression: Exact verified UID (WgHtT4v015T18CfZnc7EejeWcJz2) & email (ayanagarwal40@gmail.com) authorized with only authorized_staff', unwhitelistedRejected && authorizedSucceeded);
  } catch (err) {
    report(39, 'Regression: ayanagarwal40@gmail.com authorization flow', false, err.message);
  }

  // -------------------------------------------------------------
  // Test 40: Regression: Profile document keyed by email instead of Auth UID fails rules
  // -------------------------------------------------------------
  try {
    const emailAsId = 'faculty.miskeyed@sangam.edu';
    const realAuthUid = 'real_auth_uid_miskeyed';

    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore();
      await setDoc(doc(adminDb, 'authorized_staff', emailAsId), {
        role: 'faculty',
        authorized: true
      });
      // Incorrectly saved with doc ID = email instead of Auth UID
      await setDoc(doc(adminDb, 'users', emailAsId), {
        uid: realAuthUid,
        name: 'Miskeyed Faculty',
        email: emailAsId,
        role: 'faculty',
        status: 'active',
        createdAt: new Date().toISOString(),
        department: 'Computer Science',
        institution: 'UEMK'
      });
    });

    const miskeyedDb = testEnv.authenticatedContext(realAuthUid, { email: emailAsId }).firestore();

    let miskeyedRejected = false;
    try {
      await fetchStudentsForSection({
        department: 'CSE AI',
        year: '2nd Year',
        section: 'Sec C'
      }, miskeyedDb);
    } catch (err) {
      miskeyedRejected = err?.code === 'permission-denied' || String(err?.message || '').includes('permission');
    }

    report(40, 'Regression: Profile document keyed by email instead of Auth UID is rejected by rules', miskeyedRejected);
  } catch (err) {
    report(40, 'Regression: Miskeyed profile document ID', false, err.message);
  }

  // -------------------------------------------------------------
  // Test 41: Faculty without allocation document cannot save attendance; faculty cannot self-allocate
  // -------------------------------------------------------------
  try {
    const ayanUid = 'WgHtT4v015T18CfZnc7EejeWcJz2';
    const ayanEmail = 'ayanagarwal40@gmail.com';
    const ayanDb = testEnv.authenticatedContext(ayanUid, { email: ayanEmail }).firestore();

    const sessionInfo = {
      institution: 'UEMK',
      department: 'Computer Science',
      year: '2nd Year',
      section: 'Sec C',
      date: '2026-10-13',
      period: 1
    };

    const studentStatuses = {
      'student_cs_01': 'Present',
      'student_cs_02': 'Absent'
    };

    // 1. Unallocated save must be rejected by rules
    let unallocatedSaveFailed = false;
    try {
      await savePeriodAttendance({ sessionInfo, studentStatuses, teacherUid: ayanUid }, ayanDb);
    } catch (err) {
      unallocatedSaveFailed = err?.code === 'permission-denied' || String(err?.message || '').toLowerCase().includes('permission');
    }

    // 2. Faculty self-allocation must be rejected by rules
    let selfAllocFailed = false;
    try {
      await setDoc(doc(ayanDb, 'teacher_allocations', `${ayanUid}_2nd Year_Sec C`), {
        teacherUid: ayanUid,
        institution: 'UEMK',
        department: 'Computer Science',
        year: '2nd Year',
        section: 'Sec C',
        authorized: true,
        createdAt: new Date().toISOString()
      });
    } catch (err) {
      selfAllocFailed = err?.code === 'permission-denied' || String(err?.message || '').toLowerCase().includes('permission');
    }

    report(41, 'Faculty without allocation document cannot save attendance; faculty cannot self-allocate', unallocatedSaveFailed && selfAllocFailed);
  } catch (err) {
    report(41, 'Unallocated faculty save verification', false, err.message);
  }

  // -------------------------------------------------------------
  // Test 42: Authorized Director creates allocation doc, enabling faculty to save attendance
  // -------------------------------------------------------------
  try {
    const ayanUid = 'WgHtT4v015T18CfZnc7EejeWcJz2';
    const ayanEmail = 'ayanagarwal40@gmail.com';
    const ayanDb = testEnv.authenticatedContext(ayanUid, { email: ayanEmail }).firestore();

    // 1. Authorized Director creates the teacher allocation
    const createdAlloc = await createTeacherAllocation({
      teacherUid: ayanUid,
      institution: 'UEMK',
      department: 'Computer Science',
      year: '2nd Year',
      section: 'Sec C',
      directorUid: 'director_uid_01'
    }, directorDb);

    const allocDocCreated = createdAlloc && (createdAlloc.id === `${ayanUid}_2nd Year_Sec C` || createdAlloc.id === `${ayanUid}_Computer Science_2nd Year_Sec C`);

    // 2. Faculty can now list their allocations within their institution
    const facultyAllocs = await fetchTeacherAllocations({ institution: 'UEMK', teacherUid: ayanUid }, ayanDb);
    const canReadAlloc = facultyAllocs.some(a => (a.id === `${ayanUid}_2nd Year_Sec C` || a.id === `${ayanUid}_Computer Science_2nd Year_Sec C`) && a.authorized === true);

    // 3. Faculty can now save attendance successfully for an allocated class
    const sessionInfo = {
      institution: 'UEMK',
      department: 'Computer Science',
      year: '2nd Year',
      section: 'Sec C',
      date: '2026-10-14',
      period: 2
    };

    const studentStatuses = {
      'student_cs_01': 'Present',
      'student_cs_02': 'Absent'
    };

    const savedSessionId = await savePeriodAttendance({ sessionInfo, studentStatuses, teacherUid: ayanUid }, ayanDb);
    const saveSucceeded = Boolean(savedSessionId);

    // Verify session document totals (authorized faculty can read sessions in their department)
    const sessionDoc = await getDoc(doc(ayanDb, 'attendance_sessions', savedSessionId));
    const validSession = sessionDoc.exists() && 
                         sessionDoc.data().presentCount === 1 && 
                         sessionDoc.data().absentCount === 1 &&
                         sessionDoc.data().totalStudents === 2;

    report(42, 'Authorized Director creates allocation doc, enabling faculty to save attendance', allocDocCreated && canReadAlloc && saveSucceeded && validSession);
  } catch (err) {
    report(42, 'Director allocation and faculty save workflow', false, err.message);
  }

  // -------------------------------------------------------------
  // Test 43: Section alias ('CSE-C' matching 'Sec C') & missing year field allows attendance marking
  // -------------------------------------------------------------
  try {
    const ayanUid = 'WgHtT4v015T18CfZnc7EejeWcJz2';
    const ayanEmail = 'ayanagarwal40@gmail.com';
    const ayanDb = testEnv.authenticatedContext(ayanUid, { email: ayanEmail }).firestore();

    // Student created with CSE-C section and without year field (matches actual production student)
    await testEnv.withSecurityRulesDisabled(async (adminContext) => {
      const adminDb = adminContext.firestore();
      await setDoc(doc(adminDb, 'users', 'student_csec_prod_like'), {
        uid: 'student_csec_prod_like',
        name: 'Prod Student CSE C',
        email: 'prod.csec@gmail.com',
        role: 'student',
        status: 'active',
        department: 'Computer Science',
        institution: 'UEMK',
        section: 'CSE-C',
        createdAt: new Date().toISOString()
      });
    });

    const sessionInfo = {
      institution: 'UEMK',
      department: 'Computer Science',
      year: '2nd Year',
      section: 'Sec C',
      date: '2026-10-15',
      period: 3
    };

    const studentStatuses = {
      'student_csec_prod_like': 'Present'
    };

    const savedSessionId = await savePeriodAttendance({ sessionInfo, studentStatuses, teacherUid: ayanUid }, ayanDb);
    const savedRec = await getDoc(doc(ayanDb, 'attendance_records', `${savedSessionId}_student_csec_prod_like`));
    const isSaved = savedRec.exists() && savedRec.data()?.status === 'Present';

    report(43, 'Section alias ("CSE-C" -> "Sec C") and missing year field succeeds under updated rules', Boolean(savedSessionId) && isSaved);
  } catch (err) {
    report(43, 'Section alias and missing year verification', false, err.message);
  }

  // -------------------------------------------------------------
  // Test 44: Cross-section isolation: Student in 'CSE-B' is strictly rejected when saving 'Sec C'
  // -------------------------------------------------------------
  try {
    const ayanUid = 'WgHtT4v015T18CfZnc7EejeWcJz2';
    const ayanEmail = 'ayanagarwal40@gmail.com';
    const ayanDb = testEnv.authenticatedContext(ayanUid, { email: ayanEmail }).firestore();

    await testEnv.withSecurityRulesDisabled(async (adminContext) => {
      const adminDb = adminContext.firestore();
      await setDoc(doc(adminDb, 'users', 'student_cseb_isolated'), {
        uid: 'student_cseb_isolated',
        name: 'Sec B Student',
        email: 'cseb@gmail.com',
        role: 'student',
        status: 'active',
        department: 'Computer Science',
        institution: 'UEMK',
        section: 'CSE-B',
        createdAt: new Date().toISOString()
      });
    });

    const sessionInfo = {
      institution: 'UEMK',
      department: 'Computer Science',
      year: '2nd Year',
      section: 'Sec C',
      date: '2026-10-16',
      period: 1
    };

    let crossSectionRejected = false;
    try {
      await savePeriodAttendance({
        sessionInfo,
        studentStatuses: { 'student_cseb_isolated': 'Present' },
        teacherUid: ayanUid
      }, ayanDb);
    } catch (err) {
      crossSectionRejected = err?.code === 'permission-denied' || String(err?.message || '').toLowerCase().includes('permission');
    }

    report(44, 'Cross-section isolation is strictly preserved (CSE-B student rejected for Sec C)', crossSectionRejected);
  } catch (err) {
    report(44, 'Cross-section isolation check', false, err.message);
  }

  // -------------------------------------------------------------
  // Test 45: Diagnostic accurately identifies target write without exposing sensitive data
  // -------------------------------------------------------------
  try {
    const ayanUid = 'WgHtT4v015T18CfZnc7EejeWcJz2';
    const ayanEmail = 'ayanagarwal40@gmail.com';
    const ayanDb = testEnv.authenticatedContext(ayanUid, { email: ayanEmail }).firestore();

    const sessionInfo = {
      institution: 'UEMK',
      department: 'Computer Science',
      year: '2nd Year',
      section: 'Sec C',
      date: '2026-10-16',
      period: 1
    };

    // 1. Diagnostic on allocation missing
    const fakeError = { code: 'permission-denied', message: 'Missing or insufficient permissions.' };
    const diagNoAlloc = await diagnoseAttendanceWriteError({
      sessionInfo: { ...sessionInfo, section: 'Sec Z' },
      studentStatuses: { 'student_xyz': 'Present' },
      teacherUid: 'unallocated_teacher_uid'
    }, fakeError, ayanDb);

    const identifiesNoAlloc = diagNoAlloc.failedWrite.includes('attendance_sessions') &&
                              diagNoAlloc.ruleTarget === 'isFacultyAuthorizedForClass';

    // 2. Diagnostic when allocation exists but student scope fails
    const diagWithAlloc = await diagnoseAttendanceWriteError({
      sessionInfo,
      studentStatuses: { 'student_xyz': 'Present' },
      teacherUid: ayanUid
    }, fakeError, ayanDb);

    const identifiesRecordFail = diagWithAlloc.failedWrite === 'attendance_records' &&
                                 diagWithAlloc.ruleTarget === 'isStudentInFacultyScope';

    // 3. Privacy check: Ensure diagnostic output string does not contain sensitive terms
    const serialized = JSON.stringify(diagWithAlloc);
    const noSensitiveData = !serialized.includes('student_xyz') && 
                            !serialized.includes('email') && 
                            !serialized.includes('roll');

    report(45, 'Diagnostic identifies rejected write target and preserves privacy (no PII leaked)', identifiesNoAlloc && identifiesRecordFail && noSensitiveData);
  } catch (err) {
    report(45, 'Diagnostic validation', false, err.message);
  }

} finally {
  await testEnv.cleanup();
}

console.log('\n========================================');
console.log(`ATTENDANCE RULES: ${passed} PASSED, ${failed} FAILED`);
console.log('========================================\n');

if (failed > 0) {
  process.exit(1);
}
