import type { ReactNode } from 'react';

/** Empilha Páginas + propriedades da coluna sem sobreposição (mesmo canto superior esquerdo). */
export function CanvasLeftDock({ children }: { children: ReactNode }) {
  return <div className="canvas-left-dock">{children}</div>;
}
