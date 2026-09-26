import { describe, expect, it } from 'vitest';
import { dados, getComponent, param, type Sim } from '../../src/sim';
import type { RecursosId } from '../../src/sim/data';
import { SEMEAR_JAZIDAS_COMMAND } from '../../src/sim/economia';
import { ociosos, recursosSemJazida } from '../../src/sim/economia/diretiva';
import { avancar, normalizar, norteEm, girar } from '../../src/sim/map/esfera';
import { criar, mundoLiso, mundoLua, ordenar, partida, revelar, semear } from './mundo-teste';

const RECURSOS = dados.recursos.map((r) => r.id);

/** Partida no planeta M com a Nave na zona 0, todas as jazidas semeadas e N hovers ociosos. */
function partidaComHovers(n: number, antes?: (sim: Sim) => void) {
  const pronto = mundoLua();
  const sim = partida(pronto);
  const zona = pronto.mapa.zonasDePouso[0]!;
  sim.enqueue({
    tick: 0,
    nacao: 'bra',
    tipo: SEMEAR_JAZIDAS_COMMAND,
    dados: pronto.jazidas.jazidas.map((j) => ({
      recurso: j.recurso,
      quantidade: j.quantidade,
      d: j.d,
    })) as never,
  });
  // As jazidas da distribuição inteira contam como exploradas (VIS-01).
  revelar(sim);
  criar(sim, [{ estrutura: 'ship', d: zona.d }]);
  antes?.(sim);
  // Hovers em anel em volta da Nave, a 18 m do centro.
  const R = pronto.mapa.raio_m;
  const hovers = criar(
    sim,
    Array.from({ length: n }, (_, k) => {
      const rumo = normalizar(girar(norteEm(zona.d), zona.d, (2 * Math.PI * k) / n));
      return { unidade: 'hover_explorer' as const, d: avancar(zona.d, rumo, 18 / R).p };
    }),
  );
  return { sim, hovers, pronto };
}

const recursoDe = (sim: Sim, id: number) => getComponent(sim.state, id, 'coleta')!.recurso;

function contagem(sim: Sim, hovers: number[]): Record<RecursosId, number> {
  const c = Object.fromEntries(RECURSOS.map((r) => [r, 0])) as Record<RecursosId, number>;
  for (const h of hovers) {
    const r = recursoDe(sim, h);
    if (r) c[r]++;
  }
  return c;
}

describe('T-033 — ECO-18 a ECO-21: Diretiva de Coleta', () => {
  it('ECO-19: 20 hovers ociosos se distribuem conforme diretiva_*_pct (erro ≤ 1 por recurso)', () => {
    const { sim, hovers } = partidaComHovers(20);
    sim.step();
    const c = contagem(sim, hovers);
    expect(Object.values(c).reduce((s, v) => s + v, 0)).toBe(20);
    for (const r of RECURSOS) {
      const alvo = (20 * param(`diretiva_${r}_pct` as never)) / 100;
      expect(Math.abs(c[r] - alvo), r).toBeLessThanOrEqual(1);
    }
  });

  it('ECO-21: recurso sem jazida elegível é ignorado e sinalizado', () => {
    const sim = partida(mundoLiso());
    criar(sim, [{ estrutura: 'ship', x: 0, z: 0 }]);
    semear(sim, [
      { recurso: 'fe', quantidade: 1000, x: 30, z: 0 },
      { recurso: 'si', quantidade: 1000, x: -30, z: 0 },
      // Titânio longe demais de qualquer ponto de entrega (raio_diretiva_m).
      { recurso: 'ti', quantidade: 1000, x: 0, z: param('raio_diretiva_m') + 40 },
    ]);
    const hovers = criar(
      sim,
      Array.from({ length: 10 }, (_, k) => ({
        unidade: 'hover_explorer' as const,
        x: -12 + k * 3,
        z: -16,
      })),
    );
    sim.step();
    const c = contagem(sim, hovers);
    expect(c.fe + c.si).toBe(10);
    const semJazida = recursosSemJazida(
      { state: sim.state, mundo: mundoLiso(), tick: 0, dt: 0.05, commands: [], emit: () => {} },
      'bra',
    );
    expect(semJazida).toEqual(['cu', 'li', 'ti', 'u']);
  });

  it('ECO-20: ordem manual prevalece sobre a diretiva', () => {
    const sim = partida(mundoLiso());
    criar(sim, [{ estrutura: 'ship', x: 0, z: 0 }]);
    const [fe, cu] = semear(sim, [
      { recurso: 'fe', quantidade: 1000, x: 30, z: 0 },
      { recurso: 'cu', quantidade: 1000, x: -30, z: 0 },
    ]);
    const hovers = criar(
      sim,
      Array.from({ length: 3 }, (_, k) => ({
        unidade: 'hover_explorer' as const,
        x: 15,
        z: -3 + k * 3,
      })),
    );
    ordenar(sim, 'coletar', { ids: hovers, jazida: cu });
    sim.run(60 * sim.tickHz);
    for (const h of hovers) {
      expect(recursoDe(sim, h)).toBe('cu');
      expect(getComponent(sim.state, h, 'coleta')!.manual).toBe(true);
    }
    expect(getComponent(sim.state, fe!, 'jazida')!.vagas.every((v) => v === null)).toBe(true);
  });

  it('ECO-18: a nação muda a própria diretiva por comando', () => {
    // A diretiva vale para hovers ociosos: muda antes de eles surgirem.
    const { sim, hovers } = partidaComHovers(10, (s) => {
      ordenar(s, 'diretiva_coleta', { fe: 0, si: 100, cu: 0, li: 0, ti: 0, u: 0 });
      s.step();
    });
    expect(contagem(sim, hovers).si).toBe(10);
    expect(sim.state.diretivas.usa!.si).toBe(param('diretiva_si_pct'));
  });

  it('ECO-19 (D-69): hover parado pelo jogador fica parado; conta como ocioso para o aviso', () => {
    const { sim, hovers } = partidaComHovers(1);
    sim.step();
    const [h] = hovers;
    expect(recursoDe(sim, h!)).not.toBeNull();
    ordenar(sim, 'parar', { ids: [h] });
    sim.step();
    expect(recursoDe(sim, h!)).toBeNull();
    sim.run(Math.round(param('hover_ocioso_alerta_s') * sim.tickHz) * 3);
    expect(recursoDe(sim, h!)).toBeNull();
    const ctx = {
      state: sim.state,
      tick: sim.state.tick,
      dt: 1 / sim.tickHz,
      commands: [],
      mundo: mundoLiso(),
      emit: () => {},
    };
    expect(ociosos(ctx, 'bra')).toContain(h);
  });
});
