/**
 * Fim de Partida (FLX-12, REG-22, REG-23): o resultado para o jogador e as estatísticas de cada
 * nação, lidas do estado da simulação (só leitura).
 */
import { type NacaoId, type SimState } from '../sim';
import type { EstatisticasDaNacao } from '../sim/core/estatisticas';
import { pontuacao } from '../sim/combate/morte';
import { ESCURO } from '../sim/visao/nevoa';

export type Resultado = 'vitoria' | 'derrota' | 'empate';

export interface LinhaDoFim {
  nacao: NacaoId;
  eliminada: boolean;
  pontuacao: number;
  coletado: Record<string, number>;
  energiaGerada: number;
  energiaConsumida: number;
  impressas: Record<string, number>;
  perdidas: Record<string, number>;
  destruidas: Record<string, number>;
  construidas: Record<string, number>;
  estruturasPerdidas: Record<string, number>;
  /** % das células do mapa fora do escuro absoluto. */
  exploradoPct: number;
  acoesPorMinuto: number;
}

export interface FimDaPartida {
  resultado: Resultado;
  motivo: 'eliminacao' | 'tempo' | 'rendicao';
  duracao_s: number;
  /** O jogador primeiro, depois as outras nações na ordem da partida. */
  linhas: LinhaDoFim[];
}

/**
 * Resultado para o jogador: a partida acabou (REG-11/REG-12) ou ele foi eliminado (REG-09,
 * REG-13) enquanto as outras seguem. Null enquanto ele ainda joga.
 */
export function resultadoDoJogador(state: SimState, jogador: NacaoId): Resultado | null {
  const r = state.resultado;
  if (r) return r.vencedor === null ? 'empate' : r.vencedor === jogador ? 'vitoria' : 'derrota';
  return state.placar[jogador]?.eliminada ? 'derrota' : null;
}

const soma = (t: Record<string, number>) => Object.values(t).reduce((s, v) => s + v, 0);
export const total = soma;

export function fimDaPartida(
  state: SimState,
  jogador: NacaoId,
  tickHz: number,
  rendeu = false,
): FimDaPartida | null {
  const resultado = resultadoDoJogador(state, jogador);
  if (!resultado) return null;
  const tick = state.resultado?.tick ?? state.tick;
  const duracao_s = tick / tickHz;
  const minutos = Math.max(duracao_s / 60, 1 / 60);
  const ordem = [jogador, ...state.nacoes.filter((n) => n !== jogador)];
  const linhas = ordem.map((nacao): LinhaDoFim => {
    const e: EstatisticasDaNacao | undefined = state.estatisticas[nacao];
    const grade = state.nevoa[nacao] ?? [];
    const explorado =
      grade.length > 0 ? grade.filter((c) => c !== ESCURO).length / grade.length : 0;
    return {
      nacao,
      eliminada: state.placar[nacao]?.eliminada ?? false,
      pontuacao: Math.round(pontuacao(state, nacao)),
      coletado: { ...(e?.coletado ?? {}) },
      energiaGerada: e?.energiaGerada ?? 0,
      energiaConsumida: e?.energiaConsumida ?? 0,
      impressas: { ...(e?.impressas ?? {}) },
      perdidas: { ...(e?.perdidas ?? {}) },
      destruidas: { ...(e?.destruidas ?? {}) },
      construidas: { ...(e?.construidas ?? {}) },
      estruturasPerdidas: { ...(e?.estruturasPerdidas ?? {}) },
      exploradoPct: Math.round(explorado * 100),
      acoesPorMinuto: Math.round((e?.acoes ?? 0) / minutos),
    };
  });
  const motivo = rendeu ? 'rendicao' : (state.resultado?.motivo ?? 'eliminacao');
  return { resultado, motivo, duracao_s, linhas };
}
