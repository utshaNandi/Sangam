import assert from 'node:assert';
import crypto from 'node:crypto';
import http from 'node:http';

// Configure test environment
process.env.TEST_MODE = 'true';
process.env.NODE_ENV = 'test';
process.env.TOKEN_ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');

import { app } from '../server.js';
import {
  announcementService,
  isDirectorOrHodRole,
  isDirectorOrHodAnnouncement,
  normalizeAnnouncementTimestamp
} from '../server/services/announcementService.js';
import { setCustomAuthService } from '../server/middleware/authMiddleware.js';
import { mapBackendAnnouncementToItem } from '../src/services/announcementService.js';

let passed = 0;
let failed = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`  [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`  [FAIL] ${name}:`, err.message);
    failed++;
  }
}

async function runAsyncTest(name, fn) {
  try {
    await fn();
    console.log(`  [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`  [FAIL] ${name}:`, err.message);
    failed++;
  }
}

console.log('\n======================================================');
console.log(' SANGAM HIERARCHY ANNOUNCEMENTS — FUNCTIONAL TEST SUITE');
console.log(' Verifies Teacher publishing, persistence, combined feed,');
console.log(' Director/HOD integration, scoping, and authorization.');
console.log('======================================================\n');

// -----------------------------------------------------------------------------
// High-Fidelity Mock Firestore Database
// -----------------------------------------------------------------------------
class MockFirestore {
  constructor() {
    this.store = {
      users: {},
      teacher_allocations: {},
      announcements: {}
    };
  }

  collection(name) {
    if (!this.store[name]) {
      this.store[name] = {};
    }
    const collStore = this.store[name];

    return {
      doc: (id) => ({
        get: async () => {
          const data = collStore[id];
          return {
            exists: Boolean(data),
            id,
            data: () => (data ? { ...data } : undefined)
          };
        },
        set: async (data) => {
          collStore[id] = { ...data };
        },
        delete: async () => {
          delete collStore[id];
        }
      }),
      where: (field, op, val) => ({
        get: async () => {
          const docs = [];
          for (const [id, data] of Object.entries(collStore)) {
            let match = false;
            if (op === '==' && data[field] === val) match = true;
            if (match) {
              docs.push({
                exists: true,
                id,
                data: () => ({ ...data })
              });
            }
          }
          return {
            empty: docs.length === 0,
            size: docs.length,
            docs,
            forEach: (cb) => docs.forEach(cb)
          };
        }
      }),
      get: async () => {
        const docs = [];
        for (const [id, data] of Object.entries(collStore)) {
          docs.push({
            exists: true,
            id,
            data: () => ({ ...data })
          });
        }
        return {
          empty: docs.length === 0,
          size: docs.length,
          docs,
          forEach: (cb) => docs.forEach(cb)
        };
      }
    };
  }
}

const mockDb = new MockFirestore();
announcementService.setTestDb(mockDb);

// Configure Mock Auth Tokens
const testTokens = {
  'token-director': { uid: 'uid_dir_sharma', email: 'director@sangam.edu' },
  'token-hod-cs': { uid: 'uid_hod_cs', email: 'hod.cs@sangam.edu' },
  'token-teacher-cs': { uid: 'uid_teacher_cs', email: 'teacher.cs@sangam.edu' },
  'token-teacher-mech': { uid: 'uid_teacher_mech', email: 'teacher.mech@sangam.edu' },
  'token-student-cs': { uid: 'uid_student_cs', email: 'student.cs@sangam.edu' }
};

setCustomAuthService({
  verifyIdToken: async (token) => {
    const payload = testTokens[token];
    if (!payload) throw new Error('Invalid Firebase token.');
    return payload;
  }
});

// Setup Verified User Profiles
mockDb.store.users['uid_dir_sharma'] = {
  uid: 'uid_dir_sharma',
  role: 'director',
  institution: 'Sangam University',
  name: 'Director Sharma',
  email: 'director@sangam.edu',
  status: 'active'
};

mockDb.store.users['uid_hod_cs'] = {
  uid: 'uid_hod_cs',
  role: 'head_of_department',
  institution: 'Sangam University',
  department: 'Computer Science and Engineering',
  name: 'Dr. CS HOD',
  email: 'hod.cs@sangam.edu',
  status: 'active'
};

mockDb.store.users['uid_teacher_cs'] = {
  uid: 'uid_teacher_cs',
  role: 'teacher',
  institution: 'Sangam University',
  department: 'Computer Science and Engineering',
  name: 'Prof. CS Teacher',
  email: 'teacher.cs@sangam.edu',
  status: 'active'
};

mockDb.store.users['uid_teacher_mech'] = {
  uid: 'uid_teacher_mech',
  role: 'teacher',
  institution: 'Sangam University',
  department: 'Mechanical Engineering',
  name: 'Prof. Mech Teacher',
  email: 'teacher.mech@sangam.edu',
  status: 'active'
};

mockDb.store.users['uid_student_cs'] = {
  uid: 'uid_student_cs',
  role: 'student',
  institution: 'Sangam University',
  department: 'Computer Science and Engineering',
  year: '1st Year',
  section: 'Sec B',
  name: 'CS Student',
  email: 'student.cs@sangam.edu',
  status: 'active'
};

// Setup Active Teacher Allocations
// CS Teacher is allocated to CSE AI • 1st Year • Sec B
mockDb.store.teacher_allocations['alloc_cs_1'] = {
  teacherUid: 'uid_teacher_cs',
  institution: 'Sangam University',
  department: 'Computer Science and Engineering',
  year: '1st Year',
  section: 'Sec B',
  authorized: true
};

mockDb.store.teacher_allocations['alloc_cs_alias'] = {
  teacherUid: 'uid_teacher_cs',
  institution: 'Sangam University',
  department: 'CSE AI',
  year: '1st Year',
  section: 'Sec B',
  authorized: true
};

// Mech Teacher is allocated to Mechanical Engineering • 1st Year • Sec A
mockDb.store.teacher_allocations['alloc_mech_1'] = {
  teacherUid: 'uid_teacher_mech',
  institution: 'Sangam University',
  department: 'Mechanical Engineering',
  year: '1st Year',
  section: 'Sec A',
  authorized: true
};

// Setup Verified User Profiles for all configured Sangam departments
mockDb.store.users['uid_teacher_it'] = {
  uid: 'uid_teacher_it',
  role: 'teacher',
  institution: 'Sangam University',
  department: 'Information Technology',
  name: 'Prof. IT Teacher',
  email: 'teacher.it@sangam.edu',
  status: 'active'
};
mockDb.store.teacher_allocations['alloc_it_1'] = {
  teacherUid: 'uid_teacher_it',
  institution: 'Sangam University',
  department: 'Information Technology',
  year: '2nd Year',
  section: 'Sec A',
  authorized: true
};

mockDb.store.users['uid_teacher_ece'] = {
  uid: 'uid_teacher_ece',
  role: 'teacher',
  institution: 'Sangam University',
  department: 'Electronics & Communication',
  name: 'Prof. ECE Teacher',
  email: 'teacher.ece@sangam.edu',
  status: 'active'
};
mockDb.store.teacher_allocations['alloc_ece_1'] = {
  teacherUid: 'uid_teacher_ece',
  institution: 'Sangam University',
  department: 'Electronics & Communication',
  year: '3rd Year',
  section: 'Sec C',
  authorized: true
};

mockDb.store.users['uid_teacher_ee'] = {
  uid: 'uid_teacher_ee',
  role: 'teacher',
  institution: 'Sangam University',
  department: 'Electrical Engineering',
  name: 'Prof. EE Teacher',
  email: 'teacher.ee@sangam.edu',
  status: 'active'
};
mockDb.store.teacher_allocations['alloc_ee_1'] = {
  teacherUid: 'uid_teacher_ee',
  institution: 'Sangam University',
  department: 'Electrical Engineering',
  year: '2nd Year',
  section: 'Sec A',
  authorized: true
};

mockDb.store.users['uid_teacher_civil'] = {
  uid: 'uid_teacher_civil',
  role: 'teacher',
  institution: 'Sangam University',
  department: 'Civil Engineering',
  name: 'Prof. Civil Teacher',
  email: 'teacher.civil@sangam.edu',
  status: 'active'
};
mockDb.store.teacher_allocations['alloc_civil_1'] = {
  teacherUid: 'uid_teacher_civil',
  institution: 'Sangam University',
  department: 'Civil Engineering',
  year: '1st Year',
  section: 'Sec B',
  authorized: true
};

mockDb.store.users['uid_teacher_bt'] = {
  uid: 'uid_teacher_bt',
  role: 'teacher',
  institution: 'Sangam University',
  department: 'Biotechnology',
  name: 'Prof. Biotech Teacher',
  email: 'teacher.bt@sangam.edu',
  status: 'active'
};
mockDb.store.teacher_allocations['alloc_bt_1'] = {
  teacherUid: 'uid_teacher_bt',
  institution: 'Sangam University',
  department: 'Biotechnology',
  year: '4th Year',
  section: 'Sec A',
  authorized: true
};

mockDb.store.users['uid_teacher_mgmt'] = {
  uid: 'uid_teacher_mgmt',
  role: 'teacher',
  institution: 'Sangam University',
  department: 'Management',
  name: 'Prof. Management Teacher',
  email: 'teacher.mgmt@sangam.edu',
  status: 'active'
};
mockDb.store.teacher_allocations['alloc_mgmt_1'] = {
  teacherUid: 'uid_teacher_mgmt',
  institution: 'Sangam University',
  department: 'Management',
  year: '1st Year',
  section: 'Sec A',
  authorized: true
};

// =============================================================================
// TEST SUITE EXECUTION
// =============================================================================

async function runAllTests() {
  let createdTeacherAnnId = null;

  // ---------------------------------------------------------------------------
  // 1. Teacher can publish an announcement to an authorized section
  // ---------------------------------------------------------------------------
  console.log('--- REQUIREMENT 1: Teacher Publishes to Authorized Section ---');

  await runAsyncTest('1.1: Teacher can publish announcement to allocated section CSE AI • 1st Year • Sec B', async () => {
    const announcement = await announcementService.createAnnouncement({
      callerUid: 'uid_teacher_cs',
      title: 'Python Lab 4 Submission Deadline',
      content: 'Please upload your Python lab 4 files before Friday 5 PM.',
      scopeType: 'section',
      department: 'CSE AI',
      year: '1st Year',
      section: 'Sec B',
      priority: 'urgent',
      category: 'academic'
    });

    assert.ok(announcement);
    assert.ok(announcement.id);
    assert.strictEqual(announcement.title, 'Python Lab 4 Submission Deadline');
    assert.strictEqual(announcement.scopeType, 'section');
    assert.strictEqual(announcement.authorUid, 'uid_teacher_cs');
    assert.strictEqual(announcement.authorRole, 'faculty');
    assert.strictEqual(announcement.priority, 'urgent');
    assert.strictEqual(announcement.category, 'academic');

    createdTeacherAnnId = announcement.id;
  });

  // ---------------------------------------------------------------------------
  // 2. The published announcement persists after a refresh
  // ---------------------------------------------------------------------------
  console.log('\n--- REQUIREMENT 2: Published Announcement Persists (Refresh Resilience) ---');

  await runAsyncTest('2.1: Published announcement persists in database and is retrievable by ID', async () => {
    assert.ok(createdTeacherAnnId, 'Announcement ID must exist from previous step');
    const persisted = await announcementService.getAnnouncementById({
      announcementId: createdTeacherAnnId,
      callerUid: 'uid_teacher_cs'
    });

    assert.ok(persisted);
    assert.strictEqual(persisted.id, createdTeacherAnnId);
    assert.strictEqual(persisted.title, 'Python Lab 4 Submission Deadline');
    assert.strictEqual(persisted.authorUid, 'uid_teacher_cs');
  });

  // ---------------------------------------------------------------------------
  // 3. The teacher can see their own announcements
  // ---------------------------------------------------------------------------
  console.log('\n--- REQUIREMENT 3: Teacher Sees Their Own Announcements ---');

  await runAsyncTest('3.1: Teacher sees their published announcement in section feed', async () => {
    const result = await announcementService.getAnnouncementsForUser({
      callerUid: 'uid_teacher_cs',
      department: 'CSE AI',
      year: '1st Year',
      section: 'Sec B'
    });

    assert.ok(Array.isArray(result.announcements));
    const found = result.announcements.some(a => a.id === createdTeacherAnnId);
    assert.strictEqual(found, true, 'Teacher must see their own announcement in section feed');
  });

  // ---------------------------------------------------------------------------
  // 4. The teacher can see applicable Director announcements
  // ---------------------------------------------------------------------------
  console.log('\n--- REQUIREMENT 4: Teacher Sees Applicable Director Announcements ---');

  let dirInstAnnId = null;
  let dirCsAnnId = null;
  let dirMechAnnId = null;

  await runAsyncTest('4.1: Director publishes institution, CS department, and Mech department notices', async () => {
    const ann1 = await announcementService.createAnnouncement({
      callerUid: 'uid_dir_sharma',
      title: 'Annual University Sports Week 2026',
      content: 'Sports week will commence from November 15th.',
      scopeType: 'institution',
      priority: 'normal',
      category: 'general'
    });
    dirInstAnnId = ann1.id;

    const ann2 = await announcementService.createAnnouncement({
      callerUid: 'uid_dir_sharma',
      title: 'CSE AI Lab Hardware Upgrade Notice',
      content: 'New GPU workstations arrived for CS department.',
      scopeType: 'branch',
      department: 'Computer Science and Engineering',
      priority: 'urgent',
      category: 'academic'
    });
    dirCsAnnId = ann2.id;

    const ann3 = await announcementService.createAnnouncement({
      callerUid: 'uid_dir_sharma',
      title: 'Mechanical Workshop Safety Protocol',
      content: 'Hard hats required at all times in Mech lab.',
      scopeType: 'branch',
      department: 'Mechanical Engineering',
      priority: 'urgent',
      category: 'routine'
    });
    dirMechAnnId = ann3.id;

    assert.ok(dirInstAnnId && dirCsAnnId && dirMechAnnId);
  });

  await runAsyncTest('4.2: CS Teacher receives Director institution and CS notices, but NOT Mech notice', async () => {
    const result = await announcementService.getAnnouncementsForUser({
      callerUid: 'uid_teacher_cs',
      department: 'CSE AI',
      year: '1st Year',
      section: 'Sec B'
    });

    const hasInst = result.announcements.some(a => a.id === dirInstAnnId);
    const hasCs = result.announcements.some(a => a.id === dirCsAnnId);
    const hasMech = result.announcements.some(a => a.id === dirMechAnnId);

    assert.strictEqual(hasInst, true, 'Institution announcement must be received');
    assert.strictEqual(hasCs, true, 'Applicable CS announcement must be received');
    assert.strictEqual(hasMech, false, 'Unrelated Mech announcement must be excluded');
  });

  // ---------------------------------------------------------------------------
  // 5. The teacher can see applicable HOD announcements
  // ---------------------------------------------------------------------------
  console.log('\n--- REQUIREMENT 5: Teacher Sees Applicable HOD Announcements ---');

  let hodCsDeptAnnId = null;
  let hodCsYearAnnId = null;
  let hodCsSecBAnnId = null;
  let hodCsSecAAnnId = null;

  await runAsyncTest('5.1: CS HOD publishes department, year, and section notices', async () => {
    const ann1 = await announcementService.createAnnouncement({
      callerUid: 'uid_hod_cs',
      title: 'CS Faculty Departmental Meeting',
      content: 'Monthly faculty meeting this Thursday at 3 PM.',
      scopeType: 'branch',
      department: 'Computer Science and Engineering',
      priority: 'urgent',
      category: 'academic'
    });
    hodCsDeptAnnId = ann1.id;

    const ann2 = await announcementService.createAnnouncement({
      callerUid: 'uid_hod_cs',
      title: '1st Year CS Mid-Term Schedule Briefing',
      content: 'All 1st year CS students and faculty note mid-term dates.',
      scopeType: 'year',
      department: 'Computer Science and Engineering',
      year: '1st Year',
      priority: 'normal',
      category: 'academic'
    });
    hodCsYearAnnId = ann2.id;

    const ann3 = await announcementService.createAnnouncement({
      callerUid: 'uid_hod_cs',
      title: 'Sec B Coding Challenge Announcement',
      content: 'Mandatory coding round for Section B students.',
      scopeType: 'section',
      department: 'Computer Science and Engineering',
      year: '1st Year',
      section: 'Sec B',
      priority: 'urgent',
      category: 'academic'
    });
    hodCsSecBAnnId = ann3.id;

    const ann4 = await announcementService.createAnnouncement({
      callerUid: 'uid_hod_cs',
      title: 'Sec A Robotics Lab Rescheduled',
      content: 'Section A robotics lab moved to Wednesday.',
      scopeType: 'section',
      department: 'Computer Science and Engineering',
      year: '1st Year',
      section: 'Sec A',
      priority: 'normal',
      category: 'routine'
    });
    hodCsSecAAnnId = ann4.id;

    assert.ok(hodCsDeptAnnId && hodCsYearAnnId && hodCsSecBAnnId && hodCsSecAAnnId);
  });

  await runAsyncTest('5.2: Teacher for Sec B sees HOD dept, year, and Sec B notices, but NOT Sec A notice', async () => {
    const result = await announcementService.getAnnouncementsForUser({
      callerUid: 'uid_teacher_cs',
      department: 'CSE AI',
      year: '1st Year',
      section: 'Sec B'
    });

    const hasDept = result.announcements.some(a => a.id === hodCsDeptAnnId);
    const hasYear = result.announcements.some(a => a.id === hodCsYearAnnId);
    const hasSecB = result.announcements.some(a => a.id === hodCsSecBAnnId);
    const hasSecA = result.announcements.some(a => a.id === hodCsSecAAnnId);

    assert.strictEqual(hasDept, true, 'HOD department announcement must be received');
    assert.strictEqual(hasYear, true, 'HOD 1st year announcement must be received');
    assert.strictEqual(hasSecB, true, 'HOD Sec B announcement must be received');
    assert.strictEqual(hasSecA, false, 'HOD Sec A announcement must NOT appear in Sec B feed');
  });

  // ---------------------------------------------------------------------------
  // 6. Announcements from all three sources appear together, newest first
  // ---------------------------------------------------------------------------
  console.log('\n--- REQUIREMENT 6: Combined Feed with Newest-First Ordering ---');

  await runAsyncTest('6.1: Feed contains Teacher, Director, and HOD announcements', async () => {
    const result = await announcementService.getAnnouncementsForUser({
      callerUid: 'uid_teacher_cs',
      department: 'CSE AI',
      year: '1st Year',
      section: 'Sec B'
    });

    const items = result.announcements;
    const authorRoles = new Set(items.map(a => a.authorRole));

    assert.ok(authorRoles.has('faculty'), 'Must contain faculty announcement');
    assert.ok(authorRoles.has('director'), 'Must contain director announcement');
    assert.ok(authorRoles.has('hod'), 'Must contain hod announcement');
  });

  await runAsyncTest('6.2: Combined feed is strictly sorted newest first with tie-breaker', async () => {
    const result = await announcementService.getAnnouncementsForUser({
      callerUid: 'uid_teacher_cs',
      department: 'CSE AI',
      year: '1st Year',
      section: 'Sec B'
    });

    const items = result.announcements;
    assert.ok(items.length >= 3, 'Must have at least 3 announcements to check ordering');

    for (let i = 0; i < items.length - 1; i++) {
      const tA = new Date(items[i].createdAt).getTime();
      const tB = new Date(items[i + 1].createdAt).getTime();
      assert.ok(tA >= tB, `Item at index ${i} (${items[i].createdAt}) must be >= index ${i + 1} (${items[i + 1].createdAt})`);
    }
  });

  // ---------------------------------------------------------------------------
  // 7. Announcements from other unauthorized departments/sections are excluded
  // ---------------------------------------------------------------------------
  console.log('\n--- REQUIREMENT 7: Isolation — Unauthorized Depts & Sections Excluded ---');

  await runAsyncTest('7.1: Mech teacher announcement is completely excluded from CS feed', async () => {
    const mechAnn = await announcementService.createAnnouncement({
      callerUid: 'uid_teacher_mech',
      title: 'Mech Sec A Thermo Lab Manual',
      content: 'Thermo lab manual for Mech Sec A is ready.',
      scopeType: 'section',
      department: 'Mechanical Engineering',
      year: '1st Year',
      section: 'Sec A',
      priority: 'normal',
      category: 'academic'
    });

    const result = await announcementService.getAnnouncementsForUser({
      callerUid: 'uid_teacher_cs',
      department: 'CSE AI',
      year: '1st Year',
      section: 'Sec B'
    });

    const hasMechTeacherAnn = result.announcements.some(a => a.id === mechAnn.id);
    assert.strictEqual(hasMechTeacherAnn, false, 'Mech section notice must never appear in CS feed');
  });

  await runAsyncTest('7.2: Unrelated Sec C notice is excluded from Sec B feed', async () => {
    // Inject announcement directly for Sec C
    mockDb.store.announcements['ann_cs_sec_c'] = {
      id: 'ann_cs_sec_c',
      title: 'Sec C Discrete Math Tutoring',
      content: 'Tutoring session for Sec C.',
      scopeType: 'section',
      institution: 'Sangam University',
      department: 'Computer Science and Engineering',
      year: '1st Year',
      section: 'Sec C',
      authorUid: 'uid_hod_cs',
      authorRole: 'hod',
      createdAt: '2026-10-20T12:00:00.000Z'
    };

    const result = await announcementService.getAnnouncementsForUser({
      callerUid: 'uid_teacher_cs',
      department: 'CSE AI',
      year: '1st Year',
      section: 'Sec B'
    });

    const hasSecC = result.announcements.some(a => a.id === 'ann_cs_sec_c');
    assert.strictEqual(hasSecC, false, 'Sec C notice must not appear in Sec B feed');
  });

  // ---------------------------------------------------------------------------
  // 8. Teacher cannot impersonate Director/HOD or publish outside permissions
  // ---------------------------------------------------------------------------
  console.log('\n--- REQUIREMENT 8: Anti-Impersonation & Permission Boundary Checks ---');

  await runAsyncTest('8.1: Teacher cannot publish institution-wide (403 Forbidden)', async () => {
    await assert.rejects(
      async () => {
        await announcementService.createAnnouncement({
          callerUid: 'uid_teacher_cs',
          title: 'Fake Institution Notice',
          content: 'Teacher trying to broadcast institution-wide.',
          scopeType: 'institution'
        });
      },
      (err) => err.statusCode === 403 && err.code === 'TEACHER_SCOPE_FORBIDDEN'
    );
  });

  await runAsyncTest('8.2: Teacher cannot publish department-wide (403 Forbidden)', async () => {
    await assert.rejects(
      async () => {
        await announcementService.createAnnouncement({
          callerUid: 'uid_teacher_cs',
          title: 'Fake Department Notice',
          content: 'Teacher trying to broadcast to department.',
          scopeType: 'branch',
          department: 'Computer Science and Engineering'
        });
      },
      (err) => err.statusCode === 403 && err.code === 'TEACHER_SCOPE_FORBIDDEN'
    );
  });

  await runAsyncTest('8.3: Teacher cannot publish to unallocated section (403 Forbidden)', async () => {
    await assert.rejects(
      async () => {
        await announcementService.createAnnouncement({
          callerUid: 'uid_teacher_cs',
          title: 'Unauthorized Section Notice',
          content: 'Teacher trying to publish to Sec A without allocation.',
          scopeType: 'section',
          department: 'Computer Science and Engineering',
          year: '1st Year',
          section: 'Sec A'
        });
      },
      (err) => err.statusCode === 403 && err.code === 'UNAUTHORIZED_ALLOCATION'
    );
  });

  await runAsyncTest('8.4: Teacher cannot spoof authorRole as director in payload', async () => {
    const ann = await announcementService.createAnnouncement({
      callerUid: 'uid_teacher_cs',
      title: 'Teacher Spoof Attempt',
      content: 'I claim to be the Director in body.',
      scopeType: 'section',
      department: 'CSE AI',
      year: '1st Year',
      section: 'Sec B',
      authorRole: 'director' // Attacker supplies fake role
    });

    // Server must strictly enforce authorRole from Firestore profile
    assert.strictEqual(ann.authorRole, 'faculty', 'Server must ignore payload authorRole and use trusted profile role');
  });

  // ---------------------------------------------------------------------------
  // 9. Existing sidebar Announcements behavior remains unchanged
  // ---------------------------------------------------------------------------
  console.log('\n--- REQUIREMENT 9: Sidebar Announcements Compatibility ---');

  await runAsyncTest('9.1: Querying without section/department filter returns full teacher scope', async () => {
    // When left sidebar Announcements tab calls GET /api/announcements (no scope filter)
    const result = await announcementService.getAnnouncementsForUser({
      callerUid: 'uid_teacher_cs',
      page: 1,
      limit: 50
    });

    assert.ok(Array.isArray(result.announcements));
    assert.ok(result.pagination);
    // Contains institution, CS department, CS 1st year, and allocated Sec B notices
    assert.ok(result.announcements.length >= 4, 'Sidebar must receive all authorized notices across teacher allocations');
  });

  // ---------------------------------------------------------------------------
  // 10. Existing dashboard latest-four filtering remains unchanged
  // ---------------------------------------------------------------------------
  console.log('\n--- REQUIREMENT 10: Dashboard Latest-Four Filtering Compatibility ---');

  await runAsyncTest('10.1: getDashboardAnnouncements strictly caps at 4 and excludes faculty', async () => {
    const result = await announcementService.getDashboardAnnouncements({
      callerUid: 'uid_teacher_cs',
      limit: 4
    });

    assert.ok(Array.isArray(result.announcements));
    assert.ok(result.announcements.length <= 4, 'Must not exceed limit 4');

    // Verify all items are strictly Director or HOD
    for (const ann of result.announcements) {
      assert.strictEqual(isDirectorOrHodAnnouncement(ann), true, 'Dashboard announcement must be Director or HOD');
      assert.notStrictEqual(ann.authorRole, 'faculty', 'Faculty announcements must never appear in dashboard panel');
    }
  });

  // ---------------------------------------------------------------------------
  // 11. Visual & Metadata Parity Adapter for AnnouncementPage
  // ---------------------------------------------------------------------------
  console.log('\n--- SECTION 11: UI Adapter & Visual Metadata Verification ---');

  runTest('11.1: mapBackendAnnouncementToItem maps Director notice with Dean role & Important status', () => {
    const raw = {
      id: 'ann_test_dir',
      title: 'Campus Winter Closure',
      content: 'Campus will be closed for winter holidays.',
      authorName: 'Prof. Director',
      authorRole: 'director',
      authorEmail: 'director@sangam.edu',
      priority: 'normal',
      category: 'general',
      createdAt: '2026-10-20T10:00:00.000Z'
    };

    const item = mapBackendAnnouncementToItem(raw);
    assert.strictEqual(item.id, 'ann_test_dir');
    assert.strictEqual(item.subject, 'Campus Winter Closure');
    assert.strictEqual(item.senderName, 'Prof. Director');
    assert.strictEqual(item.senderRole, 'Dean of Academic Affairs');
    assert.strictEqual(item.status, 'Important');
    assert.strictEqual(item.timestamp, '20/10/26');
  });

  runTest('11.2: mapBackendAnnouncementToItem maps HOD notice with Head of Department role', () => {
    const raw = {
      id: 'ann_test_hod',
      title: 'Faculty Syllabus Update',
      content: 'Review the latest syllabus draft.',
      authorName: 'Dr. CS HOD',
      authorRole: 'head_of_department',
      authorEmail: 'hod.cs@sangam.edu',
      priority: 'normal',
      category: 'academic',
      createdAt: '2026-10-20T11:00:00.000Z'
    };

    const item = mapBackendAnnouncementToItem(raw);
    assert.strictEqual(item.senderRole, 'Head of Department');
    assert.strictEqual(item.category, 'Academic');
    assert.strictEqual(item.status, 'Active');
  });

  runTest('11.3: mapBackendAnnouncementToItem maps Teacher notice with Faculty Member role', () => {
    const raw = {
      id: 'ann_test_fac',
      title: 'Lab Test Schedule',
      content: 'Lab test next Monday.',
      authorName: 'Prof. CS Teacher',
      authorRole: 'faculty',
      priority: 'urgent',
      category: 'routine',
      createdAt: '2026-10-20T12:00:00.000Z'
    };

    const item = mapBackendAnnouncementToItem(raw);
    assert.strictEqual(item.senderRole, 'Faculty Member');
    assert.strictEqual(item.status, 'Important'); // urgent maps to Important badge
    assert.strictEqual(item.category, 'Routine');
  });

  // ---------------------------------------------------------------------------
  // 12. Focused Hardening Tests: Timestamp Normalization, Missing Scope, and Authorization
  // ---------------------------------------------------------------------------
  console.log('\n--- SECTION 12: Focused Hardening Tests ---');

  runTest('12.1: normalizeAnnouncementTimestamp normalizes ISO, epoch, Firestore Timestamps, and invalid dates without NaN', () => {
    // ISO string
    assert.strictEqual(normalizeAnnouncementTimestamp('2026-10-20T10:00:00.000Z'), 1792490400000);
    // Epoch number
    assert.strictEqual(normalizeAnnouncementTimestamp(1792490400000), 1792490400000);
    // Numeric string
    assert.strictEqual(normalizeAnnouncementTimestamp('1792490400000'), 1792490400000);
    // Firestore Timestamp instance with toMillis()
    const mockTsWithMillis = { toMillis: () => 1792490400000 };
    assert.strictEqual(normalizeAnnouncementTimestamp(mockTsWithMillis), 1792490400000);
    // Firestore Timestamp instance with toDate()
    const mockTsWithToDate = { toDate: () => new Date('2026-10-20T10:00:00.000Z') };
    assert.strictEqual(normalizeAnnouncementTimestamp(mockTsWithToDate), 1792490400000);
    // Date instance directly
    assert.strictEqual(normalizeAnnouncementTimestamp(new Date('2026-10-20T10:00:00.000Z')), 1792490400000);
    // Serialized {_seconds, _nanoseconds}
    const serializedTs = { _seconds: 1792490400, _nanoseconds: 500000000 };
    assert.strictEqual(normalizeAnnouncementTimestamp(serializedTs), 1792490400500);
    // Serialized {seconds, nanoseconds}
    const altSerializedTs = { seconds: 1792490400, nanoseconds: 250000000 };
    assert.strictEqual(normalizeAnnouncementTimestamp(altSerializedTs), 1792490400250);

    // Non-finite numbers safely return 0 (never NaN, Infinity, or -Infinity)
    assert.strictEqual(normalizeAnnouncementTimestamp(Infinity), 0);
    assert.strictEqual(normalizeAnnouncementTimestamp(-Infinity), 0);
    assert.strictEqual(normalizeAnnouncementTimestamp(NaN), 0);
    assert.strictEqual(normalizeAnnouncementTimestamp(0), 0);
    assert.strictEqual(normalizeAnnouncementTimestamp(-1000), 0);

    // Non-finite strings safely return 0
    assert.strictEqual(normalizeAnnouncementTimestamp('Infinity'), 0);
    assert.strictEqual(normalizeAnnouncementTimestamp('-Infinity'), 0);
    assert.strictEqual(normalizeAnnouncementTimestamp('+Infinity'), 0);
    assert.strictEqual(normalizeAnnouncementTimestamp('NaN'), 0);
    assert.strictEqual(normalizeAnnouncementTimestamp('   '), 0);
    assert.strictEqual(normalizeAnnouncementTimestamp(''), 0);

    // Malformed objects safely return 0
    assert.strictEqual(normalizeAnnouncementTimestamp({ _seconds: Infinity }), 0);
    assert.strictEqual(normalizeAnnouncementTimestamp({ _seconds: NaN }), 0);
    assert.strictEqual(normalizeAnnouncementTimestamp({ seconds: -100 }), 0);
    assert.strictEqual(normalizeAnnouncementTimestamp({ toMillis: () => Infinity }), 0);
    assert.strictEqual(normalizeAnnouncementTimestamp({ toMillis: () => NaN }), 0);
    assert.strictEqual(normalizeAnnouncementTimestamp({ toDate: () => new Date(NaN) }), 0);
    assert.strictEqual(normalizeAnnouncementTimestamp({ unknown: 'object' }), 0);
    assert.strictEqual(normalizeAnnouncementTimestamp('not-a-valid-date'), 0);
    assert.strictEqual(normalizeAnnouncementTimestamp(null), 0);
    assert.strictEqual(normalizeAnnouncementTimestamp(undefined), 0);
  });

  await runAsyncTest('12.2: Firestore Timestamp objects and serialized dates sort accurately newest-first', async () => {
    // Seed three announcements with heterogeneous timestamp formats
    const tsNewest = { _seconds: 1800000000, _nanoseconds: 0 }; // Serialized Firestore Timestamp (Future)
    const tsMiddle = { toMillis: () => 1750000000000 };        // Firestore Timestamp object with toMillis()
    const tsOldest = '2024-01-01T00:00:00.000Z';               // ISO String

    mockDb.store.announcements['ann_sort_ts_new'] = {
      id: 'ann_sort_ts_new',
      institution: 'Sangam University',
      title: 'Newest via Serialized Timestamp',
      authorRole: 'director',
      scopeType: 'institution',
      createdAt: tsNewest
    };
    mockDb.store.announcements['ann_sort_ts_mid'] = {
      id: 'ann_sort_ts_mid',
      institution: 'Sangam University',
      title: 'Middle via Timestamp Object',
      authorRole: 'director',
      scopeType: 'institution',
      createdAt: tsMiddle
    };
    mockDb.store.announcements['ann_sort_ts_old'] = {
      id: 'ann_sort_ts_old',
      institution: 'Sangam University',
      title: 'Oldest via ISO String',
      authorRole: 'director',
      scopeType: 'institution',
      createdAt: tsOldest
    };

    const feed = await announcementService.getAnnouncementsForUser({
      callerUid: 'uid_teacher_cs'
    });

    const feedIds = feed.announcements.map(a => a.id);
    const idxNew = feedIds.indexOf('ann_sort_ts_new');
    const idxMid = feedIds.indexOf('ann_sort_ts_mid');
    const idxOld = feedIds.indexOf('ann_sort_ts_old');

    assert.ok(idxNew !== -1 && idxMid !== -1 && idxOld !== -1, 'All three announcements must be in feed');
    assert.ok(idxNew < idxMid, 'Serialized timestamp announcement must be sorted before middle timestamp');
    assert.ok(idxMid < idxOld, 'Middle timestamp announcement must be sorted before older ISO announcement');
  });

  await runAsyncTest('12.3: Announcements with invalid timestamps sort deterministically without NaN error', async () => {
    mockDb.store.announcements['ann_invalid_ts_z'] = {
      id: 'ann_invalid_ts_z',
      institution: 'Sangam University',
      title: 'Corrupted Timestamp Z',
      authorRole: 'director',
      scopeType: 'institution',
      createdAt: 'invalid-date-string'
    };
    mockDb.store.announcements['ann_invalid_ts_a'] = {
      id: 'ann_invalid_ts_a',
      institution: 'Sangam University',
      title: 'Corrupted Timestamp A',
      authorRole: 'director',
      scopeType: 'institution',
      createdAt: { corrupted: true }
    };

    const feed = await announcementService.getAnnouncementsForUser({
      callerUid: 'uid_teacher_cs'
    });

    const zIndex = feed.announcements.findIndex(a => a.id === 'ann_invalid_ts_z');
    const aIndex = feed.announcements.findIndex(a => a.id === 'ann_invalid_ts_a');

    assert.ok(zIndex !== -1 && aIndex !== -1, 'Both invalid timestamp announcements must be retrievable');
    // When both timestamps normalize to 0, deterministic ID tie-breaker (localeCompare descending) applies:
    // 'ann_invalid_ts_z' > 'ann_invalid_ts_a', so zIndex must precede aIndex
    assert.ok(zIndex < aIndex, 'Deterministic tie-breaker must place ann_invalid_ts_z before ann_invalid_ts_a');
  });

  await runAsyncTest('12.4: Publishing fails if hierarchy scope is incomplete (no silent fallbacks)', async () => {
    // Missing section
    await assert.rejects(
      async () => {
        await announcementService.createAnnouncement({
          callerUid: 'uid_teacher_cs',
          title: 'Missing Section Scope',
          content: 'Test content',
          scopeType: 'section',
          department: 'Computer Science and Engineering',
          year: '1st Year'
          // section omitted
        });
      },
      (err) => {
        assert.strictEqual(err.statusCode, 400);
        assert.strictEqual(err.code, 'MISSING_SECTION');
        return true;
      }
    );

    // Missing department
    await assert.rejects(
      async () => {
        await announcementService.createAnnouncement({
          callerUid: 'uid_teacher_cs',
          title: 'Missing Department Scope',
          content: 'Test content',
          scopeType: 'section',
          year: '1st Year',
          section: 'Sec B'
          // department omitted
        });
      },
      (err) => {
        assert.strictEqual(err.statusCode, 400);
        assert.strictEqual(err.code, 'MISSING_DEPARTMENT');
        return true;
      }
    );
  });

  await runAsyncTest('12.5: Backend strictly rejects unauthorized section publishing with 403 UNAUTHORIZED_ALLOCATION', async () => {
    await assert.rejects(
      async () => {
        await announcementService.createAnnouncement({
          callerUid: 'uid_teacher_cs',
          title: 'Unauthorized Section Attempt',
          content: 'Teacher trying to post to unallocated Civil Engineering',
          scopeType: 'section',
          department: 'Civil Engineering',
          year: '2nd Year',
          section: 'Sec C'
        });
      },
      (err) => {
        assert.strictEqual(err.statusCode, 403);
        assert.strictEqual(err.code, 'UNAUTHORIZED_ALLOCATION');
        return true;
      }
    );
  });

  await runAsyncTest('12.6: Allocation validation rejects stale, revoked, inactive, or expired teacher allocations in both indexed queries and fallback collection scans', async () => {
    // 1. Explicitly revoked allocation
    mockDb.store.teacher_allocations['alloc_revoked'] = {
      teacherUid: 'uid_teacher_cs',
      institution: 'Sangam University',
      department: 'Electrical Engineering',
      year: '3rd Year',
      section: 'Sec E',
      authorized: true,
      status: 'revoked'
    };
    const isRevokedAllocated = await announcementService.verifyTeacherAllocation(
      'uid_teacher_cs',
      'Electrical Engineering',
      '3rd Year',
      'Sec E',
      'Sangam University'
    );
    assert.strictEqual(isRevokedAllocated, false, 'Revoked allocation must be rejected');

    // 2. Inactive status allocation
    mockDb.store.teacher_allocations['alloc_inactive'] = {
      teacherUid: 'uid_teacher_cs',
      institution: 'Sangam University',
      department: 'Electrical Engineering',
      year: '3rd Year',
      section: 'Sec F',
      authorized: true,
      status: 'inactive'
    };
    const isInactiveAllocated = await announcementService.verifyTeacherAllocation(
      'uid_teacher_cs',
      'Electrical Engineering',
      '3rd Year',
      'Sec F',
      'Sangam University'
    );
    assert.strictEqual(isInactiveAllocated, false, 'Inactive allocation must be rejected');

    // 3. Revocation timestamp set
    mockDb.store.teacher_allocations['alloc_revoked_at'] = {
      teacherUid: 'uid_teacher_cs',
      institution: 'Sangam University',
      department: 'Electrical Engineering',
      year: '3rd Year',
      section: 'Sec G',
      authorized: true,
      revokedAt: '2026-01-01T00:00:00.000Z'
    };
    const isRevokedAtAllocated = await announcementService.verifyTeacherAllocation(
      'uid_teacher_cs',
      'Electrical Engineering',
      '3rd Year',
      'Sec G',
      'Sangam University'
    );
    assert.strictEqual(isRevokedAtAllocated, false, 'Allocation with revokedAt must be rejected');

    // 4. Expired allocation
    mockDb.store.teacher_allocations['alloc_expired'] = {
      teacherUid: 'uid_teacher_cs',
      institution: 'Sangam University',
      department: 'Electrical Engineering',
      year: '3rd Year',
      section: 'Sec H',
      authorized: true,
      expiresAt: '2024-01-01T00:00:00.000Z' // past date
    };
    const isExpiredAllocated = await announcementService.verifyTeacherAllocation(
      'uid_teacher_cs',
      'Electrical Engineering',
      '3rd Year',
      'Sec H',
      'Sangam University'
    );
    assert.strictEqual(isExpiredAllocated, false, 'Expired allocation must be rejected');

    // 5. Mismatched teacherUid in fallback scan
    mockDb.store.teacher_allocations['alloc_other_teacher'] = {
      teacherUid: 'uid_teacher_mech',
      institution: 'Sangam University',
      department: 'Electrical Engineering',
      year: '3rd Year',
      section: 'Sec I',
      authorized: true
    };
    const isMismatchedAllocated = await announcementService.verifyTeacherAllocation(
      'uid_teacher_cs',
      'Electrical Engineering',
      '3rd Year',
      'Sec I',
      'Sangam University'
    );
    assert.strictEqual(isMismatchedAllocated, false, 'Other teacher allocation must be rejected');

    // 6. Full fallback collection scan in getTeacherActiveAllocations ignores invalid allocations
    const activeAllocs = await announcementService.getTeacherActiveAllocations('uid_teacher_cs');
    const invalidIds = ['alloc_revoked', 'alloc_inactive', 'alloc_revoked_at', 'alloc_expired', 'alloc_other_teacher'];
    for (const alloc of activeAllocs) {
      assert.ok(!invalidIds.includes(alloc.id), `Allocations list must not include invalid allocation: ${alloc.id}`);
      assert.notStrictEqual(alloc.status, 'revoked');
      assert.notStrictEqual(alloc.status, 'inactive');
      assert.ok(!alloc.revokedAt);
    }
  });

  await runAsyncTest('12.7: Backend and UI prevent silent fallback to userProfile.department when hierarchy scope is missing', async () => {
    // Attempt to publish without department when teacher userProfile has a department
    await assert.rejects(
      async () => {
        await announcementService.createAnnouncement({
          callerUid: 'uid_teacher_cs',
          title: 'Missing Scope Test',
          content: 'Should fail because department is omitted',
          scopeType: 'section',
          year: '1st Year',
          section: 'Sec B'
          // department omitted
        });
      },
      (err) => err.statusCode === 400 && err.code === 'MISSING_DEPARTMENT'
    );

    // Attempt to publish without section
    await assert.rejects(
      async () => {
        await announcementService.createAnnouncement({
          callerUid: 'uid_teacher_cs',
          title: 'Missing Section Test',
          content: 'Should fail because section is omitted',
          scopeType: 'section',
          department: 'CSE AI',
          year: '1st Year'
          // section omitted
        });
      },
      (err) => err.statusCode === 400 && err.code === 'MISSING_SECTION'
    );
  });

  // ---------------------------------------------------------------------------
  // SECTION 13: Comprehensive All-Department Publishing & Scoping Suite
  // ---------------------------------------------------------------------------
  console.log('\n--- SECTION 13: Comprehensive All-Department Publishing & Scoping Suite ---');

  let itAnnId = null;
  let eceAnnId = null;
  let eeAnnId = null;
  let civilAnnId = null;
  let btAnnId = null;
  let mgmtAnnId = null;

  await runAsyncTest('13.1: Information Technology teacher publishes to IT • 2nd Year • Sec A', async () => {
    const ann = await announcementService.createAnnouncement({
      callerUid: 'uid_teacher_it',
      title: 'IT201 Database Architecture Seminar',
      content: 'Guest lecture on relational databases tomorrow at 11 AM.',
      scopeType: 'section',
      department: 'Information Technology',
      year: '2nd Year',
      section: 'Sec A',
      priority: 'normal',
      category: 'academic'
    });
    assert.ok(ann && ann.id);
    assert.strictEqual(ann.scopeType, 'section');
    assert.strictEqual(ann.authorUid, 'uid_teacher_it');
    itAnnId = ann.id;

    // Verify IT teacher sees it in section feed
    const feed = await announcementService.getAnnouncementsForUser({
      callerUid: 'uid_teacher_it',
      department: 'Information Technology',
      year: '2nd Year',
      section: 'Sec A'
    });
    assert.ok(feed.announcements.some(a => a.id === itAnnId), 'IT teacher must see their announcement in IT feed');

    // Verify CS teacher does NOT see IT section announcement
    const csFeed = await announcementService.getAnnouncementsForUser({
      callerUid: 'uid_teacher_cs',
      department: 'Computer Science and Engineering',
      year: '1st Year',
      section: 'Sec B'
    });
    assert.ok(!csFeed.announcements.some(a => a.id === itAnnId), 'CS teacher must NOT see IT section announcement');
  });

  await runAsyncTest('13.2: ECE teacher publishes using alias ECE • 3rd Year • Sec C', async () => {
    const ann = await announcementService.createAnnouncement({
      callerUid: 'uid_teacher_ece',
      title: 'ECE301 VLSI Design Submission',
      content: 'Verilog testbench simulation waveforms due by Monday.',
      scopeType: 'section',
      department: 'ECE',
      year: '3rd Year',
      section: 'Sec C',
      priority: 'urgent',
      category: 'academic'
    });
    assert.ok(ann && ann.id);
    eceAnnId = ann.id;

    // Verify ECE teacher sees it in feed when queried with full department name
    const feed = await announcementService.getAnnouncementsForUser({
      callerUid: 'uid_teacher_ece',
      department: 'Electronics & Communication',
      year: '3rd Year',
      section: 'Sec C'
    });
    assert.ok(feed.announcements.some(a => a.id === eceAnnId), 'ECE teacher must see ECE announcement in feed');
  });

  await runAsyncTest('13.3: Electrical Engineering teacher publishes to EE • 2nd Year • Sec A', async () => {
    const ann = await announcementService.createAnnouncement({
      callerUid: 'uid_teacher_ee',
      title: 'EE202 Power Systems Lab Safety',
      content: 'Transformer bench testing instructions posted.',
      scopeType: 'section',
      department: 'Electrical Engineering',
      year: '2nd Year',
      section: 'Sec A',
      priority: 'normal',
      category: 'routine'
    });
    assert.ok(ann && ann.id);
    eeAnnId = ann.id;

    const feed = await announcementService.getAnnouncementsForUser({
      callerUid: 'uid_teacher_ee',
      department: 'Electrical Engineering',
      year: '2nd Year',
      section: 'Sec A'
    });
    assert.ok(feed.announcements.some(a => a.id === eeAnnId), 'EE teacher must see EE announcement in feed');
  });

  await runAsyncTest('13.4: Civil Engineering teacher publishes to Civil • 1st Year • Sec B', async () => {
    const ann = await announcementService.createAnnouncement({
      callerUid: 'uid_teacher_civil',
      title: 'CE101 Surveying Field Trip',
      content: 'Theodolite field measurement session this Saturday morning.',
      scopeType: 'section',
      department: 'Civil Engineering',
      year: '1st Year',
      section: 'Sec B',
      priority: 'normal',
      category: 'academic'
    });
    assert.ok(ann && ann.id);
    civilAnnId = ann.id;

    const feed = await announcementService.getAnnouncementsForUser({
      callerUid: 'uid_teacher_civil',
      department: 'Civil Engineering',
      year: '1st Year',
      section: 'Sec B'
    });
    assert.ok(feed.announcements.some(a => a.id === civilAnnId), 'Civil teacher must see Civil announcement in feed');
  });

  await runAsyncTest('13.5: Biotechnology teacher publishes to Biotech • 4th Year • Sec A', async () => {
    const ann = await announcementService.createAnnouncement({
      callerUid: 'uid_teacher_bt',
      title: 'BT401 Bioprocess Engineering viva',
      content: 'Fermenter design viva schedule is now finalized.',
      scopeType: 'section',
      department: 'Biotechnology',
      year: '4th Year',
      section: 'Sec A',
      priority: 'urgent',
      category: 'academic'
    });
    assert.ok(ann && ann.id);
    btAnnId = ann.id;

    const feed = await announcementService.getAnnouncementsForUser({
      callerUid: 'uid_teacher_bt',
      department: 'Biotechnology',
      year: '4th Year',
      section: 'Sec A'
    });
    assert.ok(feed.announcements.some(a => a.id === btAnnId), 'Biotech teacher must see Biotech announcement in feed');
  });

  await runAsyncTest('13.6: Management teacher publishes to Management • 1st Year • Sec A', async () => {
    const ann = await announcementService.createAnnouncement({
      callerUid: 'uid_teacher_mgmt',
      title: 'MGMT101 Case Study Analysis',
      content: 'Harvard Business Review case study submission deadline.',
      scopeType: 'section',
      department: 'Management',
      year: '1st Year',
      section: 'Sec A',
      priority: 'normal',
      category: 'academic'
    });
    assert.ok(ann && ann.id);
    mgmtAnnId = ann.id;

    const feed = await announcementService.getAnnouncementsForUser({
      callerUid: 'uid_teacher_mgmt',
      department: 'Management',
      year: '1st Year',
      section: 'Sec A'
    });
    assert.ok(feed.announcements.some(a => a.id === mgmtAnnId), 'Management teacher must see Management announcement in feed');
  });

  await runAsyncTest('13.7: Teacher cannot publish to a department where they have no allocation', async () => {
    await assert.rejects(
      async () => {
        await announcementService.createAnnouncement({
          callerUid: 'uid_teacher_it',
          title: 'Unauthorized Cross-Dept Post',
          content: 'This should be rejected because IT teacher has no Civil allocation',
          scopeType: 'section',
          department: 'Civil Engineering',
          year: '1st Year',
          section: 'Sec B'
        });
      },
      (err) => err.statusCode === 403 && err.code === 'UNAUTHORIZED_ALLOCATION'
    );
  });

  // ---------------------------------------------------------------------------
  // SECTION 14: PDF & Image Attachment Lifecycle Suite
  // ---------------------------------------------------------------------------
  console.log('\n--- SECTION 14: PDF & Image Attachment Lifecycle Suite ---');

  let pdfAnnId = null;
  let imageAnnId = null;
  let multiAttAnnId = null;

  const samplePdfDataUri = 'data:application/pdf;base64,JVBERi0xLjQKJcTl8uXrCjEgMCBvYmoKPDwKL1R5cGUgL0NhdGFsb2cKL1BhZ2VzIDIgMCBSCj4+CmVuZG9iagoyIDAgb2JqCjw8Ci9UeXBlIC9QYWdlcwovS2lkcyBbMyAwIFJdCi9Db3VudCAxCj4+CmVuZG9iago=';
  const samplePngDataUri = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

  await runAsyncTest('14.1: Teacher publishes announcement with PDF attachment', async () => {
    const ann = await announcementService.createAnnouncement({
      callerUid: 'uid_teacher_it',
      title: 'IT201 Syllabus and Reference Materials',
      content: 'Attached is the official course syllabus for the semester.',
      scopeType: 'section',
      department: 'Information Technology',
      year: '2nd Year',
      section: 'Sec A',
      attachments: [
        {
          id: 'att-pdf-it-1',
          name: 'IT201_Course_Syllabus.pdf',
          size: 1048576,
          type: 'application/pdf',
          url: samplePdfDataUri
        }
      ]
    });

    assert.ok(ann && ann.id);
    assert.ok(Array.isArray(ann.attachments), 'attachments must be an array');
    assert.strictEqual(ann.attachments.length, 1);
    assert.strictEqual(ann.attachments[0].id, 'att-pdf-it-1');
    assert.strictEqual(ann.attachments[0].name, 'IT201_Course_Syllabus.pdf');
    assert.strictEqual(ann.attachments[0].size, 1048576);
    assert.strictEqual(ann.attachments[0].type, 'application/pdf');
    assert.strictEqual(ann.attachments[0].url, samplePdfDataUri);

    pdfAnnId = ann.id;
  });

  await runAsyncTest('14.2: Teacher publishes announcement with Image attachment', async () => {
    const ann = await announcementService.createAnnouncement({
      callerUid: 'uid_teacher_ece',
      title: 'Circuit Schematic for Lab 2',
      content: 'Refer to the attached breadboard wiring schematic.',
      scopeType: 'section',
      department: 'Electronics & Communication',
      year: '3rd Year',
      section: 'Sec C',
      attachments: [
        {
          id: 'att-img-ece-1',
          name: 'Oscilloscope_Wiring_Diagram.png',
          size: 512000,
          type: 'image/png',
          url: samplePngDataUri
        }
      ]
    });

    assert.ok(ann && ann.id);
    assert.ok(Array.isArray(ann.attachments));
    assert.strictEqual(ann.attachments.length, 1);
    assert.strictEqual(ann.attachments[0].type, 'image/png');
    assert.strictEqual(ann.attachments[0].name, 'Oscilloscope_Wiring_Diagram.png');
    assert.strictEqual(ann.attachments[0].url, samplePngDataUri);

    imageAnnId = ann.id;
  });

  await runAsyncTest('14.3: Teacher publishes announcement with multiple attachments (PDF + PNG)', async () => {
    const ann = await announcementService.createAnnouncement({
      callerUid: 'uid_teacher_ee',
      title: 'Power Electronics Assignment & Formulas',
      content: 'Please review both the question sheet and reference formula chart.',
      scopeType: 'section',
      department: 'Electrical Engineering',
      year: '2nd Year',
      section: 'Sec A',
      attachments: [
        {
          id: 'att-ee-pdf',
          name: 'Assignment_Problems.pdf',
          size: 204800,
          type: 'application/pdf',
          url: samplePdfDataUri
        },
        {
          id: 'att-ee-img',
          name: 'Formula_Chart.png',
          size: 102400,
          type: 'image/png',
          url: samplePngDataUri
        }
      ]
    });

    assert.ok(ann && ann.id);
    assert.strictEqual(ann.attachments.length, 2);
    assert.strictEqual(ann.attachments[0].name, 'Assignment_Problems.pdf');
    assert.strictEqual(ann.attachments[1].name, 'Formula_Chart.png');

    multiAttAnnId = ann.id;
  });

  await runAsyncTest('14.4: Attachments persist in database and are retrieved by ID', async () => {
    assert.ok(pdfAnnId);
    const retrieved = await announcementService.getAnnouncementById({
      announcementId: pdfAnnId,
      callerUid: 'uid_teacher_it'
    });

    assert.ok(retrieved);
    assert.ok(Array.isArray(retrieved.attachments));
    assert.strictEqual(retrieved.attachments.length, 1);
    assert.strictEqual(retrieved.attachments[0].name, 'IT201_Course_Syllabus.pdf');
    assert.strictEqual(retrieved.attachments[0].type, 'application/pdf');
    assert.strictEqual(retrieved.attachments[0].url, samplePdfDataUri);
  });

  await runAsyncTest('14.5: getAnnouncementsForUser preserves attachments array for feed rendering', async () => {
    const feed = await announcementService.getAnnouncementsForUser({
      callerUid: 'uid_teacher_ee',
      department: 'Electrical Engineering',
      year: '2nd Year',
      section: 'Sec A'
    });

    const target = feed.announcements.find(a => a.id === multiAttAnnId);
    assert.ok(target, 'Multi-attachment announcement must be in feed');
    assert.ok(Array.isArray(target.attachments), 'Target in feed must have attachments array');
    assert.strictEqual(target.attachments.length, 2);
    assert.strictEqual(target.attachments[0].type, 'application/pdf');
    assert.strictEqual(target.attachments[1].type, 'image/png');
  });

  await runAsyncTest('14.6: mapBackendAnnouncementToItem preserves attachments faithfully', () => {
    const backendAnn = {
      id: 'ann-att-map-test',
      title: 'Lab Manual',
      content: 'See attached file',
      authorRole: 'faculty',
      authorName: 'Prof. Test',
      createdAt: new Date().toISOString(),
      attachments: [
        {
          id: 'att-1',
          name: 'Manual.pdf',
          size: 50000,
          type: 'application/pdf',
          url: 'https://example.com/manual.pdf'
        }
      ]
    };

    const uiItem = mapBackendAnnouncementToItem(backendAnn);
    assert.ok(uiItem);
    assert.ok(Array.isArray(uiItem.attachments));
    assert.strictEqual(uiItem.attachments.length, 1);
    assert.strictEqual(uiItem.attachments[0].name, 'Manual.pdf');
    assert.strictEqual(uiItem.attachments[0].url, 'https://example.com/manual.pdf');
  });

  await runAsyncTest('14.7: Backend rejects attachments exceeding maximum size (> 10MB)', async () => {
    await assert.rejects(
      async () => {
        await announcementService.createAnnouncement({
          callerUid: 'uid_teacher_it',
          title: 'Oversized Attachment Post',
          content: 'This should fail because file exceeds 10MB',
          scopeType: 'section',
          department: 'Information Technology',
          year: '2nd Year',
          section: 'Sec A',
          attachments: [
            {
              id: 'att-huge',
              name: 'huge_file.pdf',
              size: 15 * 1024 * 1024, // 15MB
              type: 'application/pdf',
              url: 'data:application/pdf;base64,xxxx'
            }
          ]
        });
      },
      (err) => err.statusCode === 400 && err.code === 'ATTACHMENT_TOO_LARGE'
    );
  });

  await runAsyncTest('14.8: Backend rejects more than 10 attachments per announcement', async () => {
    const tooMany = Array.from({ length: 11 }, (_, i) => ({
      id: `att-${i}`,
      name: `file_${i}.png`,
      size: 1024,
      type: 'image/png',
      url: samplePngDataUri
    }));

    await assert.rejects(
      async () => {
        await announcementService.createAnnouncement({
          callerUid: 'uid_teacher_it',
          title: 'Too Many Files Post',
          content: 'This should fail because there are 11 attachments',
          scopeType: 'section',
          department: 'Information Technology',
          year: '2nd Year',
          section: 'Sec A',
          attachments: tooMany
        });
      },
      (err) => err.statusCode === 400 && err.code === 'TOO_MANY_ATTACHMENTS'
    );
  });

  await runAsyncTest('14.9: Backend handles announcements without attachments cleanly', async () => {
    const ann = await announcementService.createAnnouncement({
      callerUid: 'uid_teacher_it',
      title: 'Text Only Announcement',
      content: 'This announcement has no attachments.',
      scopeType: 'section',
      department: 'Information Technology',
      year: '2nd Year',
      section: 'Sec A'
    });

    assert.ok(ann && ann.id);
    assert.ok(Array.isArray(ann.attachments));
    assert.strictEqual(ann.attachments.length, 0);

    const uiItem = mapBackendAnnouncementToItem(ann);
    assert.ok(Array.isArray(uiItem.attachments));
    assert.strictEqual(uiItem.attachments.length, 0);
  });

  console.log('\n======================================================');
  console.log(` RESULTS: ${passed} passed, ${failed} failed`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runAllTests().catch((err) => {
  console.error('Test suite uncaught error:', err);
  process.exit(1);
});
