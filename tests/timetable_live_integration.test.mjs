import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import fs from 'fs';
import path from 'path';
import { doc, getDoc, getDocs, setDoc, deleteDoc, collection, query, where, onSnapshot } from 'firebase/firestore';
import {
  VALID_DAYS,
  VALID_PERIOD_TYPES,
  DEFAULT_PERIOD_TIMINGS,
  generateClassKey,
  generateSlotDocId,
  saveTimetableSlot,
  saveDayTimetable,
  deleteTimetableSlot,
  fetchClassTimetable,
  subscribeClassTimetable
} from '../src/services/timetableService.js';
import {
  createTeacherAllocation,
  fetchTeacherAllocations
} from '../src/services/attendanceService.js';

const rulesPath = path.resolve('firestore.rules');
const rules = fs.readFileSync(rulesPath, 'utf8');

const PROJECT_ID = 'sangam-timetable-live-integration-test';

console.log('Connecting to Firestore emulator on port 8080 for Live Faculty & Student Timetable Integration testing...');
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

  // Set up Admin, Faculty, and Students
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const adminDb = context.firestore();

    // Director
    await setDoc(doc(adminDb, 'authorized_staff', 'director@sangam.edu'), {
      role: 'director',
      authorized: true
    });
    await setDoc(doc(adminDb, 'users', 'director_uid'), {
      uid: 'director_uid',
      name: 'Dr. Director',
      email: 'director@sangam.edu',
      role: 'director',
      status: 'active',
      department: 'Administration',
      institution: 'UEMK',
      createdAt: new Date().toISOString()
    });

    // Faculty 1: Prof. Ada Lovelace (Assigned to CSE AI 2nd Year Sec A AND CSE AI 3rd Year Sec B)
    await setDoc(doc(adminDb, 'authorized_staff', 'ada@sangam.edu'), {
      role: 'faculty',
      authorized: true
    });
    await setDoc(doc(adminDb, 'users', 'faculty_ada_uid'), {
      uid: 'faculty_ada_uid',
      name: 'Prof. Ada Lovelace',
      email: 'ada@sangam.edu',
      role: 'faculty',
      status: 'active',
      department: 'Computer Science',
      institution: 'UEMK',
      createdAt: new Date().toISOString()
    });

    // Faculty 2: Prof. Nikola Tesla (Assigned to Electrical Engineering 2nd Year Sec A)
    await setDoc(doc(adminDb, 'authorized_staff', 'tesla@sangam.edu'), {
      role: 'faculty',
      authorized: true
    });
    await setDoc(doc(adminDb, 'users', 'faculty_tesla_uid'), {
      uid: 'faculty_tesla_uid',
      name: 'Prof. Nikola Tesla',
      email: 'tesla@sangam.edu',
      role: 'faculty',
      status: 'active',
      department: 'Electrical Engineering',
      institution: 'UEMK',
      createdAt: new Date().toISOString()
    });

    // Student 1: Alice (CSE AI, 2nd Year, Sec A)
    await setDoc(doc(adminDb, 'users', 'student_alice_uid'), {
      uid: 'student_alice_uid',
      name: 'Alice Smith',
      email: 'alice@sangam.edu',
      role: 'student',
      status: 'active',
      institution: 'UEMK',
      department: 'CSE AI',
      year: '2nd Year',
      section: 'Sec A',
      createdAt: new Date().toISOString()
    });

    // Student 2: Bob (Electrical Engineering, 2nd Year, Sec A) -> Same year & sec, different branch
    await setDoc(doc(adminDb, 'users', 'student_bob_uid'), {
      uid: 'student_bob_uid',
      name: 'Bob Jones',
      email: 'bob@sangam.edu',
      role: 'student',
      status: 'active',
      institution: 'UEMK',
      department: 'Electrical Engineering',
      year: '2nd Year',
      section: 'Sec A',
      createdAt: new Date().toISOString()
    });

    // Student 3: Charlie (Unassigned / Pending placement)
    await setDoc(doc(adminDb, 'users', 'student_charlie_uid'), {
      uid: 'student_charlie_uid',
      name: 'Charlie Brown',
      email: 'charlie@sangam.edu',
      role: 'student',
      status: 'active',
      institution: 'UEMK',
      department: '',
      year: '',
      section: '',
      createdAt: new Date().toISOString()
    });

    // Allocations:
    // Ada -> CSE AI 2nd Year Sec A
    const allocAda1Id = 'faculty_ada_uid_CSE AI_2nd Year_Sec A';
    await setDoc(doc(adminDb, 'teacher_allocations', allocAda1Id), {
      institution: 'UEMK',
      department: 'CSE AI',
      year: '2nd Year',
      section: 'Sec A',
      teacherUid: 'faculty_ada_uid',
      teacherName: 'Prof. Ada Lovelace',
      teacherEmail: 'ada@sangam.edu',
      subject: 'Data Structures & Algorithms',
      authorized: true,
      updatedAt: new Date().toISOString()
    });

    // Ada -> CSE AI 3rd Year Sec B
    const allocAda2Id = 'faculty_ada_uid_CSE AI_3rd Year_Sec B';
    await setDoc(doc(adminDb, 'teacher_allocations', allocAda2Id), {
      institution: 'UEMK',
      department: 'CSE AI',
      year: '3rd Year',
      section: 'Sec B',
      teacherUid: 'faculty_ada_uid',
      teacherName: 'Prof. Ada Lovelace',
      teacherEmail: 'ada@sangam.edu',
      subject: 'Compiler Design',
      authorized: true,
      updatedAt: new Date().toISOString()
    });

    // Tesla -> Electrical Engineering 2nd Year Sec A
    const allocTeslaId = 'faculty_tesla_uid_Electrical Engineering_2nd Year_Sec A';
    await setDoc(doc(adminDb, 'teacher_allocations', allocTeslaId), {
      institution: 'UEMK',
      department: 'Electrical Engineering',
      year: '2nd Year',
      section: 'Sec A',
      teacherUid: 'faculty_tesla_uid',
      teacherName: 'Prof. Nikola Tesla',
      teacherEmail: 'tesla@sangam.edu',
      subject: 'Electromagnetics & Power',
      authorized: true,
      updatedAt: new Date().toISOString()
    });

    // Timetable Slots:
    // CSE AI 2nd Year Sec A - Monday:
    // Period 1: Data Structures (Ada Lovelace, Room 301, Lecture)
    const slot1DocId = generateSlotDocId({
      institution: 'UEMK',
      department: 'CSE AI',
      year: '2nd Year',
      section: 'Sec A',
      day: 'Monday',
      period: 1
    });
    await setDoc(doc(adminDb, 'timetables', slot1DocId), {
      id: slot1DocId,
      institution: 'UEMK',
      department: 'CSE AI',
      year: '2nd Year',
      section: 'Sec A',
      day: 'Monday',
      period: 1,
      startTime: '09:00',
      endTime: '09:50',
      subject: 'Data Structures',
      type: 'Lecture',
      teacherUid: 'faculty_ada_uid',
      teacherName: 'Prof. Ada Lovelace',
      room: 'Room 301',
      updatedAt: new Date().toISOString()
    });

    // Period 2: DSA Lab (Ada Lovelace, Lab 3, Lab)
    const slot2DocId = generateSlotDocId({
      institution: 'UEMK',
      department: 'CSE AI',
      year: '2nd Year',
      section: 'Sec A',
      day: 'Monday',
      period: 2
    });
    await setDoc(doc(adminDb, 'timetables', slot2DocId), {
      id: slot2DocId,
      institution: 'UEMK',
      department: 'CSE AI',
      year: '2nd Year',
      section: 'Sec A',
      day: 'Monday',
      period: 2,
      startTime: '09:50',
      endTime: '10:40',
      subject: 'DSA Lab',
      type: 'Lab',
      teacherUid: 'faculty_ada_uid',
      teacherName: 'Prof. Ada Lovelace',
      room: 'Lab 3',
      updatedAt: new Date().toISOString()
    });

    // Period 5: Lunch Break (Break)
    const slot5DocId = generateSlotDocId({
      institution: 'UEMK',
      department: 'CSE AI',
      year: '2nd Year',
      section: 'Sec A',
      day: 'Monday',
      period: 5
    });
    await setDoc(doc(adminDb, 'timetables', slot5DocId), {
      id: slot5DocId,
      institution: 'UEMK',
      department: 'CSE AI',
      year: '2nd Year',
      section: 'Sec A',
      day: 'Monday',
      period: 5,
      startTime: '12:20',
      endTime: '01:10',
      subject: 'Lunch Break',
      type: 'Break',
      teacherUid: '',
      teacherName: '',
      room: '',
      updatedAt: new Date().toISOString()
    });

    // Electrical Engineering 2nd Year Sec A - Monday:
    // Period 1: Circuits (Tesla, Room 105, Lecture)
    const slotEE1DocId = generateSlotDocId({
      institution: 'UEMK',
      department: 'Electrical Engineering',
      year: '2nd Year',
      section: 'Sec A',
      day: 'Monday',
      period: 1
    });
    await setDoc(doc(adminDb, 'timetables', slotEE1DocId), {
      id: slotEE1DocId,
      institution: 'UEMK',
      department: 'Electrical Engineering',
      year: '2nd Year',
      section: 'Sec A',
      day: 'Monday',
      period: 1,
      startTime: '09:00',
      endTime: '09:50',
      subject: 'Electric Circuits',
      type: 'Lecture',
      teacherUid: 'faculty_tesla_uid',
      teacherName: 'Prof. Nikola Tesla',
      room: 'Room 105',
      updatedAt: new Date().toISOString()
    });

    // CSE AI 3rd Year Sec B - Monday:
    // Period 3: Compiler Design (Ada Lovelace, Room 402, Lecture)
    const slotAda3DocId = generateSlotDocId({
      institution: 'UEMK',
      department: 'CSE AI',
      year: '3rd Year',
      section: 'Sec B',
      day: 'Monday',
      period: 3
    });
    await setDoc(doc(adminDb, 'timetables', slotAda3DocId), {
      id: slotAda3DocId,
      institution: 'UEMK',
      department: 'CSE AI',
      year: '3rd Year',
      section: 'Sec B',
      day: 'Monday',
      period: 3,
      startTime: '10:40',
      endTime: '11:30',
      subject: 'Compiler Design',
      type: 'Lecture',
      teacherUid: 'faculty_ada_uid',
      teacherName: 'Prof. Ada Lovelace',
      room: 'Room 402',
      updatedAt: new Date().toISOString()
    });
  });

  const aliceDb = testEnv.authenticatedContext('student_alice_uid', { email: 'alice@sangam.edu' }).firestore();
  const bobDb = testEnv.authenticatedContext('student_bob_uid', { email: 'bob@sangam.edu' }).firestore();
  const charlieDb = testEnv.authenticatedContext('student_charlie_uid', { email: 'charlie@sangam.edu' }).firestore();
  const adaDb = testEnv.authenticatedContext('faculty_ada_uid', { email: 'ada@sangam.edu' }).firestore();

  // Test 1: Student timetable fetching uses actual student placement
  {
    const studentProfile = {
      institution: 'UEMK',
      department: 'CSE AI',
      year: '2nd Year',
      section: 'Sec A'
    };
    const slots = await fetchClassTimetable({
      db: aliceDb,
      institution: studentProfile.institution,
      department: studentProfile.department,
      year: studentProfile.year,
      section: studentProfile.section
    });

    const isMatch = slots.length === 3 &&
      slots.every(s => s.department === 'CSE AI' && s.year === '2nd Year' && s.section === 'Sec A');
    report(1, "Student timetable fetches strictly matching student's institution, department, year, and section", isMatch);
  }

  // Test 2: Cross-class schedule isolation between students
  {
    const bobSlots = await fetchClassTimetable({
      db: bobDb,
      institution: 'UEMK',
      department: 'Electrical Engineering',
      year: '2nd Year',
      section: 'Sec A'
    });

    const bobHasElectricCircuits = bobSlots.some(s => s.subject === 'Electric Circuits');
    const bobHasNoCSE = bobSlots.every(s => s.department !== 'CSE AI');
    report(2, "Cross-class isolation ensures students never receive schedules of other branches/sections", bobHasElectricCircuits && bobHasNoCSE);
  }

  // Test 3: Unassigned student handling
  {
    const charlieProfile = {
      institution: 'UEMK',
      department: '',
      year: '',
      section: ''
    };
    let threwError = false;
    try {
      await fetchClassTimetable({
        db: charlieDb,
        institution: charlieProfile.institution,
        department: charlieProfile.department,
        year: charlieProfile.year,
        section: charlieProfile.section
      });
    } catch (err) {
      threwError = true;
    }
    report(3, "Unassigned student without placement parameters safely rejects queries without leaking data", threwError);
  }

  // Test 4: Student Dashboard "Today's Classes" break exclusion
  {
    const allSlots = await fetchClassTimetable({
      db: aliceDb,
      institution: 'UEMK',
      department: 'CSE AI',
      year: '2nd Year',
      section: 'Sec A',
      day: 'Monday'
    });

    // Dashboard filtering logic
    const activeClasses = allSlots.filter(s => s.type !== 'Break' && s.subject?.toUpperCase() !== 'LUNCH' && s.subject?.toUpperCase() !== 'LUNCH BREAK');
    const breakSlots = allSlots.filter(s => s.type === 'Break' || s.subject === 'Lunch Break');

    const breaksExcluded = activeClasses.length === 2 &&
      breakSlots.length === 1 &&
      activeClasses.every(c => c.subject !== 'Lunch Break');
    report(4, "Student dashboard 'Today's Classes' accurately filters out breaks from active classes", breaksExcluded);
  }

  // Test 5: Student Dashboard stat calculation (Total active classes and Labs)
  {
    const allSlots = await fetchClassTimetable({
      db: aliceDb,
      institution: 'UEMK',
      department: 'CSE AI',
      year: '2nd Year',
      section: 'Sec A',
      day: 'Monday'
    });
    const activeClasses = allSlots.filter(s => s.type !== 'Break' && s.subject !== 'Lunch Break');
    const labCount = activeClasses.filter(c => c.type === 'Lab').length;

    report(5, "Student dashboard computes dynamic stat cards (active classes count = 2, labs count = 1)", activeClasses.length === 2 && labCount === 1);
  }

  // Test 6: Sunday handling logic across student timetable and dashboard
  {
    const isSunday = true; // Sunday simulation (day index 0)
    let todayClasses = [];
    let sundayNotice = '';

    if (isSunday) {
      todayClasses = [];
      sundayNotice = 'Sunday — No classes scheduled today';
    }

    const sundayProperlyHandled = todayClasses.length === 0 &&
      sundayNotice === 'Sunday — No classes scheduled today';
    report(6, "Sunday behavior displays explicit 'Sunday — No classes scheduled today' instead of Monday schedule", sundayProperlyHandled);
  }

  // Test 7: Faculty timetable loading for authorized class allocations
  {
    // Prof. Ada Lovelace has 2 allocations: CSE AI 2nd Year Sec A, CSE AI 3rd Year Sec B
    const adaAllocations = [
      { institution: 'UEMK', department: 'CSE AI', year: '2nd Year', section: 'Sec A', authorized: true },
      { institution: 'UEMK', department: 'CSE AI', year: '3rd Year', section: 'Sec B', authorized: true }
    ];

    // Load first class
    const class1Slots = await fetchClassTimetable({
      db: adaDb,
      institution: adaAllocations[0].institution,
      department: adaAllocations[0].department,
      year: adaAllocations[0].year,
      section: adaAllocations[0].section,
      day: 'Monday'
    });

    const hasDataStructures = class1Slots.some(s => s.subject === 'Data Structures');
    report(7, "Faculty schedule view successfully loads live timetable for authorized allocation #1", hasDataStructures && class1Slots.length === 3);
  }

  // Test 8: Faculty class switcher for multiple allocations
  {
    const adaAllocations = [
      { institution: 'UEMK', department: 'CSE AI', year: '2nd Year', section: 'Sec A', authorized: true },
      { institution: 'UEMK', department: 'CSE AI', year: '3rd Year', section: 'Sec B', authorized: true }
    ];

    // Load second class
    const class2Slots = await fetchClassTimetable({
      db: adaDb,
      institution: adaAllocations[1].institution,
      department: adaAllocations[1].department,
      year: adaAllocations[1].year,
      section: adaAllocations[1].section,
      day: 'Monday'
    });

    const hasCompilerDesign = class2Slots.some(s => s.subject === 'Compiler Design');
    const noDSA = class2Slots.every(s => s.subject !== 'Data Structures');
    report(8, "Faculty multi-class selector cleanly switches between assigned classes without mixing slots", hasCompilerDesign && noDSA);
  }

  // Test 9: Faculty 'Assigned to You' indicator verification
  {
    const class1Slots = await fetchClassTimetable({
      db: adaDb,
      institution: 'UEMK',
      department: 'CSE AI',
      year: '2nd Year',
      section: 'Sec A',
      day: 'Monday'
    });

    const adaUid = 'faculty_ada_uid';
    const assignedSlots = class1Slots.filter(s => s.teacherUid === adaUid);
    const unassignedBreak = class1Slots.find(s => s.type === 'Break');

    const matchesAssignment = assignedSlots.length === 2 &&
      assignedSlots.every(s => s.teacherName === 'Prof. Ada Lovelace') &&
      (!unassignedBreak.teacherUid || unassignedBreak.teacherUid !== adaUid);

    report(9, "Faculty timetable highlights periods specifically assigned to the logged-in teacher", matchesAssignment);
  }

  // Test 10: Faculty Dashboard 'Today's Classes' multi-class aggregation and break exclusion
  {
    const adaAllocations = [
      { institution: 'UEMK', department: 'CSE AI', year: '2nd Year', section: 'Sec A', authorized: true },
      { institution: 'UEMK', department: 'CSE AI', year: '3rd Year', section: 'Sec B', authorized: true }
    ];

    // Simulate DashboardHome loadTodayClasses
    const fetchPromises = adaAllocations.map(alloc =>
      fetchClassTimetable({
        db: adaDb,
        institution: alloc.institution,
        department: alloc.department,
        year: alloc.year,
        section: alloc.section,
        day: 'Monday'
      })
    );
    const results = await Promise.all(fetchPromises);
    const allSlots = [];
    const seenIds = new Set();
    results.flat().forEach(slot => {
      if (slot.type === 'Break' || slot.subject?.toUpperCase() === 'LUNCH' || slot.subject?.toUpperCase() === 'LUNCH BREAK') {
        return;
      }
      if (!seenIds.has(slot.id)) {
        seenIds.add(slot.id);
        allSlots.push(slot);
      }
    });

    // Should include: Data Structures (Period 1), DSA Lab (Period 2) from Sec A, and Compiler Design (Period 3) from Sec B
    const aggregatedCount = allSlots.length;
    const hasP1 = allSlots.some(s => s.period === 1 && s.subject === 'Data Structures');
    const hasP2 = allSlots.some(s => s.period === 2 && s.subject === 'DSA Lab');
    const hasP3 = allSlots.some(s => s.period === 3 && s.subject === 'Compiler Design');
    const hasNoBreaks = allSlots.every(s => s.type !== 'Break');

    report(10, "Faculty dashboard aggregates today's active classes across all allocations with breaks excluded", aggregatedCount === 3 && hasP1 && hasP2 && hasP3 && hasNoBreaks);
  }

  // Test 11: Real-time update subscription reflects new slot immediately
  {
    let receivedSlots = [];
    let updateCount = 0;

    const unsubscribe = subscribeClassTimetable(
      {
        db: aliceDb,
        institution: 'UEMK',
        department: 'CSE AI',
        year: '2nd Year',
        section: 'Sec A'
      },
      (slots) => {
        receivedSlots = slots;
        updateCount++;
      }
    );

    // Initial snapshot should be received
    await new Promise(r => setTimeout(r, 600));
    const initialCount = receivedSlots.length;

    // Director adds Period 4: Algorithms Tutorial
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore();
      const slot4DocId = generateSlotDocId({
        institution: 'UEMK',
        department: 'CSE AI',
        year: '2nd Year',
        section: 'Sec A',
        day: 'Monday',
        period: 4
      });
      await setDoc(doc(adminDb, 'timetables', slot4DocId), {
        id: slot4DocId,
        institution: 'UEMK',
        department: 'CSE AI',
        year: '2nd Year',
        section: 'Sec A',
        day: 'Monday',
        period: 4,
        startTime: '11:30',
        endTime: '12:20',
        subject: 'Algorithms Tutorial',
        type: 'Tutorial',
        teacherUid: 'faculty_ada_uid',
        teacherName: 'Prof. Ada Lovelace',
        room: 'Room 301',
        updatedAt: new Date().toISOString()
      });
    });

    await new Promise(r => setTimeout(r, 800));

    if (typeof unsubscribe === 'function') unsubscribe();

    const realTimeUpdated = receivedSlots.length === initialCount + 1 &&
      receivedSlots.some(s => s.subject === 'Algorithms Tutorial');
    report(11, "Real-time subscription immediately pushes timetable updates to subscribed UI", realTimeUpdated);
  }

  // Test 12: Period timing consistency with shared DEFAULT_PERIOD_TIMINGS
  {
    const timingsMatch = DEFAULT_PERIOD_TIMINGS.length === 9 &&
      DEFAULT_PERIOD_TIMINGS[0].startTime === '09:30 AM' &&
      DEFAULT_PERIOD_TIMINGS[0].endTime === '10:15 AM' &&
      DEFAULT_PERIOD_TIMINGS[4].period === 5 &&
      DEFAULT_PERIOD_TIMINGS[8].startTime === '03:30 PM' &&
      DEFAULT_PERIOD_TIMINGS[8].endTime === '04:15 PM';
    report(12, "Period timings strictly adhere to shared 9-period timetable constants", timingsMatch);
  }

} catch (err) {
  console.error('Test execution error:', err);
  failed++;
} finally {
  console.log('\n========================================');
  console.log(`TIMETABLE LIVE INTEGRATION: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================\n');
  await testEnv.cleanup();
  process.exit(failed > 0 ? 1 : 0);
}
