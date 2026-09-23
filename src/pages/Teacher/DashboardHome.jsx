import { useState, useRef } from 'react';
import { classes, students, assignments } from './mockData';
import { Icons } from './Icons';

export default function DashboardHome({ onNavigate }) {
  const activeClassesCount = classes.length;
  const totalStudents = students.length;
  const pendingAssignments = assignments.filter(a => a.status === 'Active').length;
  const todayClasses = classes.filter(() => true); // Mock all as today

  return (
    <div className="space-y-8 animate-hero-fade-up relative" style={{ animationDuration: '400ms' }}>
      
      <HeroBox />
      
      <div className="relative z-10 space-y-8">
        {/* Top Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          <StatCard title="My Classes" value={`${activeClassesCount} Active Classes`} icon={<Icons.Classes />} />
          <StatCard title="Students" value={`${totalStudents} Students`} icon={<Icons.Students />} />
          <StatCard title="Pending Assignments" value={`${pendingAssignments} To Review`} icon={<Icons.Assignments />} />
          <StatCard title="Today's Classes" value={`${todayClasses.length} Scheduled`} icon={<Icons.Schedule />} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Left Column (Wider) */}
          <div className="lg:col-span-2 space-y-8">
            
            {/* Today's Classes */}
            <section className="bg-white rounded-[24px] border border-slate-100 shadow-[0_2px_20px_rgba(0,0,0,0.02)] p-7 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-theme-bg rounded-full blur-3xl opacity-60 -translate-y-1/2 translate-x-1/3"></div>
              <h3 className="text-xl font-bold text-slate-900 mb-5 relative z-10 tracking-tight">Today's Classes</h3>
              <div className="space-y-3 relative z-10">
                {todayClasses.map(c => (
                  <div key={c.id} className="flex items-center justify-between p-4 rounded-2xl hover:bg-slate-50 transition-all duration-200 border border-transparent hover:border-slate-100 active:scale-[0.98] group cursor-pointer" onClick={() => onNavigate('My Classes')}>
                    <div className="flex items-center gap-5">
                      <div className="w-16 h-16 rounded-2xl bg-theme-bg text-theme-primary flex flex-col items-center justify-center flex-shrink-0 transition-transform duration-300 group-hover:scale-105">
                        <span className="text-[10px] font-bold uppercase tracking-wider">{c.time.split(' ')[1]}</span>
                        <span className="text-lg font-extrabold">{c.time.split(' ')[0]}</span>
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-900 group-hover:text-theme-primary transition-colors text-base">{c.subject}</h4>
                        <p className="text-sm text-slate-500 font-medium">{c.section} • {c.studentsCount} Students</p>
                      </div>
                    </div>
                    <div className="text-right hidden sm:block">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold transition-transform duration-300 group-hover:scale-105">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span> Upcoming
                      </span>
                      <p className="text-sm text-slate-500 mt-2 font-medium group-hover:text-slate-600 transition-colors">Room {c.room}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Recent Assignments */}
            <section className="bg-white rounded-[24px] border border-slate-100 shadow-[0_2px_20px_rgba(0,0,0,0.02)] p-7">
              <div className="flex justify-between items-center mb-5">
                <h3 className="text-xl font-bold text-slate-900 tracking-tight">Assignments</h3>
                <button onClick={() => onNavigate('Assignments')} className="text-sm text-theme-primary hover:opacity-80 active:scale-95 font-bold transition-all">View All →</button>
              </div>
              <div className="space-y-3">
                {assignments.map(a => (
                  <div key={a.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-2xl border border-slate-100 hover:border-theme-primary/30 hover:shadow-[0_4px_20px_rgba(0,0,0,0.03)] active:scale-[0.98] transition-all duration-300 cursor-pointer group" onClick={() => onNavigate('Assignments')}>
                    <div>
                      <h4 className="font-bold text-slate-900 group-hover:text-theme-primary transition-colors">{a.title}</h4>
                      <p className="text-sm text-slate-500 font-medium mt-1">{a.className} • Due {a.dueDate}</p>
                    </div>
                    <div className="mt-3 sm:mt-0 flex items-center gap-5">
                      <div className="text-right transition-transform duration-300 group-hover:scale-105">
                        <p className="text-sm font-bold text-slate-900">{a.submitted} / {a.total}</p>
                        <p className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Submitted</p>
                      </div>
                      <div className="w-20 h-2.5 bg-slate-100 rounded-full overflow-hidden relative shadow-inner">
                        <div className="absolute top-0 left-0 h-full bg-theme-primary rounded-full" style={{ width: `${(a.submitted / a.total) * 100}%`, transition: 'width 1.5s cubic-bezier(0.16, 1, 0.3, 1)' }}></div>
                      </div>
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
                <QuickAction icon={<Icons.Plus />} label="Assignment" onClick={() => onNavigate('Assignments')} />
                <QuickAction icon={<Icons.Attendance />} label="Attendance" onClick={() => onNavigate('Attendance')} />
                <QuickAction icon={<Icons.Resources />} label="Resource" onClick={() => onNavigate('Resources')} />
                <QuickAction icon={<Icons.Announcements />} label="Announcement" onClick={() => onNavigate('Announcements')} />
              </div>
            </section>

            {/* Student Overview */}
            <section className="bg-white rounded-[24px] border border-slate-100 shadow-[0_2px_20px_rgba(0,0,0,0.02)] p-7">
              <h3 className="text-xl font-bold text-slate-900 mb-5 tracking-tight">Student Overview</h3>
              <div className="space-y-4">
                <div className="flex justify-between items-center pb-4 border-b border-slate-100">
                  <span className="text-slate-500 font-medium">Total Students</span>
                  <span className="font-bold text-slate-900 text-lg">{totalStudents}</span>
                </div>
                <div className="flex justify-between items-center pb-4 border-b border-slate-100">
                  <span className="text-slate-500 font-medium">Avg. Attendance</span>
                  <span className="font-bold text-theme-primary text-lg">85.4%</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-medium">Needs Attention</span>
                  <span className="font-bold text-rose-500 text-lg bg-rose-50 px-2 py-0.5 rounded-lg">12</span>
                </div>
              </div>
            </section>

          </div>
        </div>
      </div>
    </div>
  );
}

function HeroBox() {
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
      className="relative overflow-hidden bg-white rounded-[32px] border border-slate-100 shadow-[0_4px_30px_rgba(0,0,0,0.03)] px-10 py-12"
    >
      {/* Background Grid Pattern */}
      <div className="absolute inset-0 z-0 bg-[linear-gradient(to_right,#80808010_1px,transparent_1px),linear-gradient(to_bottom,#80808010_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none" aria-hidden="true"></div>
      
      {/* Dynamic Cursor Glow based on theme color */}
      <div 
        className="absolute z-0 pointer-events-none transition-opacity duration-500 ease-out"
        style={{
          opacity: isHovered ? 1 : 0,
          background: `radial-gradient(circle 400px at ${mousePos.x}px ${mousePos.y}px, color-mix(in srgb, var(--theme-primary) 15%, transparent), transparent 100%)`,
          inset: 0,
        }}
      />
      
      {/* Content */}
      <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-8">
        <div className="max-w-2xl">
           <h2 className="text-4xl md:text-5xl font-extrabold text-slate-900 tracking-tight mb-5 leading-tight">
             Welcome to your <span className="text-theme-primary">Faculty Dashboard</span>
           </h2>
           <p className="text-lg text-slate-500 font-medium leading-relaxed max-w-xl">
             Manage your classes, track student progress, review assignments, and organize your academic schedule seamlessly.
           </p>
           
           <div className="flex items-center gap-4 mt-8">
             <button className="px-6 py-3 bg-theme-primary text-white rounded-xl font-bold shadow-sm hover:opacity-90 hover:shadow-md hover:-translate-y-0.5 active:scale-95 transition-all duration-200">
               Start Today's Session
             </button>
             <button className="px-6 py-3 bg-theme-bg text-theme-primary rounded-xl font-bold shadow-sm hover:bg-slate-100 hover:-translate-y-0.5 active:scale-95 transition-all duration-200">
               View Schedule
             </button>
           </div>
        </div>
        
        {/* Decorative Progress Element (matching the reference's circular progress) */}
        <div className="hidden lg:flex flex-col items-center justify-center p-8 bg-white/60 backdrop-blur-md rounded-[28px] border border-slate-100 shadow-sm relative group">
           <div className="w-24 h-24 rounded-full border-[6px] border-theme-bg flex items-center justify-center relative shadow-inner">
              <svg className="absolute inset-0 w-full h-full -rotate-90">
                 <circle cx="50%" cy="50%" r="42" fill="none" stroke="var(--theme-primary)" strokeWidth="6" strokeDasharray="264" strokeDashoffset="52" className="drop-shadow-sm transition-all duration-1000 group-hover:strokeDashoffset-[20]" />
              </svg>
              <div className="flex flex-col items-center justify-center">
                 <span className="text-2xl font-extrabold text-slate-900 leading-none">80%</span>
              </div>
           </div>
           <p className="text-[11px] uppercase font-extrabold text-slate-400 tracking-[0.2em] mt-5">Task Progress</p>
           <p className="text-xs text-slate-500 font-medium mt-1">12 tasks to go</p>
        </div>
      </div>
    </section>
  )
}

function StatCard({ title, value, icon }) {
  return (
    <div className="bg-white p-6 rounded-[24px] border border-slate-100 shadow-[0_2px_20px_rgba(0,0,0,0.02)] flex items-start gap-4 transition-all duration-300 hover:-translate-y-1.5 hover:shadow-[0_8px_30px_rgba(0,0,0,0.06)] group">
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
