import crypto from 'node:crypto';
import { OAuth2Client } from 'google-auth-library';
import { getAdminFirestore } from '../config/firebaseAdmin.js';
import { encrypt, decrypt } from './encryptionService.js';

// Scopes required for Sangam Google Drive coursework management
export const GOOGLE_OAUTH_SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile'
];

/**
 * State store for OAuth 2.0 authorization requests backed by Firestore.
 * Enforces atomic single-use consumption and expiration in collection 'oauth_states'.
 */
export class OAuthStateManager {
  constructor(options = {}) {
    this.ttlMs = options.ttlMs || (10 * 60 * 1000); // 10 minutes
    this.customDb = options.customDb || null;

    // Test-only in-memory double: strictly forbidden in production
    const isTestEnv = (process.env.NODE_ENV === 'test' || process.env.TEST_MODE === 'true');
    if (options.useTestDouble) {
      if (!isTestEnv) {
        throw new Error('SECURITY VIOLATION: OAuth state test double cannot be enabled outside of test environment.');
      }
      this.isTestDouble = true;
      this.testStore = new Map();
    } else {
      this.isTestDouble = false;
      this.testStore = null;
    }
  }

  getDb() {
    if (this.customDb) {
      return this.customDb;
    }
    const db = getAdminFirestore();
    if (!db) {
      throw new Error('Firestore is unavailable. OAuth state persistence failed closed.');
    }
    return db;
  }

  /**
   * Test-only helper to inject a mock Firestore database.
   * Strictly forbidden and fails closed in production.
   */
  setTestDb(mockDb) {
    const isTestEnv = (process.env.NODE_ENV === 'test' || process.env.TEST_MODE === 'true');
    if (!isTestEnv) {
      throw new Error('SECURITY VIOLATION: setTestDb can only be called in test environment.');
    }
    this.customDb = mockDb;
  }

  /**
   * Test-only helper to enable in-memory state store.
   * Strictly forbidden and fails closed in production.
   */
  setTestDouble(enabled) {
    const isTestEnv = (process.env.NODE_ENV === 'test' || process.env.TEST_MODE === 'true');
    if (!isTestEnv) {
      throw new Error('SECURITY VIOLATION: Test double can only be enabled in test environment.');
    }
    this.isTestDouble = Boolean(enabled);
    if (this.isTestDouble && !this.testStore) {
      this.testStore = new Map();
    }
  }

  /**
   * Generates a cryptographically random, single-use state token bound to a teacher UID
   * and persists it to Firestore with a 10-minute expiry. Never logs the state token.
   *
   * @param {string} teacherUid - The authenticated Firebase UID of the teacher.
   * @param {object} [customDb=null] - Optional database instance override.
   * @returns {Promise<string>} 64-character hexadecimal state token.
   */
  async createState(teacherUid, customDb = null) {
    if (!teacherUid || typeof teacherUid !== 'string' || teacherUid.trim() === '') {
      throw new Error('teacherUid is required to generate OAuth state.');
    }

    const stateToken = crypto.randomBytes(32).toString('hex');
    const now = Date.now();
    const docData = {
      teacherUid,
      createdAt: now,
      expiresAt: now + this.ttlMs
    };

    if (this.isTestDouble) {
      this.testStore.set(stateToken, docData);
      return stateToken;
    }

    const db = customDb || this.getDb();
    if (!db) {
      throw new Error('Firestore is unavailable. OAuth state persistence failed closed.');
    }

    try {
      await db.collection('oauth_states').doc(stateToken).set(docData);
      return stateToken;
    } catch (err) {
      console.error('[OAuthStateManager] Failed to persist OAuth state to Firestore (fail-closed):', err.message);
      throw new Error(`OAuth state persistence failed closed: ${err.message}`);
    }
  }

  /**
   * Validates and atomically consumes (deletes) the state token using a Firestore transaction.
   * Enforces atomic single-use, expiry validation, and structure validation.
   *
   * @param {string} stateToken - The state token returned in the OAuth callback.
   * @param {object} [customDb=null] - Optional database instance override.
   * @returns {Promise<{ teacherUid: string }|null>} State data if valid, or null if invalid/expired/consumed.
   */
  async consumeState(stateToken, customDb = null) {
    if (
      !stateToken ||
      typeof stateToken !== 'string' ||
      stateToken.length !== 64 ||
      !/^[0-9a-f]{64}$/.test(stateToken)
    ) {
      return null;
    }

    if (this.isTestDouble) {
      const record = this.testStore.get(stateToken);
      if (!record) {
        return null;
      }
      this.testStore.delete(stateToken);
      if (!record.teacherUid || typeof record.teacherUid !== 'string' || !record.expiresAt) {
        return null;
      }
      if (Date.now() > record.expiresAt) {
        return null;
      }
      return { teacherUid: record.teacherUid };
    }

    try {
      const db = customDb || this.getDb();
      if (!db) {
        throw new Error('Firestore is unavailable. OAuth state persistence failed closed.');
      }

      const docRef = db.collection('oauth_states').doc(stateToken);

      const result = await db.runTransaction(async (transaction) => {
        const docSnap = await transaction.get(docRef);
        if (!docSnap.exists) {
          return null;
        }

        const data = docSnap.data();
        if (
          !data ||
          !data.teacherUid ||
          typeof data.teacherUid !== 'string' ||
          !data.expiresAt ||
          typeof data.expiresAt !== 'number'
        ) {
          transaction.delete(docRef);
          return null;
        }

        if (Date.now() > data.expiresAt) {
          transaction.delete(docRef);
          return null;
        }

        transaction.delete(docRef);
        return { teacherUid: data.teacherUid };
      });

      return result;
    } catch (err) {
      console.error('[OAuthStateManager] State consumption failed closed:', err.message);
      throw new Error(`Failed to consume OAuth state: ${err.message}`);
    }
  }

  /**
   * Cleans up expired states from the store.
   */
  async cleanup() {
    if (this.isTestDouble) {
      const now = Date.now();
      for (const [key, value] of this.testStore.entries()) {
        if (now > value.expiresAt) {
          this.testStore.delete(key);
        }
      }
      return;
    }

    try {
      const db = this.getDb();
      const now = Date.now();
      const snapshot = await db.collection('oauth_states')
        .where('expiresAt', '<', now)
        .limit(100)
        .get();

      if (snapshot.empty) return;

      const batch = db.batch();
      snapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
      });
      await batch.commit();
    } catch {
      // Periodic cleanup failures are non-critical
    }
  }
}

export const stateManager = new OAuthStateManager();

// Run periodic cleanup every 15 minutes (non-blocking)
if (process.env.NODE_ENV !== 'test') {
  setInterval(() => stateManager.cleanup().catch(() => {}), 15 * 60 * 1000).unref();
}

/**
 * Service for managing Google OAuth 2.0 and Google Drive API credentials.
 */
export class GoogleDriveService {
  /**
   * @param {object} [config={}] - Optional configuration override for testing.
   */
  constructor(config = {}) {
    this.clientId = config.clientId || process.env.GOOGLE_CLIENT_ID;
    this.clientSecret = config.clientSecret || process.env.GOOGLE_CLIENT_SECRET;
    this.redirectUri = config.redirectUri || process.env.GOOGLE_REDIRECT_URI || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}/api/storage/google/callback` : undefined);
    this.customDb = config.customDb || null;
    this.customOAuthClient = config.customOAuthClient || null;
    this.customDriveApi = config.customDriveApi || null;
    this.refreshLocks = new Map();
    this.folderLocks = new Map();
  }

  /**
   * Returns an initialized OAuth2Client instance.
   *
   * @returns {OAuth2Client}
   * @throws {Error} If credentials are not configured.
   */
  getOAuth2Client() {
    if (this.customOAuthClient) {
      return this.customOAuthClient;
    }

    const clientId = this.clientId || process.env.GOOGLE_CLIENT_ID;
    const clientSecret = this.clientSecret || process.env.GOOGLE_CLIENT_SECRET;
    let redirectUri = this.redirectUri || process.env.GOOGLE_REDIRECT_URI;
    if (process.env.VERCEL) {
      const prodHost = process.env.VERCEL_PROJECT_PRODUCTION_URL || 'esangam.vercel.app';
      if (!redirectUri || redirectUri.includes('localhost') || redirectUri.includes('127.0.0.1')) {
        redirectUri = `https://${prodHost}/api/storage/google/callback`;
      }
    } else if (!redirectUri && process.env.VERCEL_URL) {
      redirectUri = `https://${process.env.VERCEL_URL}/api/storage/google/callback`;
    }

    if (!clientId || !clientSecret || !redirectUri) {
      throw new Error(
        'Google OAuth configuration incomplete. Required environment variables: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI.'
      );
    }

    return new OAuth2Client(clientId, clientSecret, redirectUri);
  }

  /**
   * Generates a Google consent screen authorization URL bound to a specific state.
   *
   * @param {string} state - The cryptographically random state token.
   * @returns {string} Full Google OAuth consent URL.
   */
  getAuthorizationUrl(state) {
    const oauth2Client = this.getOAuth2Client();
    return oauth2Client.generateAuthUrl({
      access_type: 'offline', // Required to receive a refresh token
      prompt: 'consent',     // Forces consent to ensure refresh token is returned
      scope: GOOGLE_OAUTH_SCOPES,
      include_granted_scopes: true,
      state
    });
  }

  /**
   * Exchanges an authorization code for access and refresh tokens.
   *
   * @param {string} code - Authorization code from Google callback.
   * @returns {Promise<{ tokens: object }>}
   */
  async exchangeCodeForTokens(code) {
    if (!code) {
      throw new Error('Authorization code is required.');
    }
    const oauth2Client = this.getOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code);
    return tokens;
  }

  /**
   * Retrieves verified user profile information from Google using an access token or ID token.
   *
   * @param {string} accessToken - Valid Google access token.
   * @returns {Promise<{ email: string, name: string }>}
   */
  async fetchUserProfile(accessToken) {
    if (!accessToken) {
      throw new Error('Access token is required to fetch user profile.');
    }

    const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Failed to fetch Google user profile: ${response.status} ${errText}`);
    }

    const profile = await response.json();
    if (!profile.email) {
      throw new Error('Google userinfo response did not contain a valid email address.');
    }

    return {
      email: profile.email,
      name: profile.name || ''
    };
  }

  /**
   * Revokes a Google token (access or refresh token).
   *
   * @param {string} token - The raw token string to revoke.
   * @returns {Promise<boolean>} True if revocation succeeded, false if error.
   */
  async revokeToken(token) {
    if (!token) return false;
    try {
      const url = `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });
      return res.ok;
    } catch (err) {
      console.warn('[GoogleDriveService] Token revocation request failed:', err.message);
      return false;
    }
  }

  /**
   * Retrieves the Firestore database instance.
   */
  getDb() {
    return this.customDb || getAdminFirestore();
  }

  /**
   * Test-only helper to inject a mock Firestore database.
   * Strictly forbidden and fails closed in production.
   */
  setTestDb(mockDb) {
    const isTestEnv = (process.env.NODE_ENV === 'test' || process.env.TEST_MODE === 'true');
    if (!isTestEnv) {
      throw new Error('SECURITY VIOLATION: setTestDb can only be called in test environment.');
    }
    this.customDb = mockDb;
  }

  /**
   * Saves or updates the teacher's encrypted Google Drive integration in Firestore.
   *
   * @param {string} teacherUid - The authenticated teacher UID.
   * @param {object} integrationData - Data containing raw tokens and profile.
   * @param {string} [encryptionKey=null] - Optional encryption key override for testing.
   */
  async saveIntegration(teacherUid, integrationData, encryptionKey = null) {
    const { tokens, profile } = integrationData;

    if (!tokens.access_token) {
      throw new Error('Cannot save integration without access_token.');
    }

    // Encrypt sensitive tokens using Stage 2 encryption service
    const encryptedAccess = encrypt(tokens.access_token, encryptionKey);

    let encryptedRefresh = null;
    if (tokens.refresh_token) {
      encryptedRefresh = encrypt(tokens.refresh_token, encryptionKey);
    } else {
      // If refresh token was omitted in this exchange, preserve existing one if present
      const existing = await this.getIntegration(teacherUid);
      if (existing && existing.encryptedRefreshToken) {
        encryptedRefresh = {
          encryptedData: existing.encryptedRefreshToken,
          iv: existing.refreshTokenIv,
          authTag: existing.refreshTokenAuthTag
        };
      }
    }

    if (!encryptedRefresh) {
      throw new Error(
        'Missing refresh token from Google OAuth exchange. Ensure prompt=consent and access_type=offline.'
      );
    }

    const docData = {
      facultyUid: teacherUid,
      provider: 'google',
      accountEmail: profile.email,
      accountName: profile.name || '',
      status: 'connected',
      encryptedAccessToken: encryptedAccess.encryptedData,
      accessTokenIv: encryptedAccess.iv,
      accessTokenAuthTag: encryptedAccess.authTag,
      encryptedRefreshToken: encryptedRefresh.encryptedData,
      refreshTokenIv: encryptedRefresh.iv,
      refreshTokenAuthTag: encryptedRefresh.authTag,
      scope: tokens.scope || GOOGLE_OAUTH_SCOPES.join(' '),
      tokenExpiresAt: tokens.expiry_date || Date.now() + 3600 * 1000,
      connectedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastError: null
    };

    const db = this.getDb();
    await db.collection('faculty_storage_integrations').doc(teacherUid).set(docData, { merge: true });
    return docData;
  }

  /**
   * Fetches the stored integration record for a teacher.
   *
   * @param {string} teacherUid
   * @returns {Promise<object|null>}
   */
  async getIntegration(teacherUid) {
    const db = this.getDb();
    const docRef = db.collection('faculty_storage_integrations').doc(teacherUid);
    const snap = await docRef.get();
    if (!snap.exists) {
      return null;
    }
    return snap.data();
  }

  /**
   * Retrieves a valid Google access token for a teacher, automatically refreshing
   * credentials server-side and persisting re-encrypted tokens when expired or within 5 minutes of expiry.
   *
   * @param {string} teacherUid - Authenticated teacher Firebase UID.
   * @param {string} [encryptionKey=null] - Optional encryption key override.
   * @returns {Promise<string>} Plaintext valid access token.
   */
  async getValidAccessToken(teacherUid, encryptionKey = null) {
    if (!teacherUid || typeof teacherUid !== 'string' || teacherUid.trim() === '') {
      throw new Error('teacherUid is required to retrieve an access token.');
    }

    // Handle concurrent refresh requests safely: deduplicate in-flight promises
    if (this.refreshLocks.has(teacherUid)) {
      return await this.refreshLocks.get(teacherUid);
    }

    const refreshTask = (async () => {
      const record = await this.getIntegration(teacherUid);
      if (!record) {
        throw new Error('No Google Drive integration found for teacher.');
      }

      if (!record.encryptedAccessToken || !record.accessTokenIv || !record.accessTokenAuthTag) {
        throw new Error('Incomplete Google Drive credentials: missing encrypted access token.');
      }

      const now = Date.now();
      const SAFETY_MARGIN_MS = 5 * 60 * 1000; // 5 minutes
      const tokenExpiresAt = typeof record.tokenExpiresAt === 'number' ? record.tokenExpiresAt : 0;

      // 1. If token expiry is safely more than 5 minutes away, decrypt and return
      if (tokenExpiresAt - now > SAFETY_MARGIN_MS) {
        try {
          return decrypt(
            {
              encryptedData: record.encryptedAccessToken,
              iv: record.accessTokenIv,
              authTag: record.accessTokenAuthTag
            },
            encryptionKey
          );
        } catch {
          throw new Error('Failed to decrypt stored Google access token.');
        }
      }

      // 2. Token is expired or near expiry (<= 5 min) -> refresh credentials server-side
      if (!record.encryptedRefreshToken || !record.refreshTokenIv || !record.refreshTokenAuthTag) {
        throw new Error('Cannot refresh access token: missing encrypted refresh token.');
      }

      const db = this.getDb();
      const docRef = db.collection('faculty_storage_integrations').doc(teacherUid);

      // Multi-instance distributed coordination: check if another backend instance is currently refreshing
      if (record.refreshLockUntil && record.refreshLockUntil > now) {
        await new Promise((resolve) => setTimeout(resolve, 300));
        const refreshedRecord = await this.getIntegration(teacherUid);
        if (
          refreshedRecord &&
          typeof refreshedRecord.tokenExpiresAt === 'number' &&
          refreshedRecord.tokenExpiresAt - Date.now() > SAFETY_MARGIN_MS
        ) {
          return decrypt(
            {
              encryptedData: refreshedRecord.encryptedAccessToken,
              iv: refreshedRecord.accessTokenIv,
              authTag: refreshedRecord.accessTokenAuthTag
            },
            encryptionKey
          );
        }
      }

      // Set 15-second distributed refresh lease in Firestore
      try {
        await docRef.set({ refreshLockUntil: Date.now() + 15000 }, { merge: true });
      } catch {
        // Proceed even if lease logging fails
      }

      let rawRefreshToken;
      try {
        rawRefreshToken = decrypt(
          {
            encryptedData: record.encryptedRefreshToken,
            iv: record.refreshTokenIv,
            authTag: record.refreshTokenAuthTag
          },
          encryptionKey
        );
      } catch {
        throw new Error('Failed to decrypt stored Google refresh token.');
      }

      if (!rawRefreshToken || typeof rawRefreshToken !== 'string') {
        throw new Error('Decrypted refresh token is invalid or empty.');
      }

      const oauth2Client = this.getOAuth2Client();
      oauth2Client.setCredentials({ refresh_token: rawRefreshToken });

      let refreshedCredentials;
      try {
        const res = await oauth2Client.refreshAccessToken();
        refreshedCredentials = res.credentials;
      } catch (providerErr) {
        const errStr = (providerErr.message || '').toLowerCase();
        const isRevoked = errStr.includes('invalid_grant') || errStr.includes('revoked');

        try {
          await db.collection('faculty_storage_integrations').doc(teacherUid).set(
            {
              status: isRevoked ? 'error' : record.status,
              refreshLockUntil: null,
              lastError: isRevoked
                ? 'Google authorization has been revoked or expired.'
                : 'Google token refresh request failed.',
              updatedAt: new Date().toISOString()
            },
            { merge: true }
          );
        } catch {
          // Suppress DB write errors during failure recording
        }

        if (isRevoked) {
          const err = new Error('Google authorization has been revoked or expired. Please reconnect your account.');
          err.statusCode = 401;
          err.code = 'GOOGLE_AUTH_REVOKED';
          throw err;
        }
        throw new Error('Failed to refresh Google credentials from provider.');
      }

      if (!refreshedCredentials || !refreshedCredentials.access_token) {
        throw new Error('Provider response did not contain a new access token.');
      }

      const newAccessToken = refreshedCredentials.access_token;
      const newExpiry = refreshedCredentials.expiry_date || (Date.now() + 3600 * 1000);

      // Encrypt new access token using AES-256-GCM encryption service
      const encryptedAccess = encrypt(newAccessToken, encryptionKey);

      // Match existing record schema
      const updateData = {
        encryptedAccessToken: encryptedAccess.encryptedData,
        accessTokenIv: encryptedAccess.iv,
        accessTokenAuthTag: encryptedAccess.authTag,
        tokenExpiresAt: newExpiry,
        refreshLockUntil: null,
        updatedAt: new Date().toISOString(),
        lastError: null
      };

      // Preserve existing refresh token if Google does not return a replacement
      // Never overwrite a valid stored refresh token with undefined or empty value
      if (refreshedCredentials.refresh_token && refreshedCredentials.refresh_token !== rawRefreshToken) {
        const encryptedNewRefresh = encrypt(refreshedCredentials.refresh_token, encryptionKey);
        updateData.encryptedRefreshToken = encryptedNewRefresh.encryptedData;
        updateData.refreshTokenIv = encryptedNewRefresh.iv;
        updateData.refreshTokenAuthTag = encryptedNewRefresh.authTag;
      }

      // Atomic update protecting against stale writes from races
      if (typeof db.runTransaction === 'function') {
        await db.runTransaction(async (transaction) => {
          const currentSnap = await transaction.get(docRef);
          if (currentSnap.exists) {
            const currentData = currentSnap.data();
            if (currentData.tokenExpiresAt && currentData.tokenExpiresAt > newExpiry) {
              return; // Another concurrent refresh already committed newer credentials
            }
          }
          transaction.set(docRef, updateData, { merge: true });
        });
      } else {
        await docRef.set(updateData, { merge: true });
      }

      return newAccessToken;
    })();

    this.refreshLocks.set(teacherUid, refreshTask);
    try {
      return await refreshTask;
    } finally {
      this.refreshLocks.delete(teacherUid);
    }
  }

  /**
   * Verifies if an existing Google Drive folder ID exists, is not trashed, and is a valid folder.
   * Never searches or enumerates personal files; only queries the exact folderId.
   *
   * @param {string} folderId - Specific folder ID to verify.
   * @param {string} accessToken - Valid Google access token.
   * @returns {Promise<{ exists: boolean, trashed: boolean, name?: string }>}
   */
  async verifyFolder(folderId, accessToken) {
    if (!folderId || !accessToken) {
      return { exists: false, trashed: true };
    }

    if (this.customDriveApi && typeof this.customDriveApi.verifyFolder === 'function') {
      return await this.customDriveApi.verifyFolder(folderId, accessToken);
    }

    const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(folderId)}?fields=id,name,mimeType,trashed`;
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    if (res.status === 404) {
      return { exists: false, trashed: true };
    }

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Google Drive API error (${res.status}): ${errText}`);
    }

    const fileMeta = await res.json();
    const isFolder = fileMeta.mimeType === 'application/vnd.google-apps.folder';
    return {
      exists: isFolder && !fileMeta.trashed,
      trashed: Boolean(fileMeta.trashed),
      name: fileMeta.name
    };
  }

  /**
   * Creates a private folder named 'Sangam Coursework' in the user's root Google Drive.
   * Enforces zero public permissions and private least privilege.
   *
   * @param {string} folderName - Name of folder (defaults to 'Sangam Coursework').
   * @param {string} accessToken - Valid Google access token.
   * @returns {Promise<{ id: string, name: string }>}
   */
  async createDriveFolder(folderName, accessToken) {
    if (!accessToken) {
      throw new Error('Access token is required to create Drive folder.');
    }

    const targetName = folderName || 'Sangam Coursework';

    if (this.customDriveApi && typeof this.customDriveApi.createFolder === 'function') {
      return await this.customDriveApi.createFolder(targetName, accessToken);
    }

    const url = 'https://www.googleapis.com/drive/v3/files?fields=id,name,mimeType,trashed';
    const body = {
      name: targetName,
      mimeType: 'application/vnd.google-apps.folder',
      description: 'Sangam Coursework Root Folder'
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const errText = await res.text();
      if (errText.includes('ACCESS_TOKEN_SCOPE_INSUFFICIENT') || errText.includes('insufficient authentication scopes')) {
        const scopeErr = new Error(
          'Google Drive access denied: Insufficient permission scopes. Please disconnect and reconnect your Google Drive account, ensuring you check the box to allow Sangam to access Google Drive files.'
        );
        scopeErr.statusCode = 403;
        scopeErr.code = 'ACCESS_TOKEN_SCOPE_INSUFFICIENT';
        throw scopeErr;
      }
      throw new Error(`Failed to create Google Drive folder (${res.status}): ${errText}`);
    }

    const data = await res.json();
    if (!data.id) {
      throw new Error('Google Drive API did not return a valid folder ID.');
    }

    return {
      id: data.id,
      name: data.name || targetName
    };
  }

  /**
   * Idempotently retrieves or creates the teacher's private 'Sangam Coursework' root folder.
   * Coordinates across concurrent requests and instances to prevent duplicate folders.
   *
   * @param {string} teacherUid - The authenticated teacher Firebase UID.
   * @param {string} [encryptionKey=null] - Optional encryption key override.
   * @returns {Promise<{ id: string, name: string }>}
   */
  async getOrCreateCourseworkFolder(teacherUid, encryptionKey = null) {
    if (!teacherUid || typeof teacherUid !== 'string' || teacherUid.trim() === '') {
      throw new Error('teacherUid is required to manage coursework folder.');
    }

    // 1. In-process promise deduplication for concurrent calls on same node instance
    if (this.folderLocks && this.folderLocks.has(teacherUid)) {
      return await this.folderLocks.get(teacherUid);
    }

    const task = (async () => {
      const db = this.getDb();
      const docRef = db.collection('faculty_storage_integrations').doc(teacherUid);

      const MAX_RETRIES = 10;
      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        // Read record
        const record = await this.getIntegration(teacherUid);
        if (!record) {
          throw new Error('No Google Drive integration found for teacher. Please connect Google Drive first.');
        }

        if (record.status !== 'connected') {
          throw new Error('Google Drive integration is not active. Please reconnect your account.');
        }

        // 2. If rootFolderId already exists, verify usability with provider
        if (record.rootFolderId && typeof record.rootFolderId === 'string') {
          const accessToken = await this.getValidAccessToken(teacherUid, encryptionKey);
          try {
            const verification = await this.verifyFolder(record.rootFolderId, accessToken);
            if (verification.exists) {
              return {
                id: record.rootFolderId,
                name: verification.name || record.rootFolderName || 'Sangam Coursework'
              };
            }
          } catch (verifyErr) {
            if (verifyErr.message && (verifyErr.message.includes('revoked') || verifyErr.message.includes('expired'))) {
              verifyErr.statusCode = verifyErr.statusCode || 401;
              verifyErr.code = verifyErr.code || 'GOOGLE_AUTH_REVOKED';
              throw verifyErr;
            }
            console.warn('[GoogleDriveService] Folder verification provider error:', verifyErr.message);
            throw new Error(`Failed to verify existing coursework folder with provider: ${verifyErr.message}`);
          }
          // If trashed/deleted in Drive (404), continue to acquire lease and recreate safely
        }

        // 3. Coordinate cross-instance creation lease via Firestore transaction
        let leaseAcquired = false;
        let waitAndRetry = false;

        if (typeof db.runTransaction === 'function') {
          await db.runTransaction(async (transaction) => {
            const snap = await transaction.get(docRef);
            if (!snap.exists) {
              throw new Error('Integration document not found during folder creation lease acquisition.');
            }
            const data = snap.data();

            if (data.rootFolderId) {
              return;
            }

            const now = Date.now();
            if (data.folderLockUntil && data.folderLockUntil > now) {
              waitAndRetry = true;
              return;
            }

            transaction.set(
              docRef,
              { folderLockUntil: now + 15000, updatedAt: new Date().toISOString() },
              { merge: true }
            );
            leaseAcquired = true;
          });
        } else {
          leaseAcquired = true;
        }

        if (waitAndRetry) {
          await new Promise((resolve) => setTimeout(resolve, 300));
          continue;
        }

        if (!leaseAcquired) {
          const updated = await this.getIntegration(teacherUid);
          if (updated && updated.rootFolderId) {
            return {
              id: updated.rootFolderId,
              name: updated.rootFolderName || 'Sangam Coursework'
            };
          }
          continue;
        }

        // 4. We hold the creation lease: call Google Drive API to create folder
        let newFolder;
        try {
          const validAccessToken = await this.getValidAccessToken(teacherUid, encryptionKey);
          newFolder = await this.createDriveFolder('Sangam Coursework', validAccessToken);
        } catch (createErr) {
          try {
            await docRef.set({ folderLockUntil: null }, { merge: true });
          } catch {
            // Ignore lease cleanup error
          }
          throw createErr;
        }

        // 5. Persist folder ID and clear lease in Firestore
        const nowIso = new Date().toISOString();
        const updatePayload = {
          rootFolderId: newFolder.id,
          rootFolderName: newFolder.name,
          rootFolderCreatedAt: nowIso,
          rootFolderUpdatedAt: nowIso,
          folderLockUntil: null,
          updatedAt: nowIso
        };

        if (typeof db.runTransaction === 'function') {
          await db.runTransaction(async (transaction) => {
            transaction.set(docRef, updatePayload, { merge: true });
          });
        } else {
          await docRef.set(updatePayload, { merge: true });
        }

        return {
          id: newFolder.id,
          name: newFolder.name
        };
      }

      throw new Error('Coursework folder creation timed out due to concurrent contention. Please try again.');
    })();

    if (!this.folderLocks) {
      this.folderLocks = new Map();
    }
    this.folderLocks.set(teacherUid, task);
    try {
      return await task;
    } finally {
      this.folderLocks.delete(teacherUid);
    }
  }

  /**
   * Disconnects Google Drive for a teacher, revoking tokens and deleting or deactivating credentials.
   *
   * @param {string} teacherUid
   * @param {string} [encryptionKey=null]
   * @returns {Promise<{ success: boolean, revoked: boolean, message: string }>}
   */
  async disconnect(teacherUid, encryptionKey = null) {
    const record = await this.getIntegration(teacherUid);
    if (!record) {
      return { success: true, revoked: false, message: 'No integration found.' };
    }

    let revoked = false;

    // Attempt to decrypt refresh or access token and revoke with Google
    try {
      if (record.encryptedRefreshToken && record.refreshTokenIv && record.refreshTokenAuthTag) {
        const rawRefreshToken = decrypt(
          {
            encryptedData: record.encryptedRefreshToken,
            iv: record.refreshTokenIv,
            authTag: record.refreshTokenAuthTag
          },
          encryptionKey
        );
        revoked = await this.revokeToken(rawRefreshToken);
      } else if (record.encryptedAccessToken && record.accessTokenIv && record.accessTokenAuthTag) {
        const rawAccessToken = decrypt(
          {
            encryptedData: record.encryptedAccessToken,
            iv: record.accessTokenIv,
            authTag: record.accessTokenAuthTag
          },
          encryptionKey
        );
        revoked = await this.revokeToken(rawAccessToken);
      }
    } catch (decryptErr) {
      console.warn('[GoogleDriveService] Failed to decrypt token during revocation:', decryptErr.message);
    }

    // Securely delete or nullify integration record from Firestore
    const db = this.getDb();
    await db.collection('faculty_storage_integrations').doc(teacherUid).delete();

    return {
      success: true,
      revoked,
      message: revoked
        ? 'Google Drive disconnected and authorization revoked successfully.'
        : 'Google Drive credentials deleted locally (provider revocation could not be confirmed).'
    };
  }

  /**
   * Authoritatively verifies whether a teacher has an active, authorized allocation
   * for the given department, year, and section.
   *
   * Checks:
   * 1. Canonical doc ID: {teacherUid}_{department}_{year}_{section}
   * 2. Canonical alias doc IDs (e.g. {teacherUid}_Computer Science_{year}_{section} vs CSE AI)
   * 3. Legacy doc ID: {teacherUid}_{year}_{section}
   * 4. Query lookup fallback for any doc matching teacherUid with authorized === true
   *
   * @param {string} teacherUid
   * @param {string} department
   * @param {string} year
   * @param {string} section
   * @param {string} [institution=null]
   * @returns {Promise<{ authorized: boolean, allocation?: object, reason?: string }>}
   */
  async verifyTeacherAllocation(teacherUid, department, year, section, institution = null) {
    if (!teacherUid || !department || !year || !section) {
      return { authorized: false, reason: 'Missing required class allocation parameters.' };
    }

    const db = this.getDb();
    if (!db) {
      throw new Error('Database is unavailable. Teacher allocation verification failed closed.');
    }

    // 1. Check Canonical Doc ID: {teacherUid}_{department}_{year}_{section}
    const canonicalId = `${teacherUid}_${department}_${year}_${section}`;
    try {
      const snap = await db.collection('teacher_allocations').doc(canonicalId).get();
      if (snap.exists) {
        const data = snap.data();
        if (data && data.authorized === true) {
          if (!institution || !data.institution || data.institution === institution) {
            return { authorized: true, allocation: data, allocationId: canonicalId };
          }
        }
      }
    } catch (err) {
      console.warn('[GoogleDriveService] Canonical allocation lookup probe warning:', err.message);
    }

    // 2. Check canonical alias doc IDs (e.g. Computer Science <-> CSE AI, ME <-> Mechanical Engineering)
    const aliases = [];
    const canonicalDept = CANONICAL_DEPARTMENT_MAP[department] || department;
    for (const [alias, mapped] of Object.entries(CANONICAL_DEPARTMENT_MAP)) {
      if ((mapped === canonicalDept || alias === department) && alias !== department) {
        aliases.push(alias);
      }
    }

    for (const aliasDept of aliases) {
      const aliasId = `${teacherUid}_${aliasDept}_${year}_${section}`;
      try {
        const snap = await db.collection('teacher_allocations').doc(aliasId).get();
        if (snap.exists) {
          const data = snap.data();
          if (data && data.authorized === true) {
            if (!institution || !data.institution || data.institution === institution) {
              return { authorized: true, allocation: data, allocationId: aliasId };
            }
          }
        }
      } catch (err) {
        // Continue fallback search
      }
    }

    // 3. Check Legacy Doc ID: {teacherUid}_{year}_{section}
    const legacyId = `${teacherUid}_${year}_${section}`;
    try {
      const snap = await db.collection('teacher_allocations').doc(legacyId).get();
      if (snap.exists) {
        const data = snap.data();
        if (data && data.authorized === true) {
          const deptMatches = !data.department || isMatchingDepartment(data.department, department);
          const instMatches = !institution || !data.institution || data.institution === institution;
          if (deptMatches && instMatches) {
            return { authorized: true, allocation: data, allocationId: legacyId };
          }
        }
      }
    } catch (err) {
      console.warn('[GoogleDriveService] Legacy allocation lookup probe warning:', err.message);
    }

    // 4. Query fallback: Query teacher_allocations where teacherUid matches
    try {
      const coll = db.collection('teacher_allocations');
      let queryRef;
      if (typeof coll.where === 'function') {
        queryRef = coll.where('teacherUid', '==', teacherUid);
      }
      if (queryRef) {
        const qSnap = await queryRef.get();
        const docs = qSnap.docs || [];
        for (const docSnap of docs) {
          const data = typeof docSnap.data === 'function' ? docSnap.data() : docSnap;
          if (data && data.authorized === true) {
            const yMatch = data.year === year;
            const sMatch = isMatchingSection(data.section, section);
            const dMatch = !data.department || isMatchingDepartment(data.department, department);
            const iMatch = !institution || !data.institution || data.institution === institution;
            if (yMatch && sMatch && dMatch && iMatch) {
              return { authorized: true, allocation: data, allocationId: docSnap.id };
            }
          }
        }
      }
    } catch (queryErr) {
      console.warn('[GoogleDriveService] Query allocation lookup probe warning:', queryErr.message);
    }

    return {
      authorized: false,
      reason: `No authorized allocation found in teacher_allocations for ${department} • ${year} • ${section}.`
    };
  }

  /**
   * Uploads a file buffer to a specific Google Drive folder using multipart upload.
   * Ensures private ownership with zero public permissions.
   *
   * @param {string} folderId - Target Google Drive folder ID.
   * @param {string} fileName - Safe filename for the file in Drive.
   * @param {string} mimeType - MIME type ('application/pdf').
   * @param {Buffer} fileBuffer - File binary contents.
   * @param {string} accessToken - Valid Google access token.
   * @param {object} [metadataExtra={}] - Additional metadata.
   * @returns {Promise<{ id: string, name: string, mimeType: string, size: number, webViewLink?: string }>}
   */
  async uploadFileToFolder(folderId, fileName, mimeType, fileBuffer, accessToken, metadataExtra = {}) {
    if (!folderId || !fileName || !fileBuffer || !accessToken) {
      throw new Error('folderId, fileName, fileBuffer, and accessToken are required for file upload.');
    }

    if (this.customDriveApi && typeof this.customDriveApi.uploadFile === 'function') {
      return await this.customDriveApi.uploadFile(folderId, fileName, mimeType, fileBuffer, accessToken, metadataExtra);
    }

    const boundary = `-------SangamDriveBoundary${crypto.randomBytes(16).toString('hex')}`;
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;

    const metadata = {
      name: fileName,
      parents: [folderId],
      mimeType: mimeType || 'application/pdf',
      ...metadataExtra
    };

    const metadataPart = Buffer.from(
      `${delimiter}Content-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}`,
      'utf-8'
    );
    const mediaHeader = Buffer.from(
      `${delimiter}Content-Type: ${mimeType || 'application/pdf'}\r\n\r\n`,
      'utf-8'
    );
    const closingPart = Buffer.from(closeDelimiter, 'utf-8');

    const multipartRequestBody = Buffer.concat([
      metadataPart,
      mediaHeader,
      fileBuffer,
      closingPart
    ]);

    const url = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,size,webViewLink,createdTime';

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
        'Content-Length': String(multipartRequestBody.length)
      },
      body: multipartRequestBody
    });

    if (!res.ok) {
      const errText = await res.text();
      let isRevoked = false;
      try {
        const parsed = JSON.parse(errText);
        if (parsed.error && (parsed.error.status === 'UNAUTHENTICATED' || parsed.error.code === 401)) {
          isRevoked = true;
        }
      } catch {
        if (errText.includes('invalid_grant') || errText.includes('revoked') || res.status === 401) {
          isRevoked = true;
        }
      }

      if (isRevoked) {
        const err = new Error('Google authorization has been revoked or expired. Please reconnect your account.');
        err.statusCode = 401;
        err.code = 'GOOGLE_AUTH_REVOKED';
        throw err;
      }
      throw new Error(`Google Drive upload error (${res.status}): ${errText}`);
    }

    const data = await res.json();
    if (!data.id) {
      throw new Error('Google Drive API response did not contain a valid file ID.');
    }

    return {
      id: data.id,
      name: data.name || fileName,
      mimeType: data.mimeType || mimeType,
      size: data.size ? Number(data.size) : fileBuffer.length,
      webViewLink: data.webViewLink
    };
  }

  /**
   * Orchestrates the complete teacher assignment PDF upload pipeline.
   *
   * 1. Authenticates role and allocation authorization against authoritative records.
   * 2. Coordinates idempotency keys across client retries to prevent duplicate Drive uploads.
   * 3. Ensures coursework folder exists in Google Drive.
   * 4. Uploads the PDF file to the teacher's private folder with zero public access.
   * 5. Persists assignment metadata in Firestore with the Drive file ID.
   * 6. Returns sanitized presentation metadata without leaking credentials.
   *
   * @param {object} params
   * @param {string} params.teacherUid - Verified teacher Firebase UID.
   * @param {string} [params.teacherEmail] - Verified teacher email.
   * @param {Buffer} params.fileBuffer - Validated PDF binary buffer.
   * @param {string} params.originalFileName - Original filename.
   * @param {number} params.fileSize - File size in bytes.
   * @param {object} params.assignmentData - Assignment form metadata.
   * @param {string} [params.idempotencyKey] - Optional client idempotency key.
   * @param {string} [params.encryptionKey] - Optional encryption key override.
   * @returns {Promise<{ assignment: object, isReplay: boolean }>}
   */
  async uploadAssignmentPdf({
    teacherUid,
    teacherEmail = null,
    fileBuffer,
    originalFileName,
    fileSize,
    assignmentData,
    idempotencyKey = null,
    encryptionKey = null
  }) {
    if (!teacherUid) {
      throw new Error('teacherUid is required.');
    }
    if (!fileBuffer || !Buffer.isBuffer(fileBuffer) || fileBuffer.length === 0) {
      throw new Error('Valid PDF file buffer is required.');
    }
    if (!assignmentData || typeof assignmentData !== 'object') {
      throw new Error('Assignment data object is required.');
    }

    // 1. Authoritative Teacher Role & Profile Verification
    const db = this.getDb();
    const userSnap = await db.collection('users').doc(teacherUid).get();
    if (!userSnap.exists) {
      const err = new Error('Forbidden: Teacher profile not found in users collection.');
      err.statusCode = 403;
      throw err;
    }

    const userData = userSnap.data();
    const role = (userData.role || '').toLowerCase();
    if (role !== 'faculty' && role !== 'teacher' && role !== 'director') {
      const err = new Error('Forbidden: Only faculty members or authorized teachers can create assignments.');
      err.statusCode = 403;
      throw err;
    }
    if (userData.status && userData.status !== 'active') {
      const err = new Error('Forbidden: Teacher account is not active.');
      err.statusCode = 403;
      throw err;
    }

    const institution = userData.institution || '';

    // 2. Validate Required Assignment Fields
    const title = (assignmentData.title || '').trim();
    const department = (assignmentData.department || '').trim();
    const year = (assignmentData.year || '').trim();
    const section = (assignmentData.section || '').trim();
    const dueDate = (assignmentData.dueDate || '').trim();
    const description = (assignmentData.description || '').trim();
    const subject = (assignmentData.subject || '').trim();
    const checkSimilarity = Boolean(assignmentData.checkSimilarity);

    if (!title || title.length > 200) {
      const err = new Error('Assignment title is required and must not exceed 200 characters.');
      err.statusCode = 400;
      throw err;
    }
    if (!department) {
      const err = new Error('Department is required.');
      err.statusCode = 400;
      throw err;
    }
    if (!year) {
      const err = new Error('Year is required.');
      err.statusCode = 400;
      throw err;
    }
    if (!section) {
      const err = new Error('Section is required.');
      err.statusCode = 400;
      throw err;
    }
    if (!dueDate) {
      const err = new Error('Due date is required.');
      err.statusCode = 400;
      throw err;
    }
    if (isNaN(Date.parse(dueDate))) {
      const err = new Error('Due date must be a valid date format.');
      err.statusCode = 400;
      throw err;
    }

    // 3. Class Allocation Authorization Check
    const allocCheck = await this.verifyTeacherAllocation(teacherUid, department, year, section, institution);
    if (!allocCheck.authorized) {
      const err = new Error(`Forbidden: Faculty member is not authorized for ${department} • ${year} • ${section}. Missing or unauthorized teacher allocation.`);
      err.statusCode = 403;
      throw err;
    }

    // 4. Safe Idempotency & In-Flight Concurrency Coordination
    let idempotencyDocRef = null;
    let existingDriveFileId = null;
    let existingDriveFileName = null;
    const safeKey = idempotencyKey ? String(idempotencyKey).trim().slice(0, 128) : null;

    if (safeKey) {
      const idempotencyDocId = `${teacherUid}_${safeKey}`;
      idempotencyDocRef = db.collection('upload_idempotency').doc(idempotencyDocId);

      const idempSnap = await idempotencyDocRef.get();
      if (idempSnap.exists) {
        const idempData = idempSnap.data();
        if (idempData.status === 'completed' && idempData.assignment) {
          // Idempotent replay: return completed record immediately without re-uploading
          return {
            assignment: idempData.assignment,
            isReplay: true
          };
        }

        if (idempData.status === 'pending') {
          const now = Date.now();
          if (idempData.createdAt && (now - idempData.createdAt < 30000)) {
            const err = new Error('An upload is currently in progress for this request. Please wait a moment.');
            err.statusCode = 409;
            err.status = 409;
            err.code = 'UPLOAD_IN_PROGRESS';
            throw err;
          }
          // If pending lock expired (>30s) and driveFileId was already obtained:
          // Reuse the existing Drive file to avoid creating duplicate files in Google Drive!
          if (idempData.driveFileId) {
            existingDriveFileId = idempData.driveFileId;
            existingDriveFileName = idempData.driveFileName;
          }
        }
      }

      // Record pending lock
      await idempotencyDocRef.set({
        teacherUid,
        idempotencyKey: safeKey,
        status: 'pending',
        driveFileId: existingDriveFileId || null,
        driveFileName: existingDriveFileName || null,
        createdAt: Date.now()
      }, { merge: true });
    }

    let driveFileId = existingDriveFileId;
    let driveFileName = existingDriveFileName;

    try {
      // 5. Verify Google Drive Integration & Root Coursework Folder
      const integration = await this.getIntegration(teacherUid);
      if (!integration || integration.status !== 'connected') {
        const err = new Error('Google Drive is not connected. Please connect your Google Drive account in Settings before uploading coursework.');
        err.statusCode = 424;
        err.code = 'DRIVE_NOT_CONNECTED';
        throw err;
      }

      const folder = await this.getOrCreateCourseworkFolder(teacherUid, encryptionKey);
      const validAccessToken = await this.getValidAccessToken(teacherUid, encryptionKey);

      // 6. Perform Private Upload to Google Drive (if not already uploaded in prior attempt)
      if (!driveFileId) {
        const sanitizedBase = (originalFileName || title)
          .replace(/[^a-zA-Z0-9._-]/g, '_')
          .replace(/\.pdf$/i, '');
        const safeUploadName = `Assignment_${sanitizedBase.slice(0, 40)}_${Date.now()}.pdf`;

        const uploadResult = await this.uploadFileToFolder(
          folder.id,
          safeUploadName,
          'application/pdf',
          fileBuffer,
          validAccessToken,
          { description: description || `Assignment: ${title} (${department} ${year} ${section})` }
        );

        driveFileId = uploadResult.id;
        driveFileName = uploadResult.name || safeUploadName;

        // Update idempotency tracker with the newly acquired Drive file ID
        if (idempotencyDocRef) {
          try {
            await idempotencyDocRef.set({
              driveFileId,
              driveFileName,
              updatedAt: Date.now()
            }, { merge: true });
          } catch {
            // Continue to persist assignment
          }
        }
      }

      // 7. Persist Assignment Document in Firestore
      const assignmentId = `asg_${crypto.randomUUID ? crypto.randomUUID() : (Date.now() + '_' + crypto.randomBytes(4).toString('hex'))}`;
      const nowIso = new Date().toISOString();

      const assignmentRecord = {
        id: assignmentId,
        teacherUid,
        teacherName: userData.name || (teacherEmail ? teacherEmail.split('@')[0] : 'Faculty'),
        teacherEmail: teacherEmail || userData.email || '',
        institution,
        department,
        year,
        section,
        subject: subject || (allocCheck.allocation && allocCheck.allocation.subject) || '',
        title,
        description,
        dueDate,
        checkSimilarity,
        storageProvider: 'google',
        driveFileId,
        driveFileName,
        fileSizeBytes: fileSize || fileBuffer.length,
        mimeType: 'application/pdf',
        idempotencyKey: safeKey,
        createdAt: nowIso,
        updatedAt: nowIso
      };

      try {
        await db.collection('assignments').doc(assignmentId).set(assignmentRecord);
      } catch (dbErr) {
        console.error('[GoogleDriveService] Failed to persist assignment to Firestore:', dbErr.message);
        const err = new Error(`Failed to record assignment in database: ${dbErr.message}`);
        err.statusCode = 500;
        err.driveFileId = driveFileId; // Recorded for recovery/diagnostics
        throw err;
      }

      // 8. Finalize Idempotency Record
      if (idempotencyDocRef) {
        try {
          await idempotencyDocRef.set({
            status: 'completed',
            assignmentId,
            assignment: assignmentRecord,
            completedAt: Date.now()
          }, { merge: true });
        } catch {
          // Non-blocking: assignment is already saved
        }
      }

      return {
        assignment: assignmentRecord,
        isReplay: false
      };
    } catch (uploadErr) {
      if (idempotencyDocRef && !driveFileId) {
        try {
          await idempotencyDocRef.delete();
        } catch {
          // Non-blocking cleanup
        }
      }
      throw uploadErr;
    }
  }

  /**
   * Orchestrates the student assignment PDF submission upload pipeline.
   *
   * 1. Verifies student identity and active status from authoritative user records.
   * 2. Loads assignment by ID from trusted Firestore collection; verifies assignment eligibility and academic scope.
   * 3. Validates assignment due date using server-side time.
   * 4. Derives the destination teacher from the trusted assignment record (never client-supplied).
   * 5. Verifies the teacher's Google Drive integration is connected and usable.
   * 6. Coordinates idempotency keys bound to student and assignment to prevent duplicate uploads on retries.
   * 7. Uploads PDF privately to teacher's connected coursework folder in Google Drive.
   * 8. Persists submission metadata in Firestore (updating previous submission if student submits again).
   * 9. Sanitizes response metadata without leaking tokens, credentials, or private folder IDs.
   *
   * @param {object} params
   * @param {string} params.studentUid - Verified student Firebase UID.
   * @param {string} [params.studentEmail] - Verified student email.
   * @param {string} params.assignmentId - Trusted assignment ID.
   * @param {Buffer} params.fileBuffer - Validated PDF binary buffer.
   * @param {string} params.originalFileName - Original filename.
   * @param {number} params.fileSize - File size in bytes.
   * @param {string} [params.idempotencyKey] - Optional client idempotency key.
   * @param {string} [params.encryptionKey] - Optional encryption key override.
   * @returns {Promise<{ submission: object, isReplay: boolean }>}
   */
  async uploadStudentSubmission({
    studentUid,
    studentEmail = null,
    assignmentId,
    fileBuffer,
    originalFileName,
    fileSize,
    idempotencyKey = null,
    encryptionKey = null
  }) {
    if (!studentUid) {
      const err = new Error('studentUid is required.');
      err.statusCode = 400;
      throw err;
    }
    if (!assignmentId || typeof assignmentId !== 'string' || !assignmentId.trim()) {
      const err = new Error('assignmentId is required.');
      err.statusCode = 400;
      throw err;
    }
    if (!fileBuffer || !Buffer.isBuffer(fileBuffer) || fileBuffer.length === 0) {
      const err = new Error('Valid PDF file buffer is required.');
      err.statusCode = 400;
      throw err;
    }

    const db = this.getDb();

    // 1. Authoritative Student Account & Status Verification
    const studentSnap = await db.collection('users').doc(studentUid).get();
    if (!studentSnap.exists) {
      const err = new Error('Forbidden: Student profile not found in users collection.');
      err.statusCode = 403;
      err.code = 'STUDENT_NOT_FOUND';
      throw err;
    }

    const studentData = studentSnap.data();
    const role = (studentData.role || '').toLowerCase();
    if (role !== 'student') {
      const err = new Error('Forbidden: Only authenticated students can submit assignments.');
      err.statusCode = 403;
      err.code = 'FORBIDDEN_ROLE';
      throw err;
    }
    if (studentData.status && studentData.status !== 'active') {
      const err = new Error('Forbidden: Student account is not active.');
      err.statusCode = 403;
      err.code = 'ACCOUNT_INACTIVE';
      throw err;
    }

    // 2. Load Assignment from Firestore
    const asgSnap = await db.collection('assignments').doc(assignmentId.trim()).get();
    if (!asgSnap.exists) {
      const err = new Error(`Assignment '${assignmentId}' not found in database.`);
      err.statusCode = 404;
      err.code = 'ASSIGNMENT_NOT_FOUND';
      throw err;
    }

    const assignment = asgSnap.data();
    const teacherUid = assignment.teacherUid;
    if (!teacherUid) {
      const err = new Error('Assignment record is corrupted or missing authorized teacher identification.');
      err.statusCode = 500;
      err.code = 'CORRUPTED_ASSIGNMENT';
      throw err;
    }

    // 3. Academic Scope & Eligibility Verification
    if (studentData.institution && assignment.institution && studentData.institution !== assignment.institution) {
      const err = new Error(`Forbidden: Student institution '${studentData.institution}' does not match assignment institution '${assignment.institution}'.`);
      err.statusCode = 403;
      err.code = 'FORBIDDEN_SCOPE';
      throw err;
    }

    if (studentData.department && assignment.department && !isMatchingDepartment(studentData.department, assignment.department)) {
      const err = new Error(`Forbidden: Student department '${studentData.department}' does not match assignment department '${assignment.department}'.`);
      err.statusCode = 403;
      err.code = 'FORBIDDEN_SCOPE';
      throw err;
    }

    if (studentData.year && assignment.year && studentData.year !== assignment.year) {
      const err = new Error(`Forbidden: Student year '${studentData.year}' does not match assignment year '${assignment.year}'.`);
      err.statusCode = 403;
      err.code = 'FORBIDDEN_SCOPE';
      throw err;
    }

    if (studentData.section && assignment.section && !isMatchingSection(studentData.section, assignment.section)) {
      const err = new Error(`Forbidden: Student section '${studentData.section}' does not match assignment section '${assignment.section}'.`);
      err.statusCode = 403;
      err.code = 'FORBIDDEN_SCOPE';
      throw err;
    }

    // 4. Server-Side Due Date Check
    if (isAssignmentPastDue(assignment.dueDate)) {
      const err = new Error(`Submission rejected: The due date for this assignment (${assignment.dueDate}) has passed.`);
      err.statusCode = 400;
      err.code = 'PAST_DUE';
      throw err;
    }

    // 5. Verify Teacher's Google Drive Integration
    const integration = await this.getIntegration(teacherUid);
    if (!integration || integration.status !== 'connected') {
      const err = new Error("Teacher's Google Drive is not connected. Coursework submissions cannot be uploaded until faculty connects their Google Drive in Settings.");
      err.statusCode = 424;
      err.code = 'TEACHER_DRIVE_DISCONNECTED';
      throw err;
    }

    // 6. Safe Idempotency & Concurrency Coordination
    let idempotencyDocRef = null;
    let existingDriveFileId = null;
    let existingDriveFileName = null;
    const safeKey = idempotencyKey ? String(idempotencyKey).trim().slice(0, 128) : null;

    if (safeKey) {
      const idempotencyDocId = `${studentUid}_${assignmentId}_${safeKey}`;
      idempotencyDocRef = db.collection('submission_idempotency').doc(idempotencyDocId);

      if (typeof db.runTransaction === 'function') {
        await db.runTransaction(async (transaction) => {
          const snap = await transaction.get(idempotencyDocRef);
          if (snap.exists) {
            const data = snap.data();
            if (data.status === 'completed' && data.submission) {
              return;
            }
            const now = Date.now();
            if (data.lockedUntil && data.lockedUntil > now) {
              const err = new Error('A submission upload with this key is already in progress.');
              err.statusCode = 409;
              err.code = 'SUBMISSION_IN_PROGRESS';
              throw err;
            }
            if (data.driveFileId) {
              existingDriveFileId = data.driveFileId;
              existingDriveFileName = data.driveFileName;
            }
          }

          transaction.set(idempotencyDocRef, {
            studentUid,
            assignmentId,
            status: 'in_progress',
            lockedUntil: Date.now() + 30000,
            driveFileId: existingDriveFileId || null,
            driveFileName: existingDriveFileName || null,
            createdAt: Date.now(),
            updatedAt: Date.now()
          }, { merge: true });
        });
      } else {
        const snap = await idempotencyDocRef.get();
        if (snap.exists) {
          const data = snap.data();
          if (data.status === 'completed' && data.submission) {
            return {
              submission: data.submission,
              isReplay: true
            };
          }
          const now = Date.now();
          if (data.lockedUntil && data.lockedUntil > now) {
            const err = new Error('A submission upload with this key is already in progress.');
            err.statusCode = 409;
            err.code = 'SUBMISSION_IN_PROGRESS';
            throw err;
          }
          if (data.driveFileId) {
            existingDriveFileId = data.driveFileId;
            existingDriveFileName = data.driveFileName;
          }
        }
        await idempotencyDocRef.set({
          studentUid,
          assignmentId,
          status: 'in_progress',
          lockedUntil: Date.now() + 30000,
          driveFileId: existingDriveFileId || null,
          driveFileName: existingDriveFileName || null,
          createdAt: Date.now(),
          updatedAt: Date.now()
        }, { merge: true });
      }

      // Check if transaction completed with existing completed submission
      const checkSnap = await idempotencyDocRef.get();
      if (checkSnap.exists && checkSnap.data().status === 'completed' && checkSnap.data().submission) {
        return {
          submission: checkSnap.data().submission,
          isReplay: true
        };
      }
    }

    let driveFileId = existingDriveFileId;
    let driveFileName = existingDriveFileName;

    try {
      // 7. Acquire Teacher Folder & Valid Access Token
      const folder = await this.getOrCreateCourseworkFolder(teacherUid, encryptionKey);
      const validAccessToken = await this.getValidAccessToken(teacherUid, encryptionKey);

      // 8. Upload PDF to Teacher's Google Drive (or reuse existing ID if crashed after upload before DB write)
      if (!driveFileId) {
        const sanitizedStudent = (studentData.name || studentUid).replace(/[^a-zA-Z0-9._-]/g, '_');
        const sanitizedTitle = (assignment.title || 'Assignment').replace(/[^a-zA-Z0-9._-]/g, '_');
        const studentRoll = studentData.roll || studentData.section || studentUid.slice(0, 8).toUpperCase();
        const safeUploadName = `Submission_${studentRoll}_${sanitizedStudent.slice(0, 30)}_${sanitizedTitle.slice(0, 30)}_${Date.now()}.pdf`;

        const uploadResult = await this.uploadFileToFolder(
          folder.id,
          safeUploadName,
          'application/pdf',
          fileBuffer,
          validAccessToken,
          { description: `Student submission: ${assignment.title} by ${studentData.name || studentUid}` }
        );

        driveFileId = uploadResult.id;
        driveFileName = uploadResult.name || safeUploadName;

        if (idempotencyDocRef) {
          try {
            await idempotencyDocRef.set({
              driveFileId,
              driveFileName,
              updatedAt: Date.now()
            }, { merge: true });
          } catch {
            // Non-blocking
          }
        }
      }

      // 9. Persist Submission Document in Firestore (deterministic doc ID per assignment and student replaces prior submission)
      const submissionId = `${assignmentId}_${studentUid}`;
      const nowIso = new Date().toISOString();

      const submissionRecord = {
        id: submissionId,
        assignmentId,
        assignmentTitle: assignment.title || '',
        studentUid,
        studentName: studentData.name || (studentEmail ? studentEmail.split('@')[0] : 'Student'),
        studentEmail: studentEmail || studentData.email || '',
        studentRoll: studentData.roll || studentData.section || studentUid.slice(0, 8).toUpperCase(),
        teacherUid,
        institution: assignment.institution || studentData.institution || '',
        department: assignment.department || studentData.department || '',
        year: assignment.year || studentData.year || '',
        section: assignment.section || studentData.section || '',
        storageProvider: 'google_drive',
        driveFileId,
        fileName: driveFileName,
        originalFileName: originalFileName || 'submission.pdf',
        fileSizeBytes: fileSize || fileBuffer.length,
        mimeType: 'application/pdf',
        idempotencyKey: safeKey,
        submittedAt: nowIso,
        updatedAt: nowIso
      };

      try {
        await db.collection('submissions').doc(submissionId).set(submissionRecord);
      } catch (dbErr) {
        console.error('[GoogleDriveService] Failed to persist submission to Firestore:', dbErr.message);
        const err = new Error(`Failed to record submission in database: ${dbErr.message}`);
        err.statusCode = 500;
        err.driveFileId = driveFileId;
        throw err;
      }

      // 10. Finalize Idempotency Record
      if (idempotencyDocRef) {
        try {
          await idempotencyDocRef.set({
            status: 'completed',
            submissionId,
            submission: submissionRecord,
            completedAt: Date.now()
          }, { merge: true });
        } catch {
          // Non-blocking
        }
      }

      return {
        submission: submissionRecord,
        isReplay: false
      };
    } catch (submitErr) {
      if (idempotencyDocRef && !driveFileId) {
        try {
          await idempotencyDocRef.delete();
        } catch {
          // Non-blocking cleanup
        }
      }
      throw submitErr;
    }
  }

  /**
   * Fetches persisted submissions for a student.
   * Ensures complete cross-student isolation: only returns submissions matching the studentUid.
   *
   * @param {string} studentUid
   * @returns {Promise<Array<object>>}
   */
  async getStudentSubmissions(studentUid) {
    if (!studentUid) {
      throw new Error('studentUid is required.');
    }
    const db = this.getDb();
    const submissionsRef = db.collection('submissions');

    let querySnapshot;
    if (typeof submissionsRef.where === 'function') {
      try {
        querySnapshot = await submissionsRef.where('studentUid', '==', studentUid).get();
      } catch {
        querySnapshot = await submissionsRef.get();
      }
    } else {
      querySnapshot = await submissionsRef.get();
    }

    const results = [];
    if (querySnapshot && querySnapshot.forEach) {
      querySnapshot.forEach(doc => {
        const data = doc.data();
        if (data && data.studentUid === studentUid) {
          results.push({
            id: data.id || doc.id,
            assignmentId: data.assignmentId,
            assignmentTitle: data.assignmentTitle,
            studentUid: data.studentUid,
            studentName: data.studentName,
            studentEmail: data.studentEmail,
            studentRoll: data.studentRoll,
            teacherUid: data.teacherUid,
            institution: data.institution,
            department: data.department,
            year: data.year,
            section: data.section,
            storageProvider: data.storageProvider || 'google_drive',
            driveFileId: data.driveFileId,
            fileName: data.fileName,
            originalFileName: data.originalFileName,
            fileSizeBytes: data.fileSizeBytes,
            submittedAt: data.submittedAt,
            updatedAt: data.updatedAt
          });
        }
      });
    }
    return results;
  }

  /**
   * Fetches a specific submission for an assignment and student.
   *
   * @param {string} assignmentId
   * @param {string} studentUid
   * @returns {Promise<object|null>}
   */
  async getAssignmentSubmission(assignmentId, studentUid) {
    if (!assignmentId || !studentUid) {
      return null;
    }
    const db = this.getDb();
    const docSnap = await db.collection('submissions').doc(`${assignmentId}_${studentUid}`).get();
    if (!docSnap.exists) {
      return null;
    }
    const data = docSnap.data();
    return {
      id: data.id || docSnap.id,
      assignmentId: data.assignmentId,
      assignmentTitle: data.assignmentTitle,
      studentUid: data.studentUid,
      studentName: data.studentName,
      studentEmail: data.studentEmail,
      studentRoll: data.studentRoll,
      teacherUid: data.teacherUid,
      storageProvider: data.storageProvider || 'google_drive',
      driveFileId: data.driveFileId,
      fileName: data.fileName,
      originalFileName: data.originalFileName,
      fileSizeBytes: data.fileSizeBytes,
      submittedAt: data.submittedAt,
      updatedAt: data.updatedAt
    };
  }

  /**
   * Downloads a binary file buffer from Google Drive using an authorized access token.
   * Never makes files public; streams directly using authenticated media download.
   *
   * @param {string} driveFileId - Google Drive file ID
   * @param {string} accessToken - Valid Google access token
   * @returns {Promise<Buffer>}
   */
  async downloadFile(driveFileId, accessToken) {
    if (!driveFileId || !accessToken) {
      throw new Error('driveFileId and accessToken are required for file download.');
    }

    if (this.customDriveApi && typeof this.customDriveApi.downloadFile === 'function') {
      const res = await this.customDriveApi.downloadFile(driveFileId, accessToken);
      if (Buffer.isBuffer(res)) {
        return res;
      }
      if (res && res.data && Buffer.isBuffer(res.data)) {
        return res.data;
      }
      if (res && typeof res === 'string') {
        return Buffer.from(res);
      }
      return Buffer.from(res || '');
    }

    const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(driveFileId)}?alt=media`;
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    if (res.status === 404) {
      const notFoundErr = new Error(`File '${driveFileId}' not found in Google Drive.`);
      notFoundErr.statusCode = 404;
      notFoundErr.code = 'FILE_NOT_FOUND';
      throw notFoundErr;
    }

    if (!res.ok) {
      const errText = await res.text();
      let isRevoked = false;
      if (errText.includes('invalid_grant') || errText.includes('revoked') || res.status === 401) {
        isRevoked = true;
      }
      if (isRevoked) {
        const err = new Error('Google authorization has been revoked or expired. Please reconnect your account.');
        err.statusCode = 401;
        err.code = 'GOOGLE_AUTH_REVOKED';
        throw err;
      }
      const err = new Error(`Google Drive download error (${res.status}): ${errText}`);
      err.statusCode = res.status;
      throw err;
    }

    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  /**
   * Evaluates if a student profile is academically eligible for an assignment.
   * Follows canonical department and section aliases.
   *
   * @param {object} studentData - User record from users collection
   * @param {object} assignment - Assignment record from assignments collection
   * @returns {boolean}
   */
  isStudentAuthorizedForAssignment(studentData, assignment) {
    if (!studentData || !assignment) return false;

    // 1. Institution matching (if configured on both)
    if (studentData.institution && assignment.institution && studentData.institution !== assignment.institution) {
      return false;
    }

    // 2. Department matching with canonical aliases
    if (studentData.department && assignment.department) {
      if (!isMatchingDepartment(studentData.department, assignment.department)) {
        return false;
      }
    }

    // 3. Academic year matching
    if (studentData.year && assignment.year && studentData.year !== assignment.year) {
      return false;
    }

    // 4. Section matching with aliases (e.g. 'Sec C' vs 'Section C')
    if (studentData.section && assignment.section) {
      if (!isMatchingSection(studentData.section, assignment.section)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Retrieves assignments accessible to a verified user based on role and academic scope.
   * - Students receive only assignments matching their department, year, and section,
   *   annotated with their individual submission status.
   * - Faculty members receive assignments they authored.
   * - Directors/admins receive all assignments within their institution.
   *
   * @param {string} userId - Authenticated Firebase UID
   * @returns {Promise<Array<object>>}
   */
  async getAssignmentsForUser(userId) {
    if (!userId) {
      throw new Error('userId is required.');
    }

    const db = this.getDb();
    const userSnap = await db.collection('users').doc(userId).get();
    if (!userSnap.exists) {
      return [];
    }

    const userData = userSnap.data();
    const role = (userData.role || '').toLowerCase();

    const assignmentsColl = db.collection('assignments');
    let assignmentsSnap;
    try {
      assignmentsSnap = await assignmentsColl.get();
    } catch (err) {
      console.error('[GoogleDriveService] Failed to query assignments:', err.message);
      throw new Error(`Failed to load assignments from database: ${err.message}`);
    }

    const rawAssignments = [];
    if (assignmentsSnap && assignmentsSnap.forEach) {
      assignmentsSnap.forEach((doc) => {
        const data = doc.data();
        if (data) {
          rawAssignments.push({ id: doc.id, ...data });
        }
      });
    }

    // Faculty view: return assignments authored by this teacher
    if (role === 'faculty' || role === 'teacher') {
      return rawAssignments
        .filter((asg) => asg.teacherUid === userId)
        .map((asg) => ({
          id: asg.id,
          title: asg.title,
          description: asg.description || '',
          subject: asg.subject || '',
          department: asg.department,
          year: asg.year,
          section: asg.section,
          dueDate: asg.dueDate,
          teacherUid: asg.teacherUid,
          teacherName: asg.teacherName || userData.name || 'Faculty',
          teacherEmail: asg.teacherEmail || userData.email || '',
          hasFile: Boolean(asg.driveFileId),
          fileName: asg.driveFileName || 'assignment.pdf',
          fileSizeBytes: asg.fileSizeBytes || null,
          mimeType: asg.mimeType || 'application/pdf',
          storageProvider: asg.storageProvider || 'google',
          createdAt: asg.createdAt,
          updatedAt: asg.updatedAt
        }));
    }

    // Director / Admin view: return assignments for the institution
    if (role === 'director' || role === 'admin') {
      return rawAssignments
        .filter((asg) => !userData.institution || !asg.institution || asg.institution === userData.institution)
        .map((asg) => ({
          id: asg.id,
          title: asg.title,
          description: asg.description || '',
          subject: asg.subject || '',
          department: asg.department,
          year: asg.year,
          section: asg.section,
          dueDate: asg.dueDate,
          teacherUid: asg.teacherUid,
          teacherName: asg.teacherName || 'Faculty',
          teacherEmail: asg.teacherEmail || '',
          hasFile: Boolean(asg.driveFileId),
          fileName: asg.driveFileName || 'assignment.pdf',
          fileSizeBytes: asg.fileSizeBytes || null,
          mimeType: asg.mimeType || 'application/pdf',
          storageProvider: asg.storageProvider || 'google',
          createdAt: asg.createdAt,
          updatedAt: asg.updatedAt
        }));
    }

    // Student view:
    // If account is inactive, return empty list
    if (userData.status && userData.status !== 'active') {
      return [];
    }

    // Filter assignments matching student's department, year, and section
    const matching = rawAssignments.filter((asg) => this.isStudentAuthorizedForAssignment(userData, asg));

    // Fetch student's submissions to annotate submission status
    const studentSubmissions = await this.getStudentSubmissions(userId);
    const submissionMap = new Map();
    studentSubmissions.forEach((sub) => {
      submissionMap.set(sub.assignmentId, sub);
    });

    return matching.map((asg) => {
      const sub = submissionMap.get(asg.id);
      return {
        id: asg.id,
        title: asg.title,
        description: asg.description || '',
        subject: asg.subject || '',
        department: asg.department,
        year: asg.year,
        section: asg.section,
        dueDate: asg.dueDate,
        teacherUid: asg.teacherUid,
        teacherName: asg.teacherName || (asg.teacherEmail ? asg.teacherEmail.split('@')[0] : 'Faculty'),
        teacherEmail: asg.teacherEmail || '',
        hasFile: Boolean(asg.driveFileId),
        fileName: asg.driveFileName || 'assignment.pdf',
        fileSizeBytes: asg.fileSizeBytes || null,
        mimeType: asg.mimeType || 'application/pdf',
        storageProvider: asg.storageProvider || 'google',
        createdAt: asg.createdAt,
        updatedAt: asg.updatedAt,
        isSubmitted: Boolean(sub),
        submission: sub || null
      };
    });
  }

  /**
   * Retrieves an assignment's original teacher-uploaded PDF file from Google Drive.
   * Authorizes the requesting student against class scope, or verifies the owning teacher.
   * Retrieves the file using the teacher's stored OAuth credentials and streams binary.
   *
   * @param {string} assignmentId - Assignment ID
   * @param {string} requestingUserId - Authenticated Firebase UID
   * @param {string} [encryptionKey=null] - Optional encryption key override
   * @returns {Promise<{ fileBuffer: Buffer, fileName: string, mimeType: string, fileSizeBytes: number }>}
   */
  async getAssignmentFile(assignmentId, requestingUserId, encryptionKey = null) {
    if (!assignmentId || typeof assignmentId !== 'string' || !assignmentId.trim()) {
      const err = new Error('assignmentId is required.');
      err.statusCode = 400;
      err.code = 'INVALID_ARGUMENT';
      throw err;
    }

    if (!requestingUserId || typeof requestingUserId !== 'string' || !requestingUserId.trim()) {
      const err = new Error('Unauthorized: User identity could not be verified.');
      err.statusCode = 401;
      err.code = 'UNAUTHORIZED';
      throw err;
    }

    const db = this.getDb();
    const asgSnap = await db.collection('assignments').doc(assignmentId.trim()).get();
    if (!asgSnap.exists) {
      const err = new Error(`Assignment '${assignmentId}' not found in database.`);
      err.statusCode = 404;
      err.code = 'ASSIGNMENT_NOT_FOUND';
      throw err;
    }

    const assignment = asgSnap.data();
    if (!assignment.driveFileId) {
      const err = new Error('No PDF file is attached to this assignment.');
      err.statusCode = 404;
      err.code = 'FILE_NOT_FOUND';
      throw err;
    }

    const teacherUid = assignment.teacherUid;
    if (!teacherUid) {
      const err = new Error('Assignment record is corrupted or missing authorized teacher identification.');
      err.statusCode = 500;
      err.code = 'CORRUPTED_ASSIGNMENT';
      throw err;
    }

    // Role & Authorization Check
    const isOwnerTeacher = (requestingUserId === teacherUid);

    if (!isOwnerTeacher) {
      const userSnap = await db.collection('users').doc(requestingUserId).get();
      if (!userSnap.exists) {
        const err = new Error('Forbidden: User profile not found.');
        err.statusCode = 403;
        err.code = 'USER_NOT_FOUND';
        throw err;
      }

      const userData = userSnap.data();
      const role = (userData.role || '').toLowerCase();

      if (role === 'director' || role === 'admin') {
        if (userData.institution && assignment.institution && userData.institution !== assignment.institution) {
          const err = new Error('Forbidden: Institution mismatch.');
          err.statusCode = 403;
          err.code = 'FORBIDDEN_SCOPE';
          throw err;
        }
      } else if (role === 'student') {
        if (userData.status && userData.status !== 'active') {
          const err = new Error('Forbidden: Student account is not active.');
          err.statusCode = 403;
          err.code = 'ACCOUNT_INACTIVE';
          throw err;
        }

        const isScopeAuthorized = this.isStudentAuthorizedForAssignment(userData, assignment);
        if (!isScopeAuthorized) {
          const err = new Error('Forbidden: You are not authorized to access this assignment (academic class/section mismatch).');
          err.statusCode = 403;
          err.code = 'FORBIDDEN_SCOPE';
          throw err;
        }
      } else {
        const err = new Error('Forbidden: You do not have permission to access this assignment file.');
        err.statusCode = 403;
        err.code = 'FORBIDDEN';
        throw err;
      }
    }

    // Retrieve valid access token for the teacher owning the Google Drive file
    const validAccessToken = await this.getValidAccessToken(teacherUid, encryptionKey);

    // Download file buffer from Google Drive API
    const fileBuffer = await this.downloadFile(assignment.driveFileId, validAccessToken);

    let safeFileName = assignment.driveFileName || 'assignment.pdf';
    if (!safeFileName.toLowerCase().endsWith('.pdf')) {
      safeFileName += '.pdf';
    }

    return {
      fileBuffer,
      fileName: safeFileName,
      mimeType: assignment.mimeType || 'application/pdf',
      fileSizeBytes: assignment.fileSizeBytes || fileBuffer.length
    };
  }

  /**
   * Evaluates if a faculty member is authorized for an assignment or class section.
   * Checks assignment ownership, teacher allocations, or administrative scope.
   *
   * @param {object} teacherUserData - User record from users collection
   * @param {object} assignment - Assignment record from assignments collection
   * @param {Array<object>} [allocations=[]] - Teacher allocations
   * @returns {boolean}
   */
  isTeacherAuthorizedForAssignment(teacherUserData, assignment, allocations = []) {
    if (!teacherUserData || !assignment) return false;
    const teacherUid = teacherUserData.uid || teacherUserData.id;
    if (assignment.teacherUid && teacherUid && assignment.teacherUid === teacherUid) {
      return true;
    }
    const role = (teacherUserData.role || '').toLowerCase();
    if (role === 'director' || role === 'admin') {
      if (teacherUserData.institution && assignment.institution && teacherUserData.institution !== assignment.institution) {
        return false;
      }
      return true;
    }
    if (role === 'faculty' || role === 'teacher') {
      const userAllocations = Array.isArray(allocations) && allocations.length > 0
        ? allocations
        : (Array.isArray(teacherUserData.allocations) ? teacherUserData.allocations : []);

      const allocMatch = userAllocations.some(alloc => {
        if (alloc.authorized === false) return false;
        const deptOk = !alloc.department || !assignment.department || isMatchingDepartment(alloc.department, assignment.department);
        const yrOk = !alloc.year || !assignment.year || String(alloc.year).trim().toLowerCase() === String(assignment.year).trim().toLowerCase();
        const secOk = !alloc.section || !assignment.section || isMatchingSection(alloc.section, assignment.section);
        return deptOk && yrOk && secOk;
      });
      if (allocMatch) return true;

      // If no allocations configured, fall back to matching department if specified
      if (userAllocations.length === 0 && teacherUserData.department && assignment.department) {
        return isMatchingDepartment(teacherUserData.department, assignment.department);
      }
    }
    return false;
  }

  /**
   * Retrieves submissions for a specific assignment for authorized faculty.
   * Enforces that students cannot access other students' submissions,
   * and faculty cannot access submissions for unassigned/unrelated sections.
   *
   * @param {string} assignmentId
   * @param {string} requestingUserId
   * @returns {Promise<{ success: boolean, assignment: object, submissions: Array<object>, totalSubmissions: number }>}
   */
  async getAssignmentSubmissions(assignmentId, requestingUserId) {
    if (!assignmentId || typeof assignmentId !== 'string' || !assignmentId.trim()) {
      const err = new Error('assignmentId is required.');
      err.statusCode = 400;
      err.code = 'INVALID_ARGUMENT';
      throw err;
    }
    if (!requestingUserId || typeof requestingUserId !== 'string' || !requestingUserId.trim()) {
      const err = new Error('Unauthorized: User identity could not be verified.');
      err.statusCode = 401;
      err.code = 'UNAUTHORIZED';
      throw err;
    }

    const db = this.getDb();
    const asgSnap = await db.collection('assignments').doc(assignmentId.trim()).get();
    if (!asgSnap.exists) {
      const err = new Error(`Assignment '${assignmentId}' not found in database.`);
      err.statusCode = 404;
      err.code = 'ASSIGNMENT_NOT_FOUND';
      throw err;
    }

    const assignment = asgSnap.data();
    assignment.id = asgSnap.id;

    const userSnap = await db.collection('users').doc(requestingUserId).get();
    if (!userSnap.exists) {
      const err = new Error('Forbidden: User profile not found.');
      err.statusCode = 403;
      err.code = 'USER_NOT_FOUND';
      throw err;
    }

    const userData = userSnap.data();
    userData.uid = userSnap.id;
    const role = (userData.role || '').toLowerCase();

    // Students are strictly blocked from retrieving assignment submissions
    if (role === 'student') {
      const err = new Error("Forbidden: Students are not authorized to view assignment submissions.");
      err.statusCode = 403;
      err.code = 'FORBIDDEN_ROLE';
      throw err;
    }

    // Faculty authorization: check ownership or allocation
    let allocations = [];
    try {
      const allocRef = db.collection('teacher_allocations');
      if (typeof allocRef.where === 'function') {
        const allocSnap = await allocRef.where('teacherUid', '==', requestingUserId).get();
        if (allocSnap && allocSnap.forEach) {
          allocSnap.forEach(d => allocations.push(d.data()));
        }
      }
    } catch {
      // Non-blocking
    }

    const isAuthorized = this.isTeacherAuthorizedForAssignment(userData, assignment, allocations);
    if (!isAuthorized) {
      const err = new Error('Forbidden: You are not authorized to view submissions for this assignment.');
      err.statusCode = 403;
      err.code = 'FORBIDDEN_SCOPE';
      throw err;
    }

    // Query submissions collection for this assignmentId
    const subRef = db.collection('submissions');
    let subSnap;
    if (typeof subRef.where === 'function') {
      try {
        subSnap = await subRef.where('assignmentId', '==', assignmentId.trim()).get();
      } catch {
        subSnap = await subRef.get();
      }
    } else {
      subSnap = await subRef.get();
    }

    const submissions = [];
    if (subSnap && subSnap.forEach) {
      const rawList = [];
      subSnap.forEach(doc => {
        const data = doc.data();
        if (data && data.assignmentId === assignmentId.trim()) {
          rawList.push({ id: doc.id, ...data });
        }
      });

      for (const item of rawList) {
        let studentName = item.studentName;
        let studentRoll = item.studentRoll;
        let studentEmail = item.studentEmail;

        // Resolve missing student details from users collection using studentUid
        if ((!studentName || studentName === 'Student' || !studentRoll) && item.studentUid) {
          try {
            const stSnap = await db.collection('users').doc(item.studentUid).get();
            if (stSnap.exists) {
              const stData = stSnap.data();
              if (!studentName || studentName === 'Student') {
                studentName = stData.name || (stData.email ? stData.email.split('@')[0] : 'Student');
              }
              if (!studentRoll) {
                studentRoll = stData.roll || stData.enrollmentNo || stData.studentId || '';
              }
              if (!studentEmail) {
                studentEmail = stData.email || '';
              }
            }
          } catch {
            // Non-blocking
          }
        }

        submissions.push({
          id: item.id,
          assignmentId: item.assignmentId,
          assignmentTitle: item.assignmentTitle || assignment.title || '',
          studentUid: item.studentUid,
          studentName: studentName || 'Student',
          studentRoll: studentRoll || '',
          studentEmail: studentEmail || '',
          department: item.department || assignment.department || '',
          year: item.year || assignment.year || '',
          section: item.section || assignment.section || '',
          fileName: item.fileName || item.originalFileName || 'submission.pdf',
          originalFileName: item.originalFileName || item.fileName || 'submission.pdf',
          fileSizeBytes: item.fileSizeBytes || null,
          mimeType: item.mimeType || 'application/pdf',
          driveFileId: item.driveFileId,
          status: 'Submitted',
          submittedAt: item.submittedAt || null,
          updatedAt: item.updatedAt || null
        });
      }
    }

    // Sort submissions: newest first
    submissions.sort((a, b) => new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0));

    return {
      success: true,
      assignment: {
        id: assignment.id,
        title: assignment.title,
        description: assignment.description || '',
        department: assignment.department,
        year: assignment.year,
        section: assignment.section,
        dueDate: assignment.dueDate,
        teacherUid: assignment.teacherUid,
        hasFile: Boolean(assignment.driveFileId),
        fileName: assignment.driveFileName || 'assignment.pdf'
      },
      submissions,
      totalSubmissions: submissions.length
    };
  }

  /**
   * Retrieves an individual student submission PDF from Google Drive.
   * Verifies that the requester is either the student who submitted or an authorized faculty/admin.
   *
   * @param {string} submissionId - Submission ID
   * @param {string} requestingUserId - Authenticated Firebase UID
   * @param {string} [encryptionKey=null] - Optional encryption key override
   * @returns {Promise<{ fileBuffer: Buffer, fileName: string, mimeType: string, fileSizeBytes: number }>}
   */
  async getSubmissionFile(submissionId, requestingUserId, encryptionKey = null) {
    if (!submissionId || typeof submissionId !== 'string' || !submissionId.trim()) {
      const err = new Error('submissionId is required.');
      err.statusCode = 400;
      err.code = 'INVALID_ARGUMENT';
      throw err;
    }
    if (!requestingUserId || typeof requestingUserId !== 'string' || !requestingUserId.trim()) {
      const err = new Error('Unauthorized: User identity could not be verified.');
      err.statusCode = 401;
      err.code = 'UNAUTHORIZED';
      throw err;
    }

    const db = this.getDb();
    const subSnap = await db.collection('submissions').doc(submissionId.trim()).get();
    if (!subSnap.exists) {
      const err = new Error(`Submission '${submissionId}' not found in database.`);
      err.statusCode = 404;
      err.code = 'SUBMISSION_NOT_FOUND';
      throw err;
    }

    const submission = subSnap.data();
    submission.id = subSnap.id;
    if (!submission.driveFileId) {
      const err = new Error('No PDF file is attached to this submission.');
      err.statusCode = 404;
      err.code = 'FILE_NOT_FOUND';
      throw err;
    }

    const userSnap = await db.collection('users').doc(requestingUserId).get();
    if (!userSnap.exists) {
      const err = new Error('Forbidden: User profile not found.');
      err.statusCode = 403;
      err.code = 'USER_NOT_FOUND';
      throw err;
    }

    const userData = userSnap.data();
    userData.uid = userSnap.id;
    const role = (userData.role || '').toLowerCase();

    // Check authorization:
    // 1. If student: ONLY the student who submitted can access
    if (role === 'student') {
      if (submission.studentUid !== requestingUserId) {
        const err = new Error("Forbidden: Students cannot access other students' submissions.");
        err.statusCode = 403;
        err.code = 'FORBIDDEN';
        throw err;
      }
    } else if (role === 'faculty' || role === 'teacher') {
      // 2. If faculty: owner teacher or allocated teacher
      let isAuthorized = (submission.teacherUid === requestingUserId);
      if (!isAuthorized) {
        let allocations = [];
        try {
          const allocRef = db.collection('teacher_allocations');
          if (typeof allocRef.where === 'function') {
            const allocSnap = await allocRef.where('teacherUid', '==', requestingUserId).get();
            if (allocSnap && allocSnap.forEach) {
              allocSnap.forEach(d => allocations.push(d.data()));
            }
          }
        } catch {
          // fallback
        }
        isAuthorized = this.isTeacherAuthorizedForAssignment(userData, {
          department: submission.department,
          year: submission.year,
          section: submission.section,
          institution: submission.institution
        }, allocations);
      }
      if (!isAuthorized) {
        const err = new Error('Forbidden: You are not authorized to access submissions for this section.');
        err.statusCode = 403;
        err.code = 'FORBIDDEN_SCOPE';
        throw err;
      }
    } else if (role === 'director' || role === 'admin') {
      if (userData.institution && submission.institution && userData.institution !== submission.institution) {
        const err = new Error('Forbidden: Institution mismatch.');
        err.statusCode = 403;
        err.code = 'FORBIDDEN_SCOPE';
        throw err;
      }
    } else {
      const err = new Error('Forbidden: You do not have permission to access this submission file.');
      err.statusCode = 403;
      err.code = 'FORBIDDEN';
      throw err;
    }

    // Retrieve valid access token for the teacher who owns the Google Drive storage
    const teacherUid = submission.teacherUid;
    if (!teacherUid) {
      const err = new Error('Submission record is missing teacher storage reference.');
      err.statusCode = 500;
      err.code = 'CORRUPTED_SUBMISSION';
      throw err;
    }

    const validAccessToken = await this.getValidAccessToken(teacherUid, encryptionKey);
    const fileBuffer = await this.downloadFile(submission.driveFileId, validAccessToken);

    let safeFileName = submission.originalFileName || submission.fileName || 'submission.pdf';
    if (!safeFileName.toLowerCase().endsWith('.pdf')) {
      safeFileName += '.pdf';
    }

    return {
      fileBuffer,
      fileName: safeFileName,
      mimeType: submission.mimeType || 'application/pdf',
      fileSizeBytes: submission.fileSizeBytes || fileBuffer.length
    };
  }

  /**
   * Retrieves active students for a section, scoped to authorized faculty or directors.
   * Students cannot access section rosters.
   *
   * @param {object} params
   * @param {string} [params.institution]
   * @param {string} [params.department]
   * @param {string} [params.year]
   * @param {string} [params.section]
   * @param {string} params.requestingUserId
   * @returns {Promise<{ success: boolean, students: Array<object>, totalStudents: number }>}
   */
  async getStudentsForSection({ institution, department, year, section, requestingUserId }) {
    if (!requestingUserId || typeof requestingUserId !== 'string' || !requestingUserId.trim()) {
      const err = new Error('Unauthorized: User identity could not be verified.');
      err.statusCode = 401;
      err.code = 'UNAUTHORIZED';
      throw err;
    }

    const db = this.getDb();
    const userSnap = await db.collection('users').doc(requestingUserId).get();
    if (!userSnap.exists) {
      const err = new Error('Forbidden: User profile not found.');
      err.statusCode = 403;
      err.code = 'USER_NOT_FOUND';
      throw err;
    }

    const userData = userSnap.data();
    userData.uid = userSnap.id;
    const role = (userData.role || '').toLowerCase();

    // Students are not permitted to enumerate section student lists
    if (role === 'student') {
      const err = new Error('Forbidden: Students cannot access section rosters.');
      err.statusCode = 403;
      err.code = 'FORBIDDEN_ROLE';
      throw err;
    }

    // Authorization check for faculty
    if (role === 'faculty' || role === 'teacher') {
      let allocations = [];
      try {
        const allocRef = db.collection('teacher_allocations');
        if (typeof allocRef.where === 'function') {
          const allocSnap = await allocRef.where('teacherUid', '==', requestingUserId).get();
          if (allocSnap && allocSnap.forEach) {
            allocSnap.forEach(d => allocations.push(d.data()));
          }
        }
      } catch {
        // fallback
      }

      const isAuthorized = this.isTeacherAuthorizedForAssignment(userData, {
        department,
        year,
        section,
        institution
      }, allocations);

      if (!isAuthorized) {
        const err = new Error('Forbidden: You are not authorized to view students for this section.');
        err.statusCode = 403;
        err.code = 'FORBIDDEN_SCOPE';
        throw err;
      }
    } else if (role === 'director' || role === 'admin') {
      if (institution && userData.institution && institution !== userData.institution) {
        const err = new Error('Forbidden: Institution mismatch.');
        err.statusCode = 403;
        err.code = 'FORBIDDEN_SCOPE';
        throw err;
      }
    }

    // Query active students
    const usersRef = db.collection('users');
    let snap;
    if (typeof usersRef.where === 'function') {
      try {
        snap = await usersRef.where('role', '==', 'student').get();
      } catch {
        snap = await usersRef.get();
      }
    } else {
      snap = await usersRef.get();
    }

    const students = [];
    const seenUids = new Set();
    const seenEmails = new Set();

    if (snap && snap.forEach) {
      snap.forEach(doc => {
        const d = doc.data();
        if (!d) return;
        const studentRole = (d.role || '').toLowerCase();
        if (studentRole !== 'student') return;
        if (d.status && d.status !== 'active') return;

        // Institution filter if provided
        if (institution && d.institution && d.institution !== institution) return;

        // Department filter
        if (department && d.department && !isMatchingDepartment(d.department, department)) return;

        // Year filter
        if (year && d.year && String(d.year).trim().toLowerCase() !== String(year).trim().toLowerCase()) return;

        // Section filter
        if (section && d.section && !isMatchingSection(d.section, section)) return;

        const uid = d.uid || doc.id;
        const email = (d.email || '').toLowerCase().trim();
        if (seenUids.has(uid) || (email && seenEmails.has(email))) return;
        seenUids.add(uid);
        if (email) seenEmails.add(email);

        students.push({
          id: doc.id,
          uid: uid,
          name: d.name || (email ? email.split('@')[0] : 'Student'),
          roll: d.roll || d.enrollmentNo || d.studentId || '',
          email: d.email || '',
          department: d.department || department || '',
          year: d.year || year || '',
          section: d.section || section || '',
          institution: d.institution || institution || ''
        });
      });
    }

    // Sort students by roll then name
    students.sort((a, b) => (a.roll || '').localeCompare(b.roll || '') || a.name.localeCompare(b.name));

    return {
      success: true,
      students,
      totalStudents: students.length
    };
  }
}

/**
 * Evaluates whether an assignment's due date has passed using server-side time.
 * If given a date-only string (e.g. 'YYYY-MM-DD'), due time is interpreted as end of that day (23:59:59.999).
 *
 * @param {string} dueDate - The assignment due date string.
 * @param {number} [referenceTime=Date.now()] - Current epoch ms (overrideable for testing).
 * @returns {boolean} True if past due, false otherwise.
 */
export function isAssignmentPastDue(dueDate, referenceTime = Date.now()) {
  if (!dueDate || typeof dueDate !== 'string' || !dueDate.trim()) {
    return false;
  }
  const trimmed = dueDate.trim();
  let dueTimestamp;

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [y, m, d] = trimmed.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d, 23, 59, 59, 999);
    dueTimestamp = dateObj.getTime();
  } else {
    dueTimestamp = Date.parse(trimmed);
  }

  if (isNaN(dueTimestamp)) {
    return false;
  }

  return referenceTime > dueTimestamp;
}

// Canonical department aliases mapping matching firestore.rules and attendanceService.js
export const CANONICAL_DEPARTMENT_MAP = {
  'CSE AI': 'Computer Science',
  'CSE': 'Computer Science',
  'Computer Science': 'Computer Science',
  'IT': 'Information Technology',
  'Information Technology': 'Information Technology',
  'ECE': 'Electronics & Communication',
  'Electronics & Communication': 'Electronics & Communication',
  'EE': 'Electrical Engineering',
  'Electrical Engineering': 'Electrical Engineering',
  'ME': 'Mechanical Engineering',
  'Mechanical Engineering': 'Mechanical Engineering',
  'CE': 'Civil Engineering',
  'Civil Engineering': 'Civil Engineering',
  'BT': 'Biotechnology',
  'Biotechnology': 'Biotechnology',
  'Management': 'Management'
};

/**
 * Checks if two department names match directly or via canonical department aliases.
 */
export function isMatchingDepartment(d1, d2) {
  if (!d1 || !d2) return false;
  if (d1 === d2) return true;
  const c1 = CANONICAL_DEPARTMENT_MAP[d1] || d1;
  const c2 = CANONICAL_DEPARTMENT_MAP[d2] || d2;
  return c1 === c2;
}

/**
 * Checks if two section strings match directly or via standard aliases (e.g. 'Sec A' vs 'Section A').
 */
export function isMatchingSection(s1, s2) {
  if (!s1 || !s2) return false;
  if (s1 === s2) return true;
  const n1 = String(s1).toUpperCase().replace(/[^A-Z0-9]/g, '');
  const n2 = String(s2).toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (n1 === n2) return true;

  // Extract letter or number suffix e.g. A, B, C, D from Sec A, Section A, CSE-A
  const clean1 = n1.replace(/^(SECTION|SEC|CSE)/, '');
  const clean2 = n2.replace(/^(SECTION|SEC|CSE)/, '');
  if (clean1 && clean2 && clean1 === clean2) {
    return true;
  }
  return n1.endsWith(n2) || n2.endsWith(n1);
}

export const googleDriveService = new GoogleDriveService();

export default {
  GOOGLE_OAUTH_SCOPES,
  CANONICAL_DEPARTMENT_MAP,
  isMatchingDepartment,
  isMatchingSection,
  isAssignmentPastDue,
  stateManager,
  GoogleDriveService,
  googleDriveService
};

