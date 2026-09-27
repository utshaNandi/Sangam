import { useState } from 'react';
import { classes, students, assignments, announcements, teacherProfile } from './mockData';
import { Icons } from './Icons';

export const scheduleData = {
    Monday: [
      { period: 1, time: "9:30 AM - 10:15 AM", subject: "Data Structures", type: "Lecture", classInfo: "2nd Year • CSE • Section A" },
      { period: 2, time: "10:15 AM - 11:00 AM", subject: "Algorithms", type: "Lecture", classInfo: "2nd Year • CSE • Section C" },
      { period: 3, time: "11:00 AM - 11:45 AM", subject: "Artificial Intelligence", type: "Lab", classInfo: "3rd Year • CSE • Section A" },
      { period: 4, time: "11:45 AM - 12:30 PM", subject: "Artificial Intelligence", type: "Lab", classInfo: "3rd Year • CSE • Section A" },
      { period: 5, time: "12:30 PM - 1:15 PM", subject: "Lunch Break", type: "Break" },
      { period: 6, time: "1:15 PM - 2:00 PM", subject: "Database Systems", type: "Lecture", classInfo: "3rd Year • IT • Section B" },
      { period: 7, time: "2:00 PM - 2:45 PM", subject: "Computer Networks", type: "Lecture", classInfo: "2nd Year • IT • Section A" },
      { period: 8, time: "2:45 PM - 3:30 PM", subject: "Operating Systems", type: "Tutorial", classInfo: "2nd Year • IT • Section A" },
      { period: 9, time: "3:30 PM - 4:15 PM", subject: "Project Work", type: "Lab", classInfo: "4th Year • CSE • Section B" }
    ],
    Tuesday: [
      { period: 1, time: "9:30 AM - 10:15 AM", subject: "Software Engineering", type: "Lecture", classInfo: "3rd Year • CSE • Section B" },
      { period: 2, time: "10:15 AM - 11:00 AM", subject: "Machine Learning", type: "Lecture", classInfo: "4th Year • CSE • Section A" },
      { period: 3, time: "11:00 AM - 11:45 AM", subject: "Computer Networks", type: "Lab", classInfo: "2nd Year • ECE • Section C" },
      { period: 4, time: "11:45 AM - 12:30 PM", subject: "Computer Networks", type: "Lab", classInfo: "2nd Year • ECE • Section C" },
      { period: 5, time: "12:30 PM - 1:15 PM", subject: "Lunch Break", type: "Break" },
      { period: 6, time: "1:15 PM - 2:00 PM", subject: "Theory of Computation", type: "Lecture", classInfo: "2nd Year • CSE • Section A" },
      { period: 7, time: "2:00 PM - 2:45 PM", subject: "Database Systems", type: "Tutorial", classInfo: "3rd Year • IT • Section B" },
      { period: 8, time: "2:45 PM - 3:30 PM", subject: "Algorithms", type: "Lecture", classInfo: "2nd Year • CSE • Section C" },
      { period: 9, time: "3:30 PM - 4:15 PM", subject: "Library / Self Study", type: "Self Study" }
    ],
    Wednesday: [
      { period: 1, time: "9:30 AM - 10:15 AM", subject: "Operating Systems", type: "Lecture", classInfo: "2nd Year • IT • Section A" },
      { period: 2, time: "10:15 AM - 11:00 AM", subject: "Data Structures", type: "Tutorial", classInfo: "2nd Year • CSE • Section A" },
      { period: 3, time: "11:00 AM - 11:45 AM", subject: "Web Development", type: "Lecture", classInfo: "3rd Year • IT • Section A" },
      { period: 4, time: "11:45 AM - 12:30 PM", subject: "Web Development", type: "Lab", classInfo: "3rd Year • IT • Section A" },
      { period: 5, time: "12:30 PM - 1:15 PM", subject: "Lunch Break", type: "Break" },
      { period: 6, time: "1:15 PM - 2:00 PM", subject: "Artificial Intelligence", type: "Lecture", classInfo: "3rd Year • CSE • Section A" },
      { period: 7, time: "2:00 PM - 2:45 PM", subject: "Machine Learning", type: "Lab", classInfo: "4th Year • CSE • Section A" },
      { period: 8, time: "2:45 PM - 3:30 PM", subject: "Machine Learning", type: "Lab", classInfo: "4th Year • CSE • Section A" },
      { period: 9, time: "3:30 PM - 4:15 PM", subject: "Mentoring Session", type: "Tutorial", classInfo: "All Years • CSE" }
    ],
    Thursday: [
      { period: 1, time: "9:30 AM - 10:15 AM", subject: "Theory of Computation", type: "Lecture", classInfo: "2nd Year • CSE • Section B" },
      { period: 2, time: "10:15 AM - 11:00 AM", subject: "Software Engineering", type: "Tutorial", classInfo: "3rd Year • CSE • Section B" },
      { period: 3, time: "11:00 AM - 11:45 AM", subject: "Database Systems", type: "Lab", classInfo: "3rd Year • IT • Section B" },
      { period: 4, time: "11:45 AM - 12:30 PM", subject: "Database Systems", type: "Lab", classInfo: "3rd Year • IT • Section B" },
      { period: 5, time: "12:30 PM - 1:15 PM", subject: "Lunch Break", type: "Break" },
      { period: 6, time: "1:15 PM - 2:00 PM", subject: "Algorithms", type: "Lecture", classInfo: "2nd Year • CSE • Section A" },
      { period: 7, time: "2:00 PM - 2:45 PM", subject: "Operating Systems", type: "Lab", classInfo: "2nd Year • IT • Section A" },
      { period: 8, time: "2:45 PM - 3:30 PM", subject: "Operating Systems", type: "Lab", classInfo: "2nd Year • IT • Section A" },
      { period: 9, time: "3:30 PM - 4:15 PM", subject: "Seminar", type: "Lecture", classInfo: "4th Year • CSE • Section B" }
    ],
    Friday: [
      { period: 1, time: "9:30 AM - 10:15 AM", subject: "Web Development", type: "Lecture", classInfo: "3rd Year • CSE • Section C" },
      { period: 2, time: "10:15 AM - 11:00 AM", subject: "Computer Networks", type: "Lecture", classInfo: "2nd Year • IT • Section B" },
      { period: 3, time: "11:00 AM - 11:45 AM", subject: "Data Structures", type: "Lab", classInfo: "2nd Year • CSE • Section A" },
      { period: 4, time: "11:45 AM - 12:30 PM", subject: "Data Structures", type: "Lab", classInfo: "2nd Year • CSE • Section A" },
      { period: 5, time: "12:30 PM - 1:15 PM", subject: "Lunch Break", type: "Break" },
      { period: 6, time: "1:15 PM - 2:00 PM", subject: "Machine Learning", type: "Lecture", classInfo: "4th Year • CSE • Section B" },
      { period: 7, time: "2:00 PM - 2:45 PM", subject: "Project Work", type: "Lab", classInfo: "4th Year • IT • Section A" },
      { period: 8, time: "2:45 PM - 3:30 PM", subject: "Project Work", type: "Lab", classInfo: "4th Year • IT • Section A" },
      { period: 9, time: "3:30 PM - 4:15 PM", subject: "Extra Curricular", type: "Break" }
    ],
    Saturday: [
      { period: 1, time: "9:30 AM - 10:15 AM", subject: "Cloud Computing", type: "Lecture", classInfo: "4th Year • CSE • Section A" },
      { period: 2, time: "10:15 AM - 11:00 AM", subject: "Cyber Security", type: "Lecture", classInfo: "3rd Year • IT • Section A" },
      { period: 3, time: "11:00 AM - 11:45 AM", subject: "Cyber Security", type: "Lab", classInfo: "3rd Year • IT • Section A" },
      { period: 4, time: "11:45 AM - 12:30 PM", subject: "Cyber Security", type: "Lab", classInfo: "3rd Year • IT • Section A" },
      { period: 5, time: "12:30 PM - 1:15 PM", subject: "Lunch Break", type: "Break" },
      { period: 6, time: "1:15 PM - 2:00 PM", subject: "Cloud Computing", type: "Lab", classInfo: "4th Year • CSE • Section A" },
      { period: 7, time: "2:00 PM - 2:45 PM", subject: "Cloud Computing", type: "Lab", classInfo: "4th Year • CSE • Section A" },
      { period: 8, time: "2:45 PM - 3:30 PM", subject: "Tech Club / Hackathon", type: "Lab", classInfo: "All Years • Tech" },
      { period: 9, time: "3:30 PM - 4:15 PM", subject: "Tech Club / Hackathon", type: "Lab", classInfo: "All Years • Tech" }
    ]
  };


export const tree = {};
Object.values(scheduleData).flat().forEach(period => {
  if (period.classInfo) {
    const parts = period.classInfo.split(/ \u2022 | - /); 
    if (parts.length >= 3) {
      const year = parts[0].trim();
      const branch = parts[1].trim();
      const section = parts[2].trim().replace('Section ', 'Section ');
      if (!tree[branch]) tree[branch] = {};
      if (!tree[branch][year]) tree[branch][year] = new Set();
      tree[branch][year].add(section);
    }
  }
});
export const branches = Object.keys(tree).sort();

export const get20Students = (branch, year, section) => {
  const firstNames = ["Aarav", "Ananya", "Arjun", "Aditya", "Anika", "Rohan", "Riya", "Karan", "Ishita", "Rahul", "Aditi", "Yash", "Neha", "Aryan", "Priya", "Kabir", "Sneha", "Dev", "Meera", "Vivaan", "Vikram", "Siddharth", "Tara", "Rishabh", "Nisha", "Ravi", "Pooja", "Amit", "Sonal", "Kunal"];
  const lastNames = ["Sharma", "Singh", "Mehta", "Verma", "Gupta", "Patel", "Reddy", "Joshi", "Kapoor", "Chopra"];
  
  const seedStr = branch + year + section;
  let seed = 0;
  for(let i = 0; i < seedStr.length; i++) seed += seedStr.charCodeAt(i);
  
  const sectionStudents = [];
  for(let i=0; i<20; i++) {
    const fn = firstNames[(seed + i * 7) % firstNames.length];
    const ln = lastNames[(seed + i * 3) % lastNames.length];
    sectionStudents.push({ 
       id: `${branch}-${year}-${section}-${i}`.replace(/\s/g, ''), 
       name: fn + ' ' + ln,
       roll: `${branch.substring(0,2).toUpperCase()}${20 + i}`
    });
  }
  return sectionStudents;
};




export function ClassesView() {
  const daysMap = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const currentDayName = daysMap[new Date().getDay()].toLowerCase();
  
  let todaysSchedule = [];
  for (const [dayKey, periods] of Object.entries(scheduleData)) {
    if (dayKey.toLowerCase().trim() === currentDayName) {
      todaysSchedule = periods;
      break;
    }
  }
  
  const myClasses = todaysSchedule.map(period => {
    return {
      id: period.period,
      subject: period.subject,
      section: period.classInfo ? period.classInfo : period.type,
      semester: currentDayName.charAt(0).toUpperCase() + currentDayName.slice(1),
      studentsCount: period.type === 'Break' ? 0 : 20,
      room: period.type === 'Break' ? 'Cafeteria' : (period.type === 'Lab' ? 'Computer Lab' : 'Lecture Hall'),
      time: period.time
    };
  });

  return (
    <div className="space-y-6 animate-hero-fade-up relative z-10" style={{ animationDuration: '400ms' }}>
      <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">My Classes</h2>
      
      {myClasses.length === 0 ? (
        <div className="bg-white rounded-[24px] border border-slate-100 p-10 text-center shadow-[0_2px_20px_rgba(0,0,0,0.02)]">
           <p className="text-lg font-bold text-slate-500">No classes scheduled for today</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {myClasses.map(c => (
            <div key={c.id} className="bg-white rounded-[24px] border border-slate-100 p-6 shadow-[0_2px_20px_rgba(0,0,0,0.02)] hover:shadow-[0_8px_30px_rgba(0,0,0,0.06)] hover:-translate-y-1 active:scale-[0.98] transition-all duration-300 cursor-pointer group">
              <div className="flex justify-between items-start mb-5">
                <div>
                  <h3 className="text-xl font-bold text-slate-900 group-hover:text-theme-primary transition-colors">{c.subject}</h3>
                  <p className="text-sm font-medium text-slate-500 mt-1">{c.section} • {c.semester}</p>
                </div>
                <div className="w-12 h-12 rounded-2xl bg-theme-bg text-theme-primary flex items-center justify-center transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3">
                  <Icons.Classes />
                </div>
              </div>
              <div className="space-y-3 text-sm text-slate-500 font-medium">
                <div className="flex justify-between items-center py-2 border-b border-slate-50"><span>Students:</span> <span className="font-bold text-slate-900 bg-slate-50 px-2 py-0.5 rounded-lg">{c.studentsCount}</span></div>
                <div className="flex justify-between items-center py-2 border-b border-slate-50"><span>Room:</span> <span className="font-bold text-slate-900 group-hover:text-slate-600 transition-colors">{c.room}</span></div>
                <div className="flex justify-between items-center py-2"><span>Time:</span> <span className="font-bold text-theme-primary">{c.time}</span></div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function TreeHierarchy({ title, tree, branches, renderContent, expandedNodes, toggleNode }) {
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
                <div className={`text-slate-400 transition-transform duration-200 ${expandedNodes[br] ? 'rotate-90' : ''}`}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                </div>
                <span className="font-extrabold text-slate-800 text-lg">{br}</span>
              </div>
              
              {expandedNodes[br] && (
                <div className="ml-5 mt-2 border-l-2 border-slate-100 pl-4 space-y-2 mb-2 animate-fade-in" style={{ animationDuration: '200ms' }}>
                  {Object.keys(tree[br]).sort().map(yr => {
                    const yearKey = `${br}-${yr}`;
                    return (
                      <div key={yr}>
                        <div 
                          className="flex items-center gap-3 p-2.5 hover:bg-slate-50 rounded-lg cursor-pointer transition-colors group"
                          onClick={() => toggleNode(yearKey)}
                        >
                          <div className={`text-slate-300 transition-transform duration-200 ${expandedNodes[yearKey] ? 'rotate-90' : ''}`}>
                             <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                          </div>
                          <span className="font-bold text-slate-700 text-base">{yr}</span>
                        </div>
                        
                        {expandedNodes[yearKey] && (
                          <div className="ml-6 mt-1 border-l-2 border-slate-100/50 pl-4 space-y-1 mb-2 animate-fade-in" style={{ animationDuration: '200ms' }}>
                            {Array.from(tree[br][yr]).sort().map(sec => {
                              const secKey = `${br}-${yr}-${sec}`;
                              return (
                                <div key={sec}>
                                  <div 
                                    onClick={() => toggleNode(secKey)}
                                    className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors group ${expandedNodes[secKey] ? 'bg-slate-50' : 'hover:bg-theme-bg/50'}`}
                                  >
                                    <div className="w-3 border-b-2 border-slate-200 group-hover:border-theme-primary/40 transition-colors"></div>
                                    <div className={`text-slate-300 transition-transform duration-200 ${expandedNodes[secKey] ? 'rotate-90' : ''}`}>
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

export function StudentsView() {
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
            id: `a-${seed}-${i}`,
            title: `${subj} Assignment ${i+1}`,
            className: `${year} • ${branch} • ${section}`,
            dueDate: `Oct ${10 + (seed + i) % 20}`,
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
      const sectionKey = `${creationContext.br}-${creationContext.yr}-${creationContext.sec}`;
      const newAsg = {
        id: `created-${Date.now()}`,
        title: newAssignment.title,
        dueDate: newAssignment.dueDate,
        className: `${creationContext.yr} • ${creationContext.br} • ${creationContext.sec}`,
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
              <div key={`pending-${student.id}`} className="flex items-center justify-between p-4 rounded-xl border border-red-50 bg-red-50/30">
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
    const sectionKey = `${br}-${yr}-${sec}`;
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
                     <span className={`px-3 py-1 rounded-lg text-xs font-bold ${a.status === 'Active' ? 'bg-green-50 text-green-600' : 'bg-slate-100 text-slate-500'}`}>{a.status}</span>
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
                 <button onClick={() => toggleStudentAttendance(st.id)} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all border ${status === 'Present' ? 'bg-green-50 text-green-600 border-green-100' : 'bg-red-50 text-red-600 border-red-100'}`}>
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

export function GradesView() {
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

export function AnnouncementsView() {
  return (
    <div className="space-y-6 animate-hero-fade-up relative z-10" style={{ animationDuration: '400ms' }}>
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">Announcements</h2>
        <button className="flex items-center gap-2 bg-theme-primary text-white px-5 py-2.5 rounded-xl hover:opacity-90 active:scale-95 transition-all duration-200 shadow-sm font-bold text-sm">
          <Icons.Plus /> Post Announcement
        </button>
      </div>
      <div className="grid gap-4">
        {announcements.map(a => (
          <div key={a.id} className="bg-white rounded-[24px] border border-slate-100 p-6 shadow-[0_2px_20px_rgba(0,0,0,0.02)] hover:border-theme-primary/30 hover:shadow-[0_4px_20px_rgba(0,0,0,0.04)] hover:-translate-y-0.5 active:scale-[0.99] transition-all duration-300 group cursor-pointer">
             <div className="flex justify-between items-start mb-3">
                <h3 className="font-bold text-slate-900 text-lg group-hover:text-theme-primary transition-colors">{a.title}</h3>
                <span className="text-[11px] font-bold text-slate-500 bg-slate-50 px-2.5 py-1 rounded-lg uppercase tracking-wider transition-colors group-hover:bg-theme-bg group-hover:text-theme-primary">{a.date}</span>
             </div>
             <p className="text-sm text-slate-600 mb-4 leading-relaxed font-medium group-hover:text-slate-700 transition-colors">{a.content}</p>
             <span className="text-xs font-bold text-theme-primary bg-theme-bg px-3 py-1 rounded-lg transition-transform duration-300 inline-block group-hover:scale-105">Class: {classes.find(c => c.id === a.classId)?.subject || 'All Classes'}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ScheduleView() {
  const [selectedDay, setSelectedDay] = useState(null);

  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  
  if (selectedDay) {
    return (
      <div className="space-y-6 animate-hero-fade-up relative z-10 pb-10" style={{ animationDuration: '400ms' }}>
        <div className="flex items-center gap-4">
          <button onClick={() => setSelectedDay(null)} className="flex items-center gap-2 bg-white border border-slate-200 text-slate-700 px-4 py-2.5 rounded-xl hover:bg-slate-50 active:scale-95 transition-all duration-200 shadow-sm font-bold text-sm">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
            Back
          </button>
          <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">{selectedDay} Schedule</h2>
        </div>

        <div className="bg-white rounded-[24px] border border-slate-100 p-6 md:p-10 shadow-[0_2px_20px_rgba(0,0,0,0.02)]">
          <div className="ml-2 pl-8 border-l-[3px] border-slate-100 space-y-6">
            {scheduleData[selectedDay].map(period => (
              <div key={period.period} className="relative flex items-start gap-5 group">
                <div className="absolute -left-8 top-5 w-8 h-[3px] bg-slate-100 group-hover:bg-theme-primary/40 transition-colors rounded-r-full"></div>
                
                <div className="bg-slate-50/50 border border-slate-100 rounded-2xl p-5 flex-1 hover:border-theme-primary/30 hover:shadow-[0_4px_20px_rgba(0,0,0,0.04)] hover:-translate-y-0.5 active:scale-[0.99] transition-all duration-300">
                   <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                     <div className="flex items-center gap-3">
                       <span className="text-xs font-extrabold text-theme-primary bg-theme-bg px-3 py-1.5 rounded-lg uppercase tracking-wider">Period {period.period}</span>
                       <span className="text-sm font-bold text-slate-500">{period.time}</span>
                     </div>
                     <span className={`text-[11px] font-bold px-3 py-1.5 rounded-lg uppercase tracking-wider ${
                        period.type === 'Break' ? 'bg-orange-50 text-orange-600 border border-orange-100/50' :
                        period.type === 'Lab' ? 'bg-blue-50 text-blue-600 border border-blue-100/50' :
                        period.type === 'Tutorial' ? 'bg-purple-50 text-purple-600 border border-purple-100/50' :
                        period.type === 'Self Study' ? 'bg-slate-100 text-slate-600 border border-slate-200/50' :
                        'bg-slate-100 text-slate-600 border border-slate-200/50'
                     }`}>{period.type}</span>
                   </div>
                   <h4 className={`text-lg font-bold ${period.type === 'Break' ? 'text-slate-500' : 'text-slate-900'}`}>{period.subject}</h4>
                   {period.classInfo && (
                     <p className="text-sm font-medium text-slate-500 mt-1.5">{period.classInfo}</p>
                   )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-hero-fade-up relative z-10" style={{ animationDuration: '400ms' }}>
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">Weekly Schedule</h2>
      </div>

      <div className="grid gap-4">
        {days.map(day => (
          <div key={day} onClick={() => setSelectedDay(day)} className="bg-white rounded-[24px] border border-slate-100 p-6 shadow-[0_2px_20px_rgba(0,0,0,0.02)] hover:border-theme-primary/30 hover:shadow-[0_4px_20px_rgba(0,0,0,0.04)] hover:-translate-y-0.5 active:scale-[0.99] flex items-center justify-between gap-5 transition-all duration-300 group cursor-pointer">
            <div className="flex items-center gap-4">
               <div className="w-12 h-12 rounded-2xl bg-slate-50 text-slate-400 group-hover:bg-theme-bg group-hover:text-theme-primary flex items-center justify-center font-bold text-xl transition-all duration-300">
                 {day.charAt(0)}
               </div>
               <h3 className="text-xl font-bold text-slate-700 group-hover:text-slate-900 transition-colors">{day}</h3>
            </div>
            <div className="text-slate-300 group-hover:text-theme-primary transition-colors group-hover:translate-x-1 duration-300">
               <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}



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

