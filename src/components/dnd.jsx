// Native HTML5 drag and drop, pointer events for touch, and a keyboard alternative
// (select item, select target, confirm). No external library.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

const DnDContext = createContext(null);

export function DnDProvider({ onDrop, children }) {
  const [selected, setSelected] = useState(null); // keyboard-selected item id
  const [dragging, setDragging] = useState(null); // pointer-dragged item id
  const [pointerPos, setPointerPos] = useState(null);
  const [announce, setAnnounce] = useState('');
  const labels = useRef({});

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
      setAnnounce(next ? `${labels.current[id] || id} selected. Move to a target and press Enter to place it, or Escape to cancel.` : 'Selection cleared.');
      return next;
    });
  }, []);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && selected) { setSelected(null); setAnnounce('Selection cleared.'); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected]);

  // Pointer (touch) drag: track position and drop on the zone under the pointer.
  useEffect(() => {
    if (!dragging) return;
    const move = (e) => setPointerPos({ x: e.clientX, y: e.clientY });
    const up = (e) => {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const zone = el?.closest?.('[data-dropzone]');
      if (zone) drop(dragging, zone.getAttribute('data-dropzone'));
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

  const value = useMemo(() => ({ selected, toggleSelect, drop, dragging, setDragging, registerLabel }), [selected, toggleSelect, drop, dragging, registerLabel]);
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
      aria-label={`${label}. ${isSelected ? 'Selected.' : 'Press Enter or Space to select for keyboard placement.'}`}
      draggable={!disabled}
      onDragStart={(e) => { e.dataTransfer.setData('text/plain', id); e.dataTransfer.effectAllowed = 'move'; }}
      onPointerDown={(e) => { if (e.pointerType === 'touch' && !disabled) { e.preventDefault(); ctx.setDragging(id); } }}
      onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !disabled) { e.preventDefault(); ctx.toggleSelect(id); } }}
      onClick={(e) => { if (e.detail === 0) return; if (!disabled && e.shiftKey) ctx.toggleSelect(id); }}
      className={`select-none touch-none cursor-grab focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${isSelected ? 'ring-2 ring-amber-400' : ''} ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${className}`}
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
      aria-label={targetable ? `Place selected item in ${label}. Press Enter to confirm.` : label}
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); const itemId = e.dataTransfer.getData('text/plain'); ctx.drop(itemId, id); }}
      onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && ctx.selected) { e.preventDefault(); ctx.drop(ctx.selected, id); } }}
      onClick={() => { if (ctx.selected) ctx.drop(ctx.selected, id); }}
      className={`transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${over || (targetable && ctx.dragging !== id) ? activeClassName : ''} ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}
