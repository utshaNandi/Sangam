import React from 'react';
import { Icons } from '../Teacher/Icons';
import { announcements as sharedAnnouncements } from '../Teacher/mockData';

export default function AcademicSpace() {
  // Student's mock scope
  const studentScope = 'UEMK/CSE AI/2nd Year/Sec C';
  const myAnnouncements = sharedAnnouncements.filter(a => a.scopePath === studentScope);

  return (
    <div className="space-y-4 animate-fade-in relative z-10 pb-10">
      
      {/* Header Area */}
      <div className="bg-white rounded-[24px] border border-slate-200/60 shadow-sm p-6 sm:px-8 sm:py-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none">
          <Icons.Hierarchy />
        </div>
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-2">
              <span className="px-3 py-1 bg-theme-bg text-theme-primary text-xs font-bold uppercase tracking-widest rounded-lg">
                Section Hub
              </span>
            </div>
          <h2 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight mb-1">
                Sec C
              </h2>
          <p className="text-lg text-slate-600 max-w-2xl">
              B.Tech CSE (AI) • 2nd Year
            </p>
        </div>
      </div>

      {/* Content Area */}
      <div className="bg-white rounded-[24px] border border-slate-100 shadow-[0_2px_20px_rgba(0,0,0,0.02)] overflow-hidden">
        {/* Banner */}
        <div className="bg-slate-50/80 border-b border-slate-100 p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-5">
              <div className="w-14 h-14 rounded-2xl bg-theme-bg text-theme-primary flex items-center justify-center shadow-sm">
                <Icons.Announcements />
              </div>
              <div className="flex flex-col gap-1.5">
                <h3 className="text-lg font-bold text-slate-900 leading-none">Announcements</h3>
                <p className="text-sm font-medium text-slate-500 leading-none">Official updates from faculty</p>
              </div>
            </div>
        </div>

        <div className="p-6 sm:p-8 space-y-4">
          <div className="space-y-5">
              {myAnnouncements.map(ann => (
                <div key={ann.id} className="p-6 rounded-2xl border border-slate-100 hover:border-slate-200 hover:shadow-[0_4px_12px_rgba(0,0,0,0.02)] transition-all bg-white group flex flex-col gap-3">
                  <h4 className="font-bold text-slate-900 text-lg leading-tight">{ann.title}</h4>
                  <p className="text-slate-600 text-sm font-medium leading-relaxed whitespace-pre-line">{ann.content}</p>
                  <div className="flex items-center gap-2.5 text-xs font-bold text-slate-400 pt-1">
                    <span className="text-slate-600 bg-slate-50 px-2.5 py-1.5 rounded-md">{ann.author}</span>
                    <span className="text-slate-300">•</span>
                    <span>{ann.time || ann.date}</span>
                  </div>
                </div>
              ))}
            {myAnnouncements.length === 0 && (
              <div className="text-center py-10">
                <p className="text-slate-400 font-medium text-sm">No announcements yet.</p>
              </div>
            )}
          </div>
        </div>
      </div>

    </div>
  );
}
