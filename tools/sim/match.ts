/** Partida headless IA × IA (TEC-25). */
import { performance } from 'node:perf_hooks';
import { createSim, dados, type NacaoId } from '../../src/sim';

export interface MatchOptions {
  seed: number;
  /** Nível de cada IA participante (colunas de `dados:dificuldade`). */
  ias: string[];
  /** Duração máxima em minutos de jogo. */
  maxMin: number;
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

export function runMatch({ seed, ias, maxMin }: MatchOptions): MatchResult {
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

  const nacoes = dados.nacoes.slice(0, ias.length).map((nacao) => nacao.id);
  const sim = createSim(seed, nacoes);
  const ticks = Math.round(maxMin * 60 * sim.tickHz);

  let total = 0;
  let maximo = 0;
  for (let i = 0; i < ticks; i++) {
    const inicio = performance.now();
    sim.step();
    const duracao = performance.now() - inicio;
    total += duracao;
    if (duracao > maximo) maximo = duracao;
  }

  return {
    seed,
    nacoes,
    ias,
    ticks,
    minutos_simulados: ticks / sim.tickHz / 60,
    hash: sim.hash(),
    tick_medio_ms: ticks > 0 ? total / ticks : 0,
    tick_max_ms: maximo,
    vencedor: null,
    observacao: 'IA ainda não implementada (T-090): as nações não agem.',
  };
}
