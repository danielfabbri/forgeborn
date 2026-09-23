/**
 * Geração de `src/sim/data/generated/` a partir das tabelas do SPEC (TEC-11).
 * Saída determinística: tabelas em ordem alfabética, linhas na ordem do SPEC,
 * chaves na ordem das colunas, fim de linha LF.
 */
import type { Cell, ParsedSpec, SpecTable } from './parser';

export const GENERATED_DIR = 'src/sim/data/generated';

function pascal(snake: string): string {
  return snake
    .split('_')
    .map((part) => (part ? part[0]!.toUpperCase() + part.slice(1) : ''))
    .join('');
}

function literal(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

function tsType(cells: Cell[]): string {
  const kinds = new Set<string>();
  let nullable = false;
  for (const cell of cells) {
    if (cell === null) {
      nullable = true;
    } else if (Array.isArray(cell)) {
      const elements = [...new Set(cell.map((item) => typeof item))].sort();
      kinds.add(
        elements.length > 1 ? `(${elements.join(' | ')})[]` : `${elements[0] ?? 'never'}[]`,
      );
    } else {
      kinds.add(typeof cell);
    }
  }
  const types = [...kinds].sort();
  if (nullable) types.push('null');
  return types.length > 0 ? types.join(' | ') : 'null';
}

/** Nome do tipo-união das chaves, quando a 1ª coluna tem strings únicas. */
function keyUnion(table: SpecTable): { typeName: string; members: string[] } | null {
  const first = table.columns[0];
  if (first === undefined) return null;
  const keys = table.rows.map((row) => row.values[first]);
  if (!keys.every((key): key is string => typeof key === 'string')) return null;
  if (new Set(keys).size !== keys.length) return null;
  return { typeName: `${pascal(table.name)}${pascal(first)}`, members: keys };
}

function generateTypes(spec: ParsedSpec, names: string[]): string {
  const out: string[] = [
    `// ARQUIVO GERADO por \`npm run spec:sync\` a partir de SPEC.md v${spec.version ?? '?'}.`,
    '// Não edite à mão: altere o SPEC e rode o spec:sync (GOV-05).',
    '',
  ];
  for (const name of names) {
    const table = spec.tables.get(name)!;
    const union = keyUnion(table);
    if (union) {
      out.push(`export type ${union.typeName} =`);
      union.members.forEach((member, index) => {
        out.push(`  | ${literal(member)}${index === union.members.length - 1 ? ';' : ''}`);
      });
      out.push('');
    }
    out.push(`export interface ${pascal(name)}Row {`);
    table.columns.forEach((column, index) => {
      const type =
        index === 0 && union
          ? union.typeName
          : tsType(table.rows.map((row) => row.values[column] ?? null));
      out.push(`  ${column}: ${type};`);
    });
    out.push('}', '');
  }
  out.push('export interface Tabelas {');
  for (const name of names) out.push(`  ${name}: ${pascal(name)}Row[];`);
  out.push('}', '');
  return out.join('\n');
}

export function generateFiles(spec: ParsedSpec): Map<string, string> {
  const names = [...spec.tables.keys()].sort();
  const files = new Map<string, string>();
  for (const name of names) {
    const rows = spec.tables.get(name)!.rows.map((row) => row.values);
    files.set(`${name}.json`, `${JSON.stringify(rows, null, 2)}\n`);
  }
  files.set(
    'meta.json',
    `${JSON.stringify({ versao_spec: spec.version, tabelas: names }, null, 2)}\n`,
  );
  files.set('types.ts', generateTypes(spec, names));
  return files;
}
