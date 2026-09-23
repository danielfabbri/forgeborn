import { describe, expect, it } from 'vitest';
import { readSpec } from '../../tools/spec/files';
import { generateFiles } from '../../tools/spec/generate';
import { parseCell, parseSpec, SpecError } from '../../tools/spec/parser';

type Linha = Record<string, unknown>;

describe('GOV-06: conversão de células', () => {
  it.each([
    ['0,5', 0.5],
    ['20', 20],
    ['-20', -20],
    ['—', null],
    ['', null],
    ['sim', true],
    ['nao', false],
    ['solo+ar', ['solo', 'ar']],
    ['ship+printer', ['ship', 'printer']],
    ['0,75+1+1,25+1,5', [0.75, 1, 1.25, 1.5]],
    ['Ctrl+1..9', 'Ctrl+1..9'],
    ['aleatoria+nações restantes', 'aleatoria+nações restantes'],
    ['#3D7BFF', '#3D7BFF'],
    ['Hover de Exploração', 'Hover de Exploração'],
  ])('%j → %j', (bruto, esperado) => {
    expect(parseCell(bruto)).toEqual(esperado);
  });
});

const MINI = [
  '| Versão do SPEC | 9.8.7 — teste |',
  '',
  '<!-- dados:unidades -->',
  '| id | produzido_por | alvos | hp |',
  '|---|---|---|---|',
  '| a | ship+printer | solo+ar | 10 |',
  '| b | printer | solo | 20,5 |',
  '',
  'Texto entre tabelas.',
  '',
  '<!-- dados:parametros -->',
  '| chave | valor |',
  '|---|---|',
  '| x | 1 |',
  '',
  '<!-- dados:parametros -->',
  '| chave | valor |',
  '|---|---|',
  '| y | 2 |',
].join('\n');

describe('GOV-05: parser de tabelas', () => {
  const spec = parseSpec(MINI);

  it('lê a versão do SPEC e as tabelas', () => {
    expect(spec.version).toBe('9.8.7');
    expect([...spec.tables.keys()]).toEqual(['unidades', 'parametros']);
  });

  it('concatena tabelas com o mesmo nome', () => {
    const parametros = spec.tables.get('parametros')!;
    expect(parametros.rows.map((r) => r.values)).toEqual([
      { chave: 'x', valor: 1 },
      { chave: 'y', valor: 2 },
    ]);
    expect(parametros.markerLines).toEqual([11, 16]);
  });

  it('normaliza colunas de lista e guarda a linha de cada registro', () => {
    const [a, b] = spec.tables.get('unidades')!.rows;
    expect(a).toEqual({
      line: 6,
      values: { id: 'a', produzido_por: ['ship', 'printer'], alvos: ['solo', 'ar'], hp: 10 },
    });
    expect(b).toEqual({
      line: 7,
      values: { id: 'b', produzido_por: ['printer'], alvos: ['solo'], hp: 20.5 },
    });
  });

  it('acusa linha com número errado de células', () => {
    const quebrado = MINI.replace('| b | printer | solo | 20,5 |', '| b | printer | 20,5 |');
    expect(() => parseSpec(quebrado)).toThrow(SpecError);
    expect(() => parseSpec(quebrado)).toThrow(/3 células.*4/);
    try {
      parseSpec(quebrado);
    } catch (erro) {
      expect((erro as SpecError).line).toBe(7);
    }
  });

  it('acusa marcador sem tabela', () => {
    expect(() => parseSpec('<!-- dados:vazia -->\n\nTexto.')).toThrow(/marcador sem tabela/);
  });

  it('acusa fragmentos com colunas diferentes', () => {
    const quebrado = MINI.replace(
      '| chave | valor |\n|---|---|\n| y |',
      '| chave | v |\n|---|---|\n| y |',
    );
    expect(() => parseSpec(quebrado)).toThrow(/colunas diferentes/);
  });
});

describe('TEC-11: spec:sync sobre o SPEC real', () => {
  const texto = readSpec();
  const arquivos = generateFiles(parseSpec(texto));
  const json = (nome: string) => JSON.parse(arquivos.get(`${nome}.json`) ?? 'null') as Linha[];

  it('gera um JSON para cada nome de tabela dados:*, além de meta.json e types.ts', () => {
    const nomes = new Set([...texto.matchAll(/<!--\s*dados:([a-z0-9_]+)\s*-->/g)].map((m) => m[1]));
    const gerados = [...arquivos.keys()]
      .filter((nome) => nome.endsWith('.json') && nome !== 'meta.json')
      .map((nome) => nome.replace(/\.json$/, ''));
    expect(new Set(gerados)).toEqual(nomes);
    expect(arquivos.has('meta.json')).toBe(true);
    expect(arquivos.has('types.ts')).toBe(true);
  });

  it('é determinístico: duas gerações seguidas produzem a mesma saída', () => {
    expect(generateFiles(parseSpec(readSpec()))).toEqual(arquivos);
  });

  it('converte os valores do SPEC', () => {
    const custo = (id: string) => json('custos').find((r) => r.id === id);
    expect(custo('hover_explorer')?.produzido_por).toEqual(['ship', 'printer']);
    expect(custo('printer')?.produzido_por).toEqual(['ship']);
    expect(custo('mobile_silo')?.ref_x).toBeNull();

    const arma = (id: string) => json('armas').find((r) => r.id === id);
    expect(arma('bomb')?.alvos).toEqual(['solo']);
    expect(arma('ex1_laser')?.alvos).toEqual(['solo', 'ar']);
    expect(arma('mine_blast')?.recarga_s).toBeNull();

    const estrutura = (id: string) => json('estruturas').find((r) => r.id === id);
    expect(estrutura('ship')?.deposito).toBe(true);
    expect(estrutura('laser_tower')?.deposito).toBe(false);

    const parametro = (chave: string) => json('parametros').find((r) => r.chave === chave)?.valor;
    expect(parametro('tick_hz')).toBe(20);
    expect(parametro('bomba_tempo_queda_s')).toBe(0.6);

    expect(json('atalhos').some((r) => r.tecla === 'Ctrl+1..9')).toBe(true);
    expect(json('free_battle').find((r) => r.opcao === 'velocidade')?.valores).toEqual([
      0.75, 1, 1.25, 1.5,
    ]);
  });

  it('meta.json registra a versão do SPEC', () => {
    const meta = JSON.parse(arquivos.get('meta.json') ?? '{}') as { versao_spec: string };
    expect(meta.versao_spec).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
