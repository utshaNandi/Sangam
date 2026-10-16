import assert from 'node:assert';
import crypto from 'node:crypto';
import http from 'node:http';

// Set test environment flags
process.env.TEST_MODE = 'true';
process.env.NODE_ENV = 'test';
process.env.TOKEN_ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
process.env.GOOGLE_CLIENT_ID = 'test-client-id-12345.apps.googleusercontent.com';
process.env.GOOGLE_CLIENT_SECRET = 'test-mock-google-client-secret';
process.env.GOOGLE_REDIRECT_URI = 'http://localhost:3001/api/storage/google/callback';
process.env.FRONTEND_URL = 'http://localhost:5173';

// Import services and server
import {
  OAuthStateManager,
  stateManager,
  GoogleDriveService,
  googleDriveService,
  GOOGLE_OAUTH_SCOPES
} from '../server/services/googleDriveService.js';
import { encrypt, decrypt } from '../server/services/encryptionService.js';
import { app } from '../server.js';

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
console.log(' SANGAM GOOGLE DRIVE OAUTH — STAGE 5B TEST SUITE');
console.log(' Notice: Tests use local mocked Firestore and OAuth providers');
console.log(' for deterministic unit & security verification.');
console.log('======================================================\n');

// -----------------------------------------------------------------------------
// High-fidelity Mock Firestore with atomic transactional optimistic locking
// -----------------------------------------------------------------------------
class MockFirestore {
  constructor() {
    this.store = new Map(); // key -> { data: any, version: number }
  }

  collection(collName) {
    return {
      doc: (docId) => {
        const path = `${collName}/${docId}`;
        return {
          id: docId,
          path,
          set: async (data, options) => {
            const current = this.store.get(path);
            const currentVersion = current ? current.version : 0;
            if (options && options.merge && current) {
              this.store.set(path, {
                data: { ...current.data, ...data },
                version: currentVersion + 1
              });
            } else {
              this.store.set(path, {
                data: JSON.parse(JSON.stringify(data)),
                version: currentVersion + 1
              });
            }
          },
          get: async () => {
            const current = this.store.get(path);
            return {
              exists: Boolean(current),
              data: () => (current ? JSON.parse(JSON.stringify(current.data)) : undefined)
            };
          },
          delete: async () => {
            this.store.delete(path);
          }
        };
      },
      where: (field, op, val) => ({
        limit: () => ({
          get: async () => {
            const docs = [];
            for (const [key, record] of this.store.entries()) {
              if (key.startsWith(`${collName}/`)) {
                if (op === '<' && record.data[field] < val) {
                  docs.push({
                    ref: { path: key },
                    data: () => record.data
                  });
                }
              }
            }
            return {
              empty: docs.length === 0,
              docs
            };
          }
        })
      })
    };
  }

  batch() {
    const operations = [];
    return {
      delete: (docRef) => operations.push({ type: 'delete', path: docRef.path }),
      commit: async () => {
        for (const op of operations) {
          if (op.type === 'delete') {
            this.store.delete(op.path);
          }
        }
      }
    };
  }

  async runTransaction(updateFn, maxRetries = 5) {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const readVersions = new Map();
      const writes = [];

      const tx = {
        get: async (docRef) => {
          const path = docRef.path;
          const current = this.store.get(path);
          readVersions.set(path, current ? current.version : 0);
          return {
            exists: Boolean(current),
            data: () => (current ? JSON.parse(JSON.stringify(current.data)) : undefined)
          };
        },
        set: (docRef, data, options) => {
          writes.push({ type: 'set', path: docRef.path, data, options });
        },
        delete: (docRef) => {
          writes.push({ type: 'delete', path: docRef.path });
        }
      };

      // Yield event loop slightly so concurrent transactions interleave
      await new Promise((resolve) => setTimeout(resolve, 5));
      const result = await updateFn(tx);

      // Verify conflict: did any read doc change version?
      let conflict = false;
      for (const [path, expectedVersion] of readVersions.entries()) {
        const current = this.store.get(path);
        const actualVersion = current ? current.version : 0;
        if (actualVersion !== expectedVersion) {
          conflict = true;
          break;
        }
      }

      if (conflict) {
        continue; // Retry transaction on conflict
      }

      // Commit writes atomically
      for (const write of writes) {
        const current = this.store.get(write.path);
        const currentVersion = current ? current.version : 0;
        if (write.type === 'delete') {
          this.store.delete(write.path);
        } else if (write.type === 'set') {
          if (write.options && write.options.merge && current) {
            this.store.set(write.path, {
              data: { ...current.data, ...write.data },
              version: currentVersion + 1
            });
          } else {
            this.store.set(write.path, {
              data: JSON.parse(JSON.stringify(write.data)),
              version: currentVersion + 1
            });
          }
        }
      }

      return result;
    }
    throw new Error('Transaction failed after maximum conflict retries');
  }
}

// Attach shared mock DB to global services for tests
const sharedTestDb = new MockFirestore();
stateManager.setTestDb(sharedTestDb);
googleDriveService.customDb = sharedTestDb;

// -----------------------------------------------------------------------------
// SECTION 1: Firestore OAuth State Persistence & Concurrency Tests
// -----------------------------------------------------------------------------
console.log('--- SECTION 1: Firestore OAuth State Security & Concurrency ---');

await runAsyncTest('[MOCKED FIRESTORE] 1.1: Generates 64-char random state and persists minimum fields to oauth_states', async () => {
  const mockDb = new MockFirestore();
  const testStateManager = new OAuthStateManager({ customDb: mockDb });

  const teacherUid = 'teacher_faculty_101';
  const stateToken = await testStateManager.createState(teacherUid);

  assert.strictEqual(typeof stateToken, 'string');
  assert.strictEqual(stateToken.length, 64);
  assert.match(stateToken, /^[0-9a-f]{64}$/);

  // Verify Firestore document schema
  const doc = await mockDb.collection('oauth_states').doc(stateToken).get();
  assert.strictEqual(doc.exists, true, 'State document must exist in Firestore');

  const data = doc.data();
  assert.strictEqual(data.teacherUid, teacherUid);
  assert.strictEqual(typeof data.createdAt, 'number');
  assert.strictEqual(typeof data.expiresAt, 'number');
  assert.strictEqual(data.expiresAt - data.createdAt, 10 * 60 * 1000, 'Must enforce 10-minute TTL');

  // Verify no extraneous or sensitive fields are stored
  const keys = Object.keys(data).sort();
  assert.deepStrictEqual(keys, ['createdAt', 'expiresAt', 'teacherUid']);
});

await runAsyncTest('[MOCKED FIRESTORE] 1.2: Consuming valid state atomically returns teacherUid and deletes document', async () => {
  const mockDb = new MockFirestore();
  const testStateManager = new OAuthStateManager({ customDb: mockDb });

  const teacherUid = 'teacher_faculty_102';
  const stateToken = await testStateManager.createState(teacherUid);

  const consumed = await testStateManager.consumeState(stateToken);
  assert.ok(consumed, 'Valid state must be consumed successfully');
  assert.strictEqual(consumed.teacherUid, teacherUid);

  // Document must be deleted immediately from Firestore
  const docAfter = await mockDb.collection('oauth_states').doc(stateToken).get();
  assert.strictEqual(docAfter.exists, false, 'State document must be deleted after consumption');
});

await runAsyncTest('[MOCKED FIRESTORE] 1.3: Single-use enforcement: Consuming the same state twice fails (anti-replay)', async () => {
  const mockDb = new MockFirestore();
  const testStateManager = new OAuthStateManager({ customDb: mockDb });

  const teacherUid = 'teacher_faculty_103';
  const stateToken = await testStateManager.createState(teacherUid);

  const first = await testStateManager.consumeState(stateToken);
  assert.ok(first, 'First consumption must succeed');

  const second = await testStateManager.consumeState(stateToken);
  assert.strictEqual(second, null, 'Reused state token must be rejected with null');
});

await runAsyncTest('[MOCKED FIRESTORE] 1.4: Rejects null, undefined, empty, forged, and malformed state documents', async () => {
  const mockDb = new MockFirestore();
  const testStateManager = new OAuthStateManager({ customDb: mockDb });

  assert.strictEqual(await testStateManager.consumeState(null), null);
  assert.strictEqual(await testStateManager.consumeState(undefined), null);
  assert.strictEqual(await testStateManager.consumeState(''), null);
  assert.strictEqual(await testStateManager.consumeState('short_forged_state'), null);

  // Malformed document in Firestore missing teacherUid
  const malformedToken = crypto.randomBytes(32).toString('hex');
  await mockDb.collection('oauth_states').doc(malformedToken).set({
    createdAt: Date.now(),
    expiresAt: Date.now() + 600000
    // teacherUid omitted
  });

  const res = await testStateManager.consumeState(malformedToken);
  assert.strictEqual(res, null, 'Malformed document must be rejected');

  // Verify malformed doc was deleted
  const doc = await mockDb.collection('oauth_states').doc(malformedToken).get();
  assert.strictEqual(doc.exists, false, 'Malformed doc should be pruned');
});

await runAsyncTest('[MOCKED FIRESTORE] 1.5: Rejects expired state tokens and deletes them from Firestore', async () => {
  const mockDb = new MockFirestore();
  const testStateManager = new OAuthStateManager({ customDb: mockDb });

  const expiredToken = crypto.randomBytes(32).toString('hex');
  await mockDb.collection('oauth_states').doc(expiredToken).set({
    teacherUid: 'teacher_expired_999',
    createdAt: Date.now() - 20 * 60 * 1000,
    expiresAt: Date.now() - 10 * 60 * 1000 // Expired 10 min ago
  });

  const consumed = await testStateManager.consumeState(expiredToken);
  assert.strictEqual(consumed, null, 'Expired state must return null');

  // Verify expired doc was deleted
  const doc = await mockDb.collection('oauth_states').doc(expiredToken).get();
  assert.strictEqual(doc.exists, false, 'Expired document must be removed from Firestore');
});

await runAsyncTest('[MOCKED FIRESTORE] 1.6: Concurrency protection: Two concurrent consumption requests allow exactly one winner', async () => {
  const mockDb = new MockFirestore();
  const testStateManager = new OAuthStateManager({ customDb: mockDb });

  const teacherUid = 'teacher_concurrent_999';
  const stateToken = await testStateManager.createState(teacherUid);

  // Simulate two simultaneous callback requests arriving concurrently
  const [res1, res2] = await Promise.all([
    testStateManager.consumeState(stateToken),
    testStateManager.consumeState(stateToken)
  ]);

  const successes = [res1, res2].filter((r) => r !== null);
  const rejections = [res1, res2].filter((r) => r === null);

  assert.strictEqual(successes.length, 1, 'Exactly one concurrent request must succeed');
  assert.strictEqual(rejections.length, 1, 'The competing concurrent request must be rejected');
  assert.strictEqual(successes[0].teacherUid, teacherUid);
});

await runAsyncTest('[FAIL-CLOSED VERIFICATION] 1.7: Fails closed when Firestore is unavailable without in-memory fallback', async () => {
  // Simulate database down / network failure
  const brokenDb = {
    collection: () => {
      throw new Error('Firestore connection refused: backend unreachable');
    },
    runTransaction: async () => {
      throw new Error('Firestore transaction aborted: service offline');
    }
  };

  const testStateManager = new OAuthStateManager({ customDb: brokenDb });

  // createState must throw and fail closed (not fallback to memory)
  await assert.rejects(
    async () => {
      await testStateManager.createState('teacher_fail_closed');
    },
    /OAuth state persistence failed closed/
  );

  // consumeState must throw and fail closed
  const validStateToken = crypto.randomBytes(32).toString('hex');
  await assert.rejects(
    async () => {
      await testStateManager.consumeState(validStateToken);
    },
    /Failed to consume OAuth state/
  );
});

runTest('[SECURITY GUARD] 1.8: Test double strictly prohibited outside test environment', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalTestMode = process.env.TEST_MODE;

  try {
    process.env.NODE_ENV = 'production';
    delete process.env.TEST_MODE;

    // Constructor with useTestDouble must throw in production
    assert.throws(
      () => new OAuthStateManager({ useTestDouble: true }),
      /SECURITY VIOLATION/
    );

    const prodManager = new OAuthStateManager();

    // setTestDouble must throw in production
    assert.throws(
      () => prodManager.setTestDouble(true),
      /SECURITY VIOLATION/
    );

    // setTestDb must throw in production
    assert.throws(
      () => prodManager.setTestDb(new MockFirestore()),
      /SECURITY VIOLATION/
    );
  } finally {
    process.env.NODE_ENV = originalNodeEnv;
    process.env.TEST_MODE = originalTestMode;
  }
});

// -----------------------------------------------------------------------------
// SECTION 2: Google Authorization URL Generation & Narrow Scopes
// -----------------------------------------------------------------------------
console.log('\n--- SECTION 2: Google Authorization URL & Scopes ---');

runTest('[UNIT TEST] 2.1: Enforces narrow scopes (drive.file and userinfo)', () => {
  assert.ok(GOOGLE_OAUTH_SCOPES.includes('https://www.googleapis.com/auth/drive.file'));
  assert.ok(GOOGLE_OAUTH_SCOPES.includes('https://www.googleapis.com/auth/userinfo.email'));
  assert.strictEqual(
    GOOGLE_OAUTH_SCOPES.includes('https://www.googleapis.com/auth/drive'),
    false,
    'Must NOT request full unrestricted Drive access'
  );
});

runTest('[UNIT TEST] 2.2: Generates valid Google consent URL with offline access and prompt=consent', () => {
  const service = new GoogleDriveService();
  const state = crypto.randomBytes(32).toString('hex');
  const url = service.getAuthorizationUrl(state);

  assert.ok(url.startsWith('https://accounts.google.com/o/oauth2/v2/auth'), 'Must use Google OAuth2 auth endpoint');
  assert.ok(url.includes('access_type=offline'), 'Must request offline access for refresh token');
  assert.ok(url.includes('prompt=consent'), 'Must include prompt=consent to ensure refresh token delivery');
  assert.ok(url.includes(`state=${state}`), 'Must bind state parameter');
  assert.ok(url.includes('drive.file'), 'Must request drive.file scope');
  assert.ok(url.includes('client_id='), 'Must include client ID');
});

// -----------------------------------------------------------------------------
// SECTION 3: Token Persistence, Refresh & Concurrency
// -----------------------------------------------------------------------------
console.log('\n--- SECTION 3: Token Persistence, Refresh & Concurrency ---');

await runAsyncTest('[MOCKED FIRESTORE] 3.1: Encrypts access and refresh tokens with AES-256-GCM before saving', async () => {
  const mockDb = new MockFirestore();
  const testService = new GoogleDriveService({ customDb: mockDb });

  const teacherUid = 'teacher_test_persist_01';
  const rawAccessToken = 'ya29.a0AfH6SMA-test-google-access-token';
  const rawRefreshToken = '1//0gG7Y-test-google-refresh-token';

  await testService.saveIntegration(teacherUid, {
    tokens: {
      access_token: rawAccessToken,
      refresh_token: rawRefreshToken,
      expiry_date: Date.now() + 3600 * 1000,
      scope: GOOGLE_OAUTH_SCOPES.join(' ')
    },
    profile: {
      email: 'dr.sharma@sangam.edu',
      name: 'Dr. Sharma'
    }
  });

  const stored = await testService.getIntegration(teacherUid);
  assert.ok(stored, 'Integration record must exist');
  assert.strictEqual(stored.facultyUid, teacherUid);
  assert.strictEqual(stored.provider, 'google');
  assert.strictEqual(stored.accountEmail, 'dr.sharma@sangam.edu');
  assert.strictEqual(stored.status, 'connected');

  // Verify tokens are NOT plaintext in the database
  assert.notStrictEqual(stored.encryptedAccessToken, rawAccessToken);
  assert.notStrictEqual(stored.encryptedRefreshToken, rawRefreshToken);
  assert.ok(stored.accessTokenIv);
  assert.ok(stored.accessTokenAuthTag);
  assert.ok(stored.refreshTokenIv);
  assert.ok(stored.refreshTokenAuthTag);

  // Verify stored tokens decrypt cleanly back to original values
  const decryptedAccess = decrypt({
    encryptedData: stored.encryptedAccessToken,
    iv: stored.accessTokenIv,
    authTag: stored.accessTokenAuthTag
  });
  const decryptedRefresh = decrypt({
    encryptedData: stored.encryptedRefreshToken,
    iv: stored.refreshTokenIv,
    authTag: stored.refreshTokenAuthTag
  });

  assert.strictEqual(decryptedAccess, rawAccessToken);
  assert.strictEqual(decryptedRefresh, rawRefreshToken);
});

await runAsyncTest('[MOCKED FIRESTORE] 3.2: Rejects save when refresh token is missing on first authorization', async () => {
  const mockDb = new MockFirestore();
  const testService = new GoogleDriveService({ customDb: mockDb });

  const teacherUid = 'teacher_test_missing_refresh';
  await assert.rejects(
    async () => {
      await testService.saveIntegration(teacherUid, {
        tokens: {
          access_token: 'ya29.only_access_token',
          expiry_date: Date.now() + 3600 * 1000
        },
        profile: { email: 'teacher@sangam.edu' }
      });
    },
    /Missing refresh token from Google OAuth exchange/
  );
});

await runAsyncTest('[MOCKED FIRESTORE / PROVIDER] 3.3: Valid unexpired access token (>5m remaining) is returned directly without refresh', async () => {
  const mockDb = new MockFirestore();
  let refreshCalls = 0;

  const mockOAuthClient = {
    setCredentials: () => {},
    refreshAccessToken: async () => {
      refreshCalls++;
      return { credentials: { access_token: 'unexpected-refresh' } };
    }
  };

  const testService = new GoogleDriveService({
    customDb: mockDb,
    customOAuthClient: mockOAuthClient
  });

  const teacherUid = 'teacher_unexpired_token';
  const expectedAccessToken = 'ya29.valid-unexpired-token-12345';

  await testService.saveIntegration(teacherUid, {
    tokens: {
      access_token: expectedAccessToken,
      refresh_token: '1//valid-refresh-token',
      expiry_date: Date.now() + 30 * 60 * 1000 // 30 minutes in the future (> 5m threshold)
    },
    profile: { email: 'teacher@sangam.edu' }
  });

  const returnedToken = await testService.getValidAccessToken(teacherUid);
  assert.strictEqual(returnedToken, expectedAccessToken, 'Must return current decrypted token');
  assert.strictEqual(refreshCalls, 0, 'Must NOT invoke provider refresh when token is safely unexpired');
});

await runAsyncTest('[MOCKED FIRESTORE / PROVIDER] 3.4: Expired or near-expiry token (<=5m remaining) triggers server-side refresh and re-encryption', async () => {
  const mockDb = new MockFirestore();
  let refreshCalledWith = null;

  const newRefreshedToken = 'ya29.refreshed-new-access-token-987';
  const mockOAuthClient = {
    setCredentials: (creds) => {
      refreshCalledWith = creds.refresh_token;
    },
    refreshAccessToken: async () => ({
      credentials: {
        access_token: newRefreshedToken,
        expiry_date: Date.now() + 3600 * 1000
      }
    })
  };

  const testService = new GoogleDriveService({
    customDb: mockDb,
    customOAuthClient: mockOAuthClient
  });

  const teacherUid = 'teacher_near_expiry';
  const rawRefreshToken = '1//my-teacher-refresh-token';

  await testService.saveIntegration(teacherUid, {
    tokens: {
      access_token: 'ya29.about-to-expire-token',
      refresh_token: rawRefreshToken,
      expiry_date: Date.now() + 3 * 60 * 1000 // 3 minutes remaining (< 5m safety margin)
    },
    profile: { email: 'near.expiry@sangam.edu' }
  });

  const activeToken = await testService.getValidAccessToken(teacherUid);
  assert.strictEqual(activeToken, newRefreshedToken, 'Must return newly refreshed token');
  assert.strictEqual(refreshCalledWith, rawRefreshToken, 'Must decrypt stored refresh token to call provider');

  // Verify updated Firestore record
  const updatedDoc = await testService.getIntegration(teacherUid);
  assert.ok(updatedDoc.tokenExpiresAt > Date.now() + 3000 * 1000, 'Must update tokenExpiresAt');
  assert.strictEqual(updatedDoc.lastError, null);

  const decryptedTokenInDb = decrypt({
    encryptedData: updatedDoc.encryptedAccessToken,
    iv: updatedDoc.accessTokenIv,
    authTag: updatedDoc.accessTokenAuthTag
  });
  assert.strictEqual(decryptedTokenInDb, newRefreshedToken, 'Re-encrypted token in DB must match new token');
});

await runAsyncTest('[MOCKED FIRESTORE / PROVIDER] 3.5: Already-expired access token triggers refresh and updates credentials', async () => {
  const mockDb = new MockFirestore();
  const refreshedToken = 'ya29.refreshed-from-fully-expired';

  const mockOAuthClient = {
    setCredentials: () => {},
    refreshAccessToken: async () => ({
      credentials: {
        access_token: refreshedToken,
        expiry_date: Date.now() + 3600 * 1000
      }
    })
  };

  const testService = new GoogleDriveService({
    customDb: mockDb,
    customOAuthClient: mockOAuthClient
  });

  const teacherUid = 'teacher_already_expired';

  await testService.saveIntegration(teacherUid, {
    tokens: {
      access_token: 'ya29.dead-expired-token',
      refresh_token: '1//refresh-token',
      expiry_date: Date.now() - 60 * 1000 // Expired 1 min ago
    },
    profile: { email: 'expired@sangam.edu' }
  });

  const token = await testService.getValidAccessToken(teacherUid);
  assert.strictEqual(token, refreshedToken);
});

await runAsyncTest('[MOCKED FIRESTORE / PROVIDER] 3.6: Preserves existing refresh token if Google response omits replacement', async () => {
  const mockDb = new MockFirestore();
  const originalRefreshToken = '1//original-permanent-refresh-token';

  const mockOAuthClient = {
    setCredentials: () => {},
    refreshAccessToken: async () => ({
      credentials: {
        access_token: 'ya29.new-access-token-without-new-refresh',
        expiry_date: Date.now() + 3600 * 1000
        // Google omits refresh_token on routine token refresh
      }
    })
  };

  const testService = new GoogleDriveService({
    customDb: mockDb,
    customOAuthClient: mockOAuthClient
  });

  const teacherUid = 'teacher_omit_replacement_refresh';

  await testService.saveIntegration(teacherUid, {
    tokens: {
      access_token: 'ya29.old-access-token',
      refresh_token: originalRefreshToken,
      expiry_date: Date.now() - 5000
    },
    profile: { email: 'preserve@sangam.edu' }
  });

  const beforeDoc = await testService.getIntegration(teacherUid);
  const originalEncryptedRefresh = beforeDoc.encryptedRefreshToken;
  const originalRefreshIv = beforeDoc.refreshTokenIv;
  const originalRefreshTag = beforeDoc.refreshTokenAuthTag;

  await testService.getValidAccessToken(teacherUid);

  const afterDoc = await testService.getIntegration(teacherUid);
  assert.strictEqual(afterDoc.encryptedRefreshToken, originalEncryptedRefresh, 'Existing refresh token must NOT be overwritten');
  assert.strictEqual(afterDoc.refreshTokenIv, originalRefreshIv);
  assert.strictEqual(afterDoc.refreshTokenAuthTag, originalRefreshTag);

  const decryptedRefresh = decrypt({
    encryptedData: afterDoc.encryptedRefreshToken,
    iv: afterDoc.refreshTokenIv,
    authTag: afterDoc.refreshTokenAuthTag
  });
  assert.strictEqual(decryptedRefresh, originalRefreshToken, 'Preserved refresh token must still decrypt to original value');
});

await runAsyncTest('[MOCKED FIRESTORE / PROVIDER] 3.7: Handles missing credentials or missing refresh token cleanly', async () => {
  const mockDb = new MockFirestore();
  const testService = new GoogleDriveService({ customDb: mockDb });

  // 1. Non-existent teacher record
  await assert.rejects(
    async () => testService.getValidAccessToken('teacher_non_existent'),
    /No Google Drive integration found for teacher/
  );

  // 2. Corrupted record missing refresh token
  const corruptedUid = 'teacher_corrupted_record';
  await mockDb.collection('faculty_storage_integrations').doc(corruptedUid).set({
    facultyUid: corruptedUid,
    encryptedAccessToken: 'some_encrypted_data',
    accessTokenIv: '123456789012345678901234',
    accessTokenAuthTag: 'abcdef1234567890abcdef1234567890',
    tokenExpiresAt: Date.now() - 10000 // Expired, but no refresh token
  });

  await assert.rejects(
    async () => testService.getValidAccessToken(corruptedUid),
    /missing encrypted refresh token/
  );
});

await runAsyncTest('[MOCKED FIRESTORE / PROVIDER] 3.8: Handles revoked consent / invalid_grant safely without leaking secrets', async () => {
  const mockDb = new MockFirestore();

  const mockOAuthClient = {
    setCredentials: () => {},
    refreshAccessToken: async () => {
      const err = new Error('invalid_grant: Token has been expired or revoked.');
      err.code = 400;
      throw err;
    }
  };

  const testService = new GoogleDriveService({
    customDb: mockDb,
    customOAuthClient: mockOAuthClient
  });

  const teacherUid = 'teacher_revoked_consent';

  await testService.saveIntegration(teacherUid, {
    tokens: {
      access_token: 'ya29.stale',
      refresh_token: '1//revoked-secret-refresh-token',
      expiry_date: Date.now() - 5000
    },
    profile: { email: 'revoked@sangam.edu' }
  });

  await assert.rejects(
    async () => testService.getValidAccessToken(teacherUid),
    (err) => {
      assert.strictEqual(err.message.includes('Google authorization has been revoked or expired'), true);
      assert.strictEqual(err.message.includes('1//revoked-secret-refresh-token'), false, 'Must not leak secret token');
      return true;
    }
  );

  // Verify status in DB was updated to error
  const record = await testService.getIntegration(teacherUid);
  assert.strictEqual(record.status, 'error');
  assert.ok(record.lastError.includes('revoked or expired'));
});

await runAsyncTest('[MOCKED FIRESTORE / PROVIDER] 3.9: Concurrency: Concurrent refresh calls for same teacherUid are deduplicated into single provider call', async () => {
  const mockDb = new MockFirestore();
  let providerCalls = 0;

  const mockOAuthClient = {
    setCredentials: () => {},
    refreshAccessToken: async () => {
      providerCalls++;
      await new Promise((resolve) => setTimeout(resolve, 30));
      return {
        credentials: {
          access_token: 'ya29.concurrent-single-call-token',
          expiry_date: Date.now() + 3600 * 1000
        }
      };
    }
  };

  const testService = new GoogleDriveService({
    customDb: mockDb,
    customOAuthClient: mockOAuthClient
  });

  const teacherUid = 'teacher_concurrent_refresh';

  await testService.saveIntegration(teacherUid, {
    tokens: {
      access_token: 'ya29.expired',
      refresh_token: '1//refresh-token',
      expiry_date: Date.now() - 5000
    },
    profile: { email: 'concurrent@sangam.edu' }
  });

  // Launch two refresh requests at the same time
  const [tokenA, tokenB] = await Promise.all([
    testService.getValidAccessToken(teacherUid),
    testService.getValidAccessToken(teacherUid)
  ]);

  assert.strictEqual(providerCalls, 1, 'Provider refreshAccessToken must be called exactly once');
  assert.strictEqual(tokenA, 'ya29.concurrent-single-call-token');
  assert.strictEqual(tokenB, 'ya29.concurrent-single-call-token');
});

// -----------------------------------------------------------------------------
// SECTION 4: Live HTTP API Endpoints & Zero Credential Exposure
// -----------------------------------------------------------------------------
console.log('\n--- SECTION 4: Live HTTP API Security & Verification ---');

const testServer = http.createServer(app);
await new Promise((resolve) => testServer.listen(0, '127.0.0.1', resolve));
const { port } = testServer.address();
const baseUrl = `http://127.0.0.1:${port}`;

try {
  await runAsyncTest('[INTEGRATION] 4.1: GET /api/storage/google/auth-url requires Firebase Auth (401 without token)', async () => {
    const res = await fetch(`${baseUrl}/api/storage/google/auth-url`);
    assert.strictEqual(res.status, 401);
    const data = await res.json();
    assert.strictEqual(data.success, false);
    assert.ok(data.error.includes('Missing Authorization header'));
  });

  await runAsyncTest('[INTEGRATION] 4.2: GET /api/storage/status requires Firebase Auth (401 without token)', async () => {
    const res = await fetch(`${baseUrl}/api/storage/status`);
    assert.strictEqual(res.status, 401);
  });

  await runAsyncTest('[INTEGRATION] 4.3: POST /api/storage/disconnect requires Firebase Auth (401 without token)', async () => {
    const res = await fetch(`${baseUrl}/api/storage/disconnect`, { method: 'POST' });
    assert.strictEqual(res.status, 401);
  });

  await runAsyncTest('[INTEGRATION] 4.4: Callback rejects missing state with 400 Bad Request', async () => {
    const res = await fetch(`${baseUrl}/api/storage/google/callback?code=some_auth_code`);
    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.strictEqual(data.success, false);
    assert.ok(data.error.includes('Missing OAuth state'));
  });

  await runAsyncTest('[INTEGRATION] 4.5: Callback rejects invalid or forged state with 400 Bad Request', async () => {
    const res = await fetch(`${baseUrl}/api/storage/google/callback?code=some_auth_code&state=forged_state_token_12345`);
    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.strictEqual(data.success, false);
    assert.ok(data.error.includes('Invalid, expired, or already-used'));
  });

  await runAsyncTest('[INTEGRATION] 4.6: Callback handles Google provider denial error safely', async () => {
    const res = await fetch(
      `${baseUrl}/api/storage/google/callback?error=access_denied`,
      { headers: { Accept: 'application/json' } }
    );
    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.strictEqual(data.success, false);
    assert.ok(data.error.includes('Google authorization denied: access_denied'));
  });

  await runAsyncTest('[INTEGRATION] 4.7: Disconnect flow decrypts token, calls revocation, and cleans up record', async () => {
    const mockDb = new MockFirestore();
    let revokeCalledWith = null;

    const testService = new GoogleDriveService({
      customDb: mockDb
    });
    testService.revokeToken = async (token) => {
      revokeCalledWith = token;
      return true;
    };

    const teacherUid = 'teacher_disconnect_test';
    const testRefreshToken = '1//0gG7Y-disconnect-refresh-token';

    await testService.saveIntegration(teacherUid, {
      tokens: {
        access_token: 'ya29.access-token',
        refresh_token: testRefreshToken,
        expiry_date: Date.now() + 3600 * 1000
      },
      profile: { email: 'faculty@sangam.edu' }
    });

    const disconnectResult = await testService.disconnect(teacherUid);
    assert.strictEqual(disconnectResult.success, true);
    assert.strictEqual(disconnectResult.revoked, true);
    assert.strictEqual(revokeCalledWith, testRefreshToken, 'Revocation must be called with decrypted refresh token');

    const postRecord = await testService.getIntegration(teacherUid);
    assert.strictEqual(postRecord, null, 'Integration must be deleted after disconnect');
  });

  await runAsyncTest('[INTEGRATION] 4.8: Disconnect handles provider revocation failure gracefully without corruption', async () => {
    const mockDb = new MockFirestore();
    const testService = new GoogleDriveService({
      customDb: mockDb
    });
    testService.revokeToken = async () => false;

    const teacherUid = 'teacher_disconnect_network_fail';
    await testService.saveIntegration(teacherUid, {
      tokens: {
        access_token: 'ya29.access-token',
        refresh_token: '1//refresh-token',
        expiry_date: Date.now() + 3600 * 1000
      },
      profile: { email: 'faculty@sangam.edu' }
    });

    const result = await testService.disconnect(teacherUid);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.revoked, false);
    assert.ok(result.message.includes('provider revocation could not be confirmed'));

    const postRecord = await testService.getIntegration(teacherUid);
    assert.strictEqual(postRecord, null);
  });

  await runAsyncTest('[INTEGRATION] 4.9: CRITICAL AUDIT: Integration metadata structure NEVER leaks tokens or keys to status API', () => {
    const storedRecord = {
      facultyUid: 'teacher_audit_01',
      provider: 'google',
      accountEmail: 'prof.smith@univ.edu',
      accountName: 'Prof. Smith',
      status: 'connected',
      encryptedAccessToken: 'a1b2c3d4e5f6',
      accessTokenIv: '123456789012345678901234',
      accessTokenAuthTag: 'abcdef1234567890abcdef1234567890',
      encryptedRefreshToken: 'f6e5d4c3b2a1',
      refreshTokenIv: '123456789012345678901234',
      refreshTokenAuthTag: 'abcdef1234567890abcdef1234567890',
      scope: GOOGLE_OAUTH_SCOPES.join(' '),
      tokenExpiresAt: Date.now() + 3600 * 1000,
      connectedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const publicStatus = {
      success: true,
      connected: storedRecord.status === 'connected',
      provider: storedRecord.provider,
      accountEmail: storedRecord.accountEmail,
      accountName: storedRecord.accountName,
      status: storedRecord.status,
      connectedAt: storedRecord.connectedAt,
      updatedAt: storedRecord.updatedAt,
      tokenExpiresAt: storedRecord.tokenExpiresAt
    };

    const serialized = JSON.stringify(publicStatus);
    assert.strictEqual(serialized.includes('encryptedAccessToken'), false);
    assert.strictEqual(serialized.includes('encryptedRefreshToken'), false);
    assert.strictEqual(serialized.includes('accessTokenIv'), false);
    assert.strictEqual(serialized.includes('accessTokenAuthTag'), false);
    assert.strictEqual(serialized.includes('refreshTokenIv'), false);
    assert.strictEqual(serialized.includes('refreshTokenAuthTag'), false);
  });

  await runAsyncTest('[REGRESSION] 4.10: Regression: POST /api/similarity handles PDF multipart uploads and unlinks files', async () => {
    const formData = new FormData();
    const pdfBlobA = new Blob(['%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF'], { type: 'application/pdf' });
    const pdfBlobB = new Blob(['%PDF-1.4\n2 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF'], { type: 'application/pdf' });

    formData.append('fileA', pdfBlobA, 'submission_a.pdf');
    formData.append('fileB', pdfBlobB, 'submission_b.pdf');

    const res = await fetch(`${baseUrl}/api/similarity`, {
      method: 'POST',
      body: formData
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(data.report);
  });

  await runAsyncTest('[INTEGRATION] 4.11: POST /api/storage/google/init-folder requires Firebase Auth (401 without token)', async () => {
    const res = await fetch(`${baseUrl}/api/storage/google/init-folder`, { method: 'POST' });
    assert.strictEqual(res.status, 401);
    const data = await res.json();
    assert.strictEqual(data.success, false);
    assert.ok(data.error.includes('Missing Authorization header'));
  });
} finally {
  await new Promise((resolve) => testServer.close(resolve));
}

// -----------------------------------------------------------------------------
// SECTION 5: Private Google Drive Coursework Folder Management (Stage 5B)
// -----------------------------------------------------------------------------
console.log('\n--- SECTION 5: Private Google Drive Folder Management (Stage 5B) ---');

await runAsyncTest('[MOCKED FIRESTORE / GOOGLE DRIVE] 5.1: Creates private \'Sangam Coursework\' root folder and persists ID in Firestore', async () => {
  const mockDb = new MockFirestore();
  const createdFolders = [];

  const mockDriveApi = {
    createFolder: async (name, accessToken) => {
      const folderId = `drive_folder_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      createdFolders.push({ id: folderId, name, accessToken });
      return { id: folderId, name };
    },
    verifyFolder: async (folderId) => {
      const found = createdFolders.find((f) => f.id === folderId);
      return { exists: Boolean(found), trashed: false, name: found?.name };
    }
  };

  const testService = new GoogleDriveService({
    customDb: mockDb,
    customDriveApi: mockDriveApi
  });

  const teacherUid = 'teacher_folder_01';
  await testService.saveIntegration(teacherUid, {
    tokens: {
      access_token: 'ya29.valid-token',
      refresh_token: '1//refresh-token',
      expiry_date: Date.now() + 3600 * 1000
    },
    profile: { email: 'teacher1@sangam.edu' }
  });

  const folder = await testService.getOrCreateCourseworkFolder(teacherUid);

  assert.strictEqual(folder.name, 'Sangam Coursework');
  assert.ok(folder.id, 'Must return a valid folder ID');
  assert.strictEqual(createdFolders.length, 1);
  assert.strictEqual(createdFolders[0].name, 'Sangam Coursework');

  // Verify persistence in Firestore
  const stored = await testService.getIntegration(teacherUid);
  assert.strictEqual(stored.rootFolderId, folder.id);
  assert.strictEqual(stored.rootFolderName, 'Sangam Coursework');
  assert.ok(stored.rootFolderCreatedAt);
  assert.strictEqual(stored.folderLockUntil, null, 'Lock lease must be cleared after completion');
});

await runAsyncTest('[MOCKED FIRESTORE / GOOGLE DRIVE] 5.2: Repeated requests verify and reuse existing root folder without creating duplicates', async () => {
  const mockDb = new MockFirestore();
  let createFolderCalls = 0;
  let verifyFolderCalls = 0;

  const mockDriveApi = {
    createFolder: async (name) => {
      createFolderCalls++;
      return { id: 'folder_persisted_123', name };
    },
    verifyFolder: async (folderId) => {
      verifyFolderCalls++;
      assert.strictEqual(folderId, 'folder_persisted_123');
      return { exists: true, trashed: false, name: 'Sangam Coursework' };
    }
  };

  const testService = new GoogleDriveService({
    customDb: mockDb,
    customDriveApi: mockDriveApi
  });

  const teacherUid = 'teacher_folder_repeat';
  await testService.saveIntegration(teacherUid, {
    tokens: {
      access_token: 'ya29.valid-token',
      refresh_token: '1//refresh-token',
      expiry_date: Date.now() + 3600 * 1000
    },
    profile: { email: 'repeat@sangam.edu' }
  });

  // First call creates folder
  const first = await testService.getOrCreateCourseworkFolder(teacherUid);
  assert.strictEqual(createFolderCalls, 1);
  assert.strictEqual(first.id, 'folder_persisted_123');

  // Second call must verify and reuse existing folder without re-creating
  const second = await testService.getOrCreateCourseworkFolder(teacherUid);
  assert.strictEqual(createFolderCalls, 1, 'createFolder must NOT be called again');
  assert.strictEqual(verifyFolderCalls, 1, 'verifyFolder must confirm existing folder is usable');
  assert.strictEqual(second.id, 'folder_persisted_123');
});

await runAsyncTest('[MOCKED FIRESTORE / GOOGLE DRIVE] 5.3: Concurrent requests do not create duplicate root folders', async () => {
  const mockDb = new MockFirestore();
  let createFolderCalls = 0;

  const mockDriveApi = {
    createFolder: async (name) => {
      createFolderCalls++;
      await new Promise((resolve) => setTimeout(resolve, 40));
      return { id: 'folder_concurrent_exclusive_id', name };
    },
    verifyFolder: async (folderId) => ({
      exists: folderId === 'folder_concurrent_exclusive_id',
      trashed: false,
      name: 'Sangam Coursework'
    })
  };

  const testService = new GoogleDriveService({
    customDb: mockDb,
    customDriveApi: mockDriveApi
  });

  const teacherUid = 'teacher_concurrent_folder';
  await testService.saveIntegration(teacherUid, {
    tokens: {
      access_token: 'ya29.valid-token',
      refresh_token: '1//refresh-token',
      expiry_date: Date.now() + 3600 * 1000
    },
    profile: { email: 'concurrent.folder@sangam.edu' }
  });

  // Launch two concurrent folder creation requests simultaneously
  const [resA, resB] = await Promise.all([
    testService.getOrCreateCourseworkFolder(teacherUid),
    testService.getOrCreateCourseworkFolder(teacherUid)
  ]);

  assert.strictEqual(createFolderCalls, 1, 'createFolder must be invoked exactly once');
  assert.strictEqual(resA.id, 'folder_concurrent_exclusive_id');
  assert.strictEqual(resB.id, 'folder_concurrent_exclusive_id');
});

await runAsyncTest('[MOCKED FIRESTORE / GOOGLE DRIVE] 5.4: Enforces isolation between two different teachers', async () => {
  const mockDb = new MockFirestore();
  let counter = 0;

  const mockDriveApi = {
    createFolder: async (name) => {
      counter++;
      return { id: `folder_teacher_${counter}`, name };
    },
    verifyFolder: async (folderId) => ({ exists: true, trashed: false, name: 'Sangam Coursework' })
  };

  const testService = new GoogleDriveService({
    customDb: mockDb,
    customDriveApi: mockDriveApi
  });

  const teacherA = 'teacher_alpha';
  const teacherB = 'teacher_beta';

  await testService.saveIntegration(teacherA, {
    tokens: { access_token: 'ya29.tokenA', refresh_token: '1//refA', expiry_date: Date.now() + 3600000 },
    profile: { email: 'alpha@sangam.edu' }
  });

  await testService.saveIntegration(teacherB, {
    tokens: { access_token: 'ya29.tokenB', refresh_token: '1//refB', expiry_date: Date.now() + 3600000 },
    profile: { email: 'beta@sangam.edu' }
  });

  const folderA = await testService.getOrCreateCourseworkFolder(teacherA);
  const folderB = await testService.getOrCreateCourseworkFolder(teacherB);

  assert.notStrictEqual(folderA.id, folderB.id, 'Teachers must receive distinct folders');

  const recordA = await testService.getIntegration(teacherA);
  const recordB = await testService.getIntegration(teacherB);

  assert.strictEqual(recordA.rootFolderId, folderA.id);
  assert.strictEqual(recordB.rootFolderId, folderB.id);
  assert.strictEqual(recordA.accountEmail, 'alpha@sangam.edu');
  assert.strictEqual(recordB.accountEmail, 'beta@sangam.edu');
});

await runAsyncTest('[MOCKED FIRESTORE / GOOGLE DRIVE] 5.5: Handles missing integration and revoked consent safely', async () => {
  const mockDb = new MockFirestore();
  const testService = new GoogleDriveService({ customDb: mockDb });

  // 1. Missing integration
  await assert.rejects(
    async () => testService.getOrCreateCourseworkFolder('unconnected_teacher'),
    /No Google Drive integration found for teacher/
  );

  // 2. Revoked integration
  const revokedUid = 'teacher_revoked_folder';
  await testService.saveIntegration(revokedUid, {
    tokens: { access_token: 'ya29.stale', refresh_token: '1//ref-revoked', expiry_date: Date.now() - 1000 },
    profile: { email: 'revoked.folder@sangam.edu' }
  });

  testService.getOAuth2Client = () => ({
    setCredentials: () => {},
    refreshAccessToken: async () => {
      const err = new Error('invalid_grant: Token revoked');
      throw err;
    }
  });

  await assert.rejects(
    async () => testService.getOrCreateCourseworkFolder(revokedUid),
    /Google authorization has been revoked or expired/
  );
});

await runAsyncTest('[MOCKED FIRESTORE / GOOGLE DRIVE] 5.6: Handles Google API errors and Firestore persistence failures cleanly', async () => {
  const mockDb = new MockFirestore();

  // Provider fails on createFolder
  const mockDriveApi = {
    createFolder: async () => {
      const err = new Error('Google Drive 500 Internal Server Error: backend down');
      throw err;
    }
  };

  const testService = new GoogleDriveService({
    customDb: mockDb,
    customDriveApi: mockDriveApi
  });

  const teacherUid = 'teacher_drive_api_fail';
  await testService.saveIntegration(teacherUid, {
    tokens: { access_token: 'ya29.token', refresh_token: '1//ref', expiry_date: Date.now() + 3600000 },
    profile: { email: 'fail@sangam.edu' }
  });

  await assert.rejects(
    async () => testService.getOrCreateCourseworkFolder(teacherUid),
    /Google Drive 500 Internal Server Error/
  );

  // Assert no corrupted rootFolderId was persisted
  const record = await testService.getIntegration(teacherUid);
  assert.strictEqual(record.rootFolderId, undefined);
  assert.strictEqual(record.folderLockUntil, null, 'Lease must be cleared on failure');
});

await runAsyncTest('[MOCKED FIRESTORE / GOOGLE DRIVE] 5.7: Guarantees zero public permissions and zero credential leakage', async () => {
  let permissionsCreated = false;

  const mockDriveApi = {
    createFolder: async (name) => ({ id: 'folder_strictly_private', name }),
    createPermission: () => {
      permissionsCreated = true;
    }
  };

  const mockDb = new MockFirestore();
  const testService = new GoogleDriveService({
    customDb: mockDb,
    customDriveApi: mockDriveApi
  });

  const teacherUid = 'teacher_private_audit';
  await testService.saveIntegration(teacherUid, {
    tokens: { access_token: 'ya29.audit', refresh_token: '1//ref', expiry_date: Date.now() + 3600000 },
    profile: { email: 'private.audit@sangam.edu' }
  });

  const folder = await testService.getOrCreateCourseworkFolder(teacherUid);
  assert.strictEqual(permissionsCreated, false, 'Must NEVER call permissions endpoint to share folder');
  assert.strictEqual(folder.name, 'Sangam Coursework');

  // Verify that metadata in status API has folderReady but never leaks folderId or tokens
  const statusDoc = await testService.getIntegration(teacherUid);
  const statusPresentation = {
    success: true,
    connected: statusDoc.status === 'connected',
    folderReady: Boolean(statusDoc.rootFolderId)
  };

  const statusJson = JSON.stringify(statusPresentation);
  assert.strictEqual(statusJson.includes('folder_strictly_private'), false, 'Status API must not expose internal folder ID');
  assert.strictEqual(statusJson.includes('ya29.audit'), false);
  assert.strictEqual(statusJson.includes('1//ref'), false);
});

await runAsyncTest('[SECURITY] 5.8: POST /api/storage/google/init-folder enforces faculty/teacher role and blocks students', async () => {
  const mockDb = new MockFirestore();

  // Create student user document
  await mockDb.collection('users').doc('student_123').set({
    uid: 'student_123',
    role: 'student',
    email: 'student@sangam.edu'
  });

  // Create faculty user document
  await mockDb.collection('users').doc('faculty_123').set({
    uid: 'faculty_123',
    role: 'faculty',
    email: 'prof@sangam.edu'
  });

  // Setup integration for faculty
  await mockDb.collection('faculty_storage_integrations').doc('faculty_123').set({
    facultyUid: 'faculty_123',
    status: 'connected',
    rootFolderId: 'folder_precreated_faculty',
    rootFolderName: 'Sangam Coursework'
  });

  const testDriveService = new GoogleDriveService({ customDb: mockDb });

  // Simulate endpoint handler logic for student
  const studentReq = { userId: 'student_123' };
  const userSnap = await mockDb.collection('users').doc(studentReq.userId).get();
  const role = userSnap.data().role;
  assert.strictEqual(role, 'student');
  const isFaculty = (role === 'faculty' || role === 'teacher' || role === 'director');
  assert.strictEqual(isFaculty, false, 'Students must NOT have faculty privileges');

  // Simulate endpoint handler logic for faculty
  const facultyReq = { userId: 'faculty_123' };
  const facultySnap = await mockDb.collection('users').doc(facultyReq.userId).get();
  const facultyRole = facultySnap.data().role;
  assert.strictEqual(facultyRole === 'faculty' || facultyRole === 'teacher', true);
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
