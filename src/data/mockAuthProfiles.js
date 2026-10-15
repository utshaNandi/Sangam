/**
 * Mock authentication and profile data for rapid UI/UX design & development.
 * Authentication checking is bypassed so developers can view and style
 * all roles (Student, Faculty, Director) without requiring Firebase credentials.
 */

export const MOCK_PROFILES = {
  student: {
    uid: 'demo-student-001',
    name: 'Alex Carter',
    email: 'alex.carter@uem.edu.in',
    role: 'student',
    status: 'active',
    department: 'Computer Science',
    year: '2nd Year',
    section: 'CSE-A',
    institution: 'UEMK',
    roll: 'CS21001',
    enrollmentNo: 'UEM/2023/CSE/042',
    displayName: 'Alex Carter'
  },
  faculty: {
    uid: 'demo-faculty-001',
    name: 'Dr. Sarah Jenkins',
    email: 's.jenkins@sangam.edu',
    role: 'faculty',
    status: 'active',
    department: 'Computer Science',
    designation: 'Senior Professor',
    institution: 'UEMK',
    displayName: 'Dr. Sarah Jenkins'
  },
  director: {
    uid: 'demo-director-001',
    name: 'Prof. (Dr.) Satyajit Chakrabarti',
    email: 'director@sangam.edu',
    role: 'director',
    status: 'active',
    department: 'Administration',
    designation: 'Campus Director',
    institution: 'UEMK',
    displayName: 'Prof. (Dr.) Satyajit Chakrabarti'
  }
};

/**
 * Returns a complete mock user profile for the given role,
 * optionally merged with customized fields (e.g. user-entered name or email).
 */
export function getMockProfile(role = 'student', overrides = {}) {
  const normalizedRole = (role || 'student').toLowerCase().trim();
  const baseProfile = MOCK_PROFILES[normalizedRole] || MOCK_PROFILES.student;
  
  return {
    ...baseProfile,
    ...overrides,
    role: normalizedRole,
    status: 'active'
  };
}

/**
 * Creates a mock Firebase User-like object with standard properties.
 */
export function createMockFirebaseUser(profile) {
  return {
    uid: profile.uid,
    email: profile.email,
    displayName: profile.name || profile.displayName,
    photoURL: null,
    emailVerified: true,
    isAnonymous: false,
    metadata: {
      creationTime: new Date().toISOString(),
      lastSignInTime: new Date().toISOString()
    }
  };
}
