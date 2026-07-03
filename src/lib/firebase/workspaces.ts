import {
  collection, doc, getDoc, getDocs, onSnapshot, orderBy, query,
  serverTimestamp, updateDoc, writeBatch, type Unsubscribe,
} from 'firebase/firestore';
import type { WorkspaceContent, WorkspaceMeta } from '@/lib/schema/types';
import { emptyContent } from '@/lib/schema/ops/tables';
import { db } from './app';

const wsCol = (uid: string) => collection(db(), 'users', uid, 'workspaces');
const metaDoc = (uid: string, id: string) => doc(db(), 'users', uid, 'workspaces', id);
const contentDoc = (uid: string, id: string) => doc(db(), 'users', uid, 'workspaces', id, 'content', 'schema');

/* eslint-disable @typescript-eslint/no-explicit-any */
const toMillis = (v: any): number => (typeof v?.toMillis === 'function' ? v.toMillis() : typeof v === 'number' ? v : 0);

const snapToMeta = (id: string, data: any): WorkspaceMeta => ({
  id,
  name: String(data?.name ?? 'untitled'),
  tableCount: Number(data?.tableCount ?? 0),
  createdAt: toMillis(data?.createdAt),
  updatedAt: toMillis(data?.updatedAt),
});

export function contentByteSize(content: WorkspaceContent): number {
  return new TextEncoder().encode(JSON.stringify(content)).length;
}

export function normalizeContent(raw: unknown): WorkspaceContent {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) throw new TypeError('workspace content is not an object');
  const r = raw as Partial<WorkspaceContent> & Record<string, unknown>;
  if (!Array.isArray(r.tables)) throw new TypeError('workspace content has no tables array');
  const base = emptyContent();
  return {
    schemaVersion: 1,
    settings: { ...base.settings, ...(typeof r.settings === 'object' && r.settings ? r.settings : {}) },
    tables: r.tables.map((t: any) => ({
      id: String(t.id), name: String(t.name ?? 'table'),
      comment: t.comment, engine: t.engine, charset: t.charset, collation: t.collation,
      autoIncrementStart: t.autoIncrementStart, color: t.color,
      columns: Array.isArray(t.columns) ? t.columns : [],
      indexes: Array.isArray(t.indexes) ? t.indexes : [],
      foreignKeys: Array.isArray(t.foreignKeys) ? t.foreignKeys : [],
      x: Number(t.x ?? 60), y: Number(t.y ?? 60), w: Number(t.w ?? 220), h: t.h,
    })),
    logicalEdges: Array.isArray(r.logicalEdges) ? r.logicalEdges : [],
    viewport: r.viewport && typeof r.viewport === 'object'
      ? { x: Number((r.viewport as any).x ?? 0), y: Number((r.viewport as any).y ?? 0), zoom: Number((r.viewport as any).zoom ?? 1) }
      : base.viewport,
  };
}

export async function listWorkspaces(uid: string): Promise<WorkspaceMeta[]> {
  const snap = await getDocs(query(wsCol(uid), orderBy('updatedAt', 'desc')));
  return snap.docs.map(d => snapToMeta(d.id, d.data()));
}

export async function createWorkspace(uid: string, name: string): Promise<string> {
  const meta = doc(wsCol(uid));
  const batch = writeBatch(db());
  batch.set(meta, { name, tableCount: 0, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  batch.set(contentDoc(uid, meta.id), { json: JSON.stringify(emptyContent()) });
  await batch.commit();
  return meta.id;
}

export async function loadWorkspace(uid: string, id: string): Promise<{ meta: WorkspaceMeta; content: WorkspaceContent }> {
  const [m, c] = await Promise.all([getDoc(metaDoc(uid, id)), getDoc(contentDoc(uid, id))]);
  if (!m.exists() || !c.exists()) throw new Error('not-found');
  return { meta: snapToMeta(m.id, m.data()), content: normalizeContent(JSON.parse(String(c.data()?.json ?? 'null'))) };
}

export async function saveWorkspace(uid: string, id: string, content: WorkspaceContent, name: string): Promise<void> {
  const batch = writeBatch(db());
  batch.set(contentDoc(uid, id), { json: JSON.stringify(content) });
  batch.update(metaDoc(uid, id), { name, tableCount: content.tables.length, updatedAt: serverTimestamp() });
  await batch.commit();
}

export async function renameWorkspace(uid: string, id: string, name: string): Promise<void> {
  await updateDoc(metaDoc(uid, id), { name, updatedAt: serverTimestamp() });
}

export async function deleteWorkspace(uid: string, id: string): Promise<void> {
  const batch = writeBatch(db());
  batch.delete(contentDoc(uid, id));
  batch.delete(metaDoc(uid, id));
  await batch.commit();
}

export async function duplicateWorkspace(uid: string, id: string): Promise<string> {
  const { meta, content } = await loadWorkspace(uid, id);
  const copy = doc(wsCol(uid));
  const batch = writeBatch(db());
  batch.set(copy, { name: `${meta.name} copy`, tableCount: content.tables.length, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  batch.set(contentDoc(uid, copy.id), { json: JSON.stringify(content) });
  await batch.commit();
  return copy.id;
}

export function watchMeta(uid: string, id: string, cb: (meta: WorkspaceMeta, fromServer: boolean) => void): Unsubscribe {
  return onSnapshot(metaDoc(uid, id), snap => {
    if (!snap.exists()) return;
    cb(snapToMeta(snap.id, snap.data()), !snap.metadata.hasPendingWrites && !snap.metadata.fromCache);
  });
}
