import { useState, useEffect } from 'react';
import { auth, db } from '../firebase/config';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signOut
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import {
  startRegistrationCoordination,
  bindRegistrationUid,
  stopRegistrationCoordination
} from '../firebase/authCoordinator';

function getFriendlyErrorMessage(code) {
  switch (code) {
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/user-disabled':
      return 'This account has been disabled.';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Invalid email address or password.';
    case 'auth/email-already-in-use':
      return 'This email is already in use. Please log in.';
    case 'auth/weak-password':
      return 'Password should be at least 6 characters.';
    case 'auth/network-request-failed':
      return 'Network connection error. Please try again.';
    case 'auth/too-many-requests':
      return 'Too many failed attempts. Please try again later.';
    default:
      if (typeof code === 'string' && code.includes('Firebase:')) {
        return code.replace(/^Firebase:\s*/, '').replace(/\s*\([^)]*\)\.?$/, '');
      }
      return 'Authentication failed. Please check your credentials.';
  }
}

// Bounded timeout helper to prevent hanging Firestore promises in offline/disabled modes
function runWithTimeout(promise, ms = 4000, operationName = 'Firestore operation') {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${operationName} timed out after ${ms}ms`)), ms)
    )
  ]);
}

async function checkRoleAuthorization(role, email) {
  const normalizedEmail = (email || '').toLowerCase().trim();

  // Check Firestore for admin pre-authorization collections with bounded timeout
  try {
    const staffDoc = await runWithTimeout(
      getDoc(doc(db, 'authorized_staff', normalizedEmail)),
      2500,
      'Staff authorization check'
    );
    if (staffDoc && staffDoc.exists && staffDoc.exists()) {
      const data = staffDoc.data();
      if (data.role === role || data.authorized === true) return true;
    }
  } catch (err) {
    // Collection not present, offline, or inaccessible
  }

  try {
    const roleDoc = await runWithTimeout(
      getDoc(doc(db, 'authorized_roles', normalizedEmail)),
      2500,
      'Role authorization check'
    );
    if (roleDoc && roleDoc.exists && roleDoc.exists()) {
      const data = roleDoc.data();
      if (data.role === role || data.authorized === true) return true;
    }
  } catch (err) {
    // Collection not present, offline, or inaccessible
  }

  return false;
}

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

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isLoading) return; // Prevent duplicate submissions

    setError('');
    setInfoMessage('');
    setIsLoading(true);

    const targetRole = role || label?.toLowerCase() || 'student';
    const trimmedEmail = email.trim().toLowerCase();

    try {
      if (isSignUp) {
        startRegistrationCoordination();
        // Sign Up Flow for all roles
        if (targetRole === 'student') {
          // 1. Student Sign Up (Open public registration)
          const userCredential = await createUserWithEmailAndPassword(auth, trimmedEmail, password);
          const user = userCredential.user;
          bindRegistrationUid(user.uid);

          if (fullName.trim()) {
            try {
              await updateProfile(user, { displayName: fullName.trim() });
            } catch (profileErr) {
              console.warn('Profile displayName update failed:', profileErr);
            }
          }

          // Write profile to Firestore with bounded timeout
          let profileSaved = false;
          try {
            await runWithTimeout(
              setDoc(doc(db, 'users', user.uid), {
                uid: user.uid,
                name: fullName.trim() || 'Student',
                email: user.email || trimmedEmail,
                role: 'student',
                status: 'pending_approval',
                createdAt: new Date().toISOString(),
                department: '',
                year: '',
                section: '',
                institution: 'UEMK',
              }),
              3500,
              'Student Firestore profile write'
            );
            profileSaved = true;
          } catch (firestoreErr) {
            // Partial success: Firebase Auth account was created successfully, but Firestore write failed
            console.error('Firestore profile save failed:', firestoreErr);
          }

          // Do not grant student-dashboard access to pending account; sign out immediately
          await signOut(auth);
          if (profileSaved) {
            setInfoMessage('Registration submitted! Your student account is pending Director approval and academic assignment.');
          } else {
            setError('Registration profile creation failed. Please check your connection and try again.');
          }
          setIsLoading(false);
          return;
        } else {
          // 2. Faculty / Director Sign Up: Authenticate first to enable secure Firestore whitelist lookup
          const userCredential = await createUserWithEmailAndPassword(auth, trimmedEmail, password);
          const user = userCredential.user;
          bindRegistrationUid(user.uid);

          if (fullName.trim()) {
            try {
              await updateProfile(user, { displayName: fullName.trim() });
            } catch (profileErr) {
              console.warn('Profile displayName update failed:', profileErr);
            }
          }

          // User is now authenticated with Firebase Auth; check administrator-controlled whitelist
          const isAuthorized = await checkRoleAuthorization(targetRole, trimmedEmail);

          if (isAuthorized) {
            // Authorized registration: activate privileged role immediately
            try {
              await runWithTimeout(
                setDoc(doc(db, 'users', user.uid), {
                  uid: user.uid,
                  name: fullName.trim() || label,
                  email: user.email,
                  role: targetRole,
                  status: 'active',
                  createdAt: new Date().toISOString(),
                  department: targetRole === 'director' ? 'Administration' : 'Computer Science',
                  institution: 'UEMK',
                }),
                3500,
                `${label} Firestore profile write`
              );
            } catch (firestoreErr) {
              console.warn('Firestore profile write failed:', firestoreErr.message);
            }

            setIsPressed(true);
            setTimeout(() => {
              setIsPressed(false);
              if (onFormSubmit) {
                onFormSubmit(user, targetRole);
              }
            }, 160);
          } else {
            // Unverified registration: record as pending approval; do not grant immediate privileged access
            try {
              await runWithTimeout(
                setDoc(doc(db, 'users', user.uid), {
                  uid: user.uid,
                  name: fullName.trim() || `${label} Applicant`,
                  email: user.email,
                  role: targetRole,
                  status: 'pending_approval',
                  createdAt: new Date().toISOString(),
                  department: targetRole === 'director' ? 'Administration' : 'Computer Science',
                  institution: 'UEMK',
                }),
                3500,
                `${label} Pending Registration write`
              );
            } catch (firestoreErr) {
              console.warn('Pending registration profile write failed:', firestoreErr.message);
            }

            await signOut(auth);
            setError(`Account created. Your ${label} registration is pending administrative authorization.`);
          }
        }
      } else {
        // Log In Flow for all roles
        const userCredential = await signInWithEmailAndPassword(auth, trimmedEmail, password);
        const user = userCredential.user;

        // Fetch user profile from Firestore to determine assigned role and status
        let userDocSnap = null;
        try {
          userDocSnap = await runWithTimeout(
            getDoc(doc(db, 'users', user.uid)),
            3500,
            'Profile fetch'
          );
        } catch (fetchErr) {
          console.warn('Firestore profile fetch failed or timed out:', fetchErr.message);
        }

        let actualRole = 'student';
        let accountStatus = 'active';

        if (userDocSnap && userDocSnap.exists && userDocSnap.exists()) {
          const userData = userDocSnap.data();
          actualRole = userData.role || 'student';
          accountStatus = userData.status || 'active';
        } else {
          // If profile doc doesn't exist yet or Firestore was unreachable
          if (targetRole === 'student') {
            try {
              await runWithTimeout(
                setDoc(doc(db, 'users', user.uid), {
                  uid: user.uid,
                  name: user.displayName || user.email?.split('@')[0] || 'User',
                  email: user.email,
                  role: 'student',
                  status: 'pending_approval',
                  createdAt: new Date().toISOString(),
                  department: '',
                  year: '',
                  section: '',
                  institution: 'UEMK',
                }),
                3500,
                'Default student profile'
              );
            } catch (writeErr) {
              console.warn('Could not save default student profile:', writeErr.message);
            }
            await signOut(auth);
            setError('Your Student account is pending Director approval and academic assignment.');
            setIsLoading(false);
            return;
          } else {
            // Check known pre-authorized institutional staff emails
            const isKnownStaff = await checkRoleAuthorization(targetRole, trimmedEmail);
            if (isKnownStaff) {
              actualRole = targetRole;
              accountStatus = 'active';
              try {
                await runWithTimeout(
                  setDoc(doc(db, 'users', user.uid), {
                    uid: user.uid,
                    name: user.displayName || user.email?.split('@')[0] || label,
                    email: user.email,
                    role: targetRole,
                    status: 'active',
                    createdAt: new Date().toISOString(),
                    department: targetRole === 'director' ? 'Administration' : 'Computer Science',
                    institution: 'UEMK',
                  }),
                  3500,
                  `${label} profile auto-creation`
                );
              } catch (writeErr) {
                console.warn('Could not save authorized profile:', writeErr.message);
              }
            } else {
              // No privileged role profile found and not known staff
              await signOut(auth);
              setError(`Access denied: No authorized ${label} profile found for this account.`);
              setIsLoading(false);
              return;
            }
          }
        }

        // Role verification: ensure user role matches the selected book portal
        if (actualRole !== targetRole) {
          await signOut(auth);
          setError(`Access denied: Your account is assigned the "${actualRole}" role and cannot access the ${label} portal.`);
          setIsLoading(false);
          return;
        }

        // Authorization verification for pending accounts (both students and staff)
        if (accountStatus === 'pending_approval') {
          await signOut(auth);
          setError(targetRole === 'student'
            ? 'Your Student registration is pending Director approval and academic assignment.'
            : `Your ${label} account is pending administrative authorization and approval.`);
          setIsLoading(false);
          return;
        }

        setIsPressed(true);
        setTimeout(() => {
          setIsPressed(false);
          if (onFormSubmit) {
            onFormSubmit(user, actualRole);
          }
        }, 160);
      }
    } catch (err) {
      console.error('Firebase Auth Error:', err);
      setError(getFriendlyErrorMessage(err.code || err.message));
    } finally {
      stopRegistrationCoordination();
      setIsLoading(false);
    }
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
          <div className={`absolute inset-0 p-5 flex flex-col transition-opacity duration-700 ${isSelected ? 'opacity-100 delay-200' : 'opacity-0'}`}>

            {/* Form Header with staggered reveal */}
            <div className={`flex items-center justify-center gap-2.5 mb-3 mt-1 transition-all duration-500 delay-[250ms] ${isSelected ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'}`}>
              <div className="w-8 h-8 rounded-full bg-white/25 flex items-center justify-center text-white shadow-inner transition-transform duration-500 hover:scale-105">
                {labelIcon}
              </div>
              <h2 className="text-white font-serif text-[15px] tracking-[0.2em] uppercase font-bold drop-shadow-sm">
                {label}
              </h2>
            </div>

            {/* Apple-style Segmented Control with smooth slide */}
            <div className={`relative flex bg-black/15 p-1 rounded-full mb-4 shadow-inner transition-all duration-500 delay-[320ms] ${isSelected ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'}`}>
              <div
                className={`absolute top-1 bottom-1 w-[calc(50%-4px)] bg-white rounded-full shadow-sm transition-transform duration-400 ease-[cubic-bezier(0.16,1,0.3,1)] ${isSignUp ? 'translate-x-full' : 'translate-x-0'}`}
              />
              <button
                type="button"
                onClick={() => { setIsSignUp(false); setError(''); }}
                className={`relative flex-1 py-1.5 text-[10px] font-bold tracking-widest uppercase rounded-full transition-colors duration-300 z-10 active:scale-95 ${!isSignUp ? 'text-[#3E2723]' : 'text-white/80 hover:text-white'}`}
              >
                Log In
              </button>
              <button
                type="button"
                onClick={() => { setIsSignUp(true); setError(''); }}
                className={`relative flex-1 py-1.5 text-[10px] font-bold tracking-widest uppercase rounded-full transition-colors duration-300 z-10 active:scale-95 ${isSignUp ? 'text-[#3E2723]' : 'text-white/80 hover:text-white'}`}
              >
                Sign Up
              </button>
            </div>

            {/* Form Inputs with staggered reveal & smooth accordion expansion */}
            <form
              className={`flex flex-col gap-2 flex-1 transition-all duration-500 delay-[390ms] ${isSelected ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'}`}
              onSubmit={handleSubmit}
            >
              {/* Smooth animated accordion container for Full Name */}
              <div
                className={`overflow-hidden transition-all duration-400 ease-[cubic-bezier(0.16,1,0.3,1)] ${isSignUp ? 'max-h-12 opacity-100 translate-y-0' : 'max-h-0 opacity-0 -translate-y-2 pointer-events-none'
                  }`}
              >
                <input
                  type="text"
                  placeholder="Full Name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required={isSignUp}
                  disabled={!isSignUp}
                  className="w-full bg-white/20 backdrop-blur-md text-white placeholder:text-white/70 text-[11px] px-3.5 py-2 rounded-md outline-none focus:bg-white/30 border border-white/10 focus:border-white/60 focus:ring-2 focus:ring-white/20 transition-all duration-200 shadow-inner"
                />
              </div>

              <input
                type="email"
                placeholder="Email Address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="w-full bg-white/20 backdrop-blur-md text-white placeholder:text-white/70 text-[11px] px-3.5 py-2 rounded-md outline-none focus:bg-white/30 border border-white/10 focus:border-white/60 focus:ring-2 focus:ring-white/20 transition-all duration-200 shadow-inner"
              />
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete={isSignUp ? "new-password" : "current-password"}
                className="w-full bg-white/20 backdrop-blur-md text-white placeholder:text-white/70 text-[11px] px-3.5 py-2 rounded-md outline-none focus:bg-white/30 border border-white/10 focus:border-white/60 focus:ring-2 focus:ring-white/20 transition-all duration-200 shadow-inner"
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
                className="relative overflow-hidden w-full py-3 bg-white text-[11px] font-bold uppercase tracking-widest rounded-md text-[#3E2723] shadow-lg hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 group/btn mt-1 disabled:opacity-75 disabled:cursor-not-allowed"
                style={isPressed ? {
                  transform: 'scale(0.95) translateY(1.5px)',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.1), inset 0 1px 2px rgba(0,0,0,0.04)',
                  transition: 'transform 80ms cubic-bezier(0.2, 0, 0, 1), box-shadow 80ms ease',
                } : undefined}
              >
                {isLoading ? (
                  <span className="relative z-10 flex items-center justify-center gap-2">
                    <svg className="animate-spin h-3.5 w-3.5 text-[#3E2723]" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                    </svg>
                    {isSignUp ? 'Creating Account...' : 'Signing In...'}
                  </span>
                ) : (
                  <span className="relative z-10">{isSignUp ? 'Create Account' : 'Continue'}</span>
                )}
                {/* Subtle sheen passing across button on hover */}
                <div className="absolute inset-0 -translate-x-full group-hover/btn:translate-x-full transition-transform duration-1000 bg-gradient-to-r from-transparent via-black/5 to-transparent pointer-events-none" />
              </button>
            </form>

          </div>
        </div>
      </div>
    </div>
  );
}