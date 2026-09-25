import { describe, expect, it } from 'vitest';
import { getComponent, param, type Sim } from '../../src/sim';
import { alvo, criar, mundoLiso, ordenar, partida, pos } from './mundo-teste';

const rodar = (sim: Sim, s: number) => {
  for (let t = 0; t < Math.round(s * sim.tickHz); t++) sim.step();
};

describe('T-057 — UNI-08, UNI-09: Muro e Portão', () => {
  it('UNI-08: o Muro é só obstáculo (sem arma, sem consumo)', () => {
    const sim = partida(mundoLiso());
    const [muro] = criar(sim, [{ estrutura: 'wall', x: 0, z: 0 }]);
    expect(getComponent(sim.state, muro!, 'obstacle')).toBeDefined();
    expect(getComponent(sim.state, muro!, 'arma')).toBeUndefined();
    expect(getComponent(sim.state, muro!, 'consumidor')).toBeUndefined();
    const versao = sim.state.versaoObstaculos;
    criar(sim, [{ unidade: 'hover_ex1', x: 0, z: -7, postura: 'passiva' }]);
    rodar(sim, 3);
    expect(getComponent(sim.state, muro!, 'obstacle')).toBeDefined();
    expect(sim.state.versaoObstaculos).toBe(versao);
  });

  it('UNI-09: abre em portao_tempo_abrir_s para unidade própria e deixa de ser obstáculo', () => {
    const sim = partida(mundoLiso());
    const [portao] = criar(sim, [{ estrutura: 'gate', x: 0, z: 0 }]);
    expect(getComponent(sim.state, portao!, 'obstacle')).toBeDefined();
    criar(sim, [{ unidade: 'hover_ex1', x: 0, z: -(param('portao_raio_abertura_m') - 1) }]);
    rodar(sim, param('portao_tempo_abrir_s') * 0.5);
    expect(getComponent(sim.state, portao!, 'obstacle')).toBeDefined();
    rodar(sim, param('portao_tempo_abrir_s') * 0.6);
    expect(getComponent(sim.state, portao!, 'portao')!.abertura).toBe(1);
    expect(getComponent(sim.state, portao!, 'obstacle')).toBeUndefined();
  });

  it('UNI-09: unidade inimiga não abre o Portão', () => {
    const sim = partida(mundoLiso());
    const [portao] = criar(sim, [{ estrutura: 'gate', x: 0, z: 0 }]);
    criar(
      sim,
      [
        {
          unidade: 'hover_ex1',
          x: 0,
          z: -(param('portao_raio_abertura_m') - 1),
          postura: 'passiva',
        },
      ],
      'usa',
    );
    rodar(sim, param('portao_tempo_abrir_s') * 3);
    expect(getComponent(sim.state, portao!, 'portao')!.abertura).toBe(0);
    expect(getComponent(sim.state, portao!, 'obstacle')).toBeDefined();
  });

  it('UNI-09: trancado (T) não abre; destrancado volta a abrir', () => {
    const sim = partida(mundoLiso());
    const [portao] = criar(sim, [{ estrutura: 'gate', x: 0, z: 0 }]);
    ordenar(sim, 'trancar_portao', { ids: [portao] });
    criar(sim, [{ unidade: 'hover_ex1', x: 0, z: -(param('portao_raio_abertura_m') - 1) }]);
    rodar(sim, param('portao_tempo_abrir_s') * 3);
    expect(getComponent(sim.state, portao!, 'portao')!.trancado).toBe(true);
    expect(getComponent(sim.state, portao!, 'obstacle')).toBeDefined();
    ordenar(sim, 'trancar_portao', { ids: [portao] });
    rodar(sim, param('portao_tempo_abrir_s') * 1.2);
    expect(getComponent(sim.state, portao!, 'obstacle')).toBeUndefined();
  });

  it('UNI-09: fecha portao_tempo_fechar_apos_s depois que a última unidade própria sai', () => {
    const sim = partida(mundoLiso());
    const [portao] = criar(sim, [{ estrutura: 'gate', x: 0, z: 0 }]);
    const [hover] = criar(sim, [
      { unidade: 'hover_ex1', x: 0, z: -(param('portao_raio_abertura_m') - 1) },
    ]);
    rodar(sim, param('portao_tempo_abrir_s') * 1.2);
    expect(getComponent(sim.state, portao!, 'obstacle')).toBeUndefined();
    getComponent(sim.state, hover!, 'vida')!.hp = 0;
    rodar(sim, param('portao_tempo_fechar_apos_s') * 0.8);
    expect(getComponent(sim.state, portao!, 'portao')!.abertura).toBe(1);
    rodar(sim, param('portao_tempo_fechar_apos_s') * 0.2 + param('portao_tempo_abrir_s') + 0.2);
    expect(getComponent(sim.state, portao!, 'portao')!.abertura).toBe(0);
    expect(getComponent(sim.state, portao!, 'obstacle')).toBeDefined();
  });

  it('UNI-09: aberto, deixa passar qualquer um e não fecha com alguém no vão', () => {
    const sim = partida(mundoLiso());
    const [portao] = criar(sim, [{ estrutura: 'gate', x: 0, z: 0 }]);
    const [hover] = criar(sim, [
      { unidade: 'hover_ex1', x: 0, z: -(param('portao_raio_abertura_m') - 1) },
    ]);
    rodar(sim, param('portao_tempo_abrir_s') * 1.2);
    // Um inimigo entra no vão aberto.
    criar(sim, [{ unidade: 'hover_ex1', x: 0, z: 0.5, postura: 'passiva' }], 'usa');
    getComponent(sim.state, hover!, 'vida')!.hp = 0;
    rodar(sim, param('portao_tempo_fechar_apos_s') + param('portao_tempo_abrir_s') + 1);
    expect(getComponent(sim.state, portao!, 'portao')!.abertura).toBe(1);
  });

  it('UNI-08: drones passam por cima do Muro', () => {
    const sim = partida(mundoLiso());
    criar(sim, [
      { estrutura: 'wall', x: -3.5, z: 12 },
      { estrutura: 'wall', x: 0, z: 12 },
      { estrutura: 'wall', x: 3.5, z: 12 },
    ]);
    const [drone] = criar(sim, [{ unidade: 'drone_laser', x: 0, z: 0 }]);
    ordenar(sim, 'mover', { ids: [drone], ...alvo(0, 30) });
    rodar(sim, 20);
    const p = pos(sim, drone!);
    expect(Math.abs(p.x)).toBeLessThan(3);
    expect(p.z).toBeGreaterThan(25);
  });

  it('UNI-08: com o caminho fechado por um muro inimigo, a unidade armada ataca o muro', () => {
    // Um anel de rocha com uma só saída, fechada por três segmentos de muro inimigo.
    const anel = (x: number, z: number) => {
      const r = Math.hypot(x, z);
      return r > 14 && r < 20 && !(Math.abs(x) < 6 && z > 0);
    };
    const sim = partida(mundoLiso(anel));
    const muros = criar(
      sim,
      [
        { estrutura: 'wall', x: -3.5, z: 17 },
        { estrutura: 'wall', x: 0, z: 17 },
        { estrutura: 'wall', x: 3.5, z: 17 },
      ],
      'usa',
    );
    const [hover] = criar(sim, [{ unidade: 'hover_ex1', x: 0, z: 0 }]);
    ordenar(sim, 'mover', { ids: [hover], ...alvo(0, 45) });
    rodar(sim, 10);
    const alvoDireto = getComponent(sim.state, hover!, 'arma')!.alvoDireto;
    expect(muros).toContain(alvoDireto);
    const vida = getComponent(sim.state, alvoDireto!, 'vida');
    expect(vida === undefined || vida.hp < vida.max).toBe(true);
  });
});
