import { useState, useEffect } from 'react';
import { getMockProfile, createMockFirebaseUser } from '../data/mockAuthProfiles';

export default function InteractiveBook({
  width, height, color, isSelected, onClick, className = "", innerClassName = "",
  label, labelIcon, labelOffset = { x: 0, y: -40 }, bookRef, onFormSubmit,
  role = 'student'
}) {
  const isInteractive = !!onClick;
  const [isSignUp, setIsSignUp] = useState(false);
  const [isPressed, setIsPressed] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [infoMessage, setInfoMessage] = useState('');

  // Reset form errors, loading state, and inputs when selection changes
  useEffect(() => {
    if (!isSelected) {
      setError('');
      setInfoMessage('');
      setIsLoading(false);
      setIsSignUp(false);
      setEmail('');
      setPassword('');
      setFullName('');
    }
  }, [isSelected]);

  const COVER_WIDTH = 220;
  const COVER_HEIGHT = 300;
  const EXPANDED_SPINE_WIDTH = 32;
  const TOTAL_EXPANDED_WIDTH = EXPANDED_SPINE_WIDTH + COVER_WIDTH;

  const handleSubmit = (e) => {
    if (e) e.preventDefault();
    if (isLoading) return; // Prevent duplicate submissions

    setError('');
    setInfoMessage('');
    setIsLoading(true);

    const targetRole = role || label?.toLowerCase() || 'student';
    const enteredName = fullName.trim();
    const enteredEmail = email.trim().toLowerCase();

    // Custom overrides if developer entered custom name or email
    const customOverrides = {};
    if (enteredName) customOverrides.name = enteredName;
    if (enteredEmail) customOverrides.email = enteredEmail;

    const mockProfile = getMockProfile(targetRole, customOverrides);
    const mockUser = createMockFirebaseUser(mockProfile);

    setIsPressed(true);
    setTimeout(() => {
      setIsPressed(false);
      setIsLoading(false);
      if (onFormSubmit) {
        onFormSubmit(mockUser, targetRole, mockProfile);
      }
    }, 160);
  };

  return (
    <div
      ref={bookRef}
      className={`absolute group ${className} ${isSelected ? 'z-50' : 'z-30'} transition-all duration-[1000ms] ease-[cubic-bezier(0.16,1,0.3,1)]`}
      style={{
        width: isSelected ? `${TOTAL_EXPANDED_WIDTH}px` : `${width}px`,
        height: isSelected ? `${COVER_HEIGHT}px` : `${height}px`,
        left: isSelected ? '44px' : undefined,
        bottom: isSelected ? '15px' : undefined,
        perspective: '1500px',
      }}
    >
      {/* Floating Label and Dashed Line */}
      {label && (
        <div className={`transition-opacity duration-500 ${isSelected ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
          <svg className="absolute z-40 pointer-events-none overflow-visible" style={{ top: 0, left: '50%' }}>
            <path
              d={`M ${labelOffset.x} ${labelOffset.y + 16} C ${labelOffset.x} ${labelOffset.y * 0.4}, 0 ${labelOffset.y * 0.7}, 0 -5`}
              fill="none" stroke="#3E2723" strokeWidth="1.5" strokeDasharray="3 4"
              className={`transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${isSelected ? 'opacity-70 stroke-[#3E2723]' : 'opacity-20 group-hover:opacity-70 group-hover:stroke-[#3E2723]'}`}
            />
          </svg>

          <div
            className={`absolute -translate-x-1/2 -translate-y-1/2 flex items-center gap-2 px-3.5 py-1.5 backdrop-blur-md border border-white/60 rounded-full text-[9px] font-bold tracking-[0.2em] uppercase text-[#3E2723] whitespace-nowrap transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] pointer-events-none z-50 animate-float-bob ${isSelected ? 'opacity-100 shadow-md bg-white/95 scale-110' : 'opacity-60 shadow-sm bg-white/50 group-hover:opacity-100 group-hover:bg-white/80 group-hover:scale-105 group-hover:shadow-md'}`}
            style={{ top: `${labelOffset.y}px`, left: `calc(50% + ${labelOffset.x}px)` }}
          >
            {labelIcon && <span className="opacity-75 transition-transform duration-300 group-hover:scale-110">{labelIcon}</span>}
            {label}
          </div>
        </div>
      )}

      {/* 3D BOOK ASSEMBLY */}
      <div className="w-full h-full relative" style={{ transformStyle: 'preserve-3d' }}>

        {/* COMPONENT 1: THE SHELF BOOK (Morphs into the Spine when opened) */}
        <div
          onClick={!isSelected ? onClick : undefined}
          className={`absolute bottom-0 left-0 transition-all duration-[1000ms] ease-[cubic-bezier(0.16,1,0.3,1)] overflow-hidden ${isInteractive && !isSelected ? 'cursor-pointer group-hover:-translate-y-2.5 group-hover:shadow-[0_14px_24px_rgba(0,0,0,0.22)]' : 'shadow-sm'} ${!isSelected ? innerClassName : ''}`}
          style={{
            width: isSelected ? `${EXPANDED_SPINE_WIDTH}px` : `${width}px`,
            height: '100%',
            backgroundColor: color,
            borderRadius: isSelected ? '6px 0 0 6px' : '4px',
            boxShadow: isSelected ? '-20px 20px 40px rgba(0,0,0,0.3)' : undefined,
            zIndex: 10,
            transformOrigin: 'bottom center',
            transform: isSelected ? 'rotate(0deg)' : undefined
          }}
        >
          {/* The Original Shelf Shadow - Fades out when opened */}
          <div className={`absolute left-0 top-0 bottom-0 w-1.5 bg-black/10 transition-opacity duration-[1000ms] ${isSelected ? 'opacity-0' : 'opacity-100'}`} />

          {/* Book Binding Creases - Fade in when opened */}
          <div className={`absolute right-0 top-0 bottom-0 w-2 bg-black/15 transition-opacity duration-[1000ms] ${isSelected ? 'opacity-100' : 'opacity-0'}`} />
          <div className={`absolute left-0 top-0 bottom-0 w-1.5 bg-white/20 transition-opacity duration-[1000ms] ${isSelected ? 'opacity-100' : 'opacity-0'}`} />

          {/* Subtle Spine Sheen Highlight on Hover */}
          <div className="absolute inset-0 bg-gradient-to-t from-transparent via-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
        </div>

        {/* COMPONENT 2: THE FRONT COVER */}
        <div
          className="absolute bottom-0 origin-bottom-left transition-all duration-[1000ms] ease-[cubic-bezier(0.16,1,0.3,1)] overflow-hidden flex flex-col"
          style={{
            width: `${COVER_WIDTH}px`,
            height: `${COVER_HEIGHT}px`,
            left: isSelected ? `${EXPANDED_SPINE_WIDTH}px` : `${width}px`,
            backgroundColor: color,
            borderRadius: isSelected ? '0 8px 8px 0' : '4px',
            transform: isSelected ? 'scale(1) rotateY(0deg)' : `scale(${height / COVER_HEIGHT}) rotateY(-110deg)`,
            opacity: isSelected ? 1 : 0,
            boxShadow: isSelected ? '30px 20px 50px rgba(0,0,0,0.35)' : 'none',
            pointerEvents: isSelected ? 'auto' : 'none'
          }}
          onClick={(e) => e.stopPropagation()}
        >

          {/* Inner Form Interface */}
          <div className={`absolute inset-0 p-5 flex flex-col justify-between transition-opacity duration-700 ${isSelected ? 'opacity-100 delay-200' : 'opacity-0'}`}>

            {/* Form Header with staggered reveal */}
            <div>
              <div className={`flex items-center justify-center gap-2 mb-2 mt-0.5 transition-all duration-500 delay-[250ms] ${isSelected ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'}`}>
                <div className="w-7 h-7 rounded-full bg-white/25 flex items-center justify-center text-white shadow-inner transition-transform duration-500 hover:scale-105">
                  {labelIcon}
                </div>
                <h2 className="text-white font-serif text-[14px] tracking-[0.2em] uppercase font-bold drop-shadow-sm">
                  {label}
                </h2>
              </div>

              {/* Dev Mode Indicator Pill */}
              <div className="flex justify-center mb-2">
                <span className="text-[9px] uppercase tracking-wider text-white/80 bg-black/20 border border-white/15 px-2.5 py-0.5 rounded-full backdrop-blur-sm font-sans flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  UI/UX Dev Mode • Auth Bypassed
                </span>
              </div>

              {/* Segmented Control */}
              <div className={`relative flex bg-black/15 p-1 rounded-full mb-3 shadow-inner transition-all duration-500 delay-[320ms] ${isSelected ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'}`}>
                <div
                  className={`absolute top-1 bottom-1 w-[calc(50%-4px)] bg-white rounded-full shadow-sm transition-transform duration-400 ease-[cubic-bezier(0.16,1,0.3,1)] ${isSignUp ? 'translate-x-full' : 'translate-x-0'}`}
                />
                <button
                  type="button"
                  onClick={() => { setIsSignUp(false); setError(''); }}
                  className={`relative flex-1 py-1 text-[10px] font-bold tracking-widest uppercase rounded-full transition-colors duration-300 z-10 active:scale-95 ${!isSignUp ? 'text-[#3E2723]' : 'text-white/80 hover:text-white'}`}
                >
                  Log In
                </button>
                <button
                  type="button"
                  onClick={() => { setIsSignUp(true); setError(''); }}
                  className={`relative flex-1 py-1 text-[10px] font-bold tracking-widest uppercase rounded-full transition-colors duration-300 z-10 active:scale-95 ${isSignUp ? 'text-[#3E2723]' : 'text-white/80 hover:text-white'}`}
                >
                  Sign Up
                </button>
              </div>

              {/* Form Inputs */}
              <form
                className={`flex flex-col gap-2 transition-all duration-500 delay-[390ms] ${isSelected ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'}`}
                onSubmit={handleSubmit}
              >
                {/* Accordion container for Full Name */}
                <div
                  className={`overflow-hidden transition-all duration-400 ease-[cubic-bezier(0.16,1,0.3,1)] ${isSignUp ? 'max-h-12 opacity-100 translate-y-0' : 'max-h-0 opacity-0 -translate-y-2 pointer-events-none'}`}
                >
                  <input
                    type="text"
                    placeholder="Full Name (optional)"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    disabled={!isSignUp}
                    className="w-full bg-white/20 backdrop-blur-md text-white placeholder:text-white/70 text-[11px] px-3 py-1.5 rounded-md outline-none focus:bg-white/30 border border-white/10 focus:border-white/60 focus:ring-2 focus:ring-white/20 transition-all duration-200 shadow-inner"
                  />
                </div>

                <input
                  type="text"
                  placeholder="Email (optional)"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  className="w-full bg-white/20 backdrop-blur-md text-white placeholder:text-white/70 text-[11px] px-3 py-1.5 rounded-md outline-none focus:bg-white/30 border border-white/10 focus:border-white/60 focus:ring-2 focus:ring-white/20 transition-all duration-200 shadow-inner"
                />
                <input
                  type="password"
                  placeholder="Password (optional)"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  className="w-full bg-white/20 backdrop-blur-md text-white placeholder:text-white/70 text-[11px] px-3 py-1.5 rounded-md outline-none focus:bg-white/30 border border-white/10 focus:border-white/60 focus:ring-2 focus:ring-white/20 transition-all duration-200 shadow-inner"
                />

                {infoMessage && (
                  <div className="bg-amber-950/70 border border-amber-300/40 text-amber-100 text-[10px] px-2.5 py-1.5 rounded-md font-medium text-center leading-tight shadow-sm backdrop-blur-sm animate-fade-in">
                    {infoMessage}
                  </div>
                )}

                {error && (
                  <div className="bg-red-900/60 border border-red-300/40 text-red-100 text-[10px] px-2.5 py-1.5 rounded-md font-medium text-center leading-tight shadow-sm backdrop-blur-sm animate-fade-in">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isLoading}
                  className="relative overflow-hidden w-full py-2.5 bg-white text-[11px] font-bold uppercase tracking-widest rounded-md text-[#3E2723] shadow-lg hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 group/btn mt-1 disabled:opacity-75"
                  style={isPressed ? {
                    transform: 'scale(0.95) translateY(1.5px)',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.1), inset 0 1px 2px rgba(0,0,0,0.04)',
                    transition: 'transform 80ms cubic-bezier(0.2, 0, 0, 1), box-shadow 80ms ease',
                  } : undefined}
                >
                  <span className="relative z-10 flex items-center justify-center gap-1.5">
                    <span>⚡ Enter {label}</span>
                  </span>
                  {/* Subtle sheen passing across button on hover */}
                  <div className="absolute inset-0 -translate-x-full group-hover/btn:translate-x-full transition-transform duration-1000 bg-gradient-to-r from-transparent via-black/5 to-transparent pointer-events-none" />
                </button>
              </form>
            </div>

            <div className="text-center text-[10px] text-white/60 pb-1">
              Click &quot;Enter {label}&quot; to preview UI
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}