import { describe, expect, it } from 'vitest';
import { entitiesWith, getComponent, type Sim, type SimEvent } from '../../src/sim';
import { ATIVAR_IA_COMMAND } from '../../src/sim/ia';
import { direcaoDe } from '../../src/sim/units/superficie';
import { criarPartida } from '../../tools/sim/match';
import { criar, mundoComMar, ordenar, partida, pos, revelar, semear } from './mundo-teste';

const tipoDe = (sim: Sim, id: number) =>
  getComponent(sim.state, id, 'unit')?.tipo ?? getComponent(sim.state, id, 'structure')?.tipo;
const contar = (sim: Sim, nacao: string, tipo: string) =>
  entitiesWith(sim.state, 'owner').filter(
    (id) => getComponent(sim.state, id, 'owner')!.nacao === nacao && tipoDe(sim, id) === tipo,
  ).length;
const rico = (sim: Sim, nacao: string) => {
  for (const r of ['fe', 'si', 'cu', 'li', 'ti', 'u'] as const) {
    sim.state.estoques[nacao as 'usa']![r] = 20_000;
  }
};

/**
 * IA na faixa sul do mundo com mar (terra em z < 20), com Nave, Porto e Transportes; a terra do
 * norte (z > 60) só se alcança pelo mar.
 */
function iaNoSul() {
  const mundo = mundoComMar();
  const sim = partida(mundo, ['bra', 'usa'], 'tita');
  rico(sim, 'usa');
  revelar(sim, 'usa', mundo);
  criar(sim, [{ estrutura: 'ship', x: 0, z: -20 }], 'usa');
  const [porto] = criar(sim, [{ estrutura: 'port', x: 0, z: 28 }], 'usa');
  ordenar(sim, ATIVAR_IA_COMMAND, { nivel: 'normal' }, 'usa');
  sim.step();
  return { mundo, sim, porto: porto! };
}

describe('T-184 — IA-14, D-90: IA naval', () => {
  it(
    'IA-14: em Titã, as IAs constroem o Porto e mantêm Artilharia e Antena',
    { timeout: 600_000 },
    () => {
      const { sim, nacoes } = criarPartida({
        seed: 3,
        ias: ['normal', 'normal'],
        maxMin: 20,
        cenario: 'tita',
      });
      for (let t = 0; t < 20 * 60 * sim.tickHz && !sim.state.resultado; t++) sim.step();
      for (const n of nacoes) {
        expect(contar(sim, n, 'port'), n).toBeGreaterThanOrEqual(1);
        expect(contar(sim, n, 'boat_artillery'), n).toBeGreaterThanOrEqual(1);
        expect(contar(sim, n, 'boat_antenna'), n).toBeGreaterThanOrEqual(1);
      }
    },
  );

  it(
    'IA-14: a onda cujo alvo só se alcança pelo mar embarca, navega e desembarca do outro lado',
    { timeout: 120_000 },
    () => {
      const { sim } = iaNoSul();
      criar(
        sim,
        [
          { unidade: 'boat_transport', x: 18, z: 25 },
          { unidade: 'boat_transport', x: -18, z: 25 },
        ],
        'usa',
      );
      const membros = criar(
        sim,
        Array.from({ length: 12 }, (_, k) => ({
          unidade: 'hover_ex1' as const,
          x: -15 + (k % 6) * 6,
          z: -5 - Math.floor(k / 6) * 5,
        })),
        'usa',
      );
      // Alvo na terra do norte (em guerra, o padrão dos testes).
      const [alvoNorte] = criar(sim, [{ estrutura: 'storage', x: 0, z: 90 }]);
      const d = direcaoDe(getComponent(sim.state, alvoNorte!, 'position')!);
      // IA-02: a IA conhece o alvo (já o viu).
      sim.state.ias.usa!.conhecidas[String(alvoNorte)] = {
        nacao: 'bra',
        tipo: 'storage',
        d,
        tick: sim.state.tick,
      };
      sim.state.ias.usa!.onda = {
        vrInicial: 1000,
        alvo: 'bra',
        ponto: d,
        membros,
      };
      const eventos: SimEvent[] = [];
      for (let t = 0; t < 150 * sim.tickHz; t++) eventos.push(...sim.step());
      expect(eventos.some((e) => e.tipo === 'embarque')).toBe(true);
      expect(eventos.some((e) => e.tipo === 'desembarque')).toBe(true);
      const noNorte = membros.filter(
        (id) => getComponent(sim.state, id, 'position') && pos(sim, id).z > 60,
      );
      expect(noNorte.length).toBeGreaterThan(0);
    },
  );

  it(
    'IA-14: expansão por mar: uma Impressora vai à ilha e ergue Usina Solar e Armazém ligados',
    { timeout: 180_000 },
    () => {
      const { sim } = iaNoSul();
      criar(sim, [{ unidade: 'boat_transport', x: 18, z: 25 }], 'usa');
      criar(
        sim,
        [
          { unidade: 'printer', x: 10, z: -5 },
          { unidade: 'printer', x: -10, z: -5 },
          ...Array.from({ length: 4 }, (_, k) => ({
            unidade: 'hover_explorer' as const,
            x: -12 + k * 8,
            z: -35,
          })),
        ],
        'usa',
      );
      // Jazida na ilha do norte, já explorada.
      semear(sim, [{ recurso: 'ti', quantidade: 2000, x: 0, z: 100 }]);
      for (let t = 0; t < 400 * sim.tickHz; t++) {
        sim.step();
        const naIlha = (tipo: string) =>
          entitiesWith(sim.state, 'structure', 'owner').filter(
            (id) =>
              getComponent(sim.state, id, 'owner')!.nacao === 'usa' &&
              tipoDe(sim, id) === tipo &&
              !getComponent(sim.state, id, 'obra') &&
              pos(sim, id).z > 60,
          );
        const [solar] = naIlha('solar_plant');
        const [armazem] = naIlha('storage');
        if (
          solar !== undefined &&
          armazem !== undefined &&
          sim.state.cabos.some(([a, b]) => [a, b].includes(solar) && [a, b].includes(armazem))
        )
          return;
      }
      throw new Error('a expansão por mar não ergueu Usina Solar e Armazém ligados na ilha');
    },
  );
});
