/**
 * Sangam Academic System - Timetable & Class Schedule Service
 *
 * Implements the backend service foundation for canonical class timetables.
 * Class identity is defined canonically by: institution + department + year + section.
 * Slots are keyed deterministically by: {institution}_{department}_{year}_{section}_{day}_P{period}
 */

import { db, auth } from '../firebase/config.js';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  writeBatch,
  onSnapshot
} from 'firebase/firestore';

export const VALID_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const VALID_PERIOD_TYPES = ['Lecture', 'Lab', 'Tutorial', 'Break', 'Self Study'];

export const DEPARTMENTS = [
  'Computer Science',
  'CSE AI',
  'CSE',
  'Information Technology',
  'Electronics & Communication',
  'ECE',
  'Electrical Engineering',
  'Mechanical Engineering',
  'Civil Engineering',
  'Biotechnology',
  'Management'
];

export const YEARS = ['1st Year', '2nd Year', '3rd Year', '4th Year'];

export const SECTIONS = ['Sec A', 'Sec B', 'Sec C', 'Sec D', 'Section A', 'Section B', 'Section C'];

export const DEFAULT_PERIOD_TIMINGS = [
  { period: 1, startTime: '09:30 AM', endTime: '10:15 AM' },
  { period: 2, startTime: '10:15 AM', endTime: '11:00 AM' },
  { period: 3, startTime: '11:00 AM', endTime: '11:45 AM' },
  { period: 4, startTime: '11:45 AM', endTime: '12:30 PM' },
  { period: 5, startTime: '12:30 PM', endTime: '01:15 PM' }, // Default Lunch / Break
  { period: 6, startTime: '01:15 PM', endTime: '02:00 PM' },
  { period: 7, startTime: '02:00 PM', endTime: '02:45 PM' },
  { period: 8, startTime: '02:45 PM', endTime: '03:30 PM' },
  { period: 9, startTime: '03:30 PM', endTime: '04:15 PM' }
];

/**
 * Trims and normalizes a string for canonical identifiers.
 */
function clean(str) {
  return String(str || '').trim();
}

/**
 * Generates the canonical class identity string.
 * Format: {institution}_{department}_{year}_{section}
 */
export function generateClassKey({ institution, department, year, section }) {
  const inst = clean(institution);
  const dept = clean(department);
  const yr = clean(year);
  const sec = clean(section);
  if (!inst || !dept || !yr || !sec) {
    throw new Error('All class identity fields (institution, department, year, section) are required.');
  }
  return `${inst}_${dept}_${yr}_${sec}`;
}

/**
 * Generates the deterministic Firestore document ID for a timetable slot.
 * Format: {institution}_{department}_{year}_{section}_{day}_P{period}
 */
export function generateSlotDocId({ institution, department, year, section, day, period }) {
  const classKey = generateClassKey({ institution, department, year, section });
  const cleanDay = clean(day);
  const cleanPeriod = Number(period);

  if (!VALID_DAYS.includes(cleanDay)) {
    throw new Error(`Invalid day: "${cleanDay}". Must be one of: ${VALID_DAYS.join(', ')}.`);
  }
  if (!Number.isInteger(cleanPeriod) || cleanPeriod < 1 || cleanPeriod > 9) {
    throw new Error(`Invalid period: "${period}". Must be an integer between 1 and 9.`);
  }

  return `${classKey}_${cleanDay}_P${cleanPeriod}`;
}

/**
 * Validates a timetable slot payload against the strict schema.
 */
export function validateSlotData(slotData) {
  if (!slotData || typeof slotData !== 'object') {
    throw new Error('Slot data must be a valid object.');
  }

  const {
    institution,
    department,
    year,
    section,
    day,
    period,
    startTime,
    endTime,
    subject,
    type,
    updatedBy
  } = slotData;

  if (!clean(institution)) throw new Error('institution is required.');
  if (!clean(department)) throw new Error('department is required.');
  if (!clean(year)) throw new Error('year is required.');
  if (!clean(section)) throw new Error('section is required.');

  const cleanDay = clean(day);
  if (!VALID_DAYS.includes(cleanDay)) {
    throw new Error(`Invalid day: "${cleanDay}". Must be one of: ${VALID_DAYS.join(', ')}.`);
  }

  const cleanPeriod = Number(period);
  if (!Number.isInteger(cleanPeriod) || cleanPeriod < 1 || cleanPeriod > 9) {
    throw new Error(`Invalid period: "${period}". Must be an integer between 1 and 9.`);
  }

  if (!clean(startTime)) throw new Error('startTime is required.');
  if (!clean(endTime)) throw new Error('endTime is required.');
  if (!clean(subject)) throw new Error('subject is required.');

  const cleanType = clean(type);
  if (!VALID_PERIOD_TYPES.includes(cleanType)) {
    throw new Error(`Invalid type: "${cleanType}". Must be one of: ${VALID_PERIOD_TYPES.join(', ')}.`);
  }

  const resolvedUpdatedBy = clean(updatedBy) || (typeof auth !== 'undefined' && auth?.currentUser?.uid ? auth.currentUser.uid : '');
  if (!resolvedUpdatedBy) throw new Error('updatedBy (Director UID) is required.');

  // In live client environment with active Firebase Auth session, ensure updatedBy matches active currentUser.uid
  const finalUpdatedBy = (typeof auth !== 'undefined' && auth?.currentUser?.uid)
    ? auth.currentUser.uid
    : resolvedUpdatedBy;

  // Return sanitized copy
  return {
    institution: clean(institution),
    department: clean(department),
    year: clean(year),
    section: clean(section),
    day: cleanDay,
    period: cleanPeriod,
    startTime: clean(startTime),
    endTime: clean(endTime),
    subject: clean(subject),
    type: cleanType,
    teacherUid: slotData.teacherUid ? clean(slotData.teacherUid) : '',
    teacherName: slotData.teacherName ? clean(slotData.teacherName) : '',
    room: slotData.room ? clean(slotData.room) : '',
    updatedAt: slotData.updatedAt || new Date().toISOString(),
    updatedBy: finalUpdatedBy
  };
}

/**
 * Saves or updates a single timetable slot.
 * Enforces canonical document ID and data schema.
 */
export async function saveTimetableSlot(slotInput, dbInstance = db) {
  const sanitized = validateSlotData(slotInput);
  const slotDocId = generateSlotDocId(sanitized);

  const slotRef = doc(dbInstance, 'timetables', slotDocId);
  await setDoc(slotRef, sanitized);

  return { id: slotDocId, ...sanitized };
}

/**
 * Saves a full day's timetable for a specific class atomically using a batch write.
 * Detects duplicate or conflicting period entries before writing.
 */
export async function saveDayTimetable({ classInfo, day, slots, directorUid }, dbInstance = db) {
  if (!classInfo) throw new Error('classInfo (institution, department, year, section) is required.');
  const { institution, department, year, section } = classInfo;
  const cleanDay = clean(day);

  if (!VALID_DAYS.includes(cleanDay)) {
    throw new Error(`Invalid day: "${cleanDay}". Must be one of: ${VALID_DAYS.join(', ')}.`);
  }
  if (!Array.isArray(slots) || slots.length === 0) {
    throw new Error('slots must be a non-empty array of period slots.');
  }

  // Conflict / Duplicate period detection
  const seenPeriods = new Set();
  const sanitizedSlots = [];

  for (const slot of slots) {
    const periodNum = Number(slot.period);
    if (seenPeriods.has(periodNum)) {
      throw new Error(`Duplicate period ${periodNum} detected in timetable payload for ${cleanDay}.`);
    }
    seenPeriods.add(periodNum);

    const activeDirectorUid = (typeof auth !== 'undefined' && auth?.currentUser?.uid)
      ? auth.currentUser.uid
      : clean(directorUid);

    const merged = {
      institution,
      department,
      year,
      section,
      day: cleanDay,
      ...slot,
      updatedBy: activeDirectorUid,
      updatedAt: slot.updatedAt || new Date().toISOString()
    };

    const sanitized = validateSlotData(merged);
    const slotDocId = generateSlotDocId(sanitized);
    sanitizedSlots.push({ id: slotDocId, data: sanitized });
  }

  // Atomic batch write
  const batch = writeBatch(dbInstance);
  sanitizedSlots.forEach(({ id, data }) => {
    const slotRef = doc(dbInstance, 'timetables', id);
    batch.set(slotRef, data);
  });

  await batch.commit();
  return sanitizedSlots;
}

/**
 * Deletes a timetable slot document.
 */
export async function deleteTimetableSlot(target, dbInstance = db) {
  let slotDocId;
  if (typeof target === 'string') {
    slotDocId = target;
  } else if (target && typeof target === 'object') {
    slotDocId = generateSlotDocId(target);
  } else {
    throw new Error('Target must be a slot doc ID or slot identifier object.');
  }

  const slotRef = doc(dbInstance, 'timetables', slotDocId);
  await deleteDoc(slotRef);
  return { id: slotDocId, deleted: true };
}

/**
 * Fetches timetable slots for a class, optionally filtered by day.
 * Returns slots sorted chronologically (by day and period).
 */
export async function fetchClassTimetable({ institution, department, year, section, day, db: optDb, dbInstance: optDbInst } = {}, dbInstance = db) {
  const targetDb = optDb || optDbInst || dbInstance;
  if (!institution || !department || !year || !section) {
    throw new Error('institution, department, year, and section are required.');
  }

  const constraints = [
    where('institution', '==', clean(institution)),
    where('department', '==', clean(department)),
    where('year', '==', clean(year)),
    where('section', '==', clean(section))
  ];

  if (day && VALID_DAYS.includes(clean(day))) {
    constraints.push(where('day', '==', clean(day)));
  }

  const q = query(collection(targetDb, 'timetables'), ...constraints);
  const snapshot = await getDocs(q);

  const slots = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

  // Sort slots by day index, then period number
  return sortSlots(slots);
}

/**
 * Fetches timetable slots where the given faculty member is assigned as teacher.
 */
export async function fetchFacultyTimetable({ institution, teacherUid, day, db: optDb, dbInstance: optDbInst } = {}, dbInstance = db) {
  const targetDb = optDb || optDbInst || dbInstance;
  if (!institution || !teacherUid) {
    throw new Error('institution and teacherUid are required.');
  }

  const constraints = [
    where('institution', '==', clean(institution)),
    where('teacherUid', '==', clean(teacherUid))
  ];

  if (day && VALID_DAYS.includes(clean(day))) {
    constraints.push(where('day', '==', clean(day)));
  }

  const q = query(collection(targetDb, 'timetables'), ...constraints);
  const snapshot = await getDocs(q);

  const slots = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
  return sortSlots(slots);
}

/**
 * Real-time listener for class timetable updates.
 */
export function subscribeClassTimetable({ institution, department, year, section, day, db: optDb, dbInstance: optDbInst } = {}, onNext, onError, dbInstance = db) {
  const targetDb = optDb || optDbInst || dbInstance;
  if (!institution || !department || !year || !section) {
    throw new Error('institution, department, year, and section are required.');
  }

  const constraints = [
    where('institution', '==', clean(institution)),
    where('department', '==', clean(department)),
    where('year', '==', clean(year)),
    where('section', '==', clean(section))
  ];

  if (day && VALID_DAYS.includes(clean(day))) {
    constraints.push(where('day', '==', clean(day)));
  }

  const q = query(collection(targetDb, 'timetables'), ...constraints);
  return onSnapshot(
    q,
    (snapshot) => {
      const slots = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      onNext(sortSlots(slots));
    },
    (err) => {
      if (onError) onError(err);
      else console.error('Error in subscribeClassTimetable:', err);
    }
  );
}

/**
 * Helper to sort timetable slots chronologically by day then period.
 */
export function sortSlots(slots = []) {
  const dayOrder = {
    Monday: 1,
    Tuesday: 2,
    Wednesday: 3,
    Thursday: 4,
    Friday: 5,
    Saturday: 6
  };

  return [...slots].sort((a, b) => {
    const dayDiff = (dayOrder[a.day] || 99) - (dayOrder[b.day] || 99);
    if (dayDiff !== 0) return dayDiff;
    return (Number(a.period) || 0) - (Number(b.period) || 0);
  });
}

/**
 * Organizes a flat list of slots into an object keyed by day name.
 */
export function organizeSlotsByDay(slots = []) {
  const organized = {
    Monday: [],
    Tuesday: [],
    Wednesday: [],
    Thursday: [],
    Friday: [],
    Saturday: []
  };

  sortSlots(slots).forEach(slot => {
    if (organized[slot.day]) {
      organized[slot.day].push(slot);
    }
  });

  return organized;
}

/**
 * Extracts today's active classes from timetable slots.
 */
export function getTodayClasses(slots = [], date = new Date()) {
  const dayNum = date.getDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
  if (dayNum === 0) return []; // Sunday - No classes

  const dayNames = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const todayName = dayNames[dayNum];

  return sortSlots(slots).filter(s => s.day === todayName && s.type !== 'Break');
}
