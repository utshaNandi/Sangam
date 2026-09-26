const fs = require('fs');

const newCode = `
export function AttendanceView() {
  const [selectedBranch, setSelectedBranch] = useState(null);
  const [selectedYear, setSelectedYear] = useState(null);
  const [selectedSection, setSelectedSection] = useState(null);
  const [attendanceState, setAttendanceState] = useState({});

  if (selectedSection) {
    const sectionStudents = get20Students(selectedBranch, selectedYear, selectedSection);
    
    const handleMark = (id, status) => {
        setAttendanceState(prev => ({ ...prev, [id]: status }));
    };

    const sectionKey = \`\${selectedBranch}-\${selectedYear}-\${selectedSection}\`;

    return (
      <div className="space-y-6 animate-hero-fade-up relative z-10 pb-10" style={{ animationDuration: '400ms' }}>
         <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
               <button onClick={() => setSelectedSection(null)} className="flex items-center gap-2 bg-white border border-slate-200 text-slate-700 px-4 py-2.5 rounded-xl hover:bg-slate-50 active:scale-95 transition-all duration-200 shadow-sm font-bold text-sm">
                 <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
                 Back
               </button>
               <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">{selectedSection} Attendance</h2>
            </div>
            <div className="text-sm font-bold text-slate-500 bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-sm">
              {new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
            </div>
         </div>

         <div className="bg-white rounded-[24px] border border-slate-100 p-6 shadow-[0_2px_20px_rgba(0,0,0,0.02)] space-y-3">
           <div className="flex justify-between items-center mb-4 px-2">
             <h3 className="text-lg font-bold text-slate-900">Students ({sectionStudents.length})</h3>
             <div className="flex gap-2">
               <button 
                 onClick={() => {
                   const newState = { ...attendanceState };
                   sectionStudents.forEach(s => newState[s.id] = 'Present');
                   setAttendanceState(newState);
                 }}
                 className="text-xs font-bold px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-lg hover:bg-emerald-100 transition-colors"
               >Mark All Present</button>
               <button 
                 onClick={() => {
                   const newState = { ...attendanceState };
                   sectionStudents.forEach(s => newState[s.id] = 'Absent');
                   setAttendanceState(newState);
                 }}
                 className="text-xs font-bold px-3 py-1.5 bg-rose-50 text-rose-700 rounded-lg hover:bg-rose-100 transition-colors"
               >Mark All Absent</button>
             </div>
           </div>

           {sectionStudents.map((st, idx) => {
              const status = attendanceState[st.id] || 'Present'; // Default to Present for visual ease, but state starts empty
              const isPresent = status === 'Present';
              
              return (
              <div key={st.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border border-slate-50 bg-slate-50/50 hover:bg-slate-50 hover:border-slate-200 transition-colors">
                <div className="flex items-center gap-4">
                  <span className="text-slate-400 font-bold w-6 text-right">{idx + 1}.</span>
                  <div className="w-10 h-10 rounded-full bg-slate-200 text-slate-600 font-bold flex items-center justify-center text-sm">
                     {st.name.charAt(0)}
                  </div>
                  <div>
                    <span className="font-bold text-slate-900 block">{st.name}</span>
                    <span className="text-xs font-medium text-slate-500">{st.roll}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 pl-14 sm:pl-0">
                  <button 
                    onClick={() => handleMark(st.id, 'Present')}
                    className={\`px-4 py-2 rounded-lg text-sm font-bold transition-all duration-200 \${isPresent ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/20' : 'bg-white border border-slate-200 text-slate-500 hover:bg-slate-50'}\`}
                  >
                    Present
                  </button>
                  <button 
                    onClick={() => handleMark(st.id, 'Absent')}
                    className={\`px-4 py-2 rounded-lg text-sm font-bold transition-all duration-200 \${status === 'Absent' ? 'bg-rose-500 text-white shadow-md shadow-rose-500/20' : 'bg-white border border-slate-200 text-slate-500 hover:bg-slate-50'}\`}
                  >
                    Absent
                  </button>
                </div>
              </div>
           )})}
         </div>
         <div className="flex justify-end pt-4">
            <button className="bg-theme-primary text-white px-8 py-3 rounded-xl hover:bg-theme-primary/90 active:scale-95 transition-all duration-200 shadow-lg shadow-theme-primary/25 font-bold">
                Save Attendance
            </button>
         </div>
      </div>
    );
  }

  if (selectedYear) {
    const sections = Array.from(tree[selectedBranch][selectedYear]).sort();
    return (
      <div className="space-y-6 animate-hero-fade-up relative z-10" style={{ animationDuration: '400ms' }}>
         <div className="flex items-center gap-4">
            <button onClick={() => setSelectedYear(null)} className="flex items-center gap-2 bg-white border border-slate-200 text-slate-700 px-4 py-2.5 rounded-xl hover:bg-slate-50 active:scale-95 transition-all duration-200 shadow-sm font-bold text-sm">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
              Back
            </button>
            <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">{selectedBranch} — {selectedYear} Sections</h2>
         </div>
         <div className="grid gap-4">
           {sections.map(sec => (
             <div key={sec} onClick={() => setSelectedSection(sec)} className="bg-white rounded-[24px] border border-slate-100 p-6 shadow-[0_2px_20px_rgba(0,0,0,0.02)] hover:border-theme-primary/30 hover:shadow-[0_4px_20px_rgba(0,0,0,0.04)] hover:-translate-y-0.5 active:scale-[0.99] transition-all duration-300 cursor-pointer flex justify-between items-center group">
               <h3 className="text-xl font-bold text-slate-700 group-hover:text-slate-900">{sec}</h3>
               <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-300 group-hover:text-theme-primary transition-colors"><polyline points="9 18 15 12 9 6"></polyline></svg>
             </div>
           ))}
         </div>
      </div>
    );
  }

  if (selectedBranch) {
    const years = Object.keys(tree[selectedBranch]).sort();
    return (
      <div className="space-y-6 animate-hero-fade-up relative z-10" style={{ animationDuration: '400ms' }}>
         <div className="flex items-center gap-4">
            <button onClick={() => setSelectedBranch(null)} className="flex items-center gap-2 bg-white border border-slate-200 text-slate-700 px-4 py-2.5 rounded-xl hover:bg-slate-50 active:scale-95 transition-all duration-200 shadow-sm font-bold text-sm">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
              Back
            </button>
            <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">{selectedBranch} Years</h2>
         </div>
         <div className="grid gap-4">
           {years.map(yr => (
             <div key={yr} onClick={() => setSelectedYear(yr)} className="bg-white rounded-[24px] border border-slate-100 p-6 shadow-[0_2px_20px_rgba(0,0,0,0.02)] hover:border-theme-primary/30 hover:shadow-[0_4px_20px_rgba(0,0,0,0.04)] hover:-translate-y-0.5 active:scale-[0.99] transition-all duration-300 cursor-pointer flex justify-between items-center group">
               <h3 className="text-xl font-bold text-slate-700 group-hover:text-slate-900">{yr}</h3>
               <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-300 group-hover:text-theme-primary transition-colors"><polyline points="9 18 15 12 9 6"></polyline></svg>
             </div>
           ))}
         </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-hero-fade-up relative z-10" style={{ animationDuration: '400ms' }}>
      <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">Attendance</h2>
      <div className="grid gap-4">
        {branches.map(br => (
          <div key={br} onClick={() => setSelectedBranch(br)} className="bg-white rounded-[24px] border border-slate-100 p-6 shadow-[0_2px_20px_rgba(0,0,0,0.02)] hover:border-theme-primary/30 hover:shadow-[0_4px_20px_rgba(0,0,0,0.04)] hover:-translate-y-0.5 active:scale-[0.99] transition-all duration-300 flex justify-between items-center cursor-pointer group">
            <h3 className="text-xl font-bold text-slate-700 group-hover:text-slate-900">{br}</h3>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-300 group-hover:text-theme-primary transition-colors duration-300"><polyline points="9 18 15 12 9 6"></polyline></svg>
          </div>
        ))}
      </div>
    </div>
  );
}
`;

let content = fs.readFileSync('src/pages/Teacher/TeacherViews.jsx', 'utf8');
const attendRegex = /export function AttendanceView\(\) \{[\s\S]*?(?=export function)/;
content = content.replace(attendRegex, newCode + '\n\n');
fs.writeFileSync('src/pages/Teacher/TeacherViews.jsx', content);
console.log('Successfully replaced AttendanceView');
