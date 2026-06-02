import CodeMirror from '@uiw/react-codemirror';
import { sql } from '@codemirror/lang-sql';

// Editor da DSL (DBML). Tema escuro p/ contraste; realce reaproveitando o modo SQL.
type Props = {
  value: string;
  onChange: (v: string) => void;
  error?: string;
};

export function Editor({ value, onChange, error }: Props) {
  return (
    <div className="editor">
      <CodeMirror
        value={value}
        height="100%"
        theme="dark"
        extensions={[sql()]}
        onChange={onChange}
        basicSetup={{
          lineNumbers: true,
          foldGutter: true,
          highlightActiveLine: true,
          // Undo/redo é global (App): desativa o history nativo para não conflitar.
          history: false,
          historyKeymap: false,
        }}
        placeholder={'Defina suas tabelas em DBML…\n\nTable schema.tabela {\n  id bigint [pk]\n  nome string\n}'}
      />
      {error && <div className="editor__error">⚠ {error}</div>}
    </div>
  );
}
