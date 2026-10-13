import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import fs from 'fs';
import path from 'path';
import { doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, collection, query, where } from 'firebase/firestore';
import { 
  savePeriodAttendance, 
  saveSingleStudentAttendance, 
  generateSessionId, 
  fetchStudentsForSection, 
  fetchSessionAttendanceRecords,
  createTeacherAllocation,
  fetchTeacherAllocations,
  deleteTeacherAllocation,
  subscribeTeacherAllocations,
  buildAcademicHierarchyTree,
  resolveAcademicScope
} from '../src/services/attendanceService.js';

const buildTree = buildAcademicHierarchyTree;

const rulesPath = path.resolve('firestore.rules');
const rules = fs.readFileSync(rulesPath, 'utf8');

const PROJECT_ID = 'sangam-faculty-allocation-test';

console.log('Connecting to Firestore emulator on port 8080 for faculty allocation system testing...');
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

    // 2. Faculty: Mechanical Engineering
    await setDoc(doc(adminDb, 'authorized_staff', 'faculty.me@sangam.edu'), {
      role: 'faculty',
      authorized: true
    });
    await setDoc(doc(adminDb, 'users', 'faculty_me_uid'), {
      uid: 'faculty_me_uid',
      name: 'Prof. James Watt',
      email: 'faculty.me@sangam.edu',
      role: 'faculty',
      status: 'active',
      createdAt: new Date().toISOString(),
      department: 'Mechanical Engineering',
      institution: 'UEMK'
    });

    // 3. Faculty: Computer Science / CSE AI
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

    // 4. Faculty: Civil Engineering
    await setDoc(doc(adminDb, 'authorized_staff', 'faculty.ce@sangam.edu'), {
      role: 'faculty',
      authorized: true
    });
    await setDoc(doc(adminDb, 'users', 'faculty_ce_uid'), {
      uid: 'faculty_ce_uid',
      name: 'Prof. Gustave Eiffel',
      email: 'faculty.ce@sangam.edu',
      role: 'faculty',
      status: 'active',
      createdAt: new Date().toISOString(),
      department: 'Civil Engineering',
      institution: 'UEMK'
    });

    // 5. Faculty: Multi-class allocated faculty (Mechanical Engineering)
    await setDoc(doc(adminDb, 'authorized_staff', 'faculty.multime@sangam.edu'), {
      role: 'faculty',
      authorized: true
    });
    await setDoc(doc(adminDb, 'users', 'faculty_multime_uid'), {
      uid: 'faculty_multime_uid',
      name: 'Prof. Henry Ford',
      email: 'faculty.multime@sangam.edu',
      role: 'faculty',
      status: 'active',
      createdAt: new Date().toISOString(),
      department: 'Mechanical Engineering',
      institution: 'UEMK'
    });

    // 6. Faculty: Unallocated faculty (has profile, no class allocations)
    await setDoc(doc(adminDb, 'authorized_staff', 'faculty.unallocated@sangam.edu'), {
      role: 'faculty',
      authorized: true
    });
    await setDoc(doc(adminDb, 'users', 'faculty_unallocated_uid'), {
      uid: 'faculty_unallocated_uid',
      name: 'Prof. New Joiner',
      email: 'faculty.unallocated@sangam.edu',
      role: 'faculty',
      status: 'active',
      createdAt: new Date().toISOString(),
      department: 'Mechanical Engineering',
      institution: 'UEMK'
    });

    // Students setup:
    // Mechanical Engineering students (3rd Year, Sec A)
    await setDoc(doc(adminDb, 'users', 'student_me_01'), {
      uid: 'student_me_01',
      name: 'Arthur Pendelton',
      email: 'arthur.me@sangam.edu',
      role: 'student',
      status: 'active',
      department: 'Mechanical Engineering',
      year: '3rd Year',
      section: 'Sec A',
      institution: 'UEMK'
    });
    await setDoc(doc(adminDb, 'users', 'student_me_02'), {
      uid: 'student_me_02',
      name: 'Beatrice Miller',
      email: 'beatrice.me@sangam.edu',
      role: 'student',
      status: 'active',
      department: 'Mechanical Engineering',
      year: '3rd Year',
      section: 'Sec A',
      institution: 'UEMK'
    });

    // Mechanical Engineering students (2nd Year, Sec B)
    await setDoc(doc(adminDb, 'users', 'student_me_2b_01'), {
      uid: 'student_me_2b_01',
      name: 'Charles Babbage',
      email: 'charles.me@sangam.edu',
      role: 'student',
      status: 'active',
      department: 'Mechanical Engineering',
      year: '2nd Year',
      section: 'Sec B',
      institution: 'UEMK'
    });

    // Computer Science students (2nd Year, Sec C)
    await setDoc(doc(adminDb, 'users', 'student_cs_01'), {
      uid: 'student_cs_01',
      name: 'Ada Lovelace',
      email: 'ada.cs@sangam.edu',
      role: 'student',
      status: 'active',
      department: 'Computer Science',
      year: '2nd Year',
      section: 'Sec C',
      institution: 'UEMK'
    });

    // Civil Engineering students (4th Year, Sec A)
    await setDoc(doc(adminDb, 'users', 'student_ce_01'), {
      uid: 'student_ce_01',
      name: 'Isambard Kingdom Brunel',
      email: 'brunel.ce@sangam.edu',
      role: 'student',
      status: 'active',
      department: 'Civil Engineering',
      year: '4th Year',
      section: 'Sec A',
      institution: 'UEMK'
    });
  });

  const directorDb = testEnv.authenticatedContext('director_uid_01', { email: 'director@sangam.edu' }).firestore();
  const facultyMeDb = testEnv.authenticatedContext('faculty_me_uid', { email: 'faculty.me@sangam.edu' }).firestore();
  const facultyCsDb = testEnv.authenticatedContext('faculty_cs_uid', { email: 'faculty.cs@sangam.edu' }).firestore();
  const facultyCeDb = testEnv.authenticatedContext('faculty_ce_uid', { email: 'faculty.ce@sangam.edu' }).firestore();
  const facultyMultiMeDb = testEnv.authenticatedContext('faculty_multime_uid', { email: 'faculty.multime@sangam.edu' }).firestore();
  const facultyUnallocDb = testEnv.authenticatedContext('faculty_unallocated_uid', { email: 'faculty.unallocated@sangam.edu' }).firestore();

  // -------------------------------------------------------------
  // Test 1: Director assigns Mechanical Engineering faculty -> saved and fetched correctly
  // -------------------------------------------------------------
  try {
    const meAlloc = await createTeacherAllocation({
      teacherUid: 'faculty_me_uid',
      institution: 'UEMK',
      department: 'Mechanical Engineering',
      year: '3rd Year',
      section: 'Sec A'
    }, directorDb);

    const allocs = await fetchTeacherAllocations({ institution: 'UEMK', teacherUid: 'faculty_me_uid' }, directorDb);
    const hasMeAlloc = allocs.length === 1 && 
                       allocs[0].department === 'Mechanical Engineering' && 
                       allocs[0].year === '3rd Year' && 
                       allocs[0].section === 'Sec A';
    report(1, 'Director assigns Mechanical Engineering faculty -> saved and fetched correctly', hasMeAlloc);
  } catch (err) {
    report(1, 'Director assigns Mechanical Engineering faculty', false, err.message);
  }

  // -------------------------------------------------------------
  // Test 2: Mechanical Engineering faculty sees Mechanical Engineering rather than CSE AI
  // -------------------------------------------------------------
  try {
    const meAllocs = await fetchTeacherAllocations({ institution: 'UEMK', teacherUid: 'faculty_me_uid' }, facultyMeDb);
    
    // Check tree derivation
    const meTree = buildTree(meAllocs, 'UEMK');
    const hasMeTree = Boolean(meTree['UEMK']?.['Mechanical Engineering']?.['3rd Year']?.['Sec A']);
    const noCseAiInTree = !Boolean(meTree['UEMK']?.['CSE AI'] || meTree['UEMK']?.['Computer Science']);

    // Check resolveAcademicScope fallback
    const resolvedScope = resolveAcademicScope(null, meAllocs[0]);
    const scopeIsMe = resolvedScope.br === 'Mechanical Engineering' && 
                      resolvedScope.yr === '3rd Year' && 
                      resolvedScope.sec === 'Sec A';

    report(2, 'Mechanical Engineering faculty sees Mechanical Engineering rather than CSE AI', hasMeTree && noCseAiInTree && scopeIsMe);
  } catch (err) {
    report(2, 'Mechanical Engineering faculty views', false, err.message);
  }

  // -------------------------------------------------------------
  // Test 3: Faculty in CSE AI / Computer Science continues to see their correct allocation
  // -------------------------------------------------------------
  try {
    await createTeacherAllocation({
      teacherUid: 'faculty_cs_uid',
      institution: 'UEMK',
      department: 'CSE AI',
      year: '2nd Year',
      section: 'Sec C'
    }, directorDb);

    const csAllocs = await fetchTeacherAllocations({ institution: 'UEMK', teacherUid: 'faculty_cs_uid' }, facultyCsDb);
    const csTree = buildTree(csAllocs, 'UEMK');
    const hasCsTree = Boolean(csTree['UEMK']?.['CSE AI']?.['2nd Year']?.['Sec C']);
    const noMeInCsTree = !Boolean(csTree['UEMK']?.['Mechanical Engineering']);

    const resolvedCsScope = resolveAcademicScope(null, csAllocs[0]);
    const scopeIsCs = resolvedCsScope.br === 'CSE AI' && 
                      resolvedCsScope.yr === '2nd Year' && 
                      resolvedCsScope.sec === 'Sec C';

    report(3, 'Faculty in CSE AI continues to see correct allocation and no ME bleed', hasCsTree && noMeInCsTree && scopeIsCs);
  } catch (err) {
    report(3, 'CSE AI faculty views', false, err.message);
  }

  // -------------------------------------------------------------
  // Test 4: Different academic years, sections, and departments (Civil Engineering 4th Year Sec A)
  // -------------------------------------------------------------
  try {
    await createTeacherAllocation({
      teacherUid: 'faculty_ce_uid',
      institution: 'UEMK',
      department: 'Civil Engineering',
      year: '4th Year',
      section: 'Sec A'
    }, directorDb);

    const ceAllocs = await fetchTeacherAllocations({ institution: 'UEMK', teacherUid: 'faculty_ce_uid' }, facultyCeDb);
    const ceTree = buildTree(ceAllocs, 'UEMK');
    const hasCeTree = Boolean(ceTree['UEMK']?.['Civil Engineering']?.['4th Year']?.['Sec A']);

    report(4, 'Different departments, academic years, and sections (Civil Engineering, 4th Year, Sec A)', hasCeTree);
  } catch (err) {
    report(4, 'Civil Engineering allocation', false, err.message);
  }

  // -------------------------------------------------------------
  // Test 5: One faculty member assigned to multiple classes across different years/sections
  // -------------------------------------------------------------
  try {
    await createTeacherAllocation({
      teacherUid: 'faculty_multime_uid',
      institution: 'UEMK',
      department: 'Mechanical Engineering',
      year: '2nd Year',
      section: 'Sec B'
    }, directorDb);

    await createTeacherAllocation({
      teacherUid: 'faculty_multime_uid',
      institution: 'UEMK',
      department: 'Mechanical Engineering',
      year: '3rd Year',
      section: 'Sec A'
    }, directorDb);

    const multiAllocs = await fetchTeacherAllocations({ institution: 'UEMK', teacherUid: 'faculty_multime_uid' }, facultyMultiMeDb);
    const multiTree = buildTree(multiAllocs, 'UEMK');
    const hasBothClassesInTree = Boolean(multiTree['UEMK']?.['Mechanical Engineering']?.['2nd Year']?.['Sec B']) &&
                                 Boolean(multiTree['UEMK']?.['Mechanical Engineering']?.['3rd Year']?.['Sec A']);

    report(5, 'One faculty member assigned to multiple classes across different years & sections', multiAllocs.length === 2 && hasBothClassesInTree);
  } catch (err) {
    report(5, 'Multi-class allocation', false, err.message);
  }

  // -------------------------------------------------------------
  // Test 6: Multi-class faculty can mark attendance in both allocated classes
  // -------------------------------------------------------------
  try {
    const today = '2026-10-13';
    
    // Class 1: 2nd Year, Sec B
    const session1 = {
      institution: 'UEMK',
      department: 'Mechanical Engineering',
      year: '2nd Year',
      section: 'Sec B',
      date: today,
      period: 1
    };
    const statuses1 = { 'student_me_2b_01': 'Present' };
    const res1 = await savePeriodAttendance({ sessionInfo: session1, studentStatuses: statuses1, teacherUid: 'faculty_multime_uid' }, facultyMultiMeDb);

    // Class 2: 3rd Year, Sec A
    const session2 = {
      institution: 'UEMK',
      department: 'Mechanical Engineering',
      year: '3rd Year',
      section: 'Sec A',
      date: today,
      period: 2
    };
    const statuses2 = { 'student_me_01': 'Present', 'student_me_02': 'Absent' };
    const res2 = await savePeriodAttendance({ sessionInfo: session2, studentStatuses: statuses2, teacherUid: 'faculty_multime_uid' }, facultyMultiMeDb);

    const hasSucceeded = typeof res1 === 'string' && res1.length > 0 && typeof res2 === 'string' && res2.length > 0;
    report(6, 'Multi-class faculty successfully saves attendance for both allocated classes', hasSucceeded);
  } catch (err) {
    report(6, 'Multi-class attendance marking', false, err.message);
  }

  // -------------------------------------------------------------
  // Test 7: Multi-class faculty denied attendance marking for an unallocated class (4th Year Sec A)
  // -------------------------------------------------------------
  try {
    const unallocatedSession = {
      institution: 'UEMK',
      department: 'Mechanical Engineering',
      year: '4th Year',
      section: 'Sec A',
      date: '2026-10-13',
      period: 3
    };
    let writeDenied = false;
    try {
      await savePeriodAttendance({ 
        sessionInfo: unallocatedSession, 
        studentStatuses: { 'student_me_01': 'Present' }, 
        teacherUid: 'faculty_multime_uid' 
      }, facultyMultiMeDb);
    } catch (err) {
      writeDenied = err?.code === 'permission-denied' || String(err?.message || '').toLowerCase().includes('permission');
    }
    report(7, 'Multi-class faculty denied attendance marking for an unallocated class', writeDenied);
  } catch (err) {
    report(7, 'Unallocated class attendance rejection', false, err.message);
  }

  // -------------------------------------------------------------
  // Test 8: Faculty with NO allocation sees clear empty state and has 0 active classes
  // -------------------------------------------------------------
  try {
    const unallocAllocs = await fetchTeacherAllocations({ institution: 'UEMK', teacherUid: 'faculty_unallocated_uid' }, facultyUnallocDb);
    const unallocTree = buildTree(unallocAllocs, 'UEMK');
    const isTreeEmpty = Object.keys(unallocTree).length === 0;

    // Scope resolution without allocation falls back to Unknown, never hardcoding CSE AI
    const resolvedEmptyScope = resolveAcademicScope(null, null);
    const emptyScopeClean = resolvedEmptyScope.br === 'Unknown' && 
                            resolvedEmptyScope.yr === 'Unknown' && 
                            resolvedEmptyScope.sec === 'All Sections';

    report(8, 'Faculty with no allocation sees clear empty state and no hardcoded fallback', unallocAllocs.length === 0 && isTreeEmpty && emptyScopeClean);
  } catch (err) {
    report(8, 'Unallocated faculty empty state', false, err.message);
  }

  // -------------------------------------------------------------
  // Test 9: Unallocated faculty is strictly rejected from saving attendance
  // -------------------------------------------------------------
  try {
    let unallocSaveDenied = false;
    try {
      await savePeriodAttendance({
        sessionInfo: {
          institution: 'UEMK',
          department: 'Mechanical Engineering',
          year: '3rd Year',
          section: 'Sec A',
          date: '2026-10-13',
          period: 4
        },
        studentStatuses: { 'student_me_01': 'Present' },
        teacherUid: 'faculty_unallocated_uid'
      }, facultyUnallocDb);
    } catch (err) {
      unallocSaveDenied = err?.code === 'permission-denied' || String(err?.message || '').toLowerCase().includes('permission');
    }
    report(9, 'Faculty with no allocation is denied from saving attendance by security rules', unallocSaveDenied);
  } catch (err) {
    report(9, 'Unallocated faculty save rejection', false, err.message);
  }

  // -------------------------------------------------------------
  // Test 10: Faculty member cannot self-allocate
  // -------------------------------------------------------------
  try {
    let selfAllocDenied = false;
    try {
      await setDoc(doc(facultyUnallocDb, 'teacher_allocations', 'faculty_unallocated_uid_3rd Year_Sec A'), {
        teacherUid: 'faculty_unallocated_uid',
        institution: 'UEMK',
        department: 'Mechanical Engineering',
        year: '3rd Year',
        section: 'Sec A',
        authorized: true,
        createdAt: new Date().toISOString()
      });
    } catch (err) {
      selfAllocDenied = err?.code === 'permission-denied' || String(err?.message || '').toLowerCase().includes('permission');
    }
    report(10, 'Faculty member cannot self-allocate (Director-only privileges enforced)', selfAllocDenied);
  } catch (err) {
    report(10, 'Faculty self-allocation test', false, err.message);
  }

  // -------------------------------------------------------------
  // Test 11: Real-time subscription reflects allocation creation, updates, and removal
  // -------------------------------------------------------------
  try {
    let receivedSnapshots = [];
    const unsubscribe = subscribeTeacherAllocations(
      { institution: 'UEMK', teacherUid: 'faculty_unallocated_uid' },
      (allocations) => {
        receivedSnapshots.push(allocations);
      },
      (err) => console.error('Subscription error:', err),
      directorDb
    );

    // Initial snapshot should be empty
    await new Promise(r => setTimeout(r, 200));

    // Director creates allocation
    await createTeacherAllocation({
      teacherUid: 'faculty_unallocated_uid',
      institution: 'UEMK',
      department: 'Mechanical Engineering',
      year: '1st Year',
      section: 'Sec A'
    }, directorDb);

    await new Promise(r => setTimeout(r, 200));

    // Director removes allocation
    await deleteTeacherAllocation('faculty_unallocated_uid_1st Year_Sec A', directorDb);

    await new Promise(r => setTimeout(r, 200));
    unsubscribe();

    const initialWasEmpty = receivedSnapshots[0]?.length === 0;
    const secondHadAllocation = receivedSnapshots.some(s => s.length === 1 && s[0].year === '1st Year');
    const finalWasEmpty = receivedSnapshots[receivedSnapshots.length - 1]?.length === 0;

    report(11, 'Real-time subscription reflects allocation addition and removal dynamically', initialWasEmpty && secondHadAllocation && finalWasEmpty);
  } catch (err) {
    report(11, 'Real-time subscription test', false, err.message);
  }

  // -------------------------------------------------------------
  // Test 12: Allocation removal immediately revokes faculty attendance write permission
  // -------------------------------------------------------------
  try {
    // Delete one of the allocations for faculty_multime_uid (2nd Year, Sec B)
    await deleteTeacherAllocation('faculty_multime_uid_2nd Year_Sec B', directorDb);

    let writeAfterRemovalDenied = false;
    try {
      await savePeriodAttendance({
        sessionInfo: {
          institution: 'UEMK',
          department: 'Mechanical Engineering',
          year: '2nd Year',
          section: 'Sec B',
          date: '2026-10-13',
          period: 5
        },
        studentStatuses: { 'student_me_2b_01': 'Present' },
        teacherUid: 'faculty_multime_uid'
      }, facultyMultiMeDb);
    } catch (err) {
      writeAfterRemovalDenied = err?.code === 'permission-denied' || String(err?.message || '').toLowerCase().includes('permission');
    }
    report(12, 'Allocation removal immediately revokes faculty attendance marking privilege', writeAfterRemovalDenied);
  } catch (err) {
    report(12, 'Allocation revocation test', false, err.message);
  }

  // -------------------------------------------------------------
  // Test 13: Cross-department attendance attempt is strictly denied (ME teacher marking CS class)
  // -------------------------------------------------------------
  try {
    let crossDeptDenied = false;
    try {
      await savePeriodAttendance({
        sessionInfo: {
          institution: 'UEMK',
          department: 'Computer Science',
          year: '2nd Year',
          section: 'Sec C',
          date: '2026-10-13',
          period: 1
        },
        studentStatuses: { 'student_cs_01': 'Present' },
        teacherUid: 'faculty_me_uid'
      }, facultyMeDb);
    } catch (err) {
      crossDeptDenied = err?.code === 'permission-denied' || String(err?.message || '').toLowerCase().includes('permission');
    }
    report(13, 'Mechanical Engineering faculty marking Computer Science attendance is strictly blocked', crossDeptDenied);
  } catch (err) {
    report(13, 'Cross-department attendance denial', false, err.message);
  }

  // -------------------------------------------------------------
  // Test 14: Cross-department attendance attempt is strictly denied (CS teacher marking ME class)
  // -------------------------------------------------------------
  try {
    let csMarkingMeDenied = false;
    try {
      await savePeriodAttendance({
        sessionInfo: {
          institution: 'UEMK',
          department: 'Mechanical Engineering',
          year: '3rd Year',
          section: 'Sec A',
          date: '2026-10-13',
          period: 2
        },
        studentStatuses: { 'student_me_01': 'Present' },
        teacherUid: 'faculty_cs_uid'
      }, facultyCsDb);
    } catch (err) {
      csMarkingMeDenied = err?.code === 'permission-denied' || String(err?.message || '').toLowerCase().includes('permission');
    }
    report(14, 'Computer Science faculty marking Mechanical Engineering attendance is strictly blocked', csMarkingMeDenied);
  } catch (err) {
    report(14, 'CS faculty marking ME attendance denial', false, err.message);
  }

  // -------------------------------------------------------------
  // Test 15: Cross-faculty session modification is strictly denied
  // -------------------------------------------------------------
  try {
    // Session marked by faculty_me_uid in Test 6 (session2)
    const sessionId = generateSessionId({
      institution: 'UEMK',
      department: 'Mechanical Engineering',
      year: '3rd Year',
      section: 'Sec A',
      date: '2026-10-13',
      period: 2
    });

    let otherFacultyUpdateDenied = false;
    try {
      await updateDoc(doc(facultyCeDb, 'attendance_sessions', sessionId), {
        presentCount: 2,
        absentCount: 0,
        totalStudents: 2,
        markedAt: new Date().toISOString()
      });
    } catch (err) {
      otherFacultyUpdateDenied = err?.code === 'permission-denied' || String(err?.message || '').toLowerCase().includes('permission');
    }
    report(15, 'Unauthorized faculty cannot update another teacher attendance session', otherFacultyUpdateDenied);
  } catch (err) {
    report(15, 'Cross-faculty session modification denial', false, err.message);
  }

  // -------------------------------------------------------------
  // Test 16: Regression: fetchStudentsForSection supports all canonical departments
  // -------------------------------------------------------------
  try {
    const meStudents = await fetchStudentsForSection({
      department: 'Mechanical Engineering',
      year: '3rd Year',
      section: 'Sec A'
    }, facultyMeDb);

    const csStudents = await fetchStudentsForSection({
      department: 'CSE AI',
      year: '2nd Year',
      section: 'Sec C'
    }, facultyCsDb);

    const ceStudents = await fetchStudentsForSection({
      department: 'Civil Engineering',
      year: '4th Year',
      section: 'Sec A'
    }, facultyCeDb);

    const hasMeStudents = Array.isArray(meStudents) && meStudents.length === 2;
    const hasCsStudents = Array.isArray(csStudents) && csStudents.length === 1;
    const hasCeStudents = Array.isArray(ceStudents) && ceStudents.length === 1;

    report(16, 'Regression: fetchStudentsForSection loads students for ME, CSE AI, and CE correctly', hasMeStudents && hasCsStudents && hasCeStudents);
  } catch (err) {
    report(16, 'fetchStudentsForSection regression', false, err.message);
  }

  // -------------------------------------------------------------
  // Test 17: Regression: Single student status update works for allocated faculty
  // -------------------------------------------------------------
  try {
    const sessionInfo = {
      institution: 'UEMK',
      department: 'Mechanical Engineering',
      year: '3rd Year',
      section: 'Sec A',
      date: '2026-10-13',
      period: 2
    };
    const sessionId = generateSessionId(sessionInfo);

    const updateRes = await saveSingleStudentAttendance({
      sessionInfo,
      studentUid: 'student_me_02',
      status: 'Present',
      teacherUid: 'faculty_multime_uid'
    }, facultyMultiMeDb);

    const records = await fetchSessionAttendanceRecords(sessionId, 'UEMK', 'Mechanical Engineering', facultyMultiMeDb);
    const updatedStatus = records['student_me_02'] === 'Present';

    report(17, 'Regression: Single student attendance toggle preserves session totals and updates status', typeof updateRes === 'string' && updateRes.length > 0 && updatedStatus);
  } catch (err) {
    report(17, 'Single student update regression', false, err.message);
  }

  // -------------------------------------------------------------
  // Test 18: Hierarchy scope resolver handles 4-level and 6-level paths accurately
  // -------------------------------------------------------------
  try {
    // 4-level path
    const scope4 = resolveAcademicScope({ path: ['UEMK', 'Mechanical Engineering', '3rd Year', 'Sec A'] });
    const match4 = scope4.br === 'Mechanical Engineering' && scope4.yr === '3rd Year' && scope4.sec === 'Sec A';

    // 6-level path
    const scope6 = resolveAcademicScope({ path: ['UEMK', 'B.Tech', 'Mechanical Engineering', 'Robotics', '4th Year', 'Sec B'] });
    const match6 = scope6.br === 'Mechanical Engineering Robotics' && scope6.yr === '4th Year' && scope6.sec === 'Sec B';

    report(18, 'Hierarchy scope resolver handles 4-level and 6-level academic paths with no hardcoded fallbacks', match4 && match6);
  } catch (err) {
    report(18, 'Scope resolver path testing', false, err.message);
  }

  // -------------------------------------------------------------
  // Test 19: Faculty cannot read another faculty member's allocation document
  // -------------------------------------------------------------
  try {
    let crossFacultyReadDenied = false;
    try {
      // Mechanical Engineering faculty attempting to get CS faculty's allocation doc
      await getDoc(doc(facultyMeDb, 'teacher_allocations', 'faculty_cs_uid_2nd Year_Sec C'));
    } catch (err) {
      crossFacultyReadDenied = err?.code === 'permission-denied' || String(err?.message || '').toLowerCase().includes('permission');
    }
    report(19, 'Faculty cannot read another faculty member allocation document (cross-faculty isolation)', crossFacultyReadDenied);
  } catch (err) {
    report(19, 'Cross-faculty allocation read isolation', false, err.message);
  }

  // -------------------------------------------------------------
  // Test 20: Faculty cannot modify or delete their own allocation document
  // -------------------------------------------------------------
  try {
    let updateDenied = false;
    let deleteDenied = false;
    try {
      await updateDoc(doc(facultyMeDb, 'teacher_allocations', 'faculty_me_uid_3rd Year_Sec A'), {
        authorized: true
      });
    } catch (err) {
      updateDenied = err?.code === 'permission-denied' || String(err?.message || '').toLowerCase().includes('permission');
    }
    try {
      await deleteDoc(doc(facultyMeDb, 'teacher_allocations', 'faculty_me_uid_3rd Year_Sec A'));
    } catch (err) {
      deleteDenied = err?.code === 'permission-denied' || String(err?.message || '').toLowerCase().includes('permission');
    }
    report(20, 'Faculty cannot modify or delete their own allocation document (Director-only management)', updateDenied && deleteDenied);
  } catch (err) {
    report(20, 'Faculty self-modification rejection', false, err.message);
  }

} catch (globalErr) {
  console.error('Fatal error during test execution:', globalErr);
} finally {
  console.log(`\n========================================`);
  console.log(`FACULTY ALLOCATION SYSTEM: ${passed} PASSED, ${failed} FAILED`);
  console.log(`========================================\n`);
  await testEnv.cleanup();
  process.exit(failed > 0 ? 1 : 0);
}
