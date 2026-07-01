import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef } from 'react';
import CodeMirror, { type ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { sql } from '@codemirror/lang-sql';
import { EditorView } from '@codemirror/view';
import { Outline } from './Outline';
import { dbmlFoldExtension } from './dbmlFold';
import { cursorLineExtension } from './cursorLineExtension';
import { lineOfColumn } from '../dsl/lineLocate';

export type EditorHandle = {
  goToLine: (line: number) => void;
  goToColumn: (table: string, column: string) => void;
};

type Props = {
  value: string;
  onChange: (v: string) => void;
  error?: string;
  errorLine?: number;
  onFocusTable?: (tableId: string) => void;
  onGoToError?: () => void;
  /** Cursor moveu — linha 0-based (para sincronizar canvas). */
  onCursorLine?: (line0: number) => void;
  /** Disparado quando o editor perde foco (commit da edição). */
  onCommit?: () => void;
};

export const Editor = forwardRef<EditorHandle, Props>(function Editor(
  { value, onChange, error, errorLine, onFocusTable, onGoToError, onCursorLine, onCommit },
  ref,
) {
  const cmRef = useRef<ReactCodeMirrorRef>(null);
  const onCursorLineRef = useRef(onCursorLine);
  onCursorLineRef.current = onCursorLine;
  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;

  const extensions = useMemo(
    () => [
      sql(),
      dbmlFoldExtension,
      cursorLineExtension((line0) => onCursorLineRef.current?.(line0)),
      EditorView.domEventHandlers({
        blur: () => { onCommitRef.current?.(); return false; },
      }),
    ],
    [],
  );

  const goToLine = useCallback((line: number) => {
    const view = cmRef.current?.view;
    if (!view) return;
    const lineInfo = view.state.doc.line(Math.min(Math.max(1, line + 1), view.state.doc.lines));
    view.dispatch({
      selection: { anchor: lineInfo.from },
      effects: EditorView.scrollIntoView(lineInfo.from, { y: 'start' }),
    });
    view.focus();
  }, []);

  const goToColumn = useCallback(
    (table: string, column: string) => {
      const line = lineOfColumn(value, table, column);
      if (line != null) goToLine(line);
    },
    [value, goToLine],
  );

  useImperativeHandle(ref, () => ({ goToLine, goToColumn }), [goToLine, goToColumn]);

  return (
    <div className="editor">
      <Outline dbml={value} onGoToLine={goToLine} onFocusTable={onFocusTable} />
      <CodeMirror
        ref={cmRef}
        value={value}
        height="100%"
        className="cm-host"
        theme="dark"
        extensions={extensions}
        onChange={onChange}
        basicSetup={{
          lineNumbers: true,
          foldGutter: true,
          highlightActiveLine: true,
          history: false,
          historyKeymap: false,
        }}
        placeholder={'Defina suas tabelas em DBML…\n\nTable schema.tabela {\n  id bigint [pk]\n  nome string\n}'}
      />
      {error && (
        <button
          type="button"
          className="editor__error"
          onClick={() => {
            if (errorLine != null) goToLine(errorLine);
            onGoToError?.();
          }}
          title={errorLine != null ? 'Ir para linha do erro' : undefined}
        >
          ⚠ {error}
        </button>
      )}
    </div>
  );
});
