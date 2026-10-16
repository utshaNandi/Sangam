import { getApps, initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

let adminApp = null;

/**
 * Initializes and returns the Firebase Admin SDK App instance.
 * Supports multiple standard credential sources:
 * 1. GOOGLE_APPLICATION_CREDENTIALS environment variable pointing to a service account JSON file.
 * 2. Individual environment variables (FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY).
 * 3. Google Cloud hosting platform default credentials (ADC).
 * 4. Safe fallback to project ID configuration for emulator or unauthenticated contexts.
 *
 * @returns {import('firebase-admin/app').App} The initialized Firebase Admin App instance.
 */
export function getFirebaseAdmin() {
  const existingApps = getApps();
  if (existingApps.length > 0) {
    return existingApps[0];
  }

  // Option 1: File path via GOOGLE_APPLICATION_CREDENTIALS
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    try {
      adminApp = initializeApp({
        credential: applicationDefault()
      });
      return adminApp;
    } catch (error) {
      console.warn('[FirebaseAdmin] Failed to initialize with GOOGLE_APPLICATION_CREDENTIALS:', error.message);
    }
  }

  // Option 2: Individual environment variables
  if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
    try {
      const privateKey = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');
      adminApp = initializeApp({
        credential: cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: privateKey
        })
      });
      return adminApp;
    } catch (error) {
      console.warn('[FirebaseAdmin] Failed to initialize with individual service account variables:', error.message);
    }
  }

  // Option 3: Application Default Credentials on GCP environments
  try {
    adminApp = initializeApp({
      credential: applicationDefault()
    });
    return adminApp;
  } catch {
    // ADC not found in local development without credentials
  }

  // Option 4: Project ID only (supports Firebase Auth Emulator or unauthenticated backend context)
  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || 'sangam-30ac8';
  adminApp = initializeApp({
    projectId
  });
  return adminApp;
}

/**
 * Returns Firebase Admin Auth service.
 */
export function getAdminAuth() {
  const app = getFirebaseAdmin();
  return getAuth(app);
}

/**
 * Returns Firebase Admin Firestore service.
 */
export function getAdminFirestore() {
  const app = getFirebaseAdmin();
  return getFirestore(app);
}

export default {
  getFirebaseAdmin,
  getAdminAuth,
  getAdminFirestore
};
