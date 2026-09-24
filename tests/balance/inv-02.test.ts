import { describe, expect, it } from 'vitest';
import { dados, getComponent, type Sim } from '../../src/sim';
import type { RecursosId } from '../../src/sim/data';
import { custoDe, INICIAR_PARTIDA_COMMAND } from '../../src/sim/producao';
import { mundoLiso, ordenar, partida, ponto, semear } from '../sim/mundo-teste';

/** Jazidas iniciais de `dados:jazidas` nas distâncias médias, espalhadas em volta da Nave. */
function jazidasIniciais(sim: Sim): void {
  const iniciais = dados.jazidas.filter((j) => j.zona === 'inicial');
  const total = iniciais.reduce((s, j) => s + j.jazidas, 0);
  const lista: Array<{ recurso: RecursosId; quantidade: number; x: number; z: number }> = [];
  for (const linha of iniciais) {
    const distancia = (linha.dist_min_m + (linha.dist_max_m ?? linha.dist_min_m)) / 2;
    for (let n = 0; n < linha.jazidas; n++) {
      const angulo = ((lista.length + 0.5) / total) * 2 * Math.PI;
      lista.push({
        recurso: linha.recurso as RecursosId,
        quantidade: linha.quantidade_u,
        x: distancia * Math.sin(angulo),
        z: distancia * Math.cos(angulo),
      });
    }
  }
  semear(sim, lista);
}

function podePagar(sim: Sim, item: 'printer'): boolean {
  const custo = custoDe(item);
  return dados.recursos.every((r) => sim.state.estoques.bra[r.id] >= custo[r.id]);
}

describe('§21.3 — invariantes de economia', () => {
  it('INV-02: estoque padrão e diretiva automática, "1 Hover extra → Impressora", Impressora entre 45 s e 60 s', () => {
    const sim = partida(mundoLiso());
    jazidasIniciais(sim);
    ordenar(sim, INICIAR_PARTIDA_COMMAND, {
      modo: 'padrao',
      nacoes: [{ nacao: 'bra', zona: ponto(0, 0) }],
    });
    sim.step();
    const inicio = sim.state.tick;
    const nave = sim.state.entities.find(
      (id) => getComponent(sim.state, id, 'structure')?.tipo === 'ship',
    )!;
    // Abertura: 1 Hover extra na hora; a Impressora assim que o estoque pagar.
    ordenar(sim, 'imprimir', { ids: [nave], item: 'hover_explorer' });
    let entregue: number | null = null;
    for (let t = 0; t < 120 * sim.tickHz && entregue === null; t++) {
      const fila = getComponent(sim.state, nave, 'producer')!.fila;
      if (t > 0 && !fila.some((i) => i.item === 'printer') && podePagar(sim, 'printer')) {
        ordenar(sim, 'imprimir', { ids: [nave], item: 'printer' });
      }
      for (const e of sim.step()) {
        if (e.tipo === 'impresso' && (e.dados as { tipo: string }).tipo === 'printer') {
          entregue = (sim.state.tick - inicio) / sim.tickHz;
        }
      }
    }
    expect(entregue).not.toBeNull();
    expect(entregue!).toBeGreaterThanOrEqual(45);
    expect(entregue!).toBeLessThanOrEqual(60);
  });
});
