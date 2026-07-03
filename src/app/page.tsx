'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthUser } from '@/lib/firebase/auth';

export default function Home() {
  const { user, loading } = useAuthUser();
  const router = useRouter();
  useEffect(() => {
    if (!loading) router.replace(user ? '/dashboard' : '/login');
  }, [loading, user, router]);
  return (
    <div className="fixed inset-0 flex items-center justify-center text-[var(--muted)] text-sm">
      Loading…
    </div>
  );
}
