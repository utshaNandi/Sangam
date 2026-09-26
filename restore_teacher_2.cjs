const fs = require('fs');
let content = fs.readFileSync('src/pages/Teacher/TeacherViews.jsx', 'utf8');

const regex = /export function StudentsView\(\) \{[\s\S]*?(?=export function GradesView\(\) \{)/;

const replacement = `export function StudentsView() {
  const [expandedNodes, setExpandedNodes] = useState({});
  const toggleNode = (nodeId) => setExpandedNodes(prev => {
    const isExpanding = !prev[nodeId];
    const newState = { ...prev };
    if (isExpanding) {
      const level = (nodeId.match(/-/g) || []).length;
      const parts = nodeId.split('-');
      const parentPrefix = parts.slice(0, -1).join('-');
      Object.keys(newState).forEach(key => {
        if (key !== nodeId && (key.match(/-/g) || []).length === level) {
          const keyParts = key.split('-');
          const keyParentPrefix = keyParts.slice(0, -1).join('-');
          if (level === 0 || keyParentPrefix === parentPrefix) {
             newState[key] = false;
             Object.keys(newState).forEach(k => {
               if (k.startsWith(key + '-')) newState[k] = false;
             });
          }
        }
      });
    } else {
      Object.keys(newState).forEach(k => {
         if (k.startsWith(nodeId + '-')) newState[k] = false;
      });
    }
    newState[nodeId] = isExpanding;
    return newState;
  });

  const renderContent = (br, yr, sec) => {
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
  };

  return <TreeHierarchy title="Students" tree={tree} branches={branches} renderContent={renderContent} expandedNodes={expandedNodes} toggleNode={toggleNode} />;
}

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
            className: \`\${year} • \${branch} • \${section}\`,
            dueDate: \`Oct \${10 + (seed + i) % 20}\`,
            total: 20, // Always 20 as requested
            status: 'Active'
        });
    }
    return sectionAssignments;
};

export function AssignmentsView() {
  const [expandedNodes, setExpandedNodes] = useState({});
  const toggleNode = (nodeId) => setExpandedNodes(prev => {
    const isExpanding = !prev[nodeId];
    const newState = { ...prev };
    if (isExpanding) {
      const level = (nodeId.match(/-/g) || []).length;
      const parts = nodeId.split('-');
      const parentPrefix = parts.slice(0, -1).join('-');
      Object.keys(newState).forEach(key => {
        if (key !== nodeId && (key.match(/-/g) || []).length === level) {
          const keyParts = key.split('-');
          const keyParentPrefix = keyParts.slice(0, -1).join('-');
          if (level === 0 || keyParentPrefix === parentPrefix) {
             newState[key] = false;
             Object.keys(newState).forEach(k => {
               if (k.startsWith(key + '-')) newState[k] = false;
             });
          }
        }
      });
    } else {
      Object.keys(newState).forEach(k => {
         if (k.startsWith(nodeId + '-')) newState[k] = false;
      });
    }
    newState[nodeId] = isExpanding;
    return newState;
  });

  const [createdAssignments, setCreatedAssignments] = useState({});
  const [isCreating, setIsCreating] = useState(false);
  const [viewingAssignment, setViewingAssignment] = useState(null);
  
  const [creationContext, setCreationContext] = useState(null);

  const [newAssignment, setNewAssignment] = useState({
    title: '',
    dueDate: '',
    pdf: null
  });

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setNewAssignment({...newAssignment, pdf: e.target.files[0]});
    }
  };

  const handleCreateAssignment = (e) => {
    e.preventDefault();
    if (newAssignment.title && newAssignment.dueDate && creationContext) {
      const sectionKey = \`\${creationContext.br}-\${creationContext.yr}-\${creationContext.sec}\`;
      const newAsg = {
        id: \`created-\${Date.now()}\`,
        title: newAssignment.title,
        dueDate: newAssignment.dueDate,
        className: \`\${creationContext.yr} • \${creationContext.br} • \${creationContext.sec}\`,
        status: 'Active',
        total: 20
      };
      
      setCreatedAssignments(prev => ({
        ...prev,
        [sectionKey]: [...(prev[sectionKey] || []), newAsg]
      }));
      
      setIsCreating(false);
      setNewAssignment({ title: '', dueDate: '', pdf: null });
      setCreationContext(null);
    }
  };

  if (viewingAssignment) {
    const assignmentStudents = get20Students(viewingAssignment.br, viewingAssignment.yr, viewingAssignment.sec);
    const notSubmittedStudents = assignmentStudents.filter((st) => {
      // deterministic mock: 50% submitted based on ID
      const seedStr = viewingAssignment.id + st.id;
      let seed = 0;
      for(let i=0; i<seedStr.length; i++) seed += seedStr.charCodeAt(i);
      return seed % 2 === 0;
    });

    return (
      <div className="space-y-6 animate-hero-fade-up relative z-10" style={{ animationDuration: '400ms' }}>
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-4">
            <button onClick={() => setViewingAssignment(null)} className="flex items-center gap-2 bg-white border border-slate-200 text-slate-700 px-4 py-2.5 rounded-xl hover:bg-slate-50 active:scale-95 transition-all duration-200 shadow-sm font-bold text-sm">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
              Back
            </button>
            <div>
              <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">{viewingAssignment.title}</h2>
              <p className="text-sm font-medium text-slate-500 mt-1">{viewingAssignment.className} • Due: {viewingAssignment.dueDate}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-[24px] border border-slate-100 p-6 shadow-[0_2px_20px_rgba(0,0,0,0.02)] mt-6">
          <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
            <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
            Submissions ({assignmentStudents.length - notSubmittedStudents.length})
          </h3>
          <div className="space-y-3">
            {assignmentStudents.map(student => {
              const seedStr = viewingAssignment.id + student.id;
              let seed = 0;
              for(let i=0; i<seedStr.length; i++) seed += seedStr.charCodeAt(i);
              const hasSubmitted = seed % 2 !== 0;

              return (
                <div key={student.id} className="flex items-center justify-between p-4 rounded-xl border border-slate-50 bg-slate-50/50">
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

  if (isCreating && creationContext) {
    const selectedSection = creationContext.sec;
    return (
      <div className="space-y-6 animate-hero-fade-up relative z-10" style={{ animationDuration: '400ms' }}>
        <div className="flex justify-between items-center">
          <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">Create Assignment for {selectedSection}</h2>
          <button onClick={() => { setIsCreating(false); setCreationContext(null); }} className="flex items-center gap-2 bg-white border border-slate-200 text-slate-700 px-5 py-2.5 rounded-xl hover:bg-slate-50 active:scale-95 transition-all duration-200 shadow-sm font-bold text-sm">
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

  const renderContent = (br, yr, sec) => {
    const sectionKey = \`\${br}-\${yr}-\${sec}\`;
    const currentSectionAssignments = [
       ...getAssignmentsForSection(br, yr, sec), 
       ...(createdAssignments[sectionKey] || [])
    ];
    return (
      <div className="space-y-4">
         <div className="flex justify-end mb-2">
            <button 
              onClick={() => { setIsCreating(true); setCreationContext({br, yr, sec}); }}
              className="flex items-center gap-2 bg-white border border-slate-200 text-slate-700 px-3 py-1.5 rounded-lg hover:bg-slate-50 active:scale-95 transition-all shadow-sm font-bold text-xs"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
              Create Assignment
            </button>
         </div>
         {currentSectionAssignments.length === 0 ? (
           <p className="text-slate-500 font-bold text-sm text-center py-4">No assignments available.</p>
         ) : (
           <div className="space-y-3">
             {currentSectionAssignments.map(a => (
               <div key={a.id} onClick={() => setViewingAssignment({ ...a, br, yr, sec })} className="flex items-center justify-between p-4 rounded-xl border border-slate-50 bg-slate-50/50 hover:bg-white hover:shadow-sm hover:border-slate-200 cursor-pointer group transition-all">
                  <div>
                    <h4 className="font-bold text-slate-900 group-hover:text-theme-primary transition-colors">{a.title}</h4>
                    <p className="text-xs font-medium text-slate-500 mt-1">Due: {a.dueDate} • Total Marks: {a.total}</p>
                  </div>
                  <div className="flex items-center gap-3">
                     <span className={\`px-3 py-1 rounded-lg text-xs font-bold \${a.status === 'Active' ? 'bg-green-50 text-green-600' : 'bg-slate-100 text-slate-500'}\`}>{a.status}</span>
                     <svg className="w-5 h-5 text-slate-300 group-hover:text-theme-primary transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path></svg>
                  </div>
               </div>
             ))}
           </div>
         )}
      </div>
    );
  };

  return <TreeHierarchy title="Assignments" tree={tree} branches={branches} renderContent={renderContent} expandedNodes={expandedNodes} toggleNode={toggleNode} />;
}

export function AttendanceView() {
  const [expandedNodes, setExpandedNodes] = useState({});
  const toggleNode = (nodeId) => setExpandedNodes(prev => {
    const isExpanding = !prev[nodeId];
    const newState = { ...prev };
    if (isExpanding) {
      const level = (nodeId.match(/-/g) || []).length;
      const parts = nodeId.split('-');
      const parentPrefix = parts.slice(0, -1).join('-');
      Object.keys(newState).forEach(key => {
        if (key !== nodeId && (key.match(/-/g) || []).length === level) {
          const keyParts = key.split('-');
          const keyParentPrefix = keyParts.slice(0, -1).join('-');
          if (level === 0 || keyParentPrefix === parentPrefix) {
             newState[key] = false;
             Object.keys(newState).forEach(k => {
               if (k.startsWith(key + '-')) newState[k] = false;
             });
          }
        }
      });
    } else {
      Object.keys(newState).forEach(k => {
         if (k.startsWith(nodeId + '-')) newState[k] = false;
      });
    }
    newState[nodeId] = isExpanding;
    return newState;
  });

  const [attendanceData, setAttendanceData] = useState({});
  
  const handleMarkAll = (br, yr, sec, status) => {
    const students = get20Students(br, yr, sec);
    setAttendanceData(prev => {
      const next = { ...prev };
      students.forEach(st => {
         next[st.id] = status;
      });
      return next;
    });
  };

  const toggleStudentAttendance = (studentId) => {
    setAttendanceData(prev => ({
      ...prev,
      [studentId]: prev[studentId] === 'Present' ? 'Absent' : 'Present'
    }));
  };

  const renderContent = (br, yr, sec) => {
    const sectionStudents = get20Students(br, yr, sec);
    return (
      <div className="space-y-4">
        <div className="flex justify-end gap-3 mb-2">
          <button onClick={() => handleMarkAll(br, yr, sec, 'Present')} className="text-xs font-bold text-green-600 bg-green-50 px-3 py-1.5 rounded-lg hover:bg-green-100 transition-colors border border-green-100/50">Mark All Present</button>
          <button onClick={() => handleMarkAll(br, yr, sec, 'Absent')} className="text-xs font-bold text-red-600 bg-red-50 px-3 py-1.5 rounded-lg hover:bg-red-100 transition-colors border border-red-100/50">Mark All Absent</button>
        </div>
        <div className="space-y-3">
          {sectionStudents.map((st, idx) => {
             const status = attendanceData[st.id] || 'Present';
             return (
               <div key={st.id} className="flex items-center justify-between p-3 rounded-xl border border-slate-50 bg-slate-50/50 hover:bg-white hover:border-slate-200 transition-colors">
                 <div className="flex items-center gap-4">
                   <span className="text-slate-400 font-bold w-6 text-right text-xs">{idx + 1}.</span>
                   <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-500 font-bold flex items-center justify-center text-xs">
                     {st.name.charAt(0)}
                   </div>
                   <span className="font-bold text-slate-900 text-sm">{st.name}</span>
                 </div>
                 <button onClick={() => toggleStudentAttendance(st.id)} className={\`px-4 py-1.5 rounded-lg text-xs font-bold transition-all border \${status === 'Present' ? 'bg-green-50 text-green-600 border-green-100' : 'bg-red-50 text-red-600 border-red-100'}\`}>
                   {status}
                 </button>
               </div>
             );
          })}
        </div>
      </div>
    );
  };

  return <TreeHierarchy title="Attendance" tree={tree} branches={branches} renderContent={renderContent} expandedNodes={expandedNodes} toggleNode={toggleNode} />;
}
`;

content = content.replace(regex, replacement);
fs.writeFileSync('src/pages/Teacher/TeacherViews.jsx', content);
console.log("Restored all 3 sections");
