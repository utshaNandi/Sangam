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
  isDirectorOrHodAnnouncement
} from '../server/services/announcementService.js';
import { setCustomAuthService } from '../server/middleware/authMiddleware.js';
import {
  filterEligibleDashboardAnnouncements,
  filterAnnouncementsByPeriod,
  mapAnnouncementToPanelItem,
  ANNOUNCEMENT_THEMES
} from '../src/services/announcementService.js';

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
console.log(' SANGAM DASHBOARD ANNOUNCEMENTS FILTER — TEST SUITE');
console.log(' Verifies Director & HOD eligibility, exclusion of other roles,');
console.log(' 4-item display limit, scoping, and empty / fewer-than-four handling.');
console.log('======================================================\n');

// -----------------------------------------------------------------------------
// High-Fidelity Mock Firestore for Dashboard Announcements
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
  'valid-director-token': { uid: 'uid_director_test', email: 'director@sangam.edu' },
  'valid-teacher-token': { uid: 'uid_teacher_test', email: 'teacher@sangam.edu' },
  'valid-student-token': { uid: 'uid_student_test', email: 'student@sangam.edu' }
};

setCustomAuthService({
  verifyIdToken: async (token) => {
    const payload = testTokens[token];
    if (!payload) throw new Error('Invalid Firebase token.');
    return payload;
  }
});

// Setup Initial User Profiles
mockDb.store.users['uid_director_test'] = {
  uid: 'uid_director_test',
  role: 'director',
  institution: 'Sangam University',
  name: 'Prof. Director',
  email: 'director@sangam.edu',
  status: 'active'
};

mockDb.store.users['uid_teacher_test'] = {
  uid: 'uid_teacher_test',
  role: 'teacher',
  institution: 'Sangam University',
  department: 'Computer Science',
  name: 'Dr. Faculty Member',
  email: 'teacher@sangam.edu',
  status: 'active'
};

mockDb.store.users['uid_student_test'] = {
  uid: 'uid_student_test',
  role: 'student',
  institution: 'Sangam University',
  department: 'Computer Science',
  year: '3rd Year',
  section: 'A',
  name: 'Student One',
  email: 'student@sangam.edu',
  status: 'active'
};

// =============================================================================
// TEST SUITE EXECUTION
// =============================================================================

async function runAllTests() {
  // ---------------------------------------------------------------------------
  // 1. Director Announcements are Eligible
  // ---------------------------------------------------------------------------
  console.log('--- REQUIREMENT 1: Director Announcements Are Eligible ---');

  runTest('1.1: isDirectorOrHodRole recognizes "director" and "admin"', () => {
    assert.strictEqual(isDirectorOrHodRole('director'), true);
    assert.strictEqual(isDirectorOrHodRole('Director'), true);
    assert.strictEqual(isDirectorOrHodRole('admin'), true);
    assert.strictEqual(isDirectorOrHodRole('ADMIN'), true);
  });

  runTest('1.2: isDirectorOrHodAnnouncement identifies Director announcements', () => {
    const ann1 = { id: 'a1', title: 'Campus Advisory', authorRole: 'director' };
    const ann2 = { id: 'a2', title: 'Holiday Notice', authorRole: 'admin' };
    assert.strictEqual(isDirectorOrHodAnnouncement(ann1), true);
    assert.strictEqual(isDirectorOrHodAnnouncement(ann2), true);
  });

  await runAsyncTest('1.3: Backend getDashboardAnnouncements includes Director announcements', async () => {
    mockDb.store.announcements['ann_dir_1'] = {
      id: 'ann_dir_1',
      title: 'Annual convocation notice',
      content: 'Convocation ceremony scheduled for next month.',
      scopeType: 'institution',
      institution: 'Sangam University',
      authorUid: 'uid_director_test',
      authorName: 'Prof. Director',
      authorRole: 'director',
      createdAt: '2026-10-19T10:00:00.000Z'
    };

    const result = await announcementService.getDashboardAnnouncements({
      callerUid: 'uid_teacher_test',
      limit: 4
    });

    assert.ok(Array.isArray(result.announcements));
    const found = result.announcements.some(a => a.id === 'ann_dir_1');
    assert.strictEqual(found, true, 'Director announcement must be present in dashboard announcements');
  });

  // ---------------------------------------------------------------------------
  // 2. HOD Announcements are Eligible Under Trusted Role Model
  // ---------------------------------------------------------------------------
  console.log('\n--- REQUIREMENT 2: HOD Announcements Are Eligible ---');

  runTest('2.1: isDirectorOrHodRole recognizes "hod" and "head_of_department"', () => {
    assert.strictEqual(isDirectorOrHodRole('hod'), true);
    assert.strictEqual(isDirectorOrHodRole('HOD'), true);
    assert.strictEqual(isDirectorOrHodRole('head_of_department'), true);
    assert.strictEqual(isDirectorOrHodRole('Head of Department'), true);
  });

  runTest('2.2: isDirectorOrHodAnnouncement identifies HOD announcements', () => {
    const annHod1 = { id: 'h1', title: 'Lab Safety Briefing', authorRole: 'hod' };
    const annHod2 = { id: 'h2', title: 'Elective Selection', authorRole: 'head_of_department' };
    assert.strictEqual(isDirectorOrHodAnnouncement(annHod1), true);
    assert.strictEqual(isDirectorOrHodAnnouncement(annHod2), true);
  });

  await runAsyncTest('2.3: Backend getDashboardAnnouncements includes HOD announcements', async () => {
    mockDb.store.announcements['ann_hod_1'] = {
      id: 'ann_hod_1',
      title: 'Department Curriculum Review',
      content: 'All CS faculty and students please review the syllabus update.',
      scopeType: 'branch',
      institution: 'Sangam University',
      department: 'Computer Science',
      authorUid: 'uid_hod_test',
      authorName: 'Dr. CS HOD',
      authorRole: 'hod',
      createdAt: '2026-10-19T11:00:00.000Z'
    };

    const result = await announcementService.getDashboardAnnouncements({
      callerUid: 'uid_teacher_test',
      limit: 4
    });

    const found = result.announcements.some(a => a.id === 'ann_hod_1');
    assert.strictEqual(found, true, 'HOD announcement must be present in dashboard announcements');
  });

  // ---------------------------------------------------------------------------
  // 3. Teacher, Student, and CR Announcements are Excluded
  // ---------------------------------------------------------------------------
  console.log('\n--- REQUIREMENT 3: Teacher, Student, and CR Announcements Are Excluded ---');

  runTest('3.1: isDirectorOrHodRole returns false for teacher, student, CR, and unauthorized roles', () => {
    assert.strictEqual(isDirectorOrHodRole('faculty'), false);
    assert.strictEqual(isDirectorOrHodRole('teacher'), false);
    assert.strictEqual(isDirectorOrHodRole('student'), false);
    assert.strictEqual(isDirectorOrHodRole('cr'), false);
    assert.strictEqual(isDirectorOrHodRole('class_representative'), false);
    assert.strictEqual(isDirectorOrHodRole('teaching_assistant'), false);
    assert.strictEqual(isDirectorOrHodRole(''), false);
    assert.strictEqual(isDirectorOrHodRole(null), false);
    assert.strictEqual(isDirectorOrHodRole(undefined), false);
  });

  runTest('3.2: isDirectorOrHodAnnouncement excludes non-Director/HOD announcements', () => {
    assert.strictEqual(isDirectorOrHodAnnouncement({ authorRole: 'faculty' }), false);
    assert.strictEqual(isDirectorOrHodAnnouncement({ authorRole: 'teacher' }), false);
    assert.strictEqual(isDirectorOrHodAnnouncement({ authorRole: 'student' }), false);
    assert.strictEqual(isDirectorOrHodAnnouncement({ authorRole: 'cr' }), false);
    assert.strictEqual(isDirectorOrHodAnnouncement({}), false);
    assert.strictEqual(isDirectorOrHodAnnouncement(null), false);
  });

  await runAsyncTest('3.3: Backend getDashboardAnnouncements strictly excludes teacher and student announcements', async () => {
    // Inject teacher announcement
    mockDb.store.announcements['ann_teacher_1'] = {
      id: 'ann_teacher_1',
      title: 'Assignment submission reminder',
      content: 'Submit Assignment 2 by Friday 5 PM.',
      scopeType: 'section',
      institution: 'Sangam University',
      department: 'Computer Science',
      year: '3rd Year',
      section: 'A',
      authorUid: 'uid_teacher_test',
      authorRole: 'faculty',
      createdAt: '2026-10-19T12:00:00.000Z'
    };

    // Inject student / CR announcement
    mockDb.store.announcements['ann_student_1'] = {
      id: 'ann_student_1',
      title: 'Class picnic coordination',
      content: 'Meeting after classes near the canteen.',
      scopeType: 'section',
      institution: 'Sangam University',
      department: 'Computer Science',
      year: '3rd Year',
      section: 'A',
      authorUid: 'uid_student_test',
      authorRole: 'student',
      createdAt: '2026-10-19T12:30:00.000Z'
    };

    mockDb.store.announcements['ann_cr_1'] = {
      id: 'ann_cr_1',
      title: 'Class notes shared',
      content: 'Notes for unit 3 uploaded.',
      scopeType: 'section',
      institution: 'Sangam University',
      department: 'Computer Science',
      year: '3rd Year',
      section: 'A',
      authorUid: 'uid_student_test',
      authorRole: 'cr',
      createdAt: '2026-10-19T12:45:00.000Z'
    };

    const result = await announcementService.getDashboardAnnouncements({
      callerUid: 'uid_teacher_test',
      limit: 10
    });

    const teacherAnn = result.announcements.find(a => a.id === 'ann_teacher_1');
    const studentAnn = result.announcements.find(a => a.id === 'ann_student_1');
    const crAnn = result.announcements.find(a => a.id === 'ann_cr_1');

    assert.strictEqual(teacherAnn, undefined, 'Teacher announcements MUST NOT appear in dashboard announcements');
    assert.strictEqual(studentAnn, undefined, 'Student announcements MUST NOT appear in dashboard announcements');
    assert.strictEqual(crAnn, undefined, 'CR announcements MUST NOT appear in dashboard announcements');
  });

  runTest('3.4: Frontend filterEligibleDashboardAnnouncements discards teacher/student/CR announcements', () => {
    const mixed = [
      { id: '1', title: 'Director Note', authorRole: 'director', createdAt: '2026-10-19T10:00:00Z' },
      { id: '2', title: 'Teacher Reminder', authorRole: 'faculty', createdAt: '2026-10-19T11:00:00Z' },
      { id: '3', title: 'HOD Circular', authorRole: 'hod', createdAt: '2026-10-19T12:00:00Z' },
      { id: '4', title: 'Student Post', authorRole: 'student', createdAt: '2026-10-19T13:00:00Z' },
      { id: '5', title: 'CR Notice', authorRole: 'cr', createdAt: '2026-10-19T14:00:00Z' },
      { id: '6', title: 'Unknown Author', createdAt: '2026-10-19T15:00:00Z' }
    ];

    const eligible = filterEligibleDashboardAnnouncements(mixed);
    assert.strictEqual(eligible.length, 2);
    assert.strictEqual(eligible[0].id, '3', 'HOD notice is eligible and sorted newest first');
    assert.strictEqual(eligible[1].id, '1', 'Director note is eligible');
  });

  // ---------------------------------------------------------------------------
  // 4. Maximum of Four Eligible Announcements Displayed
  // ---------------------------------------------------------------------------
  console.log('\n--- REQUIREMENT 4: Maximum of Four Eligible Announcements ---');

  await runAsyncTest('4.1: Backend getDashboardAnnouncements caps at limit = 4 when more than 4 exist', async () => {
    // Populate 6 eligible Director announcements
    for (let i = 1; i <= 6; i++) {
      mockDb.store.announcements[`ann_dir_batch_${i}`] = {
        id: `ann_dir_batch_${i}`,
        title: `Director Notice #${i}`,
        content: `Notice content ${i}`,
        scopeType: 'institution',
        institution: 'Sangam University',
        authorUid: 'uid_director_test',
        authorRole: 'director',
        createdAt: `2026-10-19T${10 + i}:00:00.000Z`
      };
    }

    const result = await announcementService.getDashboardAnnouncements({
      callerUid: 'uid_teacher_test',
      limit: 4
    });

    assert.strictEqual(result.announcements.length, 4, 'Must return exactly 4 announcements when >4 exist');
    // Newest first check
    assert.strictEqual(result.announcements[0].id, 'ann_dir_batch_6');
    assert.strictEqual(result.announcements[1].id, 'ann_dir_batch_5');
    assert.strictEqual(result.announcements[2].id, 'ann_dir_batch_4');
    assert.strictEqual(result.announcements[3].id, 'ann_dir_batch_3');
  });

  runTest('4.2: Frontend panel items capped at maximum 4 items', () => {
    const sixItems = [
      { id: 'd1', title: 'D1', authorRole: 'director', createdAt: '2026-10-19T01:00:00Z' },
      { id: 'd2', title: 'D2', authorRole: 'director', createdAt: '2026-10-19T02:00:00Z' },
      { id: 'd3', title: 'D3', authorRole: 'director', createdAt: '2026-10-19T03:00:00Z' },
      { id: 'd4', title: 'D4', authorRole: 'director', createdAt: '2026-10-19T04:00:00Z' },
      { id: 'd5', title: 'D5', authorRole: 'director', createdAt: '2026-10-19T05:00:00Z' },
      { id: 'd6', title: 'D6', authorRole: 'director', createdAt: '2026-10-19T06:00:00Z' }
    ];

    const eligible = filterEligibleDashboardAnnouncements(sixItems);
    const displayed = eligible.slice(0, 4).map((item, idx) => mapAnnouncementToPanelItem(item, idx));

    assert.strictEqual(displayed.length, 4, 'Frontend must slice to max 4');
    assert.strictEqual(displayed[0].id, 'd6', 'First item is newest');
    assert.strictEqual(displayed[3].id, 'd3', 'Fourth item is 4th newest');
  });

  // ---------------------------------------------------------------------------
  // 5. Existing Audience Permissions & Announcement Details Remain Functional
  // ---------------------------------------------------------------------------
  console.log('\n--- REQUIREMENT 5: Audience Permissions & Announcement Details ---');

  await runAsyncTest('5.1: Isolation across institutions is preserved for dashboard announcements', async () => {
    // Add Director announcement from another institution
    mockDb.store.announcements['ann_other_inst'] = {
      id: 'ann_other_inst',
      title: 'Other College Notice',
      content: 'This belongs to Other University.',
      scopeType: 'institution',
      institution: 'Other University',
      authorUid: 'uid_other_director',
      authorRole: 'director',
      createdAt: '2026-10-19T20:00:00.000Z'
    };

    const result = await announcementService.getDashboardAnnouncements({
      callerUid: 'uid_teacher_test',
      limit: 10
    });

    const otherAnn = result.announcements.find(a => a.id === 'ann_other_inst');
    assert.strictEqual(otherAnn, undefined, 'Announcements from different institutions must be strictly isolated');
  });

  runTest('5.2: mapAnnouncementToPanelItem faithfully maps all details and aesthetics', () => {
    const rawAnn = {
      id: 'ann_test_map',
      title: 'Spring Semester Registration',
      content: 'All students must register for their electives by next Monday.\nLate fee will apply afterwards.\nConsult academic advisor if needed.',
      scopeType: 'institution',
      institution: 'Sangam University',
      authorName: 'Dr. O. P. Director',
      authorRole: 'director',
      priority: 'urgent',
      category: 'academic',
      time: '09 : 15 AM',
      createdAt: '2026-10-19T09:15:00.000Z'
    };

    const mapped = mapAnnouncementToPanelItem(rawAnn, 0);

    assert.strictEqual(mapped.id, 'ann_test_map');
    assert.strictEqual(mapped.name, 'Spring Semester Registration');
    assert.strictEqual(mapped.time, '09 : 15 AM');
    assert.strictEqual(mapped.color, ANNOUNCEMENT_THEMES[0].color);
    assert.strictEqual(mapped.tagBg, ANNOUNCEMENT_THEMES[0].tagBg);
    assert.strictEqual(mapped.mutedColor, ANNOUNCEMENT_THEMES[0].mutedColor);
    assert.strictEqual(mapped.icon, 'knot');
    assert.strictEqual(mapped.badgeCode, 'DIRECTOR');
    assert.strictEqual(mapped.demographics, 'Director Office • Institution Broadcast');
    assert.ok(mapped.tags.includes('Urgent'));
    assert.ok(mapped.tags.includes('Institution'));
    assert.strictEqual(mapped.checkedBy, 'Dr. O. P. Director');
    assert.ok(mapped.checkedDate.includes('October 2026'));
    assert.strictEqual(mapped.refCode, '#TEST_MAP');
    assert.ok(mapped.prescriptions.length >= 2, 'Action items lines preserved');
  });

  runTest('5.3: mapAnnouncementToPanelItem preserves HOD badge and theme cycling', () => {
    const hodAnn = {
      id: 'ann_hod_map',
      title: 'Lab Equipments Inspection',
      content: 'Inspection scheduled for Tuesday.',
      scopeType: 'branch',
      department: 'Computer Science',
      authorRole: 'hod',
      createdAt: '2026-10-19T14:30:00.000Z'
    };

    // Use index 1 to test second theme
    const mapped = mapAnnouncementToPanelItem(hodAnn, 1);

    assert.strictEqual(mapped.badgeCode, 'HOD');
    assert.strictEqual(mapped.color, ANNOUNCEMENT_THEMES[1].color);
    assert.strictEqual(mapped.icon, 'stethoscope');
    assert.strictEqual(mapped.demographics, 'Head of Department • Computer Science Dept');
  });

  // ---------------------------------------------------------------------------
  // 6. Empty and Fewer-Than-Four Results Render Correctly
  // ---------------------------------------------------------------------------
  console.log('\n--- REQUIREMENT 6: Empty and Fewer-Than-Four Results ---');

  runTest('6.1: Empty list (0 items) produces empty mapped array and safe fallbacks', () => {
    const emptyRaw = [];
    const eligible = filterEligibleDashboardAnnouncements(emptyRaw);
    assert.strictEqual(eligible.length, 0);

    const mapped = eligible.map(mapAnnouncementToPanelItem);
    assert.strictEqual(mapped.length, 0);
  });

  runTest('6.2: Single announcement (1 item) maps cleanly without fabricating items', () => {
    const singleRaw = [
      { id: 'single_1', title: 'Sole Announcement', authorRole: 'director', createdAt: '2026-10-19T08:00:00Z' }
    ];

    const eligible = filterEligibleDashboardAnnouncements(singleRaw);
    assert.strictEqual(eligible.length, 1);

    const mapped = eligible.slice(0, 4).map((it, idx) => mapAnnouncementToPanelItem(it, idx));
    assert.strictEqual(mapped.length, 1, 'Must contain ONLY the 1 available item, no fillers');
    assert.strictEqual(mapped[0].name, 'Sole Announcement');
  });

  runTest('6.3: Two and Three announcements map cleanly with exact corresponding theme colors', () => {
    const twoRaw = [
      { id: 'two_1', title: 'Ann 1', authorRole: 'director', createdAt: '2026-10-19T09:00:00Z' },
      { id: 'two_2', title: 'Ann 2', authorRole: 'hod', createdAt: '2026-10-19T08:00:00Z' }
    ];

    const eligible = filterEligibleDashboardAnnouncements(twoRaw);
    assert.strictEqual(eligible.length, 2);

    const mapped = eligible.slice(0, 4).map((it, idx) => mapAnnouncementToPanelItem(it, idx));
    assert.strictEqual(mapped.length, 2);
    assert.strictEqual(mapped[0].color, ANNOUNCEMENT_THEMES[0].color);
    assert.strictEqual(mapped[1].color, ANNOUNCEMENT_THEMES[1].color);
  });

  runTest('6.4: Announcements from different dates (today, weeks ago, months ago, 1 year ago) appear together in latest-four', () => {
    const multiDateAnnouncements = [
      { id: 'ann_today', title: 'Posted Today', authorRole: 'director', createdAt: new Date().toISOString() },
      { id: 'ann_2_weeks_ago', title: 'Posted 2 Weeks Ago', authorRole: 'hod', createdAt: new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString() },
      { id: 'ann_3_months_ago', title: 'Posted 3 Months Ago', authorRole: 'director', createdAt: new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString() },
      { id: 'ann_1_year_ago', title: 'Posted 1 Year Ago', authorRole: 'director', createdAt: new Date(Date.now() - 365 * 24 * 3600 * 1000).toISOString() },
      { id: 'ann_ancient', title: 'Posted 2 Years Ago', authorRole: 'hod', createdAt: new Date(Date.now() - 730 * 24 * 3600 * 1000).toISOString() }
    ];

    const eligible = filterEligibleDashboardAnnouncements(multiDateAnnouncements);
    assert.strictEqual(eligible.length, 5, 'All 5 Director/HOD announcements are eligible regardless of age');

    const top4 = eligible.slice(0, 4).map((ann, idx) => mapAnnouncementToPanelItem(ann, idx));
    assert.strictEqual(top4.length, 4, 'Always exactly 4 items displayed when at least 4 eligible exist');
    assert.strictEqual(top4[0].id, 'ann_today', 'Top item is from today');
    assert.strictEqual(top4[1].id, 'ann_2_weeks_ago', 'Second item is from 2 weeks ago');
    assert.strictEqual(top4[2].id, 'ann_3_months_ago', 'Third item is from 3 months ago');
    assert.strictEqual(top4[3].id, 'ann_1_year_ago', 'Fourth item is from 1 year ago');
  });

  runTest('6.5: When a new Director/HOD announcement is published, it enters the top 4 and the oldest moves out', () => {
    const initialList = [
      { id: 'ann_a', title: 'Item A', authorRole: 'director', createdAt: '2026-10-10T10:00:00Z' },
      { id: 'ann_b', title: 'Item B', authorRole: 'hod', createdAt: '2026-10-09T10:00:00Z' },
      { id: 'ann_c', title: 'Item C', authorRole: 'director', createdAt: '2026-10-08T10:00:00Z' },
      { id: 'ann_d', title: 'Item D', authorRole: 'director', createdAt: '2026-10-07T10:00:00Z' }
    ];

    const initialTop4 = filterEligibleDashboardAnnouncements(initialList).slice(0, 4);
    assert.deepStrictEqual(initialTop4.map(a => a.id), ['ann_a', 'ann_b', 'ann_c', 'ann_d']);

    // A brand new announcement is published
    const brandNewAnnouncement = {
      id: 'ann_new',
      title: 'Brand New Notice',
      authorRole: 'director',
      createdAt: '2026-10-19T15:00:00Z'
    };

    const updatedList = [brandNewAnnouncement, ...initialList];
    const updatedTop4 = filterEligibleDashboardAnnouncements(updatedList).slice(0, 4);

    assert.strictEqual(updatedTop4.length, 4);
    assert.strictEqual(updatedTop4[0].id, 'ann_new', 'New announcement is at the top');
    assert.strictEqual(updatedTop4[1].id, 'ann_a');
    assert.strictEqual(updatedTop4[2].id, 'ann_b');
    assert.strictEqual(updatedTop4[3].id, 'ann_c');
    assert.strictEqual(updatedTop4.some(a => a.id === 'ann_d'), false, 'Oldest item D moved out of the top 4');
  });

  runTest('6.6: Date period utility function handles period comparisons if invoked separately', () => {
    const now = new Date();
    const todayStr = now.toISOString();
    const yesterdayStr = new Date(now.getTime() - 24 * 3600 * 1000).toISOString();
    const futureStr = new Date(now.getTime() + 24 * 3600 * 1000).toISOString();

    const items = [
      { id: 't1', title: 'Today Item', createdAt: todayStr },
      { id: 'y1', title: 'Yesterday Item', createdAt: yesterdayStr },
      { id: 'f1', title: 'Tomorrow Item', createdAt: futureStr }
    ];

    const todayMatches = filterAnnouncementsByPeriod(items, 'Today');
    assert.ok(todayMatches.some(i => i.id === 't1'));

    const tomorrowMatches = filterAnnouncementsByPeriod(items, 'Tomorrow');
    assert.ok(tomorrowMatches.some(i => i.id === 'f1'));
    assert.strictEqual(tomorrowMatches.some(i => i.id === 't1'), false);

    const weekMatches = filterAnnouncementsByPeriod(items, 'This Week');
    assert.ok(Array.isArray(weekMatches));
  });

  // ---------------------------------------------------------------------------
  // 7. HTTP Endpoint GET /api/announcements/dashboard
  // ---------------------------------------------------------------------------
  console.log('\n--- SECTION 7: HTTP Endpoint GET /api/announcements/dashboard ---');

  await runAsyncTest('7.1: GET /api/announcements/dashboard returns 200 with scoped Director/HOD items', async () => {
    const res = await makeHttpRequest('/api/announcements/dashboard?limit=4', {
      headers: { 'Authorization': 'Bearer valid-teacher-token' }
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.success, true);
    assert.ok(Array.isArray(res.body.announcements));
    assert.ok(res.body.announcements.length <= 4);

    // Verify all returned announcements are Director or HOD
    for (const ann of res.body.announcements) {
      assert.strictEqual(isDirectorOrHodAnnouncement(ann), true, `All items must be Director or HOD: found ${ann.authorRole}`);
    }
  });

  // Summary
  console.log('\n======================================================');
  console.log(` RESULTS: ${passed} passed, ${failed} failed`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

let testPort = 3001;

// HTTP request helper
function makeHttpRequest(path, options = {}) {
  return new Promise((resolve, reject) => {
    const headers = options.headers || {};
    const method = options.method || 'GET';

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: testPort,
        path,
        method,
        headers
      },
      (res) => {
        let rawData = '';
        res.on('data', (chunk) => { rawData += chunk; });
        res.on('end', () => {
          let body = rawData;
          try {
            body = JSON.parse(rawData);
          } catch {
            // Keep string
          }
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body
          });
        });
      }
    );

    req.on('error', reject);
    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }
    req.end();
  });
}

// Start temporary test server on ephemeral port
const testServer = http.createServer(app);
testServer.listen(0, '127.0.0.1', () => {
  testPort = testServer.address().port;
  runAllTests().finally(() => {
    testServer.close();
  });
});
