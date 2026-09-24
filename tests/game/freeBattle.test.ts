import { describe, expect, it } from 'vitest';
import { createSim, dados } from '../../src/sim';
import {
  comandosDeInicio,
  configPadrao,
  resolver,
  validar,
  type ConfigFreeBattle,
} from '../../src/game/freeBattle';
import { comandosDoJogo, sistemasDoJogo } from '../../src/sim/units';
import { mundoLua } from '../sim/mundo-teste';

const com = (mudar: Partial<ConfigFreeBattle>): ConfigFreeBattle => ({
  ...configPadrao(),
  ...mudar,
});

describe('T-104 — §16, FB-01 a FB-04: configuração de Free Battle', () => {
  it('§16: os padrões vêm de dados:free_battle', () => {
    const c = configPadrao();
    const padrao = (o: string) => dados.free_battle.find((l) => l.opcao === o)!.padrao;
    expect(c.nacaoJogador).toBe(padrao('nacao_jogador'));
    expect(c.oponentes).toHaveLength(Number(padrao('num_oponentes')));
    expect(c.oponentes[0]!.dificuldade).toBe(padrao('dificuldade_oponente'));
    expect(c.tamanho).toBe(padrao('tamanho_mapa'));
    expect(c.nevoa).toBe(padrao('nevoa'));
    expect(c.tempoLimiteMin).toBe(Number(padrao('tempo_limite_min')));
    expect(c.velocidade).toBe(1);
    // "preset do tamanho"
    expect(c.mapa).toBe('mare_tranquillitatis');
    expect(validar(c)).toEqual([]);
  });

  it('FB-03: o tamanho respeita min e max de jogadores de dados:tamanhos_mapa', () => {
    const tres = [0, 1, 2].map(() => ({ nacao: 'aleatoria' as const, dificuldade: 'normal' }));
    expect(
      validar(com({ tamanho: 'p', mapa: 'mare_imbrium', oponentes: tres.slice(0, 1) })),
    ).toEqual([]);
    expect(
      validar(com({ tamanho: 'p', mapa: 'mare_imbrium', oponentes: tres.slice(0, 2) }))[0],
    ).toMatchObject({
      campo: 'tamanho',
      motivo: 'fb.invalido.muitos',
    });
    expect(
      validar(com({ tamanho: 'g', mapa: 'oceanus_procellarum', oponentes: tres.slice(0, 1) }))[0],
    ).toMatchObject({
      campo: 'tamanho',
      motivo: 'fb.invalido.poucos',
    });
  });

  it('FB-03: preset de outro tamanho, zona fora do mapa e nação repetida são inválidos', () => {
    expect(validar(com({ mapa: 'mare_imbrium' })).map((p) => p.campo)).toEqual(['mapa']);
    expect(validar(com({ zonaPouso: 4 })).map((p) => p.campo)).toEqual(['zonaPouso']);
    expect(
      validar(
        com({ nacaoJogador: 'usa', oponentes: [{ nacao: 'usa', dificuldade: 'facil' }] }),
      ).map((p) => p.campo),
    ).toEqual(['oponentes']);
  });

  it('FB-04: cada oponente tem nação e dificuldade próprias; as aleatórias não repetem', () => {
    const c = com({
      nacaoJogador: 'aleatoria',
      tamanho: 'm',
      oponentes: [
        { nacao: 'rus', dificuldade: 'facil' },
        { nacao: 'aleatoria', dificuldade: 'brutal' },
        { nacao: 'aleatoria', dificuldade: 'normal' },
      ],
    });
    for (let seed = 1; seed <= 20; seed++) {
      const p = resolver(c, seed);
      expect(new Set(p.nacoes).size).toBe(4);
      expect(p.nacoes[1]).toBe('rus');
      expect(p.ias.rus).toBe('facil');
      expect(p.ias[p.nacoes[2]!]).toBe('brutal');
      expect(p.ias[p.jogador]).toBeUndefined();
      expect(new Set(p.zonas).size).toBe(4);
    }
    expect(resolver(c, 7)).toEqual(resolver(c, 7));
  });

  it('FB-02: a zona escolhida é do jogador; as IAs sorteiam as restantes', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const p = resolver(com({ zonaPouso: 3 }), seed);
      expect(p.zonas[0]).toBe(3);
      expect(p.zonas[1]).not.toBe(3);
    }
  });

  it('§16/REG-12: tempo limite só com a condição "tempo_limite"; mapa aleatório sorteia a seed', () => {
    expect(resolver(com({}), 1).tempoLimite_s).toBeNull();
    expect(resolver(com({ vitoria: 'tempo_limite', tempoLimiteMin: 20 }), 1).tempoLimite_s).toBe(
      1200,
    );
    const a = resolver(com({ mapa: 'aleatoria' }), 1).mapa.seed;
    const b = resolver(com({ mapa: 'aleatoria' }), 2).mapa.seed;
    expect(a).not.toBe(b);
    expect(resolver(com({}), 1).mapa.seed).toBe(24);
  });

  it('REG-04/§16: os comandos de início montam a partida com estoque, névoa e IAs', () => {
    const pronto = mundoLua();
    const p = resolver(
      com({ recursos: 'alto', nevoa: 'explorado', vitoria: 'tempo_limite', tempoLimiteMin: 30 }),
      3,
    );
    const sim = createSim(1, p.nacoes, {
      mundo: pronto,
      systems: sistemasDoJogo,
      commandHandlers: comandosDoJogo,
    });
    for (const c of comandosDeInicio(p, pronto)) sim.enqueue(c);
    sim.step();
    const alto = dados.estoque_inicial.find((l) => l.modo === 'alto')!;
    expect(sim.state.estoques[p.jogador]!.fe).toBe(alto.fe);
    expect(sim.state.modoNevoa).toBe('explorado');
    expect(sim.state.tempoLimite_s).toBe(1800);
    expect(Object.keys(sim.state.ias)).toEqual([p.nacoes[1]]);
  });
});
