import { useState } from 'react';
import WelcomeScreen from './pages/WelcomeScreen';
import TeacherApp from './pages/Teacher/TeacherApp';
import BookOpenTransition from './components/BookOpenTransition';

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
           animation: appState === 'transition' ? 'revealApp 500ms ease-in forwards 800ms' : 'none',
           position: appState === 'transition' ? 'fixed' : 'relative',
           inset: 0,
           zIndex: 50 // Above the BookOpenTransition (which is 200... wait)
        }}
        className={appState === 'transition' ? 'z-[300]' : ''}
      >
        <TeacherApp onLogout={() => setAppState('login')} />
      </div>

      <style>{`
        @keyframes revealApp {
          0% { opacity: 0; }
          100% { opacity: 1; }
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