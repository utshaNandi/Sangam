import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Firebase configuration loaded strictly from Vite environment variables (with safe fallback for Node test runners)
const env = (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env : {};
const isMissingApiKey = !env.VITE_FIREBASE_API_KEY || env.VITE_FIREBASE_API_KEY === 'demo-api-key';
if (isMissingApiKey && typeof window !== 'undefined') {
  console.warn(
    '[Firebase Config] ⚠️ VITE_FIREBASE_API_KEY is not defined. Please create a .env.local file with your Firebase credentials and restart the dev server.'
  );
}

const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY || 'demo-api-key',
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || 'sangam-30ac8.firebaseapp.com',
  projectId: env.VITE_FIREBASE_PROJECT_ID || 'sangam-30ac8',
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || 'sangam-30ac8.firebasestorage.app',
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || '1234567890',
  appId: env.VITE_FIREBASE_APP_ID || '1:1234567890:web:mock',
};

// Initialize Firebase app (prevent duplicate initialization in development HMR)
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Initialize Firebase Authentication & Cloud Firestore
export const auth = getAuth(app);
export const db = getFirestore(app);

export default app;
