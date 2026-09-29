import { describe, expect, it } from 'vitest';
import {
  anguloDoRumo,
  centroDoSegmento,
  encaixeEm,
  meioComprimento,
  pontasLivres,
  rumoDoAngulo,
} from '../../src/game/encaixeDeMuro';
import type { SystemContext } from '../../src/sim/core/pipeline';
import { arco, normalizar, type Vec3 } from '../../src/sim/map/esfera';
import { validarPosicionamento } from '../../src/sim/producao/obra';
import { criar, mundoLiso, partida, ponto, RAIO } from '../sim/mundo-teste';

const leste = (x: number, z: number): Vec3 => {
  const a = ponto(x, z);
  const b = ponto(x + 1, z);
  return normalizar([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
};
const m = (a: Vec3, b: Vec3) => arco(a, b) * RAIO;

describe('T-058 — D-56: encaixe de Muro e Portão', () => {
  it('D-56: as duas pontas de um muro solto são livres; encaixada, a ponta some da lista', () => {
    const sim = partida(mundoLiso());
    criar(sim, [{ estrutura: 'wall', x: 0, z: 30, rumo: leste(0, 30) }]);
    const h = meioComprimento('wall');
    let livres = pontasLivres(sim.state, 'bra', RAIO);
    expect(livres).toHaveLength(2);
    const leste0 = livres.find((p) => m(p.ponta, ponto(h, 30)) < 0.1)!;
    expect(leste0).toBeDefined();
    // A saída aponta para fora (para leste).
    expect(
      leste0.saida[0] * leste(h, 30)[0] +
        leste0.saida[1] * leste(h, 30)[1] +
        leste0.saida[2] * leste(h, 30)[2],
    ).toBeGreaterThan(0.99);
    // Encaixa quem aperta perto da ponta; longe, não.
    expect(encaixeEm(livres, ponto(h + 1, 30.5), RAIO)).not.toBeNull();
    expect(encaixeEm(livres, ponto(h + 6, 30), RAIO)).toBeNull();
    // O segmento encaixado começa na ponta e é válido.
    const seg = centroDoSegmento('wall', leste0.ponta, leste0.saida, true, RAIO);
    expect(m(seg.centro, ponto(2 * h, 30))).toBeLessThan(0.1);
    const ctx: SystemContext = {
      state: sim.state,
      tick: 0,
      dt: 0.05,
      commands: [],
      mundo: mundoLiso(),
      emit: () => {},
    };
    expect(validarPosicionamento(ctx, 'wall', seg.centro, undefined, seg.rumo)).toBeNull();
    criar(sim, [{ estrutura: 'wall', d: seg.centro, rumo: seg.rumo }]);
    livres = pontasLivres(sim.state, 'bra', RAIO);
    expect(livres).toHaveLength(2);
    expect(livres.some((p) => m(p.ponta, ponto(h, 30)) < 0.1)).toBe(false);
  });

  it('D-56: o giro livre é lembrado como ângulo a partir do norte local', () => {
    const d = ponto(10, 10);
    const r = rumoDoAngulo(d, 0.7);
    expect(anguloDoRumo(d, r)).toBeCloseTo(0.7, 6);
  });
});
