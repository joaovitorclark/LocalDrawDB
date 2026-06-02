import { foldService } from '@codemirror/language';
import type { EditorState } from '@codemirror/state';

/**
 * Custom fold service for DBML:
 * - Folds consecutive // comment lines (2+ lines)
 * - Folds brace blocks { ... } (Table, LayerGroup, Records, etc.)
 */
export const dbmlFoldExtension = foldService.of(
  (state: EditorState, lineStart: number) => {
    const line = state.doc.lineAt(lineStart);
    const text = line.text.trim();

    // Fold consecutive comment lines
    if (text.startsWith('//')) {
      let endLine = line.number;
      while (endLine < state.doc.lines) {
        const next = state.doc.line(endLine + 1);
        if (!next.text.trim().startsWith('//')) break;
        endLine++;
      }
      if (endLine > line.number) {
        return { from: line.to, to: state.doc.line(endLine).to };
      }
      return null;
    }

    // Fold brace blocks (already handled by bracket matching, but ensure it works)
    const braceIdx = line.text.indexOf('{');
    if (braceIdx >= 0) {
      let depth = 0;
      for (let i = line.number; i <= state.doc.lines; i++) {
        const l = state.doc.line(i).text;
        for (const ch of l) {
          if (ch === '{') depth++;
          else if (ch === '}') {
            depth--;
            if (depth === 0) {
              const endLn = state.doc.line(i);
              if (i > line.number) {
                return { from: line.from + braceIdx + 1, to: endLn.to - 1 };
              }
              return null;
            }
          }
        }
      }
    }

    return null;
  },
);
