import { describe, expect, it } from 'vitest';
import { getComponent, param, type Sim } from '../../src/sim';
import { emTransito, estoque } from '../../src/sim/economia';
import { cargaDoSilo } from '../../src/sim/economia/estoque';
import { arco, normalizar, type Vec3 } from '../../src/sim/map/esfera';
import { criar, mundoLiso, ordenar, partida, RAIO, semear } from './mundo-teste';

const silo = (sim: Sim, id: number) => getComponent(sim.state, id, 'silo')!;
const coleta = (sim: Sim, id: number) => getComponent(sim.state, id, 'coleta')!;
const direcao = (sim: Sim, id: number): Vec3 => {
  const p = getComponent(sim.state, id, 'position')!;
  return normalizar([p.x, p.y, p.z]);
};

function rodarAte(sim: Sim, condicao: () => boolean, limite_s: number) {
  for (let t = 0; t < limite_s * sim.tickHz; t++) {
    if (condicao()) return true;
    sim.step();
  }
  return condicao();
}

/** Nave longe (na origem), jazida a 70 m e um silo a 12 m da jazida; hovers já na jazida. */
function cenario(hovers = 2) {
  const sim = partida(mundoLiso());
  const [nave] = criar(sim, [{ estrutura: 'ship', x: 0, z: 0 }]);
  const [jazida] = semear(sim, [{ recurso: 'fe', quantidade: 5000, x: 70, z: 0 }]);
  const [s] = criar(sim, [{ unidade: 'mobile_silo', x: 70, z: -12 }]);
  const hs = criar(
    sim,
    Array.from({ length: hovers }, (_, k) => ({
      unidade: 'hover_explorer' as const,
      x: 64,
      z: 4 + k * 3,
    })),
  );
  ordenar(sim, 'coletar', { ids: hs, jazida });
  return { sim, nave: nave!, jazida: jazida!, silo: s!, hovers: hs };
}

describe('T-035 — ECO-22 a ECO-25: Silo Móvel', () => {
  it('ECO-22: solto, o silo não recebe descargas; ancorado (após tempo_ancorar_silo_s), sim', () => {
    const { sim, nave, silo: s, hovers } = cenario(1);
    const [h] = hovers;
    expect(rodarAte(sim, () => coleta(sim, h!).estado === 'indo_entregar', 30)).toBe(true);
    expect(coleta(sim, h!).entrega).toBe(nave);

    ordenar(sim, 'ancorar_silo', { ids: [s] });
    sim.step();
    expect(silo(sim, s).estado).toBe('ancorando');
    sim.run(Math.round(param('tempo_ancorar_silo_s') * sim.tickHz));
    expect(silo(sim, s).estado).toBe('ancorado');
    // Na próxima viagem o hover escolhe o silo, bem mais perto que a Nave.
    expect(rodarAte(sim, () => coleta(sim, h!).entrega === s, 60)).toBe(true);
    expect(rodarAte(sim, () => cargaDoSilo(silo(sim, s)) > 0, 30)).toBe(true);
  });

  it('ECO-23/ECO-15: carga no silo está em trânsito; só vira recurso ao descarregar no depósito', () => {
    const { sim, silo: s } = cenario(2);
    ordenar(sim, 'ancorar_silo', { ids: [s] });
    ordenar(sim, 'ciclo_silo', { ids: [s], automatico: false });
    expect(rodarAte(sim, () => cargaDoSilo(silo(sim, s)) >= 20, 90)).toBe(true);
    const noSilo = cargaDoSilo(silo(sim, s));
    expect(estoque(sim.state, 'bra').fe).toBe(0);
    expect(emTransito(sim.state, 'bra').fe).toBeGreaterThanOrEqual(noSilo);
  });

  it('ECO-24/ECO-25: no limiar o silo leva a carga ao depósito, volta e reancora; enquanto isso os hovers usam a Nave', () => {
    const { sim, nave, silo: s, hovers } = cenario(2);
    ordenar(sim, 'ancorar_silo', { ids: [s] });
    // Limiar de 10% (20 u) para o teste ser curto.
    ordenar(sim, 'ciclo_silo', { ids: [s], limiar_pct: 10 });
    sim.step();
    const ancora = direcao(sim, s);
    expect(rodarAte(sim, () => silo(sim, s).estado === 'indo_descarregar', 120)).toBe(true);
    const levando = cargaDoSilo(silo(sim, s));
    expect(levando).toBeGreaterThanOrEqual((param('capacidade_silo_u') * 10) / 100 - 1e-9);
    // ECO-25: com o silo fora, a próxima entrega vai para a Nave.
    expect(
      rodarAte(
        sim,
        () =>
          hovers.some(
            (h) => coleta(sim, h).estado === 'indo_entregar' && coleta(sim, h).entrega === nave,
          ),
        60,
      ),
    ).toBe(true);
    // Descarrega a taxa_descarga_silo_u_s no depósito.
    expect(rodarAte(sim, () => silo(sim, s).estado === 'descarregando', 60)).toBe(true);
    const antes = estoque(sim.state, 'bra').fe;
    sim.step();
    expect(estoque(sim.state, 'bra').fe - antes).toBeCloseTo(
      param('taxa_descarga_silo_u_s') / sim.tickHz,
      9,
    );
    expect(rodarAte(sim, () => silo(sim, s).estado === 'ancorado', 90)).toBe(true);
    expect(RAIO * arco(direcao(sim, s), ancora)).toBeLessThan(1.5);
  });

  it('ordem de movimento com o silo ancorado: desancora e depois obedece', () => {
    const { sim, silo: s } = cenario(0);
    ordenar(sim, 'ancorar_silo', { ids: [s] });
    sim.run(Math.round(param('tempo_ancorar_silo_s') * sim.tickHz) + 2);
    expect(silo(sim, s).estado).toBe('ancorado');
    const antes = direcao(sim, s);
    ordenar(sim, 'mover', { ids: [s], x: antes[0], y: antes[1] + 0.2, z: antes[2] });
    sim.step();
    expect(silo(sim, s).estado).toBe('desancorando');
    expect(RAIO * arco(direcao(sim, s), antes)).toBeLessThan(1e-9);
    sim.run(Math.round(param('tempo_desancorar_silo_s') * sim.tickHz) + 20);
    expect(silo(sim, s).estado).toBe('solto');
    expect(RAIO * arco(direcao(sim, s), antes)).toBeGreaterThan(1);
  });
});
