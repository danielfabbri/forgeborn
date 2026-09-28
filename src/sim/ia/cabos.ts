/**
 * IA-13 (D-85): a IA pluga cada estrutura pronta que precisa de energia na estrutura da rede da
 * Nave mais próxima ao alcance do cabo (o mesmo Comando do jogador, ENE-26).
 */
import { entitiesWith, getComponent } from '../core/entities';
import type { SystemContext } from '../core/pipeline';
import {
  caboAlcanca,
  distanciaEntreBordas,
  precisaDeEnergia,
  redePrincipal,
} from '../energia/cabos';
import { comandar } from './base';
import type { Quadro } from './quadro';

export function plugarEstruturas(ctx: SystemContext, q: Quadro): void {
  const { state } = ctx;
  const rede = redePrincipal(state, q.nacao);
  if (rede.length === 0) return;
  const naRede = new Set(rede);
  for (const id of entitiesWith(state, 'structure', 'owner')) {
    if (getComponent(state, id, 'owner')!.nacao !== q.nacao) continue;
    if (naRede.has(id) || getComponent(state, id, 'obra') || !precisaDeEnergia(state, id)) continue;
    const perto = rede
      .filter((m) => caboAlcanca(ctx, id, m))
      .sort((a, b) => distanciaEntreBordas(ctx, id, a) - distanciaEntreBordas(ctx, id, b) || a - b);
    if (perto.length === 0) continue;
    comandar(ctx, q.nacao, 'ligar_cabo', { de: id, para: perto[0]! });
    // Um cabo por decisão: a rede muda e a próxima estrutura vê o ponto novo.
    return;
  }
}
