const fs = require('fs');

const newCode = `
export const getAssignmentsForSection = (branch, year, section) => {
    const subjects = ["Data Structures", "Database Systems", "Operating Systems", "Computer Networks", "Mathematics", "Machine Learning", "Artificial Intelligence", "Web Development", "Cloud Computing"];
    const seedStr = branch + year + section + "assignments";
    let seed = 0;
    for(let i = 0; i < seedStr.length; i++) seed += seedStr.charCodeAt(i);
    
    const count = 3 + (seed % 3); // 3 to 5 assignments
    const sectionAssignments = [];
    for(let i=0; i<count; i++) {
        const subj = subjects[(seed + i * 5) % subjects.length];
        sectionAssignments.push({
            id: \`a-\${seed}-\${i}\`,
            title: \`\${subj} Assignment \${i+1}\`,
            className: \`\${year} \u2022 \${branch} \u2022 \${section}\`,
            dueDate: \`Oct \${10 + (seed + i) % 20}\`,
            total: 20, // Always 20 as requested
            status: 'Active'
        });
    }
    return sectionAssignments;
};

export function AssignmentsView() {
  const [selectedBranch, setSelectedBranch] = useState(null);
  const [selectedYear, setSelectedYear] = useState(null);
  const [selectedSection, setSelectedSection] = useState(null);

  const [createdAssignments, setCreatedAssignments] = useState({});
  const [isCreating, setIsCreating] = useState(false);
  const [viewingAssignment, setViewingAssignment] = useState(null);

  const [newAssignment, setNewAssignment] = useState({
    title: '',
    dueDate: '',
    pdf: null
  });

  const sectionKey = selectedBranch && selectedYear && selectedSection 
     ? \`\${selectedBranch}-\${selectedYear}-\${selectedSection}\` : null;

  const currentSectionAssignments = sectionKey 
     ? [...getAssignmentsForSection(selectedBranch, selectedYear, selectedSection), ...(createdAssignments[sectionKey] || [])]
     : [];

  const handleCreateAssignment = (e) => {
    e.preventDefault();
    if (!newAssignment.title || !newAssignment.dueDate || !newAssignment.pdf) {
      alert("Please fill all fields and upload a PDF.");
      return;
    }
    const assignment = {
      id: \`a\${Date.now()}\`,
      title: newAssignment.title,
      className: \`\${selectedYear} \u2022 \${selectedBranch} \u2022 \${selectedSection}\`,
      dueDate: newAssignment.dueDate,
      total: 20,
      submitted: 0,
      status: 'Active',
      submissions: {}
    };
    
    setCreatedAssignments(prev => ({
        ...prev,
        [sectionKey]: [assignment, ...(prev[sectionKey] || [])]
    }));
    
    setIsCreating(false);
    setNewAssignment({ title: '', dueDate: '', pdf: null });
  };

  const handleFileChange = (e) => {
    setNewAssignment({ ...newAssignment, pdf: e.target.files[0] });
  };

  if (viewingAssignment && selectedSection) {
    const assignmentStudents = get20Students(selectedBranch, selectedYear, selectedSection);
    
    // Calculate who submitted
    const submittedStudents = assignmentStudents.filter(s => {
      if (viewingAssignment.submissions && viewingAssignment.submissions[s.id]) {
        return viewingAssignment.submissions[s.id] === 'Submitted';
      }
      // Mock logic for deterministic submission status based on assignment and student
      const seedStr = viewingAssignment.id + s.id;
      let seed = 0;
      for(let i=0; i<seedStr.length; i++) seed += seedStr.charCodeAt(i);
      return seed % 2 !== 0;
    });
    
    const notSubmittedStudents = assignmentStudents.filter(s => !submittedStudents.includes(s));

    return (
      <div className="space-y-6 animate-hero-fade-up relative z-10" style={{ animationDuration: '400ms' }}>
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">Review: {viewingAssignment.title}</h2>
            <p className="text-sm font-medium text-slate-500 mt-1">{viewingAssignment.className} \u2022 Due: {viewingAssignment.dueDate}</p>
          </div>
          <button onClick={() => setViewingAssignment(null)} className="flex items-center gap-2 bg-white border border-slate-200 text-slate-700 px-5 py-2.5 rounded-xl hover:bg-slate-50 active:scale-95 transition-all duration-200 shadow-sm font-bold text-sm">
            Back to Assignments
          </button>
        </div>

        <div className="bg-white rounded-[24px] border border-slate-100 p-6 shadow-[0_2px_20px_rgba(0,0,0,0.02)]">
          <h3 className="text-lg font-bold text-slate-900 mb-4">All Students ({assignmentStudents.length})</h3>
          <div className="space-y-3">
            {assignmentStudents.map(student => {
              const hasSubmitted = submittedStudents.includes(student);
              return (
                <div key={student.id} className="flex items-center justify-between p-4 rounded-xl border border-slate-100 bg-slate-50/50">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-theme-primary/10 flex items-center justify-center text-theme-primary font-bold">
                      {student.name.charAt(0)}
                    </div>
                    <div>
                      <p className="font-bold text-slate-900">{student.name}</p>
                      <p className="text-xs font-medium text-slate-500">{student.roll}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {hasSubmitted ? (
                      <span className="px-3 py-1 bg-green-100 text-green-700 text-xs font-bold rounded-lg flex items-center gap-1">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                        Submitted
                      </span>
                    ) : (
                      <span className="px-3 py-1 bg-red-100 text-red-700 text-xs font-bold rounded-lg flex items-center gap-1">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                        Not Submitted
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-white rounded-[24px] border border-red-100 p-6 shadow-[0_2px_20px_rgba(0,0,0,0.02)] mt-6">
          <h3 className="text-lg font-bold text-red-600 mb-4 flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
            Pending Submissions ({notSubmittedStudents.length})
          </h3>
          <div className="space-y-3">
            {notSubmittedStudents.map(student => (
              <div key={\`pending-\${student.id}\`} className="flex items-center justify-between p-4 rounded-xl border border-red-50 bg-red-50/30">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center text-red-600 font-bold">
                    {student.name.charAt(0)}
                  </div>
                  <div>
                    <p className="font-bold text-slate-900">{student.name}</p>
                    <p className="text-xs font-medium text-slate-500">{student.roll}</p>
                  </div>
                </div>
                <div className="text-red-500 font-bold flex items-center gap-1">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </div>
              </div>
            ))}
            {notSubmittedStudents.length === 0 && (
              <p className="text-sm text-slate-500 text-center py-4">All students have submitted this assignment.</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (isCreating && selectedSection) {
    return (
      <div className="space-y-6 animate-hero-fade-up relative z-10" style={{ animationDuration: '400ms' }}>
        <div className="flex justify-between items-center">
          <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">Create Assignment for {selectedSection}</h2>
          <button onClick={() => setIsCreating(false)} className="flex items-center gap-2 bg-white border border-slate-200 text-slate-700 px-5 py-2.5 rounded-xl hover:bg-slate-50 active:scale-95 transition-all duration-200 shadow-sm font-bold text-sm">
            Cancel
          </button>
        </div>
        <div className="bg-white rounded-[24px] border border-slate-100 p-8 shadow-[0_2px_20px_rgba(0,0,0,0.02)]">
          <form onSubmit={handleCreateAssignment} className="space-y-6">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Assignment Title</label>
              <input type="text" value={newAssignment.title} onChange={e => setNewAssignment({...newAssignment, title: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-theme-primary/20 focus:border-theme-primary transition-all font-medium text-slate-900" placeholder="e.g. Binary Trees Implementation" />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Due Date</label>
              <input type="date" value={newAssignment.dueDate} onChange={e => setNewAssignment({...newAssignment, dueDate: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-theme-primary/20 focus:border-theme-primary transition-all font-medium text-slate-900" />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Upload PDF Document</label>
              <div className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center hover:border-theme-primary/50 transition-colors bg-slate-50/50">
                <input type="file" accept=".pdf" onChange={handleFileChange} className="hidden" id="pdf-upload" />
                <label htmlFor="pdf-upload" className="cursor-pointer flex flex-col items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-theme-primary/10 text-theme-primary flex items-center justify-center">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="12" y1="18" x2="12" y2="12"></line><line x1="9" y1="15" x2="15" y2="15"></line></svg>
                  </div>
                  <div>
                    <span className="font-bold text-theme-primary hover:text-theme-primary/80 transition-colors">Click to upload</span>
                    <span className="text-slate-500 font-medium"> or drag and drop</span>
                  </div>
                  {newAssignment.pdf && <p className="text-sm font-bold text-slate-700 mt-2 bg-white px-3 py-1 rounded-lg border border-slate-200 shadow-sm">{newAssignment.pdf.name}</p>}
                </label>
              </div>
            </div>
            <div className="pt-4 flex justify-end">
              <button type="submit" className="bg-theme-primary text-white px-8 py-3 rounded-xl hover:bg-theme-primary/90 active:scale-95 transition-all duration-200 shadow-lg shadow-theme-primary/25 font-bold">
                Publish Assignment
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // If section is selected, show its assignments
  if (selectedSection) {
    return (
      <div className="space-y-6 animate-hero-fade-up relative z-10" style={{ animationDuration: '400ms' }}>
         <div className="flex justify-between items-center">
            <div className="flex items-center gap-4">
              <button onClick={() => setSelectedSection(null)} className="flex items-center gap-2 bg-white border border-slate-200 text-slate-700 px-4 py-2.5 rounded-xl hover:bg-slate-50 active:scale-95 transition-all duration-200 shadow-sm font-bold text-sm">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
                Back
              </button>
              <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">{selectedSection} Assignments</h2>
            </div>
            <button onClick={() => setIsCreating(true)} className="bg-theme-primary text-white px-5 py-2.5 rounded-xl hover:bg-theme-primary/90 active:scale-95 transition-all duration-200 shadow-lg shadow-theme-primary/25 font-bold flex items-center gap-2">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
              Create Assignment
            </button>
         </div>

         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {currentSectionAssignments.map(a => {
            const assignmentStudents = get20Students(selectedBranch, selectedYear, selectedSection);
            const submittedStudents = assignmentStudents.filter(s => {
              if (a.submissions && a.submissions[s.id]) return a.submissions[s.id] === 'Submitted';
              const seedStr = a.id + s.id;
              let seed = 0;
              for(let i=0; i<seedStr.length; i++) seed += seedStr.charCodeAt(i);
              return seed % 2 !== 0;
            });
            return (
            <div key={a.id} className="bg-white rounded-[24px] border border-slate-100 p-6 shadow-[0_2px_20px_rgba(0,0,0,0.02)] hover:shadow-[0_8px_30px_rgba(0,0,0,0.06)] hover:-translate-y-1 active:scale-[0.98] transition-all duration-300 group">
              <div className="flex justify-between items-start mb-5">
                <div>
                  <span className={\`inline-block px-3 py-1 rounded-lg text-xs font-bold mb-3 \${a.status === 'Active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-700'}\`}>
                    {a.status}
                  </span>
                  <h3 className="text-xl font-bold text-slate-900 leading-tight group-hover:text-theme-primary transition-colors">{a.title}</h3>
                </div>
                <div className="w-12 h-12 rounded-2xl bg-slate-50 text-slate-400 flex items-center justify-center transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3 group-hover:bg-theme-primary/10 group-hover:text-theme-primary">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                </div>
              </div>
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm text-slate-500 font-medium">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                  Due: {a.dueDate}
                </div>
                <div className="flex items-center gap-3 pt-4 border-t border-slate-50">
                  <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
                    <div className="bg-theme-primary h-full rounded-full transition-all duration-1000" style={{ width: \`\${(submittedStudents.length / a.total) * 100}%\` }}></div>
                  </div>
                  <span className="text-sm font-bold text-slate-700">{submittedStudents.length}/{a.total}</span>
                </div>
                <button onClick={() => setViewingAssignment(a)} className="w-full py-2.5 mt-2 bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold rounded-xl transition-colors text-sm">
                  Review
                </button>
              </div>
            </div>
          )}
          )}
         </div>
      </div>
    );
  }

  // Drill down views: Year and Branch
  if (selectedYear) {
    const sections = Array.from(tree[selectedBranch][selectedYear]).sort();
    return (
      <div className="space-y-6 animate-hero-fade-up relative z-10" style={{ animationDuration: '400ms' }}>
         <div className="flex items-center gap-4">
            <button onClick={() => setSelectedYear(null)} className="flex items-center gap-2 bg-white border border-slate-200 text-slate-700 px-4 py-2.5 rounded-xl hover:bg-slate-50 active:scale-95 transition-all duration-200 shadow-sm font-bold text-sm">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
              Back
            </button>
            <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">{selectedBranch} \u2014 {selectedYear} Sections</h2>
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
      <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">Assignment Sections</h2>
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
const assignRegex = /export function AssignmentsView\(\) \{[\s\S]*?\n\}\n\n\nexport function ScheduleView/m;
content = content.replace(assignRegex, newCode + '\n\n\nexport function ScheduleView');
fs.writeFileSync('src/pages/Teacher/TeacherViews.jsx', content);
console.log('Successfully replaced AssignmentsView');
