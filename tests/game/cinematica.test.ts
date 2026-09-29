import { describe, expect, it } from 'vitest';
import { estadoEm } from '../../src/game/cinematica';

describe('T-125 — FLX-09: cinemática de pouso', () => {
  it('FLX-09: a Nave desce, levanta poeira, abre a rampa e o hover sai, nessa ordem', () => {
    const quadros = Array.from({ length: 101 }, (_, k) => estadoEm(k / 100));
    // Desce sempre e toca o chão.
    for (let k = 1; k < quadros.length; k++) {
      expect(quadros[k]!.alturaDaNave).toBeLessThanOrEqual(quadros[k - 1]!.alturaDaNave);
    }
    expect(quadros[0]!.alturaDaNave).toBeGreaterThan(50);
    const toque = quadros.findIndex((q) => q.alturaDaNave < 0.01);
    expect(toque).toBeGreaterThan(0);
    // Poeira perto do chão; a rampa só abre depois do toque; o hover só sai com a rampa aberta.
    expect(quadros.some((q) => q.poeira)).toBe(true);
    const rampa = quadros.findIndex((q) => q.aberturaDaRampa > 0);
    const saida = quadros.findIndex((q) => q.saidaDoHover > 0);
    expect(rampa).toBeGreaterThan(toque);
    expect(quadros[saida]!.aberturaDaRampa).toBe(1);
    expect(quadros[100]).toMatchObject({ alturaDaNave: 0, aberturaDaRampa: 1, saidaDoHover: 1 });
  });
});
