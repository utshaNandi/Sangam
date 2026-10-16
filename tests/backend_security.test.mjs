import assert from 'node:assert';
import crypto from 'node:crypto';
import http from 'node:http';

// Set test environment flags
process.env.TEST_MODE = 'true';
process.env.NODE_ENV = 'test';

// Import components under test
import {
  validateKey,
  encrypt,
  decrypt,
  serializeCipher
} from '../server/services/encryptionService.js';
import { createAuthMiddleware } from '../server/middleware/authMiddleware.js';
import { app, corsOptions, allowedOrigins } from '../server.js';

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
console.log(' SANGAM BACKEND SECURITY FOUNDATION — TEST SUITE');
console.log('======================================================\n');

// -----------------------------------------------------------------------------
// SECTION 1: AES-256-GCM Token Encryption Service Tests
// -----------------------------------------------------------------------------
console.log('--- SECTION 1: Token Encryption Service (AES-256-GCM) ---');

const validHexKey = crypto.randomBytes(32).toString('hex');
const validBase64Key = crypto.randomBytes(32).toString('base64');
const validBufferKey = crypto.randomBytes(32);

runTest('1.1: Validates 32-byte key formats (Hex, Base64, Buffer)', () => {
  const k1 = validateKey(validHexKey);
  assert.strictEqual(k1.length, 32);

  const k2 = validateKey(validBase64Key);
  assert.strictEqual(k2.length, 32);

  const k3 = validateKey(validBufferKey);
  assert.strictEqual(k3.length, 32);
});

runTest('1.2: Rejects invalid encryption key lengths (too short, too long, empty)', () => {
  assert.throws(() => validateKey(''), /TOKEN_ENCRYPTION_KEY is required/);
  assert.throws(() => validateKey(null), /TOKEN_ENCRYPTION_KEY is required/);
  assert.throws(() => validateKey('short_key_16_bytes'), /Invalid TOKEN_ENCRYPTION_KEY/);
  assert.throws(() => validateKey('a'.repeat(63)), /Invalid TOKEN_ENCRYPTION_KEY/);
  assert.throws(() => validateKey('a'.repeat(65)), /Invalid TOKEN_ENCRYPTION_KEY/);
});

runTest('1.3: Round-trip encryption and authenticated decryption', () => {
  const secretToken = 'ya29.a0AfH6SMD-oauth2-access-token-sample-value-12345';
  const cipher = encrypt(secretToken, validHexKey);

  assert.ok(cipher.encryptedData, 'Ciphertext should exist');
  assert.ok(cipher.iv, 'IV should exist');
  assert.ok(cipher.authTag, 'AuthTag should exist');
  assert.strictEqual(cipher.iv.length, 24, 'IV should be 12 bytes (24 hex characters)');
  assert.strictEqual(cipher.authTag.length, 32, 'AuthTag should be 16 bytes (32 hex characters)');

  const decrypted = decrypt(cipher, validHexKey);
  assert.strictEqual(decrypted, secretToken, 'Decrypted text must match original plaintext');
});

runTest('1.4: Guarantees unique IV and distinct ciphertext for identical plaintext', () => {
  const message = 'identical_refresh_token_value_abc_xyz';
  const ivs = new Set();
  const ciphertexts = new Set();

  for (let i = 0; i < 50; i++) {
    const result = encrypt(message, validHexKey);
    ivs.add(result.iv);
    ciphertexts.add(result.encryptedData);
  }

  assert.strictEqual(ivs.size, 50, 'Every single encryption must use a unique IV');
  assert.strictEqual(ciphertexts.size, 50, 'Every ciphertext must differ (semantic security)');
});

runTest('1.5: Rejects tampered ciphertext with authentication error', () => {
  const message = 'confidential_token';
  const cipher = encrypt(message, validHexKey);

  // Alter 1 character of ciphertext
  const tamperedHex = cipher.encryptedData.slice(0, -1) + (cipher.encryptedData.slice(-1) === 'a' ? 'b' : 'a');
  const tamperedCipher = { ...cipher, encryptedData: tamperedHex };

  assert.throws(() => {
    decrypt(tamperedCipher, validHexKey);
  }, /authentication tag mismatch or corrupted ciphertext/);
});

runTest('1.6: Rejects tampered authTag with authentication error', () => {
  const message = 'confidential_token';
  const cipher = encrypt(message, validHexKey);

  // Alter 1 character of authTag
  const tamperedTag = cipher.authTag.slice(0, -1) + (cipher.authTag.slice(-1) === 'a' ? 'b' : 'a');
  const tamperedCipher = { ...cipher, authTag: tamperedTag };

  assert.throws(() => {
    decrypt(tamperedCipher, validHexKey);
  }, /authentication tag mismatch or corrupted ciphertext/);
});

runTest('1.7: Rejects tampered IV with authentication error', () => {
  const message = 'confidential_token';
  const cipher = encrypt(message, validHexKey);

  // Alter 1 character of IV
  const tamperedIv = cipher.iv.slice(0, -1) + (cipher.iv.slice(-1) === 'a' ? 'b' : 'a');
  const tamperedCipher = { ...cipher, iv: tamperedIv };

  assert.throws(() => {
    decrypt(tamperedCipher, validHexKey);
  }, /authentication tag mismatch or corrupted ciphertext/);
});

runTest('1.8: Rejects decryption when using a different valid 32-byte key', () => {
  const anotherKey = crypto.randomBytes(32).toString('hex');
  const message = 'confidential_token';
  const cipher = encrypt(message, validHexKey);

  assert.throws(() => {
    decrypt(cipher, anotherKey);
  }, /authentication tag mismatch or corrupted ciphertext/);
});

runTest('1.9: Serialized string format ("iv:authTag:encryptedData") round-trip', () => {
  const token = 'M.R3_BAY.sample_microsoft_refresh_token_string';
  const cipher = encrypt(token, validHexKey);
  const serialized = serializeCipher(cipher);

  assert.strictEqual(typeof serialized, 'string');
  assert.strictEqual(serialized.split(':').length, 3);

  const decrypted = decrypt(serialized, validHexKey);
  assert.strictEqual(decrypted, token);
});

// -----------------------------------------------------------------------------
// SECTION 2: Firebase Authentication ID Token Middleware Tests
// -----------------------------------------------------------------------------
console.log('\n--- SECTION 2: Firebase Auth Verification Middleware ---');

function mockRes() {
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    }
  };
  return res;
}

await runAsyncTest('2.1: Rejects request with missing Authorization header (401)', async () => {
  const middleware = createAuthMiddleware({});
  const req = { headers: {} };
  const res = mockRes();
  let nextCalled = false;

  await middleware(req, res, () => { nextCalled = true; });

  assert.strictEqual(res.statusCode, 401);
  assert.strictEqual(res.body.success, false);
  assert.ok(res.body.error.includes('Missing Authorization header'));
  assert.strictEqual(nextCalled, false);
});

await runAsyncTest('2.2: Rejects malformed Authorization header (missing Bearer prefix) (401)', async () => {
  const middleware = createAuthMiddleware({});
  const req = { headers: { authorization: 'Basic 123456789' } };
  const res = mockRes();
  let nextCalled = false;

  await middleware(req, res, () => { nextCalled = true; });

  assert.strictEqual(res.statusCode, 401);
  assert.strictEqual(res.body.success, false);
  assert.ok(res.body.error.includes('Malformed Authorization header'));
  assert.strictEqual(nextCalled, false);
});

await runAsyncTest('2.3: Rejects empty token after Bearer (401)', async () => {
  const middleware = createAuthMiddleware({});
  const req = { headers: { authorization: 'Bearer    ' } };
  const res = mockRes();
  let nextCalled = false;

  await middleware(req, res, () => { nextCalled = true; });

  assert.strictEqual(res.statusCode, 401);
  assert.strictEqual(res.body.success, false);
  assert.ok(res.body.error.includes('Empty token provided'));
  assert.strictEqual(nextCalled, false);
});

await runAsyncTest('2.4: Rejects expired token with auth/id-token-expired (401)', async () => {
  const mockAuth = {
    verifyIdToken: async () => {
      const err = new Error('Token expired');
      err.code = 'auth/id-token-expired';
      throw err;
    }
  };
  const middleware = createAuthMiddleware(mockAuth);
  const req = { headers: { authorization: 'Bearer expired.token.xyz' } };
  const res = mockRes();
  let nextCalled = false;

  await middleware(req, res, () => { nextCalled = true; });

  assert.strictEqual(res.statusCode, 401);
  assert.strictEqual(res.body.code, 'auth/id-token-expired');
  assert.strictEqual(nextCalled, false);
});

await runAsyncTest('2.5: Rejects revoked token with auth/id-token-revoked (401)', async () => {
  const mockAuth = {
    verifyIdToken: async () => {
      const err = new Error('Token revoked');
      err.code = 'auth/id-token-revoked';
      throw err;
    }
  };
  const middleware = createAuthMiddleware(mockAuth);
  const req = { headers: { authorization: 'Bearer revoked.token.xyz' } };
  const res = mockRes();
  let nextCalled = false;

  await middleware(req, res, () => { nextCalled = true; });

  assert.strictEqual(res.statusCode, 401);
  assert.strictEqual(res.body.code, 'auth/id-token-revoked');
  assert.strictEqual(nextCalled, false);
});

await runAsyncTest('2.6: Rejects invalid signature / token format (401)', async () => {
  const mockAuth = {
    verifyIdToken: async () => {
      const err = new Error('Decoding Firebase ID token failed');
      err.code = 'auth/invalid-id-token';
      throw err;
    }
  };
  const middleware = createAuthMiddleware(mockAuth);
  const req = { headers: { authorization: 'Bearer bad.token.signature' } };
  const res = mockRes();
  let nextCalled = false;

  await middleware(req, res, () => { nextCalled = true; });

  assert.strictEqual(res.statusCode, 401);
  assert.strictEqual(res.body.code, 'auth/invalid-id-token');
  assert.strictEqual(nextCalled, false);
});

await runAsyncTest('2.7: Successfully attaches verified UID & claims for valid token', async () => {
  const mockAuth = {
    verifyIdToken: async (token, checkRevoked) => {
      assert.strictEqual(checkRevoked, true, 'verifyIdToken must be called with checkRevoked=true');
      return {
        uid: 'teacher_verified_123',
        email: 'prof.smith@univ.edu',
        role: 'faculty',
        auth_time: Math.floor(Date.now() / 1000)
      };
    }
  };
  const middleware = createAuthMiddleware(mockAuth);
  const req = { headers: { authorization: 'Bearer valid.jwt.token' } };
  const res = mockRes();
  let nextCalled = false;

  await middleware(req, res, () => { nextCalled = true; });

  assert.strictEqual(nextCalled, true);
  assert.strictEqual(req.userId, 'teacher_verified_123');
  assert.strictEqual(req.userEmail, 'prof.smith@univ.edu');
  assert.strictEqual(req.user.role, 'faculty');
});

await runAsyncTest('2.8: Anti-spoofing rejects request when body UID mismatches token (403)', async () => {
  const mockAuth = {
    verifyIdToken: async () => ({
      uid: 'actual_user_123',
      email: 'user@univ.edu'
    })
  };
  const middleware = createAuthMiddleware(mockAuth);
  const req = {
    headers: { authorization: 'Bearer valid.token' },
    body: { facultyUid: 'impersonated_victim_999' }
  };
  const res = mockRes();
  let nextCalled = false;

  await middleware(req, res, () => { nextCalled = true; });

  assert.strictEqual(res.statusCode, 403);
  assert.strictEqual(res.body.success, false);
  assert.ok(res.body.error.includes('Identity mismatch'));
  assert.strictEqual(nextCalled, false);
});

await runAsyncTest('2.9: Anti-spoofing allows request when body UID matches token', async () => {
  const mockAuth = {
    verifyIdToken: async () => ({
      uid: 'teacher_123',
      email: 'teacher@univ.edu'
    })
  };
  const middleware = createAuthMiddleware(mockAuth);
  const req = {
    headers: { authorization: 'Bearer valid.token' },
    body: { facultyUid: 'teacher_123' }
  };
  const res = mockRes();
  let nextCalled = false;

  await middleware(req, res, () => { nextCalled = true; });

  assert.strictEqual(nextCalled, true);
});

// -----------------------------------------------------------------------------
// SECTION 3 & 4: Live HTTP Server Tests (CORS, Health & Regression)
// -----------------------------------------------------------------------------
console.log('\n--- SECTION 3 & 4: Live HTTP Server, CORS & Similarity Regression ---');

// Start test server on ephemeral port
const testServer = http.createServer(app);
await new Promise((resolve) => testServer.listen(0, '127.0.0.1', resolve));
const { port } = testServer.address();
const baseUrl = `http://127.0.0.1:${port}`;

try {
  await runAsyncTest('3.1: CORS allows configured origin (http://localhost:5173)', async () => {
    const res = await fetch(`${baseUrl}/api/health`, {
      headers: { Origin: 'http://localhost:5173' }
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get('access-control-allow-origin'), 'http://localhost:5173');
    assert.strictEqual(res.headers.get('access-control-allow-credentials'), 'true');
  });

  await runAsyncTest('3.2: CORS allows requests with no Origin header (curl, server-to-server)', async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.status, 'healthy');
  });

  await runAsyncTest('3.3: CORS rejects unauthorized origin with 403 Forbidden', async () => {
    const res = await fetch(`${baseUrl}/api/health`, {
      headers: { Origin: 'http://unauthorized-phishing.org' }
    });
    assert.strictEqual(res.status, 403);
    const data = await res.json();
    assert.strictEqual(data.success, false);
    assert.ok(data.error.includes('CORS error'));
  });

  await runAsyncTest('4.1: Health check endpoint /api/health responds with configuration state', async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.status, 'healthy');
    assert.ok('timestamp' in data);
    assert.ok('authConfigured' in data);
    assert.ok('encryptionConfigured' in data);
  });

  await runAsyncTest('4.2: Protected /api/auth/verify endpoint requires valid ID token', async () => {
    const res = await fetch(`${baseUrl}/api/auth/verify`);
    assert.strictEqual(res.status, 401);
    const data = await res.json();
    assert.strictEqual(data.success, false);
    assert.ok(data.error.includes('Missing Authorization header'));
  });

  await runAsyncTest('4.3: Regression test: POST /api/similarity processes PDF multipart upload and unlinks files', async () => {
    const formData = new FormData();
    const pdfBlobA = new Blob(['%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF'], { type: 'application/pdf' });
    const pdfBlobB = new Blob(['%PDF-1.4\n2 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF'], { type: 'application/pdf' });

    formData.append('fileA', pdfBlobA, 'student_submission_a.pdf');
    formData.append('fileB', pdfBlobB, 'student_submission_b.pdf');

    const res = await fetch(`${baseUrl}/api/similarity`, {
      method: 'POST',
      body: formData
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(data.report, 'Report should be returned');
    assert.ok('overallSimilarity' in data.report);
    assert.ok('recommendation' in data.report);
  });
} finally {
  await new Promise((resolve) => testServer.close(resolve));
}

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
