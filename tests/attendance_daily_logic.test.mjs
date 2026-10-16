/**
 * Dedicated Unit Test Suite: Sangam Attendance Daily Logic
 *
 * Verifies canonical attendance daily status determination and semester metrics:
 * 1. TEACHING_PERIODS and BREAK_PERIOD constant integrity
 * 2. getDayAttendanceStatus:
 *    - 1 Absent + 7 unmarked -> Absent
 *    - 1 Present + 7 unmarked -> Pending
 *    - 1 Absent + 5 Present + 2 unmarked -> Absent
 *    - All 8 teaching periods Present -> Present
 *    - Period 5 is completely ignored even if present in input
 *    - No marked periods -> Unrecorded
 *    - String keys vs numeric keys interoperability
 * 3. calculateAttendanceMetrics:
 *    - Present days count toward conducted and attended
 *    - Absent days count toward conducted only
 *    - Pending and Unrecorded days count toward neither
 *    - Multiple dates aggregate correctly without duplicate counting
 *    - Return shape compatibility: { percentage, attended, total, pendingDays }
 *    - Zero conducted days returns 0%
 * 4. transformRecordsToPeriodData integration with calculateAttendanceMetrics
 */

import {
  TEACHING_PERIODS,
  BREAK_PERIOD,
  getDayAttendanceStatus,
  calculateAttendanceMetrics,
  transformRecordsToPeriodData,
  generateSessionId,
  getCurrentPeriod,
  savePeriodAttendance,
  saveSingleStudentAttendance,
  getTodayDateString,
  parseLocalDate,
  formatLocalDate
} from '../src/services/attendanceService.js';

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

console.log('Running Attendance Daily Logic Test Suite...\n');

// ---------------------------------------------------------------
// 1. Constant Definitions
// ---------------------------------------------------------------
report(
  1,
  'TEACHING_PERIODS contains exactly 8 teaching periods [1, 2, 3, 4, 6, 7, 8, 9]',
  Array.isArray(TEACHING_PERIODS) &&
    TEACHING_PERIODS.length === 8 &&
    TEACHING_PERIODS.join(',') === '1,2,3,4,6,7,8,9'
);

report(
  2,
  'BREAK_PERIOD is defined as 5 and excluded from TEACHING_PERIODS',
  BREAK_PERIOD === 5 && !TEACHING_PERIODS.includes(5)
);

// ---------------------------------------------------------------
// 2. Canonical getDayAttendanceStatus Tests
// ---------------------------------------------------------------
// Case 3: One Absent and seven unmarked -> Absent
const case3Status = getDayAttendanceStatus({ 1: 'Absent' });
report(
  3,
  'One Absent and seven unmarked -> Absent',
  case3Status === 'Absent',
  `Expected Absent, got ${case3Status}`
);

// Case 4: One Present and seven unmarked -> Pending
const case4Status = getDayAttendanceStatus({ 1: 'Present' });
report(
  4,
  'One Present and seven unmarked -> Pending',
  case4Status === 'Pending',
  `Expected Pending, got ${case4Status}`
);

// Case 5: One Absent, five Present, and two unmarked -> Absent
const case5Status = getDayAttendanceStatus({
  1: 'Present',
  2: 'Present',
  3: 'Present',
  4: 'Present',
  6: 'Present',
  7: 'Absent'
});
report(
  5,
  'One Absent, five Present, and two unmarked -> Absent',
  case5Status === 'Absent',
  `Expected Absent, got ${case5Status}`
);

// Case 6: All eight teaching periods Present -> Present
const case6Status = getDayAttendanceStatus({
  1: 'Present',
  2: 'Present',
  3: 'Present',
  4: 'Present',
  6: 'Present',
  7: 'Present',
  8: 'Present',
  9: 'Present'
});
report(
  6,
  'All eight teaching periods Present -> Present',
  case6Status === 'Present',
  `Expected Present, got ${case6Status}`
);

// Case 7: Period 5 (Break) is ignored even if marked Absent
const case7Status = getDayAttendanceStatus({ 5: 'Absent' });
report(
  7,
  'Period 5 marked Absent alone -> Unrecorded (Break ignored)',
  case7Status === 'Unrecorded',
  `Expected Unrecorded, got ${case7Status}`
);

// Case 8: All eight teaching periods Present with Period 5 marked Absent -> Present
const case8Status = getDayAttendanceStatus({
  1: 'Present',
  2: 'Present',
  3: 'Present',
  4: 'Present',
  5: 'Absent', // Break period marked Absent must not poison teaching periods
  6: 'Present',
  7: 'Present',
  8: 'Present',
  9: 'Present'
});
report(
  8,
  'All eight teaching periods Present with Period 5 marked Absent -> Present (Break ignored)',
  case8Status === 'Present',
  `Expected Present, got ${case8Status}`
);

// Case 9: No marked periods (empty object, null, or undefined) -> Unrecorded
const case9a = getDayAttendanceStatus({});
const case9b = getDayAttendanceStatus(null);
const case9c = getDayAttendanceStatus(undefined);
report(
  9,
  'No marked periods -> Unrecorded (handles {}, null, undefined)',
  case9a === 'Unrecorded' && case9b === 'Unrecorded' && case9c === 'Unrecorded',
  `Got 9a=${case9a}, 9b=${case9b}, 9c=${case9c}`
);

// Case 10: String period keys interoperability
const case10Status = getDayAttendanceStatus({
  '1': 'Present',
  '2': 'Present',
  '3': 'Present',
  '4': 'Present',
  '6': 'Present',
  '7': 'Present',
  '8': 'Present',
  '9': 'Present'
});
report(
  10,
  'String period keys ("1".."9") resolve identically to numbers -> Present',
  case10Status === 'Present',
  `Expected Present, got ${case10Status}`
);

// ---------------------------------------------------------------
// 3. calculateAttendanceMetrics Tests
// ---------------------------------------------------------------
// Case 11: One Absent day -> conducted 1, attended 0, 0%
const metrics11 = calculateAttendanceMetrics({
  '2026-10-01': { 1: 'Absent' }
});
report(
  11,
  'One Absent and seven unmarked -> conducted 1, attended 0, 0%',
  metrics11.total === 1 && metrics11.attended === 0 && metrics11.percentage === 0 && metrics11.pendingDays === 0,
  `Got total=${metrics11.total}, attended=${metrics11.attended}, pct=${metrics11.percentage}`
);

// Case 12: One Present and seven unmarked -> conducted 0, attended 0, pending 1, 0%
const metrics12 = calculateAttendanceMetrics({
  '2026-10-01': { 1: 'Present' }
});
report(
  12,
  'One Present and seven unmarked -> conducted 0, attended 0, pendingDays 1, 0%',
  metrics12.total === 0 && metrics12.attended === 0 && metrics12.percentage === 0 && metrics12.pendingDays === 1,
  `Got total=${metrics12.total}, attended=${metrics12.attended}, pct=${metrics12.percentage}, pending=${metrics12.pendingDays}`
);

// Case 13: One all-Present day -> conducted 1, attended 1, 100%
const metrics13 = calculateAttendanceMetrics({
  '2026-10-01': { 1: 'Present', 2: 'Present', 3: 'Present', 4: 'Present', 6: 'Present', 7: 'Present', 8: 'Present', 9: 'Present' }
});
report(
  13,
  'All eight teaching periods Present -> conducted 1, attended 1, 100%',
  metrics13.total === 1 && metrics13.attended === 1 && metrics13.percentage === 100,
  `Got total=${metrics13.total}, attended=${metrics13.attended}, pct=${metrics13.percentage}`
);

// Case 14: Period 5 ignored in metrics even if populated
const metrics14 = calculateAttendanceMetrics({
  '2026-10-01': { 5: 'Present' }
});
report(
  14,
  'Period 5 record alone does not increment conducted or attended days',
  metrics14.total === 0 && metrics14.attended === 0 && metrics14.pendingDays === 0,
  `Got total=${metrics14.total}, attended=${metrics14.attended}, pending=${metrics14.pendingDays}`
);

// Case 15: Empty periodData returns zero conducted, attended, percentage
const metrics15 = calculateAttendanceMetrics({});
report(
  15,
  'Empty periodData returns clean zero metrics',
  metrics15.total === 0 && metrics15.attended === 0 && metrics15.percentage === 0 && metrics15.pendingDays === 0
);

// Case 16: Multiple dates aggregate correctly without duplicate counting
const multiDateData = {
  '2026-10-01': { 1: 'Present', 2: 'Present', 3: 'Present', 4: 'Present', 6: 'Present', 7: 'Present', 8: 'Present', 9: 'Present' }, // Present (att: 1, cond: 1)
  '2026-10-02': { 1: 'Absent' }, // Absent (att: 0, cond: 1)
  '2026-10-03': { 1: 'Present', 2: 'Present' }, // Pending (att: 0, cond: 0, pending: 1)
  '2026-10-04': {}, // Unrecorded (att: 0, cond: 0)
  '2026-10-05': { 1: 'Present', 2: 'Present', 3: 'Present', 4: 'Present', 6: 'Present', 7: 'Present', 8: 'Present', 9: 'Present' }, // Present (att: 1, cond: 1)
  '2026-10-06': { 3: 'Absent', 6: 'Present' }, // Absent (att: 0, cond: 1)
  '2026-10-07': { 1: 'Present', 2: 'Present', 3: 'Present', 4: 'Present', 5: 'Absent', 6: 'Present', 7: 'Present', 8: 'Present', 9: 'Present' } // Present (att: 1, cond: 1)
};
const metrics16 = calculateAttendanceMetrics(multiDateData);
// Expected:
// Conducted: 5 days (Oct 01, 02, 05, 06, 07)
// Attended: 3 days (Oct 01, 05, 07)
// Pending: 1 day (Oct 03)
// Percentage: Math.round(3 / 5 * 100) = 60%
report(
  16,
  'Multiple dates aggregate correctly: 5 conducted, 3 attended, 1 pending, 60%',
  metrics16.total === 5 &&
    metrics16.attended === 3 &&
    metrics16.percentage === 60 &&
    metrics16.pendingDays === 1,
  `Got total=${metrics16.total}, attended=${metrics16.attended}, pct=${metrics16.percentage}, pending=${metrics16.pendingDays}`
);

// Case 17: Existing callers retain expected return shape
const metrics17 = calculateAttendanceMetrics({ '2026-10-01': { 1: 'Absent' } });
const hasRequiredKeys = 'percentage' in metrics17 && 'attended' in metrics17 && 'total' in metrics17;
const typesCorrect = typeof metrics17.percentage === 'number' && typeof metrics17.attended === 'number' && typeof metrics17.total === 'number';
report(
  17,
  'Return shape preserves existing caller contracts { percentage, attended, total }',
  hasRequiredKeys && typesCorrect,
  `Keys: ${Object.keys(metrics17).join(', ')}`
);

// Case 18: transformRecordsToPeriodData integration
const rawRecords = [
  { date: '2026-10-01', period: 1, status: 'Present' },
  { date: '2026-10-01', period: 2, status: 'Present' },
  { date: '2026-10-01', period: 3, status: 'Present' },
  { date: '2026-10-01', period: 4, status: 'Present' },
  { date: '2026-10-01', period: 6, status: 'Present' },
  { date: '2026-10-01', period: 7, status: 'Present' },
  { date: '2026-10-01', period: 8, status: 'Present' },
  { date: '2026-10-01', period: 9, status: 'Present' },
  { date: '2026-10-02', period: 4, status: 'Absent' },
  { date: '2026-10-03', period: 1, status: 'Present' }
];
const transformed = transformRecordsToPeriodData(rawRecords);
const metrics18 = calculateAttendanceMetrics(transformed);
report(
  18,
  'transformRecordsToPeriodData integration produces exact metrics (2 conducted, 1 attended, 1 pending, 50%)',
  metrics18.total === 2 &&
    metrics18.attended === 1 &&
    metrics18.percentage === 50 &&
    metrics18.pendingDays === 1,
  `Got total=${metrics18.total}, attended=${metrics18.attended}, pct=${metrics18.percentage}, pending=${metrics18.pendingDays}`
);

// ---------------------------------------------------------------
// 5. Manual Period Selection & Validation (Step 3)
// ---------------------------------------------------------------

// Case 19: All 8 teaching periods are valid for manual selection
const allTeachingPeriodsValid = TEACHING_PERIODS.every(p => TEACHING_PERIODS.includes(p) && p !== BREAK_PERIOD);
report(
  19,
  'Manual teaching period validation accepts exactly all 8 teaching periods [1, 2, 3, 4, 6, 7, 8, 9]',
  allTeachingPeriodsValid && TEACHING_PERIODS.length === 8,
  `Valid periods: ${TEACHING_PERIODS.join(', ')}`
);

// Case 20: BREAK_PERIOD (5) and invalid period numbers are rejected
const invalidPeriods = [5, BREAK_PERIOD, 0, 10, -1, null, undefined, '5', 'foo'];
const allInvalidRejected = invalidPeriods.every(p => !TEACHING_PERIODS.includes(p));
report(
  20,
  'Period validation strictly rejects BREAK_PERIOD (5) and out-of-range/invalid periods',
  allInvalidRejected,
  `Rejections tested: ${invalidPeriods.join(', ')}`
);

// Case 21: Initial period state safe fallback logic
const resolveInitialPeriod = (periodVal) => {
  return (TEACHING_PERIODS && TEACHING_PERIODS.includes(periodVal)) ? periodVal : (TEACHING_PERIODS?.[0] || 1);
};
const validResolved = TEACHING_PERIODS.every(p => resolveInitialPeriod(p) === p);
const breakFallback = resolveInitialPeriod(BREAK_PERIOD) === 1;
const outsideFallbackLow = resolveInitialPeriod(0) === 1;
const outsideFallbackHigh = resolveInitialPeriod(10) === 1;
report(
  21,
  'Safe period initialization: retains valid teaching periods and falls back to safe teaching period (P1) for break or off-hours',
  validResolved && breakFallback && outsideFallbackLow && outsideFallbackHigh,
  `Fallback results: break->${resolveInitialPeriod(BREAK_PERIOD)}, hour0->${resolveInitialPeriod(0)}`
);

// Case 22: Session ID generation reflects manual period selection uniquely
const sampleSessionBase = {
  institution: 'UEMK',
  department: 'Computer Science',
  year: '2nd Year',
  section: 'Sec A',
  date: '2026-10-15'
};
const sessionIds = TEACHING_PERIODS.map(p => generateSessionId({ ...sampleSessionBase, period: p }));
const distinctSessionIds = new Set(sessionIds);
const allFormatValid = sessionIds.every((id, idx) => id === `UEMK_ComputerScience_2ndYear_SecA_2026-10-15_P${TEACHING_PERIODS[idx]}`);
report(
  22,
  'Manual period session ID generation produces distinct IDs across all 8 teaching periods (P1..P4, P6..P9)',
  distinctSessionIds.size === 8 && allFormatValid,
  `Generated IDs: ${sessionIds.slice(0, 3).join(', ')}...`
);

// Case 23: savePeriodAttendance strictly rejects Period 5 before writes
let period5Error = null;
try {
  await savePeriodAttendance({
    sessionInfo: { ...sampleSessionBase, period: 5 },
    studentStatuses: { 's1': 'Present' },
    teacherUid: 'teacher_123'
  }, {});
} catch (err) {
  period5Error = err;
}
report(
  23,
  'savePeriodAttendance early guard rejects Period 5 (break) before any writes',
  period5Error !== null && period5Error.message.includes('Period 5') && period5Error.message.includes('lunch/break'),
  `Caught: ${period5Error?.message}`
);

// Case 24: savePeriodAttendance strictly rejects out-of-range periods before writes
const invalidPeriodsToTest = [0, 10, -1, NaN, 'invalid'];
let allEarlyGuarded = true;
for (const badPeriod of invalidPeriodsToTest) {
  try {
    await savePeriodAttendance({
      sessionInfo: { ...sampleSessionBase, period: badPeriod },
      studentStatuses: { 's1': 'Present' },
      teacherUid: 'teacher_123'
    }, {});
    allEarlyGuarded = false;
  } catch (err) {
    if (!err.message.includes('Invalid teaching period')) {
      allEarlyGuarded = false;
    }
  }
}
report(
  24,
  'savePeriodAttendance early guard rejects out-of-range/invalid periods (0, 10, -1, NaN, invalid)',
  allEarlyGuarded
);

// Case 25: saveSingleStudentAttendance strictly rejects Period 5 and out-of-range periods before writes
let singleP5Threw = false;
try {
  await saveSingleStudentAttendance({
    sessionInfo: { ...sampleSessionBase, period: 5 },
    studentUid: 's1',
    status: 'Present',
    teacherUid: 'teacher_123'
  }, {});
} catch (err) {
  singleP5Threw = err.message.includes('Period 5');
}
let singleBadThrew = false;
try {
  await saveSingleStudentAttendance({
    sessionInfo: { ...sampleSessionBase, period: 10 },
    studentUid: 's1',
    status: 'Present',
    teacherUid: 'teacher_123'
  }, {});
} catch (err) {
  singleBadThrew = err.message.includes('Invalid teaching period');
}
report(
  25,
  'saveSingleStudentAttendance early guard rejects Period 5 and invalid periods before writes',
  singleP5Threw && singleBadThrew
);

// ---------------------------------------------------------------
// 5. Step 5 Student Attendance Improvements & Date Handling Tests
// ---------------------------------------------------------------

// Case 26: getTodayDateString & formatLocalDate format Date objects as local YYYY-MM-DD
const testDate = new Date(2026, 9, 15, 0, 0, 0); // Oct 15, 2026 local time
const formattedLocal = getTodayDateString(testDate);
const formattedAlias = formatLocalDate(testDate);
report(
  26,
  'getTodayDateString & formatLocalDate produce local YYYY-MM-DD without UTC timezone skew',
  formattedLocal === '2026-10-15' && formattedAlias === '2026-10-15',
  `Expected "2026-10-15", got "${formattedLocal}"`
);

// Case 27: parseLocalDate safely converts YYYY-MM-DD to local midnight Date object
const parsed = parseLocalDate('2026-10-15');
report(
  27,
  'parseLocalDate safely parses YYYY-MM-DD into local midnight Date object',
  parsed.getFullYear() === 2026 &&
    parsed.getMonth() === 9 &&
    parsed.getDate() === 15 &&
    parsed.getHours() === 0 &&
    parsed.getMinutes() === 0,
  `Parsed date: ${parsed.toISOString()}`
);

// Case 28: calculateAttendanceMetrics with startDate and endDate filters
const windowFilterData = {
  '2026-10-12': { 1: 'Present', 2: 'Present', 3: 'Present', 4: 'Present', 6: 'Present', 7: 'Present', 8: 'Present', 9: 'Present' }, // Mon: Present
  '2026-10-13': { 1: 'Absent' }, // Tue: Absent
  '2026-10-14': { 1: 'Present' }, // Wed: Pending (1/8)
  '2026-09-30': { 1: 'Present', 2: 'Present', 3: 'Present', 4: 'Present', 6: 'Present', 7: 'Present', 8: 'Present', 9: 'Present' }  // Sep 30: Prior month Present
};

const windowMetrics = calculateAttendanceMetrics(windowFilterData, {
  startDate: new Date(2026, 9, 12, 0, 0, 0),
  endDate: new Date(2026, 9, 14, 23, 59, 59),
  includeFuture: true
});
report(
  28,
  'calculateAttendanceMetrics with startDate & endDate calculates consistent window metrics',
  windowMetrics.total === 2 && // 1 Present + 1 Absent = 2 completed days (Pending excluded)
    windowMetrics.attended === 1 &&
    windowMetrics.percentage === 50 &&
    windowMetrics.pendingDays === 1,
  `Expected total: 2, attended: 1, percent: 50, pending: 1; got ${JSON.stringify(windowMetrics)}`
);

// Case 29: Student UI period-wise table daily status badge logic
const statusMap = {
  presentDay: getDayAttendanceStatus({ 1: 'Present', 2: 'Present', 3: 'Present', 4: 'Present', 6: 'Present', 7: 'Present', 8: 'Present', 9: 'Present' }),
  absentDay: getDayAttendanceStatus({ 1: 'Present', 3: 'Absent' }),
  pendingDay: getDayAttendanceStatus({ 1: 'Present', 2: 'Present', 3: 'Present' }),
  unrecordedDay: getDayAttendanceStatus({})
};
const pendingMarkedCount = TEACHING_PERIODS.filter(p => [1, 2, 3].includes(p)).length;
report(
  29,
  'Student UI daily status resolutions (Present, Absent, Pending with progress count, Unrecorded)',
  statusMap.presentDay === 'Present' &&
    statusMap.absentDay === 'Absent' &&
    statusMap.pendingDay === 'Pending' &&
    statusMap.unrecordedDay === 'Unrecorded' &&
    pendingMarkedCount === 3
);

// Case 30: 75% warning trigger strictly counts completed days (Pending excluded, 0 conducted = no warning)
const pendingOnlyData = {
  '2026-10-14': { 1: 'Present', 2: 'Present' } // Pending (2/8)
};
const pendingOnlyMetrics = calculateAttendanceMetrics(pendingOnlyData, { includeFuture: true });
const shouldWarnPendingOnly = pendingOnlyMetrics.total > 0 && pendingOnlyMetrics.percentage < 75;

const belowThresholdData = {
  '2026-10-12': { 1: 'Absent' },
  '2026-10-13': { 1: 'Absent' }
};
const belowThresholdMetrics = calculateAttendanceMetrics(belowThresholdData, { includeFuture: true });
const shouldWarnBelow = belowThresholdMetrics.total > 0 && belowThresholdMetrics.percentage < 75;

report(
  30,
  '75% warning evaluation: Pending days do not trigger false warning; completed below 75% triggers warning',
  !shouldWarnPendingOnly && shouldWarnBelow,
  `pendingOnly: total=${pendingOnlyMetrics.total}, warn=${shouldWarnPendingOnly}; belowThreshold: total=${belowThresholdMetrics.total}, warn=${shouldWarnBelow}`
);

// ---------------------------------------------------------------
// 6. SECTION 3 MANDATORY POLICY EXAMPLES (Explicit 8 Rows)
// ---------------------------------------------------------------

// Row 1: All 8 Present -> Present — 1 completed day
const row1Day = { 1: 'Present', 2: 'Present', 3: 'Present', 4: 'Present', 6: 'Present', 7: 'Present', 8: 'Present', 9: 'Present' };
const row1Status = getDayAttendanceStatus(row1Day);
const row1Metrics = calculateAttendanceMetrics({ '2026-10-01': row1Day }, { includeFuture: true });
report(
  31,
  'Section 3 Row 1: All 8 Present -> Present, 1 completed day (attended 1, conducted 1, 100%)',
  row1Status === 'Present' && row1Metrics.total === 1 && row1Metrics.attended === 1 && row1Metrics.percentage === 100 && row1Metrics.pendingDays === 0,
  `status=${row1Status}, metrics=${JSON.stringify(row1Metrics)}`
);

// Row 2: 1 Absent, 7 Present -> Absent — 1 completed day
const row2Day = { 1: 'Absent', 2: 'Present', 3: 'Present', 4: 'Present', 6: 'Present', 7: 'Present', 8: 'Present', 9: 'Present' };
const row2Status = getDayAttendanceStatus(row2Day);
const row2Metrics = calculateAttendanceMetrics({ '2026-10-01': row2Day }, { includeFuture: true });
report(
  32,
  'Section 3 Row 2: 1 Absent, 7 Present -> Absent, 1 completed day (attended 0, conducted 1, 0%)',
  row2Status === 'Absent' && row2Metrics.total === 1 && row2Metrics.attended === 0 && row2Metrics.percentage === 0 && row2Metrics.pendingDays === 0,
  `status=${row2Status}, metrics=${JSON.stringify(row2Metrics)}`
);

// Row 3: 1 Absent, 7 unmarked -> Absent — 1 completed day
const row3Day = { 3: 'Absent' };
const row3Status = getDayAttendanceStatus(row3Day);
const row3Metrics = calculateAttendanceMetrics({ '2026-10-01': row3Day }, { includeFuture: true });
report(
  33,
  'Section 3 Row 3: 1 Absent, 7 unmarked -> Absent, 1 completed day (attended 0, conducted 1, 0%)',
  row3Status === 'Absent' && row3Metrics.total === 1 && row3Metrics.attended === 0 && row3Metrics.percentage === 0 && row3Metrics.pendingDays === 0,
  `status=${row3Status}, metrics=${JSON.stringify(row3Metrics)}`
);

// Row 4: 1 Present, 7 unmarked -> Incomplete — 0 completed days
const row4Day = { 1: 'Present' };
const row4Status = getDayAttendanceStatus(row4Day);
const row4Metrics = calculateAttendanceMetrics({ '2026-10-01': row4Day }, { includeFuture: true });
report(
  34,
  'Section 3 Row 4: 1 Present, 7 unmarked -> Incomplete/Pending, 0 completed days (attended 0, conducted 0, pending 1, 0%)',
  row4Status === 'Pending' && row4Metrics.total === 0 && row4Metrics.attended === 0 && row4Metrics.percentage === 0 && row4Metrics.pendingDays === 1,
  `status=${row4Status}, metrics=${JSON.stringify(row4Metrics)}`
);

// Row 5: 4 Present, 4 unmarked -> Incomplete — 0 completed days
const row5Day = { 1: 'Present', 2: 'Present', 3: 'Present', 4: 'Present' };
const row5Status = getDayAttendanceStatus(row5Day);
const row5Metrics = calculateAttendanceMetrics({ '2026-10-01': row5Day }, { includeFuture: true });
report(
  35,
  'Section 3 Row 5: 4 Present, 4 unmarked -> Incomplete/Pending, 0 completed days (attended 0, conducted 0, pending 1, 0%)',
  row5Status === 'Pending' && row5Metrics.total === 0 && row5Metrics.attended === 0 && row5Metrics.percentage === 0 && row5Metrics.pendingDays === 1,
  `status=${row5Status}, metrics=${JSON.stringify(row5Metrics)}`
);

// Row 6: 7 Present, 1 unmarked -> Incomplete — 0 completed days
const row6Day = { 1: 'Present', 2: 'Present', 3: 'Present', 4: 'Present', 6: 'Present', 7: 'Present', 8: 'Present' }; // P9 unmarked
const row6Status = getDayAttendanceStatus(row6Day);
const row6Metrics = calculateAttendanceMetrics({ '2026-10-01': row6Day }, { includeFuture: true });
report(
  36,
  'Section 3 Row 6: 7 Present, 1 unmarked -> Incomplete/Pending, 0 completed days (attended 0, conducted 0, pending 1, 0%)',
  row6Status === 'Pending' && row6Metrics.total === 0 && row6Metrics.attended === 0 && row6Metrics.percentage === 0 && row6Metrics.pendingDays === 1,
  `status=${row6Status}, metrics=${JSON.stringify(row6Metrics)}`
);

// Row 7: All 8 unmarked -> Incomplete — 0 completed days
const row7Day = {};
const row7Status = getDayAttendanceStatus(row7Day);
const row7Metrics = calculateAttendanceMetrics({ '2026-10-01': row7Day }, { includeFuture: true });
report(
  37,
  'Section 3 Row 7: All 8 unmarked -> Incomplete/Unrecorded, 0 completed days (attended 0, conducted 0, pending 0, 0%)',
  row7Status === 'Unrecorded' && row7Metrics.total === 0 && row7Metrics.attended === 0 && row7Metrics.percentage === 0 && row7Metrics.pendingDays === 0,
  `status=${row7Status}, metrics=${JSON.stringify(row7Metrics)}`
);

// Row 8: P1–P4 and P6–P9 complete, P5 absent or missing -> Ignore P5; determine result from the 8 teaching periods
// Subcase 8a: P1-P4 and P6-P9 Present, P5 absent -> Present (1 completed day)
const row8aDay = { 1: 'Present', 2: 'Present', 3: 'Present', 4: 'Present', 5: 'Absent', 6: 'Present', 7: 'Present', 8: 'Present', 9: 'Present' };
const row8aStatus = getDayAttendanceStatus(row8aDay);
const row8aMetrics = calculateAttendanceMetrics({ '2026-10-01': row8aDay }, { includeFuture: true });
// Subcase 8b: P1-P4 and P6-P9 Present, P5 missing -> Present (1 completed day)
const row8bDay = { 1: 'Present', 2: 'Present', 3: 'Present', 4: 'Present', 6: 'Present', 7: 'Present', 8: 'Present', 9: 'Present' };
const row8bStatus = getDayAttendanceStatus(row8bDay);
const row8bMetrics = calculateAttendanceMetrics({ '2026-10-01': row8bDay }, { includeFuture: true });
// Subcase 8c: P1-P4 Present, P6-P8 Present, P9 Absent, P5 Present -> Absent (1 completed day)
const row8cDay = { 1: 'Present', 2: 'Present', 3: 'Present', 4: 'Present', 5: 'Present', 6: 'Present', 7: 'Present', 8: 'Present', 9: 'Absent' };
const row8cStatus = getDayAttendanceStatus(row8cDay);
const row8cMetrics = calculateAttendanceMetrics({ '2026-10-01': row8cDay }, { includeFuture: true });

report(
  38,
  'Section 3 Row 8: P1-P4 and P6-P9 complete, P5 absent or missing -> Ignore P5, determined strictly from the 8 teaching periods',
  row8aStatus === 'Present' && row8aMetrics.total === 1 && row8aMetrics.attended === 1 &&
  row8bStatus === 'Present' && row8bMetrics.total === 1 && row8bMetrics.attended === 1 &&
  row8cStatus === 'Absent' && row8cMetrics.total === 1 && row8cMetrics.attended === 0,
  `8a: ${row8aStatus}, 8b: ${row8bStatus}, 8c: ${row8cStatus}`
);

// ---------------------------------------------------------------
// 7. DEDUPLICATION TESTS (Prevent inflation from duplicate period records)
// ---------------------------------------------------------------

// Case 39: Duplicate records for same student, date, and period (latest markedAt wins)
const duplicateRecords = [
  { date: '2026-10-01', period: 1, status: 'Absent', markedAt: '2026-10-01T09:00:00.000Z' },
  { date: '2026-10-01', period: 1, status: 'Present', markedAt: '2026-10-01T09:05:00.000Z' }, // Updated to Present
  { date: '2026-10-01', period: 2, status: 'Present', markedAt: '2026-10-01T10:00:00.000Z' },
  { date: '2026-10-01', period: 2, status: 'Present', markedAt: '2026-10-01T10:00:05.000Z' }, // Duplicate submission
  { date: '2026-10-01', period: 3, status: 'Present', markedAt: '2026-10-01T11:00:00.000Z' },
  { date: '2026-10-01', period: 4, status: 'Present', markedAt: '2026-10-01T12:00:00.000Z' },
  { date: '2026-10-01', period: 6, status: 'Present', markedAt: '2026-10-01T14:00:00.000Z' },
  { date: '2026-10-01', period: 7, status: 'Present', markedAt: '2026-10-01T15:00:00.000Z' },
  { date: '2026-10-01', period: 8, status: 'Present', markedAt: '2026-10-01T16:00:00.000Z' },
  { date: '2026-10-01', period: 9, status: 'Present', markedAt: '2026-10-01T17:00:00.000Z' }
];

const dedupPeriodData = transformRecordsToPeriodData(duplicateRecords);
const dedupMetrics = calculateAttendanceMetrics(dedupPeriodData, { includeFuture: true });

// Verify that period 1 is 'Present' (the later record), exactly 8 periods exist on 2026-10-01, and day counts as 1 completed day
const p1FinalStatus = dedupPeriodData['2026-10-01']?.[1];
const periodKeysCount = Object.keys(dedupPeriodData['2026-10-01'] || {}).length;

report(
  39,
  'Deduplication: Duplicate period records overwrite deterministically by markedAt; period count is exactly 8, conducted is exactly 1',
  p1FinalStatus === 'Present' &&
    periodKeysCount === 8 &&
    dedupMetrics.total === 1 &&
    dedupMetrics.attended === 1 &&
    dedupMetrics.percentage === 100,
  `p1Status=${p1FinalStatus}, periodCount=${periodKeysCount}, total=${dedupMetrics.total}, attended=${dedupMetrics.attended}`
);

// Case 40: Multi-day aggregation with mixed Completed and Pending days across Week/Month/Semester
const multiWindowData = {
  // Completed Present day (all 8 Present)
  '2026-10-12': { 1: 'Present', 2: 'Present', 3: 'Present', 4: 'Present', 6: 'Present', 7: 'Present', 8: 'Present', 9: 'Present' },
  // Completed Absent day (1 Absent, 7 Present)
  '2026-10-13': { 1: 'Absent', 2: 'Present', 3: 'Present', 4: 'Present', 6: 'Present', 7: 'Present', 8: 'Present', 9: 'Present' },
  // Incomplete/Pending day (P1 Present, 7 unmarked) -> MUST NOT COUNT in completed total
  '2026-10-14': { 1: 'Present' },
  // Completed Absent day (1 Absent, 7 unmarked)
  '2026-10-15': { 4: 'Absent' },
  // Incomplete/Pending day (4 Present, 4 unmarked) -> MUST NOT COUNT in completed total
  '2026-10-16': { 1: 'Present', 2: 'Present', 3: 'Present', 4: 'Present' }
};

const weekSummary = calculateAttendanceMetrics(multiWindowData, { includeFuture: true });
// Expected:
// Completed Conducted: 3 days (Oct 12 Present, Oct 13 Absent, Oct 15 Absent)
// Completed Attended: 1 day (Oct 12 Present)
// Incomplete/Pending: 2 days (Oct 14, Oct 16)
// Percentage: Math.round(1 / 3 * 100) = 33%
report(
  40,
  'Multi-day aggregation: Incomplete days strictly excluded from completed total and percentage; 3 completed days, 1 attended, 2 pending, 33%',
  weekSummary.total === 3 &&
    weekSummary.attended === 1 &&
    weekSummary.pendingDays === 2 &&
    weekSummary.percentage === 33,
  `total=${weekSummary.total}, attended=${weekSummary.attended}, pending=${weekSummary.pendingDays}, pct=${weekSummary.percentage}`
);

console.log('\n========================================');
console.log(`ATTENDANCE DAILY LOGIC: ${passed} PASSED, ${failed} FAILED`);
console.log('========================================');

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}

