'use client';
import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthUser } from '@/lib/firebase/auth';

export function AuthGate({ children }: { children: ReactNode }) {
  const { user, loading } = useAuthUser();
  const router = useRouter();
  useEffect(() => { if (!loading && !user) router.replace('/login'); }, [loading, user, router]);
  if (loading || !user) {
    return (
      <div className="fixed inset-0 flex items-center justify-center text-[var(--muted)] text-sm">
        Loading…
      </div>
    );
  }
  return <>{children}</>;
}
