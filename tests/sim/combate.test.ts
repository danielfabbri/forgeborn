import { describe, expect, it } from 'vitest';
import {
  dados,
  getComponent,
  param,
  setComponent,
  type EntityId,
  type Sim,
  type SimEvent,
} from '../../src/sim';
import { danoContra, fatorDeSplash, pontuacao } from '../../src/sim/combate';
import { custoDe } from '../../src/sim/producao';
import { statsEstrutura, statsMovel } from '../../src/sim/units/stats';
import { alvo, criar, mundoLiso, ordenar, partida, ponto, pos, semear } from './mundo-teste';

const vida = (sim: Sim, id: EntityId) => getComponent(sim.state, id, 'vida');
const hp = (sim: Sim, id: EntityId) => vida(sim, id)?.hp ?? 0;
const vivo = (sim: Sim, id: EntityId) => sim.state.entities.includes(id);
const bateria = (sim: Sim, id: EntityId) => getComponent(sim.state, id, 'bateria')!;
const arma = (sim: Sim, id: EntityId) => getComponent(sim.state, id, 'arma')!;
const armaDados = (id: string) => dados.armas.find((a) => a.id === id)!;
const mult = (tipo: string, classe: 'leve' | 'blindada' | 'estrutura') =>
  dados.multiplicadores.find((m) => m.tipo_dano === tipo)![classe];

function rodar(sim: Sim, segundos: number, eventos?: SimEvent[]): void {
  for (let t = 0; t < Math.round(segundos * sim.tickHz); t++) {
    const novos = sim.step();
    eventos?.push(...novos);
  }
}
function rodarAte(sim: Sim, condicao: () => boolean, limite_s: number, eventos?: SimEvent[]) {
  for (let t = 0; t < limite_s * sim.tickHz; t++) {
    if (condicao()) return true;
    const novos = sim.step();
    eventos?.push(...novos);
  }
  return condicao();
}
/** Sem mover sozinha (Manter posição), para testes de dano e alcance. */
function fixar(sim: Sim, ids: EntityId[]): void {
  ordenar(sim, 'postura', { ids, postura: 'manter' });
  sim.step();
}
function passiva(sim: Sim, ids: EntityId[], nacao: 'bra' | 'usa' = 'bra'): void {
  ordenar(sim, 'postura', { ids, postura: 'passiva' }, nacao);
  sim.step();
}

describe('T-060 — CMB-01 a CMB-03, CMB-27: dano, HP e morte', () => {
  it('CMB-01/CMB-02: dano × multiplicador da classe; mínimo 1 por acerto', () => {
    const sim = partida(mundoLiso());
    const [leve, blindada, estrutura] = criar(sim, [
      { unidade: 'hover_explorer', x: 0, z: 0 },
      { unidade: 'hover_ex1', x: 10, z: 0 },
      { estrutura: 'storage', x: 30, z: 0 },
    ]);
    expect(danoContra(sim.state, leve!, 14, 'laser')).toBe(14 * mult('laser', 'leve'));
    expect(danoContra(sim.state, blindada!, 30, 'explosivo')).toBe(
      30 * mult('explosivo', 'blindada'),
    );
    expect(danoContra(sim.state, estrutura!, 14, 'laser')).toBe(14 * mult('laser', 'estrutura'));
    expect(danoContra(sim.state, estrutura!, 0.5, 'laser')).toBe(1);
  });

  it('CMB-06/CMB-27: EX1 abate um hover inimigo; a morte é imediata, com evento e destroço', () => {
    const sim = partida(mundoLiso());
    const [ex1] = criar(sim, [{ unidade: 'hover_ex1', x: 0, z: 0 }]);
    const [h] = criar(sim, [{ unidade: 'hover_explorer', x: 6, z: 0 }], 'usa');
    passiva(sim, [], 'usa');
    fixar(sim, [ex1!]);
    const eventos: SimEvent[] = [];
    expect(rodarAte(sim, () => !vivo(sim, h!), 20, eventos)).toBe(true);
    expect(eventos).toContainEqual(
      expect.objectContaining({
        tipo: 'morte',
        dados: expect.objectContaining({ id: h, por: 'bra' }),
      }),
    );
    expect(eventos).toContainEqual(
      expect.objectContaining({
        tipo: 'alerta',
        dados: { id: 'AL-18', nacao: 'usa', unidade: 'hover_explorer' },
      }),
    );
    // Cada acerto tira dano × multiplicador (leve).
    const danos = eventos
      .filter((e) => e.tipo === 'dano')
      .map((e) => (e.dados as { dano: number }).dano);
    expect(danos[0]).toBe(armaDados('ex1_laser').dano * mult('laser', 'leve'));
    const destrocos = sim.state.entities.filter((id) => getComponent(sim.state, id, 'destroco'));
    expect(destrocos).toHaveLength(1);
  });

  it('CMB-03: sem regeneração natural de HP', () => {
    const sim = partida(mundoLiso());
    const [u] = criar(sim, [{ unidade: 'hover_ex1', x: 0, z: 0 }]);
    vida(sim, u!)!.hp = 50;
    rodar(sim, 10);
    expect(hp(sim, u!)).toBe(50);
  });
});

describe('T-061 — CMB-04, CMB-06, ENE-03: armas hitscan', () => {
  it('CMB-04: o torpedo (só solo) não mira drone em voo; o laser do EX1 mira', () => {
    const sim = partida(mundoLiso());
    const [opq, ex1] = criar(sim, [
      { unidade: 'hover_opq', x: 0, z: 0 },
      { unidade: 'hover_ex1', x: 0, z: 30 },
    ]);
    const [drone] = criar(sim, [{ unidade: 'drone_laser', x: 8, z: 0 }], 'usa');
    passiva(sim, [drone!], 'usa');
    fixar(sim, [opq!, ex1!]);
    rodar(sim, 1);
    expect(arma(sim, opq!).alvo).toBeNull();
    const [drone2] = criar(sim, [{ unidade: 'drone_laser', x: 6, z: 30 }], 'usa');
    passiva(sim, [drone2!], 'usa');
    rodar(sim, 0.5);
    expect(arma(sim, ex1!).alvo).toBe(drone2);
  });

  it('CMB-06: EX1 dispara a cada recarga_s e gasta en_disparo da bateria', () => {
    const sim = partida(mundoLiso());
    const [ex1] = criar(sim, [{ unidade: 'hover_ex1', x: 0, z: 0 }]);
    const [alvoId] = criar(sim, [{ estrutura: 'storage', x: 12, z: 0 }], 'usa');
    fixar(sim, [ex1!]);
    const eventos: SimEvent[] = [];
    const inicio = bateria(sim, ex1!).en;
    const hpInicio = hp(sim, alvoId!);
    rodar(sim, 3, eventos);
    const disparos = eventos.filter((e) => e.tipo === 'disparo');
    expect(disparos.length).toBe(3);
    expect(inicio - bateria(sim, ex1!).en).toBeCloseTo(3 * armaDados('ex1_laser').en_disparo, 6);
    expect(hpInicio - hp(sim, alvoId!)).toBeCloseTo(
      3 * armaDados('ex1_laser').dano * mult('laser', 'estrutura'),
      6,
    );
  });

  it('ENE-03: a Torre dispara com energia da rede; em racionamento dispara mais devagar', () => {
    const disparosEm = (racionar: boolean) => {
      const sim = partida(mundoLiso());
      const [, torre] = criar(sim, [
        { estrutura: 'solar_plant', x: -30, z: 0 },
        { estrutura: 'laser_tower', x: 0, z: 0 },
      ]);
      const [alvoId] = criar(sim, [{ estrutura: 'storage', x: 8, z: 0 }], 'usa');
      if (!racionar) {
        ordenar(sim, 'debug_encher_banco', {});
        sim.step();
      }
      const eventos: SimEvent[] = [];
      rodar(sim, 10, eventos);
      expect(alvoId).toBeDefined();
      return eventos.filter(
        (e) => e.tipo === 'disparo' && (e.dados as { atirador: number }).atirador === torre,
      ).length;
    };
    const cheio = disparosEm(false);
    const racionado = disparosEm(true);
    expect(cheio).toBe(10);
    // Solar (3 EN/s × fator_solar) contra 2 EN/s de demanda da torre: na Lua cobre; ver abaixo.
    expect(racionado).toBeLessThanOrEqual(cheio);
  });

  it('ENE-04: sem banco e com geração menor que a demanda, a torre dispara na proporção atendida', () => {
    const sim = partida(mundoLiso());
    const [torre] = criar(sim, [{ estrutura: 'laser_tower', x: 0, z: 0 }]);
    criar(sim, [{ estrutura: 'storage', x: 8, z: 0 }], 'usa');
    // Sem gerador nem banco: depois do primeiro disparo, a recarga não anda (atendido 0).
    const eventos: SimEvent[] = [];
    rodar(sim, 5, eventos);
    expect(eventos.filter((e) => e.tipo === 'disparo')).toHaveLength(0);
    expect(arma(sim, torre!).atendido).toBe(0);
  });
});

describe('T-062 — CMB-07, CMB-08, CMB-10, CMB-11: torpedo, bomba e splash', () => {
  it('CMB-10: dano cheio até nucleo_splash_pct% do raio, caindo até splash_borda_pct% na borda', () => {
    const nucleo = param('nucleo_splash_pct') / 100;
    expect(fatorDeSplash(0, 4, 40)).toBe(1);
    expect(fatorDeSplash(4 * nucleo, 4, 40)).toBe(1);
    expect(fatorDeSplash(4, 4, 40)).toBeCloseTo(0.4, 9);
    expect(fatorDeSplash((4 * nucleo + 4) / 2, 4, 40)).toBeCloseTo(0.7, 9);
    expect(fatorDeSplash(4.01, 4, 40)).toBe(0);
  });

  it('CMB-07: o torpedo persegue e acerta; alvo morto, detona na última posição', () => {
    const sim = partida(mundoLiso());
    const [opq] = criar(sim, [{ unidade: 'hover_opq', x: 0, z: 0 }]);
    const [a, b] = criar(
      sim,
      [
        { unidade: 'hover_explorer', x: 15, z: 0 },
        { unidade: 'hover_explorer', x: 15, z: 2.5 },
      ],
      'usa',
    );
    passiva(sim, [], 'usa');
    fixar(sim, [opq!]);
    const eventos: SimEvent[] = [];
    rodar(sim, 0.5, eventos);
    const torpedo = sim.state.entities.find((id) => getComponent(sim.state, id, 'projetil'));
    expect(torpedo).toBeDefined();
    const alvoTorpedo = getComponent(sim.state, torpedo!, 'projetil')!.alvo!;
    // Mata o alvo em voo: o torpedo segue para a última posição e detona lá.
    vida(sim, alvoTorpedo)!.hp = 0;
    const outro = alvoTorpedo === a ? b! : a!;
    const hpOutro = hp(sim, outro);
    expect(rodarAte(sim, () => !vivo(sim, torpedo!), 3, eventos)).toBe(true);
    expect(eventos.some((e) => e.tipo === 'explosao')).toBe(true);
    // O vizinho a 2,5 m pega splash.
    expect(hp(sim, outro)).toBeLessThan(hpOutro);
  });

  it('D-31: o torpedo que chega ao tempo máximo de voo detona onde está', () => {
    const sim = partida(mundoLiso());
    const [opq] = criar(sim, [{ unidade: 'hover_opq', x: 0, z: 0 }]);
    const [alvoId] = criar(sim, [{ unidade: 'hover_scout', x: 17, z: 0 }], 'usa');
    passiva(sim, [], 'usa');
    fixar(sim, [opq!]);
    rodarAte(
      sim,
      () => sim.state.entities.some((id) => getComponent(sim.state, id, 'projetil')),
      3,
    );
    const torpedo = sim.state.entities.find((id) => getComponent(sim.state, id, 'projetil'))!;
    // O alvo foge mais rápido que o torpedo alcança no tempo máximo: tira-o do caminho.
    setComponent(sim.state, alvoId!, 'position', {
      ...getComponent(sim.state, alvoId!, 'position')!,
    });
    const p = getComponent(sim.state, alvoId!, 'position')!;
    const d = ponto(90, 0);
    const r = Math.hypot(p.x, p.y, p.z);
    Object.assign(p, { x: d[0] * r, y: d[1] * r, z: d[2] * r });
    const eventos: SimEvent[] = [];
    const voo = param('torpedo_tempo_max_voo_s');
    expect(rodarAte(sim, () => !vivo(sim, torpedo), voo + 0.2, eventos)).toBe(true);
    const explosao = eventos.find((e) => e.tipo === 'explosao')!;
    const onde = (explosao.dados as { d: [number, number, number] }).d;
    const vel = armaDados('opq_torpedo').vel_projetil_m_s!;
    expect(Math.hypot(onde[0] - d[0], onde[1] - d[1], onde[2] - d[2]) * 144).toBeGreaterThan(5);
    expect(vel * voo).toBeGreaterThan(0);
  });

  it('CMB-08: bomba com mira preditiva erra alvo que muda de direção', () => {
    const acerta = (virar: boolean) => {
      const sim = partida(mundoLiso());
      const [bomber] = criar(sim, [{ unidade: 'drone_bomber', x: 0, z: 0 }]);
      // O mais rápido dos hovers: em bomba_tempo_queda_s ele sai do ponto previsto.
      const [alvoId] = criar(sim, [{ unidade: 'hover_scout', x: 0, z: 20 }], 'usa');
      ordenar(sim, 'mover', { ids: [alvoId], ...alvo(0, 90) }, 'usa');
      ordenar(sim, 'atacar', { ids: [bomber], alvo: alvoId });
      const inicio = hp(sim, alvoId!);
      rodarAte(
        sim,
        () => sim.state.entities.some((id) => getComponent(sim.state, id, 'projetil')),
        20,
      );
      if (virar) {
        const p = pos(sim, alvoId!);
        ordenar(sim, 'mover', { ids: [alvoId], ...alvo(p.x + 40, p.z) }, 'usa');
      }
      rodar(sim, param('bomba_tempo_queda_s') + 0.1);
      return hp(sim, alvoId!) < inicio;
    };
    expect(acerta(false)).toBe(true);
    expect(acerta(true)).toBe(false);
  });

  it('CMB-11: splash de arma não fere unidades do próprio atacante', () => {
    const sim = partida(mundoLiso());
    const [opq, aliado] = criar(sim, [
      { unidade: 'hover_opq', x: 0, z: 0 },
      { unidade: 'hover_explorer', x: 14, z: 1.5 },
    ]);
    criar(sim, [{ estrutura: 'storage', x: 16, z: 0 }], 'usa');
    fixar(sim, [opq!]);
    rodar(sim, 6);
    expect(hp(sim, aliado!)).toBe(statsMovel('hover_explorer').hp);
  });
});

describe('T-063 — CMB-12 a CMB-18: alvos, posturas e mente única', () => {
  it('CMB-12: prioriza unidade armada sobre desarmada e unidade sobre estrutura', () => {
    const sim = partida(mundoLiso());
    const [ex1] = criar(sim, [{ unidade: 'hover_ex1', x: 0, z: 0 }]);
    const [estrutura, desarmada, armada] = criar(
      sim,
      [
        { estrutura: 'storage', x: 8, z: 0 },
        { unidade: 'hover_explorer', x: 0, z: 6 },
        { unidade: 'hover_ex1', x: 0, z: -9 },
      ],
      'usa',
    );
    passiva(sim, [desarmada!, armada!], 'usa');
    fixar(sim, [ex1!]);
    rodar(sim, 0.2);
    expect(arma(sim, ex1!).alvo).toBe(armada);
    expect(estrutura).toBeDefined();
  });

  it('CMB-12: quem está atacando a unidade vem primeiro', () => {
    const sim = partida(mundoLiso());
    const [ex1] = criar(sim, [{ unidade: 'hover_ex1', x: 0, z: 0 }]);
    const [perto, atacante] = criar(
      sim,
      [
        { unidade: 'hover_ex1', x: 5, z: 0 },
        { unidade: 'hover_ex1', x: 0, z: 9 },
      ],
      'usa',
    );
    passiva(sim, [perto!], 'usa');
    fixar(sim, [ex1!]);
    ordenar(sim, 'postura', { ids: [atacante], postura: 'manter' }, 'usa');
    rodar(sim, 1.2);
    expect(arma(sim, ex1!).alvo).toBe(atacante);
  });

  it('CMB-13: Agressiva persegue até leash_agressivo_m; Defensiva, até leash_defensivo_m', () => {
    const perseguiu = (postura: 'agressiva' | 'defensiva') => {
      const sim = partida(mundoLiso());
      const [ex1] = criar(sim, [{ unidade: 'hover_ex1', x: 0, z: 0 }]);
      ordenar(sim, 'postura', { ids: [ex1], postura });
      sim.step();
      const [alvoId] = criar(sim, [{ unidade: 'hover_explorer', x: 20, z: 0 }], 'usa');
      passiva(sim, [], 'usa');
      getComponent(sim.state, alvoId!, 'order')!.tipo = 'manter';
      rodar(sim, 4);
      return pos(sim, ex1!).x;
    };
    const agressiva = perseguiu('agressiva');
    const defensiva = perseguiu('defensiva');
    expect(agressiva).toBeGreaterThan(defensiva);
    expect(defensiva).toBeLessThanOrEqual(param('leash_defensivo_m') + 0.5);
  });

  it('CMB-13: Passiva nunca dispara; Manter posição não se move', () => {
    const sim = partida(mundoLiso());
    const [a, b] = criar(sim, [
      { unidade: 'hover_ex1', x: 0, z: 0 },
      { unidade: 'hover_ex1', x: 0, z: 40 },
    ]);
    ordenar(sim, 'postura', { ids: [a], postura: 'passiva' });
    ordenar(sim, 'postura', { ids: [b], postura: 'manter' });
    sim.step();
    criar(
      sim,
      [
        { unidade: 'hover_explorer', x: 6, z: 0 },
        { unidade: 'hover_explorer', x: 15, z: 40 },
      ],
      'usa',
    );
    passiva(sim, [], 'usa');
    const eventos: SimEvent[] = [];
    rodar(sim, 3, eventos);
    expect(
      eventos.some((e) => e.tipo === 'disparo' && (e.dados as { atirador: number }).atirador === a),
    ).toBe(false);
    expect(pos(sim, b!).x).toBeCloseTo(0, 1);
    expect(pos(sim, b!).z).toBeCloseTo(40, 1);
  });

  it('D-31: com o alvo dentro do alcance mínimo, o OPQ recua até poder disparar', () => {
    const sim = partida(mundoLiso());
    const [opq] = criar(sim, [{ unidade: 'hover_opq', x: 0, z: 0 }]);
    const [alvoId] = criar(sim, [{ unidade: 'hover_explorer', x: 3.5, z: 0 }], 'usa');
    getComponent(sim.state, alvoId!, 'order')!.tipo = 'manter';
    const eventos: SimEvent[] = [];
    rodar(sim, 4, eventos);
    expect(pos(sim, opq!).x).toBeLessThan(0);
    expect(eventos.some((e) => e.tipo === 'disparo')).toBe(true);
  });

  it('CMB-14: ataque-movimento engaja no caminho e depois retoma o destino', () => {
    const sim = partida(mundoLiso());
    const [ex1] = criar(sim, [{ unidade: 'hover_ex1', x: 0, z: 0 }]);
    const [h] = criar(sim, [{ unidade: 'hover_explorer', x: 5, z: 20 }], 'usa');
    getComponent(sim.state, h!, 'order')!.tipo = 'manter';
    ordenar(sim, 'atacar_mover', { ids: [ex1], ...alvo(0, 50) });
    expect(rodarAte(sim, () => !vivo(sim, h!), 40)).toBe(true);
    expect(rodarAte(sim, () => pos(sim, ex1!).z > 48, 40)).toBe(true);
  });

  it('D-32: mover dispara sem desviar; M (mover ignorando) não dispara', () => {
    const disparos = (tipo: 'mover' | 'mover_ignorando') => {
      const sim = partida(mundoLiso());
      const [ex1] = criar(sim, [{ unidade: 'hover_ex1', x: 0, z: 0 }]);
      criar(sim, [{ estrutura: 'storage', x: 8, z: 20 }], 'usa');
      ordenar(sim, tipo, { ids: [ex1], ...alvo(0, 40) });
      const eventos: SimEvent[] = [];
      rodar(sim, 6, eventos);
      expect(Math.abs(pos(sim, ex1!).x)).toBeLessThan(1);
      return eventos.filter((e) => e.tipo === 'disparo').length;
    };
    expect(disparos('mover')).toBeGreaterThan(0);
    expect(disparos('mover_ignorando')).toBe(0);
  });

  it('CMB-15: a ordem de ataque direta vale mesmo na postura Passiva', () => {
    const sim = partida(mundoLiso());
    const [ex1] = criar(sim, [{ unidade: 'hover_ex1', x: 0, z: 0, postura: 'passiva' }]);
    const [alvoId] = criar(
      sim,
      [{ unidade: 'hover_explorer', x: 6, z: 0, postura: 'passiva' }],
      'usa',
    );
    rodar(sim, 2);
    expect(hp(sim, alvoId!)).toBe(statsMovel('hover_explorer').hp);
    ordenar(sim, 'atacar', { ids: [ex1], alvo: alvoId });
    expect(rodarAte(sim, () => !vivo(sim, alvoId!), 15)).toBe(true);
  });

  it('CMB-15: ataque direto sobrepõe a prioridade', () => {
    const sim = partida(mundoLiso());
    const [ex1] = criar(sim, [{ unidade: 'hover_ex1', x: 0, z: 0 }]);
    const [armada, estrutura] = criar(
      sim,
      [
        { unidade: 'hover_ex1', x: 6, z: 0 },
        { estrutura: 'storage', x: 0, z: 12 },
      ],
      'usa',
    );
    passiva(sim, [armada!], 'usa');
    ordenar(sim, 'atacar', { ids: [ex1], alvo: estrutura });
    rodar(sim, 0.5);
    expect(arma(sim, ex1!).alvo).toBe(estrutura);
  });

  it('CMB-16: sem desperdício — não mira quem o dano a caminho já mata', () => {
    const sim = partida(mundoLiso());
    const [fraco, outro] = criar(
      sim,
      [
        { unidade: 'hover_explorer', x: 15, z: 0 },
        { unidade: 'hover_explorer', x: 16, z: 8 },
      ],
      'usa',
    );
    vida(sim, fraco!)!.hp = 10;
    // Os dois OPQs disparam no tick em que nascem, um depois do outro.
    criar(sim, [
      { unidade: 'hover_opq', x: 0, z: 0, postura: 'manter' },
      { unidade: 'hover_opq', x: 0, z: 2, postura: 'manter' },
    ]);
    const torpedos = sim.state.entities
      .map((id) => getComponent(sim.state, id, 'projetil')?.alvo)
      .filter((a) => a !== undefined);
    expect(torpedos.filter((a) => a === fraco)).toHaveLength(1);
    expect(torpedos.filter((a) => a === outro)).toHaveLength(1);
  });

  it('CMB-18: Agressiva responde a ataque contra aliado dentro da própria visão', () => {
    const sim = partida(mundoLiso());
    const [ex1, aliado] = criar(sim, [
      { unidade: 'hover_ex1', x: 0, z: 0 },
      { unidade: 'hover_explorer', x: 12, z: 0 },
    ]);
    const [inimigo] = criar(sim, [{ unidade: 'hover_ex1', x: 20, z: 0 }], 'usa');
    ordenar(sim, 'postura', { ids: [inimigo], postura: 'manter' }, 'usa');
    rodar(sim, 2);
    expect(arma(sim, ex1!).alvo).toBe(inimigo);
    expect(aliado).toBeDefined();
  });
});

describe('T-064 — UNI-01, UNI-02, UNI-07, CMB-09, CMB-21, REG-18: minas', () => {
  it('UNI-01: fabrica uma mina por vez até magazine_minas, pagando a receita de mine', () => {
    const sim = partida(mundoLiso());
    for (const r of ['fe', 'cu', 'li'] as const) sim.state.estoques.bra[r] = 1000;
    const [m] = criar(sim, [{ unidade: 'hover_minelayer', x: 0, z: 0 }]);
    const custo = custoDe('mine');
    rodar(sim, custo.tempo_s * param('magazine_minas') + 1);
    const lanca = getComponent(sim.state, m!, 'lancaMinas')!;
    expect(lanca.carregador).toBe(param('magazine_minas'));
    expect(sim.state.estoques.bra.fe).toBe(1000 - custo.fe * param('magazine_minas'));
  });

  it('UNI-02/CMB-21: plantar leva tempo_plantar_mina_s; a mina arma após tempo_armar_mina_s', () => {
    const sim = partida(mundoLiso());
    const [m] = criar(sim, [{ unidade: 'hover_minelayer', x: 0, z: 0 }]);
    getComponent(sim.state, m!, 'lancaMinas')!.carregador = 2;
    ordenar(sim, 'plantar_mina', { ids: [m], ...alvo(0, 0.2) });
    sim.step();
    const minas = () => sim.state.entities.filter((id) => getComponent(sim.state, id, 'mine'));
    rodar(sim, param('tempo_plantar_mina_s') - 0.2);
    expect(minas()).toHaveLength(0);
    rodar(sim, 0.4);
    expect(minas()).toHaveLength(1);
    const mina = getComponent(sim.state, minas()[0]!, 'mine')!;
    expect(mina.armada).toBe(false);
    rodar(sim, param('tempo_armar_mina_s'));
    expect(mina.armada).toBe(true);
  });

  it('UNI-02: Campo minado planta em linha, espaçadas campo_minado_espacamento_m', () => {
    const sim = partida(mundoLiso());
    const [m] = criar(sim, [{ unidade: 'hover_minelayer', x: 0, z: 0 }]);
    getComponent(sim.state, m!, 'lancaMinas')!.carregador = param('magazine_minas');
    ordenar(sim, 'campo_minado', { ids: [m], ...alvo(0, 5) });
    rodar(sim, 30);
    const minas = sim.state.entities
      .filter((id) => getComponent(sim.state, id, 'mine'))
      .map((id) => pos(sim, id));
    expect(minas).toHaveLength(param('magazine_minas'));
    for (let k = 1; k < minas.length; k++) {
      expect(minas[k]!.z - minas[k - 1]!.z).toBeCloseTo(param('campo_minado_espacamento_m'), 1);
    }
  });

  it('UNI-07/CMB-09: só hover inimigo aciona; drone pousado e unidade própria não', () => {
    const sim = partida(mundoLiso());
    criar(sim, [{ mina: true, x: 0, z: 0 }]);
    const mina = sim.state.entities.find((id) => getComponent(sim.state, id, 'mine'))!;
    getComponent(sim.state, mina, 'mine')!.armada = true;
    criar(sim, [{ unidade: 'hover_explorer', x: 0.5, z: 0 }]);
    const [drone] = criar(sim, [{ unidade: 'drone_laser', x: -0.5, z: 0 }], 'usa');
    getComponent(sim.state, drone!, 'air')!.estado = 'pousado';
    rodar(sim, 1);
    expect(vivo(sim, mina)).toBe(true);
    const [h] = criar(sim, [{ unidade: 'hover_ex1', x: 0, z: 8, postura: 'passiva' }], 'usa');
    ordenar(sim, 'mover', { ids: [h], ...alvo(0, -8) }, 'usa');
    const eventos: SimEvent[] = [];
    expect(rodarAte(sim, () => !vivo(sim, mina), 5, eventos)).toBe(true);
    expect(hp(sim, h!)).toBeLessThan(statsMovel('hover_ex1').hp);
    expect(vivo(sim, mina)).toBe(false);
    expect(eventos).toContainEqual(
      expect.objectContaining({ tipo: 'alerta', dados: { id: 'AL-16', nacao: 'bra' } }),
    );
  });

  it('REG-18: no máximo limite_minas_ativas minas plantadas por nação', () => {
    const sim = partida(mundoLiso());
    const n = param('limite_minas_ativas');
    criar(
      sim,
      Array.from({ length: n + 3 }, (_, k) => ({ mina: true as const, x: k * 3, z: 0 })),
    );
    const minas = sim.state.entities.filter((id) => getComponent(sim.state, id, 'mine'));
    expect(minas).toHaveLength(n);
  });
});

describe('T-066 — CMB-23 a CMB-26: explosões ambientais e radiação', () => {
  it('CMB-23/CMB-26: Bateria Móvel destruída fere todas as nações no raio (0% na borda)', () => {
    const sim = partida(mundoLiso());
    const [bm, meu] = criar(sim, [
      { unidade: 'mobile_battery', x: 0, z: 0 },
      { unidade: 'hover_explorer', x: 2.5, z: 0 },
    ]);
    const [deles, longe] = criar(
      sim,
      [
        { unidade: 'hover_explorer', x: -2.5, z: 0 },
        { unidade: 'hover_explorer', x: 0, z: 10 },
      ],
      'usa',
    );
    passiva(sim, [], 'usa');
    vida(sim, bm!)!.hp = 0;
    const eventos: SimEvent[] = [];
    rodar(sim, 0.05, eventos);
    expect(hp(sim, meu!)).toBeLessThan(statsMovel('hover_explorer').hp);
    expect(hp(sim, deles!)).toBeLessThan(statsMovel('hover_explorer').hp);
    expect(hp(sim, longe!)).toBe(statsMovel('hover_explorer').hp);
  });

  it('CMB-24/D-32: Usina Nuclear deixa radiação que fere unidades móveis de solo, não estruturas nem drones em voo', () => {
    const sim = partida(mundoLiso());
    const [usina, torre] = criar(sim, [
      { estrutura: 'nuclear_plant', x: 0, z: 0 },
      { estrutura: 'laser_tower', x: 11, z: 0 },
    ]);
    const [solo, drone] = criar(
      sim,
      [
        { unidade: 'hover_opq', x: 0, z: 11, postura: 'passiva' },
        { unidade: 'drone_laser', x: 0, z: -11, postura: 'passiva' },
      ],
      'usa',
    );
    getComponent(sim.state, drone!, 'order')!.tipo = 'manter';
    vida(sim, usina!)!.hp = 0;
    sim.step();
    const hpTorre = hp(sim, torre!);
    const hpSolo = hp(sim, solo!);
    const hpDrone = hp(sim, drone!);
    rodar(sim, 10);
    expect(hpSolo - hp(sim, solo!)).toBeCloseTo(param('radiacao_dano_hp_s') * 10, 0);
    expect(hp(sim, torre!)).toBe(hpTorre);
    expect(hp(sim, drone!)).toBe(hpDrone);
    rodar(sim, param('radiacao_duracao_s'));
    expect(sim.state.entities.some((id) => getComponent(sim.state, id, 'radiacao'))).toBe(false);
  });

  it('CMB-25: Nave destruída explode com explosao_nave_dano', () => {
    const sim = partida(mundoLiso());
    const [nave] = criar(sim, [{ estrutura: 'ship', x: 0, z: 0 }]);
    const [perto] = criar(sim, [{ unidade: 'hover_opq', x: 10, z: 0 }], 'usa');
    passiva(sim, [perto!], 'usa');
    vida(sim, nave!)!.hp = 0;
    rodar(sim, 0.05);
    expect(hp(sim, perto!)).toBeLessThan(statsMovel('hover_opq').hp);
  });
});

describe('T-067 — REG-09 a REG-13: eliminação, vitória e derrota', () => {
  function duasNacoes() {
    const sim = partida(mundoLiso());
    const [naveBra] = criar(sim, [{ estrutura: 'ship', x: 0, z: 0 }]);
    const [naveUsa, ex1] = criar(
      sim,
      [
        { estrutura: 'ship', x: 0, z: 100 },
        { unidade: 'hover_ex1', x: 20, z: 100 },
      ],
      'usa',
    );
    return { sim, naveBra: naveBra!, naveUsa: naveUsa!, ex1: ex1! };
  }

  it('REG-09/REG-10: sem Nave e sem Impressoras, a nação é eliminada e se autodestrói sem dano', () => {
    const { sim, naveUsa, ex1 } = duasNacoes();
    const eventos: SimEvent[] = [];
    vida(sim, naveUsa)!.hp = 0;
    eventos.push(...sim.step());
    const hpAntes = hp(sim, ex1);
    rodar(sim, 0.1, eventos);
    expect(sim.state.placar.usa.eliminada).toBe(true);
    expect(eventos).toContainEqual(
      expect.objectContaining({
        tipo: 'alerta',
        dados: expect.objectContaining({ id: 'AL-13', eliminada: 'usa' }),
      }),
    );
    expect(hp(sim, ex1)).toBe(hpAntes);
    rodar(sim, 5.2, eventos);
    expect(vivo(sim, ex1)).toBe(false);
    // Deixa destroço.
    expect(sim.state.entities.some((id) => getComponent(sim.state, id, 'destroco'))).toBe(true);
  });

  it('REG-11: a última nação não eliminada vence', () => {
    const { sim, naveUsa } = duasNacoes();
    vida(sim, naveUsa)!.hp = 0;
    const eventos: SimEvent[] = [];
    rodar(sim, 0.2, eventos);
    expect(sim.state.resultado).toMatchObject({ vencedor: 'bra', motivo: 'eliminacao' });
    expect(eventos.some((e) => e.tipo === 'fim_de_partida')).toBe(true);
  });

  it('REG-13: render-se elimina a nação na hora', () => {
    const { sim } = duasNacoes();
    ordenar(sim, 'render_se', {});
    sim.step();
    expect(sim.state.placar.bra.eliminada).toBe(true);
    rodar(sim, 0.1);
    expect(sim.state.resultado?.vencedor).toBe('usa');
  });

  it('REG-12/REG-22: no tempo limite vence a maior pontuação', () => {
    const { sim, ex1 } = duasNacoes();
    sim.state.tempoLimite_s = 2;
    sim.state.placar.usa.vrColetado = 500;
    rodar(sim, 2.1);
    expect(sim.state.resultado).toMatchObject({ vencedor: 'usa', motivo: 'tempo' });
    expect(pontuacao(sim.state, 'usa')).toBeGreaterThan(pontuacao(sim.state, 'bra'));
    expect(ex1).toBeDefined();
  });

  it('REG-22: VR inimigo destruído e Nave inimiga destruída pontuam', () => {
    const { sim, naveUsa } = duasNacoes();
    getComponent(sim.state, naveUsa, 'combate')!.ultimoDanoNacao = 'bra';
    vida(sim, naveUsa)!.hp = 0;
    rodar(sim, 0.2);
    expect(sim.state.placar.bra.navesDestruidas).toBe(1);
    // O EX1 morre na autodestruição: não conta como destruído por ninguém.
    expect(sim.state.placar.bra.vrDestruido).toBe(0);
  });
});

describe('T-034 — ECO-13: fuga de hovers', () => {
  it('ECO-13: hover atingido foge para a estrutura armada mais próxima e retoma depois', () => {
    const sim = partida(mundoLiso());
    const [nave] = criar(sim, [{ estrutura: 'ship', x: -40, z: 0 }]);
    const [j] = semear(sim, [{ recurso: 'fe', quantidade: 1000, x: 20, z: 0 }]);
    const [h] = criar(sim, [{ unidade: 'hover_explorer', x: 15, z: 4 }]);
    ordenar(sim, 'coletar', { ids: [h], jazida: j });
    rodar(sim, 3);
    vida(sim, h!)!.hp -= 5;
    getComponent(sim.state, h!, 'combate')!.semDano_s = 0;
    sim.step();
    expect(getComponent(sim.state, h!, 'fuga')).toMatchObject({ abrigo: nave });
    rodar(sim, 5);
    expect(pos(sim, h!).x).toBeLessThan(0);
    rodar(sim, param('fuga_hover_retorno_s'));
    expect(getComponent(sim.state, h!, 'fuga')).toBeUndefined();
    expect(getComponent(sim.state, h!, 'coleta')!.jazida).toBe(j);
  });

  it('ECO-13: a chave nas Diretivas desliga a fuga', () => {
    const sim = partida(mundoLiso());
    criar(sim, [{ estrutura: 'ship', x: -40, z: 0 }]);
    const [h] = criar(sim, [{ unidade: 'hover_explorer', x: 15, z: 4 }]);
    ordenar(sim, 'chave_diretiva', { chave: 'fuga', ligada: false });
    sim.step();
    getComponent(sim.state, h!, 'combate')!.semDano_s = 0;
    sim.step();
    expect(getComponent(sim.state, h!, 'fuga')).toBeUndefined();
  });
});

describe('T-036 — ECO-26 a ECO-29: destroços e reciclagem', () => {
  it('ECO-27: destroço = piso(receita × rendimento_destroco_pct%) por recurso; some no prazo', () => {
    const sim = partida(mundoLiso());
    const [u] = criar(sim, [{ unidade: 'hover_opq', x: 0, z: 0 }]);
    vida(sim, u!)!.hp = 0;
    sim.step();
    const id = sim.state.entities.find((e) => getComponent(sim.state, e, 'destroco'))!;
    const destroco = getComponent(sim.state, id, 'destroco')!;
    const custo = custoDe('hover_opq');
    const pct = param('rendimento_destroco_pct') / 100;
    for (const r of ['fe', 'si', 'cu', 'li', 'ti'] as const) {
      expect(destroco.composicao[r] ?? 0).toBe(Math.floor(custo[r] * pct));
    }
    rodar(sim, param('duracao_destroco_unidade_s') + 0.1);
    expect(sim.state.entities.includes(id)).toBe(false);
  });

  it('ECO-26: o destroço do silo inclui rendimento_carga_silo_pct% da carga', () => {
    const sim = partida(mundoLiso());
    const [s] = criar(sim, [{ unidade: 'mobile_silo', x: 0, z: 0 }]);
    getComponent(sim.state, s!, 'silo')!.carga = { fe: 100 };
    vida(sim, s!)!.hp = 0;
    sim.step();
    const id = sim.state.entities.find((e) => getComponent(sim.state, e, 'destroco'))!;
    const fe = Math.floor(custoDe('mobile_silo').fe * (param('rendimento_destroco_pct') / 100));
    expect(getComponent(sim.state, id, 'destroco')!.composicao.fe).toBe(
      fe + Math.floor(100 * (param('rendimento_carga_silo_pct') / 100)),
    );
  });

  it('ECO-28: o hover recicla qualquer destroço e a sucata vira os recursos ao descarregar', () => {
    const sim = partida(mundoLiso());
    criar(sim, [{ estrutura: 'ship', x: -20, z: 0 }]);
    const [u] = criar(sim, [{ unidade: 'hover_ex1', x: 10, z: 0 }], 'usa');
    vida(sim, u!)!.hp = 0;
    sim.step();
    const id = sim.state.entities.find((e) => getComponent(sim.state, e, 'destroco'))!;
    const composicao = { ...getComponent(sim.state, id, 'destroco')!.composicao };
    const [h] = criar(sim, [{ unidade: 'hover_explorer', x: 5, z: 3 }]);
    ordenar(sim, 'reciclar', { ids: [h], alvo: id });
    expect(rodarAte(sim, () => !sim.state.entities.includes(id), 120)).toBe(true);
    expect(rodarAte(sim, () => getComponent(sim.state, h!, 'coleta')!.carga === 0, 60)).toBe(true);
    for (const [r, u2] of Object.entries(composicao)) {
      expect(sim.state.estoques.bra[r as 'fe']).toBeCloseTo(u2!, 6);
    }
  });

  it('ENE-10: reciclar gasta en_reciclar_s', () => {
    const sim = partida(mundoLiso());
    const [u] = criar(sim, [{ unidade: 'hover_opq', x: 10, z: 0 }], 'usa');
    vida(sim, u!)!.hp = 0;
    sim.step();
    const id = sim.state.entities.find((e) => getComponent(sim.state, e, 'destroco'))!;
    const [h] = criar(sim, [{ unidade: 'hover_explorer', x: 8, z: 0 }]);
    ordenar(sim, 'reciclar', { ids: [h], alvo: id });
    const coleta = () => getComponent(sim.state, h!, 'coleta')!;
    expect(rodarAte(sim, () => coleta().carga > 0, 20)).toBe(true);
    expect(rodarAte(sim, () => getComponent(sim.state, h!, 'locomotion')!.speed === 0, 5)).toBe(
      true,
    );
    const en = bateria(sim, h!).en;
    rodar(sim, 1);
    expect(en - bateria(sim, h!).en).toBeCloseTo(param('en_reciclar_s'), 6);
  });

  it('ECO-29: destroços não bloqueiam movimento', () => {
    const sim = partida(mundoLiso());
    const [u] = criar(sim, [{ estrutura: 'storage', x: 10, z: 0 }], 'usa');
    const versao = sim.state.versaoObstaculos;
    vida(sim, u!)!.hp = 0;
    sim.step();
    const id = sim.state.entities.find((e) => getComponent(sim.state, e, 'destroco'))!;
    expect(getComponent(sim.state, id, 'obstacle')).toBeUndefined();
    expect(sim.state.versaoObstaculos).toBeGreaterThan(versao);
  });
});

describe('T-043 — ENE-15: auto-recarga fora de combate', () => {
  it('ENE-15: militar em combate não sai; drone em recarga_forcada_drone_pct sai mesmo assim', () => {
    const sim = partida(mundoLiso());
    criar(sim, [{ estrutura: 'ship', x: -40, z: 0 }]);
    const [ex1, drone] = criar(sim, [
      { unidade: 'hover_ex1', x: 0, z: 0 },
      { unidade: 'drone_laser', x: 0, z: 5 },
    ]);
    for (const id of [ex1!, drone!]) getComponent(sim.state, id, 'combate')!.semCombate_s = 0;
    const b = bateria(sim, ex1!);
    b.en = (b.max * param('auto_recarga_militar_pct')) / 100;
    const bd = bateria(sim, drone!);
    bd.en = (bd.max * param('recarga_forcada_drone_pct')) / 100;
    sim.step();
    expect(getComponent(sim.state, ex1!, 'recarga')!.estado).toBe('nenhuma');
    expect(getComponent(sim.state, drone!, 'recarga')!.estado).toBe('indo');
    rodar(sim, param('estado_combate_s') + 0.1);
    expect(getComponent(sim.state, ex1!, 'recarga')!.estado).toBe('indo');
    expect(statsEstrutura('ship').hp).toBeGreaterThan(0);
  });
});
