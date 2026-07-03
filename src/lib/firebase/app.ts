import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, type Firestore } from 'firebase/firestore';

let cachedDb: Firestore | null = null;

export function firebaseApp(): FirebaseApp {
  const existing = getApps()[0];
  if (existing) return existing;
  const cfg = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };
  const missing = Object.entries(cfg).filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) {
    throw new Error(
      `Missing Firebase config: set NEXT_PUBLIC_FIREBASE_{API_KEY, AUTH_DOMAIN, PROJECT_ID, APP_ID} in .env.local (missing: ${missing.join(', ')})`);
  }
  return initializeApp(cfg);
}

export function db(): Firestore {
  if (!cachedDb) {
    cachedDb = initializeFirestore(firebaseApp(), {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
  }
  return cachedDb;
}

export function auth(): Auth {
  return getAuth(firebaseApp());
}
