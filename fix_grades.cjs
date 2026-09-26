const fs = require('fs');
let content = fs.readFileSync('src/pages/Teacher/TeacherViews.jsx', 'utf8');

const regex = /export function GradesView\(\) \{[\s\S]*?(?=export function AnnouncementsView\(\))/;

const newGradesView = `export function GradesView() {
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

  const [marksData, setMarksData] = useState({});
  const [gradesData, setGradesData] = useState({});

  const handleMarksChange = (studentId, value) => {
    setMarksData(prev => ({...prev, [studentId]: value}));
  };

  const handleGradeChange = (studentId, value) => {
    setGradesData(prev => ({...prev, [studentId]: value}));
  };

  const renderContent = (br, yr, sec) => {
    const assignmentStudents = get20Students(br, yr, sec);
    
    return (
      <div className="space-y-4">
         <div className="hidden sm:grid grid-cols-12 gap-4 px-4 py-2 text-xs font-bold text-slate-400 uppercase tracking-wider">
            <div className="col-span-6">Student</div>
            <div className="col-span-3 text-center">Marks</div>
            <div className="col-span-3 text-center">Grade</div>
         </div>

         <div className="space-y-3">
           {assignmentStudents.map((st, idx) => {
              const mark = marksData[st.id] || '';
              const grade = gradesData[st.id] || '';
              
              return (
              <div key={st.id} className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-center p-3 rounded-xl border border-slate-50 bg-slate-50/50 hover:bg-white hover:shadow-sm hover:border-slate-200 transition-all">
                <div className="col-span-6 flex items-center gap-3">
                  <span className="text-slate-400 font-bold w-6 text-right hidden sm:block text-xs">{idx + 1}.</span>
                  <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-600 font-bold flex items-center justify-center text-xs flex-shrink-0">
                     {st.name.charAt(0)}
                  </div>
                  <div>
                    <span className="font-bold text-slate-900 block truncate text-sm">{st.name}</span>
                    <span className="text-[11px] font-medium text-slate-500">{st.roll}</span>
                  </div>
                </div>
                <div className="col-span-3 flex justify-start sm:justify-center">
                   <input 
                      type="text" 
                      placeholder="--" 
                      value={mark}
                      onChange={(e) => handleMarksChange(st.id, e.target.value)}
                      className="w-16 bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-center font-bold text-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-theme-primary/20 focus:border-theme-primary transition-all"
                   />
                </div>
                <div className="col-span-3 flex justify-start sm:justify-center">
                   <select 
                      value={grade}
                      onChange={(e) => handleGradeChange(st.id, e.target.value)}
                      className="w-20 bg-white border border-slate-200 rounded-lg px-2 py-1.5 font-bold text-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-theme-primary/20 focus:border-theme-primary transition-all"
                   >
                     <option value="">--</option>
                     <option value="A+">A+</option>
                     <option value="A">A</option>
                     <option value="B+">B+</option>
                     <option value="B">B</option>
                     <option value="C">C</option>
                     <option value="F">F</option>
                   </select>
                </div>
              </div>
           )})}
         </div>
         <div className="flex justify-end pt-2">
            <button className="bg-theme-primary text-white px-6 py-2 rounded-xl hover:bg-theme-primary/90 active:scale-95 transition-all duration-200 shadow-md shadow-theme-primary/25 font-bold text-sm">
                Save Grades
            </button>
         </div>
      </div>
    );
  };

  return <TreeHierarchy title="Grades & Marks" tree={tree} branches={branches} renderContent={renderContent} expandedNodes={expandedNodes} toggleNode={toggleNode} />;
}

`;

content = content.replace(regex, newGradesView);
fs.writeFileSync('src/pages/Teacher/TeacherViews.jsx', content);
console.log('Fixed GradesView');
