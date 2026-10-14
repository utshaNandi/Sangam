import React, { useState, useEffect } from 'react';
import { subscribeClassTimetable, DEFAULT_PERIOD_TIMINGS, VALID_DAYS } from '../../services/timetableService.js';

const ChevronLeft = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 18 9 12 15 6" />
  </svg>
);

const ChevronRight = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

export const periodsTime = DEFAULT_PERIOD_TIMINGS.map(p => ({
  num: p.period,
  time: `${p.startTime} - ${p.endTime}`
}));

// Fallback legacy export preserved for backward compatibility
export const scheduleData = {
  0: [],
  1: [],
  2: [],
  3: [],
  4: [],
  5: []
};

export default function StudentSchedule({ userProfile }) {
  const isSundayToday = new Date().getDay() === 0;

  const getInitialDay = () => {
    const day = new Date().getDay();
    if (day === 0) return 0; // Sunday -> defaults index 0 (Monday) with clear banner
    return day - 1;
  };

  const [selectedDayIndex, setSelectedDayIndex] = useState(getInitialDay());
  const [slots, setSlots] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const days = VALID_DAYS; // ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

  const institution = userProfile?.institution || 'UEMK';
  const department = userProfile?.department;
  const year = userProfile?.year;
  const section = userProfile?.section;

  useEffect(() => {
    if (!department || !year || !section) {
      setSlots([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    const unsubscribe = subscribeClassTimetable(
      { institution, department, year, section },
      (classSlots) => {
        setSlots(classSlots);
        setIsLoading(false);
        setError(null);
      },
      (err) => {
        console.error('Error subscribing to student timetable:', err);
        setError(err.message || 'Unable to load class schedule.');
        setIsLoading(false);
      }
    );

    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [institution, department, year, section]);

  const handlePrev = () => {
    setSelectedDayIndex(prev => (prev > 0 ? prev - 1 : 0));
  };

  const handleNext = () => {
    setSelectedDayIndex(prev => (prev < 5 ? prev + 1 : 5));
  };

  const currentDayName = days[selectedDayIndex];
  const daySlots = slots.filter(s => s.day === currentDayName);

  // Map slots into periods 1 to 9
  const periodMap = {};
  daySlots.forEach(s => {
    periodMap[Number(s.period)] = s;
  });

  const placementSubtitle = [department, year, section].filter(Boolean).join(' • ') || 'Academic Placement Pending';

  return (
    <div className="bg-white rounded-[32px] border border-slate-100 shadow-[0_4px_30px_rgba(0,0,0,0.03)] p-8 lg:p-10 max-w-6xl mx-auto animate-fade-in space-y-8">

      {/* Header */}
      <div className="pl-4 lg:pl-16">
        <h2 className="text-[32px] font-extrabold text-slate-900 tracking-tight flex items-center gap-3">
          Class Schedule
          <span className="text-theme-primary/40 font-normal">—</span>
          <span className="text-theme-primary">{currentDayName}</span>
        </h2>
        <p className="text-sm font-medium text-slate-500 mt-2">
          {placementSubtitle}
        </p>

        {/* Clear Sunday Banner */}
        {isSundayToday && (
          <div className="mt-4 p-4 rounded-2xl bg-amber-50 border border-amber-200/80 text-amber-900 text-sm font-semibold flex items-center gap-3 animate-fade-in">
            <span className="w-8 h-8 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center font-bold text-base shrink-0">
              📅
            </span>
            <div>
              <p className="font-extrabold">Sunday — No classes scheduled today</p>
              <p className="text-xs text-amber-700 font-medium mt-0.5">
                Campus is closed for the weekend. Showing upcoming {currentDayName} schedule.
              </p>
            </div>
          </div>
        )}

        {/* Error Notification */}
        {error && (
          <div className="mt-4 p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-sm font-medium flex items-center justify-between shadow-sm animate-fade-in">
            <span>{error}</span>
            <button
              onClick={() => window.location.reload()}
              className="text-xs font-bold underline hover:no-underline text-rose-900 ml-4"
            >
              Retry
            </button>
          </div>
        )}
      </div>

      {/* Unassigned Student Notice */}
      {(!department || !year || !section) && !isLoading && (
        <div className="py-16 text-center border border-dashed border-slate-200 rounded-3xl bg-slate-50/50 max-w-xl mx-auto p-8">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto mb-3 font-bold text-xl">
            ⚠️
          </div>
          <h3 className="text-lg font-bold text-slate-800">Academic Placement Pending</h3>
          <p className="text-sm text-slate-500 mt-1.5 max-w-md mx-auto">
            Your department, academic year, or section is currently unassigned. Please contact your Department Director to activate your academic placement.
          </p>
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="py-24 text-center space-y-3">
          <div className="w-8 h-8 border-3 border-theme-primary border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-sm font-medium text-slate-500">Loading your schedule from Cloud Firestore...</p>
        </div>
      )}

      {/* Grid Area with Nav */}
      {!isLoading && department && year && section && (
        <div className="flex flex-col lg:flex-row items-center gap-6">

          {/* Prev Button */}
          <button
            onClick={handlePrev}
            disabled={selectedDayIndex === 0}
            className={`w-12 h-12 rounded-full hidden lg:flex items-center justify-center flex-shrink-0 transition-all ${
              selectedDayIndex === 0
                ? 'bg-slate-50 text-slate-300 cursor-not-allowed'
                : 'bg-white text-slate-600 shadow-[0_2px_15px_rgba(0,0,0,0.06)] border border-slate-100 hover:scale-105 active:scale-95 hover:text-theme-primary'
            }`}
            title="Previous Day"
          >
            <ChevronLeft />
          </button>

          {/* 3x3 Grid */}
          <div className="flex-1 w-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {periodsTime.map((timeInfo, i) => {
              const periodNumber = i + 1;
              const slot = periodMap[periodNumber];
              const isLunch = slot && (slot.type === 'Break' || slot.subject?.toUpperCase() === 'LUNCH' || slot.subject?.toUpperCase() === 'LUNCH BREAK');
              const isLab = slot && slot.type === 'Lab';

              if (!slot) {
                // Free / Unscheduled period
                return (
                  <div
                    key={periodNumber}
                    className="relative flex flex-col p-6 rounded-[24px] border border-dashed border-slate-200 bg-slate-50/30 transition-all duration-300"
                  >
                    <div className="flex items-center justify-between mb-6">
                      <span className="text-[11px] font-bold px-3 py-1.5 rounded-lg tracking-wide bg-slate-100 text-slate-400">
                        Period {periodNumber}
                      </span>
                      <span className="text-[11px] font-semibold text-slate-400">
                        {timeInfo.time}
                      </span>
                    </div>

                    <div className="flex-1 flex flex-col items-center justify-center min-h-[60px]">
                      <span className="text-sm font-bold text-slate-400 tracking-wide">
                        Free Period
                      </span>
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={periodNumber}
                  className={`relative flex flex-col p-6 rounded-[24px] border transition-all duration-300 hover:shadow-lg hover:-translate-y-1 ${
                    isLunch
                      ? 'bg-slate-50/60 border-transparent shadow-none hover:shadow-none hover:translate-y-0'
                      : isLab
                      ? 'bg-theme-bg/30 border-theme-primary/20 shadow-[0_2px_15px_rgba(0,0,0,0.02)]'
                      : 'bg-white border-slate-100 shadow-[0_2px_15px_rgba(0,0,0,0.02)]'
                  }`}
                >
                  {/* Card Top: Period & Time */}
                  <div className="flex items-center justify-between mb-6">
                    <span className={`text-[11px] font-bold px-3 py-1.5 rounded-lg tracking-wide ${isLab ? 'bg-theme-primary/10 text-theme-primary' : 'bg-slate-100 text-slate-600'}`}>
                      Period {periodNumber}
                    </span>
                    <span className="text-[11px] font-semibold text-slate-400">
                      {slot.startTime && slot.endTime ? `${slot.startTime} - ${slot.endTime}` : timeInfo.time}
                    </span>
                  </div>

                  {/* Card Center: Subject & Teacher */}
                  <div className="flex-1 flex flex-col items-center justify-center min-h-[60px] text-center">
                    {isLunch ? (
                      <span className="text-xl font-extrabold text-slate-300 tracking-wider">
                        {slot.subject || 'LUNCH'}
                      </span>
                    ) : (
                      <>
                        <span className={`text-[20px] font-extrabold mb-1 leading-snug ${isLab ? 'text-theme-primary' : 'text-slate-800'}`}>
                          {slot.subject}
                        </span>
                        {slot.teacherName && (
                          <span className={`text-[13px] font-bold mt-0.5 ${isLab ? 'text-theme-primary/70' : 'text-slate-400'}`}>
                            {slot.teacherName}
                          </span>
                        )}
                        {slot.room && (
                          <span className="text-[11px] font-medium text-slate-400 mt-1">
                            {slot.room}
                          </span>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Next Button */}
          <button
            onClick={handleNext}
            disabled={selectedDayIndex === 5}
            className={`w-12 h-12 rounded-full hidden lg:flex items-center justify-center flex-shrink-0 transition-all ${
              selectedDayIndex === 5
                ? 'bg-slate-50 text-slate-300 cursor-not-allowed'
                : 'bg-white text-slate-600 shadow-[0_2px_15px_rgba(0,0,0,0.06)] border border-slate-100 hover:scale-105 active:scale-95 hover:text-theme-primary'
            }`}
            title="Next Day"
          >
            <ChevronRight />
          </button>

          {/* Mobile Navigation (Visible only on small screens) */}
          <div className="flex items-center justify-center gap-8 mt-6 lg:hidden w-full">
            <button
              onClick={handlePrev}
              disabled={selectedDayIndex === 0}
              className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${
                selectedDayIndex === 0
                  ? 'bg-slate-50 text-slate-300 cursor-not-allowed'
                  : 'bg-white text-slate-600 shadow-[0_2px_15px_rgba(0,0,0,0.06)] border border-slate-100 active:scale-95'
              }`}
            >
              <ChevronLeft />
            </button>
            <button
              onClick={handleNext}
              disabled={selectedDayIndex === 5}
              className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${
                selectedDayIndex === 5
                  ? 'bg-slate-50 text-slate-300 cursor-not-allowed'
                  : 'bg-white text-slate-600 shadow-[0_2px_15px_rgba(0,0,0,0.06)] border border-slate-100 active:scale-95'
              }`}
            >
              <ChevronRight />
            </button>
          </div>

        </div>
      )}
    </div>
  );
}
