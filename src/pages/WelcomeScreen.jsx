import { useState, useRef } from 'react';
import InteractiveBook from '../components/InteractiveBook';

export default function WelcomeScreen({ onStartTransition }) {
  const [selectedRole, setSelectedRole] = useState(null);

  const studentBookRef = useRef(null);
  const facultyBookRef = useRef(null);
  const directorBookRef = useRef(null);

  const handleRoleSelect = (role) => {
    setSelectedRole(role);
  };

  const handleFormSubmit = () => {
    const role = selectedRole;
    if (!role) return;
    const refs = { student: studentBookRef, faculty: facultyBookRef, director: directorBookRef };
    const ref = refs[role];
    if (!ref?.current) return;
    const rect = ref.current.getBoundingClientRect();
    const colors = { student: '#DFB980', faculty: '#538C8C', director: '#D67756' };
    
    onStartTransition({ bookColor: colors[role], startRect: rect, bookNode: ref.current, role });
  };

  const roleIcons = {
    student: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/>
      </svg>
    ),
    faculty: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/>
      </svg>
    ),
    director: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <rect width="20" height="14" x="2" y="7" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
      </svg>
    )
  };

  return (
    <div className="min-h-screen bg-[#F4EEE2] flex flex-col items-center justify-center overflow-hidden relative">
      
      {/* Ambient Spotlight with breathing animation */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-white/40 rounded-full blur-[100px] pointer-events-none animate-ambient-glow"></div>

      {/* Invisible Overlay at z-20. Catches clicks to close the book */}
      <div 
        className={`absolute inset-0 z-20 transition-opacity duration-700 ${selectedRole ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'}`}
        onClick={() => setSelectedRole(null)} 
      />

      {/* Clean Apple-style Back Button with micro-interactions */}
      <div className={`absolute top-10 left-10 z-50 transition-all duration-[700ms] ease-[cubic-bezier(0.16,1,0.3,1)] ${selectedRole ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-6 pointer-events-none'}`}>
        <button 
          onClick={() => setSelectedRole(null)}
          className="group flex items-center gap-2.5 text-[#3E2723]/70 hover:text-[#3E2723] font-serif tracking-widest text-sm uppercase transition-all duration-300 py-2 px-3 rounded-lg hover:bg-black/5 active:scale-95"
        >
          <span className="inline-block transition-transform duration-300 ease-out group-hover:-translate-x-1.5">←</span> Back to Shelf
        </button>
      </div>

      <div className="w-full max-w-6xl h-screen max-h-[1000px] flex flex-col items-center justify-start pt-8 px-6 relative z-30 pointer-events-none">
        
        {/* Header Section with staggered entrance */}
        <div className={`flex flex-col items-center mt-0 transition-all duration-[700ms] ease-[cubic-bezier(0.16,1,0.3,1)] ${selectedRole ? 'opacity-10 scale-[0.98] pointer-events-none' : 'opacity-100 scale-100 pointer-events-auto'}`}>
          <div className="relative w-16 h-10 mb-8 flex justify-center animate-rings-in">
            <div className="absolute left-2 w-7 h-7 rounded-full border-[1.5px] border-[#3E2723]/40 mix-blend-multiply transition-transform duration-500 hover:scale-110"></div>
            <div className="absolute right-2 w-7 h-7 rounded-full border-[1.5px] border-[#3E2723]/40 bg-[#DFB980]/40 mix-blend-multiply transition-transform duration-500 hover:scale-110"></div>
          </div>

          <div className="flex items-baseline justify-center animate-hero-fade-up [animation-delay:150ms]">
            <h1 className="text-7xl md:text-8xl font-bold font-serif text-[#3E2723] tracking-tight drop-shadow-sm">
              Sangam
            </h1>
            <div className="w-4 h-4 ml-3 bg-[#DCA766] rounded-full animate-dot-pulse"></div>
          </div>
          
          <p className="mt-6 text-2xl md:text-3xl font-serif text-[#3E2723]/60 tracking-wide animate-hero-fade-up [animation-delay:300ms]">
            One Campus. Many Possibilities.
          </p>
        </div>

        {/* Bookshelf Area */}
        <div className="relative w-full max-w-[900px] h-[450px] flex items-center justify-center mt-48 md:mt-56 z-30 pointer-events-none">

          <div className="absolute bottom-20 w-[340px] h-[160px] scale-[1.4] md:scale-[1.85] origin-bottom pointer-events-auto [perspective:1200px] [transform-style:preserve-3d]">
            
            {/* Local Blur Layer */}
            <div 
              className={`absolute -top-[1000px] -bottom-[1000px] -left-[1000px] -right-[1000px] z-40 bg-[#F4EEE2]/60 backdrop-blur-md transition-all duration-[800ms] pointer-events-none ${selectedRole ? 'opacity-100' : 'opacity-0'}`} 
            />

            {/* Wooden shelf with entrance settling animation */}
            <div className="absolute bottom-0 -left-6 -right-6 h-3.5 rounded-full bg-[#C08C5D] shadow-md z-10 animate-shelf-in origin-center" />

            {/* Recessed slot shadows on the wooden plank when books are pulled out */}
            <div 
              className={`absolute bottom-3.5 rounded-sm bg-[#8A562B]/60 blur-[0.5px] transition-opacity duration-300 pointer-events-none z-10 ${
                selectedRole === 'student' ? 'opacity-100' : 'opacity-0'
              }`}
              style={{ left: '120px', width: '28px', height: '3.5px', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.5)' }}
            />
            <div 
              className={`absolute bottom-3.5 rounded-sm bg-[#8A562B]/60 blur-[0.5px] transition-opacity duration-300 pointer-events-none z-10 ${
                selectedRole === 'faculty' ? 'opacity-100' : 'opacity-0'
              }`}
              style={{ left: '153px', width: '26px', height: '3.5px', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.5)' }}
            />
            <div 
              className={`absolute bottom-3.5 rounded-sm bg-[#8A562B]/60 blur-[0.5px] transition-opacity duration-300 pointer-events-none z-10 ${
                selectedRole === 'director' ? 'opacity-100' : 'opacity-0'
              }`}
              style={{ left: '240px', width: '26px', height: '3.5px', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.5)' }}
            />

            {/* Stacked books on the left */}
            <div className="absolute bottom-3.5 left-[15px] flex flex-col items-center gap-0.5 z-20 animate-book-land [animation-delay:180ms]">
              <InteractiveBook width={65} height={16} color="#538C8C" className="relative !bottom-auto !left-auto" />
              <InteractiveBook width={75} height={22} color="#DFB980" className="relative !bottom-auto !left-auto" />
            </div>
            
            {/* Book left of Student */}
            <InteractiveBook 
              width={20} height={80} color="#D67756" 
              className="bottom-3.5 left-[95px] z-20 animate-book-land [animation-delay:260ms]"
              style={{
                transform: selectedRole === 'student' ? 'translateX(-3px) rotate(-1.5deg)' : 'translateX(0) rotate(0deg)',
                transition: 'transform 450ms cubic-bezier(0.16, 1, 0.3, 1)'
              }}
            />

            {/* 1. STUDENT */}
            <InteractiveBook 
              width={28} height={110} color="#DFB980" 
              className="bottom-3.5 left-[120px] animate-book-land [animation-delay:340ms]"
              isSelected={selectedRole === 'student'}
              onClick={() => handleRoleSelect('student')}
              onFormSubmit={handleFormSubmit}
              bookRef={studentBookRef}
              label="Student"
              labelIcon={roleIcons.student}
              labelOffset={{ x: -45, y: -65 }}
              style={{
                transform: selectedRole === 'faculty' ? 'translateX(-2.5px)' : undefined,
                transition: selectedRole === 'faculty' ? 'transform 450ms cubic-bezier(0.16, 1, 0.3, 1)' : undefined
              }}
            />

            {/* 2. FACULTY */}
            <InteractiveBook 
              width={26} height={120} color="#538C8C" 
              className="bottom-3.5 left-[153px] animate-book-land [animation-delay:420ms]"
              isSelected={selectedRole === 'faculty'}
              onClick={() => handleRoleSelect('faculty')}
              onFormSubmit={handleFormSubmit}
              bookRef={facultyBookRef}
              label="Faculty"
              labelIcon={roleIcons.faculty}
              labelOffset={{ x: 25, y: -90 }}
              style={{
                transform: selectedRole === 'student' ? 'translateX(2.5px)' : undefined,
                transition: selectedRole === 'student' ? 'transform 450ms cubic-bezier(0.16, 1, 0.3, 1)' : undefined
              }}
            />

            {/* Book between Faculty and Director */}
            <InteractiveBook 
              width={22} height={90} color="#D67756" 
              className="bottom-3.5 left-[184px] z-20 animate-book-land [animation-delay:500ms]"
              style={{
                transform: selectedRole === 'faculty' ? 'translateX(2.5px) rotate(1deg)' : 'translateX(0) rotate(0deg)',
                transition: 'transform 450ms cubic-bezier(0.16, 1, 0.3, 1)'
              }}
            />
            {/* Book left of Director */}
            <InteractiveBook 
              width={24} height={95} color="#E5DAC1" 
              className="bottom-3.5 left-[211px] z-20 animate-book-land [animation-delay:580ms]"
              style={{
                transform: selectedRole === 'director' ? 'translateX(-3px) rotate(-1deg)' : 'translateX(0) rotate(0deg)',
                transition: 'transform 450ms cubic-bezier(0.16, 1, 0.3, 1)'
              }}
            />

            {/* 3. DIRECTOR */}
            <InteractiveBook 
              width={26} height={100} color="#D67756" 
              className="bottom-3.5 left-[240px] animate-book-land [animation-delay:660ms]"
              innerClassName="rotate-[15deg]"
              isSelected={selectedRole === 'director'}
              onClick={() => handleRoleSelect('director')}
              onFormSubmit={handleFormSubmit}
              bookRef={directorBookRef}
              label="Director"
              labelIcon={roleIcons.director}
              labelOffset={{ x: 50, y: -70 }} 
            />
          </div>
        </div>

      </div>
    </div>
  );
}