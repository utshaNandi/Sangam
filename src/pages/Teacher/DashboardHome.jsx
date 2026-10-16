import { useState, useMemo, useEffect } from 'react';
import { Icons } from './Icons';
import { get20Students, getAssignmentsForSection } from './TeacherViews';
import { teacherProfile } from './mockData';
import InteractiveDotCanvas from './InteractiveDotCanvas';
import AcademicSpacesView from './AcademicSpacesView';
import { fetchClassTimetable } from '../../services/timetableService.js';

// Maintainable Institute Holidays configuration
export const INSTITUTE_HOLIDAYS = {
  // Keyed by MM-DD for recurring annual holidays, or YYYY-MM-DD for specific dates
  "01-26": { name: "Republic Day", type: "National Holiday" },
  "03-03": { name: "Holi Festival", type: "Gazetted Holiday" },
  "04-03": { name: "Good Friday", type: "Gazetted Holiday" },
  "04-14": { name: "Dr. B.R. Ambedkar Jayanti", type: "Observance" },
  "05-01": { name: "May Day / Labour Day", type: "Holiday" },
  "08-15": { name: "Independence Day", type: "National Holiday" },
  "10-02": { name: "Mahatma Gandhi Jayanti", type: "National Holiday" },
  "10-20": { name: "Maha Saptami / Durga Puja", type: "Institute Holiday" },
  "10-21": { name: "Dussehra (Vijayadashami)", type: "Gazetted Holiday" },
  "11-08": { name: "Diwali / Deepavali", type: "Gazetted Holiday" },
  "11-09": { name: "Govardhan Puja", type: "Institute Holiday" },
  "12-25": { name: "Christmas Day", type: "Gazetted Holiday" },
};

// Official Director-assigned responsibilities, faculty meetings, and institute activities
export const INSTITUTE_FACULTY_EVENTS = [
  {
    id: 'dir-sync-1',
    date: '2026-10-14',
    title: 'Department Faculty Council: CSE & AI Curriculum Review',
    time: '04:30 PM - 05:15 PM',
    type: 'Faculty Meeting',
    authority: "Director's Office",
    venue: 'Conference Hall A',
    status: 'Scheduled'
  },
  {
    id: 'dir-task-1',
    date: '2026-10-16',
    title: 'Continuous Assessment Marks Submission (Mid-Term)',
    time: '05:00 PM Deadline',
    type: 'Director Task',
    authority: "Director's Office",
    venue: 'Academic Management Portal',
    status: 'Pending Submission'
  },
  {
    id: 'inst-workshop-1',
    date: '2026-10-23',
    title: 'Institutional Workshop: Generative AI in Higher Education',
    time: '03:30 PM - 05:00 PM',
    type: 'Workshop',
    authority: 'Academic Council',
    venue: 'Auditorium 2',
    status: 'Confirmed'
  },
  {
    id: 'inst-exam-1',
    date: '2026-10-27',
    title: 'Mid-Semester Lab Practical Examinations & Evaluations',
    time: '09:30 AM - 04:30 PM',
    type: 'Assessment',
    authority: "Controller of Examinations",
    venue: 'Computing Lab 1 & 2',
    status: 'Examination'
  },
  {
    id: 'dir-task-2',
    date: '2026-10-29',
    title: 'NBA Accreditation Criterion 3 Course Dossier Submission',
    time: '06:00 PM Deadline',
    type: 'Director Task',
    authority: "Director's Office",
    venue: 'Quality Assurance Cell',
    status: 'In Progress'
  }
];

const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const monthAbbrs = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dayNamesFull = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default function DashboardHome({ onNavigate, userProfile, allocations = [], isLoadingAllocations = false }) {
  const effectiveAllocations = useMemo(() => {
    if (Array.isArray(allocations) && allocations.length > 0) {
      return allocations;
    }
    return [];
  }, [allocations]);

  // Derive sections directly from saved allocations
  const allSections = useMemo(() => {
    const list = [];
    if (Array.isArray(allocations) && allocations.length > 0) {
      allocations.forEach(alloc => {
        if (alloc.department && alloc.year && alloc.section) {
          list.push({
            branch: alloc.department,
            year: alloc.year,
            section: alloc.section,
            subject: alloc.subject || `${alloc.department} Core`
          });
        }
      });
    }
    return list;
  }, [allocations]);

  const activeClassesCount = allSections.length;

  // Calculate Total Students and Attendance
  const totalStudents = activeClassesCount * 20;
  let totalAttendance = 0;
  let needsAttention = 0;
  allSections.forEach(sec => {
    const sectionStudents = get20Students(sec.branch, sec.year, sec.section);
    sectionStudents.forEach(st => {
      const seedStr = st.id;
      let seed = 0;
      for (let i = 0; i < seedStr.length; i++) seed += seedStr.charCodeAt(i);
      const att = 60 + (seed % 41);
      totalAttendance += att;
      if (att < 75) needsAttention++;
    });
  });
  const avgAttendance = totalStudents > 0 ? (totalAttendance / totalStudents).toFixed(1) + '%' : '0%';
  const presentCount = Math.round((parseFloat(avgAttendance) / 100) * totalStudents);

  // Calculate Assignments
  let pendingAssignmentsCount = 0;
  let totalSubmitted = 0;
  const allAssignments = [];
  allSections.forEach(sec => {
    const sectionAssignments = getAssignmentsForSection(sec.branch, sec.year, sec.section);
    sectionAssignments.forEach(a => {
      allAssignments.push(a);
      if (a.status === 'Active') {
        pendingAssignmentsCount++;
      }
    });
  });
  const recentAssignments = allAssignments.slice(0, 3);
  recentAssignments.forEach(a => {
    const parts = (a.className || '').split(' • ');
    if (parts.length === 3) {
      const yr = parts[0];
      const br = parts[1];
      const sc = parts[2];
      const studentsForAssignment = get20Students(br, yr, sc);
      let sub = 0;
      studentsForAssignment.forEach(student => {
        const seedStr = a.id + student.id;
        let seed = 0;
        for (let i = 0; i < seedStr.length; i++) seed += seedStr.charCodeAt(i);
        if (seed % 2 !== 0) sub++;
      });
      a.submitted = sub;
      totalSubmitted += sub;
    } else {
      a.submitted = 14;
      totalSubmitted += 14;
    }
  });

  // All allocated class timetable slots across the full week from Firestore
  const [allocatedClassSlots, setAllocatedClassSlots] = useState([]);
  // Live today's classes fetched from Firestore timetable for allocated sections
  const [liveTodayClasses, setLiveTodayClasses] = useState([]);

  useEffect(() => {
    if (!Array.isArray(allocations) || allocations.length === 0) {
      setAllocatedClassSlots([]);
      setLiveTodayClasses([]);
      return;
    }

    let isMounted = true;
    const validAllocs = allocations.filter(a => a.authorized !== false && a.department && a.year && a.section);
    if (validAllocs.length === 0) {
      setAllocatedClassSlots([]);
      setLiveTodayClasses([]);
      return;
    }

    const dayOfWeek = new Date().getDay();
    const todayDayName = dayNamesFull[dayOfWeek];

    const loadLiveClasses = async () => {
      try {
        const fetchPromises = validAllocs.map(alloc =>
          fetchClassTimetable({
            institution: alloc.institution || userProfile?.institution || 'UEMK',
            department: alloc.department,
            year: alloc.year,
            section: alloc.section
          }).catch(err => {
            console.warn(`Could not load class timetable for ${alloc.department} ${alloc.year} ${alloc.section}:`, err);
            return [];
          })
        );

        const results = await Promise.all(fetchPromises);
        if (!isMounted) return;

        const allSlots = [];
        const seenIds = new Set();

        results.flat().forEach(slot => {
          if (!slot || slot.type === 'Break' || slot.type === 'Self Study' || slot.subject?.toUpperCase() === 'LUNCH' || slot.subject?.toUpperCase() === 'LUNCH BREAK') {
            return;
          }
          if (!seenIds.has(slot.id)) {
            seenIds.add(slot.id);
            allSlots.push(slot);
          }
        });

        allSlots.sort((a, b) => {
          const dayA = dayNamesFull.indexOf(a.day);
          const dayB = dayNamesFull.indexOf(b.day);
          if (dayA !== dayB) return dayA - dayB;
          return (Number(a.period) || 0) - (Number(b.period) || 0);
        });

        setAllocatedClassSlots(allSlots);

        const todaySlots = allSlots.filter(s => s.day === todayDayName);
        todaySlots.sort((a, b) => (Number(a.period) || 0) - (Number(b.period) || 0));

        setLiveTodayClasses(todaySlots.map((s, idx) => ({
          id: s.id || idx,
          period: s.period,
          day: s.day,
          time: s.startTime && s.endTime ? `${s.startTime} - ${s.endTime}` : (s.time || '09:30 AM - 10:15 AM'),
          subject: s.subject,
          classInfo: `${s.year} • ${s.department} • ${s.section}`,
          room: s.room || 'Room 204',
          type: s.type || 'Lecture',
          teacherUid: s.teacherUid,
          isAssignedToMe: userProfile?.uid && s.teacherUid === userProfile.uid
        })));
      } catch (err) {
        console.warn('Error loading live timetable in DashboardHome:', err);
      }
    };

    loadLiveClasses();
    return () => { isMounted = false; };
  }, [allocations, userProfile?.institution, userProfile?.uid]);

  // Dynamic greeting based on time of day
  const currentHour = new Date().getHours();
  const timeOfDayGreeting = currentHour < 12 ? 'Good morning' : currentHour < 17 ? 'Good afternoon' : 'Good evening';
  const facultyName = userProfile?.name || teacherProfile.name;

  // Calendar & In-Place Day Schedule State
  const today = useMemo(() => new Date(), []);
  const [calendarDate, setCalendarDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedCalendarDay, setSelectedCalendarDay] = useState(today.getDate());
  const [rightColumnView, setRightColumnView] = useState('calendar'); // 'calendar' | 'daySchedule'

  // Return to calendar on Escape key when viewing day schedule
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && rightColumnView === 'daySchedule') {
        setRightColumnView('calendar');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [rightColumnView]);

  const currentMonthName = monthNames[calendarDate.getMonth()];
  const currentYear = calendarDate.getFullYear();

  // Days in month calculation
  const daysInMonth = new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 0).getDate();
  const firstDayIndex = (new Date(calendarDate.getFullYear(), calendarDate.getMonth(), 1).getDay() + 6) % 7; // Monday = 0
  const prevMonthDays = new Date(calendarDate.getFullYear(), calendarDate.getMonth(), 0).getDate();

  const handlePrevMonth = () => {
    setCalendarDate(prev => {
      const newD = new Date(prev.getFullYear(), prev.getMonth() - 1, 1);
      const daysInNewMonth = new Date(newD.getFullYear(), newD.getMonth() + 1, 0).getDate();
      setSelectedCalendarDay(curr => Math.min(curr, daysInNewMonth));
      return newD;
    });
  };

  const handleNextMonth = () => {
    setCalendarDate(prev => {
      const newD = new Date(prev.getFullYear(), prev.getMonth() + 1, 1);
      const daysInNewMonth = new Date(newD.getFullYear(), newD.getMonth() + 1, 0).getDate();
      setSelectedCalendarDay(curr => Math.min(curr, daysInNewMonth));
      return newD;
    });
  };

  const handlePrevDay = () => {
    if (selectedCalendarDay > 1) {
      setSelectedCalendarDay(prev => prev - 1);
    } else {
      setCalendarDate(prev => {
        const newD = new Date(prev.getFullYear(), prev.getMonth() - 1, 1);
        const daysInPrev = new Date(newD.getFullYear(), newD.getMonth() + 1, 0).getDate();
        setSelectedCalendarDay(daysInPrev);
        return newD;
      });
    }
  };

  const handleNextDay = () => {
    if (selectedCalendarDay < daysInMonth) {
      setSelectedCalendarDay(prev => prev + 1);
    } else {
      setCalendarDate(prev => {
        const newD = new Date(prev.getFullYear(), prev.getMonth() + 1, 1);
        setSelectedCalendarDay(1);
        return newD;
      });
    }
  };

  const isSelectedDateToday =
    selectedCalendarDay === today.getDate() &&
    calendarDate.getMonth() === today.getMonth() &&
    calendarDate.getFullYear() === today.getFullYear();

  const isCalendarMonthCurrent =
    calendarDate.getMonth() === today.getMonth() &&
    calendarDate.getFullYear() === today.getFullYear();

  const selectedDateObj = new Date(currentYear, calendarDate.getMonth(), selectedCalendarDay);
  const selectedDateDayName = dayNamesFull[selectedDateObj.getDay()];

  // Workload calculation for any date
  const getWorkloadForDate = (year, monthIndex, dayNum) => {
    const m = String(monthIndex + 1).padStart(2, '0');
    const d = String(dayNum).padStart(2, '0');
    const fullKey = `${year}-${m}-${d}`;
    const mdKey = `${m}-${d}`;

    const holiday = INSTITUTE_HOLIDAYS[fullKey] || INSTITUTE_HOLIDAYS[mdKey];
    if (holiday) {
      return {
        level: 'holiday',
        holiday,
        isWeekend: false,
        hasDeadline: false,
        units: 0,
        classesCount: 0,
        assignmentsCount: 0,
        meetingsCount: 0,
        summary: `${holiday.name} (${holiday.type})`
      };
    }

    const dateObj = new Date(year, monthIndex, dayNum);
    const dayOfWeek = dateObj.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const dayName = dayNamesFull[dayOfWeek];

    // 1. Classes on this day of week from real allocations
    const periods = allocatedClassSlots.filter(s => s.day === dayName);
    let teachingUnits = 0;
    let classesCount = 0;
    periods.forEach(p => {
      if (p.type === 'Break' || p.type === 'Self Study') return;
      classesCount++;
      if (p.type === 'Lab') {
        teachingUnits += 2;
      } else {
        teachingUnits += 1;
      }
    });

    // 2. Assignment deadlines
    const curMonthAbbr = monthAbbrs[monthIndex];
    let assignmentsCount = 0;
    let hasDeadline = false;
    allAssignments.forEach(a => {
      if (!a.dueDate) return;
      const parts = a.dueDate.trim().split(/\s+/);
      if (parts.length >= 2 && parts[0].toLowerCase() === curMonthAbbr.toLowerCase() && parseInt(parts[1], 10) === dayNum) {
        assignmentsCount++;
        hasDeadline = true;
      }
    });

    // 3. Director tasks / Meetings / Events
    let meetingsCount = 0;
    INSTITUTE_FACULTY_EVENTS.forEach(e => {
      if (e.date === fullKey) {
        meetingsCount++;
        if (e.type === 'Director Task') hasDeadline = true;
      }
    });

    const totalUnits = teachingUnits + assignmentsCount + meetingsCount;
    let level = 'none';
    if (totalUnits >= 7) {
      level = 'heavy';
    } else if (totalUnits >= 4) {
      level = 'moderate';
    } else if (totalUnits > 0) {
      level = 'light';
    }

    const parts = [];
    if (classesCount > 0) parts.push(`${classesCount} class${classesCount > 1 ? 'es' : ''}`);
    if (assignmentsCount > 0) parts.push(`${assignmentsCount} assignment deadline${assignmentsCount > 1 ? 's' : ''}`);
    if (meetingsCount > 0) parts.push(`${meetingsCount} meeting/task${meetingsCount > 1 ? 's' : ''}`);

    return {
      level,
      holiday: null,
      isWeekend,
      hasDeadline,
      units: totalUnits,
      classesCount,
      assignmentsCount,
      meetingsCount,
      summary: parts.length > 0 ? parts.join(', ') : 'Nothing scheduled'
    };
  };

  // Helper to parse time string
  const parseTimeRange = (timeStr) => {
    if (!timeStr) return { startMin: 0, endMin: 0 };
    const [startPart, endPart] = timeStr.split(' - ');
    const toMinutes = (str) => {
      if (!str) return 0;
      const match = str.trim().match(/(\d+):(\d+)\s*(AM|PM)/i);
      if (!match) return 0;
      let h = parseInt(match[1], 10);
      const m = parseInt(match[2], 10);
      const ampm = match[3].toUpperCase();
      if (ampm === 'PM' && h < 12) h += 12;
      if (ampm === 'AM' && h === 12) h = 0;
      return h * 60 + m;
    };
    return {
      startMin: toMinutes(startPart),
      endMin: toMinutes(endPart)
    };
  };

  const resolveRoom = (p) => {
    if (p.room) return p.room;
    if (p.type === 'Lab') return 'Computing Lab 2';
    if (p.classInfo?.includes('CSE')) return 'Room 204';
    if (p.classInfo?.includes('IT')) return 'Room 305';
    if (p.classInfo?.includes('ECE')) return 'Room 108';
    return 'Room 204';
  };

  // Real-time clock for dynamic timeline updates
  const [currentTime, setCurrentTime] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Today's scheduled timeline activities (Apple-inspired minimal dataset)
  const todayTimelineActivities = useMemo(() => {
    const now = currentTime;
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const todayDayName = dayNamesFull[now.getDay()];
    const todayDateKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    const rawList = [];

    // 1. Classes: live Firestore classes if available for today
    if (liveTodayClasses.length > 0) {
      liveTodayClasses.forEach((p, idx) => {
        const { startMin, endMin } = parseTimeRange(p.time);
        const startTimeClean = p.time.split(' - ')[0]?.trim() || '';
        const timeRangeCompact = p.time.replace(' - ', ' – ');
        const room = resolveRoom(p);
        const section = p.classInfo || 'Section A';
        rawList.push({
          id: `live-class-${p.period || idx}-${p.subject}`,
          title: p.subject,
          room,
          section,
          time: p.time,
          startTimeClean,
          timeRangeCompact,
          startMin,
          endMin: endMin || (startMin + 45)
        });
      });
    }

    // 2. Official Faculty Events / Meetings for today
    INSTITUTE_FACULTY_EVENTS.forEach(ev => {
      if (ev.date === todayDateKey) {
        const { startMin, endMin } = parseTimeRange(ev.time);
        const startTimeClean = ev.time.split(' - ')[0]?.trim() || '';
        const timeRangeCompact = ev.time.replace(' - ', ' – ');
        rawList.push({
          id: `event-${ev.id}`,
          title: ev.title,
          room: ev.venue || 'Conference Hall A',
          section: ev.authority || ev.type || 'Faculty Council',
          time: ev.time,
          startTimeClean,
          timeRangeCompact,
          startMin,
          endMin: endMin || (startMin + 45)
        });
      }
    });

    rawList.sort((a, b) => a.startMin - b.startMin);

    let hasCurrent = false;
    let hasNext = false;

    // Check currently running activity
    rawList.forEach(item => {
      if (currentMinutes >= item.startMin && currentMinutes <= item.endMin) {
        item.isCurrent = true;
        const duration = Math.max(1, item.endMin - item.startMin);
        item.progress = Math.min(100, Math.max(0, Math.round(((currentMinutes - item.startMin) / duration) * 100)));
        hasCurrent = true;
      } else if (currentMinutes > item.endMin) {
        item.isPast = true;
      } else {
        item.isFuture = true;
      }
    });

    // Mark next activity if no current activity
    rawList.forEach(item => {
      if (!hasCurrent && !hasNext && item.isFuture) {
        item.isNext = true;
        hasNext = true;
      }
    });

    // Select compact continuous window of 4 classes around active session
    let displayList = rawList;
    if (rawList.length > 4) {
      const activeIndex = rawList.findIndex(item => item.isCurrent);
      if (activeIndex !== -1) {
        const start = Math.max(0, Math.min(rawList.length - 4, activeIndex - 1));
        displayList = rawList.slice(start, start + 4);
      } else {
        displayList = rawList.slice(0, 4);
      }
    }

    return displayList;
  }, [currentTime, liveTodayClasses]);

  const allActivitiesEnded = useMemo(() => {
    return todayTimelineActivities.length > 0 && todayTimelineActivities.every(a => a.isPast);
  }, [todayTimelineActivities]);

  // Dynamic current time label and indicator percent for ongoing session
  const activeCurrentTimeLabel = useMemo(() => {
    const now = currentTime;
    const currentMins = now.getHours() * 60 + now.getMinutes();
    const activeItem = todayTimelineActivities.find(a => a.isCurrent);
    if (!activeItem) {
      let h = now.getHours();
      const m = String(now.getMinutes()).padStart(2, '0');
      h = h % 12 || 12;
      return `${h}:${m}`;
    }

    if (currentMins >= activeItem.startMin && currentMins <= activeItem.endMin) {
      let h = now.getHours();
      const m = String(now.getMinutes()).padStart(2, '0');
      h = h % 12 || 12;
      return `${h}:${m}`;
    }

    // Calculated time within ongoing session slot based on progress
    const elapsedMins = activeItem.startMin + Math.round((activeItem.endMin - activeItem.startMin) * ((activeItem.progress || 58) / 100));
    let h = Math.floor(elapsedMins / 60);
    const m = String(elapsedMins % 60).padStart(2, '0');
    h = h % 12 || 12;
    return `${h}:${m}`;
  }, [currentTime, todayTimelineActivities]);

  const activeIndicatorPercent = useMemo(() => {
    const activeItem = todayTimelineActivities.find(a => a.isCurrent);
    if (!activeItem) return 50;
    return Math.max(30, Math.min(65, activeItem.progress || 50));
  }, [todayTimelineActivities]);

  // Live countdown to class end time & dynamic progress calculation
  const activeCountdownInfo = useMemo(() => {
    const activeItem = todayTimelineActivities.find(a => a.isCurrent);
    if (!activeItem) {
      return { countdownText: '00 min left', progressPercent: 0 };
    }

    const now = currentTime;
    const currentTotalSecs = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
    const durationMins = Math.max(1, activeItem.endMin - activeItem.startMin);
    const totalDurationSecs = durationMins * 60;

    let remainingSecs = 0;
    let elapsedSecs = 0;

    if (activeItem.isSimulated) {
      // For simulated ongoing session, baseline is 58% of scheduled slot
      const baseElapsedSecs = Math.round(totalDurationSecs * 0.58);
      elapsedSecs = Math.min(totalDurationSecs, baseElapsedSecs + (now.getSeconds() % 60));
      remainingSecs = Math.max(0, totalDurationSecs - elapsedSecs);
    } else {
      // Natural scheduled session
      const startTotalSecs = activeItem.startMin * 60;
      const endTotalSecs = activeItem.endMin * 60;
      elapsedSecs = Math.max(0, Math.min(totalDurationSecs, currentTotalSecs - startTotalSecs));
      remainingSecs = Math.max(0, endTotalSecs - currentTotalSecs);
    }

    const remainingMins = Math.max(0, Math.ceil(remainingSecs / 60));
    const countdownText = `${String(remainingMins).padStart(2, '0')} min left`;
    const progressPercent = Math.min(100, Math.max(0, Math.round((elapsedSecs / totalDurationSecs) * 100)));

    return {
      countdownText,
      progressPercent
    };
  }, [currentTime, todayTimelineActivities]);


  // Complete Daily Schedule for selectedCalendarDay
  const selectedDateSchedule = useMemo(() => {
    const year = calendarDate.getFullYear();
    const monthIndex = calendarDate.getMonth();
    const dayNum = selectedCalendarDay;
    const dateObj = new Date(year, monthIndex, dayNum);
    const dayName = dayNamesFull[dateObj.getDay()];

    const m = String(monthIndex + 1).padStart(2, '0');
    const d = String(dayNum).padStart(2, '0');
    const fullKey = `${year}-${m}-${d}`;
    const mdKey = `${m}-${d}`;
    const holiday = INSTITUTE_HOLIDAYS[fullKey] || INSTITUTE_HOLIDAYS[mdKey] || null;

    const items = [];

    // Holiday
    if (holiday) {
      items.push({
        id: `holiday-${fullKey}`,
        category: 'holiday',
        title: holiday.name,
        time: 'All Day',
        timeSort: 0,
        badgeLabel: 'Holiday',
        badgeStyle: 'bg-[#FDF6B2] text-[#723B10] border-[#F3D75E]',
        location: 'Campus Wide',
        authority: 'Institute Academic Calendar',
        description: 'Official institute holiday. Regular classes and instructional activities are suspended.'
      });
    }

    // Scheduled Classes (only if not an official institute holiday)
    if (!holiday) {
      const daySlots = allocatedClassSlots.filter(s => s.day === dayName);
      daySlots.forEach(p => {
        if (p.type === 'Break' || p.type === 'Self Study') return;

        let startMin = 0;
        const timeStr = p.startTime && p.endTime ? `${p.startTime} - ${p.endTime}` : p.time;
        if (timeStr) {
          const startStr = timeStr.split(' - ')[0];
          const match = startStr?.match(/(\d+):(\d+)\s*(AM|PM)/i);
          if (match) {
            let h = parseInt(match[1], 10);
            const min = parseInt(match[2], 10);
            const ampm = match[3].toUpperCase();
            if (ampm === 'PM' && h < 12) h += 12;
            if (ampm === 'AM' && h === 12) h = 0;
            startMin = h * 60 + min;
          }
        }

        const badgeStyle =
          p.type === 'Lab' ? 'bg-[#A9BD78]/25 text-[#273811] border-[#A9BD78]/50' :
            p.type === 'Tutorial' ? 'bg-[#F3D75E]/30 text-[#45380b] border-[#F3D75E]/60' :
              'bg-[#B7C9EA]/30 text-[#1b2b48] border-[#B7C9EA]/60';

        const classInfo = `${p.year || ''} • ${p.department || ''} • ${p.section || ''}`.replace(/^ • | • $/g, '');

        items.push({
          id: p.id || `class-${p.period}-${p.subject}`,
          category: 'class',
          title: p.subject,
          time: timeStr || '09:30 AM - 10:15 AM',
          timeSort: startMin,
          badgeLabel: p.type || 'Lecture',
          badgeStyle,
          classInfo,
          location: resolveRoom(p),
          period: p.period
        });
      });
    }

    // Assignment Deadlines
    const curMonthAbbr = monthAbbrs[monthIndex];
    allAssignments.forEach((a, idx) => {
      if (!a.dueDate) return;
      const parts = a.dueDate.trim().split(/\s+/);
      if (parts.length >= 2 && parts[0].toLowerCase() === curMonthAbbr.toLowerCase() && parseInt(parts[1], 10) === dayNum) {
        items.push({
          id: `assign-${a.id || idx}`,
          category: 'deadline',
          title: a.title,
          time: '11:59 PM Due',
          timeSort: 23 * 60 + 59,
          badgeLabel: 'Deadline',
          badgeStyle: 'bg-[#F3D75E]/30 text-[#45380b] border-[#F3D75E]/60',
          classInfo: a.className,
          location: 'Online Submission Portal',
          status: a.status || 'Active',
          submissionInfo: `${a.submitted || 14}/20 Submissions`
        });
      }
    });

    // Director-Assigned Tasks & Institutional Events
    INSTITUTE_FACULTY_EVENTS.forEach(evt => {
      if (evt.date === fullKey) {
        let startMin = 16 * 60; // 4 PM default
        const match = evt.time?.match(/(\d+):(\d+)\s*(AM|PM)/i);
        if (match) {
          let h = parseInt(match[1], 10);
          const min = parseInt(match[2], 10);
          const ampm = match[3].toUpperCase();
          if (ampm === 'PM' && h < 12) h += 12;
          if (ampm === 'AM' && h === 12) h = 0;
          startMin = h * 60 + min;
        }

        const isDirTask = evt.type === 'Director Task';
        items.push({
          id: evt.id,
          category: isDirTask ? 'director_task' : 'meeting',
          title: evt.title,
          time: evt.time,
          timeSort: startMin,
          badgeLabel: evt.type,
          badgeStyle: isDirTask
            ? 'bg-[#EFA9D1]/30 text-[#5e193c] border-[#EFA9D1]/60'
            : 'bg-[#B7C9EA]/30 text-[#1b2b48] border-[#B7C9EA]/60',
          authority: evt.authority,
          location: evt.venue,
          status: evt.status
        });
      }
    });

    return items.sort((a, b) => a.timeSort - b.timeSort);
  }, [calendarDate, selectedCalendarDay, allAssignments, allocatedClassSlots]);

  return (
    <div className="relative animate-fade-in font-sans">

      {/* Main Dashboard Grid: Left Content (8 cols) + Right Calendar Sidebar (4 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-7 lg:gap-8 items-start">

        {/* Left Column: Greeting Section & Minimal Interactive Dot Canvas */}
        <div className="lg:col-span-8 space-y-6">

          {/* 1. Header Greeting Section */}
          <div className="pt-0.5">
            <h1 className="text-3xl sm:text-4xl font-extrabold text-[#171717] tracking-tight">
              {timeOfDayGreeting}, {facultyName}
            </h1>
            <p className="text-sm text-[#858174] font-medium mt-1.5 max-w-2xl leading-relaxed">
              {liveTodayClasses.length} class{liveTodayClasses.length === 1 ? '' : 'es'} scheduled today, with {pendingAssignmentsCount} assignment{pendingAssignmentsCount === 1 ? '' : 's'} pending review.
            </p>
          </div>

          {/* 2. Interactive Dot Canvas with Embedded Academic Spaces Branching Tree */}
          <div className="w-full">
            <InteractiveDotCanvas className="h-[390px] sm:h-[410px] lg:h-[430px]">
              <AcademicSpacesView
                embedded={true}
                userProfile={userProfile}
                allocations={effectiveAllocations}
                isLoadingAllocations={isLoadingAllocations}
                onNavigate={onNavigate}
              />
            </InteractiveDotCanvas>
          </div>

        </div>

        {/* Right Column: In-Place Calendar & Day Schedule (Slick, borderless, non-boxy) */}
        <div className="lg:col-span-4 space-y-5 pt-1">
          {rightColumnView === 'calendar' ? (
            <div className="space-y-5 animate-slick-fade">
              {/* 1. Monthly Calendar */}
              <div className="space-y-3.5">
                {/* Calendar Header with Minimalist Chevrons */}
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-xl sm:text-2xl font-extrabold text-[#171717] tracking-tight">
                      {currentMonthName} {currentYear}
                    </h3>
                    <p className="text-xs text-[#858174] font-medium mt-0.5">
                      Academic calendar
                    </p>
                  </div>

                  <div className="flex items-center gap-0.5 mt-1">
                    <button
                      onClick={handlePrevMonth}
                      className="p-1.5 text-[#171717] hover:text-[#858174] transition-colors rounded-full focus:outline-hidden"
                      title="Previous month"
                      aria-label="Previous month"
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="15 18 9 12 15 6"></polyline>
                      </svg>
                    </button>
                    <button
                      onClick={handleNextMonth}
                      className="p-1.5 text-[#171717] hover:text-[#858174] transition-colors rounded-full focus:outline-hidden"
                      title="Next month"
                      aria-label="Next month"
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="9 18 15 12 9 6"></polyline>
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Days of week */}
                <div className="grid grid-cols-7 gap-1 text-center text-xs select-none">
                  <span className="font-semibold text-[#858174]">M</span>
                  <span className="font-semibold text-[#858174]">T</span>
                  <span className="font-semibold text-[#858174]">W</span>
                  <span className="font-semibold text-[#858174]">T</span>
                  <span className="font-semibold text-[#858174]">F</span>
                  <span className="font-medium text-[#858174]/40">S</span>
                  <span className="font-medium text-[#858174]/40">S</span>
                </div>

                {/* Calendar date grid */}
                <div className="grid grid-cols-7 gap-y-2 gap-x-1 text-center">
                  {/* Previous month filler days */}
                  {Array.from({ length: firstDayIndex }).map((_, i) => {
                    const dayNum = prevMonthDays - firstDayIndex + i + 1;
                    return (
                      <div key={`prev-${i}`} className="h-9 w-full flex items-center justify-center text-[#858174]/25 text-xs font-normal select-none">
                        {dayNum}
                      </div>
                    );
                  })}

                  {/* Current month days */}
                  {Array.from({ length: daysInMonth }).map((_, i) => {
                    const dayNum = i + 1;
                    const isToday = dayNum === today.getDate() &&
                      calendarDate.getMonth() === today.getMonth() &&
                      calendarDate.getFullYear() === today.getFullYear();
                    const isSelected = dayNum === selectedCalendarDay;
                    const workload = getWorkloadForDate(currentYear, calendarDate.getMonth(), dayNum);
                    const isHoliday = !!workload.holiday;
                    const isWeekend = workload.isWeekend;
                    const hasDeadline = workload.hasDeadline;

                    return (
                      <button
                        key={`curr-${dayNum}`}
                        type="button"
                        onClick={() => {
                          // Single click only selects the day number, does not open schedule
                          setSelectedCalendarDay(dayNum);
                        }}
                        onDoubleClick={(e) => {
                          // Double click opens the day schedule in-place
                          e.stopPropagation();
                          setSelectedCalendarDay(dayNum);
                          setRightColumnView('daySchedule');
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            setSelectedCalendarDay(dayNum);
                            setRightColumnView('daySchedule');
                          }
                        }}
                        title={`${currentMonthName} ${dayNum}, ${currentYear}${isHoliday ? ` (${workload.holiday.name})` : ''}${hasDeadline ? ' - Deadline' : ''}${workload.summary ? ` (${workload.summary})` : ''} - Double click to view schedule`}
                        aria-label={`${currentMonthName} ${dayNum}, ${currentYear}${isHoliday ? ` (${workload.holiday.name})` : ''}${hasDeadline ? ' - Deadline' : ''}`}
                        className="h-9 w-full flex flex-col items-center justify-center relative focus:outline-hidden group cursor-pointer"
                      >
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs transition-all duration-150 ${isSelected
                          ? isHoliday
                            ? 'bg-[#EFA9D1] border border-dashed border-[#171717] font-bold text-[#171717] shadow-2xs'
                            : 'bg-[#EFA9D1] text-[#171717] font-bold shadow-2xs'
                          : isHoliday
                            ? 'border border-dashed border-[#858174]/80 text-[#171717] font-semibold hover:border-[#171717]'
                            : isToday
                              ? 'bg-[#171717] text-white font-bold'
                              : isWeekend
                                ? 'text-[#858174]/40 font-normal hover:bg-[#F5E5EE]/50 hover:text-[#171717]'
                                : 'text-[#171717] hover:bg-[#F5E5EE]/70 font-medium'
                          }`}>
                          {dayNum}
                        </div>

                        {/* Slick, premium burnished amber jewel dot ONLY for assignment / task deadlines */}
                        {hasDeadline && !isSelected && (
                          <span
                            className="w-1.5 h-1.5 rounded-full bg-[#B45309] absolute bottom-0.5 shadow-xs"
                            title="Deadline"
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Apple/Intelly-Inspired Daily Timeline (Two Columns: Time | Today's Timeline with Active Card & Dashed Indicator) */}
              <div className="pt-3 border-t border-[#D8D1C3]/40 space-y-2">
                {/* Column Headers matching Reference */}
                <div className="flex items-center justify-between text-[10px] font-bold text-[#858174] uppercase tracking-wider px-1">
                  <div className="flex items-center gap-2.5">
                    <span className="w-12 sm:w-14 shrink-0 text-center">Time</span>
                    <span className="pl-3">Today&apos;s timeline</span>
                  </div>
                  <span className="text-[10px] font-semibold text-[#858174] normal-case bg-white border border-[#D8D1C3] px-2 py-0.5 rounded-full shadow-2xs">
                    All ▾
                  </span>
                </div>

                {/* Timeline Activities List (Clean, individually separated session tiles) */}
                <div className="space-y-2 pt-1 relative">
                  {/* Barely visible vertical time guide running directly through the centers of the time labels */}
                  <div
                    className="absolute left-[24px] sm:left-[28px] top-1 bottom-3 w-px bg-[#D8D1C3]/35 pointer-events-none z-0"
                    aria-hidden="true"
                  />

                  {todayTimelineActivities.length > 0 ? (
                    todayTimelineActivities.map((item) => {
                      if (item.isCurrent) {
                        return (
                          <div key={item.id} className="relative py-1 my-0.5">
                            {/* Current time horizontal indicator: Dashed line passing through vertical center of pink time label & marker */}
                            <div
                              className="absolute left-0 right-0 flex items-center pointer-events-none z-20"
                              style={{ top: `${activeIndicatorPercent}%`, transform: 'translateY(-50%)' }}
                            >
                              {/* Left Time Column with centered pink time label */}
                              <div className="w-12 sm:w-14 shrink-0 flex items-center justify-center relative">
                                {/* Dashed line passing behind pink pill through its exact vertical center */}
                                <div className="absolute inset-x-0 h-px flex items-center z-0">
                                  <svg className="w-full h-px overflow-visible" preserveAspectRatio="none">
                                    <line
                                      x1="0"
                                      y1="0"
                                      x2="100%"
                                      y2="0"
                                      stroke="#171717"
                                      strokeOpacity="0.25"
                                      strokeWidth="1"
                                      strokeDasharray="5 5"
                                      vectorEffect="non-scaling-stroke"
                                    />
                                  </svg>
                                </div>
                                <span className="relative z-10 px-2 py-0.5 rounded-full bg-[#EFA9D1] text-[#171717] text-[10px] font-extrabold tabular-nums animate-label-breathe shadow-xs tracking-tight">
                                  {activeCurrentTimeLabel}
                                </span>
                              </div>

                              {/* Center Node: small static circular marker (NO breathing on the marker) */}
                              <div className="w-3 shrink-0 flex items-center justify-center relative z-10">
                                <span className="w-1.5 h-1.5 rounded-full bg-[#171717] shrink-0" />
                              </div>

                              {/* Right: Natural thin dashed line continuing across active session area */}
                              <div className="flex-1 flex items-center pl-0.5">
                                <svg className="w-full h-px overflow-visible" preserveAspectRatio="none">
                                  <line
                                    x1="0"
                                    y1="0"
                                    x2="100%"
                                    y2="0"
                                    stroke="#171717"
                                    strokeOpacity="0.25"
                                    strokeWidth="1"
                                    strokeDasharray="5 5"
                                    vectorEffect="non-scaling-stroke"
                                  />
                                </svg>
                              </div>
                            </div>

                            {/* Active Row Content */}
                            <div className="flex items-start gap-2.5">
                              {/* Scheduled Start Time */}
                              <div className="w-12 sm:w-14 shrink-0 flex items-center justify-center pt-3">
                                <span className="relative z-10 px-1 py-0.5 bg-[#F8F3E6] text-[11px] font-bold text-[#171717] tabular-nums leading-none">
                                  {item.startTimeClean}
                                </span>
                              </div>

                              {/* Center Spacer */}
                              <div className="w-3 shrink-0 flex items-center justify-center pt-3.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-[#171717]/40 shrink-0" />
                              </div>

                              {/* Active Session Box: highlighted-card treatment with subtle border & background */}
                              <div className="flex-1 min-w-0 bg-[#FAF7F0] border border-[#171717]/20 rounded-2xl p-3 shadow-2xs relative z-10 transition-all">
                                {/* First line: Subject name, prominently displayed + scheduled start & end times */}
                                <div className="flex items-baseline justify-between gap-2">
                                  <h4 className="text-sm font-extrabold text-[#171717] tracking-tight leading-snug truncate">
                                    {item.title}
                                  </h4>
                                  <span className="text-[10px] font-semibold text-[#858174] tabular-nums shrink-0">
                                    {item.timeRangeCompact}
                                  </span>
                                </div>

                                {/* Second line: Room number or room name */}
                                <p className="text-xs font-semibold text-[#858174] mt-1">
                                  {item.room}
                                </p>

                                {/* Third line: Section name */}
                                <p className="text-[11px] font-medium text-[#858174]/80 mt-0.5">
                                  {item.section}
                                </p>

                                {/* Live countdown to class end & progress bar */}
                                <div className="mt-2.5 pt-2 border-t border-[#D8D1C3]/40">
                                  <div className="flex items-center justify-between text-[10px] text-[#858174] mb-1">
                                    <span className="font-semibold text-[#171717]">In Progress</span>
                                    <span className="tabular-nums font-bold text-[#171717]">{activeCountdownInfo.countdownText}</span>
                                  </div>
                                  <div className="w-full bg-[#171717]/10 h-1 rounded-full overflow-hidden">
                                    <div
                                      className="h-full bg-[#171717] rounded-full transition-all duration-500"
                                      style={{ width: `${activeCountdownInfo.progressPercent}%` }}
                                    />
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      }

                      {/* Inactive Session Entry: Completed or Upcoming inside its own rounded box (NO connecting vertical lines) */ }
                      return (
                        <div key={item.id} className="flex items-center gap-2.5">
                          {/* Left Column: Time label aligned horizontally with its corresponding session */}
                          <div className="w-12 sm:w-14 shrink-0 flex items-center justify-center">
                            <span className={`relative z-10 px-1 py-0.5 bg-[#F8F3E6] text-[11px] tabular-nums leading-none ${item.isPast ? 'font-medium text-[#858174]/70' : 'font-semibold text-[#171717]'
                              }`}>
                              {item.startTimeClean}
                            </span>
                          </div>

                          {/* Center Node: small subtle dot on the time mark (NO connecting vertical lines) */}
                          <div className="w-3 shrink-0 flex items-center justify-center">
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${item.isPast ? 'bg-[#858174]/25' : 'bg-[#171717]/35'
                              }`} />
                          </div>

                          {/* Right Column: Clean, individually separated session tile */}
                          <div className={`flex-1 min-w-0 rounded-xl p-2.5 transition-all ${item.isPast
                              ? 'bg-[#FAF7F0]/60 border border-[#D8D1C3]/50 opacity-60'
                              : 'bg-[#FAF7F0]/90 border border-[#D8D1C3]/80'
                            }`}>
                            <div className="flex items-baseline justify-between gap-1.5">
                              <span className={`text-xs truncate tracking-tight ${item.isPast ? 'font-medium text-[#858174]' : 'font-bold text-[#171717]'
                                }`}>
                                {item.title}
                              </span>
                              <span className={`text-[10px] tabular-nums shrink-0 ${item.isPast ? 'text-[#858174]/70' : 'text-[#858174]'
                                }`}>
                                {item.timeRangeCompact}
                              </span>
                            </div>

                            <div className={`flex items-center gap-1.5 text-[11px] mt-0.5 truncate ${item.isPast ? 'text-[#858174]/60' : 'text-[#858174]'
                              }`}>
                              <span>{item.room}</span>
                              <span>•</span>
                              <span>{item.section}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <p className="text-xs text-[#858174] font-medium py-2">
                      No classes scheduled for today.
                    </p>
                  )}

                  {/* Understated completed status when all activities ended */}
                  {allActivitiesEnded && (
                    <div className="pt-1 text-center">
                      <span className="text-[10px] font-medium text-[#858174] tracking-tight">
                        All activities completed for today
                      </span>
                    </div>
                  )}

                  {/* Reference design bottom action button */}
                  <button
                    type="button"
                    onClick={() => setRightColumnView('daySchedule')}
                    className="w-full mt-2.5 py-2 bg-[#171717] hover:bg-[#2b2b2b] text-white text-xs font-bold rounded-full transition-all text-center shadow-xs cursor-pointer active:scale-[0.99]"
                  >
                    View all details
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* Day Schedule View (In-place of calendar + upcoming, slick, non-boxy, borderless) */
            <div className="space-y-5 animate-slick-fade">
              {/* Day Header with Calendar Return & Chevrons */}
              <div className="flex items-center justify-between pb-3 border-b border-[#D8D1C3]/40">
                <button
                  type="button"
                  onClick={() => setRightColumnView('calendar')}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-[#858174] hover:text-[#171717] transition-colors group py-0.5"
                  title="Return to monthly calendar view"
                >
                  <span className="group-hover:-translate-x-0.5 transition-transform">←</span>
                  <span>Calendar</span>
                </button>

                <div className="flex items-center gap-2">
                  {!isSelectedDateToday && (
                    <button
                      type="button"
                      onClick={() => {
                        setCalendarDate(new Date(today.getFullYear(), today.getMonth(), 1));
                        setSelectedCalendarDay(today.getDate());
                      }}
                      className="text-[11px] font-bold text-[#858174] hover:text-[#171717] transition-colors px-1.5 py-0.5"
                    >
                      Today
                    </button>
                  )}

                  <div className="flex items-center gap-0.5">
                    <button
                      type="button"
                      onClick={handlePrevDay}
                      className="p-1 text-[#171717] hover:text-[#858174] transition-colors rounded-full"
                      title="Previous day"
                      aria-label="Previous day"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="15 18 9 12 15 6"></polyline>
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={handleNextDay}
                      className="p-1 text-[#171717] hover:text-[#858174] transition-colors rounded-full"
                      title="Next day"
                      aria-label="Next day"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="9 18 15 12 9 6"></polyline>
                      </svg>
                    </button>
                  </div>
                </div>
              </div>

              {/* Day Title & Summary */}
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-xl sm:text-2xl font-extrabold text-[#171717] tracking-tight">
                    {selectedDateDayName}, {currentMonthName.slice(0, 3)} {selectedCalendarDay}
                  </h3>
                  {isSelectedDateToday && (
                    <span className="text-[10px] font-extrabold bg-[#171717] text-white px-2 py-0.5 rounded-full">
                      Today
                    </span>
                  )}
                </div>
                <p className="text-xs text-[#858174] font-medium mt-0.5">
                  {selectedDateSchedule.length === 0
                    ? 'No scheduled commitments'
                    : `${selectedDateSchedule.length} scheduled item${selectedDateSchedule.length === 1 ? '' : 's'}`}
                </p>
              </div>

              {/* Slick, borderless schedule items list */}
              {selectedDateSchedule.length > 0 ? (
                <div className="space-y-4 pt-1">
                  {selectedDateSchedule.map((item) => {
                    const barColor =
                      item.category === 'holiday' ? 'bg-[#C05621]' :
                        item.badgeLabel === 'Deadline' ? 'bg-[#B45309]' :
                          item.badgeLabel === 'Lab' ? 'bg-[#A9BD78]' :
                            item.category === 'director_task' ? 'bg-[#EFA9D1]' :
                              'bg-[#B7C9EA]';

                    return (
                      <div
                        key={item.id}
                        className="flex items-start gap-3 group transition-opacity hover:opacity-90"
                      >
                        {/* Minimal vertical accent bar */}
                        <div className={`w-1 rounded-full self-stretch min-h-[36px] ${barColor} shrink-0 mt-0.5`} />

                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="text-sm font-bold text-[#171717] tracking-tight truncate">
                              {item.badgeLabel && item.badgeLabel !== 'Lecture' ? `${item.badgeLabel} · ` : ''}
                              {item.title}
                            </span>
                            <span className="text-xs font-semibold text-[#858174] shrink-0">
                              {item.time}
                            </span>
                          </div>

                          <div className="text-xs text-[#858174] font-medium mt-0.5 truncate">
                            {item.classInfo ? `${item.classInfo} · ` : ''}
                            {item.location || item.authority || item.description || ''}
                          </div>

                          {item.submissionInfo && (
                            <div className="text-[11px] font-semibold text-[#858174] mt-0.5">
                              {item.submissionInfo}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="py-6 text-left">
                  <p className="text-sm font-semibold text-[#171717]">No classes or events scheduled</p>
                  <p className="text-xs text-[#858174] font-medium mt-1 leading-relaxed">
                    This day is free from instructional sessions and deadlines.
                  </p>
                </div>
              )}

              {/* Bottom Actions */}
              <div className="pt-4 border-t border-[#D8D1C3]/40 flex items-center justify-between text-xs">
                <button
                  type="button"
                  onClick={() => setRightColumnView('calendar')}
                  className="font-bold text-[#858174] hover:text-[#171717] transition-colors flex items-center gap-1 group"
                >
                  <span className="group-hover:-translate-x-0.5 transition-transform">←</span>
                  <span>Back to Calendar</span>
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('Schedule')}
                  className="font-bold text-[#171717] hover:text-[#858174] transition-colors flex items-center gap-1 group"
                >
                  <span>Timetable</span>
                  <span className="group-hover:translate-x-0.5 transition-transform">→</span>
                </button>
              </div>
            </div>
          )}
        </div>

      </div>

    </div>
  );
}
