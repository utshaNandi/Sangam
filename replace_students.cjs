const fs = require('fs');

const code = `
export function StudentsView() {
  const [selectedBranch, setSelectedBranch] = useState(null);
  const [selectedYear, setSelectedYear] = useState(null);
  const [selectedSection, setSelectedSection] = useState(null);

  const tree = {};
  Object.values(scheduleData).flat().forEach(period => {
    if (period.classInfo) {
      const parts = period.classInfo.split(' • ');
      if (parts.length === 3) {
        const year = parts[0].trim();
        const branch = parts[1].trim();
        const section = parts[2].trim();
        if (!tree[branch]) tree[branch] = {};
        if (!tree[branch][year]) tree[branch][year] = new Set();
        tree[branch][year].add(section);
      }
    }
  });

  const branches = Object.keys(tree).sort();

  const get20Students = (branch, year, section) => {
    const firstNames = ["Aarav", "Ananya", "Arjun", "Aditya", "Anika", "Rohan", "Riya", "Karan", "Ishita", "Rahul", "Aditi", "Yash", "Neha", "Aryan", "Priya", "Kabir", "Sneha", "Dev", "Meera", "Vivaan", "Vikram", "Siddharth", "Tara", "Rishabh", "Nisha", "Ravi", "Pooja", "Amit", "Sonal", "Kunal"];
    const lastNames = ["Sharma", "Singh", "Mehta", "Verma", "Gupta", "Patel", "Reddy", "Joshi", "Kapoor", "Chopra"];
    
    const seedStr = branch + year + section;
    let seed = 0;
    for(let i = 0; i < seedStr.length; i++) seed += seedStr.charCodeAt(i);
    
    const sectionStudents = [];
    for(let i=0; i<20; i++) {
      const fn = firstNames[(seed + i * 7) % firstNames.length];
      const ln = lastNames[(seed + i * 3) % lastNames.length];
      sectionStudents.push({ id: i + 1, name: fn + ' ' + ln });
    }
    return sectionStudents;
  };

  if (selectedSection) {
    const sectionStudents = get20Students(selectedBranch, selectedYear, selectedSection);
    return (
      <div className="space-y-6 animate-hero-fade-up relative z-10 pb-10" style={{ animationDuration: '400ms' }}>
         <div className="flex items-center gap-4">
            <button onClick={() => setSelectedSection(null)} className="flex items-center gap-2 bg-white border border-slate-200 text-slate-700 px-4 py-2.5 rounded-xl hover:bg-slate-50 active:scale-95 transition-all duration-200 shadow-sm font-bold text-sm">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
              Back
            </button>
            <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">{selectedSection} — 20 Students</h2>
         </div>
         <div className="bg-white rounded-[24px] border border-slate-100 p-6 shadow-[0_2px_20px_rgba(0,0,0,0.02)] space-y-3">
           {sectionStudents.map((st, idx) => (
              <div key={st.id} className="flex items-center gap-4 p-4 rounded-xl border border-slate-50 bg-slate-50/50 hover:bg-slate-50 hover:border-slate-200 transition-colors">
                <span className="text-slate-400 font-bold w-6 text-right">{idx + 1}.</span>
                <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-500 font-bold flex items-center justify-center text-xs">
                   {st.name.charAt(0)}
                </div>
                <span className="font-bold text-slate-900">{st.name}</span>
              </div>
           ))}
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
      <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">Student Sections</h2>
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
const studentRegex = /export function StudentsView\(\) \{[\s\S]*?\n\}\n/m;
content = content.replace(studentRegex, code);
fs.writeFileSync('src/pages/Teacher/TeacherViews.jsx', content);
console.log('Successfully replaced StudentsView');
