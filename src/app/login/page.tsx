'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signInWithGoogle, signInWithEmail, authErrorMessage } from '@/lib/firebase/auth';

const inputCls = 'w-full rounded-lg border border-[var(--panel-border)] bg-[var(--panel-2)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-[var(--accent)]';
const btnCls = 'w-full rounded-lg px-3 py-2 text-sm font-semibold cursor-pointer';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setError('');
    try { await fn(); router.replace('/dashboard'); }
    catch (e) { setError(authErrorMessage(e)); setBusy(false); }
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-2xl border border-[var(--panel-border)] bg-[var(--panel)] p-6 shadow-xl">
        <h1 className="text-lg font-bold">Sketchio</h1>
        <p className="text-[13px] text-[var(--muted)] mb-5">MySQL ER diagrams, in your browser.</p>
        <button className={`${btnCls} bg-[var(--accent)] text-white disabled:opacity-50`} disabled={busy}
          onClick={() => run(signInWithGoogle)}>Continue with Google</button>
        <div className="flex items-center gap-3 my-4 text-[11px] text-[var(--faint)]">
          <span className="h-px flex-1 bg-[var(--panel-border)]" />or<span className="h-px flex-1 bg-[var(--panel-border)]" />
        </div>
        <form className="space-y-2.5" onSubmit={e => { e.preventDefault(); run(() => signInWithEmail(email, password)); }}>
          <input className={inputCls} type="email" placeholder="email" value={email} required
            onChange={e => setEmail(e.target.value)} />
          <input className={inputCls} type="password" placeholder="password" value={password} required
            onChange={e => setPassword(e.target.value)} />
          {error && <p className="text-[12px] text-[var(--danger)]">{error}</p>}
          <button className={`${btnCls} border border-[var(--panel-border)] bg-[var(--panel-2)] text-[var(--ink)] disabled:opacity-50`}
            disabled={busy} type="submit">Sign in</button>
        </form>
        <p className="mt-4 text-[12px] text-[var(--muted)]">
          No account? <Link className="text-[var(--accent)]" href="/register">Register</Link>
          {' · '}
          <Link className="text-[var(--accent)]" href="/reset">Forgot password</Link>
        </p>
      </div>
    </main>
  );
}
