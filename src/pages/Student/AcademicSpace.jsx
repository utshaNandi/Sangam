import React, { useState, useEffect } from 'react';
import { Icons } from '../Teacher/Icons';
import { fetchAnnouncements } from '../../services/announcementService.js';

export default function AcademicSpace({ userProfile }) {
  const department = userProfile?.department;
  const year = userProfile?.year;
  const section = userProfile?.section;

  // Derive placement display from actual profile fields
  const placementTitle = section || 'Academic Placement Pending';
  const placementParts = [department, year].filter(Boolean);
  const placementSubtitle = placementParts.length > 0
    ? placementParts.join(' • ')
    : (section ? 'Academic Placement' : 'Academic Placement Pending');

  const [announcements, setAnnouncements] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadAnnouncements = async () => {
    if (!userProfile?.uid) {
      setAnnouncements([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchAnnouncements({ page: 1, limit: 50 });
      setAnnouncements(Array.isArray(data?.announcements) ? data.announcements : []);
    } catch (err) {
      console.warn('[AcademicSpace] Failed to load announcements:', err.message);
      setError(err.message || 'Failed to load announcements.');
      setAnnouncements([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAnnouncements();
  }, [userProfile?.uid]);

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
            {placementTitle}
          </h2>
          <p className="text-lg text-slate-600 max-w-2xl">
            {placementSubtitle}
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
              <p className="text-sm font-medium text-slate-500 leading-none">Official updates from faculty & administration</p>
            </div>
          </div>
        </div>

        <div className="p-6 sm:p-8 space-y-4">
          {isLoading ? (
            <div className="text-center py-10">
              <p className="text-slate-400 font-medium text-sm">Loading announcements...</p>
            </div>
          ) : error ? (
            <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm font-medium flex items-center justify-between">
              <span>{error}</span>
              <button
                onClick={loadAnnouncements}
                className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-semibold hover:bg-red-700 transition-colors cursor-pointer"
              >
                Retry
              </button>
            </div>
          ) : announcements.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-slate-400 font-medium text-sm">No announcements yet.</p>
            </div>
          ) : (
            <div className="space-y-5">
              {announcements.map(ann => {
                const author = ann.authorName || ann.author || (ann.authorRole === 'director' ? 'Director' : 'Administration');
                const formattedDate = ann.createdAt
                  ? new Date(ann.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                  : (ann.time || ann.date || 'Recent');

                return (
                  <div key={ann.id} className="p-6 rounded-2xl border border-slate-100 hover:border-slate-200 hover:shadow-[0_4px_12px_rgba(0,0,0,0.02)] transition-all bg-white group flex flex-col gap-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-bold text-slate-900 text-lg leading-tight">{ann.title}</h4>
                        {ann.priority === 'urgent' && (
                          <span className="text-[10px] font-extrabold text-white bg-red-600 px-2 py-0.5 rounded-full uppercase tracking-wider">
                            Urgent
                          </span>
                        )}
                      </div>
                      {ann.scopeType && (
                        <span className="text-[11px] font-bold text-slate-500 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-lg uppercase tracking-wider whitespace-nowrap">
                          {ann.scopeType === 'institution'
                            ? 'Institution'
                            : ann.scopeType === 'branch'
                            ? 'Department'
                            : ann.scopeType === 'year'
                            ? 'Year'
                            : 'Section'}
                        </span>
                      )}
                    </div>
                    <p className="text-slate-600 text-sm font-medium leading-relaxed whitespace-pre-line">{ann.content}</p>
                    <div className="flex items-center gap-2.5 text-xs font-bold text-slate-400 pt-1">
                      <span className="text-slate-600 bg-slate-50 px-2.5 py-1.5 rounded-md">{author}</span>
                      <span className="text-slate-300">•</span>
                      <span>{formattedDate}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
