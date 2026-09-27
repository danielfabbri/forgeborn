/**
 * Partida headless IA × IA (TEC-25): mapa lunar M da seed, início de partida (REG-04), jazidas
 * da distribuição (CEN-10) e uma IA por nação (§13), até a vitória (REG-11) ou `maxMin`.
 */
import { performance } from 'node:perf_hooks';
import { createSim, dados, type NacaoId, type Sim } from '../../src/sim';
import type { CenariosId } from '../../src/sim/data';
import { SEMEAR_JAZIDAS_COMMAND } from '../../src/sim/economia';
import { ATIVAR_IA_COMMAND } from '../../src/sim/ia';
import { gerarMapaValido } from '../../src/sim/map/validacao';
import { INICIAR_PARTIDA_COMMAND } from '../../src/sim/producao';
import { comandosDoJogo, sistemasDoJogo } from '../../src/sim/units';

export interface MatchOptions {
  seed: number;
  /** Nível de cada IA participante (colunas de `dados:dificuldade`). */
  ias: string[];
  /** Duração máxima em minutos de jogo. */
  maxMin: number;
  /** Nações de cada IA (padrão: as primeiras de `dados:nacoes`). */
  nacoes?: NacaoId[];
  /** Cenário (padrão: Lua). */
  cenario?: CenariosId;
}

export interface MatchResult {
  seed: number;
  nacoes: NacaoId[];
  ias: string[];
  ticks: number;
  minutos_simulados: number;
  hash: string;
  tick_medio_ms: number;
  tick_max_ms: number;
  vencedor: NacaoId | null;
  observacao: string;
}

export function niveisDeIa(): string[] {
  const primeira = dados.dificuldade[0];
  return primeira ? Object.keys(primeira).filter((coluna) => coluna !== 'parametro') : [];
}

/** Monta a partida (mapa, início, jazidas e IAs) sem rodar. */
export function criarPartida({
  seed,
  ias,
  maxMin,
  nacoes: escolhidas,
  cenario = 'lua',
}: MatchOptions): {
  sim: Sim;
  nacoes: NacaoId[];
} {
  const niveis = niveisDeIa();
  const invalidos = ias.filter((ia) => !niveis.includes(ia));
  if (invalidos.length > 0) {
    throw new Error(`Nível de IA desconhecido: ${invalidos.join(', ')} (use ${niveis.join(', ')})`);
  }
  const maxNacoes = dados.nacoes.length;
  if (ias.length < 2 || ias.length > maxNacoes) {
    throw new Error(`Uma partida tem de 2 a ${maxNacoes} nações (REG-01); recebi ${ias.length}`);
  }
  if (!(maxMin > 0)) throw new Error(`Duração inválida: ${maxMin} min`);

  const nacoes = escolhidas ?? dados.nacoes.slice(0, ias.length).map((nacao) => nacao.id);
  const pronto = gerarMapaValido(seed, 'm', ias.length > 2 ? 4 : 2, cenario);
  const sim = createSim(seed, nacoes, {
    cenario,
    mundo: pronto,
    systems: sistemasDoJogo,
    commandHandlers: comandosDoJogo,
  });
  const zonas = pronto.mapa.zonasDePouso;
  sim.enqueue({
    tick: 0,
    nacao: nacoes[0]!,
    tipo: SEMEAR_JAZIDAS_COMMAND,
    dados: pronto.jazidas.jazidas.map((j) => ({
      recurso: j.recurso,
      quantidade: j.quantidade,
      d: j.d,
    })) as never,
  });
  sim.enqueue({
    tick: 0,
    nacao: nacoes[0]!,
    tipo: INICIAR_PARTIDA_COMMAND,
    dados: {
      modo: 'padrao',
      nacoes: nacoes.map((nacao, k) => ({
        nacao,
        zona: zonas[Math.floor((k * zonas.length) / nacoes.length)]!.d,
      })),
    } as never,
  });
  nacoes.forEach((nacao, k) => {
    sim.enqueue({ tick: 0, nacao, tipo: ATIVAR_IA_COMMAND, dados: { nivel: ias[k]! } as never });
  });
  return { sim, nacoes };
}

export function runMatch(opcoes: MatchOptions): MatchResult {
  const { seed, ias, maxMin } = opcoes;
  const { sim, nacoes } = criarPartida(opcoes);

  const ticks = Math.round(maxMin * 60 * sim.tickHz);
  let total = 0;
  let maximo = 0;
  let feitos = 0;
  for (; feitos < ticks && !sim.state.resultado; feitos++) {
    const inicio = performance.now();
    sim.step();
    const duracao = performance.now() - inicio;
    total += duracao;
    if (duracao > maximo) maximo = duracao;
  }

  const resultado = sim.state.resultado;
  return {
    seed,
    nacoes,
    ias,
    ticks: feitos,
    minutos_simulados: feitos / sim.tickHz / 60,
    hash: sim.hash(),
    tick_medio_ms: feitos > 0 ? total / feitos : 0,
    tick_max_ms: maximo,
    vencedor: resultado?.vencedor ?? null,
    observacao: resultado
      ? `Fim por ${resultado.motivo} aos ${(resultado.tick / sim.tickHz / 60).toFixed(1)} min.`
      : 'Sem vencedor no tempo máximo.',
  };
}
