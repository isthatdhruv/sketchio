'use client';
import { useEffect, useRef } from 'react';
import { useEditorStore } from '@/store/editorStore';
import { saveWorkspace, contentByteSize } from './workspaces';

const DEBOUNCE_MS = 2000;
const OFFLINE_ACK_MS = 4000;

export function useAutosave(uid: string, workspaceId: string): void {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saving = useRef(false);
  const queued = useRef(false);
  const warned = useRef(false);

  useEffect(() => {
    let disposed = false;

    const doSave = async () => {
      timer.current = null;
      const st = useEditorStore.getState();
      if (!st.content || !st.meta) return;
      if (saving.current) { queued.current = true; return; }
      saving.current = true;
      st.setSaveStatus('saving');
      const content = st.content, name = st.meta.name;
      if (!warned.current && contentByteSize(content) > 800_000) {
        warned.current = true;
        window.dispatchEvent(new CustomEvent('workspace-size-warning'));
      }
      try {
        const outcome = await Promise.race([
          saveWorkspace(uid, workspaceId, content, name).then(() => 'ok' as const),
          new Promise<'slow'>(r => setTimeout(() => r('slow'), OFFLINE_ACK_MS)),
        ]);
        if (disposed) return;
        const cur = useEditorStore.getState();
        if (outcome === 'slow') cur.setSaveStatus('offline');           // queued locally, syncs on reconnect
        else if (cur.content === content && cur.meta?.name === name) cur.setSaveStatus('saved');
        else queued.current = true;
      } catch {
        if (!disposed) useEditorStore.getState().setSaveStatus(typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'error');
      } finally {
        saving.current = false;
        if (queued.current && !disposed) { queued.current = false; schedule(50); }
      }
    };

    const schedule = (ms: number) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(doSave, ms);
    };

    const unsub = useEditorStore.subscribe((s, prev) => {
      if (s.saveStatus === 'dirty' && (s.content !== prev.content || s.meta?.name !== prev.meta?.name)) schedule(DEBOUNCE_MS);
    });

    const flush = () => {
      const st = useEditorStore.getState();
      if (st.saveStatus === 'dirty' || timer.current) {
        if (timer.current) { clearTimeout(timer.current); timer.current = null; }
        void doSave();
      }
    };
    const onVis = () => { if (document.visibilityState === 'hidden') flush(); };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      const st = useEditorStore.getState();
      if (st.saveStatus === 'dirty' || st.saveStatus === 'saving') { flush(); e.preventDefault(); }
    };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      disposed = true;
      unsub(); flush();
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [uid, workspaceId]);
}
