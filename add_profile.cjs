const fs = require('fs');

const profileCode = `
export function ProfileView() {
  let totalClasses = 0;
  const uniqueSubjects = new Set();
  const uniqueSections = new Set();
  
  Object.values(scheduleData).forEach(day => {
    day.forEach(period => {
      if (period.classInfo && period.type !== 'Break' && period.type !== 'Self Study') {
         totalClasses++;
         uniqueSubjects.add(period.subject);
         uniqueSections.add(period.classInfo);
      }
    });
  });

  return (
    <div className="space-y-8 animate-hero-fade-up relative z-10 pb-10" style={{ animationDuration: '400ms' }}>
       {/* header card */}
       <div className="bg-white rounded-[32px] border border-slate-100 p-8 md:p-10 shadow-[0_4px_30px_rgba(0,0,0,0.03)] relative overflow-hidden flex flex-col md:flex-row items-center md:items-start gap-8 group">
           {/* decorative bg */}
           <div className="absolute top-0 right-0 w-64 h-64 bg-theme-primary/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none transition-transform duration-700 group-hover:scale-110"></div>
           
           {/* avatar */}
           <div className="w-32 h-32 md:w-40 md:h-40 rounded-3xl bg-theme-bg text-theme-primary flex items-center justify-center font-extrabold text-5xl shadow-sm border border-theme-primary/10 flex-shrink-0 z-10 relative transition-transform duration-500 group-hover:scale-105 group-hover:-rotate-2">
              {teacherProfile.avatar}
              <div className="absolute -bottom-2 -right-2 w-8 h-8 md:w-10 md:h-10 bg-emerald-500 rounded-full border-4 border-white shadow-sm flex items-center justify-center" title="Active Status">
                 <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
              </div>
           </div>
           
           <div className="text-center md:text-left z-10 flex-1 pt-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-100 text-slate-600 text-xs font-bold mb-4 shadow-sm border border-slate-200">
                 <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                 Faculty ID: EMP-4092
              </div>
              <h2 className="text-3xl md:text-5xl font-extrabold text-slate-900 tracking-tight mb-3">{teacherProfile.name}</h2>
              <p className="text-lg md:text-xl font-bold text-slate-500 mb-8">{teacherProfile.role} • <span className="text-theme-primary">{teacherProfile.department}</span></p>
              
              <div className="flex flex-col sm:flex-row items-center justify-center md:justify-start gap-4">
                 <div className="flex items-center gap-3 text-sm font-bold text-slate-700 bg-slate-50 hover:bg-theme-primary/5 hover:border-theme-primary/20 hover:text-theme-primary px-5 py-3 rounded-2xl border border-slate-100 transition-all cursor-pointer shadow-sm">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
                    {teacherProfile.email}
                 </div>
                 <div className="flex items-center gap-3 text-sm font-bold text-slate-700 bg-slate-50 hover:bg-theme-primary/5 hover:border-theme-primary/20 hover:text-theme-primary px-5 py-3 rounded-2xl border border-slate-100 transition-all cursor-pointer shadow-sm">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                    +91 98765 43210
                 </div>
              </div>
           </div>
       </div>

       {/* metrics */}
       <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white rounded-[24px] border border-slate-100 p-8 shadow-[0_2px_20px_rgba(0,0,0,0.02)] hover:-translate-y-1 hover:shadow-lg transition-all duration-300 relative overflow-hidden group">
             <div className="absolute top-0 right-0 w-24 h-24 bg-blue-50 rounded-full blur-xl -translate-y-1/2 translate-x-1/2 group-hover:scale-150 transition-transform duration-500"></div>
             <div className="w-14 h-14 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mb-5 relative z-10">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
             </div>
             <h3 className="text-4xl font-extrabold text-slate-900 relative z-10 mb-1">{totalClasses}</h3>
             <p className="text-sm font-bold text-slate-500 relative z-10 uppercase tracking-wider">Classes / Week</p>
          </div>
          
          <div className="bg-white rounded-[24px] border border-slate-100 p-8 shadow-[0_2px_20px_rgba(0,0,0,0.02)] hover:-translate-y-1 hover:shadow-lg transition-all duration-300 relative overflow-hidden group">
             <div className="absolute top-0 right-0 w-24 h-24 bg-purple-50 rounded-full blur-xl -translate-y-1/2 translate-x-1/2 group-hover:scale-150 transition-transform duration-500"></div>
             <div className="w-14 h-14 bg-purple-50 text-purple-600 rounded-2xl flex items-center justify-center mb-5 relative z-10">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg>
             </div>
             <h3 className="text-4xl font-extrabold text-slate-900 relative z-10 mb-1">{uniqueSubjects.size}</h3>
             <p className="text-sm font-bold text-slate-500 relative z-10 uppercase tracking-wider">Subjects Taught</p>
          </div>

          <div className="bg-white rounded-[24px] border border-slate-100 p-8 shadow-[0_2px_20px_rgba(0,0,0,0.02)] hover:-translate-y-1 hover:shadow-lg transition-all duration-300 relative overflow-hidden group">
             <div className="absolute top-0 right-0 w-24 h-24 bg-amber-50 rounded-full blur-xl -translate-y-1/2 translate-x-1/2 group-hover:scale-150 transition-transform duration-500"></div>
             <div className="w-14 h-14 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center mb-5 relative z-10">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
             </div>
             <h3 className="text-4xl font-extrabold text-slate-900 relative z-10 mb-1">{uniqueSections.size}</h3>
             <p className="text-sm font-bold text-slate-500 relative z-10 uppercase tracking-wider">Sections Handled</p>
          </div>
       </div>

       {/* Detailed Info */}
       <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-[32px] border border-slate-100 p-8 shadow-[0_2px_20px_rgba(0,0,0,0.02)]">
            <h3 className="text-xl font-extrabold text-slate-900 mb-8 flex items-center gap-3">
               <div className="w-10 h-10 rounded-xl bg-slate-50 text-slate-600 flex items-center justify-center border border-slate-100">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg>
               </div>
               Subjects
            </h3>
            <div className="flex flex-col gap-3">
               {Array.from(uniqueSubjects).map((subj, idx) => (
                  <div key={idx} className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 border border-slate-100 hover:border-theme-primary/20 hover:bg-white transition-all cursor-default group">
                     <span className="font-bold text-slate-700 text-base">{subj}</span>
                     <svg width="20" height="20" className="text-slate-300 group-hover:text-theme-primary transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                  </div>
               ))}
            </div>
          </div>
          
          <div className="bg-white rounded-[32px] border border-slate-100 p-8 shadow-[0_2px_20px_rgba(0,0,0,0.02)]">
            <h3 className="text-xl font-extrabold text-slate-900 mb-8 flex items-center gap-3">
               <div className="w-10 h-10 rounded-xl bg-slate-50 text-slate-600 flex items-center justify-center border border-slate-100">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
               </div>
               Sections Handled
            </h3>
            <div className="flex flex-wrap gap-3">
               {Array.from(uniqueSections).map((sec, idx) => (
                  <div key={idx} className="flex items-center gap-3 px-5 py-3 rounded-2xl bg-white border border-slate-200 shadow-sm hover:border-theme-primary/30 hover:shadow-md hover:-translate-y-0.5 transition-all cursor-default">
                     <div className="w-2.5 h-2.5 rounded-full bg-theme-primary"></div>
                     <span className="font-extrabold text-slate-700 text-sm">{sec}</span>
                  </div>
               ))}
            </div>
          </div>
       </div>
    </div>
  );
}
`;

let content = fs.readFileSync('src/pages/Teacher/TeacherViews.jsx', 'utf8');
content += '\n' + profileCode + '\n';
fs.writeFileSync('src/pages/Teacher/TeacherViews.jsx', content);

console.log('Successfully appended ProfileView to TeacherViews.jsx');
