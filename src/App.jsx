import { useState } from 'react';
import WelcomeScreen from './pages/WelcomeScreen';
import TeacherApp from './pages/Teacher/TeacherApp';
import DirectorApp from './pages/Director/DirectorApp';
import BookOpenTransition from './components/BookOpenTransition';

import StudentApp from './pages/Student/StudentApp';

function App() {
  const [appState, setAppState] = useState('login'); // 'login', 'transition', 'app'
  const [transitionConfig, setTransitionConfig] = useState(null);

  return (
    <>
      {/* Login Screen - Unmount when in app to reset state */}
      {appState !== 'app' && (
        <WelcomeScreen 
          onStartTransition={(config) => {
            setTransitionConfig(config);
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
           zIndex: 50, // Above the BookOpenTransition (which is 200... wait)
           willChange: appState === 'transition' ? 'opacity, filter, transform' : 'auto'
        }}
        className={appState === 'transition' ? 'z-[300]' : ''}
      >
        {transitionConfig?.role === 'director' ? (
          <DirectorApp onLogout={() => setAppState('login')} />
        ) : transitionConfig?.role === 'student' ? (
          <StudentApp onLogout={() => setAppState('login')} />
        ) : (
          <TeacherApp onLogout={() => setAppState('login')} />
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
      {appState === 'transition' && (
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