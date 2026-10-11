import React, { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icons } from '../Teacher/Icons';
import StudentCharacter from '../../components/student/StudentCharacter';
import { students, assignments, announcements, globalPeriodAttendance, calculateSemesterAttendance } from '../Teacher/mockData';
import { scheduleData, periodsTime } from './StudentSchedule';

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
             You have {assignmentCount} upcoming {assignmentCount === 1 ? 'assignment' : 'assignments'} and {announcementCount} new {announcementCount === 1 ? 'announcement' : 'announcements'} in {section}.
           </p>
           
           <div className="flex flex-wrap items-center gap-4">
             <button 
               onClick={() => onNavigate('Academic Space')}
               className="px-8 py-3.5 bg-theme-primary text-white rounded-xl font-semibold shadow-sm hover:opacity-90 hover:shadow-md hover:-translate-y-0.5 active:scale-95 transition-all duration-200 text-[15px]"
             >
               Go to Sec C
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

function StatCard({ title, value, icon }) {
  return (
    <div className="bg-white p-6 rounded-[24px] border border-slate-100 shadow-[0_2px_20px_rgba(0,0,0,0.02)] flex items-start gap-4 transition-all duration-300 hover:-translate-y-1.5 hover:shadow-[0_8px_30px_rgba(0,0,0,0.06)] cursor-pointer group">
      <div className="w-12 h-12 rounded-2xl bg-theme-bg text-theme-primary flex items-center justify-center flex-shrink-0 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3">
        {icon}
      </div>
      <div>
        <p className="text-[13px] font-bold uppercase tracking-wide text-slate-400 mb-1">{title}</p>
        <p className="text-xl font-extrabold text-slate-900">{value}</p>
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

export default function StudentDashboard({ onNavigate }) {
  const student = students.find(s => s.section === 'CSE-C') || students[0];
  const firstName = student.name.split(' ')[0];
  const studentId = student.id;
  const studentAnnouncementsState = announcements.filter(an => an.scopePath && an.scopePath.includes('Sec C'));
  const latestAnnouncement = studentAnnouncementsState.length > 0 ? studentAnnouncementsState[0] : null;
  const [showAnnouncementPopup, setShowAnnouncementPopup] = useState(latestAnnouncement !== null);

  // 1. Pending Assignments
  const studentAssignments = assignments.filter(a => a.className === student.section);
  const pendingAssignmentsCount = studentAssignments.length;

  const pendingAssignments = studentAssignments.map(a => ({
    id: a.id,
    title: a.title,
    subject: a.className,
    dueDate: a.dueDate,
    status: a.status,
    progress: 0
  }));

  // 2. Announcements
  // Find announcements that match the student's scope (assuming CSE-C -> Sec C)
  const studentAnnouncements = announcements.filter(an => an.scopePath && an.scopePath.includes('Sec C'));
  const announcementCount = studentAnnouncements.length;

  // 3. Schedule for today
  const dayIndex = new Date().getDay();
  // Map dayIndex (0=Sun, 1=Mon) to scheduleData index (0=Mon, 1=Tue)
  const scheduleIndex = dayIndex === 0 ? 0 : dayIndex - 1;
  const rawSchedule = scheduleData[scheduleIndex] || [];
  
  // Transform raw schedule into todayClasses format
  const todayClasses = rawSchedule
    .map((item, idx) => {
      if (item.subject === 'LUNCH' || item.subject === 'BREAK') return null;
      const periodInfo = periodsTime[idx];
      return {
        id: idx,
        time: periodInfo ? periodInfo.time : '',
        subject: item.subject,
        section: student.section,
          teacher: item.teacher,
        type: item.subject === 'LAB' ? 'Lab' : 'Lecture',
        room: item.subject === 'LAB' ? 'Lab 2' : 'Room 402'
      };
    })
    .filter(Boolean);

  // 4. Attendance Percentage
  const { percentage: attendancePercentage } = calculateSemesterAttendance(studentId);

  const todayLabsCount = todayClasses.filter(c => c.type === 'Lab').length;

  return (
    <div className="space-y-8 animate-fade-in relative">
      
      <HeroBox 
        onNavigate={onNavigate} 
        studentName={firstName}
        assignmentCount={pendingAssignmentsCount}
        announcementCount={announcementCount}
        section={student.section}
      />

      <div className="relative z-10 space-y-8">
        {/* Top Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          <StatCard title="Attendance" value={`${attendancePercentage}%`} icon={<Icons.Attendance />} />
          <StatCard title="Pending Tasks" value={`${pendingAssignmentsCount} Due`} icon={<Icons.Assignments />} />
          <StatCard title="Today's Classes" value={`${todayClasses.length} Scheduled`} icon={<Icons.Schedule />} />
          <StatCard title="Labs" value={`${todayLabsCount} Scheduled`} icon={<Icons.Classes />} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          
          {/* Left Column */}
          <div className="space-y-8">
            
            {/* Today's Classes */}
            <section className="bg-white rounded-[24px] border border-slate-100 shadow-[0_2px_20px_rgba(0,0,0,0.02)] p-7 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-theme-bg rounded-full blur-3xl opacity-60 -translate-y-1/2 translate-x-1/3"></div>
              <h3 className="text-xl font-bold text-slate-900 mb-5 relative z-10 tracking-tight">Today's Classes</h3>
              <div className="space-y-3 relative z-10">
                {todayClasses.map(c => (
                  <div key={c.id} className="flex items-center justify-between p-4 rounded-2xl hover:bg-slate-50 transition-all duration-200 border border-transparent hover:border-slate-100 active:scale-[0.98] group cursor-pointer" onClick={() => onNavigate('Schedule')}>
                    <div className="flex items-center gap-5">
                      <div className="w-16 h-16 rounded-2xl bg-theme-bg text-theme-primary flex flex-col items-center justify-center flex-shrink-0 transition-transform duration-300 group-hover:scale-105">
                        <span className="text-[10px] font-bold uppercase tracking-wider">{c.time.split(' ')[1]}</span>
                        <span className="text-lg font-extrabold">{c.time.split(' ')[0]}</span>
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-900 group-hover:text-theme-primary transition-colors text-base">{c.subject}</h4>
                        <p className="text-sm text-slate-500 font-medium">{c.section} — {c.type} — {c.teacher}</p>
                      </div>
                    </div>
                    <div className="text-right hidden sm:block">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold transition-transform duration-300 group-hover:scale-105">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Upcoming
                      </span>
                      <p className="text-sm text-slate-500 mt-2 font-medium group-hover:text-slate-600 transition-colors">Room {c.room}</p>
                    </div>
                  </div>
                ))}
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
