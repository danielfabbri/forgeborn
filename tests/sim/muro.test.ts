import { describe, expect, it } from 'vitest';
import { getComponent, param, type Sim } from '../../src/sim';
import { dados } from '../../src/sim';
import type { SystemContext } from '../../src/sim/core/pipeline';
import { normalizar, type Vec3 } from '../../src/sim/map/esfera';
import { validarPosicionamento } from '../../src/sim/producao/obra';
import { alvo, criar, mundoLiso, ordenar, partida, ponto, pos } from './mundo-teste';

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

/** Direção leste (tangente) no ponto local (x, z). */
const leste = (x: number, z: number) => {
  const a = ponto(x, z);
  const b = ponto(x + 1, z);
  return normalizar([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
};

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
      return r > 14 && r < 20 && !(Math.abs(x) < 5 && z > 0);
    };
    const sim = partida(mundoLiso(anel));
    // Dois segmentos de 6 m no sentido leste-oeste, encostados pela ponta em x = 0.
    const muros = criar(
      sim,
      [
        { estrutura: 'wall', x: -3, z: 17, rumo: leste(-3, 17) },
        { estrutura: 'wall', x: 3, z: 17, rumo: leste(3, 17) },
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

describe('T-058 — UNI-08, UNI-09, D-56: giro e encaixe de Muro e Portão', () => {
  const ctxDe = (sim: Sim): SystemContext => ({
    state: sim.state,
    tick: sim.state.tick,
    dt: 1 / sim.tickHz,
    commands: [],
    mundo: mundoLiso(),
    emit: () => {},
  });
  const meio = dados.estruturas.find((e) => e.id === 'wall')!.pegada_m / 2;

  it('D-56: segmentos encostam pela ponta em linha e em ângulo; sobreposição é recusada', () => {
    const sim = partida(mundoLiso());
    criar(sim, [{ estrutura: 'wall', x: 0, z: 20, rumo: leste(0, 20) }]);
    const ctx = ctxDe(sim);
    // Continuação reta a partir da ponta leste.
    expect(
      validarPosicionamento(ctx, 'wall', ponto(2 * meio, 20), undefined, leste(2 * meio, 20)),
    ).toBeNull();
    // Canto em L na ponta leste (segmento para o norte).
    const norte = normalizar(sub(ponto(meio, 21), ponto(meio, 20)));
    expect(validarPosicionamento(ctx, 'wall', ponto(meio, 20 + meio), undefined, norte)).toBeNull();
    // Canto de 45°.
    const diag = normalizar(sub(ponto(meio + 1, 21), ponto(meio, 20)));
    const c45 = ponto(meio + meio * Math.SQRT1_2, 20 + meio * Math.SQRT1_2);
    expect(validarPosicionamento(ctx, 'wall', c45, undefined, diag)).toBeNull();
    // Em cima do outro, deslocado meio segmento: recusado.
    expect(validarPosicionamento(ctx, 'wall', ponto(meio, 20), undefined, leste(meio, 20))).toBe(
      'ocupado',
    );
    // Cruzando pelo meio: recusado.
    expect(validarPosicionamento(ctx, 'wall', ponto(0, 20), undefined, norte)).toBe('ocupado');
  });

  it('D-56: a unidade própria planeja caminho pelo próprio portão; o portão abre e ela passa', () => {
    const anel = (x: number, z: number) => {
      const r = Math.hypot(x, z);
      return r > 14 && r < 20 && !(Math.abs(x) < 9 && z > 0);
    };
    const sim = partida(mundoLiso(anel));
    const [, portao] = criar(sim, [
      { estrutura: 'wall', x: -6, z: 17, rumo: leste(-6, 17) },
      { estrutura: 'gate', x: 0, z: 17, rumo: leste(0, 17) },
      { estrutura: 'wall', x: 6, z: 17, rumo: leste(6, 17) },
    ]);
    const [hover] = criar(sim, [{ unidade: 'hover_ex1', x: 0, z: 0, postura: 'passiva' }]);
    ordenar(sim, 'mover', { ids: [hover], ...alvo(0, 40) });
    let abriu = false;
    for (let k = 0; k < 30 && pos(sim, hover!).z < 36; k++) {
      rodar(sim, 1);
      abriu ||= getComponent(sim.state, portao!, 'portao')!.abertura >= 1;
    }
    expect(abriu).toBe(true);
    expect(pos(sim, hover!).z).toBeGreaterThan(30);
    // Depois que ela sai do raio, o portão volta a fechar.
    rodar(sim, param('portao_tempo_fechar_apos_s') + param('portao_tempo_abrir_s') + 1);
    expect(getComponent(sim.state, portao!, 'portao')!.abertura).toBe(0);
  });

  it('D-56: o inimigo não planeja caminho pelo portão fechado (ataca a muralha)', () => {
    const anel = (x: number, z: number) => {
      const r = Math.hypot(x, z);
      return r > 14 && r < 20 && !(Math.abs(x) < 9 && z > 0);
    };
    const sim = partida(mundoLiso(anel));
    const muralha = criar(
      sim,
      [
        { estrutura: 'wall', x: -6, z: 17, rumo: leste(-6, 17) },
        { estrutura: 'gate', x: 0, z: 17, rumo: leste(0, 17) },
        { estrutura: 'wall', x: 6, z: 17, rumo: leste(6, 17) },
      ],
      'usa',
    );
    const [hover] = criar(sim, [{ unidade: 'hover_ex1', x: 0, z: 0 }]);
    ordenar(sim, 'mover', { ids: [hover], ...alvo(0, 40) });
    rodar(sim, 10);
    expect(pos(sim, hover!).z).toBeLessThan(17);
    expect(muralha).toContain(getComponent(sim.state, hover!, 'arma')!.alvoDireto);
  });
});
