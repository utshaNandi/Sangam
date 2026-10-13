import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { scheduleData } from './StudentSchedule';

export default function StudentProfile({ userProfile, student, onClose }) {
  const profile = userProfile || student || {};
  const [showSubjects, setShowSubjects] = useState(false);

  const getSemesterSubjects = () => {
    const subjects = new Set();
    Object.values(scheduleData).forEach(day => {
      day.forEach(period => {
        if (period.subject && !['LUNCH', 'BREAK', 'LIBRARY', 'SPORTS', 'LAB'].includes(period.subject)) {
          subjects.add(period.subject);
        }
      });
    });
    return Array.from(subjects);
  };
  const currentSubjects = getSemesterSubjects();

  const studentName = (profile?.name && profile.name.trim())
    || (profile?.email ? profile.email.split('@')[0] : '')
    || 'Student';
  const nameParts = studentName.trim().split(/\s+/);
  const firstName = nameParts[0] || 'Student';
  const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : '';
  const initials = `${firstName.charAt(0)}${lastName ? lastName.charAt(0) : ''}`.toUpperCase() || 'S';

  const email = profile?.email || 'Unassigned';
  const department = profile?.department || 'Unassigned';
  const year = profile?.year || 'Unassigned';
  const section = profile?.section || 'Unassigned';
  const institution = profile?.institution || 'Unassigned';

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      ></div>

      {/* Modal Container */}
      <div className="relative z-10 flex flex-col md:flex-row items-stretch justify-center gap-4 animate-scale-in">

        {/* Left Card: Profile Details */}
        <div className="w-full md:w-[420px] bg-white rounded-[32px] p-6 shadow-2xl relative">

          {/* Close Button */}
          <button
            onClick={onClose}
            className="absolute top-6 right-6 w-8 h-8 flex items-center justify-center bg-slate-50 text-slate-400 hover:bg-slate-100 hover:text-slate-700 rounded-full transition-colors active:scale-95"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>

          {/* Avatar */}
          <div className="flex flex-col items-center mt-6 mb-8">
            <div className="w-24 h-24 rounded-full bg-[#df8e35] text-white flex items-center justify-center text-3xl font-black shadow-lg ring-[6px] ring-white outline outline-[6px] outline-[#9fc1fb] mb-6 relative">
              {initials}
            </div>
            <h2 className="text-[26px] font-black text-[#1a2332] tracking-tight text-center">{studentName}</h2>
            <p className="text-[13px] font-semibold text-slate-400 mt-1">{email}</p>
          </div>

          {/* Details Box */}
          <div className="bg-[#f8f9fb] rounded-[24px] p-6 mb-4 space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-[13px] font-bold text-slate-500">Enrollment No.</span>
              <span className="text-[13px] font-black text-[#1a2332]">Pending Office Issuance</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[13px] font-bold text-slate-500">Registration No.</span>
              <span className="text-[13px] font-black text-[#1a2332]">Pending Office Issuance</span>
            </div>
            <div className="flex justify-between items-center mt-2 pt-4 border-t border-slate-200/60">
              <span className="text-[13px] font-bold text-slate-500">Institution</span>
              <span className="text-[13px] font-black text-[#1a2332] text-right truncate max-w-[200px]" title={institution}>{institution}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[13px] font-bold text-slate-500">Department</span>
              <span className="text-[13px] font-black text-[#1a2332] text-right truncate max-w-[200px]" title={department}>{department}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[13px] font-bold text-slate-500">Year</span>
              <span className="text-[13px] font-black text-[#1a2332]">{year}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[13px] font-bold text-slate-500">Section</span>
              <span className="text-[13px] font-black text-[#1a2332]">{section}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[13px] font-bold text-slate-500">Email</span>
              <span className="text-[13px] font-black text-[#1a2332] text-right truncate max-w-[200px]" title={email}>{email}</span>
            </div>
          </div>

          {/* Current Subjects Toggle */}
          <div className="bg-[#f8f9fb] rounded-[20px] p-5 flex justify-between items-center">
            <span className="text-[14px] font-bold text-slate-600">Current Subjects</span>
            <button
              onClick={() => setShowSubjects(!showSubjects)}
              className="text-[14px] font-extrabold text-[#df8e35] hover:opacity-80 transition-opacity flex items-center gap-1"
            >
              {showSubjects ? 'Hide' : 'View'} &rarr;
            </button>
          </div>
        </div>

        {/* Right Card: Subjects (Conditionally Rendered) */}
        {showSubjects && (
          <div className="w-full md:w-[380px] bg-white rounded-[32px] p-8 shadow-2xl animate-fade-in h-max max-h-full overflow-y-auto">
            <div className="flex items-center gap-3 mb-6 pl-1">
              <div className="w-2 h-2 rounded-full bg-[#df8e35]"></div>
              <h3 className="text-lg font-black text-[#1a2332] tracking-tight">Current Semester Subjects</h3>
            </div>

            <div className="space-y-3">
              {currentSubjects.map((sub, index) => (
                <div key={index} className="bg-[#f8f9fb] rounded-[16px] p-4 flex items-center gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-slate-300"></div>
                  <span className="text-[14px] font-bold text-slate-700">{sub}</span>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>,
    document.body
  );
}
