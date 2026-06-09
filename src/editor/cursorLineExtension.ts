import { EditorView } from '@codemirror/view';

/** Notifica a linha 0-based do cursor quando a seleção muda (não a cada keystroke). */
export function cursorLineExtension(onLineChange: (line0: number) => void) {
  return EditorView.updateListener.of((update) => {
    if (!update.selectionSet) return;
    const line0 = update.state.doc.lineAt(update.state.selection.main.head).number - 1;
    onLineChange(line0);
  });
}
