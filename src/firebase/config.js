import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Firebase configuration loaded strictly from Vite environment variables (with safe fallback for Node test runners)
const env = (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env : {};
const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY || 'demo-api-key',
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || 'demo.firebaseapp.com',
  projectId: env.VITE_FIREBASE_PROJECT_ID || 'sangam-30ac8',
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || 'demo.appspot.com',
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || '1234567890',
  appId: env.VITE_FIREBASE_APP_ID || '1:1234567890:web:mock',
};

// Initialize Firebase app (prevent duplicate initialization in development HMR)
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Initialize Firebase Authentication & Cloud Firestore
export const auth = getAuth(app);
export const db = getFirestore(app);

export default app;
