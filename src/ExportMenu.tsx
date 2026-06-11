import { useEffect, useRef, useState } from 'react';
import type { ExportOption } from './api';

type Props = {
  options: ExportOption[];
  onExport: (option: ExportOption) => void;
};

export function ExportMenu({ options, onExport }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="toolbar__export-menu" ref={rootRef}>
      <button
        type="button"
        className="toolbar__export-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        Exportar <span aria-hidden="true">▾</span>
      </button>
      {open ? (
        <div className="toolbar__export-dropdown" role="menu">
          {options.map((opt) => (
            <button
              key={opt.id}
              type="button"
              role="menuitem"
              className="toolbar__export-item"
              onClick={() => {
                setOpen(false);
                onExport(opt);
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
