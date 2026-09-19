import { useState } from 'react';
import InteractiveBook from '../components/InteractiveBook';

export default function WelcomeScreen() {
  const [selectedRole, setSelectedRole] = useState(null);

  const handleRoleSelect = (role) => {
    setSelectedRole(role);
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
      
      {/* Ambient Spotlight */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-white/40 rounded-full blur-[100px] pointer-events-none"></div>

      {/* Invisible Overlay at z-20. Catches clicks to close the book */}
      <div 
        className={`absolute inset-0 z-20 ${selectedRole ? 'pointer-events-auto' : 'pointer-events-none'}`}
        onClick={() => setSelectedRole(null)} 
      />

      {/* Clean Apple-style Back Button */}
      <div className={`absolute top-10 left-10 z-50 transition-all duration-[800ms] delay-100 ${selectedRole ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4 pointer-events-none'}`}>
        <button 
          onClick={() => setSelectedRole(null)}
          className="flex items-center gap-2 text-[#3E2723]/70 hover:text-[#3E2723] font-serif tracking-widest text-sm uppercase transition-colors"
        >
          <span>←</span> Back to Shelf
        </button>
      </div>

      <div className="w-full max-w-6xl h-screen max-h-[1000px] flex flex-col items-center justify-start pt-8 px-6 relative z-30 pointer-events-none">
        
        {/* Header Section */}
        <div className={`flex flex-col items-center mt-0 transition-opacity duration-[800ms] ${selectedRole ? 'opacity-10 pointer-events-none' : 'opacity-100 pointer-events-auto'}`}>
          <div className="relative w-16 h-10 mb-8 flex justify-center">
            <div className="absolute left-2 w-7 h-7 rounded-full border-[1.5px] border-[#3E2723]/40 mix-blend-multiply"></div>
            <div className="absolute right-2 w-7 h-7 rounded-full border-[1.5px] border-[#3E2723]/40 bg-[#DFB980]/40 mix-blend-multiply"></div>
          </div>

          <div className="flex items-baseline justify-center">
            <h1 className="text-7xl md:text-8xl font-bold font-serif text-[#3E2723] tracking-tight drop-shadow-sm">
              Sangam
            </h1>
            <div className="w-4 h-4 ml-3 bg-[#DCA766] rounded-full"></div>
          </div>
          
          <p className="mt-6 text-2xl md:text-3xl font-serif text-[#3E2723]/60 tracking-wide">
            One Campus. Many Possibilities.
          </p>
        </div>

        {/* Bookshelf Area */}
        <div className="relative w-full max-w-[900px] h-[450px] flex items-center justify-center mt-48 md:mt-56 z-30 pointer-events-none">

          <div className="absolute bottom-20 w-[340px] h-[160px] scale-[1.4] md:scale-[1.85] origin-bottom pointer-events-auto">
            
            {/* NEW: Local Blur Layer. Sits exactly at z-40, blurring the unselected books (z-20/z-30), but NOT the active book (z-50) */}
            <div 
              className={`absolute -top-[1000px] -bottom-[1000px] -left-[1000px] -right-[1000px] z-40 bg-[#F4EEE2]/60 backdrop-blur-md transition-all duration-[800ms] pointer-events-none ${selectedRole ? 'opacity-100' : 'opacity-0'}`} 
            />

            <div className="absolute bottom-0 -left-6 -right-6 h-3.5 rounded-full bg-[#C08C5D] shadow-md z-10" />

            <div className="absolute bottom-3.5 left-[15px] flex flex-col items-center gap-0.5 z-20">
              <InteractiveBook width={65} height={16} color="#538C8C" className="relative !bottom-auto !left-auto" />
              <InteractiveBook width={75} height={22} color="#DFB980" className="relative !bottom-auto !left-auto" />
            </div>
            
            <InteractiveBook width={20} height={80} color="#D67756" className="bottom-3.5 left-[95px] z-20" />

            {/* 1. STUDENT */}
            <InteractiveBook 
              width={28} height={110} color="#DFB980" 
              className="bottom-3.5 left-[120px]"
              isSelected={selectedRole === 'student'}
              onClick={() => handleRoleSelect('student')}
              label="Student"
              labelIcon={roleIcons.student}
              labelOffset={{ x: -45, y: -65 }} 
            />
            {/* 2. FACULTY */}
            <InteractiveBook 
              width={26} height={120} color="#538C8C" 
              className="bottom-3.5 left-[153px]"
              isSelected={selectedRole === 'faculty'}
              onClick={() => handleRoleSelect('faculty')}
              label="Faculty"
              labelIcon={roleIcons.faculty}
              labelOffset={{ x: 25, y: -90 }} 
            />

            <InteractiveBook width={22} height={90} color="#D67756" className="bottom-3.5 left-[184px] z-20" />
            <InteractiveBook width={24} height={95} color="#E5DAC1" className="bottom-3.5 left-[211px] z-20" />

            {/* 3. DIRECTOR */}
            <InteractiveBook 
              width={26} height={100} color="#D67756" 
              className="bottom-3.5 left-[240px]"
              innerClassName="rotate-[15deg]"
              isSelected={selectedRole === 'director'}
              onClick={() => handleRoleSelect('director')}
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