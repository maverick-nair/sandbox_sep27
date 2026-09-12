// Native HTML5 drag and drop, pointer drag for touch, and a select-then-place path that works with
// keyboard, mouse click and tap. No external library.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

const DnDContext = createContext(null);
const DRAG_THRESHOLD_PX = 8;

export function DnDProvider({ onDrop, children }) {
  const [selected, setSelected] = useState(null); // selected item id (keyboard, click or tap)
  const [dragging, setDragging] = useState(null); // pointer-dragged item id
  const [pointerPos, setPointerPos] = useState(null);
  const [announce, setAnnounce] = useState('');
  const labels = useRef({});
  const pointerStart = useRef(null);
  const moved = useRef(false);

  const registerLabel = useCallback((id, label) => { labels.current[id] = label; }, []);

  const drop = useCallback((itemId, zoneId) => {
    if (!itemId || !zoneId) return;
    onDrop(itemId, zoneId);
    setAnnounce(`${labels.current[itemId] || itemId} placed in ${labels.current[zoneId] || zoneId}.`);
    setSelected(null);
  }, [onDrop]);

  const toggleSelect = useCallback((id) => {
    setSelected((cur) => {
      const next = cur === id ? null : id;
      setAnnounce(next ? `${labels.current[id] || id} selected. Choose a target and press Enter, click or tap it to place. Escape cancels.` : 'Selection cleared.');
      return next;
    });
  }, []);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && selected) { setSelected(null); setAnnounce('Selection cleared.'); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected]);

  const beginPointer = useCallback((id, e) => {
    pointerStart.current = { x: e.clientX, y: e.clientY };
    moved.current = false;
    setDragging(id);
  }, []);

  // Pointer (touch) drag: only counts as a drag after the finger moves; a plain tap falls through to click.
  useEffect(() => {
    if (!dragging) return;
    const move = (e) => {
      const s = pointerStart.current;
      if (s && Math.hypot(e.clientX - s.x, e.clientY - s.y) > DRAG_THRESHOLD_PX) moved.current = true;
      if (moved.current) setPointerPos({ x: e.clientX, y: e.clientY });
    };
    const up = (e) => {
      if (moved.current) {
        const el = document.elementFromPoint(e.clientX, e.clientY);
        const zone = el?.closest?.('[data-dropzone]');
        if (zone) drop(dragging, zone.getAttribute('data-dropzone'));
      }
      setDragging(null);
      setPointerPos(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [dragging, drop]);

  const value = useMemo(() => ({ selected, toggleSelect, drop, dragging, beginPointer, registerLabel, movedRef: moved }), [selected, toggleSelect, drop, dragging, beginPointer, registerLabel]);
  return (
    <DnDContext.Provider value={value}>
      {children}
      <div aria-live="polite" className="sr-only">{announce}</div>
      {dragging && pointerPos && (
        <div className="pointer-events-none fixed z-50 rounded border border-amber-400 bg-zinc-800 px-2 py-1 text-xs text-amber-200 shadow-lg" style={{ left: pointerPos.x + 8, top: pointerPos.y + 8 }}>
          {labels.current[dragging] || dragging}
        </div>
      )}
    </DnDContext.Provider>
  );
}

export function useDnD() { return useContext(DnDContext); }

export function Draggable({ id, label, disabled, className = '', children, ...rest }) {
  const ctx = useDnD();
  useEffect(() => { ctx.registerLabel(id, label); }, [id, label, ctx]);
  const isSelected = ctx.selected === id;
  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-pressed={isSelected}
      aria-label={`${label}. ${isSelected ? 'Selected. Choose a target to place it.' : 'Press Enter, click or tap to select, or drag it.'}`}
      draggable={!disabled}
      onDragStart={(e) => { e.dataTransfer.setData('text/plain', id); e.dataTransfer.effectAllowed = 'move'; }}
      onPointerDown={(e) => { if (e.pointerType === 'touch' && !disabled) ctx.beginPointer(id, e); }}
      onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !disabled) { e.preventDefault(); ctx.toggleSelect(id); } }}
      onClick={(e) => {
        if (disabled) return;
        if (e.detail === 0) return; // keyboard activation handled in onKeyDown
        if (ctx.movedRef.current) return; // end of a touch drag, not a tap
        e.stopPropagation(); // do not let the containing zone treat this as a placement
        ctx.toggleSelect(id);
      }}
      className={`select-none touch-none cursor-grab focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${isSelected ? 'ring-2 ring-amber-400' : ''} ${disabled ? 'opacity-70 cursor-default' : ''} ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}

export function DropZone({ id, label, className = '', activeClassName = 'ring-2 ring-sky-400', children, ...rest }) {
  const ctx = useDnD();
  const [over, setOver] = useState(false);
  useEffect(() => { ctx.registerLabel(id, label); }, [id, label, ctx]);
  const targetable = Boolean(ctx.selected);
  return (
    <div
      data-dropzone={id}
      role="button"
      tabIndex={targetable ? 0 : -1}
      aria-label={targetable ? `Place selected item in ${label}. Press Enter, click or tap to confirm.` : label}
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); const itemId = e.dataTransfer.getData('text/plain'); ctx.drop(itemId, id); }}
      onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && ctx.selected && e.target === e.currentTarget) { e.preventDefault(); ctx.drop(ctx.selected, id); } }}
      onClick={() => { if (ctx.selected) ctx.drop(ctx.selected, id); }}
      className={`transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${over || targetable ? activeClassName : ''} ${targetable ? 'cursor-pointer' : ''} ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}

// Shown next to every submit button: what is done and what is still missing.
export function Requirements({ items }) {
  const missing = items.filter((i) => !i.done);
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs" aria-label="Requirements before submitting">
      {items.map((i) => (
        <li key={i.label} className={i.done ? 'text-amber-300' : 'text-zinc-300'}>
          <span aria-hidden className="mr-1 font-mono">{i.done ? '[x]' : '[ ]'}</span>{i.label}
        </li>
      ))}
      {missing.length === 0 && <li className="sr-only">All requirements met.</li>}
    </ul>
  );
}
