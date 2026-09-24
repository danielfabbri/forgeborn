import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ALVOS, ATACANTES, tabelaMarkdown } from '../../tools/balanco/tempos';

/** Linhas da tabela de §21.2 no SPEC. */
function tabelaDoSpec(): string[] {
  const spec = readFileSync('SPEC.md', 'utf8');
  const inicio = spec.indexOf('| Atacante → alvo (s) |');
  return spec
    .slice(inicio)
    .split('\n')
    .slice(0, 2 + ATACANTES.length)
    .map((l) => l.trim());
}

describe('T-068 — §21.2: relatório de balanceamento', () => {
  it('§21.2: balance:report recalcula a tabela de tempos de abate e ela bate com o SPEC', () => {
    const calculada = tabelaMarkdown().split('\n');
    const spec = tabelaDoSpec();
    expect(calculada[0]).toBe(spec[0]);
    // Compara célula a célula (o separador do SPEC é formatado pelo Prettier).
    for (let k = 2; k < spec.length; k++) {
      const celulas = (l: string) =>
        l
          .split('|')
          .map((c) => c.trim())
          .filter(Boolean);
      expect(celulas(calculada[k]!), ATACANTES[k - 2]!.rotulo).toEqual(celulas(spec[k]!));
    }
    expect(ALVOS).toHaveLength(9);
  });
});
