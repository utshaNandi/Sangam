import { getAdminAuth } from '../config/firebaseAdmin.js';

/**
 * Creates reusable Express middleware for verifying Firebase Authentication ID tokens.
 *
 * @param {object|null} [customAuthService=null] - Optional injected Auth service for mocking and unit testing.
 * @returns {import('express').RequestHandler} Express middleware handler.
 */
let activeCustomAuthService = null;

/**
 * Injects an active custom Auth service double for testing.
 *
 * @param {object|null} [customService=null]
 */
export function setCustomAuthService(customService = null) {
  activeCustomAuthService = customService;
}

export function createAuthMiddleware(customAuthService = null) {
  return async function verifyFirebaseToken(req, res, next) {
    const authHeader = req.headers.authorization;

    // 1. Missing Authorization header
    if (!authHeader) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: Missing Authorization header.'
      });
    }

    // 2. Malformed Authorization header scheme
    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: Malformed Authorization header. Expected Bearer <token>.'
      });
    }

    const idToken = authHeader.substring(7).trim();

    // 3. Empty token
    if (!idToken) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: Empty token provided in Authorization header.'
      });
    }

    try {
      const auth = customAuthService || activeCustomAuthService || getAdminAuth();
      // Verify token with checkRevoked = true to reject revoked tokens immediately
      const decodedToken = await auth.verifyIdToken(idToken, true);

      // 4. Attach verified, cryptographically proven identity to the request
      req.user = decodedToken;
      req.userId = decodedToken.uid;
      req.userEmail = decodedToken.email;

      // 5. Anti-spoofing check: If the request body attempts to supply a UID,
      // it must match the verified token UID. Never trust client-supplied identity!
      if (req.body && typeof req.body === 'object') {
        const candidateUid = req.body.uid || req.body.userId || req.body.facultyUid || req.body.teacherUid;
        if (candidateUid && candidateUid !== decodedToken.uid) {
          return res.status(403).json({
            success: false,
            error: 'Forbidden: Identity mismatch. The provided user ID in request body does not match the authenticated token.'
          });
        }
      }

      next();
    } catch (error) {
      // Handle standard Firebase Admin error codes
      if (error.code === 'auth/id-token-expired') {
        return res.status(401).json({
          success: false,
          code: 'auth/id-token-expired',
          error: 'Unauthorized: Firebase ID token has expired. Please refresh your session.'
        });
      }

      if (error.code === 'auth/id-token-revoked') {
        return res.status(401).json({
          success: false,
          code: 'auth/id-token-revoked',
          error: 'Unauthorized: Firebase ID token has been revoked.'
        });
      }

      if (error.code === 'auth/argument-error' || error.code === 'auth/invalid-id-token') {
        return res.status(401).json({
          success: false,
          code: 'auth/invalid-id-token',
          error: 'Unauthorized: Invalid Firebase ID token format or signature.'
        });
      }

      // Check for unconfigured service account credentials
      if (error.message && error.message.includes('Could not load the default credentials')) {
        return res.status(503).json({
          success: false,
          code: 'auth/service-unavailable',
          error: 'Service Unavailable: Firebase Admin credentials not configured on server.'
        });
      }

      return res.status(401).json({
        success: false,
        error: `Unauthorized: Token verification failed (${error.message}).`
      });
    }
  };
}

export const verifyFirebaseToken = createAuthMiddleware();

export default {
  createAuthMiddleware,
  verifyFirebaseToken,
  setCustomAuthService
};
