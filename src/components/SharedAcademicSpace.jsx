import React, { useState } from 'react';
import { getTreeForRole } from '../data/academicModel';
import { Icons } from '../pages/Teacher/Icons'; // Reuse existing icons

export default function SharedAcademicSpace({ role, onNavigateGroup }) {
  const [activePath, setActivePath] = useState([]);
  const tree = getTreeForRole(role);

  const handleNavigateTo = (index) => {
    setActivePath(activePath.slice(0, index + 1));
  };

  const handleNavigateBack = () => {
    setActivePath(activePath.slice(0, -1));
  };

  // Traverse tree to get current level data
  let currentLevelData = tree;
  for (const step of activePath) {
    if (currentLevelData[step]) {
      currentLevelData = currentLevelData[step];
    }
  }

  const renderBreadcrumbs = () => {
    if (activePath.length === 0) return null;
    return (
      <div className="flex items-center gap-2 text-sm font-bold bg-white px-4 py-2.5 rounded-xl border border-slate-200 shadow-sm w-fit animate-fade-in mb-6">
        <button onClick={handleNavigateBack} className="flex items-center gap-1.5 text-slate-500 hover:text-theme-primary transition-colors pr-3 border-r border-slate-100">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
          <span>Back</span>
        </button>
        <div className="flex items-center gap-2 pl-1 overflow-x-auto scrollbar-hide max-w-full">
          {activePath.map((segment, index) => {
            const isLast = index === activePath.length - 1;
            return (
              <div key={index} className="flex items-center gap-2 whitespace-nowrap">
                <button 
                  onClick={() => !isLast && handleNavigateTo(index)}
                  className={`transition-colors ${isLast ? 'text-slate-900 cursor-default' : 'text-slate-500 hover:text-theme-primary'}`}
                >
                  {segment}
                </button>
                {!isLast && <span className="text-slate-300">/</span>}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderCards = (data, onClickNode) => {
    // Current scope permissions for the group. For Director, always manage. For teacher, determine based on their highest permission in this scope.
    const permissions = role === 'director' ? ['View', 'Announce', 'Manage'] : ['View', 'Announce'];
    
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 animate-fade-in">
        <div 
          onClick={() => onNavigateGroup({ name: "Official Group", path: activePath, permissions })}
          className="bg-gradient-to-br from-theme-primary to-theme-primary/80 rounded-2xl p-6 text-white shadow-md hover:shadow-lg transition-all cursor-pointer hover:-translate-y-1 relative overflow-hidden group"
        >
          <div className="absolute right-[-20px] top-[-20px] opacity-10 group-hover:scale-125 transition-transform duration-500 [&>svg]:w-32 [&>svg]:h-32">
             <Icons.Announcements />
          </div>
          <h3 className="text-xl font-bold mb-2 relative z-10">Official Group</h3>
          <p className="text-sm opacity-90 relative z-10">Shared {activePath.length > 0 ? activePath[activePath.length - 1] : 'Institution'} communication space</p>
        </div>

        {Object.keys(data).map(key => (
          <div 
            key={key} 
            onClick={() => onClickNode(key)}
            className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm hover:shadow-md transition-all cursor-pointer hover:-translate-y-1 group"
          >
            <div className="w-12 h-12 rounded-xl bg-theme-bg text-theme-primary flex items-center justify-center text-xl font-bold mb-4 group-hover:scale-110 transition-transform">
              {key.charAt(0)}
            </div>
            <h3 className="text-lg font-bold text-slate-900 group-hover:text-theme-primary transition-colors">{key}</h3>
            <p className="text-sm text-slate-500 mt-2">Explore {key.toLowerCase()} ecosystem</p>
          </div>
        ))}
      </div>
    );
  };

  const renderSectionDashboard = (subjectsObj) => {
    return (
      <div className="space-y-6 animate-fade-in">
        <h3 className="text-xl font-bold text-slate-900 mb-4">Subjects in this Section</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {Object.entries(subjectsObj).map(([subj, perms]) => (
             <div key={subj} className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm flex flex-col space-y-4">
               <div className="flex items-center justify-between">
                 <span className="text-lg font-bold text-slate-800">{subj}</span>
                 <div className="flex gap-1.5">
                   {perms.map(p => (
                     <span key={p} className="text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-500 border border-slate-200">{p}</span>
                   ))}
                 </div>
               </div>
               
               <div className="pt-2 border-t border-slate-50">
                 <div 
                   onClick={() => onNavigateGroup({ name: "Official Group", permissions: perms, path: [...activePath, subj] })}
                   className="flex items-center justify-between bg-slate-50/50 border border-slate-100 rounded-xl p-3 cursor-pointer hover:shadow-[0_4px_12px_rgba(0,0,0,0.03)] hover:-translate-y-0.5 active:scale-[0.98] hover:border-theme-primary/30 hover:bg-white transition-all duration-300 group w-full"
                 >
                   <div className="flex items-center gap-3">
                     <div className="w-10 h-10 rounded-xl bg-white border border-slate-100 text-theme-primary flex items-center justify-center transition-transform duration-300 group-hover:scale-110 shadow-sm">
                       <Icons.Announcements />
                     </div>
                     <div>
                       <p className="text-sm font-bold text-slate-900 group-hover:text-theme-primary transition-colors">Official Group</p>
                       <p className="text-[11px] text-slate-500 font-medium mt-0.5 group-hover:text-slate-600 transition-colors">Section-wide announcements</p>
                     </div>
                   </div>
                   <button className="text-xs font-bold text-theme-primary px-3 py-1.5 bg-theme-bg/50 group-hover:bg-theme-bg rounded-lg transition-all duration-300 border border-transparent group-hover:border-theme-primary/10">
                     Enter
                   </button>
                 </div>
               </div>

             </div>
          ))}
        </div>
      </div>
    );
  };

  const handleNodeClick = (key) => {
    setActivePath([...activePath, key]);
  };

  // Check if we are at the Section level. If the children are arrays of permissions (subjects), we are at Section level.
  const isSectionLevel = activePath.length === 6;

  return (
    <div className="space-y-6 animate-hero-fade-up relative z-10 pb-10" style={{ animationDuration: '400ms' }}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">Academic Space</h2>
        <span className="text-xs font-bold text-slate-500 bg-white border border-slate-200 px-3 py-1.5 rounded-lg shadow-sm">
          {role === 'director' ? 'Director View' : 'Teacher View'}
        </span>
      </div>
      
      {renderBreadcrumbs()}

      {!isSectionLevel ? (
         renderCards(currentLevelData, handleNodeClick)
      ) : (
         renderSectionDashboard(currentLevelData)
      )}
    </div>
  );
}
