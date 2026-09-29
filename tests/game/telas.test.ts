import { describe, expect, it } from 'vitest';
import { normalizar, PADRAO, PRESETS_GRAFICOS } from '../../src/game/configuracoes';
import { fimDaPartida, resultadoDoJogador } from '../../src/game/fimDePartida';
import { configPadrao } from '../../src/game/freeBattle';
import { lerPartidaDaUrl } from '../../src/game/navegacao';
import { ESCURO, NEVOA } from '../../src/sim/visao/nevoa';
import { criar, mundoLiso, ordenar, partida } from '../sim/mundo-teste';

describe('T-102 — FLX-13, TEC-19: configurações', () => {
  it('D-36: padrões e normalização do que vem do armazenamento', () => {
    expect(normalizar(undefined)).toEqual(PADRAO);
    expect(normalizar({ grafico: 'ultra', escalaInterface: 400 })).toMatchObject({
      grafico: 'ultra',
      escalaInterface: 150,
    });
    expect(normalizar({ grafico: 'xx', escalaInterface: 10, rolagemPelasBordas: 'sim' })).toEqual({
      ...PADRAO,
      escalaInterface: 80,
    });
  });

  it('TEC-19: os presets crescem em resolução e sombras; Baixo não tem sombras', () => {
    expect(PRESETS_GRAFICOS.baixo.sombra).toBe(0);
    const ordem = [
      PRESETS_GRAFICOS.baixo,
      PRESETS_GRAFICOS.medio,
      PRESETS_GRAFICOS.alto,
      PRESETS_GRAFICOS.ultra,
    ];
    for (let k = 1; k < ordem.length; k++) {
      expect(ordem[k]!.escala).toBeGreaterThan(ordem[k - 1]!.escala);
      expect(ordem[k]!.sombra).toBeGreaterThan(ordem[k - 1]!.sombra);
      expect(ordem[k]!.lod).toBeGreaterThan(ordem[k - 1]!.lod);
      expect(ordem[k]!.particulas).toBeGreaterThan(ordem[k - 1]!.particulas);
    }
    // ART-08: SSAO a partir do Alto.
    expect(ordem.map((p) => p.ssao)).toEqual([false, false, true, true]);
  });
});

describe('T-104 — FLX-14: a partida vai na URL', () => {
  it('FLX-14: lê configuração e seed; configuração inválida não inicia', () => {
    const config = configPadrao();
    const ok = new URLSearchParams({ partida: JSON.stringify({ config, seed: 9 }) });
    expect(lerPartidaDaUrl(ok)).toEqual({ config, seed: 9 });
    const ruim = new URLSearchParams({
      partida: JSON.stringify({
        config: { ...config, tamanho: 'p', oponentes: [{}, {}] },
        seed: 1,
      }),
    });
    expect(lerPartidaDaUrl(ruim)).toBeNull();
    expect(lerPartidaDaUrl(new URLSearchParams({ partida: '{' }))).toBeNull();
    expect(lerPartidaDaUrl(new URLSearchParams())).toBeNull();
  });
});

describe('T-106 — FLX-12, REG-13, REG-23: fim de partida', () => {
  it('REG-13: render-se é derrota na hora; o vencedor leva a vitória', () => {
    const sim = partida(mundoLiso(), ['bra', 'usa', 'chn']);
    criar(sim, [{ estrutura: 'ship', x: 0, z: 0 }], 'bra');
    criar(sim, [{ estrutura: 'ship', x: 0, z: 150 }], 'usa');
    criar(sim, [{ estrutura: 'ship', x: 150, z: 0 }], 'chn');
    sim.step();
    expect(resultadoDoJogador(sim.state, 'bra')).toBeNull();
    ordenar(sim, 'render_se', {}, 'bra');
    sim.step();
    // Com 3 nações a partida segue, mas o jogador já perdeu.
    expect(sim.state.resultado).toBeNull();
    expect(resultadoDoJogador(sim.state, 'bra')).toBe('derrota');
    ordenar(sim, 'render_se', {}, 'chn');
    sim.step();
    expect(resultadoDoJogador(sim.state, 'usa')).toBe('vitoria');
  });

  it('REG-23: duração, % explorado, ações por minuto e o jogador primeiro', () => {
    const sim = partida(mundoLiso(), ['bra', 'usa']);
    criar(sim, [{ estrutura: 'ship', x: 0, z: 0 }], 'bra');
    criar(sim, [{ estrutura: 'ship', x: 0, z: 150 }], 'usa');
    sim.run(sim.tickHz * 60 - 2);
    ordenar(sim, 'render_se', {}, 'usa');
    sim.step();
    sim.state.nevoa.bra = [ESCURO, NEVOA, NEVOA, ESCURO];
    sim.state.estatisticas.bra!.acoes = 30;
    const fim = fimDaPartida(sim.state, 'bra', sim.tickHz)!;
    expect(fim.resultado).toBe('vitoria');
    expect(fim.motivo).toBe('eliminacao');
    expect(fim.duracao_s).toBeCloseTo(60, 5);
    expect(fim.linhas.map((l) => l.nacao)).toEqual(['bra', 'usa']);
    expect(fim.linhas[0]!.exploradoPct).toBe(50);
    expect(fim.linhas[0]!.acoesPorMinuto).toBe(30);
    expect(fim.linhas[1]!.eliminada).toBe(true);
    expect(fim.linhas[0]!.pontuacao).toBeGreaterThan(fim.linhas[1]!.pontuacao);
  });
});
