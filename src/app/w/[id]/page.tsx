'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { AuthGate } from '@/components/ui/AuthGate';
import { ConfirmHost } from '@/components/ui/ConfirmDialog';
import { Topbar } from '@/components/ui/Topbar';
import { Legend } from '@/components/ui/Legend';
import { ImportDialog } from '@/components/ui/ImportDialog';
import { Canvas } from '@/components/canvas/Canvas';
import { Inspector } from '@/components/inspector/Inspector';
import { ValidationPanel } from '@/components/inspector/ValidationPanel';
import { useAuthUser } from '@/lib/firebase/auth';
import { loadWorkspace, saveWorkspace, watchMeta } from '@/lib/firebase/workspaces';
import { useAutosave } from '@/lib/firebase/useAutosave';
import { useEditorStore } from '@/store/editorStore';

function Editor({ uid, workspaceId }: { uid: string; workspaceId: string }) {
  const [state, setState] = useState<'loading' | 'ready' | 'not-found'>('loading');
  const [importOpen, setImportOpen] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [sizeWarning, setSizeWarning] = useState(false);
  const lastOwnSaveAt = useRef(0);
  const loadedUpdatedAt = useRef(0);

  const load = useCallback(async () => {
    try {
      const { meta, content } = await loadWorkspace(uid, workspaceId);
      loadedUpdatedAt.current = meta.updatedAt;
      useEditorStore.getState().initialize(meta, content);
      setConflict(false);
      setState('ready');
    } catch {
      setState('not-found');
    }
  }, [uid, workspaceId]);

  // setState only runs after `await loadWorkspace` resolves — never synchronously in the effect
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);
  useAutosave(uid, workspaceId);

  useEffect(() => useEditorStore.subscribe((s, prev) => {
    if (s.saveStatus === 'saved' && prev.saveStatus !== 'saved') lastOwnSaveAt.current = Date.now();
  }), []);

  useEffect(() => {
    if (state !== 'ready') return;
    return watchMeta(uid, workspaceId, (meta, fromServer) => {
      if (!fromServer) return;
      const ownRecently = Date.now() - lastOwnSaveAt.current < 5000 || useEditorStore.getState().saveStatus === 'saving';
      if (ownRecently || meta.updatedAt <= loadedUpdatedAt.current) {
        loadedUpdatedAt.current = Math.max(loadedUpdatedAt.current, meta.updatedAt);
        return;
      }
      setConflict(true);
    });
  }, [uid, workspaceId, state]);

  useEffect(() => {
    const onWarn = () => setSizeWarning(true);
    window.addEventListener('workspace-size-warning', onWarn);
    return () => window.removeEventListener('workspace-size-warning', onWarn);
  }, []);

  if (state === 'loading') {
    return <div className="fixed inset-0 flex items-center justify-center text-[var(--muted)] text-sm">Opening workspace…</div>;
  }
  if (state === 'not-found') {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center gap-3">
        <p className="text-sm text-[var(--muted)]">This workspace doesn’t exist or isn’t yours.</p>
        <Link className="kbtn" href="/dashboard">← Back to dashboard</Link>
      </div>
    );
  }
  return (
    <div className="fixed inset-0 flex flex-col">
      <Topbar onImport={() => setImportOpen(true)} />
      <div className="relative flex-1">
        <Canvas />
        <Inspector />
        <ValidationPanel />
        <Legend />
        {conflict && (
          <div className="panel" style={{ top: 14, left: '50%', transform: 'translateX(-50%)', padding: '9px 14px', zIndex: 200, display: 'flex', gap: 10, alignItems: 'center', fontSize: 12.5 }}>
            <span>⚠ This workspace changed in another session.</span>
            <button className="kbtn" onClick={() => { setState('loading'); void load(); }}>Reload</button>
            <button className="kbtn" onClick={async () => {
              const st = useEditorStore.getState();
              if (st.content && st.meta) {
                await saveWorkspace(uid, workspaceId, st.content, st.meta.name);
                lastOwnSaveAt.current = Date.now();
              }
              setConflict(false);
            }}>Keep mine</button>
          </div>
        )}
        {sizeWarning && (
          <div className="panel" style={{ top: 14, right: 14, padding: '9px 14px', zIndex: 200, fontSize: 12, maxWidth: 280 }}>
            <b style={{ color: 'var(--warn)' }}>Large workspace:</b> approaching Firestore’s 1 MB limit.
            Export a JSON backup and consider splitting the schema.
            <button className="kbtn ml-2" onClick={() => setSizeWarning(false)}>Dismiss</button>
          </div>
        )}
      </div>
      {importOpen && <ImportDialog onClose={() => setImportOpen(false)} />}
      <ConfirmHost />
    </div>
  );
}

export default function WorkspacePage() {
  const params = useParams<{ id: string }>();
  const { user } = useAuthUser();
  return (
    <AuthGate>
      {user && params.id ? <Editor uid={user.uid} workspaceId={String(params.id)} /> : null}
    </AuthGate>
  );
}
