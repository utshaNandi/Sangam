import { useState, useEffect } from 'react';
import { Icons } from '../Teacher/Icons';
import { 
  subscribeStudentAttendance, 
  transformRecordsToPeriodData, 
  calculateAttendanceMetrics,
  getDayAttendanceStatus,
  getTodayDateString,
  TEACHING_PERIODS
} from '../../services/attendanceService';

export default function StudentAttendance({ userProfile }) {
  const studentId = userProfile?.uid || '';
  const [attendanceRecords, setAttendanceRecords] = useState([]);

  useEffect(() => {
    if (!studentId) return;

    const unsubscribe = subscribeStudentAttendance(
      studentId,
      (records) => {
        setAttendanceRecords(records || []);
      },
      (err) => {
        console.error('Error fetching live attendance:', err);
      }
    );

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [studentId]);

  // Real-time access to the period attendance store
  const periodData = transformRecordsToPeriodData(attendanceRecords);
  const hasAttendanceRecords = attendanceRecords.length > 0 && Object.keys(periodData).length > 0;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const dayOfWeek = today.getDay();
  const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const thisMonday = new Date(today);
  thisMonday.setDate(today.getDate() - daysSinceMonday);
  thisMonday.setHours(0, 0, 0, 0);

  const thisSunday = new Date(thisMonday);
  thisSunday.setDate(thisMonday.getDate() + 6);
  thisSunday.setHours(23, 59, 59, 999);

  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  monthStart.setHours(0, 0, 0, 0);

  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  monthEnd.setHours(23, 59, 59, 999);

  // Centralized calculations for Week, Month, and Semester using canonical daily attendance rules
  const { 
    percentage: weekPercent, 
    attended: weekDaysAttended, 
    total: weekDaysHeld,
    pendingDays: weekPendingDays
  } = calculateAttendanceMetrics(periodData, { startDate: thisMonday, endDate: thisSunday });

  const { 
    percentage: monthPercent, 
    attended: monthDaysAttended, 
    total: monthDaysHeld,
    pendingDays: monthPendingDays
  } = calculateAttendanceMetrics(periodData, { startDate: monthStart, endDate: monthEnd });

  const { 
    percentage: semesterPercentage, 
    attended: semesterClassesAttended, 
    total: semesterClassesHeld,
    pendingDays: semesterPendingDays
  } = calculateAttendanceMetrics(periodData);

  const isBelowThreshold = semesterClassesHeld > 0 && semesterPercentage < 75;
  const [dismissedWarning, setDismissedWarning] = useState(false);
  const showWarning = isBelowThreshold && !dismissedWarning;

  let analysisText = hasAttendanceRecords
    ? "Not enough data to provide an attendance analysis."
    : "Attendance records are not available yet.";
  if (hasAttendanceRecords && semesterClassesHeld > 0) {
    if (semesterPercentage >= 85) {
      analysisText = "Your attendance is currently on track and comfortably above the required target.";
    } else if (semesterPercentage >= 75) {
      analysisText = "Your attendance meets the requirement but should be maintained carefully.";
    } else {
      analysisText = "";
    }
  } else if (hasAttendanceRecords && semesterClassesHeld === 0 && semesterPendingDays > 0) {
    analysisText = "Attendance is pending completion for current scheduled day(s). Completed daily attendance will be analyzed once all 8 teaching periods are submitted.";
  }

  useEffect(() => {
    if (isBelowThreshold && !dismissedWarning) {
      const timer = setTimeout(() => {
        setDismissedWarning(true);
      }, 15000);
      return () => clearTimeout(timer);
    }
  }, [isBelowThreshold, dismissedWarning]);

  const [selectedWeek, setSelectedWeek] = useState('current');

  const getWeekDaysDates = (isCurrent) => {
    const dates = [];
    const start = new Date(thisMonday);
    if (!isCurrent) start.setDate(start.getDate() - 7);

    // Monday through Friday (5 days). If Saturday has attendance in periodData, include Saturday as well (6 days).
    const saturdayDate = new Date(start);
    saturdayDate.setDate(saturdayDate.getDate() + 5);
    const hasSaturday = Boolean(periodData[getTodayDateString(saturdayDate)]);
    const totalDays = hasSaturday ? 6 : 5;

    for (let i = 0; i < totalDays; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      if (isCurrent && d > today) continue;
      dates.push(d);
    }
    return dates;
  };

  const gridDates = getWeekDaysDates(selectedWeek === 'current');

  return (
    <div className="space-y-4 animate-fade-in relative z-10 pb-8">

      {/* Warning Message */}
      {showWarning && (
        <div className="bg-rose-50 border border-rose-200 rounded-[24px] p-6 flex items-start gap-4 animate-fade-in shadow-sm relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-rose-500"></div>
          <div className="w-10 h-10 rounded-full bg-rose-100 text-rose-500 flex items-center justify-center shrink-0">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
          </div>
          <div className="flex-1 pt-1">
            <h3 className="text-rose-800 font-bold text-lg mb-1">Attendance Warning</h3>
            <p className="text-rose-600 font-medium text-sm">
              Your attendance is below 75%. Attend upcoming classes regularly to reach 75% attendance.
            </p>
          </div>
        </div>
      )}

      {/* Header Area */}
      <div className="bg-white rounded-[24px] border border-slate-200/60 shadow-sm p-5 relative overflow-hidden">
        <div className="absolute top-0 right-0 p-5 opacity-5 pointer-events-none">
          <Icons.Attendance />
        </div>
        <div className="relative z-10">
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight mb-1">
            Attendance Analysis
          </h2>
          <p className="text-sm text-slate-600 max-w-2xl">
              {analysisText}
            </p>
        </div>
      </div>

      {/* Analysis Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <AnalysisCard
          title="This Week"
          percentage={weekPercent}
          attended={weekDaysAttended}
          total={weekDaysHeld}
          pendingDays={weekPendingDays}
        />
        <AnalysisCard
          title="This Month"
          percentage={monthPercent}
          attended={monthDaysAttended}
          total={monthDaysHeld}
          pendingDays={monthPendingDays}
        />
        <AnalysisCard
          title="This Semester (Till Now)"
          percentage={semesterPercentage}
          attended={semesterClassesAttended}
          total={semesterClassesHeld}
          pendingDays={semesterPendingDays}
          isMain={true}
        />
      </div>

      {/* Period-wise Grid */}
      <div className="bg-white rounded-[24px] border border-slate-200/60 shadow-sm p-6 overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <h3 className="text-lg font-bold text-slate-900">Period-wise Details</h3>
          <div className="flex bg-slate-100 p-1 rounded-xl">
            <button
              onClick={() => setSelectedWeek('previous')}
              className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${selectedWeek === 'previous' ? 'bg-white text-theme-primary shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Previous Week
            </button>
            <button
              onClick={() => setSelectedWeek('current')}
              className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${selectedWeek === 'current' ? 'bg-white text-theme-primary shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Current Week
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[600px]">
            <thead>
              <tr className="border-b-2 border-slate-100">
                <th className="py-3 px-4 font-bold text-slate-500 text-sm">Day</th>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(p => (
                  <th key={p} className="py-3 px-2 text-center font-bold text-slate-500 text-sm">P{p}</th>
                ))}
                <th className="py-3 px-4 text-center font-bold text-slate-500 text-sm">Daily Status</th>
              </tr>
            </thead>
            <tbody>
              {hasAttendanceRecords ? (
                gridDates.map(dateObj => {
                  const dateStr = getTodayDateString(dateObj);
                  const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'long' });
                  const periods = periodData[dateStr] || {};
                  const dayStatus = getDayAttendanceStatus(periods);
                  const markedTeachingCount = TEACHING_PERIODS.filter(
                    p => periods[p] !== undefined || periods[String(p)] !== undefined
                  ).length;

                  let statusBadge = (
                    <span className="text-slate-300 font-bold text-base">—</span>
                  );

                  if (dayStatus === 'Present') {
                    statusBadge = (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-xs">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                        Present
                      </span>
                    );
                  } else if (dayStatus === 'Absent') {
                    statusBadge = (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200 shadow-xs">
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                        Absent
                      </span>
                    );
                  } else if (dayStatus === 'Pending' || dayStatus === 'Incomplete') {
                    statusBadge = (
                      <span
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200 shadow-xs"
                        title={`${markedTeachingCount} of ${TEACHING_PERIODS.length} teaching periods marked`}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                        Pending ({markedTeachingCount}/{TEACHING_PERIODS.length} marked)
                      </span>
                    );
                  }

                  return (
                    <tr key={dateStr} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors group">
                      <td className="py-4 px-4 font-bold text-slate-700 group-hover:text-theme-primary transition-colors">
                        <div className="flex flex-col">
                          <span>{dayName}</span>
                          <span className="text-xs font-normal text-slate-400">{dateStr}</span>
                        </div>
                      </td>
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(p => {
                        if (p === 5) {
                          return (
                            <td key={p} className="py-4 px-2 text-center text-slate-400 font-bold text-[10px] tracking-wider uppercase">
                              Break
                            </td>
                          );
                        }

                        const status = periods[p] !== undefined ? periods[p] : periods[String(p)];
                        let icon = <span className="text-slate-300 font-bold">—</span>;
                        if (status === 'Present') icon = <span className="text-emerald-500 font-bold">✓</span>;
                        if (status === 'Absent') icon = <span className="text-rose-500 font-bold">✗</span>;

                        return <td key={p} className="py-4 px-2 text-center text-lg">{icon}</td>;
                      })}
                      <td className="py-4 px-4 text-center whitespace-nowrap">
                        {statusBadge}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-slate-400 font-medium">
                    Attendance records are not available yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function AnalysisCard({ title, percentage, attended, total, pendingDays = 0, isMain }) {
  const [isHovered, setIsHovered] = useState(false);
  const hasCompleted = total > 0;
  const hasPending = pendingDays > 0;

  let colorClass = 'text-slate-400';
  if (hasCompleted) {
    colorClass = percentage >= 75 ? 'text-emerald-500' : 'text-rose-500';
  } else if (hasPending) {
    colorClass = 'text-amber-500';
  }

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`bg-white rounded-[20px] border shadow-[0_2px_20px_rgba(0,0,0,0.02)] p-5 transition-all duration-300 hover:shadow-md hover:-translate-y-0.5 ${isMain ? 'border-theme-primary/30 ring-1 ring-theme-primary/10 cursor-default' : 'border-slate-100'}`}
    >
      <div className="flex items-center justify-between gap-2 mb-3">
        <h3 className="text-slate-500 font-bold text-xs uppercase tracking-wider">{title}</h3>
        {hasPending && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
            {pendingDays} pending
          </span>
        )}
      </div>

      <div className="relative min-h-[40px] flex flex-col justify-end">
        {!hasCompleted && !hasPending ? (
          <span className="text-2xl font-bold text-slate-400">
            No records
          </span>
        ) : isMain ? (
          <>
            <div className="flex items-baseline gap-2">
              <span className={`text-3xl font-extrabold ${colorClass} transition-opacity duration-300 ${isHovered && hasCompleted ? 'opacity-0' : 'opacity-100'}`}>
                {hasCompleted ? `${percentage}%` : '0%'}
              </span>
              <span className="text-xs font-semibold text-slate-500">
                {attended} / {total} completed days
              </span>
            </div>
            {isHovered && hasCompleted && (
              <span className={`absolute bottom-0 left-0 text-3xl font-extrabold ${colorClass} transition-opacity duration-300`}>
                {attended} / {total}
              </span>
            )}
          </>
        ) : (
          <div className="flex items-baseline gap-2">
            <span className={`text-3xl font-extrabold ${colorClass}`}>
              {attended} / {total}
            </span>
            <span className="text-xs font-semibold text-slate-400">
              completed days
            </span>
          </div>
        )}
      </div>

      <div className="w-full bg-slate-100 h-1.5 rounded-full mt-4 overflow-hidden">
        {hasCompleted ? (
          <div
            className={`h-full rounded-full transition-all duration-1000 ${percentage >= 75 ? 'bg-emerald-500' : 'bg-rose-500'}`}
            style={{ width: `${percentage}%` }}
          />
        ) : hasPending ? (
          <div
            className="h-full rounded-full bg-amber-400/60 transition-all duration-1000"
            style={{ width: '100%' }}
            title="Scheduled day pending completion"
          />
        ) : (
          <div className="w-full h-full" />
        )}
      </div>

      <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400 font-medium">
        <span>Completed: {attended}/{total}</span>
        {hasPending ? (
          <span className="text-amber-600 font-semibold">{pendingDays} day in progress</span>
        ) : (
          <span>{hasCompleted ? `${percentage}% achieved` : 'No days held'}</span>
        )}
      </div>
    </div>
  );
}