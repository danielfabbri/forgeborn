import { describe, expect, it } from 'vitest';
import { dados, getComponent } from '../../src/sim';
import { estoque } from '../../src/sim/economia';
import { criar, mundoLiso, ordenar, partida, semear } from '../sim/mundo-teste';

describe('§21.3 — invariantes de economia', () => {
  it('INV-01: um Hover de Exploração minerando Fe a 30 m do depósito paga o próprio custo em VR em até 75 s', () => {
    const custo = dados.custos.find((c) => c.id === 'hover_explorer')!.vr;
    const vrFe = dados.recursos.find((r) => r.id === 'fe')!.vr;
    const sim = partida(mundoLiso());
    const [nave] = criar(sim, [{ estrutura: 'ship', x: 0, z: 0 }]);
    // "A 30 m do depósito": entre os centros da jazida e da Nave (como em dados:jazidas).
    const borda = getComponent(sim.state, nave!, 'obstacle')!.raio;
    const [jazida] = semear(sim, [{ recurso: 'fe', quantidade: 1500, x: 30, z: 0 }]);
    // O hover surge ao lado da Nave (como ao ser impresso) e recebe a ordem de coletar.
    const [h] = criar(sim, [{ unidade: 'hover_explorer', x: borda + 3, z: 0 }]);
    ordenar(sim, 'coletar', { ids: [h], jazida });
    sim.run(75 * sim.tickHz);
    const pago = estoque(sim.state, 'bra').fe * vrFe;
    expect(pago).toBeGreaterThanOrEqual(custo);
  });
});
