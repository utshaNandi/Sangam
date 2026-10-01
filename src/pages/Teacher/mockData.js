export const teacherProfile = {
  name: "Dr. Sarah Jenkins",
  role: "Senior Professor",
  department: "Computer Science",
  email: "s.jenkins@sangam.edu",
  avatar: "SJ"
};

export const teacherAllocations = [
  {
    institution: "UEMK",
    department: "CSE AI",
    year: "2nd Year",
    section: "Sec B",
    subject: "DSA",
    permissions: ["View", "Announce", "Manage"]
  },
  {
    institution: "UEMK",
    department: "CSE AI",
    year: "2nd Year",
    section: "Sec C",
    subject: "DSA",
    permissions: ["View", "Announce", "Manage"]
  },
  {
    institution: "UEMK",
    department: "CSE AI",
    year: "3rd Year",
    section: "Sec A",
    subject: "DSA",
    permissions: ["View", "Announce"]
  }
];

export const classes = [
  { id: 'c1', subject: 'Data Structures', section: 'CSE-A', semester: '3rd', studentsCount: 62, room: '304', time: '10:00 AM' },
  { id: 'c2', subject: 'Artificial Intelligence', section: 'CSE-C', semester: '5th', studentsCount: 58, room: '210', time: '11:30 AM' },
  { id: 'c3', subject: 'Algorithms', section: 'CSE-B', semester: '3rd', studentsCount: 60, room: '305', time: '02:00 PM' },
];

export const students = [
  { id: 's1', name: 'Alex Carter', roll: 'CS21001', section: 'CSE-A', attendance: 92, avgMarks: 88, classId: 'c1' },
  { id: 's2', name: 'Priya Sharma', roll: 'CS21002', section: 'CSE-A', attendance: 75, avgMarks: 65, classId: 'c1' },
  { id: 's3', name: 'Rahul Verma', roll: 'CS21003', section: 'CSE-A', attendance: 98, avgMarks: 94, classId: 'c1' },
  { id: 's4', name: 'Neha Gupta', roll: 'CS20041', section: 'CSE-C', attendance: 60, avgMarks: 79, classId: 'c2' },
  { id: 's5', name: 'Samir Patel', roll: 'CS20042', section: 'CSE-C', attendance: 60, avgMarks: 55, classId: 'c2' },
];

export const assignments = [
  { id: 'a1', title: 'Binary Trees Implementation', classId: 'c2', className: 'CSE-C', dueDate: 'Sep 24', total: 58, submitted: 42, status: 'Active', subject: 'DSA', teacher: 'Dr. Sarah Jenkins' },
  { id: 'a2', title: 'Graph Traversal Methods', classId: 'c1', className: 'CSE-A', dueDate: 'Sep 26', total: 62, submitted: 12, status: 'Active', subject: 'DSA', teacher: 'Dr. Sarah Jenkins' },
  { id: 'a3', title: 'Neural Networks Basics', classId: 'c2', className: 'CSE-C', dueDate: 'Sep 10', total: 58, submitted: 58, status: 'Graded', subject: 'Artificial Intelligence', teacher: 'Dr. Sarah Jenkins' },
];

export const announcements = [
  { id: 'an1', title: 'Midterm Syllabus Updated', date: 'Sep 20', classId: 'c1', content: 'Please check the syllabus tab for the updated syllabus.', scopePath: 'UEMK/CSE AI/2nd Year/Sec A', author: 'Dr. Sarah Jenkins' },
  { id: 'an2', title: 'Guest Lecture Tomorrow', date: 'Sep 18', classId: 'c2', content: 'We have an AI researcher visiting tomorrow.', scopePath: 'UEMK/CSE AI/2nd Year/Sec C', author: 'Dr. Sarah Jenkins' },
];

export const addAnnouncement = (ann) => {
  announcements.unshift(ann);
};

const generateMockPeriodAttendance = () => {
  const data = {};
  const today = new Date();
  today.setHours(0,0,0,0);
  
  const dayOfWeek = today.getDay();
  const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const thisMonday = new Date(today);
  thisMonday.setDate(today.getDate() - daysSinceMonday);
  
  const semesterStart = new Date(thisMonday);
  semesterStart.setDate(thisMonday.getDate() - (19 * 7)); // Exactly 20 weeks total (100 days)
  
  const generateForDays = (studentId, start, end, targetPercentage) => {
    if (!data[studentId]) data[studentId] = {};
    let curDate = new Date(start);
    
    const classDays = [];
    while (curDate <= end) {
      const day = curDate.getDay();
      if (day !== 0 && day !== 6) {
        classDays.push(new Date(curDate));
      }
      curDate.setDate(curDate.getDate() + 1);
    }
    
    let targetAttended = Math.round((targetPercentage / 100) * classDays.length);
    let attendedCount = 0;
    
    const lastMonday = new Date(thisMonday);
    lastMonday.setDate(thisMonday.getDate() - 7);
    
    // Pre-calculate needed for past days if this is s4
    if (studentId === 's4') {
      targetAttended -= 3; // We know s4 has exactly 3 present days this week
      targetAttended -= 4; // We know s4 has exactly 4 present days last week
    }
    
    classDays.forEach((dateObj, idx) => {
      const dateStr = dateObj.toISOString().split('T')[0];
      data[studentId][dateStr] = {};
      
      const isThisWeek = dateObj >= thisMonday;
      const isLastWeek = dateObj >= lastMonday && dateObj < thisMonday;
      const dayIndex = dateObj.getDay(); 
      
      let dayResult = 'Present';
      
      if (studentId === 's4' && isThisWeek) {
        if (dayIndex === 3 || dayIndex === 5) { // Wed, Fri
          dayResult = 'Absent';
        } else {
          dayResult = 'Present';
        }
      } else if (studentId === 's4' && isLastWeek) {
        if (dayIndex === 3) { // Wed only
          dayResult = 'Absent';
        } else {
          dayResult = 'Present';
        }
      } else {
        const daysLeft = classDays.length - idx;
        const needed = targetAttended - attendedCount;
        
        if (needed > 0 && (needed >= daysLeft || Math.random() < (needed / daysLeft))) {
          dayResult = 'Present';
          attendedCount++;
        } else {
          dayResult = 'Absent';
        }
      }
      
      [1,2,3,4,6,7,8,9].forEach(p => {
        if (dayResult === 'Present') {
          data[studentId][dateStr][p] = 'Present';
        } else {
          if (p === 9) {
            data[studentId][dateStr][p] = 'Absent';
          } else {
            data[studentId][dateStr][p] = 'Present';
          }
        }
      });
    });
  };

  students.forEach(st => {
    const thisFriday = new Date(thisMonday);
    thisFriday.setDate(thisMonday.getDate() + 4);
    generateForDays(st.id, semesterStart, thisFriday, st.attendance);
  });
  
  return data;
};

export const globalPeriodAttendance = generateMockPeriodAttendance();


export const calculateSemesterAttendance = (studentId) => {
  const periodData = globalPeriodAttendance[studentId] || {};
  let totalConductedClasses = 0;
  let totalPresentClasses = 0;
  const todayDate = new Date();
  todayDate.setHours(0,0,0,0);

  Object.keys(periodData).forEach(dateStr => {
    const dateObj = new Date(dateStr);
    dateObj.setHours(0,0,0,0);
    if (dateObj > todayDate) return;

    const periods = periodData[dateStr];
    let hasAbsent = false;
    let hasRecorded = false;

    [1,2,3,4,6,7,8,9].forEach(p => {
      const status = periods[p];
      if (status === 'Absent') {
        hasAbsent = true;
        hasRecorded = true;
      } else if (status === 'Present') {
        hasRecorded = true;
      }
    });

    // Each day with recorded attendance counts as 1 conducted class
    if (hasRecorded) {
      totalConductedClasses++;
      if (!hasAbsent) {
        totalPresentClasses++;
      }
    }
  });

  const percentage = totalConductedClasses > 0 ? Math.round((totalPresentClasses / totalConductedClasses) * 100) : 0;
  return { percentage, attended: totalPresentClasses, total: totalConductedClasses };
};

export const markPeriodAttendance = (studentId, status) => {
  const todayStr = new Date().toISOString().split('T')[0];
  if (!globalPeriodAttendance[studentId]) globalPeriodAttendance[studentId] = {};
  if (!globalPeriodAttendance[studentId][todayStr]) globalPeriodAttendance[studentId][todayStr] = {};
  
  const now = new Date();
  const hour = now.getHours();
  let currentPeriod = 1;
  if (hour >= 10 && hour < 11) currentPeriod = 2;
  else if (hour >= 11 && hour < 12) currentPeriod = 3;
  else if (hour >= 12 && hour < 13) currentPeriod = 4;
  else if (hour >= 13 && hour < 14) currentPeriod = 6;
  else if (hour >= 14 && hour < 15) currentPeriod = 7;
  else if (hour >= 15 && hour < 16) currentPeriod = 8;
  else if (hour >= 16 && hour < 17) currentPeriod = 9;

  globalPeriodAttendance[studentId][todayStr][currentPeriod] = status;
};
export const addAssignment = (asg) => {
  assignments.unshift(asg);
};

export const studentSubmissions = {};

export const submitAssignment = (assignmentId, studentId, file) => {
  if (!studentSubmissions[assignmentId]) {
    studentSubmissions[assignmentId] = {};
  }
  studentSubmissions[assignmentId][studentId] = file;
};
