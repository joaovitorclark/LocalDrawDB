import { useEffect, useRef, useState } from 'react';
import type { ProjectMeta } from './api';

type Props = {
  projects: ProjectMeta[];
  currentProjectId: string;
  saveState: 'idle' | 'dirty' | 'saving' | 'saved' | 'error';
  onSwitch: (id: string) => void;
  onCreate: (name: string) => void;
  onRename: (id: string, name: string) => void;
  onDuplicate: (id: string, name?: string) => void;
  onDelete: (id: string) => void;
  pinnedLabel?: string;
};

export function ProjectSwitcher({
  projects,
  currentProjectId,
  saveState,
  onSwitch,
  onCreate,
  onRename,
  onDuplicate,
  onDelete,
  pinnedLabel,
}: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const current = projects.find((p) => p.id === currentProjectId);

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

  const handleCreate = () => {
    const name = window.prompt('Nome do novo projeto:');
    if (!name?.trim()) return;
    setOpen(false);
    onCreate(name.trim());
  };

  const handleRename = (proj: ProjectMeta) => {
    const name = window.prompt('Novo nome do projeto:', proj.name);
    if (!name?.trim() || name.trim() === proj.name) return;
    setOpen(false);
    onRename(proj.id, name.trim());
  };

  const handleDuplicate = (proj: ProjectMeta) => {
    const name = window.prompt('Nome do projeto duplicado:', `${proj.name} (cópia)`);
    if (name === null) return; // cancelado
    setOpen(false);
    onDuplicate(proj.id, name.trim() || undefined);
  };

  const handleDelete = (proj: ProjectMeta) => {
    const confirmed = window.confirm(
      `Excluir o projeto "${proj.name}"? Esta ação não pode ser desfeita.`,
    );
    if (!confirmed) return;
    setOpen(false);
    onDelete(proj.id);
  };

  const handleSwitch = (id: string) => {
    setOpen(false);
    if (id !== currentProjectId) onSwitch(id);
  };

  const isDirty = saveState === 'dirty';

  if (pinnedLabel) {
    return (
      <div
        className="project-switcher project-switcher--pinned"
        title="Instância fixada neste projeto (porta dedicada)"
      >
        <span className="project-switcher__pin" aria-hidden="true">📌</span>
        <span className="project-switcher__name">{pinnedLabel}</span>
      </div>
    );
  }

  return (
    <div className="project-switcher" ref={rootRef}>
      <button
        type="button"
        className="project-switcher__trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        title="Trocar projeto"
      >
        {isDirty && <span className="project-switcher__dirty" aria-label="Não salvo">●</span>}
        <span className="project-switcher__name">{current?.name ?? '…'}</span>
        <span aria-hidden="true">▾</span>
      </button>

      {open && (
        <div className="project-switcher__dropdown" role="menu">
          <div className="project-switcher__list">
            {projects.map((proj) => {
              const isActive = proj.id === currentProjectId;
              return (
                <div key={proj.id} className={`project-switcher__row${isActive ? ' is-active' : ''}`}>
                  <button
                    type="button"
                    role="menuitem"
                    className="project-switcher__row-name"
                    onClick={() => handleSwitch(proj.id)}
                  >
                    <span className="project-switcher__check" aria-hidden="true">
                      {isActive ? '✓' : ''}
                    </span>
                    {proj.name}
                  </button>
                  <div className="project-switcher__row-actions">
                    <button
                      type="button"
                      className="project-switcher__action"
                      title="Renomear"
                      onClick={() => handleRename(proj)}
                    >
                      ✎
                    </button>
                    <button
                      type="button"
                      className="project-switcher__action"
                      title="Duplicar"
                      onClick={() => handleDuplicate(proj)}
                    >
                      ⧉
                    </button>
                    {projects.length > 1 && (
                      <button
                        type="button"
                        className="project-switcher__action project-switcher__action--delete"
                        title="Excluir"
                        onClick={() => handleDelete(proj)}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="project-switcher__footer">
            <button
              type="button"
              className="project-switcher__new"
              onClick={handleCreate}
            >
              + Novo projeto
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
