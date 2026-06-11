import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';

export type PanelPos = { x: number; y: number };

function loadStoredPos(key: string): PanelPos | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PanelPos;
    if (typeof parsed.x === 'number' && typeof parsed.y === 'number') return parsed;
  } catch {
    /* ignore */
  }
  return null;
}

/** Posicionamento absoluto arrastável dentro do offsetParent (ex.: canvas). */
export function useDraggablePanel(storageKey: string) {
  const [pos, setPos] = useState<PanelPos | null>(() => loadStoredPos(storageKey));
  const dragRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (pos) localStorage.setItem(storageKey, JSON.stringify(pos));
  }, [pos, storageKey]);

  const onDragStart = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      if (e.button !== 0) return;
      const panel = panelRef.current;
      const parent = panel?.offsetParent as HTMLElement | null;
      if (!panel || !parent) return;

      e.preventDefault();
      e.stopPropagation();
      const panelRect = panel.getBoundingClientRect();
      const parentRect = parent.getBoundingClientRect();
      const originX = pos?.x ?? panelRect.left - parentRect.left;
      const originY = pos?.y ?? panelRect.top - parentRect.top;
      dragRef.current = { startX: e.clientX, startY: e.clientY, originX, originY };
      setPos({ x: originX, y: originY });

      const onMove = (ev: PointerEvent) => {
        const drag = dragRef.current;
        if (!drag) return;
        setPos({
          x: drag.originX + ev.clientX - drag.startX,
          y: drag.originY + ev.clientY - drag.startY,
        });
      };
      const onUp = () => {
        dragRef.current = null;
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [pos],
  );

  const dragStyle: CSSProperties | undefined = pos
    ? { left: pos.x, top: pos.y, right: 'auto', bottom: 'auto' }
    : undefined;

  return { panelRef, dragStyle, onDragStart };
}
