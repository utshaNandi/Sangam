import { useState, useRef, useEffect } from 'react';
import { classes, students, assignments } from './mockData';
import { Icons } from './Icons';
import teacher1Img from '../../components/teacher1.png';

export default function DashboardHome({ onNavigate }) {
  const activeClassesCount = classes.length;
  const totalStudents = students.length;
  const pendingAssignments = assignments.filter(a => a.status === 'Active').length;
  const todayClasses = classes.filter(() => true); // Mock all as today

  return (
    <div className="space-y-8 animate-fade-in relative">
      
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
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Upcoming
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
                  <div key={a.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-2xl border border-slate-100 hover:border-theme-primary/30 hover:bg-theme-bg/30 hover:shadow-[0_4px_20px_rgba(0,0,0,0.04)] hover:-translate-y-1 transition-all duration-300 cursor-pointer group" onClick={() => onNavigate('Assignments')}>
                    <div>
                      <h4 className="font-bold text-slate-900 group-hover:text-theme-primary transition-colors duration-300">{a.title}</h4>
                      <p className="text-sm text-slate-500 font-medium mt-1">{a.className} • Due {a.dueDate}</p>
                    </div>
                    <div className="mt-3 sm:mt-0 flex items-center gap-5">
                      <div className="text-right transition-transform duration-300 group-hover:-translate-x-1">
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
      className="relative bg-white rounded-[24px] border border-slate-200/60 shadow-sm lg:min-h-[420px] flex items-center"
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
      <div className="relative z-10 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-16 w-full max-w-7xl mx-auto px-10 py-16 md:px-16 md:py-20 pointer-events-none">
        
        {/* Left Side Content (pointer-events-auto so buttons work) */}
        <div className="max-w-2xl flex-1 pointer-events-auto">
           <h2 className="text-[44px] md:text-[56px] font-bold text-slate-900 tracking-tight mb-6 leading-[1.1]">
             Welcome to your <span className="text-theme-primary">Faculty Dashboard</span>
           </h2>
           <p className="text-lg md:text-xl text-slate-600 leading-relaxed max-w-xl">
             Manage your classes, track student progress, review assignments, and organize your academic schedule seamlessly.
           </p>
           
           <div className="flex items-center gap-4 mt-12">
             <button className="px-8 py-3.5 bg-theme-primary text-white rounded-xl font-semibold shadow-sm hover:opacity-90 hover:shadow-md hover:-translate-y-0.5 active:scale-95 transition-all duration-200 text-[15px]">
               Start Today's Session
             </button>
             <button className="px-8 py-3.5 bg-white border border-slate-200 text-slate-700 rounded-xl font-semibold shadow-sm hover:bg-slate-50 hover:border-slate-300 hover:shadow-md hover:-translate-y-0.5 active:scale-95 transition-all duration-200 text-[15px]">
               View Schedule
             </button>
           </div>
        </div>
        
        {/* Right side is intentionally left empty in the flex layout to provide space for the absolute character */}
        <div className="hidden lg:block w-[320px]"></div>
      </div>

      <TeacherCharacter />
    </section>
  )
}

function TeacherCharacter() {
  const containerRef = useRef(null);
  const leftAnchorRef = useRef(null);
  const leftPupilWrapperRef = useRef(null);
  const leftPupilRef = useRef(null);
  const rightAnchorRef = useRef(null);
  const rightPupilWrapperRef = useRef(null);
  const rightPupilRef = useRef(null);
  const rafRef = useRef(null);

  // Store current and target positions for lerping
  const leftPos = useRef({ currentX: 0, currentY: 0, targetX: 0, targetY: 0 });
  const rightPos = useRef({ currentX: 0, currentY: 0, targetX: 0, targetY: 0 });

  useEffect(() => {
    let mouseX = window.innerWidth / 2;
    let mouseY = window.innerHeight / 2;
    let isTracking = false;

    const handleMouseMove = (e) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
      isTracking = true;
    };

    const handleMouseLeave = () => {
      // Smoothly return to center when mouse leaves the viewport
      isTracking = false;
    };

    const updateEyeTarget = (targetObj) => {
      if (!isTracking || !containerRef.current) {
        targetObj.targetX = 0;
        targetObj.targetY = 0;
        return;
      }
      
      const rect = containerRef.current.getBoundingClientRect();
      
      // Calculate normalized cursor position relative to the character container
      // -1 means left/top edge, 1 means right/bottom edge
      // Mouse outside the container is clamped to [-1, 1]
      let normalizedX = (mouseX - (rect.left + rect.width / 2)) / (rect.width / 2);
      let normalizedY = (mouseY - (rect.top + rect.height / 2)) / (rect.height / 2);

      normalizedX = Math.max(-1, Math.min(1, normalizedX));
      normalizedY = Math.max(-1, Math.min(1, normalizedY));

      // Asymmetric vertical constraints
      const maxMoveX = 2.5; 
      const maxMoveUp = 0.5;   // Smaller upward movement
      const maxMoveDown = 3.0; // Larger downward movement

      targetObj.targetX = normalizedX * maxMoveX;
      targetObj.targetY = normalizedY < 0 ? normalizedY * maxMoveUp : normalizedY * maxMoveDown;
    };

    const lerp = (current, target, speed) => current + (target - current) * speed;

    const animate = () => {
      updateEyeTarget(leftPos.current);
      updateEyeTarget(rightPos.current);

      const lerpSpeed = 0.12; // Extremely smooth interpolation speed
      
      leftPos.current.currentX = lerp(leftPos.current.currentX, leftPos.current.targetX, lerpSpeed);
      leftPos.current.currentY = lerp(leftPos.current.currentY, leftPos.current.targetY, lerpSpeed);
      
      rightPos.current.currentX = lerp(rightPos.current.currentX, rightPos.current.targetX, lerpSpeed);
      rightPos.current.currentY = lerp(rightPos.current.currentY, rightPos.current.targetY, lerpSpeed);

      if (leftPupilWrapperRef.current) {
        leftPupilWrapperRef.current.style.transform = `translate(-50%, -50%) translate(${leftPos.current.currentX}px, ${leftPos.current.currentY}px)`;
      }
      if (rightPupilWrapperRef.current) {
        rightPupilWrapperRef.current.style.transform = `translate(-50%, -50%) translate(${rightPos.current.currentX}px, ${rightPos.current.currentY}px)`;
      }

      rafRef.current = requestAnimationFrame(animate);
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    document.addEventListener('mouseleave', handleMouseLeave);
    rafRef.current = requestAnimationFrame(animate);
    
    // Blinking logic
    let blinkTimeout1;
    let blinkTimeout2;
    const blink = () => {
      if (leftPupilRef.current) leftPupilRef.current.style.transform = 'scaleY(0.1)';
      if (rightPupilRef.current) rightPupilRef.current.style.transform = 'scaleY(0.1)';
      
      const blinkDuration = 120 + Math.random() * 60; // 120-180ms
      blinkTimeout1 = setTimeout(() => {
        if (leftPupilRef.current) leftPupilRef.current.style.transform = 'scaleY(1)';
        if (rightPupilRef.current) rightPupilRef.current.style.transform = 'scaleY(1)';
        
        const nextBlink = 3000 + Math.random() * 4000; // 3-7 seconds
        blinkTimeout2 = setTimeout(blink, nextBlink);
      }, blinkDuration);
    };

    const initialBlinkTimer = setTimeout(blink, 3000 + Math.random() * 4000);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseleave', handleMouseLeave);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      clearTimeout(initialBlinkTimer);
      clearTimeout(blinkTimeout1);
      clearTimeout(blinkTimeout2);
    };
  }, []);

  return (
    // Positioning the character so it's larger, and the bottom extends past the hero to be naturally cropped
    <div 
      ref={containerRef}
      className="hidden lg:block absolute -bottom-[50px] right-[-80px] w-[690px] h-[460px] pointer-events-none z-20 opacity-95"
      style={{ clipPath: 'inset(-100% -100% 50px -100%)' }}
    >
      <div className="relative w-full h-full">
        {/* The completely static original artwork (now with muted teal shirt) */}
        <img 
          src={teacher1Img} 
          alt="Faculty Teacher" 
          className="w-full h-full object-contain object-bottom drop-shadow-xl"
        />

        {/* 
          LEFT PUPIL
          Anchored slightly lower than before.
        */}
        <div 
          ref={leftAnchorRef}
          className="absolute pointer-events-none" 
          style={{ top: '23.85%', left: '54.23%', width: '0px', height: '0px' }}
        >
          <div 
            ref={leftPupilWrapperRef} 
            className="absolute" 
            style={{ transform: 'translate(-50%, -50%)' }}
          >
            <div 
              ref={leftPupilRef}
              className="w-[5px] h-[5px] bg-[#0f172a] rounded-full transition-transform duration-150 ease-in-out origin-center"
            />
          </div>
        </div>

        {/* 
          RIGHT PUPIL
          Anchored slightly lower than before.
        */}
        <div 
          ref={rightAnchorRef}
          className="absolute pointer-events-none" 
          style={{ top: '24.25%', left: '57.03%', width: '0px', height: '0px' }}
        >
          <div 
            ref={rightPupilWrapperRef} 
            className="absolute" 
            style={{ transform: 'translate(-50%, -50%)' }}
          >
            <div 
              ref={rightPupilRef}
              className="w-[5px] h-[5px] bg-[#0f172a] rounded-full transition-transform duration-150 ease-in-out origin-center"
            />
          </div>
        </div>
      </div>
    </div>
  );
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
