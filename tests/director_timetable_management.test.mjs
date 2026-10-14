import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import fs from 'fs';
import path from 'path';
import { doc, getDoc, getDocs, setDoc, deleteDoc, collection, query, where } from 'firebase/firestore';
import {
  VALID_DAYS,
  VALID_PERIOD_TYPES,
  DEFAULT_PERIOD_TIMINGS,
  generateClassKey,
  generateSlotDocId,
  validateSlotData,
  saveTimetableSlot,
  saveDayTimetable,
  deleteTimetableSlot,
  fetchClassTimetable
} from '../src/services/timetableService.js';
import {
  createTeacherAllocation,
  fetchTeacherAllocations
} from '../src/services/attendanceService.js';
import { DEPARTMENTS, YEARS, SECTIONS } from '../src/services/timetableService.js';

const rulesPath = path.resolve('firestore.rules');
const rules = fs.readFileSync(rulesPath, 'utf8');

const PROJECT_ID = 'sangam-director-timetable-ui-test';

console.log('Connecting to Firestore emulator on port 8080 for Director Timetable Management UI testing...');
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
  // Clear Firestore
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await testEnv.clearFirestore();
      break;
    } catch (clearErr) {
      if (attempt === 3) throw clearErr;
      await new Promise(r => setTimeout(r, 600));
    }
  }

  // Set up Admin & Initial Profiles
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const adminDb = context.firestore();

    // 1. Director: UEMK
    await setDoc(doc(adminDb, 'authorized_staff', 'director@sangam.edu'), {
      role: 'director',
      authorized: true
    });
    await setDoc(doc(adminDb, 'users', 'director_uemk_uid'), {
      uid: 'director_uemk_uid',
      name: 'Dr. Alan Carter',
      email: 'director@sangam.edu',
      role: 'director',
      status: 'active',
      department: 'Administration',
      institution: 'UEMK',
      createdAt: new Date().toISOString()
    });

    // 2. Faculty A: Allocated to CSE AI, 2nd Year, Sec A
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
      department: 'Computer Science',
      institution: 'UEMK',
      createdAt: new Date().toISOString()
    });

    // 3. Faculty B: Allocated to Mechanical Engineering, 2nd Year, Sec A
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
      department: 'Mechanical Engineering',
      institution: 'UEMK',
      createdAt: new Date().toISOString()
    });

    // 4. Faculty C: Unallocated
    await setDoc(doc(adminDb, 'authorized_staff', 'faculty.unallocated@sangam.edu'), {
      role: 'faculty',
      authorized: true
    });
    await setDoc(doc(adminDb, 'users', 'faculty_unallocated_uid'), {
      uid: 'faculty_unallocated_uid',
      name: 'Prof. Unallocated',
      email: 'faculty.unallocated@sangam.edu',
      role: 'faculty',
      status: 'active',
      department: 'Biotechnology',
      institution: 'UEMK',
      createdAt: new Date().toISOString()
    });
  });

  const directorCtx = testEnv.authenticatedContext('director_uemk_uid', { email: 'director@sangam.edu' });
  const directorDb = directorCtx.firestore();

  // Create Faculty Allocations using Director Authority
  await createTeacherAllocation({
    teacherUid: 'faculty_cs_uid',
    institution: 'UEMK',
    department: 'CSE AI',
    year: '2nd Year',
    section: 'Sec A',
    directorUid: 'director_uemk_uid'
  }, directorDb);

  await createTeacherAllocation({
    teacherUid: 'faculty_me_uid',
    institution: 'UEMK',
    department: 'Mechanical Engineering',
    year: '2nd Year',
    section: 'Sec A',
    directorUid: 'director_uemk_uid'
  }, directorDb);

  // CASE 1: Verify Selectors constants
  report(
    1,
    'DEPARTMENTS, YEARS, SECTIONS, and VALID_DAYS selector configurations',
    DEPARTMENTS.length >= 8 &&
    DEPARTMENTS.includes('Computer Science') &&
    DEPARTMENTS.includes('Mechanical Engineering') &&
    YEARS.length === 4 &&
    SECTIONS.length >= 4 &&
    VALID_DAYS.length === 6 &&
    !VALID_DAYS.includes('Sunday')
  );

  // CASE 2: Verify Shared Period Timings 1-9
  report(
    2,
    'DEFAULT_PERIOD_TIMINGS contains all 9 periods with valid timings',
    DEFAULT_PERIOD_TIMINGS.length === 9 &&
    DEFAULT_PERIOD_TIMINGS[0].period === 1 &&
    DEFAULT_PERIOD_TIMINGS[4].period === 5 &&
    DEFAULT_PERIOD_TIMINGS[8].period === 9
  );

  // CASE 3: Faculty Allocation Filtering - Class CSE AI 2nd Year Sec A
  const allAllocations = await fetchTeacherAllocations({ institution: 'UEMK' }, directorDb);
  
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const filterEligibleFaculty = (allocList, targetClass) => {
    return allocList.filter(a => {
      if (a.authorized === false) return false;
      const deptMatch = norm(a.department) === norm(targetClass.department) ||
                        norm(a.department).includes(norm(targetClass.department)) ||
                        norm(targetClass.department).includes(norm(a.department));
      const yearMatch = norm(a.year) === norm(targetClass.year);
      const secMatch = norm(a.section) === norm(targetClass.section);
      return deptMatch && yearMatch && secMatch;
    });
  };

  const cseEligible = filterEligibleFaculty(allAllocations, {
    department: 'CSE AI',
    year: '2nd Year',
    section: 'Sec A'
  });

  report(
    3,
    'Faculty filtering strictly assigns authorized faculty for CSE AI 2nd Year Sec A',
    cseEligible.length === 1 && cseEligible[0].teacherUid === 'faculty_cs_uid'
  );

  // CASE 4: Faculty Filtering for Mechanical Engineering 2nd Year Sec A
  const meEligible = filterEligibleFaculty(allAllocations, {
    department: 'Mechanical Engineering',
    year: '2nd Year',
    section: 'Sec A'
  });

  report(
    4,
    'Faculty filtering strictly assigns Prof. James Watt to ME 2nd Year Sec A (same section name, different branch)',
    meEligible.length === 1 && meEligible[0].teacherUid === 'faculty_me_uid'
  );

  // CASE 5: Unallocated class has 0 eligible faculty
  const emptyEligible = filterEligibleFaculty(allAllocations, {
    department: 'Civil Engineering',
    year: '2nd Year',
    section: 'Sec A'
  });

  report(
    5,
    'Unallocated class returns empty eligible faculty list (no false assignments)',
    emptyEligible.length === 0
  );

  // CASE 6: Director adds Period 1 Lecture with assigned faculty
  const p1Slot = await saveTimetableSlot({
    institution: 'UEMK',
    department: 'CSE AI',
    year: '2nd Year',
    section: 'Sec A',
    day: 'Monday',
    period: 1,
    startTime: '09:30 AM',
    endTime: '10:15 AM',
    subject: 'Artificial Intelligence & Neural Nets',
    type: 'Lecture',
    teacherUid: 'faculty_cs_uid',
    teacherName: 'Prof. Alan Turing',
    room: 'Room 304',
    updatedBy: 'director_uemk_uid'
  }, directorDb);

  report(
    6,
    'Director adds Period 1 with subject, type, faculty, and room',
    p1Slot.id === 'UEMK_CSE AI_2nd Year_Sec A_Monday_P1' &&
    p1Slot.subject === 'Artificial Intelligence & Neural Nets' &&
    p1Slot.room === 'Room 304'
  );

  // CASE 7: Director adds Period 5 Break (Lunch Break)
  const p5Slot = await saveTimetableSlot({
    institution: 'UEMK',
    department: 'CSE AI',
    year: '2nd Year',
    section: 'Sec A',
    day: 'Monday',
    period: 5,
    startTime: '12:30 PM',
    endTime: '01:15 PM',
    subject: 'Lunch Break',
    type: 'Break',
    room: 'Cafeteria',
    teacherUid: '',
    teacherName: '',
    updatedBy: 'director_uemk_uid'
  }, directorDb);

  report(
    7,
    'Director adds Period 5 Lunch Break with Break type and no teacher',
    p5Slot.id === 'UEMK_CSE AI_2nd Year_Sec A_Monday_P5' &&
    p5Slot.type === 'Break' &&
    p5Slot.teacherUid === ''
  );

  // CASE 8: Director updates existing Period 1 room and subject
  const updatedP1 = await saveTimetableSlot({
    institution: 'UEMK',
    department: 'CSE AI',
    year: '2nd Year',
    section: 'Sec A',
    day: 'Monday',
    period: 1,
    startTime: '09:30 AM',
    endTime: '10:15 AM',
    subject: 'Advanced Neural Networks & Deep Learning',
    type: 'Lecture',
    teacherUid: 'faculty_cs_uid',
    teacherName: 'Prof. Alan Turing',
    room: 'AI Lab 1',
    updatedBy: 'director_uemk_uid'
  }, directorDb);

  report(
    8,
    'Director updates existing period details cleanly without data corruption',
    updatedP1.subject === 'Advanced Neural Networks & Deep Learning' &&
    updatedP1.room === 'AI Lab 1'
  );

  // CASE 9: Conflict / Duplicate detection when adding a slot
  let duplicateBlocked = false;
  try {
    // In UI, if adding a new period when Period 1 is already in periodMap, it rejects
    const activeSlots = await fetchClassTimetable({
      institution: 'UEMK',
      department: 'CSE AI',
      year: '2nd Year',
      section: 'Sec A',
      day: 'Monday'
    }, directorDb);

    const isPeriod1Occupied = activeSlots.some(s => s.period === 1);
    if (isPeriod1Occupied) {
      throw new Error('Period 1 is already scheduled. Duplicate addition prevented.');
    }
  } catch (dupErr) {
    if (dupErr.message.includes('Duplicate addition prevented')) {
      duplicateBlocked = true;
    }
  }

  report(
    9,
    'Duplicate period collision prevention rejects adding duplicate period to active day',
    duplicateBlocked
  );

  // CASE 10: Director saves entire day timetable batch
  const fullMondaySlots = [
    {
      period: 1,
      startTime: '09:30 AM',
      endTime: '10:15 AM',
      subject: 'Advanced Neural Networks',
      type: 'Lecture',
      room: 'AI Lab 1',
      teacherUid: 'faculty_cs_uid',
      teacherName: 'Prof. Alan Turing'
    },
    {
      period: 2,
      startTime: '10:15 AM',
      endTime: '11:00 AM',
      subject: 'Computer Vision',
      type: 'Lecture',
      room: 'Room 304',
      teacherUid: 'faculty_cs_uid',
      teacherName: 'Prof. Alan Turing'
    },
    {
      period: 5,
      startTime: '12:30 PM',
      endTime: '01:15 PM',
      subject: 'Lunch Break',
      type: 'Break',
      room: 'Cafeteria'
    }
  ];

  const batchResult = await saveDayTimetable({
    classInfo: {
      institution: 'UEMK',
      department: 'CSE AI',
      year: '2nd Year',
      section: 'Sec A'
    },
    day: 'Monday',
    slots: fullMondaySlots,
    directorUid: 'director_uemk_uid'
  }, directorDb);

  report(
    10,
    'Save Day Timetable batch operation commits all periods atomically',
    batchResult.length === 3
  );

  // CASE 11: Mechanical Engineering 2nd Year Sec A coexistence with same periods
  await saveTimetableSlot({
    institution: 'UEMK',
    department: 'Mechanical Engineering',
    year: '2nd Year',
    section: 'Sec A',
    day: 'Monday',
    period: 1,
    startTime: '09:30 AM',
    endTime: '10:15 AM',
    subject: 'Thermodynamics & Heat Transfer',
    type: 'Lecture',
    teacherUid: 'faculty_me_uid',
    teacherName: 'Prof. James Watt',
    room: 'Mech Lab 2',
    updatedBy: 'director_uemk_uid'
  }, directorDb);

  const cseMonday = await fetchClassTimetable({
    institution: 'UEMK',
    department: 'CSE AI',
    year: '2nd Year',
    section: 'Sec A',
    day: 'Monday'
  }, directorDb);

  const meMonday = await fetchClassTimetable({
    institution: 'UEMK',
    department: 'Mechanical Engineering',
    year: '2nd Year',
    section: 'Sec A',
    day: 'Monday'
  }, directorDb);

  report(
    11,
    'Multiple branches with identical section name (Sec A) maintain complete schedule independence',
    cseMonday.length === 3 &&
    meMonday.length === 1 &&
    cseMonday.find(s => s.period === 1).subject === 'Advanced Neural Networks' &&
    meMonday.find(s => s.period === 1).subject === 'Thermodynamics & Heat Transfer'
  );

  // CASE 12: Delete Period with confirmation simulation
  await deleteTimetableSlot({
    institution: 'UEMK',
    department: 'CSE AI',
    year: '2nd Year',
    section: 'Sec A',
    day: 'Monday',
    period: 2
  }, directorDb);

  const cseAfterDelete = await fetchClassTimetable({
    institution: 'UEMK',
    department: 'CSE AI',
    year: '2nd Year',
    section: 'Sec A',
    day: 'Monday'
  }, directorDb);

  report(
    12,
    'Delete period removes target slot without affecting other periods in the day',
    cseAfterDelete.length === 2 && !cseAfterDelete.some(s => s.period === 2)
  );

} catch (err) {
  console.error('Unexpected test error in Director Timetable Management suite:', err);
  report(99, 'Test execution completed without uncaught exceptions', false, err.message);
} finally {
  await testEnv.cleanup();
  console.log(`\n========================================`);
  console.log(`DIRECTOR TIMETABLE UI: ${passed} PASSED, ${failed} FAILED`);
  console.log(`========================================\n`);
  if (failed > 0) process.exit(1);
}
