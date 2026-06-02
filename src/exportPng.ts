// Exporta o diagrama (viewport do React Flow) como PNG via html-to-image.
import { toPng } from 'html-to-image';

/** Captura o `.react-flow__viewport` e devolve um dataURL PNG. */
export async function captureDiagramPng(): Promise<string> {
  const viewport = document.querySelector<HTMLElement>('.react-flow__viewport');
  if (!viewport) throw new Error('Canvas não encontrado');
  return toPng(viewport, {
    backgroundColor: '#ffffff',
    pixelRatio: 2,
    // garante que nós fora da viewport visível também entrem
    width: viewport.scrollWidth || undefined,
    height: viewport.scrollHeight || undefined,
  });
}

/** Dispara o download do PNG no navegador. */
export function downloadDataUrl(dataUrl: string, filename: string): void {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  a.click();
}
