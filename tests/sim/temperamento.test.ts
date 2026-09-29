import { describe, expect, it } from 'vitest';
import { getComponent, param, type Sim, type SimEvent } from '../../src/sim';
import { ATIVAR_IA_COMMAND } from '../../src/sim/ia';
import { INICIAR_PARTIDA_COMMAND } from '../../src/sim/producao';
import {
  DECLARAR_GUERRA_COMMAND,
  emGuerra,
  temperamento,
} from '../../src/sim/relacoes/temperamento';
import { criar, mundoLiso, ordenar, partida, ponto, pos } from './mundo-teste';

/** Partida com as nações em paz (o padrão dos testes é guerra). */
const emPaz = () => partida(mundoLiso(), ['bra', 'usa'], 'lua', false);
function rodar(sim: Sim, s: number, eventos?: SimEvent[]) {
  for (let t = 0; t < Math.round(s * sim.tickHz); t++) {
    const novos = sim.step();
    eventos?.push(...novos);
  }
}
const alertas = (eventos: SimEvent[], id: string) =>
  eventos
    .filter((e) => e.tipo === 'alerta' && (e.dados as { id: string }).id === id)
    .map((e) => e.dados);

describe('T-164 — REG-24 a REG-28, CMB-29, IA-11, D-81: temperamento e domínio', () => {
  it('REG-24: a partida começa com todos pacíficos', () => {
    const sim = emPaz();
    rodar(sim, 1);
    expect(temperamento(sim.state, 'bra', 'usa')).toBe('pacifico');
    expect(emGuerra(sim.state, 'bra', 'usa')).toBe(false);
  });

  it('REG-25/REG-26: no domínio de uma IA, o aviso é na hora; ficar além de ultimato_s vira guerra', () => {
    const sim = emPaz();
    // O domínio é da IA (usa); quem invade é o jogador (bra).
    ordenar(sim, ATIVAR_IA_COMMAND, { nivel: 'normal' }, 'usa');
    criar(sim, [{ estrutura: 'storage', x: 0, z: 0 }], 'usa');
    const eventos: SimEvent[] = [];
    // A menos de dominio_estrutura_m do Armazém.
    criar(sim, [{ unidade: 'hover_explorer', x: param('dominio_estrutura_m') - 10, z: 0 }]);
    rodar(sim, 1, eventos);
    expect(temperamento(sim.state, 'usa', 'bra')).toBe('alerta');
    expect(alertas(eventos, 'AL-19')).toEqual([
      expect.objectContaining({ nacao: 'bra', outra: 'usa' }),
    ]);
    rodar(sim, param('ultimato_s') - 2, eventos);
    expect(emGuerra(sim.state, 'bra', 'usa')).toBe(false);
    rodar(sim, 2, eventos);
    expect(emGuerra(sim.state, 'bra', 'usa')).toBe(true);
    expect(temperamento(sim.state, 'bra', 'usa')).toBe('inimigo');
    expect(alertas(eventos, 'AL-20')).toHaveLength(2);
  });

  it('REG-26: quem sai antes do prazo volta à paz', () => {
    const sim = emPaz();
    criar(sim, [{ estrutura: 'storage', x: 0, z: 0 }]);
    const [h] = criar(sim, [{ unidade: 'hover_scout', x: 50, z: 0 }], 'usa');
    rodar(sim, 1);
    expect(temperamento(sim.state, 'bra', 'usa')).toBe('alerta');
    // Longe o bastante do domínio (dá a volta pelo norte).
    ordenar(
      sim,
      'mover',
      { ids: [h], x: ponto(130, 0)[0], y: ponto(130, 0)[1], z: ponto(130, 0)[2] },
      'usa',
    );
    rodar(sim, param('ultimato_s') + 5);
    expect(pos(sim, h!).x).toBeGreaterThan(param('dominio_estrutura_m'));
    expect(emGuerra(sim.state, 'bra', 'usa')).toBe(false);
    expect(temperamento(sim.state, 'bra', 'usa')).toBe('pacifico');
  });

  it('REG-25: unidade solta tem domínio de dominio_unidade_m', () => {
    const perto = emPaz();
    criar(perto, [{ unidade: 'hover_explorer', x: 0, z: 0 }]);
    criar(perto, [{ unidade: 'hover_explorer', x: param('dominio_unidade_m') - 5, z: 0 }], 'usa');
    rodar(perto, 1);
    expect(temperamento(perto.state, 'bra', 'usa')).toBe('alerta');
    const longe = emPaz();
    criar(longe, [{ unidade: 'hover_explorer', x: 0, z: 0 }]);
    criar(longe, [{ unidade: 'hover_explorer', x: param('dominio_unidade_m') + 5, z: 0 }], 'usa');
    rodar(longe, 1);
    expect(temperamento(longe.state, 'bra', 'usa')).toBe('pacifico');
  });

  it('REG-27/CMB-15: a ordem direta contra nação pacífica dispara e o primeiro dano abre a guerra', () => {
    const sim = emPaz();
    const [ex1] = criar(sim, [{ unidade: 'hover_ex1', x: 0, z: 0 }]);
    // Fora do domínio de unidade um do outro, mas dentro da visão do EX1 (atacar exige ver).
    const [alvo] = criar(
      sim,
      [{ unidade: 'printer', x: param('dominio_unidade_m') + 1, z: 0 }],
      'usa',
    );
    ordenar(sim, 'atacar', { ids: [ex1], alvo });
    const eventos: SimEvent[] = [];
    rodar(sim, 3, eventos);
    expect(eventos.some((e) => e.tipo === 'dano')).toBe(true);
    expect(emGuerra(sim.state, 'bra', 'usa')).toBe(true);
  });

  it('CMB-29: em paz (e no alerta) a Torre não dispara sozinha; em guerra, dispara', () => {
    const sim = emPaz();
    // A Torre precisa da rede (ENE-28): a Nave ao lado, ligada por cabo.
    criar(sim, [{ estrutura: 'ship', x: -20, z: 0 }]);
    criar(sim, [{ estrutura: 'laser_tower', x: 0, z: 0 }]);
    criar(sim, [{ unidade: 'hover_explorer', x: 12, z: 0 }], 'usa');
    const eventos: SimEvent[] = [];
    rodar(sim, param('ultimato_s') + 5, eventos);
    expect(eventos.some((e) => e.tipo === 'disparo')).toBe(false);
    ordenar(sim, DECLARAR_GUERRA_COMMAND, { nacao: 'usa' });
    rodar(sim, 3, eventos);
    expect(emGuerra(sim.state, 'bra', 'usa')).toBe(true);
    expect(eventos.some((e) => e.tipo === 'disparo')).toBe(true);
  });

  it('REG-28: sem dano e fora dos domínios por guerra_esfria_s, a guerra vira paz', () => {
    const sim = partida(mundoLiso(), ['bra', 'usa']);
    criar(sim, [{ estrutura: 'storage', x: 0, z: 0 }]);
    criar(sim, [{ estrutura: 'storage', x: 100, z: 0 }], 'usa');
    expect(emGuerra(sim.state, 'bra', 'usa')).toBe(true);
    const eventos: SimEvent[] = [];
    rodar(sim, param('guerra_esfria_s') - 2, eventos);
    expect(emGuerra(sim.state, 'bra', 'usa')).toBe(true);
    rodar(sim, 3, eventos);
    expect(emGuerra(sim.state, 'bra', 'usa')).toBe(false);
    expect(alertas(eventos, 'AL-21')).toHaveLength(2);
  });

  it('IA-11: a IA avisada recolhe a unidade do domínio alheio e não entra em guerra', () => {
    const sim = emPaz();
    ordenar(sim, INICIAR_PARTIDA_COMMAND, {
      modo: 'padrao',
      nacoes: [
        { nacao: 'bra', zona: ponto(0, 0) },
        { nacao: 'usa', zona: ponto(0, 130) },
      ],
    });
    ordenar(sim, ATIVAR_IA_COMMAND, { nivel: 'normal' }, 'usa');
    rodar(sim, 1);
    const [intruso] = criar(sim, [{ unidade: 'hover_scout', x: 20, z: 0 }], 'usa');
    rodar(sim, param('ultimato_s') + 10);
    expect(emGuerra(sim.state, 'bra', 'usa')).toBe(false);
    expect(getComponent(sim.state, intruso!, 'unit')).toBeDefined();
  });
});

describe('T-175 — REG-26, REG-29, IA-12, D-88: domínio do jogador e Declarar guerra', () => {
  it('REG-26: estrutura nunca invade (não pode sair)', () => {
    const sim = emPaz();
    criar(sim, [{ estrutura: 'storage', x: 0, z: 0 }]);
    criar(sim, [{ estrutura: 'storage', x: param('dominio_estrutura_m') - 20, z: 0 }], 'usa');
    rodar(sim, param('ultimato_s') + 5);
    expect(temperamento(sim.state, 'bra', 'usa')).toBe('pacifico');
    expect(temperamento(sim.state, 'usa', 'bra')).toBe('pacifico');
  });

  it('REG-25: o domínio de uma unidade não vale dentro da base alheia', () => {
    const sim = emPaz();
    criar(sim, [
      { estrutura: 'storage', x: 0, z: 0 },
      { unidade: 'hover_explorer', x: 20, z: 0 },
    ]);
    // O batedor alheio encosta no hover do jogador, dentro da base dele.
    criar(sim, [{ unidade: 'hover_scout', x: 24, z: 0 }], 'usa');
    rodar(sim, 1);
    expect(temperamento(sim.state, 'bra', 'usa')).toBe('alerta');
    // O jogador não é intruso: ninguém pede que ele saia.
    expect(temperamento(sim.state, 'usa', 'bra')).toBe('pacifico');
  });

  it('REG-26: no domínio do jogador há AL-22 e aviso, mas nunca guerra automática', () => {
    const sim = emPaz();
    criar(sim, [{ estrutura: 'storage', x: 0, z: 0 }]);
    criar(sim, [{ unidade: 'hover_scout', x: param('dominio_estrutura_m') - 10, z: 0 }], 'usa');
    const eventos: SimEvent[] = [];
    rodar(sim, 1, eventos);
    expect(temperamento(sim.state, 'bra', 'usa')).toBe('alerta');
    expect(alertas(eventos, 'AL-22')).toEqual([
      expect.objectContaining({ nacao: 'bra', outra: 'usa' }),
    ]);
    expect(alertas(eventos, 'AL-19')).toEqual([]);
    rodar(sim, 2 * param('ultimato_s'), eventos);
    expect(emGuerra(sim.state, 'bra', 'usa')).toBe(false);
    expect(alertas(eventos, 'AL-20')).toEqual([]);
  });

  it('REG-29: declarar_guerra abre a guerra na hora (AL-20 para os dois)', () => {
    const sim = emPaz();
    ordenar(sim, DECLARAR_GUERRA_COMMAND, { nacao: 'usa' });
    const eventos = sim.step();
    expect(emGuerra(sim.state, 'bra', 'usa')).toBe(true);
    expect(alertas(eventos, 'AL-20')).toHaveLength(2);
    // Contra si mesma ou nação desconhecida, nada.
    const outra = emPaz();
    ordenar(outra, DECLARAR_GUERRA_COMMAND, { nacao: 'bra' });
    ordenar(outra, DECLARAR_GUERRA_COMMAND, { nacao: 'xyz' });
    outra.step();
    expect(emGuerra(outra.state, 'bra', 'usa')).toBe(false);
  });

  it('IA-11/IA-12: o batedor da IA sai do domínio do jogador; a onda provocadora declara guerra no fim do prazo', () => {
    const sim = emPaz();
    ordenar(sim, INICIAR_PARTIDA_COMMAND, {
      modo: 'padrao',
      nacoes: [
        { nacao: 'bra', zona: ponto(0, 0) },
        { nacao: 'usa', zona: ponto(0, 130) },
      ],
    });
    ordenar(sim, ATIVAR_IA_COMMAND, { nivel: 'normal' }, 'usa');
    rodar(sim, 1);
    const [a, b] = criar(
      sim,
      [
        { unidade: 'hover_ex1', x: 20, z: 0 },
        { unidade: 'hover_ex1', x: 22, z: 0 },
      ],
      'usa',
    );
    const ia = sim.state.ias['usa']!;
    ia.onda = { vrInicial: 1, alvo: 'bra', ponto: ponto(20, 0), membros: [a!, b!] };
    rodar(sim, param('ultimato_s') + 3);
    expect(emGuerra(sim.state, 'bra', 'usa')).toBe(true);
  });
});
