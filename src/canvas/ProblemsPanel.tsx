import { useMemo, useState } from 'react';
import type { ModelIssue } from '../dsl/validateModel';

type Props = {
  issues: ModelIssue[];
  onFocusTable?: (tableId: string) => void;
};

export function ProblemsPanel({ issues, onFocusTable }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const errors = useMemo(() => issues.filter((i) => i.severity === 'error'), [issues]);
  const warns = useMemo(() => issues.filter((i) => i.severity === 'warn'), [issues]);

  if (!issues.length) return null;

  return (
    <div className={`problems-panel ${collapsed ? 'is-collapsed' : ''}`}>
      <button type="button" className="problems-panel__toggle" onClick={() => setCollapsed((c) => !c)}>
        {collapsed ? '◂' : '▾'} Problemas ({errors.length} erro{errors.length !== 1 ? 's' : ''}
        {warns.length ? `, ${warns.length} aviso${warns.length !== 1 ? 's' : ''}` : ''})
      </button>
      {!collapsed && (
        <ul className="problems-panel__list">
          {issues.map((issue, i) => (
            <li key={i} className={`problems-panel__item problems-panel__item--${issue.severity}`}>
              <button
                type="button"
                className="problems-panel__btn"
                disabled={!issue.tableId || !onFocusTable}
                onClick={() => issue.tableId && onFocusTable?.(issue.tableId)}
                title={issue.tableId ? 'Ir para tabela' : undefined}
              >
                {issue.message}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
