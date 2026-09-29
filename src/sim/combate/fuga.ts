/**
 * ECO-13: Hover de Exploração atingido foge para a estrutura própria armada mais próxima (ou
 * para a Nave) e retoma a tarefa após `fuga_hover_retorno_s` sem sofrer dano. Desligável nas
 * Diretivas (UI-02).
 */
import { entitiesWith, getComponent, removeComponent, setComponent } from '../core/entities';
import type { SystemContext } from '../core/pipeline';
import type { EntityId } from '../core/types';
import { param } from '../data';
import { retomarColeta } from '../economia/coleta';
import { aproximar } from '../producao/alcance';
import { direcaoDe, distanciaM } from '../units/superficie';

function abrigoMaisProximo(ctx: SystemContext, hover: EntityId): EntityId | null {
  const { state } = ctx;
  const nacao = getComponent(state, hover, 'owner')!.nacao;
  const dh = direcaoDe(getComponent(state, hover, 'position')!);
  let melhor: EntityId | null = null;
  let menor = Infinity;
  for (const id of entitiesWith(state, 'structure', 'arma', 'owner', 'position')) {
    if (getComponent(state, id, 'owner')!.nacao !== nacao) continue;
    const distancia = distanciaM(ctx, dh, direcaoDe(getComponent(state, id, 'position')!));
    if (distancia < menor) {
      menor = distancia;
      melhor = id;
    }
  }
  return melhor;
}

/** Roda no começo do sistema `combate`: `semDano_s` 0 = atingido desde o último tick. */
export function passoFuga(ctx: SystemContext): void {
  const { state } = ctx;
  for (const id of entitiesWith(state, 'coleta', 'combate')) {
    // D-44: em controle direto, o hover não foge sozinho.
    if (getComponent(state, id, 'pilotado')) continue;
    const combate = getComponent(state, id, 'combate')!;
    const fuga = getComponent(state, id, 'fuga');
    const nacao = getComponent(state, id, 'owner')!.nacao;
    if (fuga) {
      if (combate.semDano_s >= param('fuga_hover_retorno_s') - 1e-9) {
        removeComponent(state, id, 'fuga');
        if (getComponent(state, id, 'order')!.tipo === 'tarefa') retomarColeta(ctx, id);
      }
      continue;
    }
    if (combate.semDano_s > 1e-9 || !state.chaves[nacao]!.fuga) continue;
    const ordem = getComponent(state, id, 'order')!.tipo;
    if (ordem !== 'tarefa' && ordem !== 'nenhuma') continue;
    const abrigo = abrigoMaisProximo(ctx, id);
    if (abrigo === null) continue;
    setComponent(state, id, 'fuga', { abrigo });
    aproximar(ctx, id, abrigo);
  }
}
