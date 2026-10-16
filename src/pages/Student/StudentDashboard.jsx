import { useRef, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Icons } from '../Teacher/Icons';
import StudentCharacter from '../../components/student/StudentCharacter';
import { assignments, announcements } from '../Teacher/mockData';
import { 
  subscribeStudentAttendance, 
  transformRecordsToPeriodData, 
  calculateAttendanceMetrics 
} from '../../services/attendanceService';
import { subscribeClassTimetable } from '../../services/timetableService.js';

function HeroBox({ onNavigate, studentName, assignmentCount, announcementCount, section }) {
  const boxRef = useRef(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);

  const handleMouseMove = (e) => {
    if (!boxRef.current) return;
    const rect = boxRef.current.getBoundingClientRect();
    setMousePos({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  return (
    <section
      ref={boxRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="relative bg-white rounded-[24px] border border-slate-200/60 shadow-sm lg:min-h-[420px] flex items-center overflow-visible"
    >
      <div className="absolute inset-0 overflow-hidden rounded-[24px] pointer-events-none z-0">
        <div
          className="absolute z-0 pointer-events-none transition-opacity duration-700 ease-out"
          style={{
            opacity: isHovered ? 1 : 0,
            background: `radial-gradient(circle 800px at ${mousePos.x}px ${mousePos.y}px, color-mix(in srgb, var(--theme-primary) 18%, transparent) 0%, color-mix(in srgb, var(--theme-primary) 5%, transparent) 40%, transparent 80%)`,
            inset: 0,
          }}
        />

        <div
          className="absolute inset-0 z-0 pointer-events-none"
          style={{
            backgroundImage: 'linear-gradient(to right, color-mix(in srgb, var(--theme-primary) 8%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in srgb, var(--theme-primary) 8%, transparent) 1px, transparent 1px)',
            backgroundSize: '96px 96px',
          }}
          aria-hidden="true"
        ></div>
      </div>

      <div className="relative z-10 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-16 w-full max-w-7xl mx-auto px-10 py-16 md:px-16 md:py-20 pointer-events-none">

        <div className="max-w-2xl flex-1 pointer-events-auto">
           <h2 className="text-[44px] md:text-[56px] font-bold text-slate-900 tracking-tight mb-6 leading-[1.1]">
             Good morning,<br/>
             <span className="text-theme-primary">{studentName}</span>
           </h2>
           <p className="text-lg md:text-xl text-slate-600 leading-relaxed max-w-xl mb-12">
             You have {assignmentCount} upcoming {assignmentCount === 1 ? 'assignment' : 'assignments'} and {announcementCount} new {announcementCount === 1 ? 'announcement' : 'announcements'}{section ? ` in ${section}` : ' (Academic Placement Pending)'}.
           </p>

           <div className="flex flex-wrap items-center gap-4">
             <button
               onClick={() => onNavigate('Academic Space')}
               className="px-8 py-3.5 bg-theme-primary text-white rounded-xl font-semibold shadow-sm hover:opacity-90 hover:shadow-md hover:-translate-y-0.5 active:scale-95 transition-all duration-200 text-[15px]"
             >
               {section ? `Go to ${section}` : 'Go to Academic Space'}
             </button>
             <button
               onClick={() => onNavigate('Schedule')}
               className="px-8 py-3.5 bg-white border border-slate-200 text-slate-700 rounded-xl font-semibold shadow-sm hover:bg-slate-50 hover:border-slate-300 hover:shadow-md hover:-translate-y-0.5 active:scale-95 transition-all duration-200 text-[15px]"
             >
               View Schedule
             </button>
           </div>
        </div>

        <div className="hidden lg:block w-[320px]"></div>
      </div>

      <StudentCharacter />
    </section>
  )
}

function StatCard({ title, value, icon, subtitle, onClick }) {
  return (
    <div
      onClick={onClick}
      className={`bg-white p-6 rounded-[24px] border border-slate-100 shadow-[0_2px_20px_rgba(0,0,0,0.02)] flex items-start gap-4 transition-all duration-300 hover:-translate-y-1.5 hover:shadow-[0_8px_30px_rgba(0,0,0,0.06)] group ${onClick ? 'cursor-pointer' : ''}`}
    >
      <div className="w-12 h-12 rounded-2xl bg-theme-bg text-theme-primary flex items-center justify-center flex-shrink-0 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3">
        {icon}
      </div>
      <div className="flex-1">
        <p className="text-[13px] font-bold uppercase tracking-wide text-slate-400 mb-1">{title}</p>
        <p className="text-xl font-extrabold text-slate-900">{value}</p>
        {subtitle && <p className="text-[11px] font-medium text-slate-400 mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}

function QuickAction({ icon, label, onClick }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center justify-center gap-3 p-4 rounded-2xl border border-slate-100 hover:border-theme-primary/30 hover:bg-theme-bg hover:shadow-sm active:scale-95 transition-all duration-300 text-slate-500 hover:text-theme-primary group"
    >
      <div className="transition-transform duration-300 group-hover:scale-110 group-hover:-translate-y-1">
        {icon}
      </div>
      <span className="text-sm font-bold transition-colors">{label}</span>
    </button>
  );
}

export default function StudentDashboard({ onNavigate, userProfile }) {
  const studentName = (userProfile?.name && userProfile.name.trim())
    || (userProfile?.email ? userProfile.email.split('@')[0] : '')
    || 'Student';
  const firstName = studentName.trim().split(/\s+/)[0] || 'Student';
  const section = userProfile?.section?.trim() || '';
  const studentId = userProfile?.uid || '';

  // 1. Announcements: match by section if assigned, otherwise preserve demo announcements without falsely claiming section match
  const matchedAnnouncements = section
    ? announcements.filter(an => an.scopePath && (an.scopePath.includes(section) || section.includes(an.scopePath.split('/').pop() || '')))
    : announcements;
  const studentAnnouncements = matchedAnnouncements.length > 0 ? matchedAnnouncements : announcements;
  const announcementCount = studentAnnouncements.length;
  const latestAnnouncement = studentAnnouncements.length > 0 ? studentAnnouncements[0] : null;
  const [showAnnouncementPopup, setShowAnnouncementPopup] = useState(latestAnnouncement !== null);

  // 2. Pending Assignments: match by section if assigned, otherwise preserve demo assignments
  const matchedAssignments = section
    ? assignments.filter(a => a.className === section || a.className.includes(section) || section.includes(a.className))
    : assignments;
  const studentAssignments = matchedAssignments.length > 0 ? matchedAssignments : assignments;
  const pendingAssignmentsCount = studentAssignments.length;

  const pendingAssignments = studentAssignments.map(a => ({
    id: a.id,
    title: a.title,
    subject: a.className,
    dueDate: a.dueDate,
    status: a.status,
    progress: 0
  }));

  // 3. Live Schedule for today
  const dayIndex = new Date().getDay(); // 0 = Sun, 1 = Mon...
  const isSunday = dayIndex === 0;
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const todayDayName = dayNames[dayIndex];

  const institution = userProfile?.institution || 'UEMK';
  const department = userProfile?.department;
  const year = userProfile?.year;

  const [todayClasses, setTodayClasses] = useState([]);
  const [isLoadingTimetable, setIsLoadingTimetable] = useState(true);
  const [timetableError, setTimetableError] = useState(null);

  useEffect(() => {
    if (isSunday || !department || !year || !section) {
      return;
    }

    let isMounted = true;
    const unsubscribe = subscribeClassTimetable(
      { institution, department, year, section, day: todayDayName },
      (slots) => {
        if (!isMounted) return;
        const active = slots
          .filter(s => s.type !== 'Break' && s.subject?.toUpperCase() !== 'LUNCH' && s.subject?.toUpperCase() !== 'LUNCH BREAK')
          .map((s, idx) => ({
            id: s.id || idx,
            period: s.period,
            time: `${s.startTime} - ${s.endTime}`,
            subject: s.subject,
            section: `${year} • ${section}`,
            teacher: s.teacherName || '',
            type: s.type || 'Lecture',
            room: s.room || 'Room 402'
          }));
        setTodayClasses(active);
        setIsLoadingTimetable(false);
      },
      (err) => {
        if (!isMounted) return;
        console.error('Error fetching today timetable in dashboard:', err);
        setTimetableError(err.message || 'Unable to load today schedule.');
        setIsLoadingTimetable(false);
      }
    );

    return () => {
      isMounted = false;
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [institution, department, year, section, todayDayName, isSunday]);

  // 4. Attendance Percentage from live Firestore records
  const [dashboardAttendanceRecords, setDashboardAttendanceRecords] = useState([]);

  useEffect(() => {
    if (!studentId) return;

    const unsubscribe = subscribeStudentAttendance(
      studentId,
      (records) => {
        setDashboardAttendanceRecords(records || []);
      },
      (err) => {
        console.error('Error fetching dashboard attendance:', err);
      }
    );
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [studentId]);

  const dashboardPeriodData = transformRecordsToPeriodData(dashboardAttendanceRecords);
  const { 
    percentage: attendancePercentage,
    attended: dashAttended,
    total: dashTotal,
    pendingDays: dashPending
  } = calculateAttendanceMetrics(dashboardPeriodData);

  const todayLabsCount = todayClasses.filter(c => c.type === 'Lab').length;

  return (
    <div className="space-y-8 animate-fade-in relative">

      <HeroBox
        onNavigate={onNavigate}
        studentName={firstName}
        assignmentCount={pendingAssignmentsCount}
        announcementCount={announcementCount}
        section={section}
      />

      <div className="relative z-10 space-y-8">
        {/* Top Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          <StatCard 
            title="Attendance" 
            value={dashTotal > 0 ? `${attendancePercentage}%` : (dashPending > 0 ? 'Pending' : '0%')} 
            subtitle={
              dashTotal > 0 
                ? (dashPending > 0 ? `${dashAttended}/${dashTotal} days • ${dashPending} pending` : `${dashAttended}/${dashTotal} completed days`)
                : (dashPending > 0 ? `${dashPending} day pending • Click to view` : 'Click to view full records')
            } 
            icon={<Icons.Attendance />} 
            onClick={() => onNavigate('Attendance')} 
          />
          <StatCard title="Pending Tasks" value={`${pendingAssignmentsCount} Due`} icon={<Icons.Assignments />} onClick={() => onNavigate('Assignments')} />
          <StatCard 
            title="Today's Classes" 
            value={isSunday ? 'None (Sunday)' : `${todayClasses.length} Scheduled`} 
            icon={<Icons.Schedule />} 
            onClick={() => onNavigate('Schedule')} 
          />
          <StatCard 
            title="Labs" 
            value={isSunday ? 'None' : `${todayLabsCount} Scheduled`} 
            icon={<Icons.Classes />} 
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

          {/* Left Column */}
          <div className="space-y-8">

            {/* Today's Classes */}
            <section className="bg-white rounded-[24px] border border-slate-100 shadow-[0_2px_20px_rgba(0,0,0,0.02)] p-7 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-theme-bg rounded-full blur-3xl opacity-60 -translate-y-1/2 translate-x-1/3"></div>
              <h3 className="text-xl font-bold text-slate-900 mb-5 relative z-10 tracking-tight">Today's Classes</h3>
              <div className="space-y-3 relative z-10">
                {isSunday ? (
                  <div className="p-6 text-center border border-dashed border-amber-200 rounded-2xl bg-amber-50/50">
                    <span className="text-2xl mb-1 block">📅</span>
                    <h4 className="text-sm font-bold text-amber-900">Sunday — No classes scheduled today</h4>
                    <p className="text-xs text-amber-700 font-medium mt-1">Campus is closed for the weekend. Have a great rest!</p>
                    <button
                      onClick={() => onNavigate('Schedule')}
                      className="mt-3 text-xs font-bold text-theme-primary hover:underline block mx-auto"
                    >
                      View Weekly Schedule →
                    </button>
                  </div>
                ) : isLoadingTimetable ? (
                  <div className="py-12 text-center text-slate-400 space-y-2">
                    <div className="w-6 h-6 border-2 border-theme-primary border-t-transparent rounded-full animate-spin mx-auto"></div>
                    <p className="text-xs font-medium">Loading today's schedule from Cloud Firestore...</p>
                  </div>
                ) : timetableError ? (
                  <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center justify-between">
                    <span>{timetableError}</span>
                    <button onClick={() => window.location.reload()} className="underline hover:no-underline font-bold">Retry</button>
                  </div>
                ) : todayClasses.length === 0 ? (
                  <div className="p-6 text-center border border-dashed border-slate-200 rounded-2xl bg-slate-50/40">
                    <p className="text-sm font-bold text-slate-700">No classes scheduled for today ({todayDayName})</p>
                    <p className="text-xs text-slate-400 mt-1">Check back later or view your full weekly schedule.</p>
                  </div>
                ) : (
                  todayClasses.map(c => (
                    <div key={c.id} className="flex items-center justify-between p-4 rounded-2xl hover:bg-slate-50 transition-all duration-200 border border-transparent hover:border-slate-100 active:scale-[0.98] group cursor-pointer" onClick={() => onNavigate('Schedule')}>
                      <div className="flex items-center gap-5">
                        <div className="w-16 h-16 rounded-2xl bg-theme-bg text-theme-primary flex flex-col items-center justify-center flex-shrink-0 transition-transform duration-300 group-hover:scale-105">
                          <span className="text-[10px] font-bold uppercase tracking-wider">{c.time.split(' ')[1]}</span>
                          <span className="text-lg font-extrabold">{c.time.split(' ')[0]}</span>
                        </div>
                        <div>
                          <h4 className="font-bold text-slate-900 group-hover:text-theme-primary transition-colors text-base">{c.subject}</h4>
                          <p className="text-sm text-slate-500 font-medium">{c.section} — {c.type} {c.teacher ? `— ${c.teacher}` : ''}</p>
                        </div>
                      </div>
                      <div className="text-right hidden sm:block">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold transition-transform duration-300 group-hover:scale-105">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Upcoming
                        </span>
                        <p className="text-sm text-slate-500 mt-2 font-medium group-hover:text-slate-600 transition-colors">Room {c.room}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>

          </div>

          {/* Right Column */}
          <div className="space-y-8">

            {/* Quick Actions */}
            <section className="bg-white rounded-[24px] border border-slate-100 shadow-[0_2px_20px_rgba(0,0,0,0.02)] p-7">
              <h3 className="text-xl font-bold text-slate-900 mb-5 tracking-tight">Quick Actions</h3>
              <div className="grid grid-cols-2 gap-3">
                <QuickAction icon={<Icons.Assignments />} label="Assignments" onClick={() => onNavigate('Assignments')} />
                  <QuickAction icon={<Icons.Attendance />} label="Attendance" onClick={() => onNavigate('Attendance')} />
                  <QuickAction icon={<Icons.Schedule />} label="Schedule" onClick={() => onNavigate('Schedule')} />
                  <QuickAction icon={<Icons.Announcements />} label="Announcements" onClick={() => onNavigate('Academic Space')} />
              </div>
            </section>

            {/* Recent Assignments */}
            <section className="bg-white rounded-[24px] border border-slate-100 shadow-[0_2px_20px_rgba(0,0,0,0.02)] p-7">
              <div className="flex justify-between items-center mb-5">
                <h3 className="text-xl font-bold text-slate-900 tracking-tight">Pending Assignments</h3>
                <button onClick={() => onNavigate('Assignments')} className="text-sm text-theme-primary hover:opacity-80 active:scale-95 font-bold transition-all">View All →</button>
              </div>
              <div className="space-y-3">
                {pendingAssignments.map(a => (
                  <div key={a.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-2xl border border-slate-100 hover:border-theme-primary/30 hover:bg-theme-bg/30 hover:shadow-[0_4px_20px_rgba(0,0,0,0.04)] hover:-translate-y-1 transition-all duration-300 cursor-pointer group" onClick={() => onNavigate('Assignments')}>
                    <div>
                      <h4 className="font-bold text-slate-900 group-hover:text-theme-primary transition-colors duration-300">{a.title}</h4>
                      <p className="text-sm text-slate-500 font-medium mt-1">{a.subject} — Due {a.dueDate}</p>
                    </div>
                    <div className="mt-3 sm:mt-0 flex items-center gap-5">
                      <div className="text-right transition-transform duration-300 group-hover:-translate-x-1">
                        <p className="text-sm font-bold text-slate-900">{a.progress}%</p>
                        <p className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Completed</p>
                      </div>
                      <div className="w-20 h-2.5 bg-slate-100 rounded-full overflow-hidden relative shadow-inner">
                        <div className="absolute top-0 left-0 h-full bg-theme-primary rounded-full" style={{ width: `${a.progress}%`, transition: 'width 1.5s cubic-bezier(0.16, 1, 0.3, 1)' }}></div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>


          </div>
        </div>
      </div>

      {/* Dashboard Announcement Popup */}
      {latestAnnouncement && showAnnouncementPopup && createPortal(
        <div
          onClick={() => onNavigate('Academic Space')}
          className="fixed bottom-6 right-6 z-[9999] w-[340px] bg-white rounded-2xl shadow-lg border border-slate-200 p-5 cursor-pointer hover:shadow-xl hover:border-theme-primary transition-all animate-fade-in opacity-100 bg-opacity-100 backdrop-blur-none"
        >
          <div className="flex justify-between items-start mb-2">
            <h4 className="font-bold text-slate-900 text-sm tracking-tight">{latestAnnouncement.title}</h4>
            <button
              onClick={(e) => { e.stopPropagation(); setShowAnnouncementPopup(false); }}
              className="text-slate-400 hover:text-slate-700 hover:bg-slate-50 p-1 rounded-md transition-all active:scale-95"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>
          <p className="text-xs text-slate-600 mb-3 line-clamp-2 leading-relaxed">{latestAnnouncement.content}</p>
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            FROM: {latestAnnouncement.author || 'ADMINISTRATION'}
          </div>
        </div>,
        document.body
      )}

    </div>
  );
}
