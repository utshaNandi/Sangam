import React, { useState } from 'react';

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

export const periodsTime = [
  { num: 1, time: '9:30 AM - 10:15 AM' },
  { num: 2, time: '10:15 AM - 11:00 AM' },
  { num: 3, time: '11:00 AM - 11:45 AM' },
  { num: 4, time: '11:45 AM - 12:30 PM' },
  { num: 5, time: '12:30 PM - 1:15 PM' },
  { num: 6, time: '1:15 PM - 2:00 PM' },
  { num: 7, time: '2:00 PM - 2:45 PM' },
  { num: 8, time: '2:45 PM - 3:30 PM' },
  { num: 9, time: '3:30 PM - 4:15 PM' }
];

export const scheduleData = {
  0: [
    { subject: 'DSA', teacher: 'UDG' },
    { subject: 'OS', teacher: 'RKS' },
    { subject: 'DBMS', teacher: 'SK' },
    { subject: 'CN', teacher: 'MK' },
    { subject: 'LUNCH', teacher: '' },
    { subject: 'LAB', teacher: 'UDG' },
    { subject: 'LAB', teacher: 'UDG' },
    { subject: 'MATH', teacher: 'AK' },
    { subject: 'AI', teacher: 'PJ' },
  ],
  1: [
    { subject: 'OS', teacher: 'RKS' },
    { subject: 'DSA', teacher: 'UDG' },
    { subject: 'MATH', teacher: 'AK' },
    { subject: 'CN', teacher: 'MK' },
    { subject: 'LUNCH', teacher: '' },
    { subject: 'LAB', teacher: 'SK' },
    { subject: 'LAB', teacher: 'SK' },
    { subject: 'DBMS', teacher: 'SK' },
    { subject: 'AI', teacher: 'PJ' },
  ],
    2: [
      { subject: 'MATH', teacher: 'AK' },
      { subject: 'CN', teacher: 'MK' },
      { subject: 'OS', teacher: 'RKS' },
      { subject: 'DSA', teacher: 'UDG' },
      { subject: 'LUNCH', teacher: '' },
      { subject: 'ENG', teacher: 'PRT' },
      { subject: 'LAB', teacher: 'MK' },
      { subject: 'LAB', teacher: 'MK' },
      { subject: 'LIBRARY', teacher: '' },
    ],
    3: [
      { subject: 'CN', teacher: 'MK' },
      { subject: 'DBMS', teacher: 'SK' },
      { subject: 'MATH', teacher: 'AK' },
      { subject: 'OS', teacher: 'RKS' },
      { subject: 'LUNCH', teacher: '' },
      { subject: 'ENG', teacher: 'PRT' },
      { subject: 'LAB', teacher: 'SK' },
      { subject: 'LAB', teacher: 'SK' },
      { subject: 'SPORTS', teacher: '' },
    ],
    4: [
      { subject: 'DBMS', teacher: 'SK' },
      { subject: 'MATH', teacher: 'AK' },
      { subject: 'CN', teacher: 'MK' },
      { subject: 'DSA', teacher: 'UDG' },
      { subject: 'LUNCH', teacher: '' },
      { subject: 'ENG', teacher: 'PRT' },
      { subject: 'LAB', teacher: 'UDG' },
      { subject: 'LAB', teacher: 'UDG' },
      { subject: 'LIBRARY', teacher: '' },
    ],
    5: [
      { subject: 'ENG', teacher: 'PRT' },
      { subject: 'DBMS', teacher: 'SK' },
      { subject: 'DSA', teacher: 'UDG' },
      { subject: 'MATH', teacher: 'AK' },
      { subject: 'LUNCH', teacher: '' },
      { subject: 'OS', teacher: 'RKS' },
      { subject: 'SPORTS', teacher: '' },
      { subject: 'LIBRARY', teacher: '' },
      { subject: 'LIBRARY', teacher: '' },
    ]
  };

export default function StudentSchedule() {
  const getInitialDay = () => {
    const day = new Date().getDay();
    if (day === 0) return 0;
    return day - 1;
  };

  const [selectedDayIndex, setSelectedDayIndex] = useState(getInitialDay());

  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  const handlePrev = () => {
    setSelectedDayIndex(prev => (prev > 0 ? prev - 1 : 0));
  };

  const handleNext = () => {
    setSelectedDayIndex(prev => (prev < 5 ? prev + 1 : 5));
  };

  const currentSchedule = scheduleData[selectedDayIndex];
  const currentDayName = days[selectedDayIndex];

  return (
    <div className="bg-white rounded-[32px] border border-slate-100 shadow-[0_4px_30px_rgba(0,0,0,0.03)] p-8 lg:p-10 max-w-6xl mx-auto animate-fade-in">
      
      {/* Header */}
      <div className="mb-8 pl-4 lg:pl-16">
        <h2 className="text-[32px] font-extrabold text-slate-900 tracking-tight flex items-center gap-3">
          Class Schedule
          <span className="text-theme-primary/40 font-normal">—</span>
          <span className="text-theme-primary">{currentDayName}</span>
        </h2>
        <p className="text-sm font-medium text-slate-500 mt-2">
          B.Tech CSE (AI) • 2nd Year • Sec C
        </p>
      </div>

      {/* Grid Area with Nav */}
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
        >
          <ChevronLeft />
        </button>

        {/* 3x3 Grid */}
        <div className="flex-1 w-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {currentSchedule.map((period, i) => {
            const timeInfo = periodsTime[i];
            const isLunch = period.subject === 'LUNCH';
            const isLab = period.subject === 'LAB';

            return (
              <div 
                key={i} 
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
                    Period {timeInfo.num}
                  </span>
                  <span className="text-[11px] font-semibold text-slate-400">
                    {timeInfo.time}
                  </span>
                </div>

                {/* Card Center: Subject & Teacher */}
                <div className="flex-1 flex flex-col items-center justify-center min-h-[60px]">
                  {isLunch ? (
                    <span className="text-xl font-extrabold text-slate-300 tracking-wider">
                      LUNCH
                    </span>
                  ) : (
                    <>
                      <span className={`text-[22px] font-extrabold mb-1 ${isLab ? 'text-theme-primary' : 'text-slate-800'}`}>
                        {period.subject}
                      </span>
                      {period.teacher && (
                        <span className={`text-[13px] font-bold ${isLab ? 'text-theme-primary/60' : 'text-slate-400'}`}>
                          {period.teacher}
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
    </div>
  );
}
