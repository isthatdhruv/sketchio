import type { RefObject } from 'react';
import { useEffect } from 'react';
import { useEditorStore, undo, redo } from '@/store/editorStore';
import { tableById, renameTable, moveTable, resizeTable, deleteTable } from '@/lib/schema/ops/tables';
import { addColumn, updateColumn } from '@/lib/schema/ops/columns';
import { linkOneToMany, linkOneToOne, linkManyToMany, addLogicalEdge } from '@/lib/schema/ops/relations';
import { deleteForeignKey } from '@/lib/schema/ops/keys';
import { deleteLogicalEdge } from '@/lib/schema/ops/relations';
import { deriveEdges, adjacency } from '@/lib/schema/derive';
import { nodeEl, scheduleEdgeRender } from './registry';
import { setCamera, viewport } from './viewport';
import { openColumnMenu, openEdgeMenu, closePopovers } from './popovers';
import { confirmDanger } from '../ui/ConfirmDialog';

let zTop = 20;

export function commitInlineEdit(target: HTMLElement): void {
  const commit = target.dataset.commit;
  const nodeDiv = target.closest('.node') as HTMLElement | null;
  const tableId = nodeDiv?.dataset.node;
  const st = useEditorStore.getState();
  if (!st.content || !tableId || !commit) return;
  const t = tableById(st.content, tableId);
  if (!t) return;
  const text = (target.textContent ?? '').trim();
  if (commit === 'table-name') {
    if (!text || text === t.name) { target.textContent = t.name; return; }
    st.apply(renameTable(st.content, tableId, text));
  } else if (commit === 'col-name') {
    const columnId = (target.closest('.col') as HTMLElement | null)?.dataset.col;
    const col = columnId && t.columns.find(x => x.id === columnId);
    if (!col) return;
    if (!text || text === col.name) { target.textContent = col.name; return; }
    st.apply(updateColumn(st.content, tableId, col.id, { name: text }));
  }
}

export function handleAction(target: HTMLElement, ev: { clientX: number; clientY: number }): void {
  const actEl = target.closest('[data-act]') as HTMLElement | null;
  const act = actEl?.dataset.act;
  const nodeDiv = target.closest('.node') as HTMLElement | null;
  const tableId = nodeDiv?.dataset.node;
  const st = useEditorStore.getState();
  if (!act || !st.content || !tableId) return;
  const t = tableById(st.content, tableId);
  if (!t) return;
  if (act === 'delnode') {
    confirmDanger(`Delete table \`${t.name}\` and its relationships?`, 'Delete table').then(ok => {
      const cur = useEditorStore.getState();
      if (ok && cur.content) cur.apply(deleteTable(cur.content, tableId), { kind: 'none' });
    });
  } else if (act === 'addcol') {
    const r = addColumn(st.content, tableId);
    st.apply(r.content);
    requestAnimationFrame(() => {
      const cn = nodeEl(tableId)?.querySelector(`[data-col="${r.columnId}"] .cn`) as HTMLElement | null;
      if (cn) { cn.focus(); document.getSelection()?.selectAllChildren(cn); }
    });
  } else if (act === 'colmenu') {
    const columnId = (target.closest('.col') as HTMLElement | null)?.dataset.col;
    if (columnId) openColumnMenu(tableId, columnId, ev.clientX, ev.clientY);
  }
}

export function handleNodePick(tableId: string): void {
  const st = useEditorStore.getState();
  if (!st.content || st.tool === 'select') return;
  if (!st.linkSource) { st.setLinkSource(tableId); return; }
  const source = st.linkSource, target = tableId;
  if (st.tool === 'link-1m') {
    const r = linkOneToMany(st.content, source, target);
    st.apply(r.content, { kind: 'edge', edgeId: `fk:${r.fkId}` });
  } else if (st.tool === 'link-11') {
    const r = linkOneToOne(st.content, source, target);
    st.apply(r.content, { kind: 'edge', edgeId: `fk:${r.fkId}` });
  } else if (st.tool === 'link-mm') {
    const r = linkManyToMany(st.content, source, target);
    st.apply(r.content, r.junctionTableId ? { kind: 'table', tableId: r.junctionTableId } : undefined);
  } else if (st.tool === 'link-logical') {
    const r = addLogicalEdge(st.content, { fromTableId: source, toTableId: target, cardinality: 'm-1' });
    st.apply(r.content, { kind: 'edge', edgeId: `log:${r.edgeId}` });
  }
  st.setTool('select');
}

function deleteSelection(): void {
  const st = useEditorStore.getState();
  if (!st.content) return;
  if (st.selection.kind === 'table') {
    const tid = st.selection.tableId;
    const t = tableById(st.content, tid);
    if (!t) return;
    confirmDanger(`Delete table \`${t.name}\` and its relationships?`, 'Delete table').then(ok => {
      const cur = useEditorStore.getState();
      if (ok && cur.content) cur.apply(deleteTable(cur.content, tid), { kind: 'none' });
    });
  } else if (st.selection.kind === 'edge') {
    const edge = deriveEdges(st.content).find(e => e.id === (st.selection as { edgeId: string }).edgeId);
    if (!edge) return;
    if (edge.kind === 'fk') {
      confirmDanger('Drop this foreign key constraint? The FK columns stay.', 'Drop').then(ok => {
        const cur = useEditorStore.getState();
        if (ok && cur.content) cur.apply(deleteForeignKey(cur.content, edge.ownerTableId!, edge.fkId!), { kind: 'none' });
      });
    } else {
      st.apply(deleteLogicalEdge(st.content, edge.logicalId!), { kind: 'none' });
    }
  }
}

const isTypingTarget = (el: EventTarget | null) => {
  const h = el as HTMLElement | null;
  return !!h && (h.isContentEditable || /^(INPUT|SELECT|TEXTAREA)$/.test(h.tagName ?? ''));
};

export function useCanvasInteractions(canvasRef: RefObject<HTMLDivElement | null>): void {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let mode: 'pan' | 'drag' | 'resize' | null = null;
    let active: HTMLElement | null = null;
    let activeId = '';
    let moved = false;
    const start = { mx: 0, my: 0, x: 0, y: 0, w: 0, h: 0, px: 0, py: 0 };

    const onPointerDown = (ev: PointerEvent) => {
      if (ev.button !== 0) return;
      const target = ev.target as HTMLElement;
      if (target.closest('[contenteditable="true"]')) return;
      if (target.closest('[data-act]') || target.closest('[data-popover]')) return;
      if (target.closest('.ehit')) return;
      const nodeDiv = target.closest('.node') as HTMLElement | null;
      const st = useEditorStore.getState();
      if (nodeDiv && st.tool !== 'select') return; // link picks run on click
      const rz = target.closest('[data-resize]');
      const head = target.closest('[data-role="head"]');
      if (rz && nodeDiv) {
        mode = 'resize'; active = nodeDiv; activeId = nodeDiv.dataset.node!;
        Object.assign(start, { mx: ev.clientX, my: ev.clientY, w: nodeDiv.offsetWidth, h: nodeDiv.offsetHeight });
        nodeDiv.style.height = nodeDiv.offsetHeight + 'px';
        nodeDiv.style.zIndex = String(++zTop);
      } else if (head && nodeDiv) {
        const t = st.content && tableById(st.content, nodeDiv.dataset.node!);
        if (!t) return;
        mode = 'drag'; active = nodeDiv; activeId = nodeDiv.dataset.node!;
        Object.assign(start, { mx: ev.clientX, my: ev.clientY, x: t.x, y: t.y });
        nodeDiv.style.zIndex = String(++zTop);
      } else if (nodeDiv) {
        st.setSelection({ kind: 'table', tableId: nodeDiv.dataset.node! });
        return;
      } else {
        mode = 'pan';
        Object.assign(start, { mx: ev.clientX, my: ev.clientY, px: viewport.x, py: viewport.y });
        canvas.classList.add('panning');
      }
      moved = false;
      canvas.setPointerCapture(ev.pointerId);
    };

    const onPointerMove = (ev: PointerEvent) => {
      if (!mode) return;
      moved = true;
      if (mode === 'pan') {
        setCamera({ x: start.px + (ev.clientX - start.mx), y: start.py + (ev.clientY - start.my) });
      } else if (mode === 'drag' && active) {
        active.style.left = start.x + (ev.clientX - start.mx) / viewport.zoom + 'px';
        active.style.top = start.y + (ev.clientY - start.my) / viewport.zoom + 'px';
        scheduleEdgeRender();
      } else if (mode === 'resize' && active) {
        active.style.width = Math.max(200, start.w + (ev.clientX - start.mx) / viewport.zoom) + 'px';
        active.style.height = Math.max(60, start.h + (ev.clientY - start.my) / viewport.zoom) + 'px';
        scheduleEdgeRender();
      }
    };

    const onPointerUp = () => {
      const st = useEditorStore.getState();
      if (mode === 'pan') {
        canvas.classList.remove('panning');
        if (moved) st.setViewportContent({ ...viewport });
        else { st.setSelection({ kind: 'none' }); closePopovers(); }
      } else if (mode === 'drag' && active && st.content) {
        if (moved) st.apply(moveTable(st.content, activeId, parseFloat(active.style.left), parseFloat(active.style.top)));
        else st.setSelection({ kind: 'table', tableId: activeId });
      } else if (mode === 'resize' && active && st.content && moved) {
        st.apply(resizeTable(st.content, activeId, parseFloat(active.style.width), parseFloat(active.style.height)));
      }
      mode = null; active = null;
    };

    const onClick = (ev: MouseEvent) => {
      const target = ev.target as HTMLElement;
      const hit = target.closest('.ehit') as SVGPathElement | null;
      if (hit?.dataset.edge) {
        useEditorStore.getState().setSelection({ kind: 'edge', edgeId: hit.dataset.edge });
        openEdgeMenu(hit.dataset.edge, ev.clientX, ev.clientY);
        return;
      }
      if (target.closest('[data-act]')) { handleAction(target, ev); return; }
      const st = useEditorStore.getState();
      if (st.tool !== 'select') {
        const nodeDiv = target.closest('.node') as HTMLElement | null;
        if (nodeDiv && !target.closest('[contenteditable="true"]')) handleNodePick(nodeDiv.dataset.node!);
      }
    };

    const onFocusOut = (ev: FocusEvent) => {
      const target = ev.target as HTMLElement;
      if (target?.dataset?.commit) commitInlineEdit(target);
    };

    const onKeyDownCanvas = (ev: KeyboardEvent) => {
      const target = ev.target as HTMLElement;
      if (target?.isContentEditable && ev.key === 'Enter') { ev.preventDefault(); target.blur(); }
    };

    // hover trace
    const onPointerOver = (ev: PointerEvent) => {
      if (mode || useEditorStore.getState().tool !== 'select') return;
      const nodeDiv = (ev.target as HTMLElement).closest('.node') as HTMLElement | null;
      if (!nodeDiv) return;
      const st = useEditorStore.getState();
      if (!st.content) return;
      const id = nodeDiv.dataset.node!;
      const adj = adjacency(st.content).get(id) ?? new Set();
      canvas.classList.add('focus');
      for (const t of st.content.tables) {
        const el = nodeEl(t.id);
        if (el) el.classList.toggle('hi', t.id === id || adj.has(t.id));
      }
      canvas.querySelectorAll<SVGPathElement>('.edge').forEach(p => {
        const eid = p.dataset.edge ?? '';
        const e = deriveEdges(st.content!).find(x => x.id === eid);
        p.classList.toggle('hi', !!e && (e.fromTableId === id || e.toTableId === id));
      });
    };
    const onPointerOut = (ev: PointerEvent) => {
      const to = ev.relatedTarget as HTMLElement | null;
      if (to && to.closest && to.closest('.node')) return;
      canvas.classList.remove('focus');
      canvas.querySelectorAll('.hi').forEach(el => el.classList.remove('hi'));
    };

    const onWindowKeyDown = (ev: KeyboardEvent) => {
      if (isTypingTarget(ev.target)) return;
      const mod = ev.ctrlKey || ev.metaKey;
      if (mod && !ev.shiftKey && ev.key.toLowerCase() === 'z') { ev.preventDefault(); undo(); }
      else if ((mod && ev.shiftKey && ev.key.toLowerCase() === 'z') || (mod && ev.key.toLowerCase() === 'y')) { ev.preventDefault(); redo(); }
      else if (ev.key === 'Delete' || ev.key === 'Backspace') { ev.preventDefault(); deleteSelection(); }
      else if (ev.key === 'Escape') {
        const st = useEditorStore.getState();
        closePopovers();
        if (st.tool !== 'select') st.setTool('select');
        else st.setSelection({ kind: 'none' });
      }
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    canvas.addEventListener('click', onClick);
    canvas.addEventListener('focusout', onFocusOut);
    canvas.addEventListener('keydown', onKeyDownCanvas);
    canvas.addEventListener('pointerover', onPointerOver);
    canvas.addEventListener('pointerout', onPointerOut);
    window.addEventListener('keydown', onWindowKeyDown);
    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      canvas.removeEventListener('click', onClick);
      canvas.removeEventListener('focusout', onFocusOut);
      canvas.removeEventListener('keydown', onKeyDownCanvas);
      canvas.removeEventListener('pointerover', onPointerOver);
      canvas.removeEventListener('pointerout', onPointerOut);
      window.removeEventListener('keydown', onWindowKeyDown);
    };
  }, [canvasRef]);
}
