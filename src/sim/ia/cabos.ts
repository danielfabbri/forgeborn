/**
 * IA-13 (D-85, D-87): a IA pluga cada estrutura pronta que precisa de energia na Nave ou Central
 * da rede da Nave mais próxima ao alcance e com saída livre (o mesmo Comando do jogador, ENE-26);
 * se nenhuma alcança, planta uma Central entre a rede e a estrutura.
 */
import { entitiesWith, getComponent } from '../core/entities';
import type { SystemContext } from '../core/pipeline';
import type { EntityId } from '../core/types';
import {
  caboAlcanca,
  cabosDe,
  distanciaEntreBordas,
  naRedeComEnergia,
  pontosDeBifurcacao,
  precisaDeEnergia,
  redePrincipal,
  temSaidaLivre,
} from '../energia/cabos';
import { direcaoDe } from '../units/superficie';
import { comandar } from './base';
import { plantarCentral } from './economia';
import type { Quadro } from './quadro';

export function plugarEstruturas(ctx: SystemContext, q: Quadro): void {
  const { state } = ctx;
  const rede = redePrincipal(state, q.nacao);
  if (rede.length === 0) return;
  const naRede = new Set(rede);
  const ehCentral = (id: EntityId) => getComponent(state, id, 'structure')!.tipo === 'power_hub';
  // As Centrais primeiro: são elas que abrem saídas para as outras.
  const ordem = entitiesWith(state, 'structure', 'owner').sort(
    (a, b) => Number(ehCentral(b)) - Number(ehCentral(a)) || a - b,
  );
  for (const id of ordem) {
    if (getComponent(state, id, 'owner')!.nacao !== q.nacao) continue;
    if (naRede.has(id) || getComponent(state, id, 'obra') || !precisaDeEnergia(state, id)) continue;
    // Plugada noutra rede: fica como está se essa rede tem energia (uma expansão com as próprias
    // usinas); a parte que ficou sem energia (a ligação caiu) volta para a rede da Nave.
    if (cabosDe(state, id).length > 0 && (naRedeComEnergia(state, id) || !temSaidaLivre(state, id)))
      continue;
    const central = ehCentral(id);
    const perto = pontosDeBifurcacao(state, q.nacao, central)
      .filter((m) => caboAlcanca(ctx, id, m))
      .sort((a, b) => distanciaEntreBordas(ctx, id, a) - distanciaEntreBordas(ctx, id, b) || a - b);
    if (perto.length > 0) {
      comandar(ctx, q.nacao, 'ligar_cabo', { de: id, para: perto[0]! });
      // Um cabo por decisão: a rede muda e a próxima estrutura vê o ponto novo.
      return;
    }
    // Central encalhada (sem saída livre ao alcance) fica de lado; as outras seguem.
    if (central) continue;
    plantarCentral(ctx, q, direcaoDe(getComponent(state, id, 'position')!), true);
    return;
  }
}
