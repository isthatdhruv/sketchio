'use client';
import { useState } from 'react';
import Link from 'next/link';
import { sendReset, authErrorMessage } from '@/lib/firebase/auth';

export default function ResetPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try { await sendReset(email); setSent(true); }
    catch (err) { setError(authErrorMessage(err)); }
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-2xl border border-[var(--panel-border)] bg-[var(--panel)] p-6 shadow-xl">
        <h1 className="text-lg font-bold mb-5">Reset password</h1>
        {sent ? (
          <p className="text-sm text-[var(--ink)]">If an account exists for <b>{email}</b>, a reset link is on its way.</p>
        ) : (
          <form className="space-y-2.5" onSubmit={submit}>
            <input className="w-full rounded-lg border border-[var(--panel-border)] bg-[var(--panel-2)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-[var(--accent)]"
              type="email" placeholder="email" value={email} required onChange={e => setEmail(e.target.value)} />
            {error && <p className="text-[12px] text-[var(--danger)]">{error}</p>}
            <button className="w-full rounded-lg px-3 py-2 text-sm font-semibold bg-[var(--accent)] text-white" type="submit">
              Send reset link</button>
          </form>
        )}
        <p className="mt-4 text-[12px] text-[var(--muted)]">
          <Link className="text-[var(--accent)]" href="/login">← Back to sign in</Link>
        </p>
      </div>
    </main>
  );
}
