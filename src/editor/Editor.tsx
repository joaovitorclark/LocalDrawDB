import { useCallback, useRef } from 'react';
import CodeMirror, { type ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { sql } from '@codemirror/lang-sql';
import { EditorView } from '@codemirror/view';
import { Outline } from './Outline';
import { dbmlFoldExtension } from './dbmlFold';

type Props = {
  value: string;
  onChange: (v: string) => void;
  error?: string;
  onFocusTable?: (tableId: string) => void;
};

export function Editor({ value, onChange, error, onFocusTable }: Props) {
  const cmRef = useRef<ReactCodeMirrorRef>(null);

  const goToLine = useCallback((line: number) => {
    const view = cmRef.current?.view;
    if (!view) return;
    const lineInfo = view.state.doc.line(Math.min(line + 1, view.state.doc.lines));
    view.dispatch({
      selection: { anchor: lineInfo.from },
      effects: EditorView.scrollIntoView(lineInfo.from, { y: 'start' }),
    });
    view.focus();
  }, []);

  return (
    <div className="editor">
      <Outline dbml={value} onGoToLine={goToLine} onFocusTable={onFocusTable} />
      <CodeMirror
        ref={cmRef}
        value={value}
        height="100%"
        className="cm-host"
        theme="dark"
        extensions={[sql(), dbmlFoldExtension]}
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
      {error && <div className="editor__error">⚠ {error}</div>}
    </div>
  );
}
