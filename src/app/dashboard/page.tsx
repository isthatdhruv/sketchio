'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AuthGate } from '@/components/ui/AuthGate';
import { ConfirmHost, confirmDanger } from '@/components/ui/ConfirmDialog';
import { useAuthUser, signOutUser } from '@/lib/firebase/auth';
import { listWorkspaces, createWorkspace, renameWorkspace, deleteWorkspace, duplicateWorkspace } from '@/lib/firebase/workspaces';
import type { WorkspaceMeta } from '@/lib/schema/types';

function timeAgo(ms: number): string {
  if (!ms) return '—';
  const s = Math.max(1, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-theme');
  const dark = cur ? cur === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  const next = dark ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  try { localStorage.setItem('theme', next); } catch { /* private mode */ }
}

function Dashboard() {
  const { user } = useAuthUser();
  const router = useRouter();
  const [items, setItems] = useState<WorkspaceMeta[] | null>(null);
  const [error, setError] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user) return;
    try { setItems(await listWorkspaces(user.uid)); setError(''); }
    catch { setError('Could not load workspaces.'); }
  }, [user]);
  useEffect(() => { refresh(); }, [refresh]);

  if (!user) return null;
  return (
    <main className="min-h-screen max-w-5xl mx-auto p-6">
      <header className="flex items-center gap-3 mb-8">
        <h1 className="text-lg font-bold">Sketchio</h1>
        <span className="text-[12px] text-[var(--muted)]">{user.email}</span>
        <div className="ml-auto flex gap-2">
          <button className="kbtn" onClick={toggleTheme}>Theme</button>
          <button className="kbtn" onClick={async () => { await signOutUser(); router.replace('/login'); }}>Sign out</button>
        </div>
      </header>

      <div className="flex items-center mb-4">
        <h2 className="text-sm font-semibold text-[var(--muted)]">Your workspaces</h2>
        <button className="kbtn cur ml-auto" onClick={async () => {
          const id = await createWorkspace(user.uid, 'untitled');
          router.push(`/w/${id}`);
        }}>+ New workspace</button>
      </div>

      {error && <p className="text-[13px] text-[var(--danger)] mb-3">{error} <button className="underline" onClick={refresh}>Retry</button></p>}
      {items === null && !error && <p className="text-[13px] text-[var(--muted)]">Loading…</p>}
      {items?.length === 0 && (
        <div className="rounded-2xl border border-dashed border-[var(--panel-border)] p-12 text-center">
          <p className="text-sm text-[var(--muted)] mb-4">No workspaces yet. Design your first MySQL schema.</p>
          <button className="kbtn cur" onClick={async () => {
            const id = await createWorkspace(user.uid, 'untitled');
            router.push(`/w/${id}`);
          }}>Create your first workspace</button>
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {items?.map(w => (
          <div key={w.id} className="group rounded-xl border border-[var(--panel-border)] bg-[var(--panel)] p-4 hover:border-[var(--accent)] cursor-pointer"
            onClick={() => renaming !== w.id && router.push(`/w/${w.id}`)}>
            {renaming === w.id ? (
              <input autoFocus defaultValue={w.name}
                className="w-full rounded-md border border-[var(--accent)] bg-[var(--panel-2)] px-2 py-1 text-sm text-[var(--ink)] outline-none"
                onClick={e => e.stopPropagation()}
                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setRenaming(null); }}
                onBlur={async e => {
                  const v = e.target.value.trim();
                  setRenaming(null);
                  if (v && v !== w.name) { await renameWorkspace(user.uid, w.id, v); refresh(); }
                }} />
            ) : (
              <h3 className="text-sm font-semibold truncate">{w.name}</h3>
            )}
            <p className="text-[11.5px] text-[var(--muted)] mt-1">{w.tableCount} table{w.tableCount === 1 ? '' : 's'} · {timeAgo(w.updatedAt)}</p>
            <div className="flex gap-1.5 mt-3 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
              <button className="kbtn" onClick={() => router.push(`/w/${w.id}`)}>Open</button>
              <button className="kbtn" onClick={() => setRenaming(w.id)}>Rename</button>
              <button className="kbtn" onClick={async () => { await duplicateWorkspace(user.uid, w.id); refresh(); }}>Duplicate</button>
              <button className="kbtn danger ml-auto" onClick={async () => {
                if (await confirmDanger(`Delete workspace "${w.name}"? This cannot be undone.`, 'Delete')) {
                  await deleteWorkspace(user.uid, w.id); refresh();
                }
              }}>🗑</button>
            </div>
          </div>
        ))}
      </div>
      <ConfirmHost />
    </main>
  );
}

export default function DashboardPage() {
  return <AuthGate><Dashboard /></AuthGate>;
}
