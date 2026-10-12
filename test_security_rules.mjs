import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import fs from 'fs';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

const rules = fs.readFileSync('firestore.rules', 'utf8');
const PROJECT_ID = 'sangam-30ac8-test';

console.log('Initializing Firebase Rules Test Environment with local emulator...');
const testEnv = await initializeTestEnvironment({
  projectId: PROJECT_ID,
  firestore: {
    rules,
    host: '127.0.0.1',
    port: 8080,
  },
});

let passCount = 0;
let failCount = 0;

function report(testNum, desc, passed, details = '') {
  if (passed) {
    passCount++;
    console.log(`[PASS] Test ${testNum}: ${desc}`);
  } else {
    failCount++;
    console.error(`[FAIL] Test ${testNum}: ${desc} - ${details}`);
  }
}

try {
  // Clear any existing test data
  await testEnv.clearFirestore();

  // Seed baseline data using admin context (bypassing rules)
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const adminDb = context.firestore();

    // 1. Existing student profile
    await setDoc(doc(adminDb, 'users', 'student_uid_101'), {
      uid: 'student_uid_101',
      name: 'Alice Student',
      email: 'student.alice@sangam.edu',
      role: 'student',
      status: 'active',
      createdAt: new Date().toISOString(),
      department: 'Computer Science',
      section: 'CSE-A',
      institution: 'UEMK'
    });

    // 2. Another user's private profile
    await setDoc(doc(adminDb, 'users', 'faculty_uid_202'), {
      uid: 'faculty_uid_202',
      name: 'Dr. Sarah Jenkins',
      email: 's.jenkins@sangam.edu',
      role: 'faculty',
      status: 'active',
      createdAt: new Date().toISOString(),
      department: 'Computer Science',
      institution: 'UEMK'
    });

    // 3. Pre-authorized staff entry in whitelist
    await setDoc(doc(adminDb, 'authorized_staff', 'prof.verified@sangam.edu'), {
      role: 'faculty',
      authorized: true
    });
  });

  // Create mocked client contexts
  const studentContext = testEnv.authenticatedContext('student_uid_101', {
    email: 'student.alice@sangam.edu'
  });
  const studentDb = studentContext.firestore();

  // -------------------------------------------------------------
  // Test 1: An authenticated Student can read their own /users/{uid} profile
  // -------------------------------------------------------------
  try {
    const snap = await assertSucceeds(getDoc(doc(studentDb, 'users', 'student_uid_101')));
    report(1, 'Authenticated Student can read their own /users/{uid} profile', snap.exists() && snap.data().role === 'student');
  } catch (err) {
    report(1, 'Authenticated Student can read their own /users/{uid} profile', false, err.message);
  }

  // -------------------------------------------------------------
  // Test 2: The Student cannot update their own profile to role: "faculty" or status: "active"
  // -------------------------------------------------------------
  try {
    // Attempt self-elevation to faculty
    await assertFails(updateDoc(doc(studentDb, 'users', 'student_uid_101'), {
      role: 'faculty'
    }));
    report(2, 'Student cannot update their own profile to role: "faculty" (self-elevation blocked)', true);
  } catch (err) {
    report(2, 'Student cannot update their own profile to role: "faculty"', false, err.message);
  }

  // -------------------------------------------------------------
  // Test 3: The Student cannot read another user's profile
  // -------------------------------------------------------------
  try {
    await assertFails(getDoc(doc(studentDb, 'users', 'faculty_uid_202')));
    report(3, 'Student cannot read another user\'s profile (private data protected)', true);
  } catch (err) {
    report(3, 'Student cannot read another user\'s profile', false, err.message);
  }

  // -------------------------------------------------------------
  // Test 4: The Student cannot create or modify /authorized_staff/{email}
  // -------------------------------------------------------------
  try {
    // Attempt create in authorized_staff
    await assertFails(setDoc(doc(studentDb, 'authorized_staff', 'student.alice@sangam.edu'), {
      role: 'faculty',
      authorized: true
    }));
    // Attempt modify in authorized_staff
    await assertFails(updateDoc(doc(studentDb, 'authorized_staff', 'prof.verified@sangam.edu'), {
      authorized: true
    }));
    report(4, 'Student cannot create or modify /authorized_staff/{email} (whitelist tamper-proof)', true);
  } catch (err) {
    report(4, 'Student cannot create or modify /authorized_staff/{email}', false, err.message);
  }

  // -------------------------------------------------------------
  // Test 5: An unauthorized Faculty applicant cannot create an active Faculty profile
  // -------------------------------------------------------------
  const unauthorizedContext = testEnv.authenticatedContext('unauthorized_user_303', {
    email: 'unauthorized.user@gmail.com'
  });
  const unauthorizedDb = unauthorizedContext.firestore();

  try {
    // Attempting to create an active Faculty profile without whitelist entry
    await assertFails(setDoc(doc(unauthorizedDb, 'users', 'unauthorized_user_303'), {
      uid: 'unauthorized_user_303',
      name: 'Unverified Applicant',
      email: 'unauthorized.user@gmail.com',
      role: 'faculty',
      status: 'active',
      createdAt: new Date().toISOString(),
      department: 'Computer Science',
      institution: 'UEMK'
    }));
    report(5, 'Unauthorized Faculty applicant cannot create an active Faculty profile', true);
  } catch (err) {
    report(5, 'Unauthorized Faculty applicant cannot create an active Faculty profile', false, err.message);
  }

  // -------------------------------------------------------------
  // Test 6: An authorized Faculty account can create or maintain its permitted profile as intended
  // -------------------------------------------------------------
  const authorizedFacultyContext = testEnv.authenticatedContext('authorized_prof_404', {
    email: 'prof.verified@sangam.edu'
  });
  const authorizedFacultyDb = authorizedFacultyContext.firestore();

  try {
    // Authorized professor creates their active profile
    await assertSucceeds(setDoc(doc(authorizedFacultyDb, 'users', 'authorized_prof_404'), {
      uid: 'authorized_prof_404',
      name: 'Prof. Verified',
      email: 'prof.verified@sangam.edu',
      role: 'faculty',
      status: 'active',
      createdAt: new Date().toISOString(),
      department: 'Computer Science',
      institution: 'UEMK'
    }));

    // Authorized professor can read their own profile
    const profSnap = await assertSucceeds(getDoc(doc(authorizedFacultyDb, 'users', 'authorized_prof_404')));
    report(6, 'Authorized Faculty account can create and maintain its permitted profile', profSnap.exists() && profSnap.data().role === 'faculty');
  } catch (err) {
    report(6, 'Authorized Faculty account can create and maintain its permitted profile', false, err.message);
  }

} finally {
  await testEnv.cleanup();
}

console.log(`\n=== TEST SUMMARY: ${passCount} PASSED, ${failCount} FAILED ===`);
if (failCount > 0) {
  process.exit(1);
}
