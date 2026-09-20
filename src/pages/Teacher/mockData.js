export const teacherProfile = {
  name: "Dr. Sarah Jenkins",
  role: "Senior Professor",
  department: "Computer Science",
  email: "s.jenkins@sangam.edu",
  avatar: "SJ"
};

export const classes = [
  { id: 'c1', subject: 'Data Structures', section: 'CSE-A', semester: '3rd', studentsCount: 62, room: '304', time: '10:00 AM' },
  { id: 'c2', subject: 'Artificial Intelligence', section: 'CSE-C', semester: '5th', studentsCount: 58, room: '210', time: '11:30 AM' },
  { id: 'c3', subject: 'Algorithms', section: 'CSE-B', semester: '3rd', studentsCount: 60, room: '305', time: '02:00 PM' },
];

export const students = [
  { id: 's1', name: 'Alex Carter', roll: 'CS21001', section: 'CSE-A', attendance: 92, avgMarks: 88, classId: 'c1' },
  { id: 's2', name: 'Priya Sharma', roll: 'CS21002', section: 'CSE-A', attendance: 75, avgMarks: 65, classId: 'c1' },
  { id: 's3', name: 'Rahul Verma', roll: 'CS21003', section: 'CSE-A', attendance: 98, avgMarks: 94, classId: 'c1' },
  { id: 's4', name: 'Neha Gupta', roll: 'CS20041', section: 'CSE-C', attendance: 85, avgMarks: 79, classId: 'c2' },
  { id: 's5', name: 'Samir Patel', roll: 'CS20042', section: 'CSE-C', attendance: 60, avgMarks: 55, classId: 'c2' },
];

export const assignments = [
  { id: 'a1', title: 'Binary Trees Implementation', classId: 'c2', className: 'CSE-C', dueDate: 'Sep 24', total: 58, submitted: 42, status: 'Active' },
  { id: 'a2', title: 'Graph Traversal Methods', classId: 'c1', className: 'CSE-A', dueDate: 'Sep 26', total: 62, submitted: 12, status: 'Active' },
  { id: 'a3', title: 'Neural Networks Basics', classId: 'c2', className: 'CSE-C', dueDate: 'Sep 10', total: 58, submitted: 58, status: 'Graded' },
];

export const announcements = [
  { id: 'an1', title: 'Midterm Syllabus Updated', date: 'Sep 20', classId: 'c1', content: 'Please check the resources tab for the updated syllabus.' },
  { id: 'an2', title: 'Guest Lecture Tomorrow', date: 'Sep 18', classId: 'c2', content: 'We have an AI researcher visiting tomorrow.' },
];
