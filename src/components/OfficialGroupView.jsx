import React, { useState } from 'react';
import { Icons } from '../pages/Teacher/Icons';

export default function OfficialGroupView({ group, onNavigateBack, onNavigateTo }) {
  const canAnnounce = group.permissions.includes('Announce') || group.permissions.includes('Manage');
  const [announcements, setAnnouncements] = useState([
    {
      id: 1,
      title: 'Upcoming Lab',
      content: 'Please bring your laptops with the dev environment configured.',
      author: 'System',
      time: '2 hours ago'
    }
  ]);
  const [isCreating, setIsCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');

  const handlePublish = () => {
    if (!newTitle.trim() || !newContent.trim()) return;
    setAnnouncements([{
      id: Date.now(),
      title: newTitle,
      content: newContent,
      author: 'You',
      time: 'Just now'
    }, ...announcements]);
    setIsCreating(false);
    setNewTitle('');
    setNewContent('');
  };
  
  const renderBreadcrumbs = () => {
    const activePath = group.path;
    return (
      <div className="flex items-center gap-2 text-sm font-bold bg-white px-4 py-2.5 rounded-xl border border-slate-200 shadow-sm w-fit animate-fade-in mb-6">
        <button onClick={onNavigateBack} className="flex items-center gap-1.5 text-slate-500 hover:text-theme-primary transition-colors pr-3 border-r border-slate-100">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
          <span>Back</span>
        </button>
        <div className="flex items-center gap-2 pl-1 overflow-x-auto scrollbar-hide max-w-full">
          {activePath.map((segment, index) => {
            return (
              <div key={index} className="flex items-center gap-2 whitespace-nowrap">
                <button 
                  onClick={() => onNavigateTo(index)}
                  className={`transition-colors text-slate-500 hover:text-theme-primary`}
                >
                  {segment}
                </button>
                <span className="text-slate-300">/</span>
              </div>
            );
          })}
          <div className="flex items-center gap-2 whitespace-nowrap">
            <span className="text-slate-900 cursor-default">Official Group</span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-fade-in relative z-10 pb-10">
      <div className="flex items-center gap-4">
        <div>
          <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">Official Group</h2>
        </div>
      </div>
      
      {onNavigateBack && renderBreadcrumbs()}

      <div className="bg-white rounded-[24px] border border-slate-100 shadow-[0_2px_20px_rgba(0,0,0,0.02)] overflow-hidden">
        <div className="bg-slate-50/80 border-b border-slate-100 p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-theme-bg text-theme-primary flex items-center justify-center shadow-sm">
              <Icons.Announcements />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">
                 {group.path.length === 0 ? 'Institution-wide announcements' : 
                  group.path.length === 1 ? 'Programme-wide announcements' :
                  group.path.length === 2 ? 'Branch-wide announcements' :
                  group.path.length === 3 ? 'Specialization-wide announcements' :
                  group.path.length === 4 ? 'Year-wide announcements' :
                  group.path.length === 5 ? 'Section-wide announcements' : 'Announcements'}
              </h3>
              <div className="flex gap-2 mt-1.5">
                {group.permissions.map(p => (
                  <span key={p} className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-md bg-white border border-slate-200 text-slate-500">{p}</span>
                ))}
              </div>
            </div>
          </div>
          {canAnnounce && !isCreating && (
            <button onClick={() => setIsCreating(true)} className="flex items-center gap-2 bg-theme-primary text-white px-5 py-2.5 rounded-xl hover:opacity-90 transition-all shadow-sm font-bold text-sm">
              <div className="[&>svg]:w-4 [&>svg]:h-4 flex items-center justify-center"><Icons.Plus /></div> Create Announcement
            </button>
          )}
        </div>

        <div className="p-6 sm:p-8 space-y-6">
          {isCreating && (
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 mb-8 animate-fade-in">
              <h4 className="text-sm font-bold text-slate-900 mb-4">New Announcement</h4>
              <input 
                type="text" 
                placeholder="Announcement Title" 
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                className="w-full mb-3 px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-theme-primary/20 focus:border-theme-primary text-sm font-medium transition-all"
              />
              <textarea 
                placeholder="Write your message here..." 
                rows="4"
                value={newContent}
                onChange={e => setNewContent(e.target.value)}
                className="w-full mb-4 px-4 py-3 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-theme-primary/20 focus:border-theme-primary text-sm font-medium transition-all resize-none"
              ></textarea>
              <div className="flex justify-end gap-3">
                <button onClick={() => setIsCreating(false)} className="px-5 py-2.5 rounded-xl text-slate-500 font-bold hover:bg-slate-200 bg-slate-100 transition-colors text-sm">Cancel</button>
                <button onClick={handlePublish} className="px-5 py-2.5 rounded-xl bg-theme-primary text-white font-bold hover:opacity-90 shadow-sm transition-all text-sm">Publish</button>
              </div>
            </div>
          )}

          <div className="space-y-4">
            {announcements.map(ann => (
              <div key={ann.id} className="p-5 sm:p-6 rounded-2xl border border-slate-100 hover:border-slate-200 hover:shadow-[0_4px_12px_rgba(0,0,0,0.02)] transition-all bg-white group">
                <h4 className="font-bold text-slate-900 text-lg">{ann.title}</h4>
                <p className="text-slate-600 mt-2 mb-4 text-sm font-medium leading-relaxed">{ann.content}</p>
                <div className="flex items-center gap-2 text-xs font-bold text-slate-400">
                  <span className="text-slate-600 bg-slate-50 px-2 py-1 rounded-md">{ann.author}</span>
                  <span>•</span>
                  <span>{ann.time}</span>
                </div>
              </div>
            ))}
            {announcements.length === 0 && !isCreating && (
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
