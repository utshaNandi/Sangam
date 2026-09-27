import React, { useState } from 'react';
import { Icons } from '../Teacher/Icons';

export default function AcademicSpace() {
  const [activeTab, setActiveTab] = useState('official');

  return (
    <div className="space-y-6">
      
      {/* Header Area */}
      <div className="bg-white rounded-[24px] border border-slate-200/60 shadow-sm p-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none">
          <Icons.Hierarchy />
        </div>
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-2">
            <span className="px-3 py-1 bg-theme-bg text-theme-primary text-xs font-bold uppercase tracking-widest rounded-lg">
              Section Hub
            </span>
          </div>
          <h2 className="text-[32px] md:text-[40px] font-bold text-slate-900 tracking-tight mb-2">
            Sec C
          </h2>
          <p className="text-lg text-slate-600 max-w-2xl">
            B.Tech CSE (AI) • 2nd Year
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 border-b border-slate-200">
        <button
          onClick={() => setActiveTab('official')}
          className={`pb-4 px-2 text-sm font-bold transition-all relative ${
            activeTab === 'official' ? 'text-theme-primary' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Official Groups
          {activeTab === 'official' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-theme-primary rounded-t-full" />
          )}
        </button>
        <button
          onClick={() => setActiveTab('unofficial')}
          className={`pb-4 px-2 text-sm font-bold transition-all relative ${
            activeTab === 'unofficial' ? 'text-theme-primary' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Unofficial Groups
          {activeTab === 'unofficial' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-theme-primary rounded-t-full" />
          )}
        </button>
      </div>

      {/* Content Area */}
      <div className="bg-white rounded-[24px] border border-slate-100 shadow-[0_2px_20px_rgba(0,0,0,0.02)] p-6 min-h-[400px]">
        {activeTab === 'official' ? (
          <div className="space-y-4 animate-hero-fade-up" style={{ animationDuration: '300ms' }}>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-slate-900">Official Communication</h3>
            </div>
            <p className="text-sm text-slate-500 mb-6 max-w-3xl">
              Teachers and faculty post announcements here. Important academic notices, schedules, examination updates, and assignments will appear in these channels.
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                { name: 'Announcements (Sec C)', unread: 2, desc: 'General section notices' },
                { name: 'Data Structures Lab', unread: 0, desc: 'Prof. Sharma' },
                { name: 'Operating Systems', unread: 1, desc: 'Prof. Gupta' },
                { name: 'Examination Updates', unread: 0, desc: 'Controller of Examinations' },
              ].map((group, i) => (
                <div key={i} className="flex items-center p-4 rounded-xl border border-slate-100 hover:border-theme-primary/30 hover:bg-slate-50 transition-colors cursor-pointer group">
                  <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center mr-4 group-hover:bg-white group-hover:text-theme-primary transition-colors">
                    <Icons.Announcements />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-bold text-slate-900">{group.name}</h4>
                    <p className="text-xs text-slate-500 font-medium mt-0.5">{group.desc}</p>
                  </div>
                  {group.unread > 0 && (
                    <span className="w-6 h-6 rounded-full bg-rose-500 text-white text-xs font-bold flex items-center justify-center">
                      {group.unread}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4 animate-hero-fade-up" style={{ animationDuration: '300ms' }}>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-slate-900">Student Community</h3>
            </div>
            <p className="text-sm text-slate-500 mb-6 max-w-3xl">
              Casual discussions, student interactions, and peer-to-peer communication. Faculty do not monitor these groups.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                { name: 'Sec C Chit-chat', active: '12 online', desc: 'General discussion' },
                { name: 'Project Group 4', active: '3 online', desc: 'OS Assignment' },
                { name: 'Tech Fest Planning', active: '24 online', desc: 'Cultural & Tech events' },
                { name: 'Doubt Resolution', active: '5 online', desc: 'Peer learning' },
              ].map((group, i) => (
                <div key={i} className="flex items-center p-4 rounded-xl border border-slate-100 hover:border-emerald-500/30 hover:bg-slate-50 transition-colors cursor-pointer group">
                  <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center mr-4 group-hover:bg-white group-hover:text-emerald-500 transition-colors">
                    <Icons.Students />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-bold text-slate-900">{group.name}</h4>
                    <p className="text-xs text-slate-500 font-medium mt-0.5">{group.desc}</p>
                  </div>
                  <span className="text-xs font-bold text-emerald-500 bg-emerald-50 px-2 py-1 rounded-md">
                    {group.active}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
