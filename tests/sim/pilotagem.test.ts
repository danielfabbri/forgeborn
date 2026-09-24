import { describe, expect, it } from 'vitest';
import { getComponent, param, type Sim, type SimEvent } from '../../src/sim';
import { armaDe } from '../../src/sim/combate';
import { statsMovel } from '../../src/sim/units/stats';
import { criar, mundoLiso, ordenar, partida, ponto, pos, revelar, semear } from './mundo-teste';

const NORTE: [number, number, number] = [0, 1, 0];
const LESTE: [number, number, number] = [0, 0, 1];

const rodar = (sim: Sim, s: number, eventos?: SimEvent[]) => {
  for (let t = 0; t < Math.round(s * sim.tickHz); t++) {
    const novos = sim.step();
    eventos?.push(...novos);
  }
};
const assumir = (sim: Sim, id: number, nacao: 'bra' | 'usa' = 'bra') => {
  ordenar(sim, 'assumir_controle', { id }, nacao);
  sim.step();
};
const pilotar = (sim: Sim, id: number, entrada: Record<string, unknown>) => {
  ordenar(sim, 'pilotar', { id, rumo: NORTE, ...entrada });
  sim.step();
};

describe('T-110/T-111 — CTL-08, CTL-10, CTL-12: controle direto e movimento', () => {
  it('CTL-08: só unidade móvel própria entra em controle direto; uma por nação', () => {
    const sim = partida(mundoLiso());
    const [a, b] = criar(sim, [
      { unidade: 'hover_ex1', x: 0, z: 0 },
      { unidade: 'hover_ex1', x: 10, z: 0 },
    ]);
    const [nave] = criar(sim, [{ estrutura: 'ship', x: 40, z: 0 }]);
    const [inimigo] = criar(sim, [{ unidade: 'hover_ex1', x: 0, z: 60 }], 'usa');
    assumir(sim, nave!);
    assumir(sim, inimigo!);
    expect(getComponent(sim.state, nave!, 'pilotado')).toBeUndefined();
    expect(getComponent(sim.state, inimigo!, 'pilotado')).toBeUndefined();
    assumir(sim, a!);
    assumir(sim, b!);
    expect(getComponent(sim.state, a!, 'pilotado')).toBeUndefined();
    expect(getComponent(sim.state, b!, 'pilotado')).toBeDefined();
    ordenar(sim, 'soltar_controle', { id: b });
    sim.step();
    expect(getComponent(sim.state, b!, 'pilotado')).toBeUndefined();
  });

  it('CTL-10: W anda para a frente, D desloca para a direita e o corpo gira até a mira', () => {
    const sim = partida(mundoLiso());
    const [ex1] = criar(sim, [{ unidade: 'hover_ex1', x: 0, z: 0 }]);
    assumir(sim, ex1!);
    pilotar(sim, ex1!, { frente: 1 });
    rodar(sim, 2);
    const p1 = pos(sim, ex1!);
    expect(p1.z).toBeGreaterThan(5);
    expect(Math.abs(p1.x)).toBeLessThan(0.5);
    pilotar(sim, ex1!, { frente: 0, lateral: 1 });
    rodar(sim, 2);
    const p2 = pos(sim, ex1!);
    // Virado para o norte, a direita é o leste: -x no mapa local (como no render e no minimapa).
    expect(p1.x - p2.x).toBeGreaterThan(3);
    // A mira para o leste: o corpo gira no ritmo de giro_graus_s.
    pilotar(sim, ex1!, { rumo: LESTE, lateral: 0 });
    rodar(sim, 1);
    const rumo = getComponent(sim.state, ex1!, 'locomotion')!.rumo;
    expect(rumo[2]).toBeGreaterThan(0.95);
  });

  it('CTL-12/D-41: Sincronia +10% e Impulso +30% somam; o Impulso triplica o gasto de movimento', () => {
    const sim = partida(mundoLiso());
    const [a, b] = criar(sim, [
      { unidade: 'hover_ex1', x: 0, z: 0 },
      { unidade: 'hover_ex1', x: 30, z: 0 },
    ]);
    const vel = statsMovel('hover_ex1').vel_m_s;
    assumir(sim, a!);
    pilotar(sim, a!, { frente: 1 });
    rodar(sim, 3);
    const bonus = 1 + param('controle_direto_bonus_vel_pct') / 100;
    expect(getComponent(sim.state, a!, 'locomotion')!.speed).toBeCloseTo(vel * bonus, 5);

    const enAntes = getComponent(sim.state, a!, 'bateria')!.en;
    rodar(sim, 1);
    const gastoNormal = enAntes - getComponent(sim.state, a!, 'bateria')!.en;
    pilotar(sim, a!, { frente: 1, impulso: true });
    rodar(sim, 3);
    const comImpulso = bonus + param('impulso_bonus_vel_pct') / 100;
    expect(getComponent(sim.state, a!, 'locomotion')!.speed).toBeCloseTo(vel * comImpulso, 5);
    const en2 = getComponent(sim.state, a!, 'bateria')!.en;
    rodar(sim, 1);
    const gastoImpulso = en2 - getComponent(sim.state, a!, 'bateria')!.en;
    expect(gastoImpulso / gastoNormal).toBeCloseTo(param('impulso_mult_en'), 1);
    // O outro EX1 não foi afetado.
    expect(getComponent(sim.state, b!, 'locomotion')!.speed).toBe(0);
  });

  it('D-44: em controle direto a unidade não dispara sozinha nem segue ordens', () => {
    const sim = partida(mundoLiso());
    const [ex1] = criar(sim, [{ unidade: 'hover_ex1', x: 0, z: 0 }]);
    assumir(sim, ex1!);
    const [inimigo] = criar(sim, [{ unidade: 'hover_explorer', x: 0, z: 6 }], 'usa');
    revelar(sim);
    ordenar(sim, 'mover', {
      ids: [ex1],
      x: ponto(40, 0)[0],
      y: ponto(40, 0)[1],
      z: ponto(40, 0)[2],
    });
    rodar(sim, 3);
    expect(getComponent(sim.state, inimigo!, 'vida')!.hp).toBe(
      getComponent(sim.state, inimigo!, 'vida')!.max,
    );
    expect(Math.abs(pos(sim, ex1!).x)).toBeLessThan(0.5);
  });
});

describe('T-112 — CTL-11, D-40, D-42, D-44: mira e ações', () => {
  it('CTL-11/CTL-12: laser acerta o alvo sob a mira no alcance, com o bônus da Sincronia', () => {
    const sim = partida(mundoLiso());
    const [ex1] = criar(sim, [{ unidade: 'hover_ex1', x: 0, z: 0 }]);
    assumir(sim, ex1!);
    const [alvo] = criar(sim, [{ unidade: 'hover_explorer', x: 0, z: 6 }], 'usa');
    rodar(sim, 0.3);
    const vida = getComponent(sim.state, alvo!, 'vida')!;
    const antes = vida.hp;
    pilotar(sim, ex1!, { gatilho: true, alvo });
    const arma = armaDe('ex1_laser');
    const esperado = arma.dano * (1 + param('controle_direto_bonus_dano_pct') / 100);
    // Leve × laser = 1,0 (dados:multiplicadores).
    expect(antes - vida.hp).toBeCloseTo(esperado, 5);
  });

  it('D-44: sem alvo sob a mira, o disparo se perde e gasta energia e recarga', () => {
    const sim = partida(mundoLiso());
    const [ex1] = criar(sim, [{ unidade: 'hover_ex1', x: 0, z: 0 }]);
    assumir(sim, ex1!);
    const en = getComponent(sim.state, ex1!, 'bateria')!.en;
    const eventos: SimEvent[] = [];
    ordenar(sim, 'pilotar', { id: ex1, rumo: NORTE, gatilho: true, ponto: ponto(0, 5) });
    eventos.push(...sim.step());
    expect(eventos.some((e) => e.tipo === 'disparo')).toBe(true);
    expect(getComponent(sim.state, ex1!, 'bateria')!.en).toBeLessThan(
      en - armaDe('ex1_laser').en_disparo + 1e-6,
    );
    expect(getComponent(sim.state, ex1!, 'arma')!.recarga_s).toBeGreaterThan(0);
  });

  it('CTL-11: torpedo travado (clique mantido trava_torpedo_s) persegue o alvo', () => {
    const sim = partida(mundoLiso());
    const [opq] = criar(sim, [{ unidade: 'hover_opq', x: 0, z: 0 }]);
    assumir(sim, opq!);
    const [alvo] = criar(sim, [{ unidade: 'hover_ex1', x: 12, z: 5, postura: 'passiva' }], 'usa');
    rodar(sim, 0.3);
    pilotar(sim, opq!, { gatilho: true, alvo });
    rodar(sim, param('trava_torpedo_s') + 0.1);
    pilotar(sim, opq!, { gatilho: false, alvo });
    const torpedo = sim.state.entities.find((id) => getComponent(sim.state, id, 'projetil'));
    expect(getComponent(sim.state, torpedo!, 'projetil')!.alvo).toBe(alvo);
  });

  it('D-40: sem trava o torpedo sai reto e detona no primeiro inimigo em que encosta', () => {
    const sim = partida(mundoLiso());
    const [opq] = criar(sim, [{ unidade: 'hover_opq', x: 0, z: 0 }]);
    assumir(sim, opq!);
    // Um inimigo no caminho (norte) e outro fora dele.
    const [noCaminho, fora] = criar(
      sim,
      [
        { unidade: 'hover_ex1', x: 0, z: 10, postura: 'passiva' },
        { unidade: 'hover_ex1', x: 8, z: 4, postura: 'passiva' },
      ],
      'usa',
    );
    rodar(sim, 0.3);
    pilotar(sim, opq!, { gatilho: true });
    pilotar(sim, opq!, { gatilho: false });
    const torpedo = sim.state.entities.find((id) => getComponent(sim.state, id, 'projetil'));
    expect(getComponent(sim.state, torpedo!, 'projetil')!.alvo).toBeNull();
    rodar(sim, 1.5);
    const vidaDe = (id: number) => getComponent(sim.state, id, 'vida')!;
    expect(vidaDe(noCaminho!).hp).toBeLessThan(vidaDe(noCaminho!).max);
    expect(vidaDe(fora!).hp).toBe(vidaDe(fora!).max);
  });

  it('CTL-11: a bomba cai no ponto previsto pelo deslocamento do drone', () => {
    const sim = partida(mundoLiso());
    const [drone] = criar(sim, [{ unidade: 'drone_bomber', x: 0, z: 0 }]);
    assumir(sim, drone!);
    rodar(sim, param('tempo_decolagem_s') + 0.2);
    pilotar(sim, drone!, { frente: 1 });
    rodar(sim, 2);
    const loc = getComponent(sim.state, drone!, 'locomotion')!;
    const esperado = pos(sim, drone!).z + loc.speed * param('bomba_tempo_queda_s');
    pilotar(sim, drone!, { frente: 1, gatilho: true });
    const bomba = sim.state.entities.find((id) => getComponent(sim.state, id, 'projetil'));
    const p = getComponent(sim.state, bomba!, 'projetil')!;
    expect(p.tipo).toBe('bomba');
    expect(p.ponto[1] * 144).toBeCloseTo(esperado, 0);
  });

  it('CTL-10/D-42: o Hover de Exploração minera a jazida sob a mira e descarrega com o clique direito', () => {
    const sim = partida(mundoLiso());
    criar(sim, [{ estrutura: 'ship', x: 0, z: -30 }]);
    const [hover] = criar(sim, [{ unidade: 'hover_explorer', x: 0, z: 0 }]);
    semear(sim, [{ recurso: 'fe', quantidade: 500, x: 0, z: 4 }]);
    const jazida = sim.state.entities.find((id) => getComponent(sim.state, id, 'jazida'))!;
    assumir(sim, hover!);
    pilotar(sim, hover!, { gatilho: true, alvo: jazida });
    rodar(sim, 3);
    const coleta = getComponent(sim.state, hover!, 'coleta')!;
    expect(coleta.carga).toBeGreaterThan(0);
    // Longe da Nave, a habilidade não descarrega; perto, descarrega.
    pilotar(sim, hover!, { gatilho: false });
    const carga = coleta.carga;
    ordenar(sim, 'habilidade', { id: hover });
    sim.step();
    expect(coleta.carga).toBe(carga);
    pilotar(sim, hover!, { frente: -1 });
    rodar(sim, 3.2);
    pilotar(sim, hover!, { frente: 0 });
    rodar(sim, 0.5);
    const fe = sim.state.estoques.bra!.fe;
    ordenar(sim, 'habilidade', { id: hover });
    sim.step();
    expect(coleta.carga).toBe(0);
    expect(sim.state.estoques.bra!.fe).toBeCloseTo(fe + carga, 5);
  });

  it('D-42: Hover de Plantio planta mina com o clique direito; drone pousa e decola', () => {
    const sim = partida(mundoLiso());
    const [plantador, drone] = criar(sim, [
      { unidade: 'hover_minelayer', x: 0, z: 0 },
      { unidade: 'drone_laser', x: 20, z: 0 },
    ]);
    getComponent(sim.state, plantador!, 'lancaMinas')!.carregador = 1;
    assumir(sim, plantador!);
    ordenar(sim, 'habilidade', { id: plantador });
    rodar(sim, param('tempo_plantar_mina_s') + 0.1);
    expect(sim.state.entities.some((id) => getComponent(sim.state, id, 'mine'))).toBe(true);
    expect(getComponent(sim.state, plantador!, 'lancaMinas')!.carregador).toBe(0);

    assumir(sim, drone!);
    rodar(sim, param('tempo_decolagem_s') + 0.2);
    expect(getComponent(sim.state, drone!, 'air')!.estado).toBe('voando');
    ordenar(sim, 'habilidade', { id: drone });
    rodar(sim, param('tempo_pouso_s') + 0.2);
    expect(getComponent(sim.state, drone!, 'air')!.estado).toBe('pousado');
  });
});
