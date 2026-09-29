import { describe, expect, it } from 'vitest';
import {
  clipPathDe,
  contornoDe,
  corDaNacaoNo,
  corDoRecursoNo,
  emblemaDe,
  FORMA_DO_RECURSO,
  MODOS_DALTONICOS,
} from '../../src/game/paleta';
import { dados } from '../../src/sim';

describe('T-127 — UI-11: modo daltônico', () => {
  it('ART-04: sem modo daltônico, as cores são as de dados:nacoes e dados:recursos', () => {
    for (const n of dados.nacoes) expect(corDaNacaoNo('nenhum', n.id)).toBe(n.cor);
    for (const r of dados.recursos) expect(corDoRecursoNo('nenhum', r.id)).toBe(r.cor);
  });

  it('UI-11: em cada modo as nações e os recursos têm cores distintas', () => {
    for (const modo of MODOS_DALTONICOS) {
      const nacoes = dados.nacoes.map((n) => corDaNacaoNo(modo, n.id));
      expect(new Set(nacoes).size).toBe(nacoes.length);
      const recursos = dados.recursos.map((r) => corDoRecursoNo(modo, r.id));
      expect(new Set(recursos).size).toBe(recursos.length);
    }
  });

  it('UI-11: emblema por nação (dados:nacoes) e forma própria para cada recurso', () => {
    expect(new Set(dados.nacoes.map((n) => emblemaDe(n.id))).size).toBe(dados.nacoes.length);
    const formas = dados.recursos.map((r) => FORMA_DO_RECURSO[r.id]);
    expect(formas.every(Boolean)).toBe(true);
    expect(new Set(formas).size).toBe(formas.length);
    for (const f of formas) {
      expect(contornoDe(f!).length).toBeGreaterThanOrEqual(3);
      expect(clipPathDe(f!)).toMatch(/^polygon\(/);
    }
  });
});
