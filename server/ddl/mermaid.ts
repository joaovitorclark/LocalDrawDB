// Gera um diagrama Mermaid `erDiagram` a partir do modelo canônico.
import { qualifiedName } from '../model.ts';
import type { Model, Table } from '../model.ts';

// Nomes de entidade no Mermaid: apenas [A-Za-z0-9_]. schema.tabela -> schema_tabela.
const ent = (name: string) => name.replace(/[^\w]/g, '_');
// Tipo schematizado: base sem parâmetros (decimal(18,2) -> decimal) p/ validade no Mermaid.
const mermaidType = (type: string) => type.replace(/\(.*\)/, '');

function tableBlock(t: Table): string {
  const lines = t.columns.map((c) => {
    const type = mermaidType(c.type) || 'string';
    const pk = c.pk ? ' PK' : '';
    return `    ${type} ${c.name}${pk}`;
  });
  return `  ${ent(qualifiedName(t))} {\n${lines.join('\n')}\n  }`;
}

/** Modelo -> texto Mermaid erDiagram. */
export function modelToMermaid(model: Model): string {
  const entities = model.tables.map(tableBlock).join('\n');
  const rels = model.refs
    .map((r) => {
      // from = lado "muitos"; to = lado "um".
      const from = ent(r.from.table);
      const to = ent(r.to.table);
      return `  ${to} ||--o{ ${from} : "${r.from.column}"`;
    })
    .join('\n');
  return `erDiagram\n${entities}${rels ? '\n' + rels : ''}\n`;
}
