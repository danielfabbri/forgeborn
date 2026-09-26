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

describe('T-035/T-037 — ECO-22 a ECO-25, D-60: Silo Móvel', () => {
  it('ECO-22 (D-60): sem ancorar, o silo parado recebe as descargas (mais perto que a Nave)', () => {
    const { sim, silo: s, hovers } = cenario(1);
    const [h] = hovers;
    expect(rodarAte(sim, () => coleta(sim, h!).entrega === s, 60)).toBe(true);
    expect(rodarAte(sim, () => cargaDoSilo(silo(sim, s)) > 0, 30)).toBe(true);
    expect(silo(sim, s).estado).toBe('solto');
  });

  it('ECO-23/ECO-15: carga no silo está em trânsito; só vira recurso ao descarregar no depósito', () => {
    const { sim, silo: s } = cenario(2);
    ordenar(sim, 'ciclo_silo', { ids: [s], automatico: false });
    expect(rodarAte(sim, () => cargaDoSilo(silo(sim, s)) >= 20, 90)).toBe(true);
    const noSilo = cargaDoSilo(silo(sim, s));
    expect(estoque(sim.state, 'bra').fe).toBe(0);
    expect(emTransito(sim.state, 'bra').fe).toBeGreaterThanOrEqual(noSilo);
  });

  it('ECO-24/ECO-25: no limiar o silo leva a carga ao depósito e volta; enquanto isso os hovers usam a Nave', () => {
    const { sim, nave, silo: s, hovers } = cenario(2);
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
    expect(rodarAte(sim, () => silo(sim, s).estado === 'voltando', 60)).toBe(true);
    expect(rodarAte(sim, () => silo(sim, s).estado === 'solto', 90)).toBe(true);
    expect(RAIO * arco(direcao(sim, s), ancora)).toBeLessThan(1.5);
  });

  it('ECO-23 (D-60): mandado à Nave com carga, descarrega sozinho ao encostar', () => {
    const { sim, nave, silo: s } = cenario(0);
    silo(sim, s).carga = { fe: 30, si: 12 };
    ordenar(sim, 'ciclo_silo', { ids: [s], automatico: false });
    const dn = direcao(sim, nave);
    ordenar(sim, 'mover', { ids: [s], x: dn[0], y: dn[1], z: dn[2] });
    expect(rodarAte(sim, () => silo(sim, s).estado === 'descarregando', 60)).toBe(true);
    expect(rodarAte(sim, () => cargaDoSilo(silo(sim, s)) <= 1e-9, 20)).toBe(true);
    expect(estoque(sim.state, 'bra').fe).toBeCloseTo(30, 6);
    expect(estoque(sim.state, 'bra').si).toBeCloseTo(12, 6);
    expect(silo(sim, s).estado).toBe('solto');
  });

  it('ECO-22 (D-60): clique direito dos hovers no silo descarrega qualquer carga e eles voltam à jazida', () => {
    const { sim, jazida, silo: s, hovers } = cenario(1);
    const [h] = hovers;
    ordenar(sim, 'ciclo_silo', { ids: [s], automatico: false });
    // Assim que tiver um pouco de carga (bem menos que cheio), manda descarregar no silo.
    expect(rodarAte(sim, () => coleta(sim, h!).carga >= 2, 60)).toBe(true);
    const carga = coleta(sim, h!).carga;
    expect(carga).toBeLessThan(param('carga_hover_u'));
    ordenar(sim, 'descarregar_no_silo', { ids: [h], silo: s });
    sim.step();
    expect(coleta(sim, h!).entrega).toBe(s);
    expect(rodarAte(sim, () => cargaDoSilo(silo(sim, s)) > 0, 30)).toBe(true);
    expect(rodarAte(sim, () => coleta(sim, h!).estado === 'minerando', 30)).toBe(true);
    expect(coleta(sim, h!).jazida).toBe(jazida);
  });
});
