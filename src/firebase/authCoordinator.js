/**
 * Auth & Profile Registration Coordinator
 *
 * Coordinates asynchronous account registration between InteractiveBook.jsx
 * and the global onAuthStateChanged listener in App.jsx.
 *
 * Prevents onAuthStateChanged from prematurely invoking signOut(auth) when a newly
 * created account does not yet have a Firestore document written.
 */

let activeRegistration = null;
let watchdogTimeout = null;

const WATCHDOG_TIMEOUT_MS = 20000;

function restartWatchdog() {
  if (watchdogTimeout) {
    clearTimeout(watchdogTimeout);
  }
  // Safety watchdog: Automatically clear after 20 seconds to prevent getting stuck
  // under any unforeseen network hang.
  watchdogTimeout = setTimeout(() => {
    activeRegistration = null;
    watchdogTimeout = null;
  }, WATCHDOG_TIMEOUT_MS);
}

/**
 * Begin registration coordination.
 * Accepts boolean or expected user UID if already known.
 */
export function startRegistrationCoordination(uid = true) {
  activeRegistration = uid;
  restartWatchdog();
}

/**
 * Bind or update coordination to a specific user UID once authenticated,
 * refreshing the watchdog timer so downstream profile writes have full duration.
 */
export function bindRegistrationUid(uid) {
  if (activeRegistration) {
    activeRegistration = uid;
    restartWatchdog();
  }
}

/**
 * Returns true if an active registration operation is in progress.
 * If a uid is provided, verifies it matches the active registration (or general registration flag).
 */
export function isRegistrationCoordinated(uid = null) {
  if (!activeRegistration) return false;
  if (activeRegistration === true) return true;
  if (!uid) return true;
  return activeRegistration === uid;
}

/**
 * Stop registration coordination and clear safety timer.
 */
export function stopRegistrationCoordination() {
  activeRegistration = null;
  if (watchdogTimeout) {
    clearTimeout(watchdogTimeout);
    watchdogTimeout = null;
  }
}
