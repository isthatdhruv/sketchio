import { describe, it, expect } from 'vitest';
import { authErrorMessage } from './auth';

describe('authErrorMessage', () => {
  it('maps known firebase codes', () => {
    expect(authErrorMessage({ code: 'auth/email-already-in-use' })).toBe('An account with this email already exists.');
    expect(authErrorMessage({ code: 'auth/weak-password' })).toBe('Password must be at least 6 characters.');
    expect(authErrorMessage({ code: 'auth/popup-closed-by-user' })).toMatch(/popup/i);
  });
  it('falls back for unknown errors', () => {
    expect(authErrorMessage(new Error('x'))).toBe('Something went wrong. Try again.');
    expect(authErrorMessage(undefined)).toBe('Something went wrong. Try again.');
  });
});
