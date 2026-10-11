import React, { useState, useEffect } from 'react';
import { Icons } from '../Teacher/Icons';
import { students, globalPeriodAttendance, calculateSemesterAttendance } from '../Teacher/mockData';

export default function StudentAttendance() {
  const student = students.find(s => s.section === 'CSE-C') || { attendance: 60 };
  const studentId = student.id;
  
  // Real-time access to the period attendance store
  // (In a real app, this would be a React Context or Redux store hook to trigger re-renders, 
  // but for this mock, since Teacher and Student views unmount/mount, reading on mount is sufficient,
  // or we can force update if we were sharing the same screen, which we are not.)
  const periodData = globalPeriodAttendance[studentId] || {};
  
  const today = new Date();
  today.setHours(0,0,0,0);
  
  const dayOfWeek = today.getDay();
  const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const thisMonday = new Date(today);
  thisMonday.setDate(today.getDate() - daysSinceMonday);
  
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

  let weekDaysHeld = 0;
  let weekDaysAttended = 0;
  let monthDaysHeld = 0;
  let monthDaysAttended = 0;
  

  Object.keys(periodData).forEach(dateStr => {
    const dateObj = new Date(dateStr);
    dateObj.setHours(0,0,0,0);
    
    if (dateObj.getDay() === 0 || dateObj.getDay() === 6) return;
    
    const periods = periodData[dateStr];
      let hasAbsent = false;
      let hasRecorded = false;
  
      [1,2,3,4,6,7,8,9].forEach(p => {
      const status = periods[p];
        if (status === 'Absent') {
          hasAbsent = true;
          hasRecorded = true;
        } else if (status === 'Present') {
          hasRecorded = true;
        }
    });

    if (hasRecorded) {
      
      if (dateObj >= monthStart) {
        monthDaysHeld++;
        if (!hasAbsent) monthDaysAttended++;
      }
      
      if (dateObj >= thisMonday) {
        weekDaysHeld++;
        if (!hasAbsent) weekDaysAttended++;
      }
    }
  });

  // Calculate percentages
  const { percentage: semesterPercentage, attended: semesterClassesAttended, total: semesterClassesHeld } = calculateSemesterAttendance(studentId);
    
  const weekPercent = weekDaysHeld > 0 ? Math.round((weekDaysAttended / weekDaysHeld) * 100) : 0;
  const monthPercent = monthDaysHeld > 0 ? Math.round((monthDaysAttended / monthDaysHeld) * 100) : 0;

  const isBelowThreshold = semesterClassesHeld > 0 && semesterPercentage < 75;
  
  let analysisText = "Not enough data to provide an attendance analysis.";
  if (semesterClassesHeld > 0) {
    if (semesterPercentage >= 85) {
      analysisText = "Your attendance is currently on track and comfortably above the required target.";
    } else if (semesterPercentage >= 75) {
      analysisText = "Your attendance meets the requirement but should be maintained carefully.";
    } else {
      analysisText = "";
    }
  }
  const [showWarning, setShowWarning] = useState(isBelowThreshold);

  useEffect(() => {
    if (isBelowThreshold) {
      setShowWarning(true);
      const timer = setTimeout(() => {
        setShowWarning(false);
      }, 15000);
      return () => clearTimeout(timer);
    }
  }, [isBelowThreshold]);

  const [selectedWeek, setSelectedWeek] = useState('current');

  const getWeekDaysDates = (isCurrent) => {
    const dates = [];
    const start = new Date(thisMonday);
    if (!isCurrent) start.setDate(start.getDate() - 7);
    
    for (let i = 0; i < 5; i++) {
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
          />
        <AnalysisCard 
          title="This Month" 
          percentage={monthPercent} 
          attended={monthDaysAttended} 
          total={monthDaysHeld} 
        />
        <AnalysisCard 
            title="This Semester (Till Now)" 
            percentage={semesterPercentage} 
            attended={semesterClassesAttended} 
            total={semesterClassesHeld} 
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
                {[1,2,3,4,5,6,7,8,9].map(p => (
                  <th key={p} className="py-3 px-2 text-center font-bold text-slate-500 text-sm">P{p}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {gridDates.map(dateObj => {
                const dateStr = dateObj.toISOString().split('T')[0];
                const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'long' });
                const periods = periodData[dateStr] || {};
                
                return (
                  <tr key={dateStr} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors group">
                    <td className="py-4 px-4 font-bold text-slate-700 group-hover:text-theme-primary transition-colors">{dayName}</td>
                    {[1,2,3,4,5,6,7,8,9].map(p => {
                      if (p === 5) {
                        return <td key={p} className="py-4 px-2 text-center text-slate-400 font-bold text-[10px] tracking-wider uppercase">Break</td>;
                      }
                      
                      const status = periods[p];
                      let icon = <span className="text-slate-300 font-bold">—</span>;
                      if (status === 'Present') icon = <span className="text-emerald-500 font-bold">✓</span>;
                      if (status === 'Absent') icon = <span className="text-rose-500 font-bold">✗</span>;
                      
                      return <td key={p} className="py-4 px-2 text-center text-lg">{icon}</td>;
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function AnalysisCard({ title, percentage, attended, total, isMain }) {
  const [isHovered, setIsHovered] = useState(false);
  const hasData = total > 0;
  
  const colorClass = !hasData ? 'text-slate-400' : (percentage >= 75 ? 'text-emerald-500' : 'text-rose-500');

  return (
    <div 
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`bg-white rounded-[20px] border shadow-[0_2px_20px_rgba(0,0,0,0.02)] p-5 transition-all duration-300 hover:shadow-md hover:-translate-y-0.5 ${isMain ? 'border-theme-primary/30 ring-1 ring-theme-primary/10 cursor-default' : 'border-slate-100'}`}
    >
      <h3 className="text-slate-500 font-bold text-xs uppercase tracking-wider mb-3">{title}</h3>
      <div className="relative h-[36px] flex items-end">
        {!hasData ? (
          <span className={`absolute bottom-0 left-0 text-2xl font-bold ${colorClass}`}>
            No data
          </span>
        ) : isMain ? (
          <>
            <span className={`absolute bottom-0 left-0 text-3xl font-extrabold ${colorClass} transition-opacity duration-300 ${isHovered ? 'opacity-100' : 'opacity-0'}`}>
              {percentage}%
            </span>
            <span className={`absolute bottom-0 left-0 text-3xl font-extrabold ${colorClass} transition-opacity duration-300 ${isHovered ? 'opacity-0' : 'opacity-100'}`}>
              {attended} / {total}
            </span>
          </>
        ) : (
          <span className={`absolute bottom-0 left-0 text-3xl font-extrabold ${colorClass}`}>
            {attended} / {total}
          </span>
        )}
      </div>
      {!hasData ? (
        <div className="w-full h-1.5 mt-4"></div>
      ) : (
        <div className="w-full bg-slate-100 h-1.5 rounded-full mt-4 overflow-hidden">
          <div 
            className={`h-full rounded-full transition-all duration-1000 ${percentage >= 75 ? 'bg-emerald-500' : 'bg-rose-500'}`}
            style={{ width: `${percentage}%` }}
          />
        </div>
      )}
    </div>
  );
}