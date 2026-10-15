import { useState } from 'react';
import WelcomeScreen from './pages/WelcomeScreen';
import TeacherApp from './pages/Teacher/TeacherApp';
import DirectorApp from './pages/Director/DirectorApp';
import StudentApp from './pages/Student/StudentApp';
import BookOpenTransition from './components/BookOpenTransition';
import { getMockProfile, createMockFirebaseUser } from './data/mockAuthProfiles';

function App() {
  const [appState, setAppState] = useState('login'); // 'login', 'transition', 'app'
  const [transitionConfig, setTransitionConfig] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [pendingApprovalNotice, setPendingApprovalNotice] = useState(null);

  const handleLogout = () => {
    setCurrentUser(null);
    setUserProfile(null);
    setTransitionConfig(null);
    setAppState('login');
  };

  const switchDevRole = (newRole) => {
    const resolvedRole = (newRole || 'student').toLowerCase().trim();
    const profile = getMockProfile(resolvedRole);
    const user = createMockFirebaseUser(profile);
    setCurrentUser(user);
    setUserProfile(profile);
    setTransitionConfig(prev => ({
      ...(prev || {}),
      role: resolvedRole,
      user,
      profile
    }));
  };

  const activeRole = (transitionConfig?.role || userProfile?.role || 'student').toLowerCase().trim();

  return (
    <>
      {/* Notice Banner */}
      {pendingApprovalNotice && appState === 'login' && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[400] max-w-lg w-[calc(100%-2rem)] animate-hero-fade-up">
          <div className="bg-[#FFF8E7] border border-[#DCA766] text-[#3E2723] rounded-2xl p-4 shadow-xl flex items-start gap-3 backdrop-blur-md">
            <div className="w-7 h-7 rounded-full bg-[#DCA766]/30 flex items-center justify-center text-sm font-bold text-[#8D6E63] shrink-0 mt-0.5">
              ⏳
            </div>
            <div className="flex-1">
              <h4 className="font-serif font-bold text-sm text-[#3E2723]">Account Verification</h4>
              <p className="text-xs text-[#5D4037] mt-0.5 leading-relaxed">{pendingApprovalNotice}</p>
            </div>
            <button 
              onClick={() => setPendingApprovalNotice(null)}
              className="text-[#8D6E63] hover:text-[#3E2723] text-xl font-bold p-1 leading-none transition-colors"
              aria-label="Dismiss notice"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* Login Screen - Unmount when in app to reset state */}
      {appState !== 'app' && (
        <WelcomeScreen 
          onStartTransition={(config) => {
            setPendingApprovalNotice(null);
            setTransitionConfig(config);
            const resolvedRole = (config.role || 'student').toLowerCase().trim();
            const profile = config.profile || getMockProfile(resolvedRole);
            const user = config.user || createMockFirebaseUser(profile);
            setCurrentUser(user);
            setUserProfile(profile);
            setAppState('transition');
            setTimeout(() => {
              setAppState('app');
            }, 1250); // Just after transition finishes
          }} 
        />
      )}
      
      {/* The main app, rendered but hidden until transition or 'app' state */}
      <div 
        style={{
           display: (appState === 'transition' || appState === 'app') ? 'block' : 'none',
           opacity: appState === 'app' ? 1 : 0,
           animation: appState === 'transition' ? 'revealApp 600ms cubic-bezier(0.2, 0.8, 0.2, 1) forwards 650ms' : 'none',
           position: appState === 'transition' ? 'fixed' : 'relative',
           inset: 0,
           zIndex: 50,
           willChange: appState === 'transition' ? 'opacity, filter, transform' : 'auto'
        }}
        className={appState === 'transition' ? 'z-[300]' : 'h-screen h-[100dvh] overflow-hidden'}
      >
        {activeRole === 'director' ? (
          <DirectorApp userProfile={userProfile} onLogout={handleLogout} />
        ) : activeRole === 'student' ? (
          <StudentApp userProfile={userProfile} onLogout={handleLogout} />
        ) : (
          <TeacherApp userProfile={userProfile} onLogout={handleLogout} />
        )}
        
        {/* Subtle light sweep to make it feel like paper catching light */}
        {appState === 'transition' && (
          <div style={{
            position: 'absolute', inset: 0, pointerEvents: 'none',
            background: 'linear-gradient(135deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.8) 50%, rgba(255,255,255,0) 100%)',
            backgroundSize: '200% 200%',
            animation: 'paperLightSweep 750ms cubic-bezier(0.2, 0.8, 0.2, 1) forwards 500ms',
            mixBlendMode: 'overlay',
            zIndex: 100
          }} />
        )}
      </div>

      {/* UI/UX Dev Floating Role Switcher Widget */}
      {appState === 'app' && (
        <div 
          className="fixed bottom-4 right-4 z-[9999] flex items-center gap-1.5 bg-[#2B1810]/90 backdrop-blur-md text-white text-xs px-3.5 py-1.5 rounded-full shadow-2xl border border-[#DFB980]/30 font-sans select-none animate-hero-fade-up"
          style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.35)' }}
        >
          <div className="flex items-center gap-1.5 pr-2 border-r border-white/20">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[#DFB980] font-semibold tracking-wide text-[11px]">UI/UX Mode</span>
          </div>

          <button 
            onClick={() => switchDevRole('student')}
            className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
              activeRole === 'student' 
                ? 'bg-[#DFB980] text-[#3E2723] font-bold shadow-sm scale-105' 
                : 'text-white/70 hover:text-white hover:bg-white/10'
            }`}
          >
            Student
          </button>

          <button 
            onClick={() => switchDevRole('faculty')}
            className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
              activeRole === 'faculty' 
                ? 'bg-[#538C8C] text-white font-bold shadow-sm scale-105' 
                : 'text-white/70 hover:text-white hover:bg-white/10'
            }`}
          >
            Faculty
          </button>

          <button 
            onClick={() => switchDevRole('director')}
            className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
              activeRole === 'director' 
                ? 'bg-[#D67756] text-white font-bold shadow-sm scale-105' 
                : 'text-white/70 hover:text-white hover:bg-white/10'
            }`}
          >
            Director
          </button>

          <button 
            onClick={handleLogout}
            className="ml-1 pl-2.5 border-l border-white/20 text-white/60 hover:text-white transition-colors text-[11px] font-medium"
            title="Return to Bookshelf"
          >
            Shelf ⎋
          </button>
        </div>
      )}

      <style>{`
        @keyframes revealApp {
          0% { 
            opacity: 0; 
            filter: blur(12px) grayscale(80%) brightness(1.1);
            transform: scale(0.94) translateY(4px);
          }
          50% {
            opacity: 0.8;
            filter: blur(3px) grayscale(20%) brightness(1.02);
            transform: scale(0.98) translateY(1px);
          }
          100% { 
            opacity: 1; 
            filter: blur(0px) grayscale(0%) brightness(1);
            transform: scale(1) translateY(0);
          }
        }
        @keyframes paperLightSweep {
          0% { background-position: 200% 200%; opacity: 0; }
          30% { opacity: 1; }
          100% { background-position: -50% -50%; opacity: 0; }
        }
      `}</style>
      
      {/* The transition animation layer */}
      {appState === 'transition' && transitionConfig && (
        <BookOpenTransition
          bookColor={transitionConfig.bookColor}
          startRect={transitionConfig.startRect}
          bookNode={transitionConfig.bookNode}
        />
      )}
    </>
  );
}

export default App;