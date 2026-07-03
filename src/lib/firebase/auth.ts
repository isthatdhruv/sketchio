'use client';
import { useEffect, useState } from 'react';
import {
  GoogleAuthProvider, createUserWithEmailAndPassword, onAuthStateChanged,
  sendPasswordResetEmail, signInWithEmailAndPassword, signInWithPopup, signOut, type User,
} from 'firebase/auth';
import { auth } from './app';

export function useAuthUser(): { user: User | null; loading: boolean } {
  const [state, setState] = useState<{ user: User | null; loading: boolean }>({ user: null, loading: true });
  useEffect(() => onAuthStateChanged(auth(), user => setState({ user, loading: false })), []);
  return state;
}

export const signInWithGoogle = async () => { await signInWithPopup(auth(), new GoogleAuthProvider()); };
export const signUpWithEmail = async (email: string, password: string) => { await createUserWithEmailAndPassword(auth(), email, password); };
export const signInWithEmail = async (email: string, password: string) => { await signInWithEmailAndPassword(auth(), email, password); };
export const sendReset = async (email: string) => { await sendPasswordResetEmail(auth(), email); };
export const signOutUser = async () => { await signOut(auth()); };

const MESSAGES: Record<string, string> = {
  'auth/invalid-credential': 'Wrong email or password.',
  'auth/wrong-password': 'Wrong email or password.',
  'auth/user-not-found': 'No account with this email.',
  'auth/email-already-in-use': 'An account with this email already exists.',
  'auth/weak-password': 'Password must be at least 6 characters.',
  'auth/invalid-email': 'That email address looks invalid.',
  'auth/popup-closed-by-user': 'Sign-in popup was closed before finishing.',
  'auth/too-many-requests': 'Too many attempts — try again in a minute.',
};

export function authErrorMessage(e: unknown): string {
  const code = (e as { code?: string })?.code;
  return (code && MESSAGES[code]) || 'Something went wrong. Try again.';
}
