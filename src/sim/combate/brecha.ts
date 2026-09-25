/**
 * UNI-08 (D-53): unidade armada de solo cujo caminho está fechado (sem rota até o destino)
 * ataca o Muro ou Portão inimigo mais próximo que ela vê, abrindo a brecha.
 */
import { entitiesWith, getComponent } from '../core/entities';
import type { SystemContext } from '../core/pipeline';
import type { EntityId } from '../core/types';
import { statsMovel } from '../units/stats';
import { direcaoDe, distanciaM } from '../units/superficie';
import { visivelPara } from '../visao/nevoa';

const BLOQUEIOS = new Set(['wall', 'gate']);

/** Sem rota: a ordem tem destino, mas o A* não achou caminho (rota vazia, sem fluxo). */
function semCaminho(ctx: SystemContext, id: EntityId): boolean {
  const loc = getComponent(ctx.state, id, 'locomotion');
  return loc !== undefined && loc.destino !== null && loc.rota.length === 0 && loc.fluxo === null;
}

export function passoBrechas(ctx: SystemContext): void {
  const { state } = ctx;
  const bloqueios = entitiesWith(state, 'structure', 'owner', 'position').filter((id) =>
    BLOQUEIOS.has(getComponent(state, id, 'structure')!.tipo),
  );
  if (bloqueios.length === 0) return;
  for (const id of entitiesWith(state, 'unit', 'arma', 'owner', 'position')) {
    const arma = getComponent(state, id, 'arma')!;
    if (arma.alvoDireto !== null && arma.alvoDireto !== undefined) continue;
    // D-32: quem move ignorando inimigos não para para abrir brecha.
    if (getComponent(state, id, 'order')!.tipo === 'mover_ignorando') continue;
    const tipo = getComponent(state, id, 'unit')!.tipo;
    const stats = statsMovel(tipo);
    if (stats.camada === 'ar' || getComponent(state, id, 'pilotado')) continue;
    if (!semCaminho(ctx, id)) continue;
    const nacao = getComponent(state, id, 'owner')!.nacao;
    const d = direcaoDe(getComponent(state, id, 'position')!);
    let melhor: EntityId | null = null;
    let menor = Infinity;
    for (const b of bloqueios) {
      if (getComponent(state, b, 'owner')!.nacao === nacao) continue;
      if (!visivelPara(ctx, nacao, b)) continue;
      const dist = distanciaM(ctx, d, direcaoDe(getComponent(state, b, 'position')!));
      if (dist <= stats.visao_m && dist < menor) {
        menor = dist;
        melhor = b;
      }
    }
    if (melhor === null) continue;
    arma.alvoDireto = melhor;
    const ordem = getComponent(state, id, 'order')!;
    ordem.tipo = 'atacar';
    ordem.patrulha = null;
  }
}
