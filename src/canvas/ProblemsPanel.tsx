import { useMemo, useState } from 'react';
import type { ModelIssue } from '../dsl/validateModel';
import { useDraggablePanel } from './useDraggablePanel';

type Props = {
  issues: ModelIssue[];
  onFocusTable?: (tableId: string) => void;
  onGoToLine?: (line: number) => void;
};

export function ProblemsPanel({ issues, onFocusTable, onGoToLine }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const { panelRef, dragStyle, onDragStart } = useDraggablePanel('localdrawdb.problemsPanelPos');

  const errors = useMemo(() => issues.filter((i) => i.severity === 'error'), [issues]);
  const warns = useMemo(() => issues.filter((i) => i.severity === 'warn'), [issues]);

  if (!issues.length) return null;

  return (
    <div
      ref={panelRef}
      className={`problems-panel ${collapsed ? 'is-collapsed' : ''}`}
      style={dragStyle}
    >
      <div className="problems-panel__head">
        <button
          type="button"
          className="problems-panel__grip"
          title="Arrastar painel"
          aria-label="Arrastar painel"
          onPointerDown={onDragStart}
        >
          ⠿
        </button>
        <button type="button" className="problems-panel__toggle" onClick={() => setCollapsed((c) => !c)}>
          {collapsed ? '◂' : '▾'} Problemas ({errors.length} erro{errors.length !== 1 ? 's' : ''}
          {warns.length ? `, ${warns.length} aviso${warns.length !== 1 ? 's' : ''}` : ''})
        </button>
      </div>
      {!collapsed && (
        <ul className="problems-panel__list">
          {issues.map((issue, i) => (
            <li key={i} className={`problems-panel__item problems-panel__item--${issue.severity}`}>
              <div className="problems-panel__row">
                {issue.line != null && onGoToLine && (
                  <button
                    type="button"
                    className="problems-panel__goto"
                    onClick={() => onGoToLine(issue.line!)}
                    title="Ir à linha no editor"
                  >
                    Linha
                  </button>
                )}
                {issue.tableId && onFocusTable && (
                  <button
                    type="button"
                    className="problems-panel__goto"
                    onClick={() => onFocusTable(issue.tableId!)}
                    title="Ir para tabela no canvas"
                  >
                    Tabela
                  </button>
                )}
                <span className="problems-panel__msg">{issue.message}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
