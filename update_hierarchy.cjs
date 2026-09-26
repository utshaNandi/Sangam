const fs = require('fs');

let content = fs.readFileSync('src/pages/Teacher/TeacherViews.jsx', 'utf8');

// 1. Inject TreeHierarchy before StudentsView
if (!content.includes('export function TreeHierarchy')) {
  content = content.replace('export function StudentsView', `export function TreeHierarchy({ title, tree, branches, renderContent, expandedNodes, toggleNode }) {
  return (
    <div className="space-y-6 animate-hero-fade-up relative z-10 pb-10" style={{ animationDuration: '400ms' }}>
      <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">{title}</h2>
      
      <div className="bg-white rounded-[24px] border border-slate-100 p-6 sm:p-8 shadow-[0_2px_20px_rgba(0,0,0,0.02)]">
        <div className="space-y-3">
          {branches.map(br => (
            <div key={br} className="text-sm">
              <div 
                className="flex items-center gap-3 p-3 hover:bg-slate-50 rounded-xl cursor-pointer transition-colors group"
                onClick={() => toggleNode(br)}
              >
                <div className={\`text-slate-400 transition-transform duration-200 \${expandedNodes[br] ? 'rotate-90' : ''}\`}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                </div>
                <span className="font-extrabold text-slate-800 text-lg">{br}</span>
              </div>
              
              {expandedNodes[br] && (
                <div className="ml-5 mt-2 border-l-2 border-slate-100 pl-4 space-y-2 mb-2 animate-fade-in" style={{ animationDuration: '200ms' }}>
                  {Object.keys(tree[br]).sort().map(yr => {
                    const yearKey = \`\${br}-\${yr}\`;
                    return (
                      <div key={yr}>
                        <div 
                          className="flex items-center gap-3 p-2.5 hover:bg-slate-50 rounded-lg cursor-pointer transition-colors group"
                          onClick={() => toggleNode(yearKey)}
                        >
                          <div className={\`text-slate-300 transition-transform duration-200 \${expandedNodes[yearKey] ? 'rotate-90' : ''}\`}>
                             <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                          </div>
                          <span className="font-bold text-slate-700 text-base">{yr}</span>
                        </div>
                        
                        {expandedNodes[yearKey] && (
                          <div className="ml-6 mt-1 border-l-2 border-slate-100/50 pl-4 space-y-1 mb-2 animate-fade-in" style={{ animationDuration: '200ms' }}>
                            {Array.from(tree[br][yr]).sort().map(sec => {
                              const secKey = \`\${br}-\${yr}-\${sec}\`;
                              return (
                                <div key={sec}>
                                  <div 
                                    onClick={() => toggleNode(secKey)}
                                    className={\`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors group \${expandedNodes[secKey] ? 'bg-slate-50' : 'hover:bg-theme-bg/50'}\`}
                                  >
                                    <div className="w-3 border-b-2 border-slate-200 group-hover:border-theme-primary/40 transition-colors"></div>
                                    <div className={\`text-slate-300 transition-transform duration-200 \${expandedNodes[secKey] ? 'rotate-90' : ''}\`}>
                                       <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                                    </div>
                                    <span className="font-bold text-slate-600 group-hover:text-theme-primary transition-colors text-sm">{sec}</span>
                                  </div>
                                  
                                  {expandedNodes[secKey] && (
                                    <div className="ml-8 mt-2 border-l-2 border-slate-100/30 pl-4 py-2 space-y-2 mb-4 animate-fade-in" style={{ animationDuration: '200ms' }}>
                                      {renderContent(br, yr, sec)}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function StudentsView`);
}

// 2. Replace StudentsView
const studentsReplacement = `export function StudentsView() {
  const [expandedNodes, setExpandedNodes] = useState({});
  const toggleNode = (nodeId) => setExpandedNodes(prev => ({ ...prev, [nodeId]: !prev[nodeId] }));

  const renderContent = (br, yr, sec) => {
    const sectionStudents = get20Students(br, yr, sec);
    return (
      <div className="space-y-3">
        {sectionStudents.map((st, idx) => (
          <div key={st.id} className="flex items-center gap-4 p-3 rounded-xl border border-slate-50 bg-slate-50/50 hover:bg-slate-50 hover:border-slate-200 transition-colors">
            <span className="text-slate-400 font-bold w-6 text-right text-xs">{idx + 1}.</span>
            <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-500 font-bold flex items-center justify-center text-xs">
               {st.name.charAt(0)}
            </div>
            <span className="font-bold text-slate-900 text-sm">{st.name}</span>
          </div>
        ))}
      </div>
    );
  };

  return <TreeHierarchy title="Students" tree={tree} branches={branches} renderContent={renderContent} expandedNodes={expandedNodes} toggleNode={toggleNode} />;
}`;

content = content.replace(/export function StudentsView\(\) \{[\s\S]*?(?=export const getAssignmentsForSection =)/, studentsReplacement + '\n\n');


// 3. Replace AssignmentsView
const assignmentsOld = content.match(/export function AssignmentsView\(\) \{([\s\S]*?)(?=export function AttendanceView\(\))/)[1];
const assignmentsCreatingJSX = assignmentsOld.match(/if \(isCreating[\s\S]*?Cancel[\s\S]*?Publish Assignment[\s\S]*?<\/div>[\s\S]*?<\/div>[\s\S]*?\);[\s\S]*?}/)[0];

const assignmentsViewingJSX = assignmentsOld.slice(
  assignmentsOld.indexOf('if (viewingAssignment && selectedSection) {'),
  assignmentsOld.indexOf('if (isCreating && selectedSection)')
).replace('if (viewingAssignment && selectedSection)', 'if (viewingAssignment)');

const assignmentsReplacement = `export function AssignmentsView() {
  const [expandedNodes, setExpandedNodes] = useState({});
  const toggleNode = (nodeId) => setExpandedNodes(prev => ({ ...prev, [nodeId]: !prev[nodeId] }));

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

  ${assignmentsViewingJSX}

  // Adjust creating JSX slightly to use creationContext instead of selectedSection
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
    const currentSectionAssignments = [...getAssignmentsForSection(br, yr, sec), ...(createdAssignments[sectionKey] || [])];
    return (
      <div className="space-y-3">
        <button 
           onClick={() => { setCreationContext({br, yr, sec}); setIsCreating(true); }}
           className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-dashed border-slate-300 text-slate-500 font-bold text-sm hover:bg-slate-50 hover:text-theme-primary hover:border-theme-primary/30 transition-all active:scale-[0.98]"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          Create New Assignment
        </button>
        {currentSectionAssignments.length === 0 ? (
           <p className="text-slate-500 font-bold text-sm text-center py-4">No assignments available.</p>
        ) : (
           <div className="space-y-3">
             {currentSectionAssignments.map(a => (
               <div key={a.id} onClick={() => setViewingAssignment(a)} className="flex justify-between items-center bg-white rounded-xl border border-slate-100 p-4 shadow-sm hover:border-theme-primary/30 hover:shadow-md active:scale-[0.99] transition-all duration-300 cursor-pointer group">
                 <div>
                   <h3 className="font-bold text-slate-700 group-hover:text-theme-primary transition-colors text-sm">{a.title}</h3>
                   <p className="text-xs font-medium text-slate-500 mt-0.5">Due: {a.dueDate}</p>
                 </div>
                 <div className="flex items-center gap-3">
                   <span className="text-xs font-bold text-theme-primary px-3 py-1 bg-theme-primary/10 rounded-lg">View</span>
                   <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-300 group-hover:text-theme-primary transition-colors"><polyline points="9 18 15 12 9 6"></polyline></svg>
                 </div>
               </div>
             ))}
           </div>
        )}
      </div>
    );
  };

  return <TreeHierarchy title="Assignments" tree={tree} branches={branches} renderContent={renderContent} expandedNodes={expandedNodes} toggleNode={toggleNode} />;
}`;

content = content.replace(/export function AssignmentsView\(\) \{[\s\S]*?(?=export function AttendanceView\(\))/ , assignmentsReplacement + '\n\n');


// 4. Replace AttendanceView
const attendanceReplacement = `export function AttendanceView() {
  const [expandedNodes, setExpandedNodes] = useState({});
  const toggleNode = (nodeId) => setExpandedNodes(prev => ({ ...prev, [nodeId]: !prev[nodeId] }));

  const [attendanceState, setAttendanceState] = useState({});

  const handleMark = (id, status) => {
      setAttendanceState(prev => ({ ...prev, [id]: status }));
  };

  const renderContent = (br, yr, sec) => {
    const sectionStudents = get20Students(br, yr, sec);
    return (
      <div className="space-y-4">
         <div className="flex justify-between items-center bg-slate-50/80 p-3 rounded-xl border border-slate-100">
           <span className="text-sm font-bold text-slate-700 pl-2">Quick Actions</span>
           <div className="flex gap-2">
             <button 
               onClick={() => {
                 const newState = { ...attendanceState };
                 sectionStudents.forEach(s => newState[s.id] = 'Present');
                 setAttendanceState(newState);
               }}
               className="text-[11px] font-bold px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-lg hover:bg-emerald-100 transition-colors"
             >Mark All Present</button>
             <button 
               onClick={() => {
                 const newState = { ...attendanceState };
                 sectionStudents.forEach(s => newState[s.id] = 'Absent');
                 setAttendanceState(newState);
               }}
               className="text-[11px] font-bold px-3 py-1.5 bg-rose-50 text-rose-700 rounded-lg hover:bg-rose-100 transition-colors"
             >Mark All Absent</button>
           </div>
         </div>

         <div className="space-y-3">
           {sectionStudents.map((st, idx) => {
              const status = attendanceState[st.id] || 'Present';
              const isPresent = status === 'Present';
              return (
              <div key={st.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-3 rounded-xl border border-slate-50 bg-slate-50/50 hover:bg-white hover:shadow-sm hover:border-slate-200 transition-all">
                <div className="flex items-center gap-4">
                  <span className="text-slate-400 font-bold w-6 text-right text-xs">{idx + 1}.</span>
                  <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-600 font-bold flex items-center justify-center text-xs">
                     {st.name.charAt(0)}
                  </div>
                  <div>
                    <span className="font-bold text-slate-900 text-sm block">{st.name}</span>
                    <span className="text-[11px] font-medium text-slate-500">{st.roll}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 pl-14 sm:pl-0">
                  <button 
                    onClick={() => handleMark(st.id, 'Present')}
                    className={\`px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 \${isPresent ? 'bg-emerald-500 text-white shadow-sm shadow-emerald-500/20' : 'bg-white border border-slate-200 text-slate-500 hover:bg-slate-50'}\`}
                  >
                    Present
                  </button>
                  <button 
                    onClick={() => handleMark(st.id, 'Absent')}
                    className={\`px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 \${status === 'Absent' ? 'bg-rose-500 text-white shadow-sm shadow-rose-500/20' : 'bg-white border border-slate-200 text-slate-500 hover:bg-slate-50'}\`}
                  >
                    Absent
                  </button>
                </div>
              </div>
           )})}
         </div>
         <div className="flex justify-end pt-2">
            <button className="bg-theme-primary text-white px-6 py-2 rounded-xl hover:bg-theme-primary/90 active:scale-95 transition-all duration-200 shadow-md shadow-theme-primary/25 font-bold text-sm">
                Save Attendance
            </button>
         </div>
      </div>
    );
  };

  return <TreeHierarchy title="Attendance" tree={tree} branches={branches} renderContent={renderContent} expandedNodes={expandedNodes} toggleNode={toggleNode} />;
}`;

content = content.replace(/export function AttendanceView\(\) \{[\s\S]*?(?=export function GradesView\(\))/ , attendanceReplacement + '\n\n');

// 5. Replace GradesView
const gradesOld = content.match(/export function GradesView\(\) \{([\s\S]*?)(?=export function AnnouncementsView\(\))/)[1];
const gradesViewingJSX = gradesOld.slice(
  gradesOld.indexOf('if (selectedAssignment && selectedSection) {'), 
  gradesOld.indexOf('if (selectedSection) {')
).replace('if (selectedAssignment && selectedSection)', 'if (selectedAssignment)');

const gradesReplacement = `export function GradesView() {
  const [expandedNodes, setExpandedNodes] = useState({});
  const toggleNode = (nodeId) => setExpandedNodes(prev => ({ ...prev, [nodeId]: !prev[nodeId] }));

  const [selectedAssignment, setSelectedAssignment] = useState(null);
  
  const [marksData, setMarksData] = useState({});
  const [gradesData, setGradesData] = useState({});

  const handleMarksChange = (studentId, value) => {
    setMarksData(prev => ({...prev, [studentId]: value}));
  };

  const handleGradeChange = (studentId, value) => {
    setGradesData(prev => ({...prev, [studentId]: value}));
  };

  ${gradesViewingJSX}

  const renderContent = (br, yr, sec) => {
    const currentSectionAssignments = getAssignmentsForSection(br, yr, sec);
    return (
      <div className="space-y-3">
         {currentSectionAssignments.length === 0 ? (
           <p className="text-slate-500 font-bold text-sm text-center py-4">No assignments available for grading.</p>
         ) : (
           <div className="space-y-3">
             {currentSectionAssignments.map(a => (
               <div key={a.id} onClick={() => setSelectedAssignment({ ...a, br, yr, sec })} className="flex justify-between items-center bg-white rounded-xl border border-slate-100 p-4 shadow-sm hover:border-theme-primary/30 hover:shadow-md active:scale-[0.99] transition-all duration-300 cursor-pointer group">
                 <div>
                   <h3 className="font-bold text-slate-700 group-hover:text-theme-primary transition-colors text-sm">{a.title}</h3>
                   <p className="text-xs font-medium text-slate-500 mt-0.5">Due: {a.dueDate}</p>
                 </div>
                 <div className="flex items-center gap-3">
                   <span className="text-xs font-bold text-theme-primary px-3 py-1 bg-theme-primary/10 rounded-lg">Grade</span>
                   <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-300 group-hover:text-theme-primary transition-colors"><polyline points="9 18 15 12 9 6"></polyline></svg>
                 </div>
               </div>
             ))}
           </div>
         )}
      </div>
    );
  };

  return <TreeHierarchy title="Grades & Marks" tree={tree} branches={branches} renderContent={renderContent} expandedNodes={expandedNodes} toggleNode={toggleNode} />;
}`;

content = content.replace(/export function GradesView\(\) \{[\s\S]*?(?=export function AnnouncementsView\(\))/ , gradesReplacement + '\n\n');

fs.writeFileSync('src/pages/Teacher/TeacherViews.jsx', content);
console.log('Successfully updated all views to TreeHierarchy.');
