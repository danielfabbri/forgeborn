import { describe, expect, it } from 'vitest';
import { dados, getComponent } from '../../src/sim';
import { criar, mundoLiso, ordenar, partida, semear } from '../sim/mundo-teste';

describe('§21.3 — invariantes de energia', () => {
  it('INV-09: o reator da Nave sozinho sustenta 8 Hovers minerando sem parar e sem zerar o banco', () => {
    const sim = partida(mundoLiso());
    criar(sim, [{ estrutura: 'ship', x: 0, z: 0 }]);
    ordenar(sim, 'debug_encher_banco', {});
    sim.step();
    // Jazidas iniciais de Fe e Si nas distâncias médias de `dados:jazidas`.
    const iniciais = dados.jazidas.filter((j) => j.zona === 'inicial');
    const lista = iniciais.flatMap((linha, k) =>
      Array.from({ length: linha.jazidas }, (_, n) => {
        const angulo = ((k * 2 + n + 0.5) / 8) * 2 * Math.PI;
        const distancia = (linha.dist_min_m + (linha.dist_max_m ?? linha.dist_min_m)) / 2;
        return {
          recurso: linha.recurso,
          quantidade: 100_000,
          x: distancia * Math.sin(angulo),
          z: distancia * Math.cos(angulo),
        };
      }),
    );
    semear(sim, lista);
    const hovers = criar(
      sim,
      Array.from({ length: 8 }, (_, k) => ({
        unidade: 'hover_explorer' as const,
        x: 14 * Math.sin((k / 8) * 2 * Math.PI),
        z: 14 * Math.cos((k / 8) * 2 * Math.PI),
      })),
    );
    let menorBanco = Infinity;
    let semEnergia = 0;
    const minutos = 10;
    for (let t = 0; t < minutos * 60 * sim.tickHz; t++) {
      sim.step();
      menorBanco = Math.min(menorBanco, sim.state.energia.bra.banco);
      semEnergia += hovers.filter((h) => getComponent(sim.state, h, 'bateria')!.en <= 0).length;
    }
    expect(menorBanco).toBeGreaterThan(0);
    // "Sem parar": nenhum hover fica sem energia (Modo Reserva) no período.
    expect(semEnergia).toBe(0);
  });

  it('INV-10: nenhuma unidade armada zera a bateria em menos de 45 s de combate contínuo com movimento', () => {
    for (const unidade of dados.moveis.filter((m) => m.arma)) {
      const arma = dados.armas.find((a) => a.id === unidade.arma)!;
      const disparo = arma.fonte_en === 'bateria' ? arma.en_disparo / (arma.recarga_s ?? 1) : 0;
      const gasto = unidade.mov_en_s + disparo;
      expect(unidade.bateria_en / gasto, unidade.id).toBeGreaterThanOrEqual(45);
    }
  });
});
