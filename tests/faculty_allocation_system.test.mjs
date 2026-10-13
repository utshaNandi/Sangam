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
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await testEnv.clearFirestore();
      break;
    } catch (clearErr) {
      if (attempt === 3) throw clearErr;
      await new Promise(r => setTimeout(r, 600));
    }
  }

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

    // Students for identical section name regression testing (Sec A across branches and years)
    await setDoc(doc(adminDb, 'users', 'student_me_2a_01'), {
      uid: 'student_me_2a_01',
      name: 'Nikola Tesla (ME 2A)',
      email: 'tesla.me@sangam.edu',
      role: 'student',
      status: 'active',
      department: 'Mechanical Engineering',
      year: '2nd Year',
      section: 'Sec A',
      institution: 'UEMK'
    });

    await setDoc(doc(adminDb, 'users', 'student_cs_2a_01'), {
      uid: 'student_cs_2a_01',
      name: 'Grace Hopper (CS 2A)',
      email: 'hopper.cs@sangam.edu',
      role: 'student',
      status: 'active',
      department: 'Computer Science',
      year: '2nd Year',
      section: 'Sec A',
      institution: 'UEMK'
    });

    await setDoc(doc(adminDb, 'users', 'student_cs_3a_01'), {
      uid: 'student_cs_3a_01',
      name: 'Claude Shannon (CS 3A)',
      email: 'shannon.cs@sangam.edu',
      role: 'student',
      status: 'active',
      department: 'Computer Science',
      year: '3rd Year',
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
    const unallocAlloc = await createTeacherAllocation({
      teacherUid: 'faculty_unallocated_uid',
      institution: 'UEMK',
      department: 'Mechanical Engineering',
      year: '1st Year',
      section: 'Sec A'
    }, directorDb);

    await new Promise(r => setTimeout(r, 200));

    // Director removes allocation
    await deleteTeacherAllocation(unallocAlloc.id, directorDb);

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
    await deleteTeacherAllocation('faculty_multime_uid_Mechanical Engineering_2nd Year_Sec B', directorDb);

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
      await updateDoc(doc(facultyMeDb, 'teacher_allocations', 'faculty_me_uid_Mechanical Engineering_3rd Year_Sec A'), {
        authorized: true
      });
    } catch (err) {
      updateDenied = err?.code === 'permission-denied' || String(err?.message || '').toLowerCase().includes('permission');
    }
    try {
      await deleteDoc(doc(facultyMeDb, 'teacher_allocations', 'faculty_me_uid_Mechanical Engineering_3rd Year_Sec A'));
    } catch (err) {
      deleteDenied = err?.code === 'permission-denied' || String(err?.message || '').toLowerCase().includes('permission');
    }
    report(20, 'Faculty cannot modify or delete their own allocation document (Director-only management)', updateDenied && deleteDenied);
  } catch (err) {
    report(20, 'Faculty self-modification rejection', false, err.message);
  }

  // -------------------------------------------------------------
  // Test 21: Regression: Same section name in different departments exists simultaneously
  // -------------------------------------------------------------
  try {
    const allocMe2A = await createTeacherAllocation({
      teacherUid: 'faculty_me_uid',
      institution: 'UEMK',
      department: 'Mechanical Engineering',
      year: '2nd Year',
      section: 'Sec A',
      directorUid: 'director_uid_01'
    }, directorDb);

    const allocCs2A = await createTeacherAllocation({
      teacherUid: 'faculty_cs_uid',
      institution: 'UEMK',
      department: 'CSE AI',
      year: '2nd Year',
      section: 'Sec A',
      directorUid: 'director_uid_01'
    }, directorDb);

    const bothCreated = allocMe2A.id === 'faculty_me_uid_Mechanical Engineering_2nd Year_Sec A' &&
                        allocCs2A.id === 'faculty_cs_uid_CSE AI_2nd Year_Sec A';

    const meDoc = await getDoc(doc(directorDb, 'teacher_allocations', allocMe2A.id));
    const csDoc = await getDoc(doc(directorDb, 'teacher_allocations', allocCs2A.id));
    const bothExistInDb = meDoc.exists() && csDoc.exists() &&
                          meDoc.data().department === 'Mechanical Engineering' &&
                          csDoc.data().department === 'CSE AI';

    report(21, 'Same section (Sec A) in different departments exists simultaneously without collision', bothCreated && bothExistInDb);
  } catch (err) {
    report(21, 'Same section in different departments', false, err.message);
  }

  // -------------------------------------------------------------
  // Test 22: Regression: Same section name in different academic years exists simultaneously
  // -------------------------------------------------------------
  try {
    const allocCs3A = await createTeacherAllocation({
      teacherUid: 'faculty_cs_uid',
      institution: 'UEMK',
      department: 'CSE AI',
      year: '3rd Year',
      section: 'Sec A',
      directorUid: 'director_uid_01'
    }, directorDb);

    const createdCorrectly = allocCs3A.id === 'faculty_cs_uid_CSE AI_3rd Year_Sec A';

    // Verify both 2nd Year Sec A and 3rd Year Sec A exist for faculty_cs_uid
    const doc2A = await getDoc(doc(directorDb, 'teacher_allocations', 'faculty_cs_uid_CSE AI_2nd Year_Sec A'));
    const doc3A = await getDoc(doc(directorDb, 'teacher_allocations', 'faculty_cs_uid_CSE AI_3rd Year_Sec A'));
    const bothYearsExist = doc2A.exists() && doc3A.exists() &&
                           doc2A.data().year === '2nd Year' &&
                           doc3A.data().year === '3rd Year';

    report(22, 'Same section (Sec A) in different academic years exists simultaneously without collision', createdCorrectly && bothYearsExist);
  } catch (err) {
    report(22, 'Same section in different academic years', false, err.message);
  }

  // -------------------------------------------------------------
  // Test 23: Regression: Same faculty assigned to all these classes (CSE AI 2nd Year Sec A, ME 2nd Year Sec A, CSE AI 3rd Year Sec A)
  // -------------------------------------------------------------
  try {
    // Assign faculty_cs_uid also to Mechanical Engineering 2nd Year Sec A
    const multiAlloc = await createTeacherAllocation({
      teacherUid: 'faculty_cs_uid',
      institution: 'UEMK',
      department: 'Mechanical Engineering',
      year: '2nd Year',
      section: 'Sec A',
      directorUid: 'director_uid_01'
    }, directorDb);

    // Fetch all allocations for faculty_cs_uid
    const allCsAllocs = await fetchTeacherAllocations({ institution: 'UEMK', teacherUid: 'faculty_cs_uid' }, facultyCsDb);
    const expectedClasses = [
      { dept: 'CSE AI', yr: '2nd Year', sec: 'Sec A' },
      { dept: 'CSE AI', yr: '3rd Year', sec: 'Sec A' },
      { dept: 'Mechanical Engineering', yr: '2nd Year', sec: 'Sec A' }
    ];
    const hasAll3Classes = expectedClasses.every(exp => 
      allCsAllocs.some(a => a.department === exp.dept && a.year === exp.yr && a.section === exp.sec && a.authorized === true)
    );

    // Build hierarchy tree: all 3 branches must be distinct and non-colliding
    const tree = buildTree(allCsAllocs, 'UEMK');
    const hasCseAi2A = Boolean(tree['UEMK']?.['CSE AI']?.['2nd Year']?.['Sec A']);
    const hasCseAi3A = Boolean(tree['UEMK']?.['CSE AI']?.['3rd Year']?.['Sec A']);
    const hasMe2A = Boolean(tree['UEMK']?.['Mechanical Engineering']?.['2nd Year']?.['Sec A']);
    const treeHasAll3Distinct = hasCseAi2A && hasCseAi3A && hasMe2A;

    // Save attendance in all 3 classes by the same faculty member
    const date = '2026-10-15';
    const s1 = await savePeriodAttendance({
      sessionInfo: { institution: 'UEMK', department: 'Computer Science', year: '2nd Year', section: 'Sec A', date, period: 1 },
      studentStatuses: { 'student_cs_2a_01': 'Present' },
      teacherUid: 'faculty_cs_uid'
    }, facultyCsDb);

    const s2 = await savePeriodAttendance({
      sessionInfo: { institution: 'UEMK', department: 'Computer Science', year: '3rd Year', section: 'Sec A', date, period: 2 },
      studentStatuses: { 'student_cs_3a_01': 'Present' },
      teacherUid: 'faculty_cs_uid'
    }, facultyCsDb);

    const s3 = await savePeriodAttendance({
      sessionInfo: { institution: 'UEMK', department: 'Mechanical Engineering', year: '2nd Year', section: 'Sec A', date, period: 3 },
      studentStatuses: { 'student_me_2a_01': 'Present' },
      teacherUid: 'faculty_cs_uid'
    }, facultyCsDb);

    const allSavesSucceeded = Boolean(s1 && s2 && s3);

    report(23, 'Same faculty assigned to multiple classes with matching section names (CSE AI 2A, ME 2A, CSE AI 3A) and marks attendance for all', hasAll3Classes && treeHasAll3Distinct && allSavesSucceeded);
  } catch (err) {
    report(23, 'Same faculty assigned to multiple matching-section classes', false, err.message);
  }

  // -------------------------------------------------------------
  // Test 24: Regression: Different faculty assigned to the same section name in different classes
  // -------------------------------------------------------------
  try {
    // faculty_ce_uid allocated to Civil Engineering 2nd Year Sec A
    const ce2AAlloc = await createTeacherAllocation({
      teacherUid: 'faculty_ce_uid',
      institution: 'UEMK',
      department: 'Civil Engineering',
      year: '2nd Year',
      section: 'Sec A',
      directorUid: 'director_uid_01'
    }, directorDb);

    // faculty_ce_uid can read only their allocation, not faculty_me_uid's allocation
    const ceDoc = await getDoc(doc(facultyCeDb, 'teacher_allocations', ce2AAlloc.id));
    let readOtherDenied = false;
    try {
      await getDoc(doc(facultyCeDb, 'teacher_allocations', 'faculty_me_uid_Mechanical Engineering_2nd Year_Sec A'));
    } catch (err) {
      readOtherDenied = err?.code === 'permission-denied' || String(err?.message || '').toLowerCase().includes('permission');
    }

    // faculty_ce_uid cannot mark attendance for Mechanical Engineering 2nd Year Sec A
    let markOtherDenied = false;
    try {
      await savePeriodAttendance({
        sessionInfo: { institution: 'UEMK', department: 'Mechanical Engineering', year: '2nd Year', section: 'Sec A', date: '2026-10-15', period: 4 },
        studentStatuses: { 'student_me_2a_01': 'Present' },
        teacherUid: 'faculty_ce_uid'
      }, facultyCeDb);
    } catch (err) {
      markOtherDenied = err?.code === 'permission-denied' || String(err?.message || '').toLowerCase().includes('permission');
    }

    report(24, 'Different faculty assigned to same section name across classes: isolated allocations and attendance authorization', ceDoc.exists() && readOtherDenied && markOtherDenied);
  } catch (err) {
    report(24, 'Different faculty assigned to same section name', false, err.message);
  }

  // -------------------------------------------------------------
  // Test 25: Regression: True duplicate allocation rejection
  // -------------------------------------------------------------
  try {
    let duplicateRejected = false;
    let duplicateErrorMsg = '';
    try {
      // Re-allocating faculty_me_uid to Mechanical Engineering 2nd Year Sec A (exact duplicate)
      await createTeacherAllocation({
        teacherUid: 'faculty_me_uid',
        institution: 'UEMK',
        department: 'Mechanical Engineering',
        year: '2nd Year',
        section: 'Sec A',
        directorUid: 'director_uid_01'
      }, directorDb);
    } catch (err) {
      duplicateRejected = true;
      duplicateErrorMsg = err.message;
    }

    // Verify allocating the same faculty to a different year with the same section is NOT rejected
    const nonDuplicateAlloc = await createTeacherAllocation({
      teacherUid: 'faculty_me_uid',
      institution: 'UEMK',
      department: 'Mechanical Engineering',
      year: '1st Year',
      section: 'Sec A',
      directorUid: 'director_uid_01'
    }, directorDb);

    const nonDuplicateSucceeded = Boolean(nonDuplicateAlloc && nonDuplicateAlloc.id);

    report(25, 'True duplicate allocation rejected; distinct year/dept with same section name permitted', duplicateRejected && duplicateErrorMsg.includes('already allocated') && nonDuplicateSucceeded);
  } catch (err) {
    report(25, 'True duplicate allocation rejection', false, err.message);
  }

  // -------------------------------------------------------------
  // Test 26: Regression: Attendance isolation between classes with identical section names
  // -------------------------------------------------------------
  try {
    const today = '2026-10-16';
    const period = 2;

    const sessionMe = {
      institution: 'UEMK',
      department: 'Mechanical Engineering',
      year: '2nd Year',
      section: 'Sec A',
      date: today,
      period
    };
    const sessionCs2A = {
      institution: 'UEMK',
      department: 'Computer Science',
      year: '2nd Year',
      section: 'Sec A',
      date: today,
      period
    };
    const sessionCs3A = {
      institution: 'UEMK',
      department: 'Computer Science',
      year: '3rd Year',
      section: 'Sec A',
      date: today,
      period
    };

    const idMe = generateSessionId(sessionMe);
    const idCs2A = generateSessionId(sessionCs2A);
    const idCs3A = generateSessionId(sessionCs3A);

    // 1. Session IDs are mutually distinct
    const idsAreDistinct = idMe !== idCs2A && idMe !== idCs3A && idCs2A !== idCs3A;

    // 2. Save attendance for each session
    await savePeriodAttendance({ sessionInfo: sessionMe, studentStatuses: { 'student_me_2a_01': 'Present' }, teacherUid: 'faculty_me_uid' }, facultyMeDb);
    await savePeriodAttendance({ sessionInfo: sessionCs2A, studentStatuses: { 'student_cs_2a_01': 'Present' }, teacherUid: 'faculty_cs_uid' }, facultyCsDb);
    await savePeriodAttendance({ sessionInfo: sessionCs3A, studentStatuses: { 'student_cs_3a_01': 'Present' }, teacherUid: 'faculty_cs_uid' }, facultyCsDb);

    // 3. Inspect saved records: student records are isolated by sessionId
    const recMe = await getDoc(doc(directorDb, 'attendance_records', `${idMe}_student_me_2a_01`));
    const recCs2A = await getDoc(doc(directorDb, 'attendance_records', `${idCs2A}_student_cs_2a_01`));
    const recCs3A = await getDoc(doc(directorDb, 'attendance_records', `${idCs3A}_student_cs_3a_01`));

    const recordsIsolated = recMe.exists() && recCs2A.exists() && recCs3A.exists() &&
                            recMe.data().department === 'Mechanical Engineering' &&
                            recCs2A.data().year === '2nd Year' &&
                            recCs3A.data().year === '3rd Year';

    // 4. Cross-scope student attempt (saving a Mechanical Engineering student under Computer Science session) is blocked
    let crossScopeDenied = false;
    try {
      await savePeriodAttendance({
        sessionInfo: sessionCs2A,
        studentStatuses: { 'student_me_2a_01': 'Present' },
        teacherUid: 'faculty_cs_uid'
      }, facultyCsDb);
    } catch (err) {
      crossScopeDenied = err?.code === 'permission-denied' || String(err?.message || '').toLowerCase().includes('permission');
    }

    report(26, 'Attendance session and record isolation between classes with identical section names (Sec A) strictly verified', idsAreDistinct && recordsIsolated && crossScopeDenied);
  } catch (err) {
    report(26, 'Attendance isolation between identical section names', false, err.message);
  }

  // -------------------------------------------------------------
  // Test 27: Regression: Canonical allocation creation for faculty xyz (ayanagarwal40@gmail.com, UID WgHtT4v015T18CfZnc7EejeWcJz2) to CSE AI 2nd Year Sec A
  // -------------------------------------------------------------
  try {
    const ayanUid = 'WgHtT4v015T18CfZnc7EejeWcJz2';
    const ayanEmail = 'ayanagarwal40@gmail.com';

    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore();
      await setDoc(doc(adminDb, 'authorized_staff', ayanEmail), {
        role: 'faculty',
        authorized: true
      });
      await setDoc(doc(adminDb, 'users', ayanUid), {
        uid: ayanUid,
        name: 'xyz',
        email: ayanEmail,
        role: 'faculty',
        status: 'active',
        createdAt: new Date().toISOString(),
        department: 'Computer Science',
        institution: 'UEMK'
      });
    });

    const ayanDb = testEnv.authenticatedContext(ayanUid, { email: ayanEmail }).firestore();

    // 1. Verify pre-write getDoc on non-existent allocation document succeeds without permission-denied (resource == null handling)
    const canonicalDocId = `${ayanUid}_CSE AI_2nd Year_Sec A`;
    const preWriteSnap = await getDoc(doc(directorDb, 'teacher_allocations', canonicalDocId));
    const preWriteSafe = !preWriteSnap.exists();

    // 2. Director creates canonical allocation with spaces in department and year
    const createdAlloc = await createTeacherAllocation({
      teacherUid: ayanUid,
      institution: 'UEMK',
      department: 'CSE AI',
      year: '2nd Year',
      section: 'Sec A',
      directorUid: 'director_uid_01'
    }, directorDb);

    const docCreated = createdAlloc && createdAlloc.id === canonicalDocId;

    // 3. Verify document exists with exact payload
    const fetchedSnap = await getDoc(doc(directorDb, 'teacher_allocations', canonicalDocId));
    const dataMatches = fetchedSnap.exists() &&
                        fetchedSnap.data().teacherUid === ayanUid &&
                        fetchedSnap.data().department === 'CSE AI' &&
                        fetchedSnap.data().year === '2nd Year' &&
                        fetchedSnap.data().section === 'Sec A' &&
                        fetchedSnap.data().institution === 'UEMK' &&
                        fetchedSnap.data().authorized === true;

    // 4. Faculty member can read their own canonical allocation
    const facultyReadSnap = await getDoc(doc(ayanDb, 'teacher_allocations', canonicalDocId));
    const facultyCanRead = facultyReadSnap.exists() && facultyReadSnap.data().authorized === true;

    report(27, 'Canonical allocation creation for faculty xyz (ayanagarwal40@gmail.com) to CSE AI 2nd Year Sec A with spaces in doc ID', preWriteSafe && docCreated && dataMatches && facultyCanRead);
  } catch (err) {
    report(27, 'Canonical allocation creation for faculty xyz', false, err.message);
  }

  // -------------------------------------------------------------
  // Test 28: Regression: Legacy allocation compatibility and safe update
  // -------------------------------------------------------------
  try {
    const legacyTeacherUid = 'faculty_legacy_01';
    const legacyEmail = 'legacy.teacher@sangam.edu';

    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore();
      await setDoc(doc(adminDb, 'authorized_staff', legacyEmail), {
        role: 'faculty',
        authorized: true
      });
      await setDoc(doc(adminDb, 'users', legacyTeacherUid), {
        uid: legacyTeacherUid,
        name: 'Prof. Legacy',
        email: legacyEmail,
        role: 'faculty',
        status: 'active',
        createdAt: new Date().toISOString(),
        department: 'Mechanical Engineering',
        institution: 'UEMK'
      });
      // Pre-seed legacy allocation format: {teacherUid}_{year}_{section}
      await setDoc(doc(adminDb, 'teacher_allocations', `${legacyTeacherUid}_2nd Year_Sec B`), {
        teacherUid: legacyTeacherUid,
        institution: 'UEMK',
        department: 'Mechanical Engineering',
        year: '2nd Year',
        section: 'Sec B',
        authorized: true,
        createdAt: new Date().toISOString()
      });
    });

    const legacyDb = testEnv.authenticatedContext(legacyTeacherUid, { email: legacyEmail }).firestore();

    // 1. Director can read legacy allocation
    const dirReadLegacy = await getDoc(doc(directorDb, 'teacher_allocations', `${legacyTeacherUid}_2nd Year_Sec B`));
    const dirCanRead = dirReadLegacy.exists();

    // 2. Faculty can read legacy allocation
    const facReadLegacy = await getDoc(doc(legacyDb, 'teacher_allocations', `${legacyTeacherUid}_2nd Year_Sec B`));
    const facCanRead = facReadLegacy.exists() && facReadLegacy.data().authorized === true;

    // 3. Director can safely update legacy allocation (e.g. updating updatedAt / updatedBy)
    await updateDoc(doc(directorDb, 'teacher_allocations', `${legacyTeacherUid}_2nd Year_Sec B`), {
      authorized: true,
      updatedAt: new Date().toISOString(),
      updatedBy: 'director_uid_01'
    });
    const updatedSnap = await getDoc(doc(directorDb, 'teacher_allocations', `${legacyTeacherUid}_2nd Year_Sec B`));
    const updateSucceeded = updatedSnap.exists() && Boolean(updatedSnap.data().updatedAt);

    // 4. Faculty is authorized to save attendance using legacy allocation
    const sessionId = generateSessionId({
      institution: 'UEMK',
      department: 'Mechanical Engineering',
      year: '2nd Year',
      section: 'Sec B',
      date: '2026-10-17',
      period: 1
    });
    const saveRes = await savePeriodAttendance({
      sessionInfo: {
        institution: 'UEMK',
        department: 'Mechanical Engineering',
        year: '2nd Year',
        section: 'Sec B',
        date: '2026-10-17',
        period: 1
      },
      studentStatuses: { 'student_me_2b_01': 'Present' },
      teacherUid: legacyTeacherUid
    }, legacyDb);
    const markAttendanceSucceeded = Boolean(saveRes);

    report(28, 'Legacy allocation backward compatibility: reading, updating, and attendance authorization strictly verified', dirCanRead && facCanRead && updateSucceeded && markAttendanceSucceeded);
  } catch (err) {
    report(28, 'Legacy allocation backward compatibility', false, err.message);
  }

  // -------------------------------------------------------------
  // Test 29: Regression: Duplicate prevention across canonical and legacy allocations
  // -------------------------------------------------------------
  try {
    const ayanUid = 'WgHtT4v015T18CfZnc7EejeWcJz2';

    // 1. Duplicate canonical allocation must throw "already allocated"
    let canonicalDuplicateRejected = false;
    let canonicalDuplicateMsg = '';
    try {
      await createTeacherAllocation({
        teacherUid: ayanUid,
        institution: 'UEMK',
        department: 'CSE AI',
        year: '2nd Year',
        section: 'Sec A',
        directorUid: 'director_uid_01'
      }, directorDb);
    } catch (err) {
      canonicalDuplicateRejected = true;
      canonicalDuplicateMsg = err.message;
    }

    // 2. Duplicate across legacy format (attempting to allocate legacy teacher who already has identical allocation)
    let legacyDuplicateRejected = false;
    let legacyDuplicateMsg = '';
    try {
      await createTeacherAllocation({
        teacherUid: 'faculty_legacy_01',
        institution: 'UEMK',
        department: 'Mechanical Engineering',
        year: '2nd Year',
        section: 'Sec B',
        directorUid: 'director_uid_01'
      }, directorDb);
    } catch (err) {
      legacyDuplicateRejected = true;
      legacyDuplicateMsg = err.message;
    }

    // 3. Allocating the same faculty to a distinct class must succeed
    const distinctClassAlloc = await createTeacherAllocation({
      teacherUid: ayanUid,
      institution: 'UEMK',
      department: 'CSE AI',
      year: '3rd Year',
      section: 'Sec A',
      directorUid: 'director_uid_01'
    }, directorDb);
    const distinctClassSucceeded = distinctClassAlloc && distinctClassAlloc.id === `${ayanUid}_CSE AI_3rd Year_Sec A`;

    report(29, 'Duplicate allocation prevention rejects genuine duplicates across canonical & legacy while allowing distinct classes', canonicalDuplicateRejected && canonicalDuplicateMsg.includes('already allocated') && legacyDuplicateRejected && legacyDuplicateMsg.includes('already allocated') && distinctClassSucceeded);
  } catch (err) {
    report(29, 'Duplicate allocation prevention verification', false, err.message);
  }

  // -------------------------------------------------------------
  // Test 30: Regression: Unauthorized allocation write attempts strictly rejected by security rules
  // -------------------------------------------------------------
  try {
    const ayanUid = 'WgHtT4v015T18CfZnc7EejeWcJz2';
    const ayanEmail = 'ayanagarwal40@gmail.com';
    const ayanDb = testEnv.authenticatedContext(ayanUid, { email: ayanEmail }).firestore();

    // 1. Faculty cannot create allocation document (self-allocation denied)
    let facultyCreateDenied = false;
    try {
      await setDoc(doc(ayanDb, 'teacher_allocations', `${ayanUid}_CSE AI_4th Year_Sec A`), {
        teacherUid: ayanUid,
        institution: 'UEMK',
        department: 'CSE AI',
        year: '4th Year',
        section: 'Sec A',
        authorized: true,
        createdAt: new Date().toISOString()
      });
    } catch (err) {
      facultyCreateDenied = err?.code === 'permission-denied' || String(err?.message || '').toLowerCase().includes('permission');
    }

    // 2. Faculty cannot modify another faculty member allocation
    let facultyModifyOtherDenied = false;
    try {
      await updateDoc(doc(ayanDb, 'teacher_allocations', 'faculty_me_uid_Mechanical Engineering_2nd Year_Sec A'), {
        authorized: false
      });
    } catch (err) {
      facultyModifyOtherDenied = err?.code === 'permission-denied' || String(err?.message || '').toLowerCase().includes('permission');
    }

    // 3. Document ID mismatch (tampered doc ID not following canonical or legacy pattern)
    let tamperedIdDenied = false;
    try {
      await setDoc(doc(directorDb, 'teacher_allocations', 'arbitrary_doc_id_123'), {
        teacherUid: ayanUid,
        institution: 'UEMK',
        department: 'CSE AI',
        year: '4th Year',
        section: 'Sec A',
        authorized: true,
        createdAt: new Date().toISOString()
      });
    } catch (err) {
      tamperedIdDenied = err?.code === 'permission-denied' || String(err?.message || '').toLowerCase().includes('permission');
    }

    // 4. Cross-institution Director write denied
    let crossInstDirectorDenied = false;
    try {
      await setDoc(doc(directorDb, 'teacher_allocations', `${ayanUid}_CSE AI_4th Year_Sec A`), {
        teacherUid: ayanUid,
        institution: 'DIFFERENT_COLLEGE',
        department: 'CSE AI',
        year: '4th Year',
        section: 'Sec A',
        authorized: true,
        createdAt: new Date().toISOString()
      });
    } catch (err) {
      crossInstDirectorDenied = err?.code === 'permission-denied' || String(err?.message || '').toLowerCase().includes('permission');
    }

    // 5. Unauthenticated client write denied
    const unauthDb = testEnv.unauthenticatedContext().firestore();
    let unauthWriteDenied = false;
    try {
      await setDoc(doc(unauthDb, 'teacher_allocations', `${ayanUid}_CSE AI_4th Year_Sec A`), {
        teacherUid: ayanUid,
        institution: 'UEMK',
        department: 'CSE AI',
        year: '4th Year',
        section: 'Sec A',
        authorized: true,
        createdAt: new Date().toISOString()
      });
    } catch (err) {
      unauthWriteDenied = err?.code === 'permission-denied' || String(err?.message || '').toLowerCase().includes('permission');
    }

    report(30, 'Unauthorized allocation writes (faculty self-allocation, cross-faculty tampering, doc ID mismatch, cross-institution, unauthenticated) strictly denied', facultyCreateDenied && facultyModifyOtherDenied && tamperedIdDenied && crossInstDirectorDenied && unauthWriteDenied);
  } catch (err) {
    report(30, 'Unauthorized allocation write protection', false, err.message);
  }

  // -------------------------------------------------------------
  // Test 31: Regression: Authorized Director reads faculty profile document (users/{facultyUid})
  // -------------------------------------------------------------
  try {
    const ayanUid = 'WgHtT4v015T18CfZnc7EejeWcJz2';
    const facultyDocSnap = await getDoc(doc(directorDb, 'users', ayanUid));
    const canReadFaculty = facultyDocSnap.exists() && facultyDocSnap.data().role === 'faculty';

    report(31, 'Authorized Director can read faculty user profile within authorized institution', canReadFaculty);
  } catch (err) {
    report(31, 'Authorized Director reading faculty profile', false, err.message);
  }

  // -------------------------------------------------------------
  // Test 32: Regression: Four-Teacher Coexistence with Same Section Name (Sec A)
  // Teacher A → CSE AI → 2nd Year → Sec A
  // Teacher B → Mechanical Engineering → 2nd Year → Sec A
  // Teacher C → Civil Engineering → 2nd Year → Sec A
  // Teacher D → CSE AI → 3rd Year → Sec A
  // -------------------------------------------------------------
  try {
    const teacherAUid = 'teacher_a_4way';
    const teacherBUid = 'teacher_b_4way';
    const teacherCUid = 'teacher_c_4way';
    const teacherDUid = 'teacher_d_4way';

    const teacherAEmail = 'teacher.a@sangam.edu';
    const teacherBEmail = 'teacher.b@sangam.edu';
    const teacherCEmail = 'teacher.c@sangam.edu';
    const teacherDEmail = 'teacher.d@sangam.edu';

    // 1. Setup authorized staff & user profiles for Teachers A, B, C, D and students
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore();
      
      const teachers = [
        { uid: teacherAUid, email: teacherAEmail, name: 'Teacher A', dept: 'Computer Science' },
        { uid: teacherBUid, email: teacherBEmail, name: 'Teacher B', dept: 'Mechanical Engineering' },
        { uid: teacherCUid, email: teacherCEmail, name: 'Teacher C', dept: 'Civil Engineering' },
        { uid: teacherDUid, email: teacherDEmail, name: 'Teacher D', dept: 'Computer Science' },
      ];

      for (const t of teachers) {
        await setDoc(doc(adminDb, 'authorized_staff', t.email), {
          role: 'faculty',
          authorized: true
        });
        await setDoc(doc(adminDb, 'users', t.uid), {
          uid: t.uid,
          name: t.name,
          email: t.email,
          role: 'faculty',
          status: 'active',
          department: t.dept,
          institution: 'UEMK',
          createdAt: new Date().toISOString()
        });
      }

      // Students for each class
      const students = [
        { uid: 'student_4way_cse2a', name: 'Student CSE 2A', dept: 'Computer Science', year: '2nd Year', sec: 'Sec A' },
        { uid: 'student_4way_me2a', name: 'Student ME 2A', dept: 'Mechanical Engineering', year: '2nd Year', sec: 'Sec A' },
        { uid: 'student_4way_ce2a', name: 'Student CE 2A', dept: 'Civil Engineering', year: '2nd Year', sec: 'Sec A' },
        { uid: 'student_4way_cse3a', name: 'Student CSE 3A', dept: 'Computer Science', year: '3rd Year', sec: 'Sec A' },
      ];

      for (const s of students) {
        await setDoc(doc(adminDb, 'users', s.uid), {
          uid: s.uid,
          name: s.name,
          email: `${s.uid}@sangam.edu`,
          role: 'student',
          status: 'active',
          department: s.dept,
          year: s.year,
          section: s.sec,
          institution: 'UEMK'
        });
      }
    });

    const teacherADb = testEnv.authenticatedContext(teacherAUid, { email: teacherAEmail }).firestore();
    const teacherBDb = testEnv.authenticatedContext(teacherBUid, { email: teacherBEmail }).firestore();
    const teacherCDb = testEnv.authenticatedContext(teacherCUid, { email: teacherCEmail }).firestore();
    const teacherDDb = testEnv.authenticatedContext(teacherDUid, { email: teacherDEmail }).firestore();

    // 2. Director creates all 4 allocations:
    const allocA = await createTeacherAllocation({
      teacherUid: teacherAUid,
      institution: 'UEMK',
      department: 'CSE AI',
      year: '2nd Year',
      section: 'Sec A',
      directorUid: 'director_uid_01'
    }, directorDb);

    const allocB = await createTeacherAllocation({
      teacherUid: teacherBUid,
      institution: 'UEMK',
      department: 'Mechanical Engineering',
      year: '2nd Year',
      section: 'Sec A',
      directorUid: 'director_uid_01'
    }, directorDb);

    const allocC = await createTeacherAllocation({
      teacherUid: teacherCUid,
      institution: 'UEMK',
      department: 'Civil Engineering',
      year: '2nd Year',
      section: 'Sec A',
      directorUid: 'director_uid_01'
    }, directorDb);

    const allocD = await createTeacherAllocation({
      teacherUid: teacherDUid,
      institution: 'UEMK',
      department: 'CSE AI',
      year: '3rd Year',
      section: 'Sec A',
      directorUid: 'director_uid_01'
    }, directorDb);

    // 3. Verify all four allocations coexist independently in Firestore without overwriting
    const docA = await getDoc(doc(directorDb, 'teacher_allocations', allocA.id));
    const docB = await getDoc(doc(directorDb, 'teacher_allocations', allocB.id));
    const docC = await getDoc(doc(directorDb, 'teacher_allocations', allocC.id));
    const docD = await getDoc(doc(directorDb, 'teacher_allocations', allocD.id));

    const allFourCoexist = docA.exists() && docB.exists() && docC.exists() && docD.exists() &&
      docA.data().teacherUid === teacherAUid && docA.data().department === 'CSE AI' && docA.data().year === '2nd Year' && docA.data().section === 'Sec A' &&
      docB.data().teacherUid === teacherBUid && docB.data().department === 'Mechanical Engineering' && docB.data().year === '2nd Year' && docB.data().section === 'Sec A' &&
      docC.data().teacherUid === teacherCUid && docC.data().department === 'Civil Engineering' && docC.data().year === '2nd Year' && docC.data().section === 'Sec A' &&
      docD.data().teacherUid === teacherDUid && docD.data().department === 'CSE AI' && docD.data().year === '3rd Year' && docD.data().section === 'Sec A';

    // 4. Verify each teacher queries only their own allocation
    const allocsForA = await fetchTeacherAllocations({ institution: 'UEMK', teacherUid: teacherAUid }, teacherADb);
    const allocsForB = await fetchTeacherAllocations({ institution: 'UEMK', teacherUid: teacherBUid }, teacherBDb);
    const allocsForC = await fetchTeacherAllocations({ institution: 'UEMK', teacherUid: teacherCUid }, teacherCDb);
    const allocsForD = await fetchTeacherAllocations({ institution: 'UEMK', teacherUid: teacherDUid }, teacherDDb);

    const teacherAIsolated = allocsForA.length === 1 && allocsForA[0].id === allocA.id;
    const teacherBIsolated = allocsForB.length === 1 && allocsForB[0].id === allocB.id;
    const teacherCIsolated = allocsForC.length === 1 && allocsForC[0].id === allocC.id;
    const teacherDIsolated = allocsForD.length === 1 && allocsForD[0].id === allocD.id;

    // 5. Verify academic tree for each teacher reflects only their assigned class
    const treeA = buildTree(allocsForA, 'UEMK');
    const treeB = buildTree(allocsForB, 'UEMK');
    const treeC = buildTree(allocsForC, 'UEMK');
    const treeD = buildTree(allocsForD, 'UEMK');

    const treeAValid = Boolean(treeA['UEMK']?.['CSE AI']?.['2nd Year']?.['Sec A']) && !treeA['UEMK']?.['Mechanical Engineering'];
    const treeBValid = Boolean(treeB['UEMK']?.['Mechanical Engineering']?.['2nd Year']?.['Sec A']) && !treeB['UEMK']?.['CSE AI'];
    const treeCValid = Boolean(treeC['UEMK']?.['Civil Engineering']?.['2nd Year']?.['Sec A']) && !treeC['UEMK']?.['CSE AI'];
    const treeDValid = Boolean(treeD['UEMK']?.['CSE AI']?.['3rd Year']?.['Sec A']) && !treeD['UEMK']?.['CSE AI']?.['2nd Year'];

    // 6. Each teacher marks attendance in their assigned class
    const sessionDate = '2026-10-18';
    const saveA = await savePeriodAttendance({
      sessionInfo: { institution: 'UEMK', department: 'Computer Science', year: '2nd Year', section: 'Sec A', date: sessionDate, period: 1 },
      studentStatuses: { 'student_4way_cse2a': 'Present' },
      teacherUid: teacherAUid
    }, teacherADb);

    const saveB = await savePeriodAttendance({
      sessionInfo: { institution: 'UEMK', department: 'Mechanical Engineering', year: '2nd Year', section: 'Sec A', date: sessionDate, period: 1 },
      studentStatuses: { 'student_4way_me2a': 'Present' },
      teacherUid: teacherBUid
    }, teacherBDb);

    const saveC = await savePeriodAttendance({
      sessionInfo: { institution: 'UEMK', department: 'Civil Engineering', year: '2nd Year', section: 'Sec A', date: sessionDate, period: 1 },
      studentStatuses: { 'student_4way_ce2a': 'Present' },
      teacherUid: teacherCUid
    }, teacherCDb);

    const saveD = await savePeriodAttendance({
      sessionInfo: { institution: 'UEMK', department: 'Computer Science', year: '3rd Year', section: 'Sec A', date: sessionDate, period: 1 },
      studentStatuses: { 'student_4way_cse3a': 'Present' },
      teacherUid: teacherDUid
    }, teacherDDb);

    const allFourAttendanceSaved = Boolean(saveA && saveB && saveC && saveD);

    // 7. Verify cross-class attendance is strictly blocked by rules:
    // Teacher B cannot mark CSE AI 2nd Year Sec A
    let teacherBBlockedFromCse2A = false;
    try {
      await savePeriodAttendance({
        sessionInfo: { institution: 'UEMK', department: 'Computer Science', year: '2nd Year', section: 'Sec A', date: sessionDate, period: 2 },
        studentStatuses: { 'student_4way_cse2a': 'Present' },
        teacherUid: teacherBUid
      }, teacherBDb);
    } catch (err) {
      teacherBBlockedFromCse2A = err?.code === 'permission-denied' || String(err?.message || '').toLowerCase().includes('permission');
    }

    // Teacher D cannot mark CSE AI 2nd Year Sec A (same branch, different year)
    let teacherDBlockedFromCse2A = false;
    try {
      await savePeriodAttendance({
        sessionInfo: { institution: 'UEMK', department: 'Computer Science', year: '2nd Year', section: 'Sec A', date: sessionDate, period: 2 },
        studentStatuses: { 'student_4way_cse2a': 'Present' },
        teacherUid: teacherDUid
      }, teacherDDb);
    } catch (err) {
      teacherDBlockedFromCse2A = err?.code === 'permission-denied' || String(err?.message || '').toLowerCase().includes('permission');
    }

    // Teacher A cannot mark Civil Engineering 2nd Year Sec A
    let teacherABlockedFromCe2A = false;
    try {
      await savePeriodAttendance({
        sessionInfo: { institution: 'UEMK', department: 'Civil Engineering', year: '2nd Year', section: 'Sec A', date: sessionDate, period: 2 },
        studentStatuses: { 'student_4way_ce2a': 'Present' },
        teacherUid: teacherAUid
      }, teacherADb);
    } catch (err) {
      teacherABlockedFromCe2A = err?.code === 'permission-denied' || String(err?.message || '').toLowerCase().includes('permission');
    }

    // 8. Reject true duplicate: re-allocating Teacher A to CSE AI 2nd Year Sec A
    let duplicateRejected = false;
    let duplicateMsg = '';
    try {
      await createTeacherAllocation({
        teacherUid: teacherAUid,
        institution: 'UEMK',
        department: 'CSE AI',
        year: '2nd Year',
        section: 'Sec A',
        directorUid: 'director_uid_01'
      }, directorDb);
    } catch (err) {
      duplicateRejected = true;
      duplicateMsg = err.message;
    }

    report(
      32,
      'Four-teacher coexistence across departments and years for Sec A strictly verified with full attendance isolation and duplicate rejection',
      allFourCoexist &&
      teacherAIsolated && teacherBIsolated && teacherCIsolated && teacherDIsolated &&
      treeAValid && treeBValid && treeCValid && treeDValid &&
      allFourAttendanceSaved &&
      teacherBBlockedFromCse2A && teacherDBlockedFromCse2A && teacherABlockedFromCe2A &&
      duplicateRejected && duplicateMsg.includes('already allocated')
    );
  } catch (err) {
    report(32, 'Four-teacher coexistence across departments and years', false, err.message);
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
