import { SimilarityCheckView } from './SimilarityCheckView';
import { useState, useEffect } from 'react';
import { 
  uploadAssignmentPdf, 
  getStudentAssignments, 
  getAssignmentSubmissions, 
  downloadSubmissionPdf, 
  downloadAssignmentPdf,
  getSectionStudents 
} from '../../services/storageService.js';
import { fetchAnnouncements, postAnnouncement } from '../../services/announcementService.js';
import { classes, students, assignments, teacherProfile, markPeriodAttendance } from './mockData';
import { Icons } from './Icons';
import { auth } from '../../firebase/config';
import { 
  fetchStudentsForSection, 
  savePeriodAttendance, 
  saveSingleStudentAttendance, 
  fetchSessionAttendanceRecords, 
  generateSessionId, 
  getCurrentPeriod, 
  getTodayDateString,
  resolveAcademicScope,
  TEACHING_PERIODS,
  BREAK_PERIOD
} from '../../services/attendanceService';
import { subscribeClassTimetable, VALID_DAYS } from '../../services/timetableService.js';

const CANONICAL_DEPARTMENT_MAP = {
  'CSE AI': 'Computer Science',
  'CSE': 'Computer Science',
  'Computer Science': 'Computer Science',
  'IT': 'Information Technology',
  'Information Technology': 'Information Technology',
  'ECE': 'Electronics & Communication',
  'Electronics & Communication': 'Electronics & Communication',
  'EE': 'Electrical Engineering',
  'Electrical Engineering': 'Electrical Engineering',
  'ME': 'Mechanical Engineering',
  'Mechanical Engineering': 'Mechanical Engineering',
  'CE': 'Civil Engineering',
  'Civil Engineering': 'Civil Engineering',
  'BT': 'Biotechnology',
  'Biotechnology': 'Biotechnology',
  'Management': 'Management'
};

const isMatchingDept = (d1, d2) => {
  if (!d1 || !d2) return false;
  if (d1 === d2) return true;
  const c1 = CANONICAL_DEPARTMENT_MAP[d1] || d1;
  const c2 = CANONICAL_DEPARTMENT_MAP[d2] || d2;
  return c1 === c2;
};

const isMatchingSec = (s1, s2) => {
  if (!s1 || !s2) return false;
  if (s1 === s2) return true;
  const n1 = String(s1).toUpperCase().replace(/[^A-Z0-9]/g, '');
  const n2 = String(s2).toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (n1 === n2) return true;
  const clean1 = n1.replace(/^(SECTION|SEC|CSE)/, '');
  const clean2 = n2.replace(/^(SECTION|SEC|CSE)/, '');
  if (clean1 && clean2 && clean1 === clean2) return true;
  return n1.endsWith(n2) || n2.endsWith(n1);
};

export function formatFileSize(bytes) {
  if (!bytes || isNaN(bytes)) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function useSectionStudents(br, yr, sec, institution) {
  const [students, setStudents] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const reload = async () => {
    if (!br || !yr || !sec || br === 'Unknown') {
      setStudents([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const res = await getSectionStudents({ department: br, year: yr, section: sec, institution });
      if (res && Array.isArray(res.students)) {
        setStudents(res.students);
      } else {
        setStudents([]);
      }
    } catch (err) {
      console.warn('[useSectionStudents] Failed to load students via backend:', err.message);
      try {
        const directList = await fetchStudentsForSection({ institution, department: br, year: yr, section: sec });
        if (Array.isArray(directList)) {
          setStudents(directList);
          return;
        }
      } catch {
        // preserve backend error
      }
      setError(err.message || 'Failed to load students.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    reload();
  }, [br, yr, sec, institution]);

  return { students, isLoading, error, reload };
}

export function StudentsViewSectionContent({ br, yr, sec, userProfile }) {
  const { students, isLoading, error, reload } = useSectionStudents(br, yr, sec, userProfile?.institution);

  if (isLoading) {
    return (
      <div className="py-6 text-center">
        <div className="inline-block animate-spin rounded-full h-6 w-6 border-2 border-[#171717] border-t-transparent mb-2"></div>
        <p className="text-xs font-medium text-[#858174]">Loading students...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 rounded-xl border border-red-200 bg-red-50 text-red-800 text-xs font-medium flex items-center justify-between">
        <span>{error}</span>
        <button onClick={reload} className="underline font-bold hover:text-red-900 ml-2">Retry</button>
      </div>
    );
  }

  if (!students || students.length === 0) {
    return (
      <div className="py-6 text-center rounded-xl border border-[#D8D1C3]/60 bg-[#FDFBF7]">
        <p className="text-xs font-bold text-[#858174]">No students enrolled in this section.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 mt-2">
      {students.map((st, idx) => (
        <div key={st.id || st.uid || idx} className="flex items-center gap-4 p-3 rounded-xl border border-[#D8D1C3]/60 bg-[#FDFBF7] hover:bg-[#F5E5EE]/50 hover:border-[#D8D1C3] transition-all">
          <span className="text-[#858174] font-bold w-6 text-right text-xs">{idx + 1}.</span>
          <div className="w-8 h-8 rounded-full bg-[#F5E5EE] text-[#171717] font-bold border border-[#D8D1C3]/60 flex items-center justify-center text-xs flex-shrink-0">
            {(st.name || 'S').charAt(0).toUpperCase()}
          </div>
          <div className="flex flex-col">
             <span className="font-bold text-[#171717] text-sm">{st.name}</span>
             <span className="text-[11px] font-medium text-[#858174]">{st.roll || st.enrollmentNo || st.studentId || st.email || ''}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export function GradesSectionContent({ br, yr, sec, userProfile, marksData, gradesData, onMarksChange, onGradeChange }) {
  const { students, isLoading, error, reload } = useSectionStudents(br, yr, sec, userProfile?.institution);

  if (isLoading) {
    return (
      <div className="py-6 text-center">
        <div className="inline-block animate-spin rounded-full h-6 w-6 border-2 border-[#171717] border-t-transparent mb-2"></div>
        <p className="text-xs font-medium text-[#858174]">Loading students...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 rounded-xl border border-red-200 bg-red-50 text-red-800 text-xs font-medium flex items-center justify-between">
        <span>{error}</span>
        <button onClick={reload} className="underline font-bold hover:text-red-900 ml-2">Retry</button>
      </div>
    );
  }

  if (!students || students.length === 0) {
    return (
      <div className="py-6 text-center rounded-xl border border-[#D8D1C3]/60 bg-[#FDFBF7]">
        <p className="text-xs font-bold text-[#858174]">No students enrolled in this section.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="hidden sm:grid grid-cols-12 gap-4 px-4 py-2 text-xs font-bold text-[#858174] uppercase tracking-wider">
        <div className="col-span-6">Student</div>
        <div className="col-span-3 text-center">Marks</div>
        <div className="col-span-3 text-center">Grade</div>
      </div>

      <div className="space-y-3">
        {students.map((st, idx) => {
          const sId = st.id || st.uid;
          const mark = marksData[sId] || '';
          const grade = gradesData[sId] || '';

          return (
            <div key={sId || idx} className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-center p-3 rounded-xl border border-[#D8D1C3]/60 bg-[#FDFBF7] hover:bg-[#F5E5EE]/50 hover:border-[#D8D1C3] transition-all">
              <div className="col-span-6 flex items-center gap-3">
                <span className="text-[#858174] font-bold w-6 text-right hidden sm:block text-xs">{idx + 1}.</span>
                <div className="w-8 h-8 rounded-full bg-[#F5E5EE] text-[#171717] font-bold border border-[#D8D1C3]/60 flex items-center justify-center text-xs flex-shrink-0">
                  {(st.name || 'S').charAt(0).toUpperCase()}
                </div>
                <div>
                  <span className="font-bold text-[#171717] block truncate text-sm">{st.name}</span>
                  <span className="text-[11px] font-medium text-[#858174]">{st.roll || st.enrollmentNo || st.studentId || st.email || ''}</span>
                </div>
              </div>
              <div className="col-span-3 flex justify-start sm:justify-center">
                <input 
                  type="text" 
                  placeholder="--" 
                  value={mark}
                  onChange={(e) => onMarksChange(sId, e.target.value)}
                  className="w-16 bg-white border border-[#D8D1C3] rounded-lg px-2 py-1.5 text-center font-bold text-[#171717] text-sm focus:outline-none focus:ring-1 focus:ring-[#171717] focus:border-[#171717] transition-all"
                />
              </div>
              <div className="col-span-3 flex justify-start sm:justify-center">
                <select 
                  value={grade}
                  onChange={(e) => onGradeChange(sId, e.target.value)}
                  className="w-20 bg-white border border-[#D8D1C3] rounded-lg px-2 py-1.5 font-bold text-[#171717] text-sm focus:outline-none focus:ring-1 focus:ring-[#171717] focus:border-[#171717] transition-all"
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
          );
        })}
      </div>
      <div className="flex justify-end pt-2">
        <button className="bg-[#171717] hover:bg-[#2b2b2b] text-[#F8F3E6] px-6 py-2 rounded-xl active:scale-95 transition-all duration-200 shadow-xs font-bold text-sm">
          Save Grades
        </button>
      </div>
    </div>
  );
}

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




export { resolveAcademicScope };

export function ClassesView({ userProfile, allocations = [], isLoadingAllocations = false }) {
  if (isLoadingAllocations) {
    return (
      <div className="space-y-6 animate-hero-fade-up relative z-10" style={{ animationDuration: '400ms' }}>
        <h2 className="text-2xl font-extrabold text-[#171717] tracking-tight">My Classes</h2>
        <div className="bg-white/80 rounded-[24px] border border-[#D8D1C3] p-12 text-center shadow-xs">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-[#171717] border-t-transparent mb-3"></div>
          <p className="text-sm font-medium text-[#858174]">Loading your assigned classes...</p>
        </div>
      </div>
    );
  }

  if (!isLoadingAllocations && (!allocations || allocations.length === 0)) {
    return (
      <div className="space-y-6 animate-hero-fade-up relative z-10" style={{ animationDuration: '400ms' }}>
        <h2 className="text-2xl font-extrabold text-[#171717] tracking-tight">My Classes</h2>
        <div className="bg-white/80 rounded-[24px] border border-[#D8D1C3] p-12 text-center shadow-xs">
          <div className="w-16 h-16 rounded-2xl bg-[#F5E5EE] text-[#171717] flex items-center justify-center mx-auto mb-4 border border-[#D8D1C3]/60">
            <Icons.Classes />
          </div>
          <h3 className="text-xl font-bold text-[#171717] mb-2">No Classes Allocated</h3>
          <p className="text-sm font-medium text-[#858174] max-w-md mx-auto">
            You do not currently have any class allocations. Please contact your Director to assign your classes.
          </p>
        </div>
      </div>
    );
  }

  const myClasses = allocations.map((alloc, idx) => ({
    id: alloc.id || idx,
    subject: alloc.subject || `${alloc.department} Core`,
    section: `${alloc.year} • ${alloc.department} • ${alloc.section}`,
    semester: alloc.year,
    studentsCount: 20,
    room: `Room ${101 + (idx * 5)}`,
    time: `${9 + (idx % 6)}:30 AM - ${10 + (idx % 6)}:15 AM`
  }));

  return (
    <div className="space-y-6 animate-hero-fade-up relative z-10" style={{ animationDuration: '400ms' }}>
      <h2 className="text-2xl font-extrabold text-[#171717] tracking-tight">My Classes</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {myClasses.map(c => (
          <div key={c.id} className="bg-white/90 rounded-[24px] border border-[#D8D1C3] p-6 shadow-xs hover:shadow-md hover:border-[#171717]/30 hover:-translate-y-0.5 active:scale-[0.99] transition-all duration-200 cursor-pointer group">
            <div className="flex justify-between items-start mb-5">
              <div>
                <h3 className="text-xl font-bold text-[#171717] transition-colors">{c.subject}</h3>
                <p className="text-sm font-medium text-[#858174] mt-1">{c.section} • {c.semester}</p>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-[#F5E5EE] text-[#171717] group-hover:bg-[#171717] group-hover:text-[#F8F3E6] flex items-center justify-center transition-all duration-300">
                <Icons.Classes />
              </div>
            </div>
            <div className="space-y-3 text-sm text-[#858174] font-medium">
              <div className="flex justify-between items-center py-2 border-b border-[#D8D1C3]/40"><span>Students:</span> <span className="font-bold text-[#171717] bg-[#F5E5EE] px-2.5 py-0.5 rounded-lg border border-[#D8D1C3]/60">{c.studentsCount}</span></div>
              <div className="flex justify-between items-center py-2 border-b border-[#D8D1C3]/40"><span>Room:</span> <span className="font-bold text-[#171717]">{c.room}</span></div>
              <div className="flex justify-between items-center py-2"><span>Time:</span> <span className="font-bold text-[#171717]">{c.time}</span></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function TreeHierarchy({ title, tree, branches, renderContent, expandedNodes, toggleNode }) {
  return (
    <div className="space-y-6 animate-hero-fade-up relative z-10 pb-10" style={{ animationDuration: '400ms' }}>
      <h2 className="text-2xl font-extrabold text-[#171717] tracking-tight">{title}</h2>
      
      <div className="bg-white/80 rounded-[24px] border border-[#D8D1C3] p-6 sm:p-8 shadow-xs">
        <div className="space-y-3">
          {branches.map(br => (
            <div key={br} className="text-sm">
              <div 
                className="flex items-center gap-3 p-3 hover:bg-[#F5E5EE] rounded-xl cursor-pointer transition-colors group"
                onClick={() => toggleNode(br)}
              >
                <div className={`text-[#858174] transition-transform duration-200 ${expandedNodes[br] ? 'rotate-90' : ''}`}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                </div>
                <span className="font-extrabold text-[#171717] text-lg">{br}</span>
              </div>
              
              {expandedNodes[br] && (
                <div className="ml-5 mt-2 border-l-2 border-[#D8D1C3] pl-4 space-y-2 mb-2 animate-fade-in" style={{ animationDuration: '200ms' }}>
                  {Object.keys(tree[br]).sort().map(yr => {
                    const yearKey = `${br}-${yr}`;
                    return (
                      <div key={yr}>
                        <div 
                          className="flex items-center gap-3 p-2.5 hover:bg-[#F5E5EE] rounded-lg cursor-pointer transition-colors group"
                          onClick={() => toggleNode(yearKey)}
                        >
                          <div className={`text-[#858174] transition-transform duration-200 ${expandedNodes[yearKey] ? 'rotate-90' : ''}`}>
                             <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                          </div>
                          <span className="font-bold text-[#171717] text-base">{yr}</span>
                        </div>
                        
                        {expandedNodes[yearKey] && (
                          <div className="ml-6 mt-1 border-l-2 border-[#D8D1C3]/60 pl-4 space-y-1 mb-2 animate-fade-in" style={{ animationDuration: '200ms' }}>
                            {Array.from(tree[br][yr]).sort().map(sec => {
                              const secKey = `${br}-${yr}-${sec}`;
                              return (
                                <div key={sec}>
                                  <div 
                                    onClick={() => toggleNode(secKey)}
                                    className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors group ${expandedNodes[secKey] ? 'bg-[#F5E5EE]' : 'hover:bg-[#F5E5EE]/60'}`}
                                  >
                                    <div className="w-3 border-b-2 border-[#D8D1C3] group-hover:border-[#171717]/40 transition-colors"></div>
                                    <div className={`text-[#858174] transition-transform duration-200 ${expandedNodes[secKey] ? 'rotate-90' : ''}`}>
                                       <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                                    </div>
                                    <span className="font-bold text-[#171717] text-sm">{sec}</span>
                                  </div>
                                  
                                  {expandedNodes[secKey] && (
                                    <div className="ml-8 mt-2 border-l-2 border-[#D8D1C3]/40 pl-4 py-2 space-y-2 mb-4 animate-fade-in" style={{ animationDuration: '200ms' }}>
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

export function StudentsView({ userProfile, allocations = [], isLoadingAllocations = false }) {
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
    return <StudentsViewSectionContent br={br} yr={yr} sec={sec} userProfile={userProfile} />;
  };

  if (isLoadingAllocations) {
    return (
      <div className="space-y-6 animate-hero-fade-up relative z-10" style={{ animationDuration: '400ms' }}>
        <h2 className="text-2xl font-extrabold text-[#171717] tracking-tight">Students</h2>
        <div className="bg-white/80 rounded-[24px] border border-[#D8D1C3] p-12 text-center shadow-xs">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-[#171717] border-t-transparent mb-3"></div>
          <p className="text-sm font-medium text-[#858174]">Loading student directory...</p>
        </div>
      </div>
    );
  }

  if (!isLoadingAllocations && (!allocations || allocations.length === 0)) {
    return (
      <div className="space-y-6 animate-hero-fade-up relative z-10" style={{ animationDuration: '400ms' }}>
        <h2 className="text-2xl font-extrabold text-[#171717] tracking-tight">Students</h2>
        <div className="bg-white/80 rounded-[24px] border border-[#D8D1C3] p-12 text-center shadow-xs">
          <div className="w-16 h-16 rounded-2xl bg-[#F5E5EE] text-[#171717] border border-[#D8D1C3]/60 flex items-center justify-center mx-auto mb-4">
            <Icons.Students />
          </div>
          <h3 className="text-xl font-bold text-[#171717] mb-2">No Students Allocated</h3>
          <p className="text-sm font-medium text-[#858174] max-w-md mx-auto">
            You do not currently have any student rosters because no classes have been allocated to you. Contact your Director to assign classes.
          </p>
        </div>
      </div>
    );
  }

  const dynamicTree = {};
  allocations.forEach(alloc => {
    const branch = alloc.department;
    const year = alloc.year;
    const section = alloc.section;
    if (!branch || !year || !section) return;
    if (!dynamicTree[branch]) dynamicTree[branch] = {};
    if (!dynamicTree[branch][year]) dynamicTree[branch][year] = new Set();
    dynamicTree[branch][year].add(section);
  });
  const dynamicBranches = Object.keys(dynamicTree).sort();

  return <TreeHierarchy title="Students" tree={dynamicTree} branches={dynamicBranches} renderContent={renderContent} expandedNodes={expandedNodes} toggleNode={toggleNode} />;
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

export function AssignmentsView({ group, userProfile, allocations = [] }) {
  

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

  const [backendAssignments, setBackendAssignments] = useState([]);
  const [isLoadingAssignments, setIsLoadingAssignments] = useState(true);
  const [assignmentsError, setAssignmentsError] = useState(null);

  const fetchAssignments = async () => {
    setIsLoadingAssignments(true);
    setAssignmentsError(null);
    try {
      const res = await getStudentAssignments();
      if (res && res.success && Array.isArray(res.assignments)) {
        setBackendAssignments(res.assignments);
      } else if (res && Array.isArray(res.assignments)) {
        setBackendAssignments(res.assignments);
      } else {
        setBackendAssignments([]);
      }
    } catch (err) {
      console.warn('[AssignmentsView] Failed to load assignments:', err.message);
      setAssignmentsError(err.message || 'Failed to load assignments.');
    } finally {
      setIsLoadingAssignments(false);
    }
  };

  useEffect(() => {
    fetchAssignments();
  }, []);

  const [isCreating, setIsCreating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [uploadErrorCode, setUploadErrorCode] = useState(null);
  const [uploadSuccessMessage, setUploadSuccessMessage] = useState(null);
  const [idempotencyKey, setIdempotencyKey] = useState(null);

  const [viewingAssignment, setViewingAssignment] = useState(null);
  const [comparingPair, setComparingPair] = useState(null);
  const [assignmentSubmissions, setAssignmentSubmissions] = useState([]);
  const [sectionStudents, setSectionStudents] = useState([]);
  const [isLoadingSubmissions, setIsLoadingSubmissions] = useState(false);
  const [submissionsError, setSubmissionsError] = useState(null);
  const [downloadingId, setDownloadingId] = useState(null);
  const [downloadError, setDownloadError] = useState(null);
  const [downloadingAssignment, setDownloadingAssignment] = useState(false);

  const loadSubmissionsData = async () => {
    if (!viewingAssignment || !viewingAssignment.id) return;
    setIsLoadingSubmissions(true);
    setSubmissionsError(null);
    try {
      const [subsRes, studentsRes] = await Promise.allSettled([
        getAssignmentSubmissions(viewingAssignment.id),
        getSectionStudents({
          department: viewingAssignment.department || viewingAssignment.br,
          year: viewingAssignment.year || viewingAssignment.yr,
          section: viewingAssignment.section || viewingAssignment.sec,
          institution: userProfile?.institution
        })
      ]);

      if (subsRes.status === 'fulfilled' && subsRes.value?.success && Array.isArray(subsRes.value.submissions)) {
        setAssignmentSubmissions(subsRes.value.submissions);
      } else if (subsRes.status === 'rejected') {
        console.warn('[AssignmentsView] Failed to load submissions:', subsRes.reason);
        setSubmissionsError(subsRes.reason?.message || 'Failed to load submissions.');
      } else {
        setAssignmentSubmissions([]);
      }

      if (studentsRes.status === 'fulfilled' && studentsRes.value?.success && Array.isArray(studentsRes.value.students)) {
        setSectionStudents(studentsRes.value.students);
      } else {
        setSectionStudents([]);
      }
    } catch (err) {
      setSubmissionsError(err.message || 'Failed to load assignment details.');
    } finally {
      setIsLoadingSubmissions(false);
    }
  };

  useEffect(() => {
    if (viewingAssignment) {
      loadSubmissionsData();
    } else {
      setAssignmentSubmissions([]);
      setSectionStudents([]);
      setSubmissionsError(null);
      setDownloadError(null);
    }
  }, [viewingAssignment?.id]);

  const handleDownloadSubmission = async (sub) => {
    if (!sub || !sub.id) return;
    setDownloadingId(sub.id);
    setDownloadError(null);
    try {
      const fileName = sub.originalFileName || sub.driveFileName || `${sub.studentName || 'Student'}_submission.pdf`;
      await downloadSubmissionPdf(sub.id, fileName);
    } catch (err) {
      console.error('[AssignmentsView] Download submission error:', err);
      setDownloadError(err.message || 'Failed to download student submission PDF.');
    } finally {
      setDownloadingId(null);
    }
  };

  const handleDownloadTeacherAssignment = async () => {
    if (!viewingAssignment || !viewingAssignment.id) return;
    setDownloadingAssignment(true);
    setDownloadError(null);
    try {
      const fileName = viewingAssignment.fileName || viewingAssignment.driveFileName || `${viewingAssignment.title || 'assignment'}.pdf`;
      await downloadAssignmentPdf(viewingAssignment.id, fileName);
    } catch (err) {
      console.error('[AssignmentsView] Download assignment error:', err);
      setDownloadError(err.message || 'Failed to download original assignment PDF.');
    } finally {
      setDownloadingAssignment(false);
    }
  };

  const [creationContext, setCreationContext] = useState(null);

  const [newAssignment, setNewAssignment] = useState({
    title: '',
    dueDate: '',
    pdf: null,
    checkSimilarity: false
  });

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      const selected = e.target.files[0];
      const isPdf = (selected.type && selected.type === 'application/pdf') || (selected.name && selected.name.toLowerCase().endsWith('.pdf'));
      if (!isPdf) {
        setUploadError('Selected file must be a PDF document (.pdf).');
        setUploadErrorCode('INVALID_MIME_TYPE');
        return;
      }
      if (selected.size === 0) {
        setUploadError('The selected PDF file is empty (0 bytes).');
        setUploadErrorCode('EMPTY_FILE');
        return;
      }
      if (selected.size > 10 * 1024 * 1024) {
        setUploadError('The selected PDF file exceeds the 10MB limit.');
        setUploadErrorCode('LIMIT_FILE_SIZE');
        return;
      }
      setUploadError(null);
      setUploadErrorCode(null);
      setNewAssignment(prev => ({ ...prev, pdf: selected }));
    }
  };

  const handleCreateAssignment = async (e) => {
    e.preventDefault();
    if (!creationContext) return;

    if (!newAssignment.title || !newAssignment.title.trim()) {
      setUploadError('Assignment title is required.');
      setUploadErrorCode('VALIDATION_FAILED');
      return;
    }
    if (!newAssignment.dueDate) {
      setUploadError('Due date is required.');
      setUploadErrorCode('VALIDATION_FAILED');
      return;
    }
    if (!newAssignment.pdf) {
      setUploadError('Please select a PDF document to upload.');
      setUploadErrorCode('MISSING_FILE');
      return;
    }

    const currentKey = idempotencyKey || `asg_idem_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    if (!idempotencyKey) {
      setIdempotencyKey(currentKey);
    }

    setIsSubmitting(true);
    setUploadError(null);
    setUploadErrorCode(null);

    const rawSec = creationContext.sec || '';
    const cleanSec = rawSec.includes('·') ? rawSec.split('·')[0].trim() : rawSec;
    const sectionKey = `${creationContext.br}-${creationContext.yr}-${creationContext.sec}`;

    try {
      const response = await uploadAssignmentPdf({
        file: newAssignment.pdf,
        title: newAssignment.title.trim(),
        department: creationContext.br,
        year: creationContext.yr,
        section: cleanSec,
        dueDate: newAssignment.dueDate,
        idempotencyKey: currentKey
      });

      if (response && response.success && response.assignment) {
        await fetchAssignments();
        setUploadSuccessMessage('Assignment created and saved to Google Drive!');

        setTimeout(() => {
          setIsCreating(false);
          setNewAssignment({ title: '', dueDate: '', pdf: null, checkSimilarity: false });
          setCreationContext(null);
          setIdempotencyKey(null);
          setIsSubmitting(false);
          setUploadSuccessMessage(null);
        }, 800);
      } else {
        throw new Error('Unexpected response format from storage service.');
      }
    } catch (err) {
      setIsSubmitting(false);
      const code = err.code || 'UNKNOWN_ERROR';
      setUploadErrorCode(code);

      if (code === 'GOOGLE_DRIVE_DISCONNECTED') {
        setUploadError('Google Drive is not connected. Connect your Google Drive in Settings to save assignments to cloud storage.');
      } else if (code === 'FORBIDDEN_NOT_TEACHER' || code === 'FORBIDDEN_ALLOCATION_NOT_FOUND') {
        setUploadError('You are not authorized to create assignments for this class allocation.');
      } else if (code === 'LIMIT_FILE_SIZE') {
        setUploadError('The selected file exceeds the 10MB limit.');
      } else if (code === 'INVALID_PDF_SIGNATURE' || code === 'INVALID_MIME_TYPE') {
        setUploadError('Invalid PDF file: Please select a valid PDF document.');
      } else if (code === 'EMPTY_FILE') {
        setUploadError('The selected PDF file is empty (0 bytes).');
      } else if (code === 'GOOGLE_DRIVE_TIMEOUT' || code === 'TIMEOUT') {
        setUploadError('Google Drive request timed out. You can retry with the same request without creating duplicate files.');
      } else if (code === 'SERVER_UNAVAILABLE') {
        setUploadError('Backend server is currently unavailable. Please verify the server is running.');
      } else {
        setUploadError(err.message || 'Failed to upload assignment.');
      }
    }
  };

  const handleSaveFallback = () => {
    if (!creationContext || !newAssignment.title) return;
    const fallbackAsg = {
      id: `local-${Date.now()}`,
      title: newAssignment.title,
      dueDate: newAssignment.dueDate,
      department: creationContext.br,
      year: creationContext.yr,
      section: creationContext.sec,
      className: `${creationContext.yr} • ${creationContext.br} • ${creationContext.sec}`,
      status: 'Active',
      total: 20,
      checkSimilarity: newAssignment.checkSimilarity,
      storageProvider: 'local_draft',
      fileName: newAssignment.pdf?.name || null,
      fileSize: newAssignment.pdf?.size || null
    };

    setBackendAssignments(prev => [fallbackAsg, ...prev]);
    setIsCreating(false);
    setNewAssignment({ title: '', dueDate: '', pdf: null, checkSimilarity: false });
    setCreationContext(null);
    setIdempotencyKey(null);
    setUploadError(null);
    setUploadErrorCode(null);
  };

  
  if (viewingAssignment && comparingPair) {
    const {stA, stB, score, sharedPassage, fakeContentA, fakeContentB, report} = comparingPair;
    
    return (
      <div className="space-y-6 animate-hero-fade-up relative z-10" style={{ animationDuration: '400ms' }}>
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-4">
            <button onClick={() => setComparingPair(null)} className="flex items-center gap-2 bg-white border border-[#D8D1C3] text-[#171717] px-4 py-2.5 rounded-xl hover:bg-[#F5E5EE] active:scale-95 transition-all duration-200 shadow-xs font-bold text-sm">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
              Back to Submissions
            </button>
            <div>
              <h2 className="text-2xl font-extrabold text-[#171717] tracking-tight">Compare Submissions</h2>
              <p className="text-sm font-medium text-[#858174] mt-1">{stA.name} & {stB.name}</p>
            </div>
          </div>
        </div>
        
        {report && (
          <div className="bg-white/80 rounded-[24px] border border-[#D8D1C3] p-6 shadow-xs mt-6">
            <h3 className="text-lg font-bold text-[#171717] mb-4">Similarity Overview</h3>
            <div className="flex flex-col md:flex-row gap-8 mb-6">
               <div className="flex flex-col">
                  <span className="text-xs font-bold text-[#858174] uppercase tracking-wider mb-1">Overall</span>
                  <span className={`text-4xl font-extrabold ${report.overallSimilarity > 50 ? 'text-[#a12052]' : 'text-[#171717]'}`}>{report.overallSimilarity}%</span>
               </div>
               <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-bold text-[#858174] uppercase tracking-wider">Text</span>
                    <span className="text-lg font-bold text-[#171717]">{report.textSimilarity}%</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] font-bold text-[#858174] uppercase tracking-wider">Semantic</span>
                    <span className="text-lg font-bold text-[#171717]">{report.semanticSimilarity}%</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] font-bold text-[#858174] uppercase tracking-wider">Visual</span>
                    <span className="text-lg font-bold text-[#171717]">{report.visualSimilarity}%</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] font-bold text-[#858174] uppercase tracking-wider">Structural</span>
                    <span className="text-lg font-bold text-[#171717]">{report.structuralSimilarity}%</span>
                  </div>
               </div>
               <div className="flex flex-col ml-auto text-right">
                  <span className="text-xs font-bold text-[#858174] uppercase tracking-wider mb-1">Details</span>
                  <span className="text-sm font-bold text-[#171717]">Matching Sections: {report.matchingSections}</span>
                  <span className="text-sm font-bold text-[#171717]">Pages: {report.matchingPages}</span>
                  <span className={`text-xs font-bold mt-2 px-3 py-1 rounded-lg inline-block border ${report.overallSimilarity > 50 ? 'bg-[#EFA9D1]/30 text-[#5e193c] border-[#EFA9D1]/60' : 'bg-white text-[#171717] border-[#D8D1C3]'}`}>{report.recommendation || (report.overallSimilarity > 50 ? 'Review recommended' : 'Low similarity')}</span>
               </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-6 mt-6">
           <div className="bg-white/90 rounded-[24px] border border-[#D8D1C3] p-6 shadow-xs overflow-y-auto max-h-[600px] custom-scrollbar">
             <h4 className="font-bold text-[#171717] mb-4 pb-2 border-b border-[#D8D1C3]/60">{stA.name}'s Submission</h4>
             <div className="text-sm text-[#171717] space-y-6 leading-relaxed font-medium">
               {report && report.evidence ? report.evidence.map((ev, i) => (
                 <div key={i} className="mb-4">
                   <p className="text-xs font-bold text-[#858174] mb-1 uppercase tracking-wider">{ev.sharedPassage}</p>
                   <p className="bg-[#FDFBF7] text-[#171717] p-3 rounded-xl border border-[#D8D1C3]">{ev.contentA}</p>
                 </div>
               )) : (
                 <>
                   <p>...<span className="bg-[#F3D75E]/30 text-[#171717] px-1 rounded border border-[#F3D75E]/60">{sharedPassage}</span>...</p>
                   <p>{fakeContentA}</p>
                 </>
               )}
             </div>
           </div>
           <div className="bg-white/90 rounded-[24px] border border-[#D8D1C3] p-6 shadow-xs overflow-y-auto max-h-[600px] custom-scrollbar">
             <h4 className="font-bold text-[#171717] mb-4 pb-2 border-b border-[#D8D1C3]/60">{stB.name}'s Submission</h4>
             <div className="text-sm text-[#171717] space-y-6 leading-relaxed font-medium">
               {report && report.evidence ? report.evidence.map((ev, i) => (
                 <div key={i} className="mb-4">
                   <p className="text-xs font-bold text-[#858174] mb-1 uppercase tracking-wider">{ev.sharedPassage}</p>
                   <p className="bg-[#FDFBF7] text-[#171717] p-3 rounded-xl border border-[#D8D1C3]">{ev.contentB}</p>
                 </div>
               )) : (
                 <>
                   <p>...<span className="bg-[#F3D75E]/30 text-[#171717] px-1 rounded border border-[#F3D75E]/60">{sharedPassage}</span>...</p>
                   <p>{fakeContentB}</p>
                 </>
               )}
             </div>
           </div>
        </div>
      </div>
    );
  }
  if (viewingAssignment) {
    const scopeLabel = `${viewingAssignment.department || viewingAssignment.br || ''} • ${viewingAssignment.year || viewingAssignment.yr || ''} • ${viewingAssignment.section || viewingAssignment.sec || ''}`.replace(/^ • | • $/g, '');
    const submittedStudentUids = new Set(assignmentSubmissions.map(s => s.studentUid));
    const pendingStudents = sectionStudents.filter(st => {
      const uid = st.uid || st.id;
      return !submittedStudentUids.has(uid) && !submittedStudentUids.has(st.id);
    });

    return (
      <div className="space-y-6 animate-hero-fade-up relative z-10" style={{ animationDuration: '400ms' }}>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => { setViewingAssignment(null); setDownloadError(null); }} 
              className="flex items-center gap-2 bg-white border border-[#D8D1C3] text-[#171717] px-4 py-2.5 rounded-xl hover:bg-[#F5E5EE] active:scale-95 transition-all duration-200 shadow-xs font-bold text-sm"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
              Back
            </button>
            <div>
              <h2 className="text-2xl font-extrabold text-[#171717] tracking-tight">{viewingAssignment.title}</h2>
              <div className="flex flex-wrap items-center gap-2 mt-1">
                <p className="text-sm font-medium text-[#858174]">
                  {scopeLabel} • Due: {viewingAssignment.dueDate || 'No date set'}
                </p>
                {viewingAssignment.storageProvider === 'google' || viewingAssignment.storageProvider === 'google_drive' || viewingAssignment.driveFileId ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-xs font-bold bg-[#B7C9EA]/25 text-[#1b3a5b] border border-[#B7C9EA]/50">
                    <svg className="w-3.5 h-3.5 text-[#1b3a5b]" fill="currentColor" viewBox="0 0 24 24"><path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z"/></svg>
                    Saved in Google Drive {viewingAssignment.fileName ? `(${viewingAssignment.fileName})` : ''}
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <button
              onClick={loadSubmissionsData}
              disabled={isLoadingSubmissions}
              className="p-2.5 rounded-xl border border-[#D8D1C3] bg-white hover:bg-[#F5E5EE] text-[#171717] font-bold text-xs flex items-center gap-1.5 active:scale-95 transition-all shadow-xs"
              title="Refresh submissions"
            >
              <svg className={`w-4 h-4 ${isLoadingSubmissions ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh
            </button>
            {(viewingAssignment.driveFileId || viewingAssignment.hasFile || viewingAssignment.id) && (
              <button
                onClick={handleDownloadTeacherAssignment}
                disabled={downloadingAssignment}
                className="px-4 py-2.5 rounded-xl border border-[#D8D1C3] bg-white hover:bg-[#F5E5EE] text-[#171717] font-bold text-xs flex items-center gap-2 active:scale-95 transition-all shadow-xs"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                {downloadingAssignment ? 'Downloading...' : 'Assignment PDF'}
              </button>
            )}
          </div>
        </div>

        {downloadError && (
          <div className="p-4 rounded-xl border border-red-200 bg-red-50 text-red-800 text-xs font-medium flex items-center justify-between">
            <span>{downloadError}</span>
            <button onClick={() => setDownloadError(null)} className="font-bold underline ml-2">Dismiss</button>
          </div>
        )}

        {submissionsError && (
          <div className="p-4 rounded-xl border border-red-200 bg-red-50 text-red-800 text-xs font-medium flex items-center justify-between">
            <span>{submissionsError}</span>
            <button onClick={loadSubmissionsData} className="font-bold underline ml-2">Retry</button>
          </div>
        )}

        {/* Submissions Section */}
        <div className="bg-white/80 rounded-[24px] border border-[#D8D1C3] p-6 shadow-xs mt-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-[#171717] flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#A9BD78]"></span>
              Submissions ({assignmentSubmissions.length})
            </h3>
            {assignmentSubmissions.length > 0 && (
              <span className="text-xs font-bold text-[#273811] bg-[#A9BD78]/25 border border-[#A9BD78]/45 px-3 py-1 rounded-full">
                {assignmentSubmissions.length} Received
              </span>
            )}
          </div>

          {isLoadingSubmissions ? (
            <div className="py-12 text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-[#171717] border-t-transparent mb-3"></div>
              <p className="text-sm font-medium text-[#858174]">Loading student submissions...</p>
            </div>
          ) : assignmentSubmissions.length === 0 ? (
            <div className="py-10 text-center rounded-xl border border-[#D8D1C3]/60 bg-[#FDFBF7]">
              <div className="w-12 h-12 rounded-2xl bg-[#F5E5EE] text-[#171717] border border-[#D8D1C3]/60 flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-[#858174]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h4 className="text-sm font-bold text-[#171717]">No Submissions Received Yet</h4>
              <p className="text-xs font-medium text-[#858174] max-w-sm mx-auto mt-1">
                Students have not submitted their coursework for this assignment yet. Submissions and student PDFs will appear here once uploaded.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {assignmentSubmissions.map((sub, idx) => {
                const subDate = sub.submittedAt || sub.createdAt;
                const formattedDate = subDate ? new Date(subDate).toLocaleString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                }) : 'Submitted';

                const fileName = sub.originalFileName || sub.driveFileName || 'submission.pdf';
                const isDownloadingThis = downloadingId === sub.id;

                return (
                  <div key={sub.id || idx} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border border-[#D8D1C3]/60 bg-[#FDFBF7] hover:bg-[#F5E5EE]/30 transition-colors gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-[#F5E5EE] text-[#171717] border border-[#D8D1C3]/60 flex items-center justify-center font-bold text-sm flex-shrink-0">
                        {(sub.studentName || 'S').charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-bold text-[#171717] text-sm">{sub.studentName || 'Student'}</p>
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#A9BD78]/25 text-[#273811] border border-[#A9BD78]/45">
                            {sub.status || 'Submitted'}
                          </span>
                        </div>
                        <p className="text-xs font-medium text-[#858174] mt-0.5">
                          {sub.studentRoll ? `Roll: ${sub.studentRoll}` : (sub.studentUid ? `UID: ${sub.studentUid.slice(0, 8)}` : '')}
                          {sub.studentRoll && sub.studentUid ? ` • ` : ''}
                          Uploaded: {formattedDate}
                        </p>
                        <div className="flex items-center gap-1.5 mt-1 text-xs text-[#171717] font-medium">
                          <svg className="w-3.5 h-3.5 text-[#858174] flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                          </svg>
                          <span className="font-semibold text-[#171717] truncate max-w-xs">{fileName}</span>
                          {sub.fileSizeBytes ? (
                            <span className="text-[#858174]">({formatFileSize(sub.fileSizeBytes)})</span>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center">
                      <button
                        onClick={() => handleDownloadSubmission(sub)}
                        disabled={isDownloadingThis}
                        className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-[#D8D1C3] bg-white hover:bg-[#F5E5EE] text-[#171717] font-bold text-xs active:scale-95 transition-all shadow-xs disabled:opacity-50"
                        title={`Download ${fileName}`}
                      >
                        {isDownloadingThis ? (
                          <>
                            <div className="w-3.5 h-3.5 border-2 border-[#171717] border-t-transparent rounded-full animate-spin"></div>
                            <span>Downloading...</span>
                          </>
                        ) : (
                          <>
                            <svg className="w-3.5 h-3.5 text-[#171717]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                            <span>Download PDF</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Pending Submissions / Unsubmitted Students */}
        {sectionStudents.length > 0 && (
          <div className="bg-white/80 rounded-[24px] border border-[#EFA9D1]/60 p-6 shadow-xs mt-6">
            <h3 className="text-lg font-bold text-[#171717] mb-4 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#EFA9D1]"></span>
              Pending Submissions ({pendingStudents.length})
            </h3>
            {pendingStudents.length === 0 ? (
              <p className="text-sm font-medium text-[#273811] bg-[#A9BD78]/15 border border-[#A9BD78]/30 rounded-xl p-4 text-center">
                All enrolled students in this section have submitted this assignment.
              </p>
            ) : (
              <div className="space-y-3">
                {pendingStudents.map((st, idx) => (
                  <div key={st.id || st.uid || idx} className="flex items-center justify-between p-3.5 rounded-xl border border-[#D8D1C3]/60 bg-[#FDFBF7]">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-[#F5E5EE] text-[#5e193c] border border-[#D8D1C3]/60 flex items-center justify-center font-bold text-xs flex-shrink-0">
                        {(st.name || 'S').charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-bold text-[#171717] text-sm">{st.name}</p>
                        <p className="text-xs font-medium text-[#858174]">
                          {st.roll ? `Roll: ${st.roll}` : (st.email || '')}
                        </p>
                      </div>
                    </div>
                    <span className="px-3 py-1 bg-[#EFA9D1]/25 text-[#5e193c] border border-[#EFA9D1]/45 text-xs font-bold rounded-lg flex items-center gap-1.5">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"></path></svg>
                      Not Submitted
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {viewingAssignment.checkSimilarity && assignmentSubmissions.length >= 2 && (
          <SimilarityCheckView 
            assignment={viewingAssignment} 
            submittedStudents={assignmentSubmissions.map(s => ({
              id: s.studentUid || s.id,
              name: s.studentName,
              roll: s.studentRoll || s.enrollmentNo || '',
              fileUrl: `/api/submissions/${s.id}/file`,
              originalName: s.originalFileName || s.driveFileName,
              isReal: true,
              extractedText: s.extractedText,
              similarityReport: s.similarityReport
            }))}
            onCompare={setComparingPair}
          />
        )}
      </div>
    );
  }

  if (isCreating && creationContext) {
    const selectedSection = creationContext.sec;
    return (
      <div className="space-y-6 animate-hero-fade-up relative z-10" style={{ animationDuration: '400ms' }}>
        <div className="flex justify-between items-center">
          <h2 className="text-2xl font-extrabold text-[#171717] tracking-tight">Create Assignment for {selectedSection}</h2>
          <button 
            type="button"
            disabled={isSubmitting}
            onClick={() => { 
              setIsCreating(false); 
              setCreationContext(null); 
              setUploadError(null); 
              setUploadErrorCode(null); 
              setIdempotencyKey(null); 
            }} 
            className="flex items-center gap-2 bg-white border border-[#D8D1C3] text-[#171717] px-5 py-2.5 rounded-xl hover:bg-[#F5E5EE] active:scale-95 transition-all duration-200 shadow-xs font-bold text-sm disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
        <div className="bg-white/80 rounded-[24px] border border-[#D8D1C3] p-8 shadow-xs">
          {uploadError && (
            <div className="mb-6 p-4 rounded-xl border border-red-200 bg-red-50 text-red-800 text-sm font-medium flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-red-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><circle cx="12" cy="12" r="10" strokeWidth="2"/><line x1="12" y1="8" x2="12" y2="12" strokeWidth="2"/><line x1="12" y1="16" x2="12.01" y2="16" strokeWidth="2"/></svg>
                <span>{uploadError}</span>
              </div>
              {(uploadErrorCode === 'GOOGLE_DRIVE_DISCONNECTED' || uploadErrorCode === 'SERVER_UNAVAILABLE') && (
                <div className="flex items-center gap-3 mt-1 pt-2 border-t border-red-200/60">
                  <button
                    type="button"
                    onClick={handleSaveFallback}
                    className="text-xs font-bold bg-white text-[#171717] border border-[#D8D1C3] px-3.5 py-1.5 rounded-lg hover:bg-[#F5E5EE] transition-colors"
                  >
                    Save as Local Draft (Not Cloud-Backed)
                  </button>
                </div>
              )}
            </div>
          )}

          {uploadSuccessMessage && (
            <div className="mb-6 p-4 rounded-xl border border-[#A9BD78]/60 bg-[#A9BD78]/20 text-[#273811] text-sm font-bold flex items-center gap-2 animate-fade-in">
              <svg className="w-5 h-5 text-[#273811] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"/></svg>
              <span>{uploadSuccessMessage}</span>
            </div>
          )}

          <form onSubmit={handleCreateAssignment} className="space-y-6">
            <div>
              <label className="block text-sm font-bold text-[#171717] mb-2">Assignment Title</label>
              <input 
                type="text" 
                value={newAssignment.title} 
                onChange={e => setNewAssignment({...newAssignment, title: e.target.value})} 
                disabled={isSubmitting}
                className="w-full bg-[#FDFBF7] border border-[#D8D1C3] rounded-xl px-4 py-3 focus:outline-none focus:ring-1 focus:ring-[#171717] focus:border-[#171717] transition-all font-medium text-[#171717] disabled:opacity-50" 
                placeholder="e.g. Binary Trees Implementation" 
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-[#171717] mb-2">Due Date</label>
              <input 
                type="date" 
                value={newAssignment.dueDate} 
                onChange={e => setNewAssignment({...newAssignment, dueDate: e.target.value})} 
                disabled={isSubmitting}
                className="w-full bg-[#FDFBF7] border border-[#D8D1C3] rounded-xl px-4 py-3 focus:outline-none focus:ring-1 focus:ring-[#171717] focus:border-[#171717] transition-all font-medium text-[#171717] disabled:opacity-50" 
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-[#171717] mb-2">Upload PDF Document</label>
              <div className="border-2 border-dashed border-[#D8D1C3] rounded-xl p-8 text-center hover:border-[#171717]/40 transition-colors bg-[#FDFBF7]">
                <input 
                  type="file" 
                  accept=".pdf,application/pdf" 
                  onChange={handleFileChange} 
                  disabled={isSubmitting}
                  className="hidden" 
                  id="pdf-upload" 
                />
                <label htmlFor="pdf-upload" className={`flex flex-col items-center gap-3 ${isSubmitting ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}>
                  <div className="w-12 h-12 rounded-full bg-[#F5E5EE] text-[#171717] border border-[#D8D1C3]/60 flex items-center justify-center">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="12" y1="18" x2="12" y2="12"></line><line x1="9" y1="15" x2="15" y2="15"></line></svg>
                  </div>
                  <div>
                    <span className="font-bold text-[#171717] hover:underline transition-colors">Click to upload</span>
                    <span className="text-[#858174] font-medium"> or drag and drop</span>
                  </div>
                  {newAssignment.pdf ? (
                    <div className="flex items-center gap-2 mt-2 bg-white px-3 py-1.5 rounded-lg border border-[#D8D1C3] shadow-xs">
                      <svg className="w-4 h-4 text-red-600" fill="currentColor" viewBox="0 0 24 24"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>
                      <span className="text-sm font-bold text-[#171717]">{newAssignment.pdf.name}</span>
                      <span className="text-xs text-[#858174]">({(newAssignment.pdf.size / 1024).toFixed(1)} KB)</span>
                    </div>
                  ) : (
                    <p className="text-xs text-[#858174] mt-1">PDF document up to 10MB</p>
                  )}
                </label>
              </div>
            </div>
            
            <div>
              <label className="flex items-center gap-3 cursor-pointer mt-4 p-4 rounded-xl border border-[#D8D1C3] bg-[#FDFBF7] hover:bg-[#F5E5EE]/50 transition-colors">
                <input 
                  type="checkbox" 
                  checked={newAssignment.checkSimilarity || false} 
                  onChange={(e) => setNewAssignment({...newAssignment, checkSimilarity: e.target.checked})}
                  disabled={isSubmitting}
                  className="w-5 h-5 accent-[#171717] rounded" 
                />
                <span className="text-sm font-bold text-[#171717]">Check Similarity Status</span>
              </label>
            </div>
            <div className="pt-4 flex justify-end gap-3">
              <button 
                type="submit" 
                disabled={isSubmitting}
                className="bg-[#171717] hover:bg-[#2b2b2b] disabled:opacity-50 disabled:cursor-not-allowed text-[#F8F3E6] px-8 py-3 rounded-xl active:scale-95 transition-all duration-200 shadow-sm font-bold text-sm flex items-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                    </svg>
                    Saving to Google Drive...
                  </>
                ) : (
                  uploadError ? 'Retry Upload' : 'Publish Assignment'
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  const renderContent = (br, yr, sec) => {
    const sectionAssignments = backendAssignments.filter(a => {
      const deptMatch = isMatchingDept(a.department, br);
      const yearMatch = !a.year || String(a.year).trim().toLowerCase() === String(yr).trim().toLowerCase();
      const secMatch = isMatchingSec(a.section, sec);
      return deptMatch && yearMatch && secMatch;
    });
    return (
      <div className="space-y-4">
         <div className="flex justify-between items-center mb-2">
            <span className="text-xs font-bold text-[#858174]">
              {sectionAssignments.length} Assignment{sectionAssignments.length === 1 ? '' : 's'}
            </span>
            <button 
              onClick={() => { 
                setIsCreating(true); 
                setCreationContext({br, yr, sec}); 
                setUploadError(null);
                setUploadErrorCode(null);
                setUploadSuccessMessage(null);
                setIdempotencyKey(`asg_idem_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`);
              }}
              className="flex items-center gap-2 bg-[#171717] hover:bg-[#2b2b2b] text-[#F8F3E6] px-3.5 py-1.5 rounded-xl active:scale-95 transition-all shadow-xs font-bold text-xs"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
              Create Assignment
            </button>
         </div>
         {isLoadingAssignments ? (
           <div className="py-8 text-center bg-[#FDFBF7] rounded-xl border border-[#D8D1C3]/60">
             <div className="inline-block animate-spin rounded-full h-6 w-6 border-2 border-[#171717] border-t-transparent mb-2"></div>
             <p className="text-xs font-medium text-[#858174]">Loading assignments...</p>
           </div>
         ) : assignmentsError ? (
           <div className="p-4 rounded-xl border border-red-200 bg-red-50 text-red-800 text-xs font-medium flex items-center justify-between">
             <span>{assignmentsError}</span>
             <button onClick={fetchAssignments} className="underline font-bold hover:text-red-900 ml-2">Retry</button>
           </div>
         ) : sectionAssignments.length === 0 ? (
           <div className="py-8 text-center bg-[#FDFBF7] rounded-xl border border-[#D8D1C3]/60">
             <p className="text-sm font-bold text-[#171717] mb-1">No assignments created yet</p>
             <p className="text-xs font-medium text-[#858174]">Create your first assignment for {br} • {yr} • {sec} using the button above.</p>
           </div>
         ) : (
           <div className="space-y-3">
             {sectionAssignments.map(a => (
               <div key={a.id} onClick={() => setViewingAssignment({ ...a, br, yr, sec })} className="flex items-center justify-between p-4 rounded-xl border border-[#D8D1C3]/60 bg-[#FDFBF7] hover:bg-[#F5E5EE]/50 hover:border-[#D8D1C3] cursor-pointer group transition-all">
                  <div>
                    <h4 className="font-bold text-[#171717] transition-colors">{a.title}</h4>
                    <p className="text-xs font-medium text-[#858174] mt-1">Due: {a.dueDate} • Total Marks: {a.total || 20}</p>
                  </div>
                  <div className="flex items-center gap-2.5">
                     {a.storageProvider === 'google_drive' ? (
                       <span className="px-2.5 py-0.5 rounded-lg text-[11px] font-bold border bg-[#B7C9EA]/25 text-[#1b3a5b] border-[#B7C9EA]/50 flex items-center gap-1" title="Stored in teacher's private Google Drive">
                         <svg className="w-3 h-3 text-[#1b3a5b]" fill="currentColor" viewBox="0 0 24 24"><path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z"/></svg>
                         Google Drive
                       </span>
                     ) : a.storageProvider === 'local_draft' ? (
                       <span className="px-2.5 py-0.5 rounded-lg text-[11px] font-bold border bg-[#F3D75E]/20 text-[#6B5900] border-[#F3D75E]/40" title="Memory only - not saved to cloud">
                         Local Draft
                       </span>
                     ) : null}
                     <span className={`px-3 py-1 rounded-lg text-xs font-bold border ${a.status === 'Active' ? 'bg-[#A9BD78]/25 text-[#273811] border-[#A9BD78]/45' : 'bg-white text-[#858174] border-[#D8D1C3]'}`}>{a.status}</span>
                     <svg className="w-5 h-5 text-[#858174] group-hover:text-[#171717] transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path></svg>
                  </div>
               </div>
             ))}
           </div>
         )}
      </div>
    );
  };

  
    const defaultAlloc = allocations?.[0] || null;
    const { br, yr, sec, scopeText } = resolveAcademicScope(group, defaultAlloc);

    if (br === "Unknown" && (!allocations || allocations.length === 0)) {
      return (
        <div className="space-y-6 animate-fade-in relative z-10 pb-10">
          <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">ASSIGNMENTS</h2>
          <div className="bg-white rounded-[24px] border border-slate-100 p-12 text-center shadow-[0_2px_20px_rgba(0,0,0,0.02)]">
            <p className="text-slate-500 font-medium">No class allocated for assignments.</p>
          </div>
        </div>
      );
    }

    return (
       <div className="space-y-6 animate-fade-in relative z-10 pb-10">
         <div className="flex flex-col">
            <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">ASSIGNMENTS</h2>
            <span className="text-sm font-bold text-slate-500 mt-1">{br} · {yr} · {scopeText}</span>
         </div>
         {renderContent(br, yr, sec)}
       </div>
    );
}

export function AttendanceView({ group, userProfile, allocations = [], isLoadingAllocations = false }) {
  const [selectedAllocIndex, setSelectedAllocIndex] = useState(0);

  const activeAlloc = (!group && allocations && allocations.length > 0) 
    ? (allocations[selectedAllocIndex] || allocations[0]) 
    : null;

  const { br, yr, sec, scopeText } = resolveAcademicScope(group, activeAlloc);

  // Display label preserves academic branch (e.g. "Mechanical Engineering", "CSE AI")
  const displayBranch = br !== "Unknown" ? br : (activeAlloc?.department || userProfile?.department || "Unassigned");
  const effectiveYear = yr !== "Unknown" ? yr : (activeAlloc?.year || "1st Year");
  const rawSection = (group?.path && group.path.length >= 6) 
    ? group.path[5] 
    : (sec.includes('·') ? sec.split('·')[0].trim() : (sec === 'All Sections' ? (activeAlloc?.section || 'Sec A') : sec));
  const institution = userProfile?.institution || group?.path?.[0] || activeAlloc?.institution || 'UEMK';

  // Canonical mapping from academic hierarchy display branch to Firestore department names
  const CANONICAL_DEPARTMENT_MAP = {
    'CSE AI': 'Computer Science',
    'CSE': 'Computer Science',
    'Computer Science': 'Computer Science',
    'IT': 'Information Technology',
    'Information Technology': 'Information Technology',
    'ECE': 'Electronics & Communication',
    'Electronics & Communication': 'Electronics & Communication',
    'EE': 'Electrical Engineering',
    'Electrical Engineering': 'Electrical Engineering',
    'ME': 'Mechanical Engineering',
    'Mechanical Engineering': 'Mechanical Engineering',
    'CE': 'Civil Engineering',
    'Civil Engineering': 'Civil Engineering',
    'BT': 'Biotechnology',
    'Biotechnology': 'Biotechnology',
    'Management': 'Management'
  };

  // Canonical department for Firestore querying, session documents, and rules authorization
  const canonicalDepartment = CANONICAL_DEPARTMENT_MAP[displayBranch] || userProfile?.department || displayBranch;
  const date = getTodayDateString();
  const teacherUid = userProfile?.uid || auth?.currentUser?.uid || '';

  // Manual teaching period selection: initialized with current period if valid teaching period,
  // falling back safely to the first teaching period (P1) if currently break period or outside teaching hours.
  const [selectedPeriod, setSelectedPeriod] = useState(() => {
    const cur = getCurrentPeriod();
    return (TEACHING_PERIODS && TEACHING_PERIODS.includes(cur)) ? cur : (TEACHING_PERIODS?.[0] || 1);
  });

  const [studentsList, setStudentsList] = useState([]);
  const [isLoadingStudents, setIsLoadingStudents] = useState(true);
  const [attendanceData, setAttendanceData] = useState({});
  const [saveStatus, setSaveStatus] = useState(null); // null | 'saving' | 'saved' | 'error'
  const [errorMessage, setErrorMessage] = useState('');
  const [hasSavedToday, setHasSavedToday] = useState(false);

  const sessionInfo = {
    institution,
    department: canonicalDepartment,
    year: effectiveYear,
    section: rawSection,
    date,
    period: selectedPeriod
  };
  const sessionId = generateSessionId(sessionInfo);

  // Load active approved students and existing session records
  useEffect(() => {
    let isCancelled = false;

    async function loadAttendanceData() {
      if (!group && (!allocations || allocations.length === 0)) {
        setIsLoadingStudents(false);
        return;
      }

      setIsLoadingStudents(true);
      setErrorMessage('');
      try {
        const fetchedStudents = await fetchStudentsForSection({
          institution,
          department: canonicalDepartment,
          year: effectiveYear,
          section: rawSection
        });

        if (isCancelled) return;
        setStudentsList(fetchedStudents);

        // Fetch existing attendance records if marked earlier today (isolated to avoid masking student loading)
        let existingRecords = {};
        try {
          existingRecords = await fetchSessionAttendanceRecords(sessionId, institution, canonicalDepartment);
        } catch (recErr) {
          console.warn('[Attendance:SessionRecordsQueryError]', {
            code: recErr?.code || 'unknown',
            message: recErr?.message || String(recErr),
            sessionId,
            institution,
            queryDepartment: canonicalDepartment,
            authUid: auth?.currentUser?.uid || null
          });
        }

        if (isCancelled) return;

        if (existingRecords && Object.keys(existingRecords).length > 0) {
          // Preserve previously saved statuses from Firestore
          const mergedData = {};
          fetchedStudents.forEach(st => {
            mergedData[st.id] = existingRecords[st.id] || 'Present';
          });
          setAttendanceData(mergedData);
          setHasSavedToday(true);
        } else {
          // Default all loaded students to Present
          const initData = {};
          fetchedStudents.forEach(st => {
            initData[st.id] = 'Present';
          });
          setAttendanceData(initData);
          setHasSavedToday(false);
        }
      } catch (err) {
        if (!isCancelled) {
          console.error('[Attendance:StudentRosterQueryError]', {
            code: err?.code || 'unknown',
            message: err?.message || String(err),
            queryDepartment: canonicalDepartment,
            effectiveYear,
            rawSection,
            authUid: auth?.currentUser?.uid || null,
            authEmail: auth?.currentUser?.email || null,
            profileDepartment: userProfile?.department || null,
            profileInstitution: userProfile?.institution || null,
            profileRole: userProfile?.role || null,
            profileStatus: userProfile?.status || null
          });
          const isPermDenied = err?.code === 'permission-denied' || String(err?.message || '').toLowerCase().includes('permission');
          const cleanMsg = isPermDenied
            ? 'Permission denied: You are not authorized to view student records for this department.'
            : 'Could not load students. Please verify connection and permissions.';
          setErrorMessage(cleanMsg);
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingStudents(false);
        }
      }
    }

    loadAttendanceData();
    return () => { isCancelled = true; };
  }, [sessionId, canonicalDepartment, effectiveYear, rawSection, userProfile?.uid, userProfile?.institution, userProfile?.department, selectedAllocIndex, allocations?.length]);

  if (!group && isLoadingAllocations) {
    return (
      <div className="space-y-6 animate-hero-fade-up relative z-10 pb-10" style={{ animationDuration: '400ms' }}>
        <h2 className="text-2xl font-extrabold text-[#171717] tracking-tight">ATTENDANCE</h2>
        <div className="bg-white/80 rounded-[24px] border border-[#D8D1C3] p-12 text-center shadow-xs">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-[#171717] border-t-transparent mb-3"></div>
          <p className="text-sm font-medium text-[#858174]">Loading attendance allocations...</p>
        </div>
      </div>
    );
  }

  if (!group && !isLoadingAllocations && (!allocations || allocations.length === 0)) {
    return (
      <div className="space-y-6 animate-hero-fade-up relative z-10 pb-10" style={{ animationDuration: '400ms' }}>
        <h2 className="text-2xl font-extrabold text-[#171717] tracking-tight">ATTENDANCE</h2>
        <div className="bg-white/80 rounded-[24px] border border-[#D8D1C3] p-12 text-center shadow-xs">
          <div className="w-16 h-16 rounded-2xl bg-[#F5E5EE] text-[#171717] border border-[#D8D1C3]/60 flex items-center justify-center mx-auto mb-4">
            <Icons.Attendance />
          </div>
          <h3 className="text-xl font-bold text-[#171717] mb-2">No Classes Assigned</h3>
          <p className="text-sm font-medium text-[#858174] max-w-md mx-auto">
            You do not currently have any class allocations. Please contact your Director to assign your department, year, and section.
          </p>
        </div>
      </div>
    );
  }

  const handleMarkAll = (status) => {
    if (studentsList.length === 0) return;

    const nextLocal = {};
    studentsList.forEach(st => {
      nextLocal[st.id] = status;
      markPeriodAttendance(st.id, status);
    });

    setAttendanceData(nextLocal);
    setSaveStatus(null);
  };

  const toggleStudentAttendance = (studentId) => {
    const prevStatus = attendanceData[studentId] || 'Present';
    const newStatus = prevStatus === 'Present' ? 'Absent' : 'Present';
    setAttendanceData(prev => ({
      ...prev,
      [studentId]: newStatus
    }));
    markPeriodAttendance(studentId, newStatus);
    setSaveStatus(null);
  };

  const handleSaveAttendance = async () => {
    if (studentsList.length === 0) return;
    if (!teacherUid) {
      setErrorMessage('Cannot save attendance: Authenticated faculty account required.');
      return;
    }

    setSaveStatus('saving');
    setErrorMessage('');

    const payloadMap = {};
    studentsList.forEach(st => {
      const status = attendanceData[st.id] || 'Present';
      payloadMap[st.id] = {
        status,
        name: st.name,
        roll: st.roll
      };
      markPeriodAttendance(st.id, status);
    });

    try {
      await savePeriodAttendance({
        sessionInfo,
        studentStatuses: payloadMap,
        teacherUid
      });
      setSaveStatus('saved');
      setHasSavedToday(true);
      setTimeout(() => setSaveStatus(null), 4000);
    } catch (err) {
      console.error('Failed to save period attendance:', err);
      if (err?.diagnostic) {
        console.warn('[Attendance Write Diagnostic]:', err.diagnostic);
      }
      setSaveStatus('error');
      const isPermDenied = err?.code === 'permission-denied' || String(err?.message || '').toLowerCase().includes('permission');
      
      let msg = 'Failed to save attendance: ';
      if (err?.diagnostic?.failedWrite && err.diagnostic.failedWrite !== 'unknown') {
        if (err.diagnostic.failedWrite === 'attendance_records') {
          msg += `Permission denied on student records (${err.diagnostic.ruleTarget}). Student profile data in database (e.g. section naming CSE-C vs Sec C, or missing academic year) does not match class allocation rules.`;
        } else if (err.diagnostic.failedWrite.includes('attendance_sessions')) {
          msg += `Permission denied on class session (${err.diagnostic.ruleTarget}). Faculty allocation is missing or unauthorized for this class.`;
        } else {
          msg += err.diagnostic.reason || 'Permission denied.';
        }
      } else {
        msg += isPermDenied ? 'Permission denied. Ensure your faculty account is authorized for this class.' : (err?.message || 'Please verify connection and permissions.');
      }
      setErrorMessage(msg);
    }
  };

  const presentCount = studentsList.filter(st => (attendanceData[st.id] || 'Present') === 'Present').length;
  const absentCount = studentsList.length - presentCount;

  const renderContent = () => {
    if (isLoadingStudents) {
      return (
        <div className="bg-white/80 rounded-[24px] border border-[#D8D1C3] p-10 text-center shadow-xs">
          <div className="flex items-center justify-center gap-2 mb-2">
            <svg className="animate-spin h-5 w-5 text-[#171717]" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <p className="text-[#171717] font-bold text-sm">Loading attendance roster for {displayBranch}...</p>
          </div>
          <p className="text-xs text-[#858174]">Fetching student records and past session data from Firestore.</p>
        </div>
      );
    }

    if (errorMessage && studentsList.length === 0) {
      return (
        <div className="space-y-4">
          <div className="p-4 bg-[#EFA9D1]/20 border border-[#EFA9D1]/50 text-[#5e193c] text-xs font-semibold rounded-2xl flex items-start gap-2.5">
            <span className="text-sm">⚠️</span>
            <div className="flex-1">
              <p className="font-bold mb-0.5">Attendance Access Error</p>
              <p className="leading-relaxed">{errorMessage}</p>
            </div>
          </div>
        </div>
      );
    }

    if (studentsList.length === 0) {
      return (
        <div className="bg-white/80 rounded-[24px] border border-[#D8D1C3] p-10 text-center shadow-xs">
          <p className="text-[#171717] font-bold mb-1">No active approved students found</p>
          <p className="text-xs text-[#858174]">Ensure students in {displayBranch} • {effectiveYear} • {rawSection} have been registered and approved by the Director.</p>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {/* Error message banner */}
        {errorMessage && (
          <div className="p-3 bg-[#EFA9D1]/20 border border-[#EFA9D1]/50 text-[#5e193c] text-xs font-semibold rounded-xl flex items-center justify-between gap-2">
            <span>{errorMessage}</span>
            <button onClick={() => setErrorMessage('')} className="text-[#5e193c] hover:opacity-80 font-bold text-sm leading-none">✕</button>
          </div>
        )}

        {/* Action Header & Feedback Badges */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2">
          <div className="flex flex-wrap items-center gap-2">
            {saveStatus === 'saving' && (
              <span className="text-xs font-bold text-[#45380b] bg-[#F3D75E]/30 border border-[#F3D75E]/50 px-3 py-1.5 rounded-lg animate-pulse flex items-center gap-1.5">
                <svg className="animate-spin h-3.5 w-3.5 text-[#45380b]" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Saving to Firestore...
              </span>
            )}
            {saveStatus === 'saved' && (
              <span className="text-xs font-bold text-[#273811] bg-[#A9BD78]/25 border border-[#A9BD78]/50 px-3 py-1.5 rounded-lg flex items-center gap-1.5 animate-fade-in shadow-xs">
                ✓ Saved to Firestore (Period {selectedPeriod}: {presentCount} Present, {absentCount} Absent)
              </span>
            )}
            {saveStatus === 'error' && (
              <span className="text-xs font-bold text-[#5e193c] bg-[#EFA9D1]/25 border border-[#EFA9D1]/50 px-3 py-1.5 rounded-lg flex items-center gap-1.5">
                ✕ Save failed
              </span>
            )}
            {!saveStatus && hasSavedToday && (
              <span className="text-xs font-semibold text-[#171717] bg-white border border-[#D8D1C3] px-2.5 py-1 rounded-lg flex items-center gap-1 shadow-xs">
                ✓ Recorded in Firestore (Period {selectedPeriod})
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button 
              type="button"
              onClick={() => handleMarkAll('Present')} 
              className="text-xs font-bold text-[#273811] bg-[#A9BD78]/25 hover:bg-[#A9BD78]/35 px-3 py-2 rounded-xl transition-colors border border-[#A9BD78]/50 active:scale-95 shadow-xs"
            >
              Mark All Present
            </button>
            <button 
              type="button"
              onClick={() => handleMarkAll('Absent')} 
              className="text-xs font-bold text-[#5e193c] bg-[#EFA9D1]/25 hover:bg-[#EFA9D1]/35 px-3 py-2 rounded-xl transition-colors border border-[#EFA9D1]/50 active:scale-95 shadow-xs"
            >
              Mark All Absent
            </button>
            <button 
              type="button"
              id="save-attendance-btn"
              onClick={handleSaveAttendance} 
              disabled={saveStatus === 'saving' || studentsList.length === 0}
              className="px-5 py-2 bg-[#171717] hover:bg-[#2b2b2b] text-[#F8F3E6] text-xs font-bold rounded-xl shadow-xs hover:shadow transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 active:scale-95"
            >
              {saveStatus === 'saving' ? (
                <>
                  <svg className="animate-spin h-3.5 w-3.5 text-[#F8F3E6]" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Saving...
                </>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                    <polyline points="17 21 17 13 7 13 7 21"></polyline>
                    <polyline points="7 3 7 8 15 8"></polyline>
                  </svg>
                  Save Attendance
                </>
              )}
            </button>
          </div>
        </div>

        {/* Student Roster Cards */}
        <div className="space-y-3">
          {studentsList.map((st, idx) => {
             const status = attendanceData[st.id] || 'Present';
             return (
               <div key={st.id} className="flex items-center justify-between p-3.5 rounded-xl border border-[#D8D1C3]/60 bg-[#FDFBF7] hover:border-[#D8D1C3] hover:bg-[#F5E5EE]/30 transition-all">
                 <div className="flex items-center gap-4">
                   <span className="text-[#858174] font-bold w-6 text-right text-xs">{idx + 1}.</span>
                   <div className="w-9 h-9 rounded-full bg-[#F5E5EE] text-[#171717] font-bold flex items-center justify-center text-sm border border-[#D8D1C3]/60">
                     {st.name.charAt(0)}
                   </div>
                   <div className="flex flex-col">
                     <span className="font-bold text-[#171717] text-sm">{st.name}</span>
                     <span className="text-[11px] font-medium text-[#858174]">{st.roll || st.email}</span>
                   </div>
                 </div>
                 <button 
                   type="button"
                   onClick={() => toggleStudentAttendance(st.id)} 
                   className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all border shadow-xs active:scale-95 ${
                     status === 'Present' 
                       ? 'bg-[#A9BD78]/25 text-[#273811] border-[#A9BD78]/50 hover:bg-[#A9BD78]/35' 
                       : 'bg-[#EFA9D1]/25 text-[#5e193c] border-[#EFA9D1]/50 hover:bg-[#EFA9D1]/35'
                   }`}
                   title="Click to toggle Present/Absent"
                 >
                   {status}
                 </button>
               </div>
             );
          })}
        </div>

        {/* Bottom Actions Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 bg-white/90 border border-[#D8D1C3] rounded-2xl shadow-xs mt-4">
          <div className="text-xs font-bold text-[#858174] flex items-center gap-3">
            <span>Roster: <strong className="text-[#171717]">{studentsList.length}</strong> students</span>
            <span className="text-[#D8D1C3]">•</span>
            <span className="text-[#273811]">Present: <strong>{presentCount}</strong></span>
            <span className="text-[#D8D1C3]">•</span>
            <span className="text-[#5e193c]">Absent: <strong>{absentCount}</strong></span>
          </div>
          <button 
            type="button"
            onClick={handleSaveAttendance} 
            disabled={saveStatus === 'saving' || studentsList.length === 0}
            className="w-full sm:w-auto px-6 py-2.5 bg-[#171717] hover:bg-[#2b2b2b] text-[#F8F3E6] text-xs font-bold rounded-xl shadow-xs hover:shadow transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 active:scale-95"
          >
            {saveStatus === 'saving' ? (
              <>
                <svg className="animate-spin h-3.5 w-3.5 text-[#F8F3E6]" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Saving Attendance...
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                  <polyline points="17 21 17 13 7 13 7 21"></polyline>
                  <polyline points="7 3 7 8 15 8"></polyline>
                </svg>
                {hasSavedToday ? 'Update Attendance' : 'Save Attendance'}
              </>
            )}
          </button>
        </div>
      </div>
    );
  };

  const displayYear = effectiveYear;

  return (
     <div className="space-y-6 animate-fade-in relative z-10 pb-10">
       <div className="flex flex-col">
          <h2 className="text-2xl font-extrabold text-[#171717] tracking-tight">ATTENDANCE</h2>
          <span className="text-sm font-bold text-[#858174] mt-1">{displayBranch} · {displayYear} · {scopeText}</span>
          {!group && allocations && allocations.length > 1 && (
            <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-[#D8D1C3]/60">
              <span className="text-xs font-bold text-[#858174] uppercase tracking-wider mr-1">Select Class:</span>
              {allocations.map((alloc, idx) => {
                const isSelected = selectedAllocIndex === idx;
                return (
                  <button
                    key={alloc.id || idx}
                    type="button"
                    onClick={() => setSelectedAllocIndex(idx)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                      isSelected
                        ? 'bg-[#171717] text-[#F8F3E6] shadow-xs'
                        : 'bg-white border border-[#D8D1C3] text-[#171717] hover:bg-[#F5E5EE]'
                    }`}
                  >
                    {alloc.department} • {alloc.year} • {alloc.section}
                  </button>
                );
              })}
            </div>
          )}
          {/* Compact Teaching Period Selector */}
          <div className="flex flex-wrap items-center gap-1.5 mt-2.5 pt-2.5 border-t border-[#D8D1C3]/60">
            <span className="text-xs font-bold text-[#858174] uppercase tracking-wider mr-1">Period:</span>
            {TEACHING_PERIODS.map(p => {
              const isSelected = selectedPeriod === p;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => {
                    setSelectedPeriod(p);
                    setSaveStatus(null);
                  }}
                  className={`px-2.5 py-1 rounded-xl text-xs font-bold transition-all ${
                    isSelected
                      ? 'bg-[#171717] text-[#F8F3E6] shadow-xs'
                      : 'bg-white border border-[#D8D1C3] text-[#171717] hover:bg-[#F5E5EE]'
                  }`}
                >
                  Period {p}
                </button>
              );
            })}
          </div>
       </div>
       {renderContent()}
     </div>
  );
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
    return (
      <GradesSectionContent
        br={br}
        yr={yr}
        sec={sec}
        userProfile={userProfile}
        marksData={marksData}
        gradesData={gradesData}
        onMarksChange={handleMarksChange}
        onGradeChange={handleGradeChange}
      />
    );
  };

  return <TreeHierarchy title="Grades & Marks" tree={tree} branches={branches} renderContent={renderContent} expandedNodes={expandedNodes} toggleNode={toggleNode} />;
}

export function AnnouncementsView({ userProfile, allocations = [], isLoadingAllocations = false }) {
  const [announcementList, setAnnouncementList] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Form states
  const [isPostingOpen, setIsPostingOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [postError, setPostError] = useState(null);
  const [postSuccess, setPostSuccess] = useState(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [selectedAllocIndex, setSelectedAllocIndex] = useState(0);
  const [priority, setPriority] = useState('normal');

  // Filter valid, authorized allocations
  const validAllocations = Array.isArray(allocations)
    ? allocations.filter(a => a.authorized !== false && a.department && a.year && a.section)
    : [];

  const loadAnnouncements = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchAnnouncements({ page: 1, limit: 50 });
      setAnnouncementList(Array.isArray(data?.announcements) ? data.announcements : []);
    } catch (err) {
      console.warn('[AnnouncementsView] Error loading announcements:', err.message);
      setError(err.message || 'Failed to load announcements.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAnnouncements();
  }, [userProfile?.uid]);

  const handlePost = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    setPostError(null);
    setPostSuccess(null);

    if (validAllocations.length === 0) {
      setPostError('You do not have any authorized class allocations to post to. Please contact your Director.');
      return;
    }

    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setPostError('Please enter an announcement title.');
      return;
    }
    if (cleanTitle.length > 200) {
      setPostError('Title must be 200 characters or less.');
      return;
    }

    const cleanContent = content.trim();
    if (!cleanContent) {
      setPostError('Please enter announcement content.');
      return;
    }
    if (cleanContent.length > 5000) {
      setPostError('Content must be 5000 characters or less.');
      return;
    }

    const targetAlloc = validAllocations[selectedAllocIndex] || validAllocations[0];
    if (!targetAlloc) {
      setPostError('Invalid target section selected.');
      return;
    }

    setIsSubmitting(true);
    try {
      await postAnnouncement({
        title: cleanTitle,
        content: cleanContent,
        scopeType: 'section',
        department: targetAlloc.department,
        year: targetAlloc.year,
        section: targetAlloc.section,
        priority
      });

      setPostSuccess('Announcement published successfully!');
      setTitle('');
      setContent('');
      setIsPostingOpen(false);
      await loadAnnouncements();
    } catch (err) {
      console.error('[AnnouncementsView] Post failed:', err.message);
      setPostError(err.message || 'Failed to publish announcement.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 animate-hero-fade-up relative z-10" style={{ animationDuration: '400ms' }}>
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-extrabold text-[#171717] tracking-tight">Announcements</h2>
          <p className="text-xs font-semibold text-[#858174] mt-0.5">Official notices for your institution and assigned class sections</p>
        </div>
        <button
          onClick={() => {
            setIsPostingOpen(!isPostingOpen);
            setPostError(null);
            setPostSuccess(null);
          }}
          className="flex items-center gap-2 bg-[#171717] hover:bg-[#2b2b2b] text-[#F8F3E6] px-5 py-2.5 rounded-xl active:scale-95 transition-all duration-200 shadow-xs font-bold text-sm cursor-pointer"
        >
          <Icons.Plus /> {isPostingOpen ? 'Close Form' : 'Post Announcement'}
        </button>
      </div>

      {/* Post Success Banner */}
      {postSuccess && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-800 text-sm font-semibold flex items-center justify-between animate-hero-fade-up">
          <span>{postSuccess}</span>
          <button onClick={() => setPostSuccess(null)} className="text-emerald-700 hover:text-emerald-900 text-xs font-bold cursor-pointer">✕</button>
        </div>
      )}

      {/* Post Announcement Form */}
      {isPostingOpen && (
        <div className="bg-[#F8F3E6] border border-[#D8D1C3] rounded-[24px] p-6 shadow-xs animate-hero-fade-up">
          <h3 className="text-base font-extrabold text-[#171717] mb-4">Post Section Announcement</h3>

          {postError && (
            <div className="p-3.5 mb-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs font-semibold">
              {postError}
            </div>
          )}

          {validAllocations.length === 0 ? (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs font-medium">
              You do not have any authorized class allocations. Faculty may only publish announcements to their authorized sections. Please contact your Director.
            </div>
          ) : (
            <form onSubmit={handlePost} className="space-y-4">
              {validAllocations.length === 1 ? (
                <div className="text-xs font-bold text-[#858174] bg-white/70 border border-[#D8D1C3]/70 px-4 py-2.5 rounded-xl">
                  Target Section: <span className="text-[#171717]">{validAllocations[0].department} • {validAllocations[0].year} • {validAllocations[0].section}{validAllocations[0].subject ? ` (${validAllocations[0].subject})` : ''}</span>
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-bold text-[#171717] mb-1.5">Target Section</label>
                  <select
                    value={selectedAllocIndex}
                    onChange={(e) => setSelectedAllocIndex(Number(e.target.value))}
                    className="w-full px-4 py-2.5 bg-white border border-[#D8D1C3] rounded-xl text-xs font-semibold text-[#171717] focus:outline-none focus:border-[#171717] transition-all"
                  >
                    {validAllocations.map((alloc, idx) => (
                      <option key={`${alloc.department}_${alloc.year}_${alloc.section}_${idx}`} value={idx}>
                        {alloc.department} • {alloc.year} • {alloc.section}{alloc.subject ? ` (${alloc.subject})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-[#171717] mb-1.5">Announcement Title</label>
                <input
                  type="text"
                  placeholder="e.g. Midterm Syllabus & Lab Schedule"
                  maxLength={200}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-4 py-2.5 bg-white border border-[#D8D1C3] rounded-xl focus:outline-none focus:border-[#171717] text-xs font-semibold text-[#171717] transition-all"
                />
              </div>

              <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-[#171717]">Priority:</span>
                <button
                  type="button"
                  onClick={() => setPriority('normal')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${priority === 'normal' ? 'bg-[#171717] text-white shadow-xs' : 'bg-white border border-[#D8D1C3] text-[#858174]'}`}
                >
                  Normal
                </button>
                <button
                  type="button"
                  onClick={() => setPriority('urgent')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${priority === 'urgent' ? 'bg-red-600 text-white shadow-xs' : 'bg-white border border-[#D8D1C3] text-[#858174]'}`}
                >
                  Urgent
                </button>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#171717] mb-1.5">Announcement Body</label>
                <textarea
                  placeholder="Write the full announcement message here..."
                  rows={4}
                  maxLength={5000}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  className="w-full px-4 py-3 bg-white border border-[#D8D1C3] rounded-xl focus:outline-none focus:border-[#171717] text-xs font-medium text-[#171717] transition-all resize-none"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsPostingOpen(false);
                    setPostError(null);
                  }}
                  className="px-5 py-2.5 rounded-xl text-[#858174] font-bold hover:bg-[#F5E5EE] transition-colors text-xs cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-6 py-2.5 rounded-xl bg-[#171717] hover:bg-[#2b2b2b] text-[#F8F3E6] font-bold shadow-xs transition-all text-xs cursor-pointer active:scale-95 disabled:opacity-50"
                >
                  {isSubmitting ? 'Publishing...' : 'Publish Announcement'}
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* Announcements List Container */}
      {isLoading ? (
        <div className="bg-white/80 rounded-[24px] border border-[#D8D1C3] p-12 text-center text-[#858174] font-medium text-sm shadow-xs">
          Loading announcements...
        </div>
      ) : error ? (
        <div className="bg-red-50/80 border border-red-200 rounded-[24px] p-6 text-red-700 flex justify-between items-center text-sm font-medium shadow-xs">
          <span>{error}</span>
          <button
            onClick={loadAnnouncements}
            className="px-4 py-2 bg-red-700 text-white rounded-xl font-bold text-xs hover:bg-red-800 transition-all cursor-pointer"
          >
            Retry
          </button>
        </div>
      ) : announcementList.length === 0 ? (
        <div className="bg-white/80 rounded-[24px] border border-[#D8D1C3] p-12 text-center shadow-xs">
          <div className="w-16 h-16 rounded-2xl bg-[#F5E5EE] text-[#171717] border border-[#D8D1C3]/60 flex items-center justify-center mx-auto mb-4">
            <Icons.Announcements />
          </div>
          <h3 className="text-xl font-bold text-[#171717] mb-2">No Announcements Yet</h3>
          <p className="text-sm font-medium text-[#858174] max-w-md mx-auto">
            There are currently no announcements for your institution or assigned class sections.
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {announcementList.map(a => (
            <div key={a.id} className="bg-white/80 rounded-[24px] border border-[#D8D1C3] p-6 shadow-xs hover:border-[#171717]/30 hover:shadow-md hover:-translate-y-0.5 active:scale-[0.99] transition-all duration-200 group">
              <div className="flex justify-between items-start mb-3 gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-bold text-[#171717] text-lg transition-colors">{a.title}</h3>
                  {a.priority === 'urgent' && (
                    <span className="text-[10px] font-extrabold text-white bg-red-600 px-2 py-0.5 rounded-full uppercase tracking-wider">Urgent</span>
                  )}
                </div>
                <span className="text-[11px] font-bold text-[#171717] bg-[#F5E5EE] border border-[#D8D1C3]/60 px-2.5 py-1 rounded-lg uppercase tracking-wider whitespace-nowrap">
                  {a.createdAt ? new Date(a.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : (a.date || 'Recent')}
                </span>
              </div>
              <p className="text-sm text-[#858174] mb-4 leading-relaxed font-medium transition-colors whitespace-pre-line">{a.content}</p>
              <div className="flex items-center justify-between flex-wrap gap-2 pt-1 border-t border-[#D8D1C3]/40">
                <span className="text-xs font-bold text-[#1b2b48] bg-[#B7C9EA]/25 border border-[#B7C9EA]/50 px-3 py-1 rounded-lg inline-block">
                  {a.scopeType === 'institution'
                    ? 'Institution-wide'
                    : a.scopeType === 'branch'
                    ? `Branch: ${a.department}`
                    : a.scopeType === 'year'
                    ? `Year: ${a.department || ''} • ${a.year || ''}`
                    : `Class: ${a.department || ''} • ${a.year || ''} • ${a.section || ''}`.replace(/^Class:\s*•\s*/, 'Class: ')}
                </span>
                {a.authorName && (
                  <span className="text-xs font-medium text-[#858174]">
                    By {a.authorName}{a.authorRole ? ` (${a.authorRole.charAt(0).toUpperCase() + a.authorRole.slice(1)})` : ''}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ScheduleView({ userProfile, allocations = [], isLoadingAllocations = false }) {
  const [selectedDay, setSelectedDay] = useState(null);
  const [selectedClassIndex, setSelectedClassIndex] = useState(0);
  const [slots, setSlots] = useState([]);
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);

  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  // Filter valid, authorized allocations
  const validAllocations = Array.isArray(allocations)
    ? allocations.filter(a => a.authorized !== false && a.department && a.year && a.section)
    : [];

  const activeClass = validAllocations[selectedClassIndex] || validAllocations[0] || null;

  // Real-time timetable listener for the currently selected class
  useEffect(() => {
    if (!activeClass) {
      setSlots([]);
      setIsLoadingSlots(false);
      return;
    }

    setIsLoadingSlots(true);

    const institution = activeClass.institution || userProfile?.institution || 'UEMK';
    const department = activeClass.department;
    const year = activeClass.year;
    const section = activeClass.section;

    const unsubscribe = subscribeClassTimetable(
      { institution, department, year, section },
      (classSlots) => {
        setSlots(classSlots);
        setIsLoadingSlots(false);
      },
      (err) => {
        console.warn('Error fetching teacher class timetable in ScheduleView:', err);
        setIsLoadingSlots(false);
      }
    );

    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [activeClass, userProfile?.institution]);

  // Compute period count per day for the active class
  const dayPeriodCounts = {};
  days.forEach(d => { dayPeriodCounts[d] = 0; });
  slots.forEach(s => {
    if (dayPeriodCounts[s.day] !== undefined) {
      dayPeriodCounts[s.day]++;
    }
  });

  if (!isLoadingAllocations && (!allocations || validAllocations.length === 0)) {
    return (
      <div className="space-y-6 animate-hero-fade-up relative z-10" style={{ animationDuration: '400ms' }}>
        <h2 className="text-2xl font-extrabold text-[#171717] tracking-tight">Weekly Schedule</h2>
        <div className="bg-white/80 rounded-[24px] border border-[#D8D1C3] p-12 text-center shadow-xs">
          <div className="w-16 h-16 rounded-2xl bg-[#F5E5EE] text-[#171717] border border-[#D8D1C3]/60 flex items-center justify-center mx-auto mb-4">
            <Icons.Schedule />
          </div>
          <h3 className="text-xl font-bold text-[#171717] mb-2">No Classes Allocated</h3>
          <p className="text-sm font-medium text-[#858174] max-w-md mx-auto">
            You do not currently have any class allocations. Please contact your Director to assign your classes.
          </p>
        </div>
      </div>
    );
  }

  if (selectedDay) {
    const dayLiveSlots = slots.filter(s => s.day === selectedDay);
    dayLiveSlots.sort((a, b) => (Number(a.period) || 0) - (Number(b.period) || 0));

    // Render live slots from Firestore for this day
    const periodsToRender = dayLiveSlots.map(s => ({
      period: s.period,
      time: s.startTime && s.endTime ? `${s.startTime} - ${s.endTime}` : (s.time || ''),
      subject: s.subject,
      type: s.type || 'Lecture',
      classInfo: `${s.year} • ${s.department} • ${s.section}`,
      room: s.room
    }));

    return (
      <div className="space-y-6 animate-hero-fade-up relative z-10 pb-10" style={{ animationDuration: '400ms' }}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <button onClick={() => setSelectedDay(null)} className="flex items-center gap-2 bg-white border border-[#D8D1C3] text-[#171717] px-4 py-2.5 rounded-xl hover:bg-[#F5E5EE] active:scale-95 transition-all duration-200 shadow-xs font-bold text-sm">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
              Back
            </button>
            <div>
              <h2 className="text-2xl font-extrabold text-[#171717] tracking-tight">{selectedDay} Schedule</h2>
              {activeClass && (
                <p className="text-xs font-semibold text-[#858174] mt-0.5">
                  {activeClass.department} • {activeClass.year} • {activeClass.section}
                </p>
              )}
            </div>
          </div>

          {/* Class Switcher inside Day View */}
          {validAllocations.length > 1 && (
            <div className="flex items-center gap-2 bg-white/90 p-1.5 rounded-2xl border border-[#D8D1C3] shadow-xs">
              <span className="text-xs font-bold text-[#858174] pl-2">Class:</span>
              <select
                value={selectedClassIndex}
                onChange={(e) => setSelectedClassIndex(Number(e.target.value))}
                className="bg-[#F8F3E6] border-none outline-none text-xs font-bold text-[#171717] px-2 py-1 rounded-xl cursor-pointer"
              >
                {validAllocations.map((alloc, idx) => (
                  <option key={idx} value={idx}>
                    {alloc.department} • {alloc.year} • {alloc.section}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="bg-white/80 rounded-[24px] border border-[#D8D1C3] p-6 md:p-10 shadow-xs">
          {isLoadingSlots && slots.length === 0 ? (
            <div className="py-12 text-center">
              <div className="inline-block animate-spin rounded-full h-7 w-7 border-2 border-[#171717] border-t-transparent mb-2"></div>
              <p className="text-xs font-medium text-[#858174]">Loading schedule...</p>
            </div>
          ) : periodsToRender.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-sm font-bold text-[#171717]">No classes scheduled for {selectedDay}</p>
            </div>
          ) : (
            <div className="ml-2 pl-8 border-l-[2px] border-dashed border-[#D8D1C3] space-y-6">
              {periodsToRender.map(period => (
                <div key={period.period} className="relative flex items-start gap-5 group">
                  <div className="absolute -left-[33px] top-5 w-8 h-[2px] bg-[#D8D1C3] group-hover:bg-[#171717] transition-colors rounded-r-full"></div>
                  
                  <div className="bg-[#FDFBF7] border border-[#D8D1C3]/70 rounded-2xl p-5 flex-1 hover:border-[#171717]/30 hover:bg-white transition-all duration-200">
                     <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                       <div className="flex items-center gap-3">
                         <span className="text-xs font-extrabold text-[#45380b] bg-[#F3D75E]/30 border border-[#F3D75E]/50 px-3 py-1.5 rounded-lg uppercase tracking-wider">Period {period.period}</span>
                         <span className="text-sm font-bold text-[#858174]">{period.time}</span>
                       </div>
                       <span className={`text-[11px] font-bold px-3 py-1.5 rounded-lg uppercase tracking-wider border ${
                          period.type === 'Break' ? 'bg-[#F3D75E]/25 text-[#45380b] border-[#F3D75E]/50' :
                          period.type === 'Lab' ? 'bg-[#A9BD78]/25 text-[#273811] border-[#A9BD78]/50' :
                          period.type === 'Tutorial' ? 'bg-[#EFA9D1]/25 text-[#5e193c] border-[#EFA9D1]/50' :
                          period.type === 'Self Study' ? 'bg-[#858174]/20 text-[#171717] border-[#D8D1C3]' :
                          'bg-[#B7C9EA]/25 text-[#1b2b48] border-[#B7C9EA]/50'
                       }`}>{period.type}</span>
                     </div>
                     <h4 className={`text-lg font-bold ${period.type === 'Break' ? 'text-[#858174]' : 'text-[#171717]'}`}>{period.subject}</h4>
                     {period.classInfo && (
                       <p className="text-sm font-medium text-[#858174] mt-1.5">{period.classInfo}</p>
                     )}
                     {period.room && (
                       <p className="text-xs font-semibold text-[#858174] mt-1">{period.room}</p>
                     )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-hero-fade-up relative z-10" style={{ animationDuration: '400ms' }}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold text-[#171717] tracking-tight">Weekly Schedule</h2>
          {activeClass && (
            <p className="text-xs font-semibold text-[#858174] mt-0.5">
              Showing timetable for {activeClass.department} • {activeClass.year} • {activeClass.section}
            </p>
          )}
        </div>

        {validAllocations.length > 1 && (
          <div className="flex items-center gap-2 bg-white/90 p-1.5 rounded-2xl border border-[#D8D1C3] shadow-xs">
            <span className="text-xs font-bold text-[#858174] pl-2">Class:</span>
            <select
              value={selectedClassIndex}
              onChange={(e) => setSelectedClassIndex(Number(e.target.value))}
              className="bg-[#F8F3E6] border-none outline-none text-xs font-bold text-[#171717] px-2 py-1 rounded-xl cursor-pointer"
            >
              {validAllocations.map((alloc, idx) => (
                <option key={idx} value={idx}>
                  {alloc.department} • {alloc.year} • {alloc.section}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="grid gap-4">
        {days.map(day => {
          const count = dayPeriodCounts[day] || 0;
          return (
            <div key={day} onClick={() => setSelectedDay(day)} className="bg-white/80 rounded-[24px] border border-[#D8D1C3] p-6 shadow-xs hover:border-[#171717]/30 hover:shadow-md hover:-translate-y-0.5 active:scale-[0.99] flex items-center justify-between gap-5 transition-all duration-200 group cursor-pointer">
              <div className="flex items-center gap-4">
                 <div className="w-12 h-12 rounded-2xl bg-[#F5E5EE] text-[#171717] group-hover:bg-[#171717] group-hover:text-[#F8F3E6] flex items-center justify-center font-bold text-xl transition-all duration-200">
                   {day.charAt(0)}
                 </div>
                 <div>
                   <h3 className="text-xl font-bold text-[#171717] transition-colors">{day}</h3>
                   <p className="text-xs font-medium text-[#858174] mt-0.5">{count} periods scheduled</p>
                 </div>
              </div>
              <div className="text-[#858174] group-hover:text-[#171717] transition-colors group-hover:translate-x-1 duration-200">
                 <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ProfileView({ userProfile, allocations = [] }) {
  const distinctDepts = allocations.length > 0 
    ? [...new Set(allocations.map(a => a.department))].join(', ')
    : (userProfile?.department || 'Unassigned');

  const totalClasses = allocations.length;
  const uniqueSubjects = new Set(allocations.map(a => a.subject || a.department));
  const uniqueSections = new Set(allocations.map(a => `${a.year} • ${a.department} • ${a.section}`));

  const facultyName = userProfile?.name || auth?.currentUser?.displayName || 'Faculty Member';
  const facultyEmail = userProfile?.email || auth?.currentUser?.email || '';
  const facultyRole = userProfile?.role === 'faculty' ? 'Faculty Member' : (userProfile?.role || 'Faculty Member');
  const avatarLetter = (facultyName || facultyEmail || 'F').charAt(0).toUpperCase();

  return (
    <div className="space-y-8 animate-hero-fade-up relative z-10 pb-10" style={{ animationDuration: '400ms' }}>
       {/* header card */}
       <div className="bg-white/80 rounded-[32px] border border-[#D8D1C3] p-8 md:p-10 shadow-xs relative overflow-hidden flex flex-col md:flex-row items-center md:items-start gap-8 group">
           {/* decorative bg */}
           <div className="absolute top-0 right-0 w-64 h-64 bg-[#EFA9D1]/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none transition-transform duration-700 group-hover:scale-110"></div>
           
           {/* avatar */}
           <div className="w-32 h-32 md:w-40 md:h-40 rounded-3xl bg-[#F5E5EE] text-[#171717] flex items-center justify-center font-extrabold text-5xl shadow-xs border border-[#D8D1C3] flex-shrink-0 z-10 relative transition-transform duration-500 group-hover:scale-105">
              {avatarLetter}
              <div className="absolute -bottom-2 -right-2 w-8 h-8 md:w-10 md:h-10 bg-[#A9BD78] rounded-full border-4 border-white shadow-xs flex items-center justify-center" title="Active Status">
                 <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
              </div>
           </div>
           
           <div className="text-center md:text-left z-10 flex-1 pt-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#171717] text-[#F8F3E6] text-xs font-bold mb-4 shadow-xs">
                 <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                 Faculty ID: EMP-{userProfile?.uid ? userProfile.uid.substring(0, 6).toUpperCase() : '4092'}
              </div>
              <h2 className="text-3xl md:text-5xl font-extrabold text-[#171717] tracking-tight mb-3">{facultyName}</h2>
              <p className="text-lg md:text-xl font-bold text-[#858174] mb-8">{facultyRole} • <span className="text-[#171717]">{distinctDepts}</span></p>
              
              <div className="flex flex-col sm:flex-row items-center justify-center md:justify-start gap-4">
                 <div className="flex items-center gap-3 text-sm font-bold text-[#171717] bg-[#FDFBF7] hover:bg-[#F5E5EE] px-5 py-3 rounded-2xl border border-[#D8D1C3] transition-all cursor-pointer shadow-xs">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
                    {facultyEmail || 'No email registered'}
                 </div>
                 <div className="flex items-center gap-3 text-sm font-bold text-[#171717] bg-[#FDFBF7] hover:bg-[#F5E5EE] px-5 py-3 rounded-2xl border border-[#D8D1C3] transition-all cursor-pointer shadow-xs">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                    {userProfile?.institution || 'UEMK'}
                 </div>
              </div>
           </div>
       </div>

       {/* metrics */}
       <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-[#B7C9EA]/25 border border-[#B7C9EA]/50 rounded-[24px] p-8 shadow-xs hover:-translate-y-1 transition-all duration-300 relative overflow-hidden group">
             <div className="w-14 h-14 bg-white/80 text-[#1b2b48] rounded-2xl flex items-center justify-center mb-5 relative z-10 border border-[#B7C9EA]/60 shadow-xs">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
             </div>
             <h3 className="text-4xl font-extrabold text-[#171717] relative z-10 mb-1">{totalClasses}</h3>
             <p className="text-xs font-bold text-[#1b2b48] relative z-10 uppercase tracking-wider">Classes / Week</p>
          </div>
          
          <div className="bg-[#EFA9D1]/25 border border-[#EFA9D1]/50 rounded-[24px] p-8 shadow-xs hover:-translate-y-1 transition-all duration-300 relative overflow-hidden group">
             <div className="w-14 h-14 bg-white/80 text-[#5e193c] rounded-2xl flex items-center justify-center mb-5 relative z-10 border border-[#EFA9D1]/60 shadow-xs">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg>
             </div>
             <h3 className="text-4xl font-extrabold text-[#171717] relative z-10 mb-1">{uniqueSubjects.size}</h3>
             <p className="text-xs font-bold text-[#5e193c] relative z-10 uppercase tracking-wider">Subjects Taught</p>
          </div>

          <div className="bg-[#F3D75E]/25 border border-[#F3D75E]/50 rounded-[24px] p-8 shadow-xs hover:-translate-y-1 transition-all duration-300 relative overflow-hidden group">
             <div className="w-14 h-14 bg-white/80 text-[#45380b] rounded-2xl flex items-center justify-center mb-5 relative z-10 border border-[#F3D75E]/60 shadow-xs">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
             </div>
             <h3 className="text-4xl font-extrabold text-[#171717] relative z-10 mb-1">{uniqueSections.size}</h3>
             <p className="text-xs font-bold text-[#45380b] relative z-10 uppercase tracking-wider">Sections Handled</p>
          </div>
       </div>

       {/* Detailed Info */}
       <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white/80 rounded-[32px] border border-[#D8D1C3] p-8 shadow-xs">
            <h3 className="text-xl font-extrabold text-[#171717] mb-8 flex items-center gap-3">
               <div className="w-10 h-10 rounded-xl bg-[#F5E5EE] text-[#171717] flex items-center justify-center border border-[#D8D1C3]/60">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg>
               </div>
               Subjects
            </h3>
            <div className="flex flex-col gap-3">
               {Array.from(uniqueSubjects).map((subj, idx) => (
                  <div key={idx} className="flex items-center justify-between p-4 rounded-2xl bg-[#FDFBF7] border border-[#D8D1C3]/60 hover:bg-[#F5E5EE]/50 transition-all cursor-default group">
                     <span className="font-bold text-[#171717] text-base">{subj}</span>
                     <svg width="20" height="20" className="text-[#858174] group-hover:text-[#171717] transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                  </div>
               ))}
            </div>
          </div>
          
          <div className="bg-white/80 rounded-[32px] border border-[#D8D1C3] p-8 shadow-xs">
            <h3 className="text-xl font-extrabold text-[#171717] mb-8 flex items-center gap-3">
               <div className="w-10 h-10 rounded-xl bg-[#F5E5EE] text-[#171717] flex items-center justify-center border border-[#D8D1C3]/60">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
               </div>
               Sections Handled
            </h3>
            <div className="flex flex-wrap gap-3">
               {Array.from(uniqueSections).map((sec, idx) => (
                  <div key={idx} className="flex items-center gap-3 px-5 py-3 rounded-2xl bg-[#FDFBF7] border border-[#D8D1C3] shadow-xs hover:border-[#171717]/30 hover:bg-white transition-all cursor-default">
                     <div className="w-2.5 h-2.5 rounded-full bg-[#171717]"></div>
                     <span className="font-extrabold text-[#171717] text-sm">{sec}</span>
                  </div>
               ))}
            </div>
          </div>
       </div>
    </div>
  );
}

export const get85Students = (branch, year, section) => {
  const firstNames = ["Aarav", "Vivaan", "Aditya", "Vihaan", "Arjun", "Sai", "Rayaan", "Ayaan", "Krishna", "Ishaan", "Shaurya", "Atharv", "Kabir", "Omer", "Rishi", "Dhruv", "Zara", "Aanya", "Myra", "Diya", "Pari", "Saanvi", "Ananya", "Aadhya", "Kyra", "Anika", "Navya", "Avni", "Kavya", "Tara", "Riya", "Isha", "Nisha", "Ritu", "Neha"];
  const lastNames = ["Sharma", "Verma", "Gupta", "Malhotra", "Singh", "Patel", "Kumar", "Choudhary", "Jain", "Shah", "Agarwal", "Bansal", "Mehta", "Desai", "Rao", "Nair", "Reddy", "Iyer", "Pillai", "Das", "Bose", "Sen", "Roy"];
  
  const seedStr = branch + year + section;
  let seed = 0;
  for(let i = 0; i < seedStr.length; i++) seed += seedStr.charCodeAt(i);
  
  const sectionStudents = [];
  for(let i=0; i<85; i++) {
    const fn = firstNames[(seed + i * 7) % firstNames.length];
    const ln = lastNames[(seed + i * 3) % lastNames.length];
    sectionStudents.push({ 
       id: `${branch}-${year}-${section}-${i}`.replace(/\s/g, ''), 
       name: fn + ' ' + ln,
       roll: `${branch.substring(0,2).toUpperCase()}${100 + i}`
    });
  }
  return sectionStudents;
};

export function StudentsListView({ group, userProfile, allocations = [] }) {
  const defaultAlloc = allocations?.[0] || null;
  const { br, yr, sec, scopeText } = resolveAcademicScope(group, defaultAlloc);

  if (br === "Unknown" && (!allocations || allocations.length === 0)) {
    return (
      <div className="space-y-6 animate-fade-in relative z-10 pb-10">
        <h2 className="text-2xl font-extrabold text-[#171717] tracking-tight">STUDENTS</h2>
        <div className="bg-white/80 rounded-[24px] border border-[#D8D1C3] p-12 text-center shadow-xs">
          <p className="text-[#858174] font-medium">No class allocated to view student roster.</p>
        </div>
      </div>
    );
  }

  const { students: sectionStudents, isLoading, error, reload } = useSectionStudents(br, yr, sec, userProfile?.institution);

  return (
    <div className="space-y-6 animate-fade-in relative z-10 pb-10">
      <div className="flex flex-col">
        <h2 className="text-2xl font-extrabold text-[#171717] tracking-tight">STUDENTS</h2>
        <span className="text-sm font-bold text-[#858174] mt-1">{br} · {yr} · {scopeText}</span>
      </div>
      
      <div className="bg-white/80 rounded-[24px] border border-[#D8D1C3] p-6 shadow-xs">
        <div className="flex items-center justify-between mb-4">
           <h3 className="text-lg font-bold text-[#171717]">Enrolled Students</h3>
           <span className="text-sm font-bold text-[#171717] bg-[#F5E5EE] border border-[#D8D1C3]/60 px-3 py-1 rounded-full">
             {sectionStudents.length} Total
           </span>
        </div>

        {isLoading ? (
          <div className="py-12 text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-[#171717] border-t-transparent mb-3"></div>
            <p className="text-sm font-medium text-[#858174]">Loading enrolled students...</p>
          </div>
        ) : error ? (
          <div className="p-4 rounded-xl border border-red-200 bg-red-50 text-red-800 text-sm font-medium flex items-center justify-between">
            <span>{error}</span>
            <button onClick={reload} className="underline font-bold hover:text-red-900 ml-2">Retry</button>
          </div>
        ) : sectionStudents.length === 0 ? (
          <div className="py-12 text-center">
            <div className="w-12 h-12 rounded-2xl bg-[#F5E5EE] text-[#171717] border border-[#D8D1C3]/60 flex items-center justify-center mx-auto mb-3">
              <Icons.Students />
            </div>
            <p className="text-sm font-bold text-[#171717]">No students enrolled in this section.</p>
            <p className="text-xs font-medium text-[#858174] mt-1">Students registered for this department, year, and section will appear here.</p>
          </div>
        ) : (
          <div className="space-y-3 mt-4 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
            {sectionStudents.map((st, idx) => (
              <div key={st.id || st.uid || idx} className="flex items-center gap-4 p-3 rounded-xl border border-[#D8D1C3]/60 bg-[#FDFBF7] hover:bg-[#F5E5EE]/50 hover:border-[#D8D1C3] transition-all">
                <span className="text-[#858174] font-bold w-8 text-right text-xs">{idx + 1}.</span>
                <div className="w-9 h-9 rounded-full bg-[#F5E5EE] text-[#171717] font-bold border border-[#D8D1C3]/60 flex items-center justify-center text-xs flex-shrink-0">
                  {(st.name || 'S').charAt(0).toUpperCase()}
                </div>
                <div className="flex flex-col">
                   <span className="font-bold text-[#171717] text-sm">{st.name}</span>
                   <span className="text-[11px] font-medium text-[#858174]">
                     {st.roll ? `Roll No. ${st.roll}` : (st.enrollmentNo ? `Enrollment: ${st.enrollmentNo}` : (st.email || ''))}
                   </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}


