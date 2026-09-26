const fs = require('fs');
let content = fs.readFileSync('src/pages/Teacher/TeacherViews.jsx', 'utf8');

const newStudentsView = `export function StudentsView() {
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
    return (
      <div className="space-y-3 mt-2">
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
    );
  };

  return <TreeHierarchy title="Students" tree={tree} branches={branches} renderContent={renderContent} expandedNodes={expandedNodes} toggleNode={toggleNode} />;
}`;

const newAttendanceView = `export function AttendanceView() {
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
}`;

const svStart = content.indexOf('export function StudentsView');
const svEnd = content.indexOf('export function AssignmentsView');
if (svStart !== -1 && svEnd !== -1) {
  content = content.slice(0, svStart) + newStudentsView + '\n\n' + content.slice(svEnd);
}

const avStart = content.indexOf('export function AttendanceView');
const avEnd = content.indexOf('export function GradesView');
if (avStart !== -1 && avEnd !== -1) {
  content = content.slice(0, avStart) + newAttendanceView + '\n\n' + content.slice(avEnd);
}

fs.writeFileSync('src/pages/Teacher/TeacherViews.jsx', content);
console.log('Restored StudentsView and AttendanceView');
