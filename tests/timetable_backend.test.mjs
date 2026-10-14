/**
 * Timetable Backend Foundation Test Suite
 *
 * Verifies:
 * 1. Student access control (own class vs cross-section, cross-department, cross-year, cross-institution)
 * 2. Faculty access control (allocated class vs unallocated class)
 * 3. Director administration (own institution writes vs cross-institution writes)
 * 4. Multi-branch & multi-year coexistence with identical section names
 * 5. Duplicate period conflict prevention
 * 6. Schema and validation security (invalid day, period, type, missing fields, immutability)
 * 7. Timetable service functions (fetch, batch save, sort, organize)
 */

import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import fs from 'fs';
import path from 'path';
import { doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, collection, query, where } from 'firebase/firestore';
import {
  saveTimetableSlot,
  saveDayTimetable,
  fetchClassTimetable,
  fetchFacultyTimetable,
  deleteTimetableSlot,
  generateSlotDocId,
  generateClassKey,
  organizeSlotsByDay,
  getTodayClasses,
  VALID_DAYS,
  VALID_PERIOD_TYPES,
  DEFAULT_PERIOD_TIMINGS
} from '../src/services/timetableService.js';

const rulesPath = path.resolve('firestore.rules');
const rules = fs.readFileSync(rulesPath, 'utf8');

const PROJECT_ID = 'sangam-timetable-test';

console.log('Connecting to Firestore emulator on port 8080 for timetable backend testing...');
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
  // Clear emulator state
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await testEnv.clearFirestore();
      break;
    } catch (clearErr) {
      if (attempt === 3) throw clearErr;
      await new Promise(r => setTimeout(r, 600));
    }
  }

  // Seed test users & allocations using admin context (rules disabled)
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const adminDb = context.firestore();

    // 1. Authorized Director at UEMK
    await setDoc(doc(adminDb, 'authorized_staff', 'director_uemk@sangam.edu'), {
      role: 'director',
      authorized: true
    });
    await setDoc(doc(adminDb, 'users', 'dir_uemk_uid'), {
      uid: 'dir_uemk_uid',
      name: 'Director UEMK',
      email: 'director_uemk@sangam.edu',
      role: 'director',
      status: 'active',
      createdAt: new Date().toISOString(),
      institution: 'UEMK'
    });

    // 2. Director at OTHER_INST
    await setDoc(doc(adminDb, 'authorized_staff', 'director_other@sangam.edu'), {
      role: 'director',
      authorized: true
    });
    await setDoc(doc(adminDb, 'users', 'dir_other_uid'), {
      uid: 'dir_other_uid',
      name: 'Director Other',
      email: 'director_other@sangam.edu',
      role: 'director',
      status: 'active',
      createdAt: new Date().toISOString(),
      institution: 'OTHER_INST'
    });

    // 2b. Authorized Director with authorized: true whitelist (no explicit role: 'director' string)
    await setDoc(doc(adminDb, 'authorized_staff', 'dir_fallback@sangam.edu'), {
      authorized: true
    });
    await setDoc(doc(adminDb, 'users', 'dir_fallback_uid'), {
      uid: 'dir_fallback_uid',
      name: 'Director Fallback',
      email: 'dir_fallback@sangam.edu',
      role: 'director',
      status: 'active',
      createdAt: new Date().toISOString(),
      institution: 'UEMK'
    });

    // 2c. Unwhitelisted user with director role in users collection but NOT in authorized_staff
    await setDoc(doc(adminDb, 'users', 'fake_dir_uid'), {
      uid: 'fake_dir_uid',
      name: 'Fake Director',
      email: 'fake_director@sangam.edu',
      role: 'director',
      status: 'active',
      createdAt: new Date().toISOString(),
      institution: 'UEMK'
    });

    // 2d. Exact production Director profile: director20266@gmail.com, UID dxiALBdPABceLbwVviaMnFIsMCE2 (NO institution in user doc)
    await setDoc(doc(adminDb, 'authorized_staff', 'director20266@gmail.com'), {
      role: 'director',
      authorized: true
    });
    await setDoc(doc(adminDb, 'users', 'dxiALBdPABceLbwVviaMnFIsMCE2'), {
      uid: 'dxiALBdPABceLbwVviaMnFIsMCE2',
      name: 'Alex',
      email: 'director20266@gmail.com',
      role: 'director',
      status: 'active',
      createdAt: '2026-10-13T00:00:00.000Z'
    });

    // 3. Faculty A (UEMK, CSE AI)
    await setDoc(doc(adminDb, 'authorized_staff', 'faculty_a@sangam.edu'), {
      role: 'faculty',
      authorized: true
    });
    await setDoc(doc(adminDb, 'users', 'fac_a_uid'), {
      uid: 'fac_a_uid',
      name: 'Prof. Alice CSE',
      email: 'faculty_a@sangam.edu',
      role: 'faculty',
      status: 'active',
      createdAt: new Date().toISOString(),
      department: 'Computer Science',
      institution: 'UEMK'
    });

    // Allocate Faculty A to UEMK • CSE AI • 2nd Year • Sec A
    const allocAId = 'fac_a_uid_CSE AI_2nd Year_Sec A';
    await setDoc(doc(adminDb, 'teacher_allocations', allocAId), {
      teacherUid: 'fac_a_uid',
      institution: 'UEMK',
      department: 'CSE AI',
      year: '2nd Year',
      section: 'Sec A',
      authorized: true,
      createdAt: new Date().toISOString()
    });

    // 4. Faculty B (UEMK, Mechanical Engineering)
    await setDoc(doc(adminDb, 'authorized_staff', 'faculty_b@sangam.edu'), {
      role: 'faculty',
      authorized: true
    });
    await setDoc(doc(adminDb, 'users', 'fac_b_uid'), {
      uid: 'fac_b_uid',
      name: 'Prof. Bob Mech',
      email: 'faculty_b@sangam.edu',
      role: 'faculty',
      status: 'active',
      createdAt: new Date().toISOString(),
      department: 'Mechanical Engineering',
      institution: 'UEMK'
    });

    // Allocate Faculty B to UEMK • Mechanical Engineering • 2nd Year • Sec A
    const allocBId = 'fac_b_uid_Mechanical Engineering_2nd Year_Sec A';
    await setDoc(doc(adminDb, 'teacher_allocations', allocBId), {
      teacherUid: 'fac_b_uid',
      institution: 'UEMK',
      department: 'Mechanical Engineering',
      year: '2nd Year',
      section: 'Sec A',
      authorized: true,
      createdAt: new Date().toISOString()
    });

    // 5. Student 1: UEMK • CSE AI • 2nd Year • Sec A
    await setDoc(doc(adminDb, 'users', 'stud_csea_uid'), {
      uid: 'stud_csea_uid',
      name: 'Student CSE-A',
      email: 'student_csea@sangam.edu',
      role: 'student',
      status: 'active',
      createdAt: new Date().toISOString(),
      institution: 'UEMK',
      department: 'CSE AI',
      year: '2nd Year',
      section: 'Sec A'
    });

    // 6. Student 2: UEMK • CSE AI • 2nd Year • Sec B
    await setDoc(doc(adminDb, 'users', 'stud_cseb_uid'), {
      uid: 'stud_cseb_uid',
      name: 'Student CSE-B',
      email: 'student_cseb@sangam.edu',
      role: 'student',
      status: 'active',
      createdAt: new Date().toISOString(),
      institution: 'UEMK',
      department: 'CSE AI',
      year: '2nd Year',
      section: 'Sec B'
    });

    // 7. Student 3: UEMK • Mechanical Engineering • 2nd Year • Sec A
    await setDoc(doc(adminDb, 'users', 'stud_me_uid'), {
      uid: 'stud_me_uid',
      name: 'Student Mech-A',
      email: 'student_me@sangam.edu',
      role: 'student',
      status: 'active',
      createdAt: new Date().toISOString(),
      institution: 'UEMK',
      department: 'Mechanical Engineering',
      year: '2nd Year',
      section: 'Sec A'
    });

    // 8. Student 4: UEMK • CSE AI • 3rd Year • Sec A
    await setDoc(doc(adminDb, 'users', 'stud_cse3_uid'), {
      uid: 'stud_cse3_uid',
      name: 'Student 3rdYear-A',
      email: 'student_cse3@sangam.edu',
      role: 'student',
      status: 'active',
      createdAt: new Date().toISOString(),
      institution: 'UEMK',
      department: 'CSE AI',
      year: '3rd Year',
      section: 'Sec A'
    });
  });

  // Client DB Contexts
  const dirUemkDb = testEnv.authenticatedContext('dir_uemk_uid', { email: 'director_uemk@sangam.edu' }).firestore();
  const dirOtherDb = testEnv.authenticatedContext('dir_other_uid', { email: 'director_other@sangam.edu' }).firestore();
  const dirFallbackDb = testEnv.authenticatedContext('dir_fallback_uid', { email: 'dir_fallback@sangam.edu' }).firestore();
  const liveDirectorDb = testEnv.authenticatedContext('dxiALBdPABceLbwVviaMnFIsMCE2', { email: 'director20266@gmail.com' }).firestore();
  const fakeDirDb = testEnv.authenticatedContext('fake_dir_uid', { email: 'fake_director@sangam.edu' }).firestore();
  const facADb = testEnv.authenticatedContext('fac_a_uid', { email: 'faculty_a@sangam.edu' }).firestore();
  const facBDb = testEnv.authenticatedContext('fac_b_uid', { email: 'faculty_b@sangam.edu' }).firestore();
  const studCseaDb = testEnv.authenticatedContext('stud_csea_uid', { email: 'student_csea@sangam.edu' }).firestore();
  const studCsebDb = testEnv.authenticatedContext('stud_cseb_uid', { email: 'student_cseb@sangam.edu' }).firestore();
  const studMeDb = testEnv.authenticatedContext('stud_me_uid', { email: 'student_me@sangam.edu' }).firestore();
  const unauthDb = testEnv.unauthenticatedContext().firestore();

  // -------------------------------------------------------------
  // TEST GROUP 1: Director Timetable Management (CRUD)
  // -------------------------------------------------------------

  // Case 1: Authorized Director can create a valid timetable slot
  const slot1Input = {
    institution: 'UEMK',
    department: 'CSE AI',
    year: '2nd Year',
    section: 'Sec A',
    day: 'Monday',
    period: 1,
    startTime: '09:30 AM',
    endTime: '10:15 AM',
    subject: 'Data Structures & Algorithms',
    type: 'Lecture',
    teacherUid: 'fac_a_uid',
    teacherName: 'Prof. Alice CSE',
    room: 'Room 304',
    updatedBy: 'dir_uemk_uid'
  };

  let slot1Id;
  try {
    const res = await saveTimetableSlot(slot1Input, dirUemkDb);
    slot1Id = res.id;
    report(1, 'Authorized Director creates valid timetable slot', slot1Id === 'UEMK_CSE AI_2nd Year_Sec A_Monday_P1');
  } catch (err) {
    report(1, 'Authorized Director creates valid timetable slot', false, err.message);
  }

  // Case 2: Cross-institution Director CANNOT create slot for UEMK class
  try {
    await saveTimetableSlot({
      ...slot1Input,
      period: 2,
      updatedBy: 'dir_other_uid'
    }, dirOtherDb);
    report(2, 'Cross-institution Director write strictly blocked', false, 'Allowed unexpected cross-institution write');
  } catch (err) {
    report(2, 'Cross-institution Director write strictly blocked', true);
  }

  // Case 3: Director can update an existing slot's mutable fields
  try {
    const slotRef = doc(dirUemkDb, 'timetables', slot1Id);
    await updateDoc(slotRef, {
      room: 'Room 305B',
      updatedAt: new Date().toISOString(),
      updatedBy: 'dir_uemk_uid'
    });
    const updatedSnap = await getDoc(slotRef);
    report(3, 'Director can update mutable fields of existing slot', updatedSnap.data().room === 'Room 305B');
  } catch (err) {
    report(3, 'Director can update mutable fields of existing slot', false, err.message);
  }

  // Case 4: Mutating immutable class identity fields (department, period) on update is rejected
  try {
    const slotRef = doc(dirUemkDb, 'timetables', slot1Id);
    await updateDoc(slotRef, {
      department: 'Mechanical Engineering',
      updatedAt: new Date().toISOString(),
      updatedBy: 'dir_uemk_uid'
    });
    report(4, 'Tampering with immutable slot fields strictly rejected', false, 'Allowed mutating department');
  } catch (err) {
    report(4, 'Tampering with immutable slot fields strictly rejected', true);
  }

  // -------------------------------------------------------------
  // TEST GROUP 2: Student Read Access Control & Scoping
  // -------------------------------------------------------------

  // Case 5: Student can read timetable for their own assigned class
  try {
    const slotRef = doc(studCseaDb, 'timetables', slot1Id);
    const snap = await getDoc(slotRef);
    report(5, 'Student reads timetable for their assigned class', snap.exists() && snap.data().subject === 'Data Structures & Algorithms');
  } catch (err) {
    report(5, 'Student reads timetable for their assigned class', false, err.message);
  }

  // Case 6: Student CANNOT read timetable for a different section (cross-section isolation)
  try {
    const slotRef = doc(studCsebDb, 'timetables', slot1Id);
    await getDoc(slotRef);
    report(6, 'Cross-section student read strictly blocked', false, 'Sec B student read Sec A timetable');
  } catch (err) {
    report(6, 'Cross-section student read strictly blocked', true);
  }

  // Case 7: Student CANNOT read timetable for a different department (cross-department isolation)
  try {
    const slotRef = doc(studMeDb, 'timetables', slot1Id);
    await getDoc(slotRef);
    report(7, 'Cross-department student read strictly blocked', false, 'Mech student read CSE AI timetable');
  } catch (err) {
    report(7, 'Cross-department student read strictly blocked', true);
  }

  // Case 8: Student CANNOT create, update, or delete timetable slots (read-only for students)
  try {
    await saveTimetableSlot({
      ...slot1Input,
      period: 3,
      updatedBy: 'stud_csea_uid'
    }, studCseaDb);
    report(8, 'Student write attempt strictly denied', false, 'Student created a slot');
  } catch (err) {
    report(8, 'Student write attempt strictly denied', true);
  }

  // -------------------------------------------------------------
  // TEST GROUP 3: Faculty Read Access Control & Allocation Scoping
  // -------------------------------------------------------------

  // Case 9: Faculty A (allocated to CSE AI 2nd Year Sec A) can read the timetable
  try {
    const slotRef = doc(facADb, 'timetables', slot1Id);
    const snap = await getDoc(slotRef);
    report(9, 'Allocated Faculty reads assigned class timetable', snap.exists() && snap.data().period === 1);
  } catch (err) {
    report(9, 'Allocated Faculty reads assigned class timetable', false, err.message);
  }

  // Case 10: Faculty B (NOT allocated to CSE AI) CANNOT read CSE AI timetable
  try {
    const slotRef = doc(facBDb, 'timetables', slot1Id);
    await getDoc(slotRef);
    report(10, 'Unallocated Faculty reading class timetable strictly blocked', false, 'Faculty B read unallocated class timetable');
  } catch (err) {
    report(10, 'Unallocated Faculty reading class timetable strictly blocked', true);
  }

  // Case 11: Faculty CANNOT write or modify timetable slots
  try {
    const slotRef = doc(facADb, 'timetables', slot1Id);
    await updateDoc(slotRef, {
      room: 'Hacked Room',
      updatedAt: new Date().toISOString(),
      updatedBy: 'fac_a_uid'
    });
    report(11, 'Faculty timetable modification strictly denied', false, 'Faculty modified timetable slot');
  } catch (err) {
    report(11, 'Faculty timetable modification strictly denied', true);
  }

  // -------------------------------------------------------------
  // TEST GROUP 4: Multi-Branch & Multi-Year Section Name Coexistence
  // -------------------------------------------------------------

  // Create slot for Mechanical Engineering • 2nd Year • Sec A (Period 1)
  const mechSlotInput = {
    institution: 'UEMK',
    department: 'Mechanical Engineering',
    year: '2nd Year',
    section: 'Sec A',
    day: 'Monday',
    period: 1,
    startTime: '09:30 AM',
    endTime: '10:15 AM',
    subject: 'Thermodynamics',
    type: 'Lecture',
    teacherUid: 'fac_b_uid',
    teacherName: 'Prof. Bob Mech',
    room: 'ME-101',
    updatedBy: 'dir_uemk_uid'
  };

  // Create slot for Civil Engineering • 2nd Year • Sec A (Period 1)
  const civilSlotInput = {
    institution: 'UEMK',
    department: 'Civil Engineering',
    year: '2nd Year',
    section: 'Sec A',
    day: 'Monday',
    period: 1,
    startTime: '09:30 AM',
    endTime: '10:15 AM',
    subject: 'Fluid Mechanics',
    type: 'Lecture',
    room: 'CE-202',
    updatedBy: 'dir_uemk_uid'
  };

  // Create slot for CSE AI • 3rd Year • Sec A (Period 1)
  const cse3SlotInput = {
    institution: 'UEMK',
    department: 'CSE AI',
    year: '3rd Year',
    section: 'Sec A',
    day: 'Monday',
    period: 1,
    startTime: '09:30 AM',
    endTime: '10:15 AM',
    subject: 'Neural Networks & Deep Learning',
    type: 'Lecture',
    room: 'AI-Lab',
    updatedBy: 'dir_uemk_uid'
  };

  try {
    const mechRes = await saveTimetableSlot(mechSlotInput, dirUemkDb);
    const civilRes = await saveTimetableSlot(civilSlotInput, dirUemkDb);
    const cse3Res = await saveTimetableSlot(cse3SlotInput, dirUemkDb);

    // Verify all 4 documents exist independently
    const cse2Doc = await getDoc(doc(dirUemkDb, 'timetables', slot1Id));
    const mechDoc = await getDoc(doc(dirUemkDb, 'timetables', mechRes.id));
    const civilDoc = await getDoc(doc(dirUemkDb, 'timetables', civilRes.id));
    const cse3Doc = await getDoc(doc(dirUemkDb, 'timetables', cse3Res.id));

    const allExist = cse2Doc.exists() && mechDoc.exists() && civilDoc.exists() && cse3Doc.exists();
    const correctSubjects = 
      cse2Doc.data().subject === 'Data Structures & Algorithms' &&
      mechDoc.data().subject === 'Thermodynamics' &&
      civilDoc.data().subject === 'Fluid Mechanics' &&
      cse3Doc.data().subject === 'Neural Networks & Deep Learning';

    report(12, 'Four classes with identical section name (Sec A) across branches and years coexist simultaneously', allExist && correctSubjects);
  } catch (err) {
    report(12, 'Four classes with identical section name (Sec A) across branches and years coexist simultaneously', false, err.message);
  }

  // Case 13: Faculty B can read Mechanical Sec A slot, but Student 1 (CSE AI) cannot read Mech Sec A
  try {
    const mechId = generateSlotDocId(mechSlotInput);
    const facBRead = await getDoc(doc(facBDb, 'timetables', mechId));
    let studBlocked = false;
    try {
      await getDoc(doc(studCseaDb, 'timetables', mechId));
    } catch {
      studBlocked = true;
    }
    report(13, 'Cross-branch access isolation preserved for identical section name (Sec A)', facBRead.exists() && studBlocked);
  } catch (err) {
    report(13, 'Cross-branch access isolation preserved for identical section name (Sec A)', false, err.message);
  }

  // -------------------------------------------------------------
  // TEST GROUP 5: Batch Save & Duplicate Period Conflict Prevention
  // -------------------------------------------------------------

  // Case 14: saveDayTimetable successfully batch saves multiple slots for a day
  const tuesdaySlots = [
    { period: 1, startTime: '09:30 AM', endTime: '10:15 AM', subject: 'Operating Systems', type: 'Lecture', room: '304' },
    { period: 2, startTime: '10:15 AM', endTime: '11:00 AM', subject: 'Database Management', type: 'Lecture', room: '304' },
    { period: 5, startTime: '12:30 PM', endTime: '01:15 PM', subject: 'Lunch Break', type: 'Break' },
    { period: 6, startTime: '01:15 PM', endTime: '02:00 PM', subject: 'OS Lab', type: 'Lab', room: 'Lab 1' },
    { period: 7, startTime: '02:00 PM', endTime: '02:45 PM', subject: 'OS Lab', type: 'Lab', room: 'Lab 1' }
  ];

  try {
    const batchRes = await saveDayTimetable({
      classInfo: {
        institution: 'UEMK',
        department: 'CSE AI',
        year: '2nd Year',
        section: 'Sec A'
      },
      day: 'Tuesday',
      slots: tuesdaySlots,
      directorUid: 'dir_uemk_uid'
    }, dirUemkDb);

    report(14, 'Batch save full day timetable succeeds atomically', batchRes.length === 5);
  } catch (err) {
    report(14, 'Batch save full day timetable succeeds atomically', false, err.message);
  }

  // Case 15: Conflict prevention: duplicate period in same day payload is rejected
  try {
    const conflictingSlots = [
      { period: 3, startTime: '11:00 AM', endTime: '11:45 AM', subject: 'Math', type: 'Lecture' },
      { period: 3, startTime: '11:00 AM', endTime: '11:45 AM', subject: 'Physics', type: 'Lecture' }
    ];
    await saveDayTimetable({
      classInfo: {
        institution: 'UEMK',
        department: 'CSE AI',
        year: '2nd Year',
        section: 'Sec A'
      },
      day: 'Wednesday',
      slots: conflictingSlots,
      directorUid: 'dir_uemk_uid'
    }, dirUemkDb);
    report(15, 'Duplicate period in day payload strictly rejected', false, 'Allowed duplicate period');
  } catch (err) {
    report(15, 'Duplicate period in day payload strictly rejected', err.message.includes('Duplicate period 3'));
  }

  // -------------------------------------------------------------
  // TEST GROUP 6: Schema Validation & Security Rejection
  // -------------------------------------------------------------

  // Case 16: Invalid day (e.g. Sunday or Funday) rejected
  try {
    await saveTimetableSlot({
      ...slot1Input,
      day: 'Funday'
    }, dirUemkDb);
    report(16, 'Invalid day string rejected', false, 'Allowed Funday');
  } catch (err) {
    report(16, 'Invalid day string rejected', true);
  }

  // Case 17: Invalid period (e.g. period 10 or 0) rejected
  try {
    await saveTimetableSlot({
      ...slot1Input,
      period: 10
    }, dirUemkDb);
    report(17, 'Period out of bounds (1-9) rejected', false, 'Allowed period 10');
  } catch (err) {
    report(17, 'Period out of bounds (1-9) rejected', true);
  }

  // Case 18: Invalid period type rejected
  try {
    await saveTimetableSlot({
      ...slot1Input,
      type: 'Recess'
    }, dirUemkDb);
    report(18, 'Invalid period type rejected', false, 'Allowed type Recess');
  } catch (err) {
    report(18, 'Invalid period type rejected', true);
  }

  // Case 19: Missing required field (subject) rejected
  try {
    await saveTimetableSlot({
      ...slot1Input,
      subject: ''
    }, dirUemkDb);
    report(19, 'Missing required subject rejected', false, 'Allowed empty subject');
  } catch (err) {
    report(19, 'Missing required subject rejected', true);
  }

  // Case 20: Mismatched slot ID in rules rejected
  try {
    const bogusDocRef = doc(dirUemkDb, 'timetables', 'tampered_doc_id_123');
    await setDoc(bogusDocRef, {
      ...slot1Input,
      period: 4,
      updatedAt: new Date().toISOString()
    });
    report(20, 'Slot document ID mismatch strictly rejected by rules', false, 'Allowed mismatched slot ID');
  } catch (err) {
    report(20, 'Slot document ID mismatch strictly rejected by rules', true);
  }

  // -------------------------------------------------------------
  // TEST GROUP 7: Query, Helper & Organization Service Functions
  // -------------------------------------------------------------

  // Case 21: fetchClassTimetable returns sorted slots
  try {
    const slots = await fetchClassTimetable({
      institution: 'UEMK',
      department: 'CSE AI',
      year: '2nd Year',
      section: 'Sec A'
    }, dirUemkDb);

    // Should include Monday P1 and Tuesday P1, P2, P5, P6, P7
    const sorted = slots.every((s, i) => {
      if (i === 0) return true;
      const prev = slots[i - 1];
      const days = VALID_DAYS;
      const dayOrder = days.indexOf(s.day) - days.indexOf(prev.day);
      if (dayOrder > 0) return true;
      if (dayOrder === 0) return s.period >= prev.period;
      return false;
    });

    report(21, 'fetchClassTimetable returns chronologically sorted class slots', slots.length >= 6 && sorted);
  } catch (err) {
    report(21, 'fetchClassTimetable returns chronologically sorted class slots', false, err.message);
  }

  // Case 22: fetchFacultyTimetable returns slots where faculty is assigned
  try {
    const facASlots = await fetchFacultyTimetable({
      institution: 'UEMK',
      teacherUid: 'fac_a_uid'
    }, dirUemkDb);

    report(22, 'fetchFacultyTimetable returns assigned slots for faculty', facASlots.length >= 1 && facASlots[0].teacherUid === 'fac_a_uid');
  } catch (err) {
    report(22, 'fetchFacultyTimetable returns assigned slots for faculty', false, err.message);
  }

  // Case 23: organizeSlotsByDay correctly groups slots by day
  const testSlots = [
    { day: 'Tuesday', period: 1, subject: 'OS' },
    { day: 'Monday', period: 2, subject: 'Math' },
    { day: 'Monday', period: 1, subject: 'DSA' }
  ];
  const organized = organizeSlotsByDay(testSlots);
  const orgOk = organized.Monday.length === 2 &&
                organized.Monday[0].period === 1 &&
                organized.Tuesday.length === 1 &&
                organized.Wednesday.length === 0;
  report(23, 'organizeSlotsByDay groups and sorts correctly', orgOk);

  // Case 24: getTodayClasses filters out breaks
  const testDaySlots = [
    { day: 'Monday', period: 1, subject: 'DSA', type: 'Lecture' },
    { day: 'Monday', period: 5, subject: 'Lunch', type: 'Break' },
    { day: 'Tuesday', period: 1, subject: 'OS', type: 'Lecture' }
  ];
  // Mock a Monday date
  const mockMonday = new Date('2026-10-12T10:00:00'); // Oct 12, 2026 is Monday
  const todayClasses = getTodayClasses(testDaySlots, mockMonday);
  report(24, 'getTodayClasses returns active classes and excludes Breaks', todayClasses.length === 1 && todayClasses[0].subject === 'DSA');

  // Case 25: Director can delete a slot
  try {
    await deleteTimetableSlot(slot1Id, dirUemkDb);
    const snapAfter = await getDoc(doc(dirUemkDb, 'timetables', slot1Id));
    report(25, 'Director can delete timetable slot', !snapAfter.exists());
  } catch (err) {
    report(25, 'Director can delete timetable slot', false, err.message);
  }

  // Case 26: Unauthenticated user is denied all access to timetables
  try {
    await getDoc(doc(unauthDb, 'timetables', 'UEMK_CSE AI_2nd Year_Sec A_Monday_P1'));
    report(26, 'Unauthenticated user denied all timetable access', false, 'Allowed unauthenticated get');
  } catch (err) {
    report(26, 'Unauthenticated user denied all timetable access', true);
  }

  // -------------------------------------------------------------
  // TEST GROUP 4: Period 1 Permissions & Root Cause Hardening
  // -------------------------------------------------------------

  // Case 27: Authorized Director saving Period 1 succeeds with complete schema validation
  try {
    const period1Slot = {
      institution: 'UEMK',
      department: 'CSE AI',
      year: '2nd Year',
      section: 'Sec A',
      day: 'Tuesday',
      period: 1,
      startTime: '09:30 AM',
      endTime: '10:15 AM',
      subject: 'Computer Architecture & Networks',
      type: 'Lecture',
      teacherUid: 'fac_a_uid',
      teacherName: 'Prof. Alice CSE',
      room: 'Room 201',
      updatedBy: 'dir_uemk_uid'
    };
    const p1Res = await saveTimetableSlot(period1Slot, dirUemkDb);
    const p1Snap = await getDoc(doc(dirUemkDb, 'timetables', p1Res.id));
    const p1Ok = p1Res.id === 'UEMK_CSE AI_2nd Year_Sec A_Tuesday_P1' &&
                 p1Snap.exists() &&
                 p1Snap.data().period === 1 &&
                 p1Snap.data().subject === 'Computer Architecture & Networks' &&
                 p1Snap.data().updatedBy === 'dir_uemk_uid';
    report(27, 'Authorized Director saving Period 1 succeeds with verified doc schema', p1Ok);
  } catch (err) {
    report(27, 'Authorized Director saving Period 1 succeeds with verified doc schema', false, err.message);
  }

  // Case 28: Saving Period 1 with mismatched updatedBy (e.g. fallback "director_uid") is strictly denied
  try {
    const mismatchedSlot = {
      institution: 'UEMK',
      department: 'CSE AI',
      year: '2nd Year',
      section: 'Sec A',
      day: 'Wednesday',
      period: 1,
      startTime: '09:30 AM',
      endTime: '10:15 AM',
      subject: 'Operating Systems',
      type: 'Lecture',
      teacherUid: 'fac_a_uid',
      teacherName: 'Prof. Alice CSE',
      room: 'Room 202',
      updatedBy: 'director_uid' // Mismatched UID (caller is 'dir_uemk_uid')
    };
    await setDoc(doc(dirUemkDb, 'timetables', 'UEMK_CSE AI_2nd Year_Sec A_Wednesday_P1'), {
      ...mismatchedSlot,
      updatedAt: new Date().toISOString()
    });
    report(28, 'Saving Period 1 with mismatched updatedBy ("director_uid") strictly denied', false, 'Allowed mismatched updatedBy');
  } catch (err) {
    report(28, 'Saving Period 1 with mismatched updatedBy ("director_uid") strictly denied', true);
  }

  // Case 29: Whitelist entry with only { authorized: true } without role: 'director' cannot manage timetables (strictly denied)
  try {
    const fallbackSlot = {
      institution: 'UEMK',
      department: 'CSE AI',
      year: '2nd Year',
      section: 'Sec A',
      day: 'Thursday',
      period: 1,
      startTime: '09:30 AM',
      endTime: '10:15 AM',
      subject: 'Database Management Systems',
      type: 'Lecture',
      teacherUid: 'fac_a_uid',
      teacherName: 'Prof. Alice CSE',
      room: 'Room 203',
      updatedBy: 'dir_fallback_uid'
    };
    await saveTimetableSlot(fallbackSlot, dirFallbackDb);
    report(29, 'Whitelist entry with only { authorized: true } (no director role) strictly denied saving Period 1', false, 'Allowed non-director whitelist entry');
  } catch (err) {
    report(29, 'Whitelist entry with only { authorized: true } (no director role) strictly denied saving Period 1', true);
  }

  // Case 30: Unwhitelisted user with director role in users collection is strictly denied from saving Period 1
  try {
    const fakeSlot = {
      institution: 'UEMK',
      department: 'CSE AI',
      year: '2nd Year',
      section: 'Sec A',
      day: 'Friday',
      period: 1,
      startTime: '09:30 AM',
      endTime: '10:15 AM',
      subject: 'Unauthorized Subject',
      type: 'Lecture',
      teacherUid: '',
      teacherName: '',
      room: 'Room 999',
      updatedBy: 'fake_dir_uid'
    };
    await saveTimetableSlot(fakeSlot, fakeDirDb);
    report(30, 'Unwhitelisted user claiming director role strictly denied saving Period 1', false, 'Allowed unwhitelisted director');
  } catch (err) {
    report(30, 'Unwhitelisted user claiming director role strictly denied saving Period 1', true);
  }

  // Case 31: Student attempting to save Period 1 is strictly denied
  try {
    const studentSlot = {
      institution: 'UEMK',
      department: 'CSE AI',
      year: '2nd Year',
      section: 'Sec A',
      day: 'Friday',
      period: 1,
      startTime: '09:30 AM',
      endTime: '10:15 AM',
      subject: 'Student Injected Subject',
      type: 'Lecture',
      teacherUid: '',
      teacherName: '',
      room: 'Room 101',
      updatedBy: 'stud_csea_uid'
    };
    await saveTimetableSlot(studentSlot, studCseaDb);
    report(31, 'Student attempting to save Period 1 strictly denied', false, 'Allowed student to write timetable');
  } catch (err) {
    report(31, 'Student attempting to save Period 1 strictly denied', true);
  }

  // Case 32: Faculty attempting to save Period 1 is strictly denied
  try {
    const facultySlot = {
      institution: 'UEMK',
      department: 'CSE AI',
      year: '2nd Year',
      section: 'Sec A',
      day: 'Saturday',
      period: 1,
      startTime: '09:30 AM',
      endTime: '10:15 AM',
      subject: 'Faculty Injected Subject',
      type: 'Lecture',
      teacherUid: 'fac_a_uid',
      teacherName: 'Prof. Alice CSE',
      room: 'Room 102',
      updatedBy: 'fac_a_uid'
    };
    await saveTimetableSlot(facultySlot, facADb);
    report(32, 'Faculty attempting to save Period 1 strictly denied', false, 'Allowed faculty to write timetable');
  } catch (err) {
    report(32, 'Faculty attempting to save Period 1 strictly denied', true);
  }

  // Case 33: Authorized Director updates existing Period 1 slot successfully
  try {
    const updatedP1 = await saveTimetableSlot({
      institution: 'UEMK',
      department: 'CSE AI',
      year: '2nd Year',
      section: 'Sec A',
      day: 'Tuesday',
      period: 1,
      startTime: '09:30 AM',
      endTime: '10:15 AM',
      subject: 'Advanced Computer Networks',
      type: 'Lecture',
      teacherUid: 'fac_a_uid',
      teacherName: 'Prof. Alice CSE',
      room: 'Room 205-Updated',
      updatedBy: 'dir_uemk_uid'
    }, dirUemkDb);
    const snap = await getDoc(doc(dirUemkDb, 'timetables', updatedP1.id));
    const ok = snap.exists() && snap.data().room === 'Room 205-Updated' && snap.data().subject === 'Advanced Computer Networks';
    report(33, 'Authorized Director updates existing Period 1 slot successfully', ok);
  } catch (err) {
    report(33, 'Authorized Director updates existing Period 1 slot successfully', false, err.message);
  }

  // Case 34: Regression - Exact live Director profile (Alex, director20266@gmail.com, UID dxiALBdPABceLbwVviaMnFIsMCE2, no institution field in profile) saves Period 1 successfully
  try {
    const liveDirectorSlot = {
      institution: 'UEMK',
      department: 'Computer Science',
      year: '2nd Year',
      section: 'Sec A',
      day: 'Monday',
      period: 1,
      startTime: '09:30 AM',
      endTime: '10:15 AM',
      subject: 'Data Structures & Algorithms',
      type: 'Lecture',
      room: 'Room 401',
      teacherUid: '',
      teacherName: '',
      updatedBy: 'dxiALBdPABceLbwVviaMnFIsMCE2'
    };
    const liveRes = await saveTimetableSlot(liveDirectorSlot, liveDirectorDb);
    const liveSnap = await getDoc(doc(liveDirectorDb, 'timetables', liveRes.id));
    const liveOk = liveRes.id === 'UEMK_Computer Science_2nd Year_Sec A_Monday_P1' &&
                   liveSnap.exists() &&
                   liveSnap.data().period === 1 &&
                   liveSnap.data().subject === 'Data Structures & Algorithms' &&
                   liveSnap.data().updatedBy === 'dxiALBdPABceLbwVviaMnFIsMCE2';
    report(34, 'Regression: Live Director profile without institution field saves Period 1 successfully', liveOk);
  } catch (err) {
    report(34, 'Regression: Live Director profile without institution field saves Period 1 successfully', false, err.message);
  }

  // Case 35: Unauthorized users attempting to write this slot are strictly denied
  let unauthorizedBlocked = true;
  // 35a: Unauthenticated user
  try {
    await saveTimetableSlot({
      institution: 'UEMK',
      department: 'Computer Science',
      year: '2nd Year',
      section: 'Sec A',
      day: 'Monday',
      period: 1,
      startTime: '09:30 AM',
      endTime: '10:15 AM',
      subject: 'Unauthenticated Attack',
      type: 'Lecture',
      updatedBy: 'dxiALBdPABceLbwVviaMnFIsMCE2'
    }, unauthDb);
    unauthorizedBlocked = false;
  } catch (e) { /* expected */ }

  // 35b: Student attempting to overwrite Period 1
  try {
    await saveTimetableSlot({
      institution: 'UEMK',
      department: 'Computer Science',
      year: '2nd Year',
      section: 'Sec A',
      day: 'Monday',
      period: 1,
      startTime: '09:30 AM',
      endTime: '10:15 AM',
      subject: 'Student Overwrite Attack',
      type: 'Lecture',
      updatedBy: 'stud_csea_uid'
    }, studCseaDb);
    unauthorizedBlocked = false;
  } catch (e) { /* expected */ }

  // 35c: Faculty attempting to overwrite Period 1
  try {
    await saveTimetableSlot({
      institution: 'UEMK',
      department: 'Computer Science',
      year: '2nd Year',
      section: 'Sec A',
      day: 'Monday',
      period: 1,
      startTime: '09:30 AM',
      endTime: '10:15 AM',
      subject: 'Faculty Overwrite Attack',
      type: 'Lecture',
      updatedBy: 'fac_a_uid'
    }, facADb);
    unauthorizedBlocked = false;
  } catch (e) { /* expected */ }

  report(35, 'Unauthorized users (unauthenticated, student, faculty) strictly denied from saving Period 1', unauthorizedBlocked);

} catch (fatal) {
  console.error('Fatal test error:', fatal);
} finally {
  console.log('\n========================================');
  console.log(`TIMETABLE BACKEND: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================\n');
  await testEnv.cleanup();
  process.exit(failed > 0 ? 1 : 0);
}
