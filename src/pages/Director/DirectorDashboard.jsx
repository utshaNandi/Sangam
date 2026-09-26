import React, { useRef, useState } from 'react';
import { Icons } from '../Teacher/Icons';
import DirectorCharacter from '../../components/director/DirectorCharacter';

export default function DirectorDashboard({ onNavigate }) {
  const totalStudents = '1,240';
  const totalFaculty = '120';
  const programmes = '7';
  
  return (
    <div className="animate-hero-fade-up">
      <div className="max-w-7xl mx-auto space-y-6">
        <HeroBox />

        {/* Dashboard Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Main Left Column */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Stats Row */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <StatCard title="Total Students" value={totalStudents} icon={<Icons.Students />} />
              <StatCard title="Total Faculty" value={totalFaculty} icon={<Icons.Classes />} />
              <StatCard title="Programmes" value={programmes} icon={<Icons.Hierarchy />} />
            </div>

            {/* Recent Activity / Announcements */}
            <section className="bg-white rounded-[24px] border border-slate-100 shadow-[0_2px_20px_rgba(0,0,0,0.02)] p-7">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-slate-900 tracking-tight">Recent Announcements</h3>
                <button 
                  onClick={() => onNavigate && onNavigate('Announcements')}
                  className="text-theme-primary text-sm font-bold hover:text-theme-primary/80 transition-colors"
                >
                  View All
                </button>
              </div>
              <div className="space-y-3">
                {[
                  { id: 1, title: "Mid-Semester Examination Schedule Released", scope: "Institution-wide", date: "Today" },
                  { id: 2, title: "Faculty Meeting: Department of CSE", scope: "Faculty", date: "Yesterday" },
                  { id: 3, title: "Updates to Academic Policies 2026", scope: "Institution-wide", date: "Oct 12" }
                ].map(a => (
                  <div key={a.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-2xl border border-slate-100 hover:border-theme-primary/30 hover:bg-theme-bg/30 hover:shadow-[0_4px_20px_rgba(0,0,0,0.04)] hover:-translate-y-1 transition-all duration-300 cursor-pointer group" onClick={() => onNavigate && onNavigate('Announcements')}>
                    <div>
                      <h4 className="font-bold text-slate-900 group-hover:text-theme-primary transition-colors duration-300">{a.title}</h4>
                      <p className="text-sm text-slate-500 font-medium mt-1">{a.scope} • {a.date}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* Right Column */}
          <div className="space-y-6">
            
            {/* Quick Actions */}
            <section className="bg-white rounded-[24px] border border-slate-100 shadow-[0_2px_20px_rgba(0,0,0,0.02)] p-7">
              <h3 className="text-xl font-bold text-slate-900 mb-5 tracking-tight">Quick Actions</h3>
              <div className="grid grid-cols-2 gap-3">
                <QuickAction icon={<Icons.Hierarchy />} label="Academic" onClick={() => onNavigate && onNavigate('Academic Space')} />
                <QuickAction icon={<Icons.Students />} label="People" onClick={() => onNavigate && onNavigate('People')} />
                <QuickAction icon={<Icons.Assignments />} label="Reports" onClick={() => onNavigate && onNavigate('Reports & Analytics')} />
                <QuickAction icon={<Icons.Announcements />} label="Broadcast" onClick={() => onNavigate && onNavigate('Announcements')} />
              </div>
            </section>

            {/* Institution Overview */}
            <section className="bg-white rounded-[24px] border border-slate-100 shadow-[0_2px_20px_rgba(0,0,0,0.02)] p-7">
              <h3 className="text-xl font-bold text-slate-900 mb-5 tracking-tight">Institution Status</h3>
              <div className="space-y-4">
                <div className="flex justify-between items-center pb-4 border-b border-slate-100">
                  <span className="text-slate-500 font-medium">Avg. Attendance</span>
                  <span className="font-bold text-theme-primary text-lg">87.2%</span>
                </div>
                <div className="flex justify-between items-center pb-4 border-b border-slate-100">
                  <span className="text-slate-500 font-medium">Active Sections</span>
                  <span className="font-bold text-slate-900 text-lg">42</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-medium">Active Alerts</span>
                  <span className="font-bold text-rose-500 text-lg bg-rose-50 px-2 py-0.5 rounded-lg">3</span>
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
      className="relative bg-white rounded-[24px] border border-slate-200/60 shadow-sm lg:min-h-[320px] flex items-center overflow-visible"
    >
      {/* Background Container for Grid & Glow (Keeps them masked to the rounded corners) */}
      <div className="absolute inset-0 overflow-hidden rounded-[24px] pointer-events-none z-0">
        {/* Dynamic Cursor Glow (Rendered underneath the grid) */}
        <div 
          className="absolute z-0 pointer-events-none transition-opacity duration-700 ease-out"
          style={{
            opacity: isHovered ? 1 : 0,
            background: `radial-gradient(circle 800px at ${mousePos.x}px ${mousePos.y}px, color-mix(in srgb, var(--theme-primary) 18%, transparent) 0%, color-mix(in srgb, var(--theme-primary) 5%, transparent) 40%, transparent 80%)`,
            inset: 0,
          }}
        />
        
        {/* Subtle Premium Grid Pattern (Rendered over the glow) */}
        <div 
          className="absolute inset-0 z-0 pointer-events-none" 
          style={{
            backgroundImage: 'linear-gradient(to right, color-mix(in srgb, var(--theme-primary) 8%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in srgb, var(--theme-primary) 8%, transparent) 1px, transparent 1px)',
            backgroundSize: '96px 96px',
          }} 
          aria-hidden="true"
        ></div>
      </div>
      
      {/* Content Container */}
      <div className="relative z-10 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-12 w-full max-w-7xl mx-auto px-8 py-12 md:px-12 md:py-14 pointer-events-none">
        
        {/* Left Side Content (pointer-events-auto so buttons work) */}
        <div className="max-w-2xl flex-1 pointer-events-auto">
           <h2 className="text-[44px] md:text-[56px] font-bold text-slate-900 tracking-tight mb-6 leading-[1.1]">
             Welcome to your <span className="text-theme-primary">Director Dashboard</span>
           </h2>
           <p className="text-lg md:text-xl text-slate-600 leading-relaxed max-w-xl">
             Oversee institution-wide academic operations, manage faculty and student analytics, and review key performance metrics.
           </p>
           
           <div className="flex items-center gap-4 mt-12">
             <button className="px-8 py-3.5 bg-theme-primary text-white rounded-xl font-semibold shadow-sm hover:opacity-90 hover:shadow-md hover:-translate-y-0.5 active:scale-95 transition-all duration-200 text-[15px]">
               View Institution Report
             </button>
             <button className="px-8 py-3.5 bg-white border border-slate-200 text-slate-700 rounded-xl font-semibold shadow-sm hover:bg-slate-50 hover:border-slate-300 hover:shadow-md hover:-translate-y-0.5 active:scale-95 transition-all duration-200 text-[15px]">
               Academic Schedule
             </button>
           </div>
        </div>
        
        {/* Right side is intentionally left empty in the flex layout to provide space for the absolute character */}
        <div className="hidden lg:block w-[320px]"></div>
      </div>

      <DirectorCharacter />
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
