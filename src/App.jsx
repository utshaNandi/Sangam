import { useState, useEffect } from 'react';
import WelcomeScreen from './pages/WelcomeScreen';
import TeacherApp from './pages/Teacher/TeacherApp';
import DirectorApp from './pages/Director/DirectorApp';
import StudentApp from './pages/Student/StudentApp';
import BookOpenTransition from './components/BookOpenTransition';
import { auth, db } from './firebase/config';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

function runWithTimeout(promise, ms = 3500, operationName = 'Firestore operation') {
  return Promise.race([
    promise,
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error(`${operationName} timed out after ${ms}ms`)), ms)
    )
  ]);
}

function App() {
  const [appState, setAppState] = useState('login'); // 'login', 'transition', 'app'
  const [transitionConfig, setTransitionConfig] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Persist authentication state using onAuthStateChanged
  useEffect(() => {
    let isInitialAuthCheck = true;
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setCurrentUser(firebaseUser);
        try {
          const userDocSnap = await runWithTimeout(
            getDoc(doc(db, 'users', firebaseUser.uid)),
            3500,
            'Profile check'
          ).catch((e) => {
            console.warn('Firestore profile fetch bypassed in onAuthStateChanged:', e.message);
            return null;
          });

          let userRole = 'student';
          if (userDocSnap && userDocSnap.exists && userDocSnap.exists()) {
            const data = userDocSnap.data();
            if (data.status === 'pending_approval') {
              await signOut(auth);
              setCurrentUser(null);
              setUserProfile(null);
              setTransitionConfig(null);
              setAppState('login');
              setAuthLoading(false);
              return;
            }
            setUserProfile(data);
            userRole = data.role || 'student';
          } else {
            // Strict role safety: never grant privileged roles without a verified profile document
            userRole = 'student';
            const fallbackProfile = {
              uid: firebaseUser.uid,
              name: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User',
              email: firebaseUser.email,
              role: userRole,
            };
            setUserProfile(fallbackProfile);
          }
          setTransitionConfig(prev => ({
            ...(prev || {}),
            role: userRole,
            user: firebaseUser
          }));
        } catch (err) {
          console.error('Error fetching Firestore user profile:', err);
          setTransitionConfig(prev => ({
            ...(prev || {}),
            role: 'student',
            user: firebaseUser
          }));
        }

        // On initial app mount, restore existing session if authenticated
        if (isInitialAuthCheck) {
          setAppState('app');
        }
      } else {
        setCurrentUser(null);
        setUserProfile(null);
        setTransitionConfig(null);
        setAppState('login');
      }
      setAuthLoading(false);
      isInitialAuthCheck = false;
    });

    return () => unsubscribe();
  }, []);

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error('Logout error:', err);
    }
    setCurrentUser(null);
    setUserProfile(null);
    setTransitionConfig(null);
    setAppState('login');
  };

  const activeRole = transitionConfig?.role || userProfile?.role || 'student';

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#F4EEE2] flex flex-col items-center justify-center">
        <div className="flex items-center gap-3">
          <div className="w-4 h-4 bg-[#DCA766] rounded-full animate-dot-pulse"></div>
          <span className="font-serif text-[#3E2723] text-xl font-bold tracking-wide">Sangam</span>
        </div>
      </div>
    );
  }

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
           zIndex: 50,
           willChange: appState === 'transition' ? 'opacity, filter, transform' : 'auto'
        }}
        className={appState === 'transition' ? 'z-[300]' : ''}
      >
        {activeRole === 'director' ? (
          <DirectorApp onLogout={handleLogout} />
        ) : activeRole === 'student' ? (
          <StudentApp onLogout={handleLogout} />
        ) : (
          <TeacherApp onLogout={handleLogout} />
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