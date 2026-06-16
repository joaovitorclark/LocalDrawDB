import { useEffect, useMemo, useState } from 'react';
import type { CanvasPage } from '../api';
import { ALL_PAGE_ID } from './scaleLimits';

type Props = {
  open: boolean;
  tableCount: number;
  pages: CanvasPage[];
  onConfirm: (pageIds: string[]) => void;
  onDismiss: () => void;
};

/** Wizard pós-import: escolher assuntos (TableGroups) antes de montar o canvas. */
export function PageImportWizard({ open, tableCount, pages, onConfirm, onDismiss }: Props) {
  const selectable = useMemo(() => pages.filter((p) => p.id !== ALL_PAGE_ID), [pages]);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (open) {
      setSelected(new Set());
      setShowAll(false);
    }
  }, [open]);

  if (!open) return null;

  const toggleAll = (checked: boolean) => {
    setShowAll(checked);
    if (checked) setSelected(new Set());
  };

  const togglePage = (pageId: string, checked: boolean) => {
    setShowAll(false);
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(pageId);
      else next.delete(pageId);
      return next;
    });
  };

  const canConfirm = showAll || selected.size > 0;

  return (
    <div className="page-wizard-backdrop" role="dialog" aria-modal="true" aria-labelledby="page-wizard-title">
      <div className="page-wizard">
        <h2 id="page-wizard-title">Diagrama grande ({tableCount} tabelas)</h2>
        <p>
          O modelo completo fica no editor. Marque os assuntos (TableGroups) que deseja abrir no canvas — nada
          vem selecionado por padrão para evitar travar a interface.
        </p>
        <fieldset className="page-wizard__fieldset">
          <legend className="page-wizard__legend">Assuntos no canvas</legend>
          <label className="page-wizard__row">
            <input type="checkbox" checked={showAll} onChange={(e) => toggleAll(e.target.checked)} />
            Todas as tabelas (pode ficar lento)
          </label>
          {selectable.map((p) => (
            <label key={p.id} className="page-wizard__row">
              <input
                type="checkbox"
                checked={!showAll && selected.has(p.id)}
                disabled={showAll}
                onChange={(e) => togglePage(p.id, e.target.checked)}
              />
              {p.name}
            </label>
          ))}
        </fieldset>
        <div className="page-wizard__actions">
          <button
            type="button"
            className="btn-primary"
            disabled={!canConfirm}
            onClick={() => onConfirm(showAll ? [ALL_PAGE_ID] : [...selected])}
          >
            Abrir canvas
          </button>
          <button type="button" onClick={onDismiss}>
            Depois
          </button>
        </div>
      </div>
    </div>
  );
}
