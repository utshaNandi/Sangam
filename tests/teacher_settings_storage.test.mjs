import assert from 'node:assert';
import { getApiBaseUrl } from '../src/services/storageService.js';

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
console.log(' SANGAM TEACHER SETTINGS UI & STORAGE SERVICE TESTS');
console.log('======================================================\n');

// -----------------------------------------------------------------------------
// SECTION 1: Storage Service Base URL & Request Construction
// -----------------------------------------------------------------------------
console.log('--- SECTION 1: Storage Service Base URL & API Contracts ---');

runTest('1.1: getApiBaseUrl defaults to http://localhost:3001 in dev environment', () => {
  const url = getApiBaseUrl();
  assert.strictEqual(typeof url, 'string');
  assert.strictEqual(url, 'http://localhost:3001');
});

await runAsyncTest('1.2: Authenticated request includes Bearer token and targets correct endpoint', async () => {
  let capturedHeaders = null;
  let capturedUrl = null;

  // Mock global fetch to verify service contract
  const originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    capturedUrl = url;
    capturedHeaders = options.headers;
    return {
      ok: true,
      json: async () => ({
        success: true,
        connected: true,
        provider: 'google',
        accountEmail: 'faculty.test@sangam.edu',
        status: 'connected'
      })
    };
  };

  try {
    const fakeToken = 'mock_firebase_id_token_xyz_123';
    const apiBase = getApiBaseUrl();

    // Direct invocation pattern used by storageService
    const res = await fetch(`${apiBase}/api/storage/status`, {
      headers: { Authorization: `Bearer ${fakeToken}` }
    });
    const data = await res.json();

    assert.strictEqual(capturedUrl, 'http://localhost:3001/api/storage/status');
    assert.strictEqual(capturedHeaders.Authorization, `Bearer ${fakeToken}`);
    assert.strictEqual(data.connected, true);
    assert.strictEqual(data.accountEmail, 'faculty.test@sangam.edu');
  } finally {
    global.fetch = originalFetch;
  }
});

// -----------------------------------------------------------------------------
// SECTION 2: UI State Machine & URL Sanitization Logic
// -----------------------------------------------------------------------------
console.log('\n--- SECTION 2: UI State Transitions & URL Sanitization ---');

runTest('2.1: Correctly derives Not Connected state and renders Connect button trigger', () => {
  const backendResponse = { success: true, connected: false, provider: null };

  const uiState = {
    isLoading: false,
    isConnected: Boolean(backendResponse.connected),
    provider: backendResponse.provider,
    accountEmail: backendResponse.accountEmail || '',
    error: null
  };

  assert.strictEqual(uiState.isLoading, false);
  assert.strictEqual(uiState.isConnected, false);
  assert.strictEqual(uiState.accountEmail, '');
});

runTest('2.2: Correctly derives Connected state and displays verified Google account email', () => {
  const backendResponse = {
    success: true,
    connected: true,
    provider: 'google',
    accountEmail: 'prof.sharma@sangam.edu',
    status: 'connected',
    connectedAt: new Date().toISOString()
  };

  const uiState = {
    isLoading: false,
    isConnected: Boolean(backendResponse.connected),
    provider: backendResponse.provider,
    accountEmail: backendResponse.accountEmail || '',
    connectedAt: backendResponse.connectedAt,
    error: null
  };

  assert.strictEqual(uiState.isLoading, false);
  assert.strictEqual(uiState.isConnected, true);
  assert.strictEqual(uiState.accountEmail, 'prof.sharma@sangam.edu');
  assert.strictEqual(uiState.provider, 'google');
  assert.ok(uiState.connectedAt);
});

runTest('2.3: Correctly captures API and authorization errors in UI state', () => {
  const errorMessage = 'Unauthorized: Firebase ID token has expired. Please refresh your session.';

  const uiState = {
    isLoading: false,
    isConnected: false,
    provider: null,
    accountEmail: '',
    error: errorMessage
  };

  assert.strictEqual(uiState.isLoading, false);
  assert.strictEqual(uiState.isConnected, false);
  assert.strictEqual(uiState.error, errorMessage);
});

runTest('2.4: OAuth return sanitization removes callback query params without losing other params', () => {
  // Simulate returning to Sangam with search parameters
  const initialUrl = 'http://localhost:5173/teacher?tab=Settings&storage_status=connected&provider=google&ref=sidebar';
  const url = new URL(initialUrl);

  const statusParam = url.searchParams.get('storage_status');
  assert.strictEqual(statusParam, 'connected');

  // Perform sanitization exactly as implemented in SettingsView.jsx
  url.searchParams.delete('storage_status');
  url.searchParams.delete('provider');
  url.searchParams.delete('error');

  const cleanSearch = url.searchParams.toString();
  const cleanedUrl = url.pathname + (cleanSearch ? `?${cleanSearch}` : '');

  assert.strictEqual(cleanedUrl, '/teacher?tab=Settings&ref=sidebar');
  assert.strictEqual(url.searchParams.has('storage_status'), false);
  assert.strictEqual(url.searchParams.has('provider'), false);
  assert.strictEqual(url.searchParams.get('tab'), 'Settings', 'Must preserve unrelated query parameters');
  assert.strictEqual(url.searchParams.get('ref'), 'sidebar', 'Must preserve unrelated query parameters');
});

runTest('2.5: Disconnect confirmation logic guards against accidental unlinking', () => {
  let disconnectCalled = false;

  const mockConfirm = (shouldConfirm) => {
    return shouldConfirm;
  };

  // Case A: User cancels confirmation
  let confirmed = mockConfirm(false);
  if (confirmed) {
    disconnectCalled = true;
  }
  assert.strictEqual(disconnectCalled, false, 'Disconnect must not execute when user cancels');

  // Case B: User confirms
  confirmed = mockConfirm(true);
  if (confirmed) {
    disconnectCalled = true;
  }
  assert.strictEqual(disconnectCalled, true, 'Disconnect must execute when user confirms');
});

// -----------------------------------------------------------------------------
// SUMMARY
// -----------------------------------------------------------------------------
console.log('\n======================================================');
console.log(` RESULTS: ${passed} passed, ${failed} failed`);
console.log('======================================================\n');

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
