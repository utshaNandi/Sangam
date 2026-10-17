import fs from 'node:fs';
import dotenv from 'dotenv';
import { getApps, initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

// Ensure environment variables are loaded immediately in local development
dotenv.config();
if (fs.existsSync('.env.local')) {
  dotenv.config({ path: '.env.local' });
}

let adminApp = null;

/**
 * Resolves the configured Firebase project ID.
 * Defaults to 'sangam-30ac8'.
 *
 * @returns {string} The resolved Firebase project ID.
 */
export function getProjectId() {
  return (
    process.env.FIREBASE_PROJECT_ID ||
    process.env.VITE_FIREBASE_PROJECT_ID ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.GCLOUD_PROJECT ||
    'sangam-30ac8'
  );
}

/**
 * Initializes and returns the Firebase Admin SDK App instance.
 * Supports multiple standard credential sources:
 * 1. File path via GOOGLE_APPLICATION_CREDENTIALS (loads cert synchronously).
 * 2. Individual environment variables (FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY).
 * 3. Google Cloud hosting platform default credentials (ADC) for GCP runtimes.
 * 4. Safe fallback to project ID configuration for emulator or unauthenticated contexts.
 *
 * @returns {import('firebase-admin/app').App} The initialized Firebase Admin App instance.
 */
export function getFirebaseAdmin() {
  const existingApps = getApps();
  if (existingApps.length > 0) {
    return existingApps[0];
  }

  const projectId = getProjectId();

  // Populate standard environment variables for Google Auth / Firebase libraries
  if (!process.env.GOOGLE_CLOUD_PROJECT) {
    process.env.GOOGLE_CLOUD_PROJECT = projectId;
  }
  if (!process.env.GCLOUD_PROJECT) {
    process.env.GCLOUD_PROJECT = projectId;
  }
  if (!process.env.FIREBASE_PROJECT_ID) {
    process.env.FIREBASE_PROJECT_ID = projectId;
  }

  // Option 1: File path via GOOGLE_APPLICATION_CREDENTIALS
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    try {
      const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
      const credential = (typeof credPath === 'string' && fs.existsSync(credPath))
        ? cert(credPath)
        : applicationDefault();

      adminApp = initializeApp({
        credential,
        projectId
      });
      return adminApp;
    } catch (error) {
      console.warn('[FirebaseAdmin] Failed to initialize with GOOGLE_APPLICATION_CREDENTIALS:', error.message);
    }
  }

  // Option 2: Individual environment variables
  if (process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
    try {
      let privateKey = process.env.FIREBASE_PRIVATE_KEY;
      if (typeof privateKey === 'string') {
        privateKey = privateKey.trim();
        if (
          (privateKey.startsWith('"') && privateKey.endsWith('"')) ||
          (privateKey.startsWith("'") && privateKey.endsWith("'"))
        ) {
          privateKey = privateKey.slice(1, -1);
        }
        privateKey = privateKey.replace(/\\n/g, '\n');
      }

      adminApp = initializeApp({
        credential: cert({
          projectId: projectId,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: privateKey
        }),
        projectId
      });
      return adminApp;
    } catch (error) {
      console.warn('[FirebaseAdmin] Failed to initialize with individual service account variables:', error.message);
    }
  }

  // Option 3: Application Default Credentials on GCP environments
  // Only attempt applicationDefault() when running in real GCP environments
  const isGcpEnvironment = Boolean(
    process.env.K_SERVICE ||
    process.env.GAE_SERVICE
  );
  if (isGcpEnvironment) {
    try {
      adminApp = initializeApp({
        credential: applicationDefault(),
        projectId
      });
      return adminApp;
    } catch (error) {
      console.warn('[FirebaseAdmin] Failed to initialize with GCP applicationDefault:', error.message);
    }
  }

  // Option 4: Project ID only (supports local development, Firebase Auth Emulator, or unauthenticated backend context)
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
  getProjectId,
  getFirebaseAdmin,
  getAdminAuth,
  getAdminFirestore
};
