import { 
  collection, 
  doc, 
  getDoc,
  getDocs, 
  query, 
  where, 
  writeBatch, 
  setDoc,
  deleteDoc,
  onSnapshot 
} from 'firebase/firestore';
import { db } from '../firebase/config.js';

/**
 * Generates a stable session ID uniquely identifying the class period session.
 * Format: {INST}_{DEPT}_{YEAR}_{SEC}_{DATE}_P{PERIOD}
 */
export function generateSessionId({ institution, department, year, section, date, period }) {
  const sanitize = (val) => String(val || '').replace(/[^a-zA-Z0-9]/g, '');
  const cleanInst = sanitize(institution) || 'INST';
  const cleanDept = sanitize(department) || 'DEPT';
  const cleanYear = sanitize(year) || 'YR';
  const cleanSec = sanitize(section) || 'SEC';
  const cleanDate = String(date || '').trim();
  const cleanPeriod = `P${period}`;
  return `${cleanInst}_${cleanDept}_${cleanYear}_${cleanSec}_${cleanDate}_${cleanPeriod}`;
}

/**
 * Maps the current clock hour to college schedule period (1-9).
 * Period 5 is lunch/break.
 */
export function getCurrentPeriod(date = new Date()) {
  const hour = date.getHours();
  if (hour < 10) return 1;
  if (hour === 10) return 2;
  if (hour === 11) return 3;
  if (hour === 12) return 4;
  if (hour === 13) return 6;
  if (hour === 14) return 7;
  if (hour === 15) return 8;
  if (hour === 16) return 9;
  return 1;
}

/**
 * Returns today's date formatted as YYYY-MM-DD in local time.
 */
export function getTodayDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Safely parses a YYYY-MM-DD date string into a local Date object set to local midnight (00:00:00).
 * Avoids UTC timezone conversion skew across non-UTC regions (such as India UTC+05:30).
 */
export function parseLocalDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return new Date();
  const parts = dateStr.split('-');
  if (parts.length === 3 && parts[0].length === 4) {
    const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    d.setHours(0, 0, 0, 0);
    return d;
  }
  const fallback = new Date(dateStr);
  fallback.setHours(0, 0, 0, 0);
  return fallback;
}

/**
 * Returns a date formatted as YYYY-MM-DD in local time.
 * Alias for getTodayDateString.
 */
export function formatLocalDate(date = new Date()) {
  return getTodayDateString(date);
}

/**
 * Fetches active, approved students from Firestore matching teacher's department.
 * Further filters by institution, year and section if specified.
 */
export async function fetchStudentsForSection({ institution, department, year, section }, dbInstance = db) {
  if (!department) return [];

  const CANONICAL_DEPARTMENT_MAP = {
    'CSE AI': 'Computer Science',
    'CSE': 'Computer Science',
    'Computer Science': 'Computer Science',
    'IT': 'Information Technology',
    'Information Technology': 'Information Technology',
    'ECE': 'Electronics & Communication',
    'Electronics & Communication': 'Electronics & Communication',
    'EE': 'Electrical Engineering',
    'Electrical Engineering': 'Electrical Engineering',
    'ME': 'Mechanical Engineering',
    'Mechanical Engineering': 'Mechanical Engineering',
    'CE': 'Civil Engineering',
    'Civil Engineering': 'Civil Engineering',
    'BT': 'Biotechnology',
    'Biotechnology': 'Biotechnology',
    'Management': 'Management'
  };
  const canonicalDept = CANONICAL_DEPARTMENT_MAP[department] || department;

  const q = query(
    collection(dbInstance, 'users'),
    where('role', '==', 'student'),
    where('status', '==', 'active'),
    where('department', '==', canonicalDept)
  );

  const snapshot = await getDocs(q);
  const students = [];

  const normalize = (str) => String(str || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const targetYear = normalize(year);
  const targetSec = normalize(section);
  const targetInst = normalize(institution);
  const isAllSections = !section || targetSec === 'allsections' || targetSec === 'all' || targetSec === '';

  snapshot.forEach(docSnap => {
    const data = docSnap.data();
    const studentYear = normalize(data.year);
    const studentSec = normalize(data.section);
    const studentInst = normalize(data.institution);

    const yearMatch = !targetYear || studentYear === targetYear || 
                      studentYear.includes(targetYear) || targetYear.includes(studentYear);

    const secMatch = isAllSections || studentSec === targetSec ||
                     (targetSec && studentSec.endsWith(targetSec.replace('sec', '').replace('section', ''))) ||
                     (studentSec && targetSec.endsWith(studentSec.replace('sec', '').replace('section', '')));

    const instMatch = !targetInst || !studentInst || studentInst === targetInst ||
                      targetInst.includes(studentInst) || studentInst.includes(targetInst);

    if (yearMatch && secMatch && instMatch) {
      students.push({
        id: docSnap.id,
        uid: data.uid || docSnap.id,
        name: data.name || data.email?.split('@')[0] || 'Student',
        roll: data.roll || data.uid?.substring(0, 8) || docSnap.id.substring(0, 8),
        email: data.email || '',
        department: data.department || department,
        year: data.year || year,
        section: data.section || section,
        institution: data.institution || institution || '',
      });
    }
  });

  return deduplicateStudentRoster(students);
}

/**
 * Deduplicates an array of student roster entries by email and UID,
 * ensuring no duplicate active students appear on attendance rosters.
 *
 * @param {Array<Object>} students
 * @returns {Array<Object>}
 */
export function deduplicateStudentRoster(students = []) {
  if (!Array.isArray(students)) return [];
  const uniqueStudents = [];
  const seenEmails = new Set();
  const seenUids = new Set();

  for (const st of students) {
    const email = (st.email || '').trim().toLowerCase();
    const uid = (st.uid || st.id || '').trim();
    if ((email && seenEmails.has(email)) || (uid && seenUids.has(uid))) {
      continue;
    }
    if (email) seenEmails.add(email);
    if (uid) seenUids.add(uid);
    uniqueStudents.push(st);
  }

  return uniqueStudents.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
}

/**
 * Persists period attendance for multiple students atomically.
 * Chunks writes in batches of up to 200 items to respect Firestore's 500-op limit.
 * The session metadata document is committed ONLY in the final batch, and any partial
 * chunk writes are rolled back if a later chunk fails.
 */
export async function savePeriodAttendance({ sessionInfo, studentStatuses, teacherUid }, dbInstance = db) {
  const { institution, department, year, section, date, period } = sessionInfo || {};
  const periodNumber = Number(period);

  // Early validation guard: strictly reject break period (Period 5) and any non-teaching period
  if (!sessionInfo || !TEACHING_PERIODS.includes(periodNumber)) {
    if (periodNumber === BREAK_PERIOD) {
      throw new Error(`Cannot record attendance for Period ${BREAK_PERIOD}: Period ${BREAK_PERIOD} is reserved as lunch/break and cannot have attendance records.`);
    }
    throw new Error(`Invalid teaching period: "${period}". Period must be one of [${TEACHING_PERIODS.join(', ')}].`);
  }

  const sessionId = generateSessionId({ ...sessionInfo, period: periodNumber });
  const markedAt = new Date().toISOString();

  if (!teacherUid) {
    throw new Error('Teacher UID is required to record attendance.');
  }

  // Strictly validate status and compute exact totals
  let presentCount = 0;
  let absentCount = 0;
  for (const [studentUid, recordData] of Object.entries(studentStatuses)) {
    const status = typeof recordData === 'object' ? recordData.status : recordData;
    if (status === 'Present') {
      presentCount++;
    } else if (status === 'Absent') {
      absentCount++;
    } else {
      throw new Error(`Invalid attendance status for student ${studentUid}: "${status}". Must be "Present" or "Absent".`);
    }
  }
  const totalStudents = presentCount + absentCount;

  const entries = Object.entries(studentStatuses);
  const CHUNK_SIZE = 200;
  const committedRecordRefs = [];

  try {
    for (let i = 0; i < entries.length; i += CHUNK_SIZE) {
      const chunk = entries.slice(i, i + CHUNK_SIZE);
      const isLastChunk = (i + CHUNK_SIZE) >= entries.length;
      const batch = writeBatch(dbInstance);
      const chunkRefs = [];

      // Write individual student attendance records
      for (const [studentUid, recordData] of chunk) {
        const status = typeof recordData === 'object' ? recordData.status : recordData;
        const studentName = typeof recordData === 'object' ? recordData.name : '';
        const studentRoll = typeof recordData === 'object' ? recordData.roll : '';

        const recordId = `${sessionId}_${studentUid}`;
        const recordRef = doc(dbInstance, 'attendance_records', recordId);
        chunkRefs.push(recordRef);

        const payload = {
          sessionId,
          institution,
          department,
          year,
          section,
          date,
          period,
          studentUid,
          status, // Strictly 'Present' or 'Absent'
          markedBy: teacherUid,
          markedAt,
        };
        if (studentName) payload.studentName = studentName;
        if (studentRoll) payload.studentRoll = studentRoll;

        batch.set(recordRef, payload);
      }

      // Session metadata document is written ONLY in the final batch.
      // If any prior chunk fails, the session doc is never written,
      // ensuring partial saves cannot silently appear as a complete session.
      if (isLastChunk) {
        const sessionRef = doc(dbInstance, 'attendance_sessions', sessionId);
        batch.set(sessionRef, {
          sessionId,
          institution,
          department,
          year,
          section,
          date,
          period,
          markedBy: teacherUid,
          markedAt,
          presentCount,
          absentCount,
          totalStudents
        });
      }

      await batch.commit();
      committedRecordRefs.push(...chunkRefs);
    }
  } catch (err) {
    // Attempt rollback of previously committed chunks to prevent partial saves
    if (committedRecordRefs.length > 0) {
      try {
        const rollbackBatch = writeBatch(dbInstance);
        committedRecordRefs.forEach(ref => rollbackBatch.delete(ref));
        await rollbackBatch.commit();
      } catch (rollbackErr) {
        console.error('Failed to rollback partial attendance records:', rollbackErr);
      }
    }

    // Run privacy-preserving write failure diagnostic
    let diagnostic = null;
    try {
      diagnostic = await diagnoseAttendanceWriteError({ sessionInfo, studentStatuses, teacherUid }, err, dbInstance);
    } catch {
      // Diagnostic failure shouldn't mask original save error
    }

    const wrappedError = new Error(`Bulk attendance save failed: ${err.message}. Partial records were reverted.`);
    wrappedError.code = err?.code || 'permission-denied';
    wrappedError.originalError = err;
    if (diagnostic) {
      wrappedError.diagnostic = diagnostic;
    }
    throw wrappedError;
  }

  return sessionId;
}

/**
 * Diagnoses which write failed during attendance persistence without exposing sensitive data.
 * Checks whether the allocation document exists for the teacher, or whether individual student records
 * violate security rule constraints.
 */
export async function diagnoseAttendanceWriteError({ sessionInfo, studentStatuses, teacherUid }, err, dbInstance = db) {
  const diagnostic = {
    failedWrite: 'unknown',
    ruleTarget: '',
    reason: '',
    hasTeacherAllocation: false,
    context: {
      institution: sessionInfo?.institution || 'unknown',
      department: sessionInfo?.department || 'unknown',
      year: sessionInfo?.year || 'unknown',
      section: sessionInfo?.section || 'unknown',
      period: sessionInfo?.period || 1,
      studentCount: Object.keys(studentStatuses || {}).length,
    }
  };

  const isPermDenied = err?.code === 'permission-denied' || String(err?.message || '').toLowerCase().includes('permission');
  if (!isPermDenied) {
    diagnostic.reason = err?.message || 'Non-permission error occurred.';
    return diagnostic;
  }

  try {
    // 1. Check if the faculty member has an active teacher allocation document for this class
    const canonicalAllocId = `${teacherUid}_${sessionInfo.department}_${sessionInfo.year}_${sessionInfo.section}`;
    const legacyAllocId = `${teacherUid}_${sessionInfo.year}_${sessionInfo.section}`;
    let hasValidAlloc = false;

    try {
      const canonicalSnap = await getDoc(doc(dbInstance, 'teacher_allocations', canonicalAllocId));
      if (canonicalSnap.exists() && canonicalSnap.data()?.authorized === true) {
        hasValidAlloc = true;
      }
    } catch {
      hasValidAlloc = false;
    }

    if (!hasValidAlloc) {
      try {
        const legacySnap = await getDoc(doc(dbInstance, 'teacher_allocations', legacyAllocId));
        if (legacySnap.exists() && legacySnap.data()?.authorized === true) {
          hasValidAlloc = true;
        }
      } catch {
        hasValidAlloc = false;
      }
    }

    if (!hasValidAlloc) {
      diagnostic.failedWrite = 'attendance_sessions & attendance_records';
      diagnostic.ruleTarget = 'isFacultyAuthorizedForClass';
      diagnostic.reason = `Faculty member lacks an authorized allocation for ${sessionInfo.department} ${sessionInfo.year} ${sessionInfo.section}. Missing teacher_allocations/${canonicalAllocId}`;
      return diagnostic;
    }

    diagnostic.hasTeacherAllocation = true;

    // 2. Since the teacher allocation document exists and is authorized,
    // attendance_sessions write is permitted by isFacultyAuthorizedForClass.
    // Therefore, the rejected write is in attendance_records due to student scope verification.
    diagnostic.failedWrite = 'attendance_records';
    diagnostic.ruleTarget = 'isStudentInFacultyScope';
    diagnostic.reason = 'One or more student records in users/ failed scope validation (year format, section name alias such as CSE-C vs Sec C, or inactive status).';
  } catch (diagErr) {
    diagnostic.reason = `Diagnostic probe error: ${diagErr.message}`;
  }

  return diagnostic;
}

/**
 * Persists attendance status for a single student and atomically updates session totals.
 * Preserves the original session creator markedBy field (immutable in security rules).
 */
export async function saveSingleStudentAttendance({ 
  sessionInfo, 
  studentUid, 
  status, 
  studentName, 
  studentRoll, 
  teacherUid,
  allStudentStatuses 
}, dbInstance = db) {
  const { institution, department, year, section, date, period } = sessionInfo || {};
  const periodNumber = Number(period);

  // Early validation guard: strictly reject break period (Period 5) and any non-teaching period
  if (!sessionInfo || !TEACHING_PERIODS.includes(periodNumber)) {
    if (periodNumber === BREAK_PERIOD) {
      throw new Error(`Cannot record attendance for Period ${BREAK_PERIOD}: Period ${BREAK_PERIOD} is reserved as lunch/break and cannot have attendance records.`);
    }
    throw new Error(`Invalid teaching period: "${period}". Period must be one of [${TEACHING_PERIODS.join(', ')}].`);
  }

  const sessionId = generateSessionId({ ...sessionInfo, period: periodNumber });
  const recordId = `${sessionId}_${studentUid}`;
  const recordRef = doc(dbInstance, 'attendance_records', recordId);
  const sessionRef = doc(dbInstance, 'attendance_sessions', sessionId);
  const markedAt = new Date().toISOString();

  if (!teacherUid) {
    throw new Error('Teacher UID is required to record attendance.');
  }

  if (status !== 'Present' && status !== 'Absent') {
    throw new Error(`Invalid attendance status: "${status}". Must be "Present" or "Absent".`);
  }

  // Preserve original session creator if session already exists
  let sessionCreatorUid = teacherUid;
  try {
    const sessionSnap = await getDoc(sessionRef);
    if (sessionSnap.exists()) {
      sessionCreatorUid = sessionSnap.data()?.markedBy || teacherUid;
    }
  } catch {
    // Fall back to current teacherUid if session document does not exist yet
  }

  // Recompute consistent session totals
  let sessionRecords = {};
  if (allStudentStatuses && typeof allStudentStatuses === 'object' && Object.keys(allStudentStatuses).length > 0) {
    for (const [uid, stVal] of Object.entries(allStudentStatuses)) {
      const s = typeof stVal === 'object' ? stVal.status : stVal;
      if (s === 'Present' || s === 'Absent') {
        sessionRecords[uid] = s;
      }
    }
  } else {
    sessionRecords = await fetchSessionAttendanceRecords(sessionId, institution, department, dbInstance);
  }
  sessionRecords[studentUid] = status;

  let presentCount = 0;
  let absentCount = 0;
  Object.values(sessionRecords).forEach(val => {
    if (val === 'Present') presentCount++;
    else if (val === 'Absent') absentCount++;
  });
  const totalStudents = presentCount + absentCount;

  const payload = {
    sessionId,
    institution,
    department,
    year,
    section,
    date,
    period,
    studentUid,
    status, // Strictly validated 'Present' or 'Absent'
    markedBy: teacherUid,
    markedAt,
  };
  if (studentName) payload.studentName = studentName;
  if (studentRoll) payload.studentRoll = studentRoll;

  // Atomically persist both the individual record and updated session totals
  const batch = writeBatch(dbInstance);
  batch.set(recordRef, payload);
  batch.set(sessionRef, {
    sessionId,
    institution,
    department,
    year,
    section,
    date,
    period,
    markedBy: sessionCreatorUid,
    markedAt,
    presentCount,
    absentCount,
    totalStudents
  });
  await batch.commit();

  return recordId;
}

/**
 * Loads existing attendance records for a session if already marked today.
 * Scoped by institution and department to satisfy Firestore list security rules.
 */
export async function fetchSessionAttendanceRecords(sessionId, institution, department, dbInstance = db) {
  if (!sessionId) return {};
  
  const CANONICAL_DEPARTMENT_MAP = {
    'CSE AI': 'Computer Science',
    'CSE': 'Computer Science',
  };
  const canonicalDept = department ? (CANONICAL_DEPARTMENT_MAP[department] || department) : department;

  let q;
  if (institution && canonicalDept) {
    q = query(
      collection(dbInstance, 'attendance_records'),
      where('sessionId', '==', sessionId),
      where('institution', '==', institution),
      where('department', '==', canonicalDept)
    );
  } else {
    q = query(
      collection(dbInstance, 'attendance_records'),
      where('sessionId', '==', sessionId)
    );
  }

  const snapshot = await getDocs(q);
  const result = {};
  snapshot.forEach(docSnap => {
    const data = docSnap.data();
    if (data.studentUid) {
      result[data.studentUid] = data.status;
    }
  });
  return result;
}

/**
 * Subscribes to real-time attendance records for a specific student.
 */
export function subscribeStudentAttendance(studentUid, onUpdate, onError) {
  if (!studentUid) return () => {};
  const q = query(
    collection(db, 'attendance_records'),
    where('studentUid', '==', studentUid)
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const records = [];
      snapshot.forEach(docSnap => {
        records.push(docSnap.data());
      });
      onUpdate(records);
    },
    (err) => {
      console.error('Error subscribing to student attendance:', err);
      if (onError) onError(err);
    }
  );
}

/**
 * Canonical period configuration for Sangam academic schedules.
 * There are 9 periods in total, but Period 5 is reserved as Lunch / Break.
 * Only the 8 teaching periods count toward daily and semester attendance.
 */
export const TEACHING_PERIODS = [1, 2, 3, 4, 6, 7, 8, 9];
export const BREAK_PERIOD = 5;

/**
 * Computes the canonical whole-day attendance status for a single day's periods.
 * 
 * Rules:
 * 1. If ANY teaching period is marked 'Absent', returns 'Absent' immediately, even if other periods are unmarked.
 * 2. Returns 'Present' ONLY when ALL 8 teaching periods are explicitly marked 'Present'.
 * 3. If at least one teaching period is marked, none are 'Absent', and fewer than 8 are 'Present', returns 'Pending'.
 * 4. If no teaching periods are marked, returns 'Unrecorded'.
 * 5. Period 5 (break) is completely ignored and never evaluated.
 * 
 * @param {Object} periodsForDate - Map of period numbers (or string period keys) to status ('Present' | 'Absent')
 * @returns {'Present' | 'Absent' | 'Pending' | 'Unrecorded'}
 */
export function getDayAttendanceStatus(periodsForDate = {}) {
  if (!periodsForDate || typeof periodsForDate !== 'object') {
    return 'Unrecorded';
  }

  let presentCount = 0;
  let markedCount = 0;

  for (const p of TEACHING_PERIODS) {
    const status = periodsForDate[p] !== undefined ? periodsForDate[p] : periodsForDate[String(p)];
    if (status === 'Absent') {
      return 'Absent';
    }
    if (status === 'Present') {
      presentCount++;
      markedCount++;
    } else if (status) {
      markedCount++;
    }
  }

  if (presentCount === TEACHING_PERIODS.length) {
    return 'Present';
  }

  if (markedCount > 0) {
    return 'Pending';
  }

  return 'Unrecorded';
}

/**
 * Transforms an array of attendance records into the periodData format:
 * { "YYYY-MM-DD": { 1: "Present", 2: "Absent", ... } }
 *
 * Deduplication & Ordering:
 * Sorts records by markedAt ascending so the latest marked record for a period wins,
 * preventing duplicate records from inflating attendance or presenting conflicting states.
 */
export function transformRecordsToPeriodData(records = []) {
  const periodData = {};
  if (!Array.isArray(records)) return periodData;

  const sorted = [...records].sort((a, b) => {
    const tA = a?.markedAt ? new Date(a.markedAt).getTime() : 0;
    const tB = b?.markedAt ? new Date(b.markedAt).getTime() : 0;
    return tA - tB;
  });

  sorted.forEach(rec => {
    if (!rec || !rec.date || rec.period === undefined || rec.period === null) return;
    const periodNum = Number(rec.period);
    if (isNaN(periodNum)) return;
    if (!periodData[rec.date]) {
      periodData[rec.date] = {};
    }
    periodData[rec.date][periodNum] = rec.status;
  });
  return periodData;
}

/**
 * Computes semester attendance metrics from periodData using canonical daily status.
 *
 * Rules:
 * - 'Present': increment both conducted days and attended days.
 * - 'Absent': increment conducted days only.
 * - 'Pending' & 'Incomplete' & 'Unrecorded': increment neither (excluded from completed-day attendance totals & percentage).
 * - Percentage = Math.round((attended / conducted) * 100) if conducted > 0, else 0.
 * - Does not count the same date more than once.
 * - Preserves existing return fields ({ percentage, attended, total }) and adds pendingDays.
 *
 * @param {Object} periodData - Map of dates to period maps: { "YYYY-MM-DD": { 1: "Present", ... } }
 * @param {Object} [options] - Optional settings (e.g. { includeFuture: true })
 * @returns {{ percentage: number, attended: number, total: number, pendingDays: number }}
 */
export function calculateAttendanceMetrics(periodData = {}, options = {}) {
  let totalConducted = 0;
  let totalAttended = 0;
  let pendingDays = 0;

  const todayDate = new Date();
  todayDate.setHours(0, 0, 0, 0);

  const uniqueDates = [...new Set(Object.keys(periodData || {}))];

  uniqueDates.forEach(dateStr => {
    if (!dateStr) return;

    const dateObj = parseLocalDate(dateStr);
    if (!isNaN(dateObj.getTime())) {
      if (!options?.includeFuture && dateObj > todayDate) return;
      if (options?.startDate && dateObj < options.startDate) return;
      if (options?.endDate && dateObj > options.endDate) return;
      if (typeof options?.filter === 'function' && !options.filter(dateObj, dateStr)) return;
    }

    const periods = periodData[dateStr] || {};
    const status = getDayAttendanceStatus(periods);

    if (status === 'Present') {
      totalConducted++;
      totalAttended++;
    } else if (status === 'Absent') {
      totalConducted++;
    } else if (status === 'Pending' || status === 'Incomplete') {
      pendingDays++;
    }
  });

  const percentage = totalConducted > 0 ? Math.round((totalAttended / totalConducted) * 100) : 0;
  return {
    percentage,
    attended: totalAttended,
    total: totalConducted,
    pendingDays
  };
}

/**
 * Creates a teacher class allocation document in Firestore.
 * Callable ONLY by an authorized Director (enforced by firestore.rules).
 * 
 * Document ID canonical format: {teacherUid}_{department}_{year}_{section}
 * Supports legacy format {teacherUid}_{year}_{section} for backward compatibility.
 * Fields required: teacherUid, institution, department, year, section, authorized
 */
export async function createTeacherAllocation({
  teacherUid,
  institution,
  department,
  year,
  section,
  directorUid
}, dbInstance = db) {
  if (!teacherUid || !institution || !department || !year || !section) {
    throw new Error('All allocation fields (teacherUid, institution, department, year, section) are required.');
  }

  const allocId = `${teacherUid}_${department}_${year}_${section}`;
  const allocRef = doc(dbInstance, 'teacher_allocations', allocId);

  // Check for genuine duplicate allocation on canonical document ID
  try {
    const existingSnap = await getDoc(allocRef);
    if (existingSnap.exists() && existingSnap.data()?.authorized !== false) {
      throw new Error(`This faculty member is already allocated to ${department} • ${year} • ${section}.`);
    }
  } catch (checkErr) {
    if (checkErr.message?.includes('already allocated')) {
      throw checkErr;
    }
    console.warn(`[AllocationDiagnostic] Pre-write canonical read check warning: op=getDoc(canonical), code=${checkErr?.code || 'unknown'}`);
  }

  // Also check legacy doc ID for true duplicate (same faculty, year, section, and department)
  try {
    const legacyAllocId = `${teacherUid}_${year}_${section}`;
    const legacyRef = doc(dbInstance, 'teacher_allocations', legacyAllocId);
    const legacySnap = await getDoc(legacyRef);
    if (legacySnap.exists() && legacySnap.data()?.authorized !== false && legacySnap.data()?.department === department) {
      throw new Error(`This faculty member is already allocated to ${department} • ${year} • ${section}.`);
    }
  } catch (legacyCheckErr) {
    if (legacyCheckErr.message?.includes('already allocated')) {
      throw legacyCheckErr;
    }
    console.warn(`[AllocationDiagnostic] Pre-write legacy read check warning: op=getDoc(legacy), code=${legacyCheckErr?.code || 'unknown'}`);
  }

  const payload = {
    teacherUid,
    institution,
    department,
    year,
    section,
    authorized: true,
    createdAt: new Date().toISOString()
  };
  if (directorUid) {
    payload.createdBy = directorUid;
  }

  try {
    await setDoc(allocRef, payload);
  } catch (writeErr) {
    console.error(`[AllocationDiagnostic] Allocation write failed: op=setDoc(teacher_allocations), code=${writeErr?.code || 'unknown'}`);
    throw writeErr;
  }

  return { id: allocId, ...payload };
}

/**
 * Removes/revokes a teacher class allocation document.
 * Callable ONLY by an authorized Director (enforced by firestore.rules).
 */
export async function deleteTeacherAllocation(allocId, dbInstance = db) {
  if (!allocId) return;
  const allocRef = doc(dbInstance, 'teacher_allocations', allocId);
  await deleteDoc(allocRef);
  return allocId;
}

/**
 * Fetches teacher class allocations.
 * Directors can query within their institution; faculty can query their own.
 */
export async function fetchTeacherAllocations({ institution, teacherUid } = {}, dbInstance = db) {
  let q;
  if (institution && teacherUid) {
    q = query(
      collection(dbInstance, 'teacher_allocations'),
      where('institution', '==', institution),
      where('teacherUid', '==', teacherUid)
    );
  } else if (institution) {
    q = query(
      collection(dbInstance, 'teacher_allocations'),
      where('institution', '==', institution)
    );
  } else if (teacherUid) {
    q = query(
      collection(dbInstance, 'teacher_allocations'),
      where('teacherUid', '==', teacherUid)
    );
  } else {
    q = collection(dbInstance, 'teacher_allocations');
  }

  const snapshot = await getDocs(q);
  const allocations = [];
  snapshot.forEach(docSnap => {
    allocations.push({
      id: docSnap.id,
      ...docSnap.data()
    });
  });
  return allocations;
}

/**
 * Subscribes to real-time class allocations for a specific teacher.
 */
export function subscribeTeacherAllocations({ institution, teacherUid }, onUpdate, onError, dbInstance = db) {
  if (!teacherUid) return () => {};

  let q;
  if (institution) {
    q = query(
      collection(dbInstance, 'teacher_allocations'),
      where('institution', '==', institution),
      where('teacherUid', '==', teacherUid)
    );
  } else {
    q = query(
      collection(dbInstance, 'teacher_allocations'),
      where('teacherUid', '==', teacherUid)
    );
  }

  return onSnapshot(
    q,
    (snapshot) => {
      const allocations = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        if (data.authorized !== false) {
          allocations.push({
            id: docSnap.id,
            ...data
          });
        }
      });
      onUpdate(allocations);
    },
    (err) => {
      console.error('Error subscribing to teacher allocations:', err);
      if (onError) onError(err);
    }
  );
}

/**
 * Resolves the academic branch, year, section, and scope text from a group object or default allocation.
 * Guarantees zero hardcoded fallbacks to any specific department or class.
 */
export function resolveAcademicScope(group, defaultAlloc = null) {
  let br = "Unknown";
  let yr = "Unknown";
  let sec = "All Sections";
  let scopeText = "All Sections";

  if (group && group.path && Array.isArray(group.path) && group.path.length > 0) {
    if (group.path.length >= 6 && (group.path[1] === 'B.Tech' || group.path[1] === 'M.Tech' || group.path[1] === 'BCA' || group.path[1] === 'BBA')) {
      // 6+ level hierarchy: [institution, programme, branch, specialization, year, section, subject?]
      br = group.path[2] + " " + group.path[3];
      yr = group.path[4];
      sec = group.path[5];
      if (group.path.length >= 7) {
        sec = group.path[5] + " · " + group.path[6];
      }
    } else if (group.path.length >= 4) {
      // 4 level hierarchy: [institution, department, year, section, subject?]
      br = group.path[1];
      yr = group.path[2];
      sec = group.path[3];
      if (group.path.length >= 5) {
        sec = group.path[3] + " · " + group.path[4];
      }
    } else if (group.path.length >= 2) {
      br = group.path[1];
      if (group.path.length >= 3) {
        yr = group.path[2];
      }
    }
    if (group.scope) {
      scopeText = group.scope;
    }
  } else if (defaultAlloc) {
    br = defaultAlloc.department || "Unknown";
    yr = defaultAlloc.year || "Unknown";
    sec = defaultAlloc.section || "All Sections";
    scopeText = defaultAlloc.section ? `${defaultAlloc.section} only` : "All Sections";
  }

  return { br, yr, sec, scopeText };
}

/**
 * Builds a dynamic hierarchy tree from a list of teacher allocations.
 * Returns an empty tree when allocations are empty or not provided.
 */
export function buildAcademicHierarchyTree(allocList, defaultInstitution = 'UEMK') {
  const tree = {};
  if (!Array.isArray(allocList)) return tree;
  allocList.forEach(alloc => {
    const inst = alloc.institution || defaultInstitution;
    const dept = alloc.department;
    const yr = alloc.year;
    const sec = alloc.section;
    if (!dept || !yr || !sec) return;
    if (!tree[inst]) tree[inst] = {};
    if (!tree[inst][dept]) tree[inst][dept] = {};
    if (!tree[inst][dept][yr]) tree[inst][dept][yr] = {};
    if (!tree[inst][dept][yr][sec]) tree[inst][dept][yr][sec] = {};
    const subject = alloc.subject || 'All Subjects';
    tree[inst][dept][yr][sec][subject] = alloc.permissions || ['View', 'Announce', 'Attendance'];
  });
  return tree;
}


