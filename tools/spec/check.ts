/**
 * Validações do `npm run spec:check` (TEC-11).
 * Cada problema aponta a tabela e a linha do SPEC.md sempre que possível.
 */
import { generateFiles, GENERATED_DIR } from './generate';
import { type Cell, type ParsedSpec, parseSpec, SpecError, type SpecTable } from './parser';

export type IssueKind =
  | 'parser'
  | 'gerados'
  | 'tabela_ausente'
  | 'vr'
  | 'personalidades'
  | 'id_duplicado'
  | 'chave_duplicada'
  | 'referencia'
  | 'crase';

export interface Issue {
  tipo: IssueKind;
  mensagem: string;
  tabela?: string;
  linha?: number;
}

const KEY = /^[a-z][a-z0-9_]*$/;
const WILDCARD = /^[a-z][a-z0-9_]*\*[a-z0-9_*]*$|^\*[a-z0-9_*]+$/;

export function formatIssue(issue: Issue): string {
  const onde = issue.linha ? `SPEC.md:${issue.linha}` : 'SPEC.md';
  const tabela = issue.tabela ? ` [dados:${issue.tabela}]` : '';
  return `${onde}${tabela} ${issue.mensagem}`;
}

function stringsOf(cell: Cell): string[] {
  if (typeof cell === 'string') return [cell];
  if (Array.isArray(cell)) return cell.filter((item): item is string => typeof item === 'string');
  return [];
}

function idsOf(table: SpecTable | undefined, column = 'id'): Set<string> {
  return new Set(table?.rows.flatMap((row) => stringsOf(row.values[column] ?? null)) ?? []);
}

function requireTables(spec: ParsedSpec, names: string[], issues: Issue[]): boolean {
  const missing = names.filter((name) => !spec.tables.has(name));
  for (const name of missing) {
    issues.push({ tipo: 'tabela_ausente', tabela: name, mensagem: `tabela dados:${name} ausente` });
  }
  return missing.length === 0;
}

function checkGenerated(spec: ParsedSpec, generated: Map<string, string>, issues: Issue[]): void {
  const expected = generateFiles(spec);
  const rodar = 'rode `npm run spec:sync`';
  for (const [name, content] of expected) {
    const current = generated.get(name);
    if (current === undefined) {
      issues.push({ tipo: 'gerados', mensagem: `${GENERATED_DIR}/${name} ausente; ${rodar}` });
    } else if (current !== content) {
      issues.push({
        tipo: 'gerados',
        mensagem: `${GENERATED_DIR}/${name} desatualizado; ${rodar}`,
      });
    }
  }
  for (const name of generated.keys()) {
    if (!expected.has(name)) {
      issues.push({ tipo: 'gerados', mensagem: `${GENERATED_DIR}/${name} sobrando; ${rodar}` });
    }
  }
}

function checkVr(spec: ParsedSpec, issues: Issue[]): void {
  if (!requireTables(spec, ['recursos', 'custos'], issues)) return;
  const vrPorRecurso = new Map(
    spec.tables.get('recursos')!.rows.map((row) => [String(row.values.id), Number(row.values.vr)]),
  );
  for (const row of spec.tables.get('custos')!.rows) {
    let soma = 0;
    for (const [recurso, vr] of vrPorRecurso) soma += Number(row.values[recurso] ?? 0) * vr;
    const declarado = Number(row.values.vr);
    if (Math.abs(soma - declarado) > 1e-9) {
      issues.push({
        tipo: 'vr',
        tabela: 'custos',
        linha: row.line,
        mensagem: `vr de "${String(row.values.id)}" é ${declarado}, mas a receita soma ${soma}`,
      });
    }
  }
}

function checkPersonalities(spec: ParsedSpec, issues: Issue[]): void {
  if (!requireTables(spec, ['personalidades'], issues)) return;
  for (const row of spec.tables.get('personalidades')!.rows) {
    const soma = Object.values(row.values)
      .filter((value): value is number => typeof value === 'number')
      .reduce((total, value) => total + value, 0);
    if (soma !== 100) {
      issues.push({
        tipo: 'personalidades',
        tabela: 'personalidades',
        linha: row.line,
        mensagem: `pesos de "${String(row.values.nacao)}" somam ${soma}, não 100`,
      });
    }
  }
}

function checkUnique(spec: ParsedSpec, issues: Issue[]): void {
  const verificar = (table: SpecTable, column: string, tipo: IssueKind) => {
    const vistos = new Set<string>();
    for (const row of table.rows) {
      const valor = String(row.values[column]);
      if (vistos.has(valor)) {
        issues.push({
          tipo,
          tabela: table.name,
          linha: row.line,
          mensagem: `${column} "${valor}" repetido`,
        });
      }
      vistos.add(valor);
    }
  };
  for (const table of spec.tables.values()) {
    if (table.columns.includes('id')) verificar(table, 'id', 'id_duplicado');
  }
  const parametros = spec.tables.get('parametros');
  if (parametros) verificar(parametros, 'chave', 'chave_duplicada');
}

function checkReferences(spec: ParsedSpec, issues: Issue[]): void {
  const t = (name: string) => spec.tables.get(name);
  const refs = (
    tabela: string,
    coluna: string,
    validos: Set<string>,
    descricao: string,
    filtro: (row: SpecTable['rows'][number]) => boolean = () => true,
  ) => {
    for (const row of t(tabela)?.rows.filter(filtro) ?? []) {
      for (const valor of stringsOf(row.values[coluna] ?? null)) {
        if (!validos.has(valor)) {
          issues.push({
            tipo: 'referencia',
            tabela: tabela,
            linha: row.line,
            mensagem: `${coluna} "${valor}" não existe em ${descricao}`,
          });
        }
      }
    }
  };

  const armas = idsOf(t('armas'));
  const custos = idsOf(t('custos'));
  const moveis = idsOf(t('moveis'));
  const estruturas = idsOf(t('estruturas'));
  const produtores = new Set([...custos, ...moveis, ...estruturas]);

  refs('moveis', 'arma', armas, 'dados:armas');
  refs('estruturas', 'arma', armas, 'dados:armas');
  refs('custos', 'produzido_por', produtores, 'unidades nem estruturas');
  refs('moveis', 'id', custos, 'dados:custos');
  refs('custos', 'id', moveis, 'dados:moveis', (row) => row.values.categoria === 'movel');
  refs(
    'custos',
    'id',
    estruturas,
    'dados:estruturas',
    (row) => row.values.categoria === 'estrutura',
  );
  refs('missoes', 'cenario', idsOf(t('cenarios')), 'dados:cenarios');
  refs('missoes', 'libera', custos, 'dados:custos');
  refs('personalidades', 'nacao', idsOf(t('nacoes')), 'dados:nacoes');
}

function checkBacktickKeys(text: string, spec: ParsedSpec, issues: Issue[]): void {
  const conhecidos = new Set<string>();
  for (const table of spec.tables.values()) {
    for (const column of table.columns) conhecidos.add(column);
    for (const row of table.rows) {
      for (const value of Object.values(row.values)) {
        for (const s of stringsOf(value)) conhecidos.add(s);
      }
    }
  }

  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  let emBlocoDeCodigo = false;
  lines.forEach((line, index) => {
    if (/^\s*```/.test(line)) {
      emBlocoDeCodigo = !emBlocoDeCodigo;
      return;
    }
    if (emBlocoDeCodigo) return;
    for (const match of line.matchAll(/`([^`\n]+)`/g)) {
      const token = match[1] ?? '';
      let problema: string | null = null;
      if (token.startsWith('dados:')) {
        const nome = token.slice('dados:'.length);
        const padrao = new RegExp(`^${nome.replace(/\*/g, '.*')}$`);
        if (![...spec.tables.keys()].some((tabela) => padrao.test(tabela))) {
          problema = `\`${token}\` não corresponde a nenhuma tabela de dados`;
        }
      } else if (KEY.test(token)) {
        if (!conhecidos.has(token)) {
          problema = `\`${token}\` não existe como chave de parâmetro, coluna ou ID de nenhuma tabela`;
        }
      } else if (WILDCARD.test(token)) {
        const padrao = new RegExp(`^${token.replace(/\*/g, '[a-z0-9_]*')}$`);
        if (![...conhecidos].some((chave) => padrao.test(chave))) {
          problema = `curinga \`${token}\` não casa com nenhuma chave`;
        }
      }
      if (problema) issues.push({ tipo: 'crase', linha: index + 1, mensagem: problema });
    }
  });
}

/** Valida o texto do SPEC contra o conteúdo atual de `src/sim/data/generated/`. */
export function checkSpec(text: string, generated: Map<string, string>): Issue[] {
  let spec: ParsedSpec;
  try {
    spec = parseSpec(text);
  } catch (error) {
    if (error instanceof SpecError) {
      return [
        { tipo: 'parser', mensagem: error.message, ...(error.line ? { linha: error.line } : {}) },
      ];
    }
    throw error;
  }
  const issues: Issue[] = [];
  checkGenerated(spec, generated, issues);
  checkVr(spec, issues);
  checkPersonalities(spec, issues);
  checkUnique(spec, issues);
  checkReferences(spec, issues);
  checkBacktickKeys(text, spec, issues);
  return issues;
}
