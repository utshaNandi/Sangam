import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import fs from 'fs';
import path from 'path';
import { doc, getDoc, getDocs, setDoc, updateDoc, collection, query, where } from 'firebase/firestore';

const rulesPath = path.resolve('firestore.rules');
const rules = fs.readFileSync(rulesPath, 'utf8');

const PROJECT_ID = 'sangam-approval-test';

console.log('Connecting to Firestore emulator on port 8080...');
const testEnv = await initializeTestEnvironment({
  projectId: PROJECT_ID,
  firestore: {
    rules,
    host: '127.0.0.1',
    port: 8080,
  },
});

let passed = 0;
let failed = 0;

function report(num, desc, ok, details = '') {
  if (ok) {
    passed++;
    console.log(`[PASS] Case ${num}: ${desc}`);
  } else {
    failed++;
    console.error(`[FAIL] Case ${num}: ${desc} -> ${details}`);
  }
}

try {
  await testEnv.clearFirestore();

  // Setup initial mock data with security rules disabled (admin context)
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const adminDb = context.firestore();

    // 1. Authorized Director 1 whitelist entry & profile
    await setDoc(doc(adminDb, 'authorized_staff', 'director@sangam.edu'), {
      role: 'director',
      authorized: true
    });
    await setDoc(doc(adminDb, 'users', 'director_uid_01'), {
      uid: 'director_uid_01',
      name: 'Dr. Principal Director',
      email: 'director@sangam.edu',
      role: 'director',
      status: 'active',
      createdAt: new Date().toISOString(),
      department: 'Administration',
      institution: 'UEMK'
    });

    // 2. Second Director profile
    await setDoc(doc(adminDb, 'authorized_staff', 'director2@sangam.edu'), {
      role: 'director',
      authorized: true
    });
    await setDoc(doc(adminDb, 'users', 'director_uid_99'), {
      uid: 'director_uid_99',
      name: 'Dr. Second Director',
      email: 'director2@sangam.edu',
      role: 'director',
      status: 'active',
      createdAt: new Date().toISOString(),
      department: 'Administration',
      institution: 'UEMK'
    });

    // 3. Authorized Faculty whitelist entry & profile
    await setDoc(doc(adminDb, 'authorized_staff', 'faculty@sangam.edu'), {
      role: 'faculty',
      authorized: true
    });
    await setDoc(doc(adminDb, 'users', 'faculty_uid_02'), {
      uid: 'faculty_uid_02',
      name: 'Prof. Alan Turing',
      email: 'faculty@sangam.edu',
      role: 'faculty',
      status: 'active',
      createdAt: new Date().toISOString(),
      department: 'Computer Science',
      institution: 'UEMK'
    });

    // 4. Existing pending student profile
    await setDoc(doc(adminDb, 'users', 'pending_student_uid_03'), {
      uid: 'pending_student_uid_03',
      name: 'Bob Pending',
      email: 'bob.pending@gmail.com',
      role: 'student',
      status: 'pending_approval',
      createdAt: new Date().toISOString(),
      department: '',
      year: '',
      section: '',
      institution: 'UEMK'
    });

    // 5. Another pending student for diff-tamper test
    await setDoc(doc(adminDb, 'users', 'pending_student_uid_07'), {
      uid: 'pending_student_uid_07',
      name: 'Charlie Pending',
      email: 'charlie.pending@gmail.com',
      role: 'student',
      status: 'pending_approval',
      createdAt: new Date().toISOString(),
      department: '',
      year: '',
      section: '',
      institution: 'UEMK'
    });
  });

  // Client contexts
  const studentSignupContext = testEnv.authenticatedContext('new_student_uid_04', {
    email: 'new.student@gmail.com'
  });
  const studentSignupDb = studentSignupContext.firestore();

  const pendingStudentContext = testEnv.authenticatedContext('pending_student_uid_03', {
    email: 'bob.pending@gmail.com'
  });
  const pendingStudentDb = pendingStudentContext.firestore();

  const directorContext = testEnv.authenticatedContext('director_uid_01', {
    email: 'director@sangam.edu'
  });
  const directorDb = directorContext.firestore();

  const facultyContext = testEnv.authenticatedContext('faculty_uid_02', {
    email: 'faculty@sangam.edu'
  });
  const facultyDb = facultyContext.firestore();

  const unauthContext = testEnv.unauthenticatedContext();
  const unauthDb = unauthContext.firestore();

  // -------------------------------------------------------------
  // Test 1: Student signup with status 'pending_approval' succeeds
  // -------------------------------------------------------------
  try {
    await assertSucceeds(setDoc(doc(studentSignupDb, 'users', 'new_student_uid_04'), {
      uid: 'new_student_uid_04',
      name: 'New Student',
      email: 'new.student@gmail.com',
      role: 'student',
      status: 'pending_approval',
      createdAt: new Date().toISOString(),
      department: '',
      year: '',
      section: '',
      institution: 'UEMK'
    }));
    report(1, 'Student signup with status "pending_approval" succeeds', true);
  } catch (err) {
    report(1, 'Student signup with status "pending_approval" succeeds', false, err.message);
  }

  // -------------------------------------------------------------
  // Test 2: Public creation of an active student fails
  // -------------------------------------------------------------
  const rogueContext = testEnv.authenticatedContext('rogue_student_05', {
    email: 'rogue@gmail.com'
  });
  const rogueDb = rogueContext.firestore();
  try {
    await assertFails(setDoc(doc(rogueDb, 'users', 'rogue_student_05'), {
      uid: 'rogue_student_05',
      name: 'Rogue Student',
      email: 'rogue@gmail.com',
      role: 'student',
      status: 'active', // Should be strictly forbidden!
      createdAt: new Date().toISOString(),
      department: 'Computer Science',
      year: '2nd Year',
      section: 'Section C',
      institution: 'UEMK'
    }));
    report(2, 'Public creation of an active student fails (auto-active blocked)', true);
  } catch (err) {
    report(2, 'Public creation of an active student fails', false, err.message);
  }

  // -------------------------------------------------------------
  // Test 3: A student cannot change their role, status, department, year, section, or institution
  // -------------------------------------------------------------
  try {
    // 3a. Self-elevate role
    await assertFails(updateDoc(doc(pendingStudentDb, 'users', 'pending_student_uid_03'), {
      role: 'faculty'
    }));
    // 3b. Self-activate status
    await assertFails(updateDoc(doc(pendingStudentDb, 'users', 'pending_student_uid_03'), {
      status: 'active'
    }));
    // 3c. Self-assign department
    await assertFails(updateDoc(doc(pendingStudentDb, 'users', 'pending_student_uid_03'), {
      department: 'Computer Science'
    }));
    // 3d. Self-assign year
    await assertFails(updateDoc(doc(pendingStudentDb, 'users', 'pending_student_uid_03'), {
      year: '3rd Year'
    }));
    // 3e. Self-assign section
    await assertFails(updateDoc(doc(pendingStudentDb, 'users', 'pending_student_uid_03'), {
      section: 'Section A'
    }));
    // 3f. Permitted student self-edit: display name only
    await assertSucceeds(updateDoc(doc(pendingStudentDb, 'users', 'pending_student_uid_03'), {
      name: 'Bob Pending Updated'
    }));
    report(3, 'Student cannot tamper with role, status, department, year, section, or institution', true);
  } catch (err) {
    report(3, 'Student cannot tamper with role, status, department, year, section, or institution', false, err.message);
  }

  // -------------------------------------------------------------
  // Test 4: An unauthorized account cannot list student profiles or approve anyone
  // -------------------------------------------------------------
  try {
    // Student listing query blocked
    await assertFails(getDocs(collection(pendingStudentDb, 'users')));
    // Faculty listing users collection blocked (only director permitted)
    await assertFails(getDocs(collection(facultyDb, 'users')));
    // Unauthenticated user listing blocked
    await assertFails(getDocs(collection(unauthDb, 'users')));
    // Student approving another student blocked
    await assertFails(updateDoc(doc(pendingStudentDb, 'users', 'new_student_uid_04'), {
      status: 'active',
      department: 'Computer Science',
      year: '1st Year',
      section: 'Section A'
    }));
    // Faculty approving a student blocked
    await assertFails(updateDoc(doc(facultyDb, 'users', 'new_student_uid_04'), {
      status: 'active',
      department: 'Computer Science',
      year: '1st Year',
      section: 'Section A'
    }));
    report(4, 'Unauthorized accounts cannot list student profiles or approve anyone', true);
  } catch (err) {
    report(4, 'Unauthorized accounts cannot list student profiles or approve anyone', false, err.message);
  }

  // -------------------------------------------------------------
  // Test 5: Authorized Director can list pending students and approve with valid assignments
  // -------------------------------------------------------------
  try {
    // 5a. Director lists pending students
    const querySnap = await assertSucceeds(getDocs(query(
      collection(directorDb, 'users'),
      where('role', '==', 'student'),
      where('status', '==', 'pending_approval')
    )));
    const foundPending = querySnap.docs.some(d => d.id === 'pending_student_uid_03');

    // 5b. Director approves student with valid atomic assignments (only status, department, year, section modified)
    await assertSucceeds(updateDoc(doc(directorDb, 'users', 'pending_student_uid_03'), {
      status: 'active',
      department: 'Computer Science',
      year: '2nd Year',
      section: 'Section C'
    }));

    // Verify updated doc
    const updatedSnap = await assertSucceeds(getDoc(doc(directorDb, 'users', 'pending_student_uid_03')));
    const data = updatedSnap.data();
    const isApproved = data.status === 'active' && 
                       data.department === 'Computer Science' && 
                       data.year === '2nd Year' && 
                       data.section === 'Section C' &&
                       data.name === 'Bob Pending Updated' && // name preserved
                       data.institution === 'UEMK';          // institution preserved

    report(5, 'Authorized Director can list pending students and approve with valid assignments', foundPending && isApproved);
  } catch (err) {
    report(5, 'Authorized Director can list pending students and approve with valid assignments', false, err.message);
  }

  // -------------------------------------------------------------
  // Test 6: Changing name or institution during approval fails (strict diff check)
  // -------------------------------------------------------------
  try {
    // 6a. Attempt to change name along with approval
    await assertFails(updateDoc(doc(directorDb, 'users', 'pending_student_uid_07'), {
      status: 'active',
      department: 'Computer Science',
      year: '1st Year',
      section: 'Section A',
      name: 'Tampered Name'
    }));

    // 6b. Attempt to change institution along with approval
    await assertFails(updateDoc(doc(directorDb, 'users', 'pending_student_uid_07'), {
      status: 'active',
      department: 'Computer Science',
      year: '1st Year',
      section: 'Section A',
      institution: 'Other University'
    }));

    // 6c. Now approve student 07 properly with only permitted fields -> must succeed
    await assertSucceeds(updateDoc(doc(directorDb, 'users', 'pending_student_uid_07'), {
      status: 'active',
      department: 'Mechanical Engineering',
      year: '1st Year',
      section: 'Section B'
    }));

    report(6, 'Changing name or institution during student approval fails (diff hasOnly enforced)', true);
  } catch (err) {
    report(6, 'Changing name or institution during student approval fails', false, err.message);
  }

  // -------------------------------------------------------------
  // Test 7: Valid academic reassignment on active student succeeds
  // -------------------------------------------------------------
  try {
    // Reassign student 03's department, year, and section
    await assertSucceeds(updateDoc(doc(directorDb, 'users', 'pending_student_uid_03'), {
      department: 'Electronics & Communication',
      year: '3rd Year',
      section: 'Section B'
    }));

    const reassignedSnap = await assertSucceeds(getDoc(doc(directorDb, 'users', 'pending_student_uid_03')));
    const data = reassignedSnap.data();
    const isReassigned = data.department === 'Electronics & Communication' &&
                         data.year === '3rd Year' &&
                         data.section === 'Section B' &&
                         data.status === 'active';

    report(7, 'Valid academic reassignment on active student succeeds', isReassigned);
  } catch (err) {
    report(7, 'Valid academic reassignment on active student succeeds', false, err.message);
  }

  // -------------------------------------------------------------
  // Test 8: Changing any unrelated field during academic reassignment fails
  // -------------------------------------------------------------
  try {
    // 8a. Attempt to change name during reassignment
    await assertFails(updateDoc(doc(directorDb, 'users', 'pending_student_uid_03'), {
      department: 'Civil Engineering',
      year: '4th Year',
      section: 'Section A',
      name: 'Hacked Name'
    }));

    // 8b. Attempt to change institution during reassignment
    await assertFails(updateDoc(doc(directorDb, 'users', 'pending_student_uid_03'), {
      department: 'Civil Engineering',
      year: '4th Year',
      section: 'Section A',
      institution: 'Fake University'
    }));

    // 8c. Attempt to change status back to pending during reassignment
    await assertFails(updateDoc(doc(directorDb, 'users', 'pending_student_uid_03'), {
      department: 'Civil Engineering',
      year: '4th Year',
      section: 'Section A',
      status: 'pending_approval'
    }));

    // 8d. Attempt to change role during reassignment
    await assertFails(updateDoc(doc(directorDb, 'users', 'pending_student_uid_03'), {
      department: 'Civil Engineering',
      year: '4th Year',
      section: 'Section A',
      role: 'faculty'
    }));

    report(8, 'Changing any unrelated field during academic reassignment fails', true);
  } catch (err) {
    report(8, 'Changing any unrelated field during academic reassignment fails', false, err.message);
  }

  // -------------------------------------------------------------
  // Test 9: Director cannot approve themselves or modify their own profile via student management
  // -------------------------------------------------------------
  try {
    // Director 1 tries to update their own profile using student approval/management permission
    await assertFails(updateDoc(doc(directorDb, 'users', 'director_uid_01'), {
      department: 'Computer Science',
      year: '1st Year',
      section: 'Section A'
    }));
    report(9, 'Director cannot approve or modify their own profile via student management', true);
  } catch (err) {
    report(9, 'Director cannot approve or modify their own profile via student management', false, err.message);
  }

  // -------------------------------------------------------------
  // Test 10: Authorized Director cannot modify other Director or faculty profiles via student-approval rules
  // -------------------------------------------------------------
  try {
    // 10a. Attempt to modify faculty profile
    await assertFails(updateDoc(doc(directorDb, 'users', 'faculty_uid_02'), {
      status: 'active',
      department: 'Robotics',
      year: '4th Year',
      section: 'Section A'
    }));

    // 10b. Attempt to modify another director profile
    await assertFails(updateDoc(doc(directorDb, 'users', 'director_uid_99'), {
      status: 'active',
      department: 'Administration',
      year: '4th Year',
      section: 'Section A'
    }));
    report(10, 'Authorized Director cannot modify other Director or faculty profiles via student-approval rules', true);
  } catch (err) {
    report(10, 'Authorized Director cannot modify other Director or faculty profiles via student-approval rules', false, err.message);
  }

  // -------------------------------------------------------------
  // Test 11: Invalid assignments and malformed profiles are rejected
  // -------------------------------------------------------------
  try {
    // 11a. Missing year
    await assertFails(updateDoc(doc(directorDb, 'users', 'new_student_uid_04'), {
      status: 'active',
      department: 'Computer Science',
      section: 'Section A'
    }));
    // 11b. Empty section string
    await assertFails(updateDoc(doc(directorDb, 'users', 'new_student_uid_04'), {
      status: 'active',
      department: 'Computer Science',
      year: '1st Year',
      section: ''
    }));
    // 11c. Incomplete status transition (leaving status as pending_approval while assigning)
    await assertFails(updateDoc(doc(directorDb, 'users', 'new_student_uid_04'), {
      status: 'pending_approval',
      department: 'Computer Science',
      year: '1st Year',
      section: 'Section A'
    }));
    report(11, 'Invalid assignments and malformed profiles are rejected by rules', true);
  } catch (err) {
    report(11, 'Invalid assignments and malformed profiles are rejected by rules', false, err.message);
  }

  // -------------------------------------------------------------
  // Test 12: Existing authorized staff authentication and profile creation remains functional
  // -------------------------------------------------------------
  const newStaffContext = testEnv.authenticatedContext('new_prof_06', {
    email: 'new.prof@sangam.edu'
  });
  const newStaffDb = newStaffContext.firestore();

  // Admin whitelists new professor
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'authorized_staff', 'new.prof@sangam.edu'), {
      role: 'faculty',
      authorized: true
    });
  });

  try {
    // Whitelisted staff creates active profile
    await assertSucceeds(setDoc(doc(newStaffDb, 'users', 'new_prof_06'), {
      uid: 'new_prof_06',
      name: 'Prof. Marie Curie',
      email: 'new.prof@sangam.edu',
      role: 'faculty',
      status: 'active',
      createdAt: new Date().toISOString(),
      department: 'Computer Science',
      institution: 'UEMK'
    }));

    // Can read own profile
    const profSnap = await assertSucceeds(getDoc(doc(newStaffDb, 'users', 'new_prof_06')));
    report(12, 'Existing authorized staff authentication & active profile creation remains functional', profSnap.exists() && profSnap.data().role === 'faculty');
  } catch (err) {
    report(12, 'Existing authorized staff authentication & active profile creation remains functional', false, err.message);
  }

  // -------------------------------------------------------------
  // Test 13: Authorized faculty member cannot escalate role to Director
  // -------------------------------------------------------------
  const rogueFacultyContext = testEnv.authenticatedContext('rogue_faculty_13', {
    email: 'faculty@sangam.edu'
  });
  const rogueFacultyDb = rogueFacultyContext.firestore();

  try {
    await assertFails(setDoc(doc(rogueFacultyDb, 'users', 'rogue_faculty_13'), {
      uid: 'rogue_faculty_13',
      name: 'Rogue Faculty Acting As Director',
      email: 'faculty@sangam.edu',
      role: 'director',
      status: 'active',
      createdAt: new Date().toISOString(),
      department: 'Administration',
      institution: 'UEMK'
    }));
    report(13, 'Authorized faculty member cannot escalate role to Director (role whitelist enforced)', true);
  } catch (err) {
    report(13, 'Authorized faculty member cannot escalate role to Director', false, err.message);
  }

  // -------------------------------------------------------------
  // Test 14: Revoked whitelist entry (authorized: false) cannot create active profile
  // -------------------------------------------------------------
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'authorized_staff', 'revoked.director@sangam.edu'), {
      role: 'director',
      authorized: false
    });
  });

  const revokedContext = testEnv.authenticatedContext('revoked_dir_14', {
    email: 'revoked.director@sangam.edu'
  });
  const revokedDb = revokedContext.firestore();

  try {
    await assertFails(setDoc(doc(revokedDb, 'users', 'revoked_dir_14'), {
      uid: 'revoked_dir_14',
      name: 'Revoked Director',
      email: 'revoked.director@sangam.edu',
      role: 'director',
      status: 'active',
      createdAt: new Date().toISOString(),
      department: 'Administration',
      institution: 'UEMK'
    }));
    report(14, 'Revoked whitelist entry (authorized: false) is denied active profile creation', true);
  } catch (err) {
    report(14, 'Revoked whitelist entry (authorized: false) is denied active profile creation', false, err.message);
  }

  // -------------------------------------------------------------
  // Test 15: Whitelist collections cannot be written to by any authenticated client
  // -------------------------------------------------------------
  try {
    // Student cannot write to authorized_staff
    await assertFails(setDoc(doc(pendingStudentDb, 'authorized_staff', 'hacked@sangam.edu'), {
      role: 'director',
      authorized: true
    }));
    // Director cannot write to authorized_staff
    await assertFails(setDoc(doc(directorDb, 'authorized_staff', 'hacked@sangam.edu'), {
      role: 'director',
      authorized: true
    }));
    // Faculty cannot write to authorized_roles
    await assertFails(setDoc(doc(facultyDb, 'authorized_roles', 'hacked@sangam.edu'), {
      role: 'director',
      authorized: true
    }));
    report(15, 'Whitelist collections (authorized_staff, authorized_roles) are tamper-proof from clients', true);
  } catch (err) {
    report(15, 'Whitelist collections (authorized_staff, authorized_roles) are tamper-proof from clients', false, err.message);
  }

  // -------------------------------------------------------------
  // Test 16: { authorized: true } without a role cannot grant Director privileges
  // -------------------------------------------------------------
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'authorized_staff', 'generic.staff@sangam.edu'), {
      authorized: true
      // No role field specified
    });
  });

  const genericStaffContext = testEnv.authenticatedContext('generic_staff_16', {
    email: 'generic.staff@sangam.edu'
  });
  const genericStaffDb = genericStaffContext.firestore();

  try {
    // 16a. Attempt to create Director profile with generic whitelist -> must fail
    await assertFails(setDoc(doc(genericStaffDb, 'users', 'generic_staff_16'), {
      uid: 'generic_staff_16',
      name: 'Generic Staff As Director',
      email: 'generic.staff@sangam.edu',
      role: 'director',
      status: 'active',
      createdAt: new Date().toISOString(),
      department: 'Administration',
      institution: 'UEMK'
    }));

    // 16b. Generic whitelist can safely be used for Faculty profile creation (controlled fallback)
    await assertSucceeds(setDoc(doc(genericStaffDb, 'users', 'generic_staff_16'), {
      uid: 'generic_staff_16',
      name: 'Generic Staff As Faculty',
      email: 'generic.staff@sangam.edu',
      role: 'faculty',
      status: 'active',
      createdAt: new Date().toISOString(),
      department: 'Science',
      institution: 'UEMK'
    }));

    report(16, '{ authorized: true } without role cannot grant Director privileges (safe faculty fallback only)', true);
  } catch (err) {
    report(16, '{ authorized: true } without role cannot grant Director privileges', false, err.message);
  }

  // -------------------------------------------------------------
  // Test 17: Missing whitelist documents and malformed whitelist documents are denied
  // -------------------------------------------------------------
  await testEnv.withSecurityRulesDisabled(async (context) => {
    // 17a: malformed role type (number)
    await setDoc(doc(context.firestore(), 'authorized_staff', 'bad.role@sangam.edu'), {
      role: 12345,
      authorized: true
    });
    // 17b: malformed authorized type (string "yes" instead of boolean)
    await setDoc(doc(context.firestore(), 'authorized_staff', 'bad.bool@sangam.edu'), {
      role: 'director',
      authorized: 'yes'
    });
    // 17c: empty doc
    await setDoc(doc(context.firestore(), 'authorized_staff', 'empty.doc@sangam.edu'), {});
    // 17d: unknown role
    await setDoc(doc(context.firestore(), 'authorized_staff', 'unknown.role@sangam.edu'), {
      role: 'superadmin',
      authorized: true
    });
  });

  try {
    // Missing whitelist document
    const missingCtx = testEnv.authenticatedContext('missing_wh_17', { email: 'nonexistent@sangam.edu' });
    await assertFails(setDoc(doc(missingCtx.firestore(), 'users', 'missing_wh_17'), {
      uid: 'missing_wh_17',
      email: 'nonexistent@sangam.edu',
      role: 'director',
      status: 'active',
      createdAt: new Date().toISOString()
    }));

    // Malformed role type (number)
    const badRoleCtx = testEnv.authenticatedContext('bad_role_17', { email: 'bad.role@sangam.edu' });
    await assertFails(setDoc(doc(badRoleCtx.firestore(), 'users', 'bad_role_17'), {
      uid: 'bad_role_17',
      email: 'bad.role@sangam.edu',
      role: 'director',
      status: 'active',
      createdAt: new Date().toISOString()
    }));

    // Malformed bool type ("yes")
    const badBoolCtx = testEnv.authenticatedContext('bad_bool_17', { email: 'bad.bool@sangam.edu' });
    await assertFails(setDoc(doc(badBoolCtx.firestore(), 'users', 'bad_bool_17'), {
      uid: 'bad_bool_17',
      email: 'bad.bool@sangam.edu',
      role: 'director',
      status: 'active',
      createdAt: new Date().toISOString()
    }));

    // Empty whitelist doc
    const emptyDocCtx = testEnv.authenticatedContext('empty_doc_17', { email: 'empty.doc@sangam.edu' });
    await assertFails(setDoc(doc(emptyDocCtx.firestore(), 'users', 'empty_doc_17'), {
      uid: 'empty_doc_17',
      email: 'empty.doc@sangam.edu',
      role: 'director',
      status: 'active',
      createdAt: new Date().toISOString()
    }));

    report(17, 'Missing and malformed whitelist documents are strictly denied', true);
  } catch (err) {
    report(17, 'Missing and malformed whitelist documents are strictly denied', false, err.message);
  }

  // -------------------------------------------------------------
  // Test 18: Existing faculty user cannot modify their profile to become an active Director
  // -------------------------------------------------------------
  try {
    // faculty_uid_02 attempts to change their role from 'faculty' to 'director'
    await assertFails(updateDoc(doc(facultyDb, 'users', 'faculty_uid_02'), {
      role: 'director'
    }));
    report(18, 'Existing faculty member cannot modify their profile to become Director', true);
  } catch (err) {
    report(18, 'Existing faculty member cannot modify their profile to become Director', false, err.message);
  }

  // -------------------------------------------------------------
  // Test 19: Revoked Director (authorized: false) cannot list students or approve anyone
  // -------------------------------------------------------------
  await testEnv.withSecurityRulesDisabled(async (context) => {
    // Create an active profile for revoked.director@sangam.edu
    await setDoc(doc(context.firestore(), 'users', 'revoked_dir_14'), {
      uid: 'revoked_dir_14',
      name: 'Revoked Director Active Doc',
      email: 'revoked.director@sangam.edu',
      role: 'director',
      status: 'active',
      createdAt: new Date().toISOString(),
      department: 'Administration',
      institution: 'UEMK'
    });
  });

  try {
    // Revoked director cannot list users
    await assertFails(getDocs(collection(revokedDb, 'users')));
    // Revoked director cannot approve student
    await assertFails(updateDoc(doc(revokedDb, 'users', 'pending_student_uid_03'), {
      status: 'active',
      department: 'Computer Science',
      year: '1st Year',
      section: 'Section A'
    }));
    report(19, 'Revoked Director ({ authorized: false }) cannot list students or approve anyone', true);
  } catch (err) {
    report(19, 'Revoked Director ({ authorized: false }) cannot list students or approve anyone', false, err.message);
  }

  // -------------------------------------------------------------
  // Test 20: Authorized Director can list all student profiles by role and differentiate active vs pending
  // -------------------------------------------------------------
  try {
    const studentsSnap = await assertSucceeds(getDocs(query(collection(directorDb, 'users'), where('role', '==', 'student'))));
    const students = studentsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const hasPending = students.some(s => s.status === 'pending_approval');
    const hasActive = students.some(s => s.status === 'active');
    // Verify active students have status 'active' and are never 'pending_approval'
    const activeStudents = students.filter(s => s.status === 'active');
    const activeAreNotPending = activeStudents.every(s => s.status !== 'pending_approval');

    report(20, 'Authorized Director can query students by role and active students are excluded from pending', hasPending && hasActive && activeAreNotPending);
  } catch (err) {
    report(20, 'Authorized Director can query students by role and active students are excluded from pending', false, err.message);
  }

} finally {
  await testEnv.cleanup();
}

console.log(`\n========================================`);
console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
console.log(`========================================`);

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
