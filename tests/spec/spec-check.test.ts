import { describe, expect, it } from 'vitest';
import { checkSpec, formatIssue, type Issue } from '../../tools/spec/check';
import { readGenerated, readSpec } from '../../tools/spec/files';
import { generateFiles } from '../../tools/spec/generate';
import { parseSpec } from '../../tools/spec/parser';

const SPEC = readSpec();

/** Cópia do SPEC com um trecho trocado (o trecho precisa existir exatamente uma vez). */
function quebrar(de: string, para: string): string {
  expect(SPEC.split(de).length - 1).toBe(1);
  return SPEC.replace(de, para);
}

function linhaDe(texto: string, trecho: string): number {
  return texto.slice(0, texto.indexOf(trecho)).split('\n').length;
}

/** Problemas de uma cópia quebrada, com os gerados em dia com ela (isola a validação). */
function problemas(texto: string): Issue[] {
  return checkSpec(texto, generateFiles(parseSpec(texto)));
}

describe('TEC-11: spec:check', () => {
  it('o SPEC atual e os dados gerados no disco passam', () => {
    expect(checkSpec(SPEC, readGenerated()).map(formatIssue)).toEqual([]);
  });

  it('acusa gerados desatualizados, ausentes e sobrando', () => {
    const gerados = generateFiles(parseSpec(SPEC));
    gerados.set('custos.json', '[]\n');
    gerados.delete('armas.json');
    gerados.set('velho.json', '[]\n');
    const mensagens = checkSpec(SPEC, gerados)
      .filter((p) => p.tipo === 'gerados')
      .map((p) => p.mensagem);
    expect(mensagens).toEqual([
      expect.stringContaining('armas.json ausente'),
      expect.stringContaining('custos.json desatualizado'),
      expect.stringContaining('velho.json sobrando'),
    ]);
  });

  it('acusa vr diferente da soma da receita, apontando tabela e linha', () => {
    const linha =
      '| hover_explorer | Hover de Exploração | movel | ship+printer | 15 | 10 | 4 | 0 | 0 | 0 | 31 |';
    const texto = quebrar(linha, linha.replace('| 31 |', '| 30 |'));
    expect(problemas(texto)).toContainEqual({
      tipo: 'vr',
      tabela: 'custos',
      linha: linhaDe(texto, '| hover_explorer | Hover de Exploração'),
      mensagem: 'vr de "hover_explorer" é 30, mas a receita soma 31',
    });
  });

  it('acusa pesos de personalidade que não somam 100', () => {
    const texto = quebrar('| usa | Supremacia aérea | 25 |', '| usa | Supremacia aérea | 26 |');
    expect(problemas(texto)).toContainEqual({
      tipo: 'personalidades',
      tabela: 'personalidades',
      linha: linhaDe(texto, '| usa | Supremacia aérea'),
      mensagem: 'pesos de "usa" somam 101, não 100',
    });
  });

  it('acusa ID repetido', () => {
    const texto = quebrar(
      '| printer | Impressora 3D Móvel | movel |',
      '| hover_explorer | Impressora 3D Móvel | movel |',
    );
    expect(problemas(texto)).toContainEqual(
      expect.objectContaining({
        tipo: 'id_duplicado',
        tabela: 'custos',
        linha: linhaDe(texto, '| hover_explorer | Impressora 3D Móvel'),
      }),
    );
  });

  it('acusa chave de parâmetro repetida', () => {
    const texto = quebrar('| duracao_pouso_s | 8 |', '| tick_hz | 8 |');
    expect(problemas(texto)).toContainEqual(
      expect.objectContaining({
        tipo: 'chave_duplicada',
        tabela: 'parametros',
        linha: linhaDe(texto, '| tick_hz | 8 |'),
      }),
    );
  });

  it.each([
    [
      'arma inexistente',
      '| 300 | 0,5 | 0 | ex1_laser |',
      '| 300 | 0,5 | 0 | laser_x |',
      'moveis',
      'arma "laser_x"',
    ],
    [
      'produtor inexistente',
      '| movel | ship+printer | 15 |',
      '| movel | ship+fabrica | 15 |',
      'custos',
      'produzido_por "fabrica"',
    ],
    [
      'cenário inexistente',
      '| 3 | m03 | marte |',
      '| 3 | m03 | plutao |',
      'missoes',
      'cenario "plutao"',
    ],
    [
      'unidade liberada inexistente',
      'nuclear_plant+hover_minelayer',
      'nuclear_plant+hover_x',
      'missoes',
      'libera "hover_x"',
    ],
  ])('acusa referência inválida: %s', (_caso, de, para, tabela, trecho) => {
    const texto = quebrar(de, para);
    expect(problemas(texto)).toContainEqual(
      expect.objectContaining({
        tipo: 'referencia',
        tabela,
        linha: linhaDe(texto, para),
        mensagem: expect.stringContaining(trecho),
      }),
    );
  });

  it('acusa chave em crase que não existe nas tabelas', () => {
    const texto = `${SPEC}\nRegra nova com \`chave_inexistente\`.\n`;
    expect(problemas(texto)).toContainEqual({
      tipo: 'crase',
      linha: linhaDe(texto, 'Regra nova com'),
      mensagem:
        '`chave_inexistente` não existe como chave de parâmetro, coluna ou ID de nenhuma tabela',
    });
  });

  it('acusa curinga que não casa com nenhuma chave', () => {
    const texto = `${SPEC}\nVer \`nada_*_aqui\` e \`dados:inexistente\`.\n`;
    const crase = problemas(texto).filter((p) => p.tipo === 'crase');
    expect(crase.map((p) => p.mensagem)).toEqual([
      'curinga `nada_*_aqui` não casa com nenhuma chave',
      '`dados:inexistente` não corresponde a nenhuma tabela de dados',
    ]);
  });

  it('acusa erro de estrutura de tabela com a linha', () => {
    const texto = quebrar('| p | 108 | 2 | 2 | 1v1 rápido |', '| p | 108 | 2 | 1v1 rápido |');
    // O parser falha antes de qualquer geração, então os gerados não importam aqui.
    expect(checkSpec(texto, new Map())).toEqual([
      expect.objectContaining({ tipo: 'parser', linha: linhaDe(texto, '| p | 108 | 2 | 1v1') }),
    ]);
  });
});
