/**
 * Diretiva de Coleta (ECO-18, ECO-19, ECO-21): hovers ociosos escolhem o recurso cuja fração
 * atual de hovers está mais abaixo do alvo, entre as jazidas elegíveis; em empate, a jazida
 * mais próxima.
 *
 * Elegível: jazida explorada a até `raio_diretiva_m` de um ponto de entrega. Até a névoa existir
 * (T-070), toda jazida conta como explorada.
 */
import { entitiesWith, getComponent } from '../core/entities';
import type { CommandHandler, SystemContext } from '../core/pipeline';
import type { EntityId, NacaoId } from '../core/types';
import { dados, param, type RecursosId } from '../data';
import { direcaoDe, distanciaM } from '../units/superficie';
import { designar } from './coleta';
import { pontosDeEntrega } from './estoque';
import { todasAsJazidas, vagasLivres } from './jazidas';

const RECURSOS = dados.recursos.map((r) => r.id);

/** Hovers da nação com o ciclo de coleta. */
function hoversDa(ctx: SystemContext, nacao: NacaoId): EntityId[] {
  return entitiesWith(ctx.state, 'coleta', 'owner').filter(
    (id) => getComponent(ctx.state, id, 'owner')!.nacao === nacao,
  );
}

/**
 * ECO-19: ocioso = sem jazida pela automação (recém-impresso, jazida esgotada sem alternativa)
 * ou parado por ordem do jogador há `hover_ocioso_alerta_s`.
 */
export function ociosos(ctx: SystemContext, nacao: NacaoId): EntityId[] {
  const alerta = param('hover_ocioso_alerta_s');
  return hoversDa(ctx, nacao).filter((id) => {
    const coleta = getComponent(ctx.state, id, 'coleta')!;
    if (coleta.estado !== 'ocioso') return false;
    // Construindo ou reparando (PRD-13, PRD-18): não está ocioso.
    if (getComponent(ctx.state, id, 'trabalho')) return false;
    const recarga = getComponent(ctx.state, id, 'recarga');
    if (recarga && recarga.estado !== 'nenhuma') return false;
    const ordem = getComponent(ctx.state, id, 'order')!.tipo;
    if (ordem === 'tarefa') return true;
    return ordem === 'nenhuma' && getComponent(ctx.state, id, 'locomotion')!.ocioso_s >= alerta;
  });
}

/** Jazidas elegíveis para a diretiva da nação (ECO-19). */
export function jazidasElegiveis(ctx: SystemContext, nacao: NacaoId): EntityId[] {
  const entregas = pontosDeEntrega(ctx, nacao);
  const raio = param('raio_diretiva_m');
  return todasAsJazidas(ctx).filter((id) => {
    const d = direcaoDe(getComponent(ctx.state, id, 'position')!);
    return entregas.some((e) => distanciaM(ctx, d, e.d) <= raio);
  });
}

/** ECO-21: recursos com alvo na diretiva mas sem jazida elegível ("sem jazida conhecida"). */
export function recursosSemJazida(ctx: SystemContext, nacao: NacaoId): RecursosId[] {
  const comJazida = new Set(
    jazidasElegiveis(ctx, nacao).map((id) => getComponent(ctx.state, id, 'jazida')!.recurso),
  );
  const alvo = ctx.state.diretivas[nacao]!;
  return RECURSOS.filter((r) => alvo[r] > 0 && !comJazida.has(r));
}

/** Distribui os hovers ociosos de cada nação pela diretiva. */
export function distribuirOciosos(ctx: SystemContext): void {
  for (const nacao of ctx.state.nacoes) {
    const livres = ociosos(ctx, nacao);
    if (livres.length === 0) continue;
    const elegiveis = jazidasElegiveis(ctx, nacao);
    if (elegiveis.length === 0) continue;
    const hovers = hoversDa(ctx, nacao);
    const total = hovers.length;
    const alvo = ctx.state.diretivas[nacao]!;
    const contagem = Object.fromEntries(RECURSOS.map((r) => [r, 0])) as Record<RecursosId, number>;
    for (const id of hovers) {
      const recurso = getComponent(ctx.state, id, 'coleta')!.recurso;
      if (recurso) contagem[recurso]++;
    }
    const recursoDe = (j: EntityId) => getComponent(ctx.state, j, 'jazida')!.recurso;
    for (const hover of livres) {
      const dh = direcaoDe(getComponent(ctx.state, hover, 'position')!);
      const distancia = (j: EntityId) =>
        distanciaM(ctx, dh, direcaoDe(getComponent(ctx.state, j, 'position')!));
      const maisProxima = (r: RecursosId): { id: EntityId; d: number } | null => {
        let melhor: { id: EntityId; d: number } | null = null;
        for (const j of elegiveis) {
          if (recursoDe(j) !== r) continue;
          // Prefere jazidas com vaga; sem nenhuma, a mais próxima (o hover entra na fila).
          const d =
            distancia(j) + (vagasLivres(getComponent(ctx.state, j, 'jazida')!) > 0 ? 0 : 1e6);
          if (!melhor || d < melhor.d) melhor = { id: j, d };
        }
        return melhor;
      };
      let escolha: { r: RecursosId; id: EntityId; d: number; deficit: number } | null = null;
      for (const r of RECURSOS) {
        if (alvo[r] <= 0) continue;
        const jazida = maisProxima(r);
        if (!jazida) continue;
        // Quanto a fração atual está abaixo do alvo (maior = mais urgente).
        const deficit = alvo[r] / 100 - contagem[r] / total;
        const melhorQue =
          !escolha ||
          deficit > escolha.deficit + 1e-12 ||
          (Math.abs(deficit - escolha.deficit) <= 1e-12 && jazida.d < escolha.d);
        if (melhorQue) escolha = { r, id: jazida.id, d: jazida.d, deficit };
      }
      if (!escolha) continue;
      designar(ctx, hover, escolha.id, false);
      contagem[escolha.r]++;
    }
  }
}

/** ECO-18: a nação ajusta a própria diretiva (percentuais por recurso). */
export const comandosDeDiretiva: Record<string, CommandHandler> = {
  diretiva_coleta: (ctx, comando) => {
    const pcts = (comando.dados ?? {}) as Partial<Record<RecursosId, unknown>>;
    const valores = RECURSOS.map((r) => pcts[r]);
    if (!valores.every((v) => typeof v === 'number' && Number.isFinite(v) && v >= 0)) return;
    if ((valores as number[]).reduce((s, v) => s + v, 0) <= 0) return;
    ctx.state.diretivas[comando.nacao] = Object.fromEntries(
      RECURSOS.map((r, k) => [r, valores[k] as number]),
    ) as Record<RecursosId, number>;
  },
};
