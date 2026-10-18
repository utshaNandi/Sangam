import { announcements as initialMockAnnouncements, teacherProfile } from './mockData';

/**
 * Curated announcements data for Sangam Teacher Dashboard.
 * Reuses existing teacherProfile and mockData announcements while providing
 * rich, structured data (ref codes, action directives, attachments, categories)
 * modeled after the reference announcement list-and-detail interface.
 */
export const INITIAL_ANNOUNCEMENTS = [
  {
    id: 'ann-dir-1',
    title: 'Department Faculty Council: CSE & AI Curriculum Review',
    subtitle: 'Curriculum Directives',
    author: "Prof. S. R. Bhattacharya",
    role: "Director's Office · Academic Council",
    refCode: 'DIR-2026-A82',
    avatarInitials: 'SB',
    avatarTheme: 'pink', // matches selected pink theme
    time: '09 : 15 AM',
    date: '16 Oct 2026, 09:15 AM',
    isToday: true,
    isUrgent: true,
    isRead: false,
    tags: ['Academic Council', 'Curriculum', 'High Priority'],
    publishedBy: "Director's Secretariat on 16 October 2026",
    summary: 'High-priority guidelines regarding upcoming Continuous Assessment (CA-3) evaluations, question bank standardization, and syllabus completion verification for all B.Tech CSE sections.',
    directives: [
      'Submit verified course dossiers and continuous assessment marks by Friday, Oct 24.',
      'Conduct remedial problem-solving sessions for students with attendance below 75%.',
      'Confirm syllabus coverage percentage through the Academic Spaces portal before mid-term evaluations.'
    ],
    attachment: {
      name: 'CSE_Curriculum_Review_Guidelines_2026.pdf',
      size: '2.4 MB',
      type: 'PDF'
    },
    scopePath: 'UEMK / Faculty of Engineering / CSE & AI'
  },
  {
    id: 'ann-exam-2',
    title: 'Mid-Semester Lab Practical Examinations & Evaluation Schedules',
    subtitle: 'Exam Schedule & Viva',
    author: 'Dr. Meenakshi Sundaram',
    role: 'Controller of Examinations · Evaluation Cell',
    refCode: 'COE-2026-X41',
    avatarInitials: 'MS',
    avatarTheme: 'blue',
    time: '10 : 30 AM',
    date: '16 Oct 2026, 10:30 AM',
    isToday: true,
    isUrgent: false,
    isRead: true,
    tags: ['Examinations', 'Lab Practicals', 'Computing Lab'],
    publishedBy: 'Office of the Controller of Examinations on 16 October 2026',
    summary: 'Detailed lab practical slots allocated for 2nd and 3rd year Data Structures and AI practicals. External examiners confirmed for all morning sessions.',
    directives: [
      'Ensure Computing Labs 1 & 2 systems are pre-loaded with compiler toolchains by Oct 25.',
      'Maintain synchronized offline grading sheets alongside Sangam portal entries.',
      'Direct any slot change requests to the Examination Cell at least 48 hours prior.'
    ],
    attachment: {
      name: 'MidSem_Lab_Practical_Schedule_Slotting.pdf',
      size: '1.8 MB',
      type: 'PDF'
    },
    scopePath: 'UEMK / CSE AI / 2nd & 3rd Year Labs'
  },
  {
    id: 'ann-qa-3',
    title: 'NBA Accreditation Criterion 3 Course Dossier Submission',
    subtitle: 'NBA Dossier Compliance',
    author: 'Dr. Priya Nair',
    role: 'Internal Quality Assurance Cell (IQAC)',
    refCode: 'IQAC-NBA-09',
    avatarInitials: 'PN',
    avatarTheme: 'purple',
    time: 'Yesterday',
    date: '15 Oct 2026, 03:45 PM',
    isToday: false,
    isUrgent: true,
    isRead: true,
    tags: ['NBA Quality', 'Accreditation', 'Dossier'],
    publishedBy: 'IQAC Compliance Committee on 15 October 2026',
    summary: 'Submission deadline for Criterion 3 (Course Outcomes & Program Outcomes attainment mapping) course dossiers for the current semester.',
    directives: [
      'Upload CO-PO attainment matrices with target thresholds for DSA and AI courses.',
      'Attach three graded sample student answer scripts (High, Average, Marginal).',
      'Submit finalized printed dossiers to Room 402 by 06:00 PM on Oct 29.'
    ],
    attachment: {
      name: 'NBA_Criterion_3_Course_Dossier_Template.docx',
      size: '940 KB',
      type: 'DOCX'
    },
    scopePath: 'UEMK / Quality Assurance / CSE AI'
  },
  {
    id: 'ann-guest-4',
    title: 'Guest Lecture & Industry Session: Scalable AI Architectures',
    subtitle: 'Special Tech Seminar',
    author: teacherProfile?.name || 'Dr. Sarah Jenkins',
    role: 'Senior Professor & Seminar Coordinator · CSE Dept',
    refCode: 'SEM-2026-G12',
    avatarInitials: teacherProfile?.avatar || 'SJ',
    avatarTheme: 'green',
    time: '14 Oct',
    date: '14 Oct 2026, 11:00 AM',
    isToday: false,
    isUrgent: false,
    isRead: true,
    tags: ['Special Lecture', 'Industry AI', 'Auditorium 2'],
    publishedBy: 'Department Faculty Council on 14 October 2026',
    summary: 'Distinguished tech talk by Visiting AI Researcher Dr. Aris Thorne on real-time neural network inference optimization in distributed systems.',
    directives: [
      'Attendance is mandatory for 2nd and 3rd year CSE-AI batches.',
      'Post-lecture Q&A session will be held in Seminar Room 3 at 01:30 PM.',
      'Students may submit advance discussion questions through their class representative.'
    ],
    attachment: {
      name: 'Industry_Seminar_Brochure_Oct2026.pdf',
      size: '3.1 MB',
      type: 'PDF'
    },
    scopePath: 'UEMK / CSE AI / All Batches'
  }
];
