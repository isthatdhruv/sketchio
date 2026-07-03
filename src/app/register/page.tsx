'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signUpWithEmail, authErrorMessage } from '@/lib/firebase/auth';

const inputCls = 'w-full rounded-lg border border-[var(--panel-border)] bg-[var(--panel-2)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-[var(--accent)]';

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    setBusy(true); setError('');
    try { await signUpWithEmail(email, password); router.replace('/dashboard'); }
    catch (err) { setError(authErrorMessage(err)); setBusy(false); }
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-2xl border border-[var(--panel-border)] bg-[var(--panel)] p-6 shadow-xl">
        <h1 className="text-lg font-bold mb-5">Create your Sketchio account</h1>
        <form className="space-y-2.5" onSubmit={submit}>
          <input className={inputCls} type="email" placeholder="email" value={email} required onChange={e => setEmail(e.target.value)} />
          <input className={inputCls} type="password" placeholder="password (6+ chars)" value={password} required onChange={e => setPassword(e.target.value)} />
          <input className={inputCls} type="password" placeholder="confirm password" value={confirm} required onChange={e => setConfirm(e.target.value)} />
          {error && <p className="text-[12px] text-[var(--danger)]">{error}</p>}
          <button className="w-full rounded-lg px-3 py-2 text-sm font-semibold bg-[var(--accent)] text-white disabled:opacity-50"
            disabled={busy} type="submit">Register</button>
        </form>
        <p className="mt-4 text-[12px] text-[var(--muted)]">
          Already have an account? <Link className="text-[var(--accent)]" href="/login">Sign in</Link>
        </p>
      </div>
    </main>
  );
}
