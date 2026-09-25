import { describe, expect, it } from 'vitest';
import { getComponent, type SimEvent } from '../../src/sim';
import { CentralDeAlertas, MAX_VISIVEIS } from '../../src/game/alertas';
import { dados } from '../../src/sim/data';
import { criar, mundoLiso, partida } from '../sim/mundo-teste';

const cooldown = (id: string) => dados.alertas.find((a) => a.id === id)!.cooldown_s;
const evento = (tipo: string, dadosDo: Record<string, unknown>): SimEvent => ({
  tick: 0,
  tipo,
  dados: dadosDo as never,
});

describe('T-084 — UI-06, AUD-05, dados:alertas', () => {
  it('AUD-05: o mesmo alerta respeita o cooldown_s; alertas de outra nação não entram', () => {
    const sim = partida(mundoLiso());
    const central = new CentralDeAlertas({ jogador: 'bra', naTela: () => false });
    const al18 = evento('alerta', {
      id: 'AL-18',
      nacao: 'bra',
      unidade: 'hover_ex1',
      d: [1, 0, 0],
    });
    expect(central.processar([al18], sim.state, 0)).toHaveLength(1);
    expect(central.processar([al18], sim.state, cooldown('AL-18') - 0.5)).toHaveLength(0);
    expect(central.processar([al18], sim.state, cooldown('AL-18') + 0.1)).toHaveLength(1);
    const outro = evento('alerta', { id: 'AL-16', nacao: 'usa' });
    expect(central.processar([outro], sim.state, 100)).toHaveLength(0);
    // O local do evento vem junto (o clique leva a câmera).
    expect(central.pilha[0]!.local).toEqual([1, 0, 0]);
  });

  it('AL-14/AL-01/AL-02: Nave sempre; unidade e estrutura só fora da tela', () => {
    const sim = partida(mundoLiso());
    const [nave, torre, ex1] = criar(sim, [
      { estrutura: 'ship', x: 0, z: 0 },
      { estrutura: 'laser_tower', x: 30, z: 0 },
      { unidade: 'hover_ex1', x: 0, z: 30 },
    ]);
    let naTela = true;
    const central = new CentralDeAlertas({ jogador: 'bra', naTela: () => naTela });
    const dano = (alvo: number) => evento('dano', { alvo, atacante: null, dano: 5, tipo: 'laser' });
    expect(
      central.processar([dano(nave!), dano(torre!), dano(ex1!)], sim.state, 0).map((a) => a.id),
    ).toEqual(['AL-14']);
    naTela = false;
    expect(central.processar([dano(torre!), dano(ex1!)], sim.state, 100).map((a) => a.id)).toEqual([
      'AL-02',
      'AL-01',
    ]);
  });

  it('AL-04/AL-08/AL-09/AL-05: déficit, Reserva, hover ocioso e impressão concluída', () => {
    const sim = partida(mundoLiso());
    const [ex1, hover] = criar(sim, [
      { unidade: 'hover_ex1', x: 0, z: 0 },
      { unidade: 'hover_explorer', x: 10, z: 0 },
    ]);
    const central = new CentralDeAlertas({ jogador: 'bra', naTela: () => true });
    // Já ocioso ao começar a observar: não alerta; a mudança é que alerta.
    getComponent(sim.state, hover!, 'coleta')!.estado = 'minerando';
    central.processar([], sim.state, 0);
    sim.state.energia.bra!.racionamento = true;
    getComponent(sim.state, ex1!, 'bateria')!.en = 0;
    getComponent(sim.state, hover!, 'coleta')!.estado = 'ocioso';
    getComponent(sim.state, hover!, 'order')!.tipo = 'nenhuma';
    getComponent(sim.state, hover!, 'locomotion')!.destino = null;
    const novos = central.processar(
      [evento('impresso', { id: ex1, tipo: 'hover_ex1', nacao: 'bra', produtor: 0 })],
      sim.state,
      1,
    );
    expect(novos.map((a) => a.id).sort()).toEqual(['AL-04', 'AL-05', 'AL-08', 'AL-09']);
    expect(novos.find((a) => a.id === 'AL-08')!.vars.n).toBe(1);
    // Continuar em déficit não repete o alerta.
    expect(central.processar([], sim.state, 100).map((a) => a.id)).toEqual([]);
  });

  it('UI-06: até 5 visíveis, o mais recente primeiro', () => {
    const sim = partida(mundoLiso());
    const central = new CentralDeAlertas({ jogador: 'bra', naTela: () => true });
    const ids = ['AL-05', 'AL-07', 'AL-12', 'AL-13', 'AL-16', 'AL-18'];
    ids.forEach((id, k) =>
      central.processar([evento('alerta', { id, nacao: 'bra' })], sim.state, k),
    );
    const visiveis = central.visiveis(6, 10);
    expect(visiveis).toHaveLength(MAX_VISIVEIS);
    expect(visiveis[0]!.id).toBe('AL-18');
    expect(central.visiveis(30, 10)).toHaveLength(0);
  });
});
