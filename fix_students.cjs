const fs = require('fs');
let content = fs.readFileSync('src/pages/Teacher/TeacherViews.jsx', 'utf8');

const regex = /const renderContent = \(br, yr, sec\) => \{[\s\S]*?return \([\s\S]*?<div className="space-y-3">[\s\S]*?\{sectionStudents\.map[\s\S]*?<\/div>\s*\);\s*\};/g;

const newRenderContent = `const renderContent = (br, yr, sec) => {
    const sectionStudents = get20Students(br, yr, sec);
    
    const handleDownload = () => {
      const headers = ["Sl No", "Student ID", "Roll Number", "Student Name"];
      const rows = sectionStudents.map((st, idx) => [
         idx + 1,
         st.id,
         st.roll,
         st.name
      ]);
      const csvContent = [
         headers.join(","),
         ...rows.map(r => r.map(cell => \`"\${cell}"\`).join(","))
      ].join("\\n");
      
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const filename = \`\${br}_\${yr}_\${sec}_Students.csv\`.replace(/\\s+/g, '_');
      link.setAttribute("href", url);
      link.setAttribute("download", filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    };

    return (
      <div className="space-y-4">
        <div className="flex justify-end mb-2">
          <button 
            onClick={handleDownload}
            className="flex items-center gap-2 bg-white border border-slate-200 text-slate-700 px-3 py-1.5 rounded-lg hover:bg-slate-50 active:scale-95 transition-all shadow-sm font-bold text-xs"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
            Download Student List
          </button>
        </div>
        <div className="space-y-3">
          {sectionStudents.map((st, idx) => (
            <div key={st.id} className="flex items-center gap-4 p-3 rounded-xl border border-slate-50 bg-slate-50/50 hover:bg-white hover:shadow-sm hover:border-slate-200 transition-all">
              <span className="text-slate-400 font-bold w-6 text-right text-xs">{idx + 1}.</span>
              <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-500 font-bold flex items-center justify-center text-xs">
                 {st.name.charAt(0)}
              </div>
              <div className="flex flex-col">
                 <span className="font-bold text-slate-900 text-sm">{st.name}</span>
                 <span className="text-[11px] font-medium text-slate-500">{st.roll}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };`;

content = content.replace(regex, newRenderContent);
fs.writeFileSync('src/pages/Teacher/TeacherViews.jsx', content);
console.log('Fixed StudentsView renderContent');
