/**
 * Parser das tabelas de dados do SPEC.md (GOV-05, GOV-06).
 *
 * Uma tabela de dados é precedida por `<!-- dados:NOME -->`. Tabelas com o mesmo NOME são
 * concatenadas. Conversão de células:
 * - `—` ou vazio → null
 * - número com vírgula decimal (`0,5`, `-20`) → number
 * - `sim` / `nao` → boolean
 * - partes unidas por `+` viram lista só quando todas são IDs snake_case ou números
 *   (`solo+ar` → lista; `Ctrl+1..9` continua texto)
 * - o resto → string
 *
 * Normalização por coluna: se uma coluna tem ao menos uma lista e todas as outras células são
 * compatíveis com lista (ID, número ou null), os valores isolados viram listas de 1 elemento.
 */

export type Scalar = string | number | boolean | null;
export type Cell = Scalar | Array<string | number>;

export interface SpecRow {
  /** Linha (1-based) no SPEC.md. */
  line: number;
  values: Record<string, Cell>;
}

export interface SpecTable {
  name: string;
  columns: string[];
  rows: SpecRow[];
  /** Linhas dos marcadores de cada fragmento da tabela. */
  markerLines: number[];
}

export interface ParsedSpec {
  version: string | null;
  tables: Map<string, SpecTable>;
}

export class SpecError extends Error {
  constructor(
    message: string,
    readonly line?: number,
  ) {
    super(message);
    this.name = 'SpecError';
  }
}

const MARKER = /^<!--\s*dados:([a-z0-9_]+)\s*-->$/;
const SEPARATOR = /^\|(\s*:?-{3,}:?\s*\|)+$/;
const NUMBER = /^-?\d+(,\d+)?$/;
const ID = /^[a-z0-9_]+$/;
const COLUMN = /^[a-z][a-z0-9_]*$/;
const VERSION = /^\|\s*Versão do SPEC\s*\|\s*(\d+\.\d+\.\d+)/;

function toNumber(text: string): number {
  return Number(text.replace(',', '.'));
}

export function parseCell(raw: string): Cell {
  const text = raw.trim();
  if (text === '—' || text === '') return null;
  if (NUMBER.test(text)) return toNumber(text);
  if (text === 'sim') return true;
  if (text === 'nao') return false;
  if (text.includes('+')) {
    const parts = text.split('+');
    if (parts.every((part) => NUMBER.test(part) || ID.test(part))) {
      return parts.map((part) => (NUMBER.test(part) ? toNumber(part) : part));
    }
  }
  return text;
}

function splitRow(line: string): string[] {
  let text = line.trim();
  if (text.startsWith('|')) text = text.slice(1);
  if (text.endsWith('|')) text = text.slice(0, -1);
  return text.split('|').map((cell) => cell.trim());
}

function isListCompatible(value: Cell): boolean {
  return (
    value === null ||
    Array.isArray(value) ||
    typeof value === 'number' ||
    (typeof value === 'string' && ID.test(value))
  );
}

function normalizeListColumns(table: SpecTable): void {
  for (const column of table.columns) {
    const cells = table.rows.map((row) => row.values[column] ?? null);
    if (!cells.some(Array.isArray) || !cells.every(isListCompatible)) continue;
    for (const row of table.rows) {
      const value = row.values[column] ?? null;
      if (value !== null && !Array.isArray(value)) {
        row.values[column] = [value as string | number];
      }
    }
  }
}

export function parseSpec(text: string): ParsedSpec {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const tables = new Map<string, SpecTable>();
  let version: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = (lines[i] ?? '').trim();
    version ??= VERSION.exec(line)?.[1] ?? null;
    const marker = MARKER.exec(line);
    if (!marker) continue;

    const name = marker[1] ?? '';
    let headerIndex = i + 1;
    while (headerIndex < lines.length && (lines[headerIndex] ?? '').trim() === '') headerIndex++;
    const header = lines[headerIndex];
    if (header === undefined || !header.trim().startsWith('|')) {
      throw new SpecError(`dados:${name}: marcador sem tabela logo abaixo`, i + 1);
    }

    const columns = splitRow(header);
    for (const column of columns) {
      if (!COLUMN.test(column)) {
        throw new SpecError(
          `dados:${name}: coluna "${column}" não está em snake_case`,
          headerIndex + 1,
        );
      }
    }
    if (new Set(columns).size !== columns.length) {
      throw new SpecError(`dados:${name}: colunas repetidas no cabeçalho`, headerIndex + 1);
    }
    if (!SEPARATOR.test((lines[headerIndex + 1] ?? '').trim())) {
      throw new SpecError(`dados:${name}: falta a linha separadora do cabeçalho`, headerIndex + 2);
    }

    const rows: SpecRow[] = [];
    let rowIndex = headerIndex + 2;
    while (rowIndex < lines.length && (lines[rowIndex] ?? '').trim().startsWith('|')) {
      const cells = splitRow(lines[rowIndex] ?? '');
      if (cells.length !== columns.length) {
        throw new SpecError(
          `dados:${name}: linha com ${cells.length} células, mas o cabeçalho tem ${columns.length}`,
          rowIndex + 1,
        );
      }
      const values: Record<string, Cell> = {};
      columns.forEach((column, index) => {
        values[column] = parseCell(cells[index] ?? '');
      });
      rows.push({ line: rowIndex + 1, values });
      rowIndex++;
    }

    const existing = tables.get(name);
    if (existing) {
      if (existing.columns.join('|') !== columns.join('|')) {
        throw new SpecError(
          `dados:${name}: colunas diferentes das da primeira tabela com o mesmo nome`,
          headerIndex + 1,
        );
      }
      existing.rows.push(...rows);
      existing.markerLines.push(i + 1);
    } else {
      tables.set(name, { name, columns, rows, markerLines: [i + 1] });
    }
    i = rowIndex - 1;
  }

  for (const table of tables.values()) normalizeListColumns(table);
  return { version, tables };
}
