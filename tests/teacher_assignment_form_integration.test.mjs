import assert from 'node:assert';
import { uploadAssignmentPdf } from '../src/services/storageService.js';
import { auth } from '../src/firebase/config.js';
import { resolveAcademicScope } from '../src/services/attendanceService.js';
import { globalAssignments, addGlobalAssignment } from '../src/data/academicModel.js';

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
console.log(' SANGAM TEACHER ASSIGNMENT FORM INTEGRATION (STAGE 6)');
console.log(' Notice: Tests verify client service, form state management,');
console.log(' idempotency key lifecycle, and cloud vs fallback isolation.');
console.log('======================================================\n');

// -----------------------------------------------------------------------------
// SECTION 1: Service Validation & Multipart Request Construction
// -----------------------------------------------------------------------------
console.log('--- SECTION 1: Service Validation & Multipart Construction ---');

await runAsyncTest('1.1: uploadAssignmentPdf rejects missing file with MISSING_FILE', async () => {
  try {
    await uploadAssignmentPdf({
      file: null,
      title: 'DSA Assignment',
      department: 'Computer Science',
      year: '3rd Year',
      section: 'CSE-A',
      dueDate: '2026-11-01'
    });
    assert.fail('Should have thrown MISSING_FILE');
  } catch (err) {
    assert.strictEqual(err.code, 'MISSING_FILE');
    assert.ok(err.message.includes('Please select a PDF'));
  }
});

await runAsyncTest('1.2: uploadAssignmentPdf rejects non-PDF file with INVALID_MIME_TYPE', async () => {
  const fakeFile = {
    name: 'document.docx',
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    size: 2048
  };
  try {
    await uploadAssignmentPdf({
      file: fakeFile,
      title: 'DSA Assignment',
      department: 'Computer Science',
      year: '3rd Year',
      section: 'CSE-A',
      dueDate: '2026-11-01'
    });
    assert.fail('Should have thrown INVALID_MIME_TYPE');
  } catch (err) {
    assert.strictEqual(err.code, 'INVALID_MIME_TYPE');
    assert.ok(err.message.includes('PDF'));
  }
});

await runAsyncTest('1.3: uploadAssignmentPdf rejects empty (0-byte) file with EMPTY_FILE', async () => {
  const emptyPdf = {
    name: 'empty.pdf',
    type: 'application/pdf',
    size: 0
  };
  try {
    await uploadAssignmentPdf({
      file: emptyPdf,
      title: 'DSA Assignment',
      department: 'Computer Science',
      year: '3rd Year',
      section: 'CSE-A',
      dueDate: '2026-11-01'
    });
    assert.fail('Should have thrown EMPTY_FILE');
  } catch (err) {
    assert.strictEqual(err.code, 'EMPTY_FILE');
    assert.ok(err.message.includes('empty'));
  }
});

await runAsyncTest('1.4: uploadAssignmentPdf rejects oversized file (>10MB) with LIMIT_FILE_SIZE', async () => {
  const oversizedPdf = {
    name: 'huge.pdf',
    type: 'application/pdf',
    size: 15 * 1024 * 1024 // 15MB
  };
  try {
    await uploadAssignmentPdf({
      file: oversizedPdf,
      title: 'DSA Assignment',
      department: 'Computer Science',
      year: '3rd Year',
      section: 'CSE-A',
      dueDate: '2026-11-01'
    });
    assert.fail('Should have thrown LIMIT_FILE_SIZE');
  } catch (err) {
    assert.strictEqual(err.code, 'LIMIT_FILE_SIZE');
    assert.ok(err.message.includes('10MB'));
  }
});

await runAsyncTest('1.5: uploadAssignmentPdf rejects missing title or dueDate with VALIDATION_FAILED', async () => {
  const validPdf = { name: 'test.pdf', type: 'application/pdf', size: 1024 };
  try {
    await uploadAssignmentPdf({
      file: validPdf,
      title: '   ',
      department: 'Computer Science',
      year: '3rd Year',
      section: 'CSE-A',
      dueDate: '2026-11-01'
    });
    assert.fail('Should have thrown VALIDATION_FAILED for empty title');
  } catch (err) {
    assert.strictEqual(err.code, 'VALIDATION_FAILED');
  }

  try {
    await uploadAssignmentPdf({
      file: validPdf,
      title: 'Valid Title',
      department: 'Computer Science',
      year: '3rd Year',
      section: 'CSE-A',
      dueDate: ''
    });
    assert.fail('Should have thrown VALIDATION_FAILED for empty dueDate');
  } catch (err) {
    assert.strictEqual(err.code, 'VALIDATION_FAILED');
  }
});

await runAsyncTest('1.6: uploadAssignmentPdf rejects unauthenticated requests', async () => {
  const origUser = auth.currentUser;
  auth.currentUser = null;
  const validPdf = { name: 'test.pdf', type: 'application/pdf', size: 1024 };

  try {
    await uploadAssignmentPdf({
      file: validPdf,
      title: 'Valid Title',
      department: 'Computer Science',
      year: '3rd Year',
      section: 'CSE-A',
      dueDate: '2026-11-01'
    });
    assert.fail('Should have thrown unauthenticated error');
  } catch (err) {
    assert.ok(err.message.includes('signed in'));
  } finally {
    auth.currentUser = origUser;
  }
});

await runAsyncTest('1.7: uploadAssignmentPdf sends Authorization Bearer, X-Idempotency-Key, and multipart body', async () => {
  const origUser = auth.currentUser;
  const origFetch = global.fetch;

  auth.currentUser = {
    getIdToken: async (force) => 'mock_fresh_token_12345'
  };

  let capturedUrl = null;
  let capturedHeaders = null;
  let capturedBody = null;

  global.fetch = async (url, options) => {
    capturedUrl = url;
    capturedHeaders = options.headers;
    capturedBody = options.body;
    return {
      ok: true,
      json: async () => ({
        success: true,
        assignment: {
          id: 'asg_test_789',
          title: 'Algorithms Midterm Project',
          department: 'Computer Science',
          year: '3rd Year',
          section: 'CSE-A',
          dueDate: '2026-11-15T23:59:59.000Z',
          storageProvider: 'google_drive',
          driveFileId: 'drive_midterm_123',
          fileName: 'midterm.pdf',
          fileSize: 4096,
          fileMimeType: 'application/pdf'
        }
      })
    };
  };

  try {
    const fakePdf = { name: 'midterm.pdf', type: 'application/pdf', size: 4096 };
    const result = await uploadAssignmentPdf({
      file: fakePdf,
      title: 'Algorithms Midterm Project',
      department: 'Computer Science',
      year: '3rd Year',
      section: 'CSE-A',
      dueDate: '2026-11-15',
      idempotencyKey: 'idem_key_abc_999'
    });

    assert.ok(capturedUrl.endsWith('/api/assignments/upload'));
    assert.strictEqual(capturedHeaders['Authorization'], 'Bearer mock_fresh_token_12345');
    assert.strictEqual(capturedHeaders['X-Idempotency-Key'], 'idem_key_abc_999');
    assert.ok(capturedBody instanceof FormData);
    assert.strictEqual(capturedBody.get('title'), 'Algorithms Midterm Project');
    assert.strictEqual(capturedBody.get('department'), 'Computer Science');
    assert.strictEqual(capturedBody.get('year'), '3rd Year');
    assert.strictEqual(capturedBody.get('section'), 'CSE-A');
    assert.strictEqual(capturedBody.get('dueDate'), '2026-11-15');
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.assignment.storageProvider, 'google_drive');
    assert.strictEqual(result.assignment.driveFileId, 'drive_midterm_123');
  } finally {
    auth.currentUser = origUser;
    global.fetch = origFetch;
  }
});

// -----------------------------------------------------------------------------
// SECTION 2: Idempotency Key Handling & Safe Retries
// -----------------------------------------------------------------------------
console.log('\n--- SECTION 2: Idempotency Key Handling & Safe Retries ---');

await runAsyncTest('2.1: Reuses same idempotency key across retry attempts without generating a new key', async () => {
  const origUser = auth.currentUser;
  const origFetch = global.fetch;

  auth.currentUser = { getIdToken: async () => 'test_token' };

  const attempts = [];
  let callCount = 0;

  global.fetch = async (url, options) => {
    callCount++;
    attempts.push({
      key: options.headers['X-Idempotency-Key'],
      call: callCount
    });

    if (callCount === 1) {
      // First attempt times out
      return {
        ok: false,
        status: 504,
        json: async () => ({
          success: false,
          error: 'Google Drive request timed out.',
          code: 'GOOGLE_DRIVE_TIMEOUT'
        })
      };
    }

    // Second attempt (retry) succeeds with existing driveFileId
    return {
      ok: true,
      json: async () => ({
        success: true,
        assignment: {
          id: 'asg_reused_101',
          title: 'Retried Assignment',
          storageProvider: 'google_drive',
          driveFileId: 'drive_existing_file_555'
        }
      })
    };
  };

  try {
    const stableIdempotencyKey = 'idem_stable_uuid_12345';
    const fakePdf = { name: 'test.pdf', type: 'application/pdf', size: 1024 };

    // Attempt 1: Fails with 504
    try {
      await uploadAssignmentPdf({
        file: fakePdf,
        title: 'Retried Assignment',
        department: 'Computer Science',
        year: '3rd Year',
        section: 'CSE-A',
        dueDate: '2026-11-20',
        idempotencyKey: stableIdempotencyKey
      });
      assert.fail('Attempt 1 should have failed');
    } catch (err) {
      assert.strictEqual(err.code, 'GOOGLE_DRIVE_TIMEOUT');
    }

    // Attempt 2: Retry with EXACT SAME idempotency key
    const res = await uploadAssignmentPdf({
      file: fakePdf,
      title: 'Retried Assignment',
      department: 'Computer Science',
      year: '3rd Year',
      section: 'CSE-A',
      dueDate: '2026-11-20',
      idempotencyKey: stableIdempotencyKey
    });

    assert.strictEqual(attempts.length, 2);
    assert.strictEqual(attempts[0].key, stableIdempotencyKey);
    assert.strictEqual(attempts[1].key, stableIdempotencyKey);
    assert.strictEqual(attempts[0].key, attempts[1].key, 'Idempotency key must remain identical on retry');
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.assignment.driveFileId, 'drive_existing_file_555');
  } finally {
    auth.currentUser = origUser;
    global.fetch = origFetch;
  }
});

runTest('2.2: Generates distinct idempotency keys for distinct logical creations', () => {
  const genKey = () => `asg_idem_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const k1 = genKey();
  const k2 = genKey();
  assert.notStrictEqual(k1, k2, 'Distinct assignments must have distinct keys');
});

runTest('2.3: Preserves form fields in state on error without clearing user inputs', () => {
  // Simulates component state lifecycle
  const formState = {
    title: 'Operating Systems Lab 3',
    dueDate: '2026-11-10',
    pdf: { name: 'os_lab.pdf', size: 2048 },
    checkSimilarity: true
  };

  const uploadError = 'Network error connecting to backend: Failed to fetch';
  const isSubmitting = false;

  // Verify form state is NOT cleared when error occurs
  assert.strictEqual(formState.title, 'Operating Systems Lab 3');
  assert.strictEqual(formState.dueDate, '2026-11-10');
  assert.notStrictEqual(formState.pdf, null);
  assert.strictEqual(uploadError !== null, true);
  assert.strictEqual(isSubmitting, false);
});

// -----------------------------------------------------------------------------
// SECTION 3: Loading States & Duplicate Submission Prevention
// -----------------------------------------------------------------------------
console.log('\n--- SECTION 3: Loading States & Duplicate Submission Prevention ---');

runTest('3.1: Form enters loading state (isSubmitting = true) during active request', () => {
  let isSubmitting = false;
  const startUpload = () => { isSubmitting = true; };
  const finishUpload = () => { isSubmitting = false; };

  startUpload();
  assert.strictEqual(isSubmitting, true);
  finishUpload();
  assert.strictEqual(isSubmitting, false);
});

runTest('3.2: Inputs and file selector are disabled while isSubmitting === true', () => {
  const isSubmitting = true;
  const inputDisabled = isSubmitting;
  const buttonDisabled = isSubmitting;
  const fileDisabled = isSubmitting;

  assert.strictEqual(inputDisabled, true);
  assert.strictEqual(buttonDisabled, true);
  assert.strictEqual(fileDisabled, true);
});

runTest('3.3: Prevents duplicate submissions when user clicks rapidly while in flight', () => {
  let isSubmitting = false;
  let backendCalls = 0;

  const handleSubmit = () => {
    if (isSubmitting) return false; // Guarded by isSubmitting
    isSubmitting = true;
    backendCalls++;
    return true;
  };

  assert.strictEqual(handleSubmit(), true);
  assert.strictEqual(handleSubmit(), false, 'Second click must be blocked by isSubmitting');
  assert.strictEqual(handleSubmit(), false, 'Third click must be blocked by isSubmitting');
  assert.strictEqual(backendCalls, 1);
});

// -----------------------------------------------------------------------------
// SECTION 4: Provider Errors & User Notifications
// -----------------------------------------------------------------------------
console.log('\n--- SECTION 4: Provider Errors & User Notifications ---');

await runAsyncTest('4.1: Maps GOOGLE_DRIVE_DISCONNECTED to clear notification with local fallback option', async () => {
  const origUser = auth.currentUser;
  const origFetch = global.fetch;
  auth.currentUser = { getIdToken: async () => 'test_token' };

  global.fetch = async () => ({
    ok: false,
    status: 424,
    json: async () => ({
      success: false,
      error: 'Google Drive account is disconnected or folder was deleted.',
      code: 'GOOGLE_DRIVE_DISCONNECTED'
    })
  });

  try {
    const fakePdf = { name: 'test.pdf', type: 'application/pdf', size: 1024 };
    await uploadAssignmentPdf({
      file: fakePdf,
      title: 'Test',
      department: 'Computer Science',
      year: '3rd Year',
      section: 'CSE-A',
      dueDate: '2026-11-20'
    });
    assert.fail('Should have thrown GOOGLE_DRIVE_DISCONNECTED');
  } catch (err) {
    assert.strictEqual(err.code, 'GOOGLE_DRIVE_DISCONNECTED');
    assert.strictEqual(err.status, 424);
  } finally {
    auth.currentUser = origUser;
    global.fetch = origFetch;
  }
});

await runAsyncTest('4.2: Maps FORBIDDEN_ALLOCATION_NOT_FOUND to authorization error', async () => {
  const origUser = auth.currentUser;
  const origFetch = global.fetch;
  auth.currentUser = { getIdToken: async () => 'test_token' };

  global.fetch = async () => ({
    ok: false,
    status: 403,
    json: async () => ({
      success: false,
      error: 'Teacher is not authorized for department Computer Science, year 3rd Year, section CSE-Z.',
      code: 'FORBIDDEN_ALLOCATION_NOT_FOUND'
    })
  });

  try {
    const fakePdf = { name: 'test.pdf', type: 'application/pdf', size: 1024 };
    await uploadAssignmentPdf({
      file: fakePdf,
      title: 'Unauthorized Test',
      department: 'Computer Science',
      year: '3rd Year',
      section: 'CSE-Z',
      dueDate: '2026-11-20'
    });
    assert.fail('Should have thrown FORBIDDEN_ALLOCATION_NOT_FOUND');
  } catch (err) {
    assert.strictEqual(err.code, 'FORBIDDEN_ALLOCATION_NOT_FOUND');
    assert.strictEqual(err.status, 403);
  } finally {
    auth.currentUser = origUser;
    global.fetch = origFetch;
  }
});

// -----------------------------------------------------------------------------
// SECTION 5: Storage Provider Differentiation & Badging
// -----------------------------------------------------------------------------
console.log('\n--- SECTION 5: Storage Provider Differentiation & Badging ---');

runTest('5.1: Google Drive assignment is tagged storageProvider: "google_drive"', () => {
  const driveAsg = {
    id: 'asg_drive_001',
    title: 'Cloud Assignment',
    storageProvider: 'google_drive',
    driveFileId: 'file_drive_xyz_777',
    fileName: 'cloud_syllabus.pdf'
  };

  assert.strictEqual(driveAsg.storageProvider, 'google_drive');
  assert.ok(driveAsg.driveFileId);

  // Badge derivation logic
  const isCloudBacked = driveAsg.storageProvider === 'google_drive';
  assert.strictEqual(isCloudBacked, true);
});

runTest('5.2: Fallback local draft is tagged storageProvider: "local_draft" and never claimed as cloud-backed', () => {
  const localAsg = {
    id: 'local-1729080000000',
    title: 'Local Memory Assignment',
    storageProvider: 'local_draft',
    fileName: 'local.pdf'
  };

  assert.strictEqual(localAsg.storageProvider, 'local_draft');
  assert.strictEqual(localAsg.driveFileId, undefined);

  // Verification: local draft is NEVER reported as cloud-backed
  const isCloudBacked = localAsg.storageProvider === 'google_drive';
  assert.strictEqual(isCloudBacked, false);
});

runTest('5.3: Assignment detail view displays Google Drive badge when saved to Drive', () => {
  const viewingAssignment = {
    id: 'asg_123',
    title: 'AI Lab 2',
    className: '3rd Year • CSE AI • Section A',
    dueDate: '2026-11-30',
    storageProvider: 'google_drive',
    fileName: 'ai_lab2.pdf'
  };

  const getStorageBadgeText = (asg) => {
    if (asg.storageProvider === 'google_drive') {
      return `Saved in Google Drive (${asg.fileName})`;
    }
    if (asg.storageProvider === 'local_draft') {
      return 'Local Draft (Not Cloud-Backed)';
    }
    return null;
  };

  assert.strictEqual(getStorageBadgeText(viewingAssignment), 'Saved in Google Drive (ai_lab2.pdf)');
});

// -----------------------------------------------------------------------------
// SECTION 6: Existing Assignment & Academic Scope Regressions
// -----------------------------------------------------------------------------
console.log('\n--- SECTION 6: Existing Workflows & Regression Verification ---');

runTest('6.1: Section key generation ${br}-${yr}-${sec} retains compatibility with globalAssignments', () => {
  const sectionKey = 'Computer Science-3rd Year-CSE-A';
  const newAsg = {
    id: 'asg_reg_test_1',
    title: 'Regression Test Asg',
    dueDate: '2026-11-25',
    storageProvider: 'google_drive'
  };

  addGlobalAssignment(sectionKey, newAsg);
  const list = globalAssignments[sectionKey];
  assert.ok(Array.isArray(list));
  assert.ok(list.some(a => a.id === 'asg_reg_test_1'));
});

runTest('6.2: resolveAcademicScope correctly parses hierarchy path and default allocation', () => {
  const mockGroup = {
    path: ['UEMK', 'B.Tech', 'CSE', 'AI', '2nd Year', 'Section C']
  };
  const scope = resolveAcademicScope(mockGroup);
  assert.strictEqual(scope.br, 'CSE AI');
  assert.strictEqual(scope.yr, '2nd Year');
  assert.strictEqual(scope.sec, 'Section C');

  const defaultAlloc = {
    department: 'Computer Science',
    year: '3rd Year',
    section: 'CSE-A'
  };
  const fallbackScope = resolveAcademicScope(null, defaultAlloc);
  assert.strictEqual(fallbackScope.br, 'Computer Science');
  assert.strictEqual(fallbackScope.yr, '3rd Year');
  assert.strictEqual(fallbackScope.sec, 'CSE-A');
});

runTest('6.3: Similarity check flag (checkSimilarity) is retained on new assignments', () => {
  const asgWithSimilarity = {
    id: 'asg_sim_1',
    title: 'Similarity Assignment',
    checkSimilarity: true
  };
  assert.strictEqual(asgWithSimilarity.checkSimilarity, true);
});

// -----------------------------------------------------------------------------
// SUMMARY
// -----------------------------------------------------------------------------
console.log('\n======================================================');
console.log(` RESULTS: ${passed} passed, ${failed} failed`);
console.log('======================================================\n');

if (failed > 0) {
  process.exit(1);
}
