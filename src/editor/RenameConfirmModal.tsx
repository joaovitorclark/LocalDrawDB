import type { RenameImpact } from '../dsl/reconcile';

type Props = {
  impacts: RenameImpact[];
  onApply: () => void;
  onKeepSeparate: () => void;
  onClose: () => void;
};

function label(i: RenameImpact): string {
  const r = i.rename;
  return r.kind === 'table'
    ? `${r.oldId} → ${r.newId}`
    : `${r.table}.${r.oldCol} → ${r.newCol}`;
}

export function RenameConfirmModal({ impacts, onApply, onKeepSeparate, onClose }: Props) {
  const total = impacts.reduce((a, i) => a + i.refCount, 0);
  return (
    <div className="rename-modal__backdrop" onClick={onClose}>
      <div className="rename-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Confirmar renomeação</h3>
        <ul className="rename-modal__list">
          {impacts.map((i, idx) => <li key={idx}>{label(i)} — {i.refCount} referência(s)</li>)}
        </ul>
        <p className="rename-modal__hint">Atualiza {total} referência(s) no total.</p>
        <div className="rename-modal__actions">
          <button type="button" onClick={onApply}>Aplicar</button>
          <button type="button" onClick={onKeepSeparate}>Manter separado</button>
        </div>
      </div>
    </div>
  );
}
