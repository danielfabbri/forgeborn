import { describe, expect, it } from 'vitest';
import { segmentosDaLinha } from '../../src/game/linhaDeMuro';
import { createSim, dados } from '../../src/sim';
import type { SystemContext } from '../../src/sim/core/pipeline';
import { validarPosicionamento } from '../../src/sim/producao/obra';
import { reservarEstrutura } from '../../src/sim/units/criar';
import { mundoLiso, ponto, RAIO } from '../sim/mundo-teste';

const pegada = dados.estruturas.find((e) => e.id === 'wall')!.pegada_m;

function contexto(): SystemContext {
  const sim = createSim(1, ['bra'], { mundo: mundoLiso() });
  return {
    state: sim.state,
    tick: 0,
    dt: 0.05,
    commands: [],
    mundo: mundoLiso(),
    emit: () => {},
  };
}

describe('T-057 — UNI-08: Muro em linha', () => {
  it.each([
    ['reta', 0, 40],
    ['diagonal', 30, 30],
  ])('UNI-08: linha %s cobre o trecho com segmentos que cabem lado a lado', (_, x, z) => {
    const linha = segmentosDaLinha(ponto(0, 0), ponto(x, z), pegada, RAIO)!;
    const comprimento = Math.hypot(x, z);
    expect(linha.pontos.length).toBeGreaterThanOrEqual(Math.floor(comprimento / (pegada * 1.5)));
    // Cada segmento cabe depois dos anteriores (sem sobreposição de pegada).
    const ctx = contexto();
    for (const d of linha.pontos) {
      expect(validarPosicionamento(ctx, 'wall', d)).toBeNull();
      reservarEstrutura(ctx, 'bra', 'wall', d);
    }
  });

  it('UNI-08: sem brecha entre segmentos para uma unidade passar', () => {
    const linha = segmentosDaLinha(ponto(0, 0), ponto(0, 40), pegada, RAIO)!;
    for (let k = 1; k < linha.pontos.length; k++) {
      const a = linha.pontos[k - 1]!;
      const b = linha.pontos[k]!;
      const dist = Math.acos(Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])) * RAIO;
      // Os círculos de obstáculo (MOV-04) se tocam: o espaço entre eles é menor que um hover.
      expect(dist).toBeLessThan(pegada * Math.SQRT2);
    }
  });
});
