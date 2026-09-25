/**
 * Projéteis, minas e radiação (sistema `projeteis`, TEC-06).
 *
 * Torpedo guiado (CMB-07): persegue o alvo; alvo morto, segue para a última posição dele; ao fim
 * do tempo máximo de voo, detona onde estiver (D-31). Bomba (CMB-08): cai no ponto previsto em
 * `bomba_tempo_queda_s`. Mina (CMB-09, CMB-21, UNI-07): arma após `tempo_armar_mina_s` e detona
 * quando um hover inimigo entra no raio de gatilho. Radiação (CMB-24): dano contínuo a unidades
 * móveis de solo (D-32).
 */
import { destroyEntity, entitiesWith, getComponent, isAlive } from '../core/entities';
import type { SystemContext } from '../core/pipeline';
import type { EntityId, NacaoId } from '../core/types';
import { param } from '../data';
import { avancar, interpolarArco, tangente, type Vec3 } from '../map/esfera';
import { bordaDe } from '../producao/alcance';
import { ALTURA_HOVER_M, statsMovel } from '../units/stats';
import { chaoEm, direcaoDe, distanciaM, posicionar, raioDoMundo } from '../units/superficie';
import { armaDe } from './armas';
import { aplicarDano, camadaDe, danoEmArea, type TipoDeDano } from './dano';

/** Detonação de uma arma com splash no ponto (CMB-10, CMB-11). */
export function detonar(
  ctx: SystemContext,
  armaId: string,
  centro: Vec3,
  atacante: EntityId | null,
  nacao: NacaoId,
  alvoDireto: EntityId | null,
): void {
  const arma = armaDe(armaId);
  const tipo = arma.tipo_dano as TipoDeDano;
  const vivo = atacante !== null && isAlive(ctx.state, atacante) ? atacante : null;
  if (arma.splash_m > 0) {
    danoEmArea(ctx, {
      centro,
      raio: arma.splash_m,
      dano: arma.dano,
      tipo,
      bordaPct: arma.splash_borda_pct ?? 0,
      camadas: arma.alvos as Array<'solo' | 'ar'>,
      atacante: vivo,
      nacao,
    });
  } else if (alvoDireto !== null && isAlive(ctx.state, alvoDireto)) {
    aplicarDano(ctx, alvoDireto, arma.dano, tipo, vivo, nacao);
  }
  ctx.emit('explosao', { d: centro, raio: arma.splash_m, arma: armaId });
}

/**
 * D-40: torpedo sem trava voa reto no rumo e detona no primeiro corpo inimigo de solo em que
 * encosta; sem acertar nada, no tempo máximo de voo (D-31).
 */
function passoTorpedoReto(ctx: SystemContext, id: EntityId): void {
  const { state, dt } = ctx;
  const p = getComponent(state, id, 'projetil')!;
  const pos = getComponent(state, id, 'position')!;
  const d = direcaoDe(pos);
  const arma = armaDe(p.arma);
  p.voo_s += dt;
  const rumo = tangente(d, p.rumo!) ?? p.rumo!;
  const metros = (arma.vel_projetil_m_s ?? 0) * dt;
  const passo = avancar(d, rumo, metros / raioDoMundo(ctx));
  // Encosta se o trecho percorrido no tick passa a até a borda do corpo (sem atravessá-lo).
  const meio = avancar(d, rumo, metros / 2 / raioDoMundo(ctx)).p;
  p.rumo = passo.rumo;
  posicionar(ctx, pos, passo.p, chaoEm(ctx, passo.p) + ALTURA_HOVER_M);
  for (const outro of entitiesWith(state, 'owner', 'position', 'vida')) {
    if (getComponent(state, outro, 'owner')!.nacao === p.nacao) continue;
    if (getComponent(state, outro, 'mine') || camadaDe(state, outro) !== 'solo') continue;
    const onde = direcaoDe(getComponent(state, outro, 'position')!);
    if (distanciaM(ctx, meio, onde) <= bordaDe(ctx, outro) + metros / 2) {
      detonar(ctx, p.arma, passo.p, p.atirador, p.nacao, outro);
      destroyEntity(state, id);
      return;
    }
  }
  if (p.voo_s >= param('torpedo_tempo_max_voo_s') - 1e-9) {
    detonar(ctx, p.arma, passo.p, p.atirador, p.nacao, null);
    destroyEntity(state, id);
  }
}

function passoTorpedo(ctx: SystemContext, id: EntityId): void {
  const { state, dt } = ctx;
  const p = getComponent(state, id, 'projetil')!;
  if (p.rumo && p.alvo === null) {
    passoTorpedoReto(ctx, id);
    return;
  }
  const pos = getComponent(state, id, 'position')!;
  const d = direcaoDe(pos);
  const arma = armaDe(p.arma);
  const vivo = p.alvo !== null && isAlive(state, p.alvo);
  if (vivo) p.ponto = direcaoDe(getComponent(state, p.alvo!, 'position')!);
  else p.alvo = null;
  p.voo_s += dt;
  const passo = (arma.vel_projetil_m_s ?? 0) * dt;
  const borda = vivo ? bordaDe(ctx, p.alvo!) : 0;
  const falta = distanciaM(ctx, d, p.ponto) - borda;
  if (falta <= passo) {
    detonar(ctx, p.arma, p.ponto, p.atirador, p.nacao, p.alvo);
    destroyEntity(state, id);
    return;
  }
  const rumo = tangente(d, p.ponto);
  const novo = rumo ? avancar(d, rumo, passo / raioDoMundo(ctx)).p : d;
  posicionar(ctx, pos, novo, chaoEm(ctx, novo) + ALTURA_HOVER_M);
  // D-31: no tempo máximo de voo, detona onde estiver.
  if (p.voo_s >= param('torpedo_tempo_max_voo_s') - 1e-9) {
    detonar(ctx, p.arma, novo, p.atirador, p.nacao, null);
    destroyEntity(state, id);
  }
}

function passoBomba(ctx: SystemContext, id: EntityId): void {
  const { state, dt } = ctx;
  const p = getComponent(state, id, 'projetil')!;
  const pos = getComponent(state, id, 'position')!;
  const queda = param('bomba_tempo_queda_s');
  p.voo_s += dt;
  if (p.voo_s >= queda - 1e-9) {
    detonar(ctx, p.arma, p.ponto, p.atirador, p.nacao, null);
    destroyEntity(state, id);
    return;
  }
  // Visual: desce até o chão do ponto previsto.
  const d = direcaoDe(pos);
  const r = Math.hypot(pos.x, pos.y, pos.z) - raioDoMundo(ctx);
  const t = dt / (queda - p.voo_s + dt);
  const novo = interpolarArco(d, p.ponto, t);
  const chao = chaoEm(ctx, novo);
  posicionar(ctx, pos, novo, r + (chao - r) * t);
}

/** CMB-09/UNI-07: armar e detonar minas. */
function passoMinas(ctx: SystemContext): void {
  const { state, dt } = ctx;
  const gatilho = armaDe('mine_blast').alcance_m;
  for (const id of entitiesWith(state, 'mine', 'position', 'owner')) {
    const mina = getComponent(state, id, 'mine')!;
    if (!mina.armada) {
      mina.timer_s -= dt;
      if (mina.timer_s <= 1e-9) mina.armada = true;
      continue;
    }
    const dono = getComponent(state, id, 'owner')!.nacao;
    const dm = direcaoDe(getComponent(state, id, 'position')!);
    // Só hovers inimigos (unidades de solo que não são drones) acionam (CMB-05).
    const acionou = entitiesWith(state, 'unit', 'owner', 'position').some((u) => {
      if (getComponent(state, u, 'owner')!.nacao === dono) return false;
      if (getComponent(state, u, 'air')) return false;
      const du = direcaoDe(getComponent(state, u, 'position')!);
      const raio = statsMovel(getComponent(state, u, 'unit')!.tipo).raio_m;
      return distanciaM(ctx, dm, du) - raio <= gatilho;
    });
    if (!acionou) continue;
    destroyEntity(state, id);
    detonar(ctx, 'mine_blast', dm, null, dono, null);
    ctx.emit('alerta', { id: 'AL-16', nacao: dono, d: dm });
  }
}

/** CMB-24/D-32: a zona de radiação fere unidades móveis de solo de qualquer nação. */
function passoRadiacao(ctx: SystemContext): void {
  const { state, dt } = ctx;
  const raio = param('radiacao_raio_m');
  for (const zona of entitiesWith(state, 'radiacao', 'position')) {
    const r = getComponent(state, zona, 'radiacao')!;
    r.restante_s -= dt;
    if (r.restante_s <= 0) {
      destroyEntity(state, zona);
      continue;
    }
    const dz = direcaoDe(getComponent(state, zona, 'position')!);
    for (const u of entitiesWith(state, 'unit', 'vida', 'position')) {
      if (camadaDe(state, u) === 'ar') continue;
      const du = direcaoDe(getComponent(state, u, 'position')!);
      if (distanciaM(ctx, dz, du) > raio) continue;
      aplicarDano(ctx, u, param('radiacao_dano_hp_s') * dt, 'ambiental', null, null, true);
    }
  }
}

export function sistemaProjeteis(ctx: SystemContext): void {
  for (const id of entitiesWith(ctx.state, 'projetil', 'position')) {
    if (getComponent(ctx.state, id, 'projetil')!.tipo === 'torpedo') passoTorpedo(ctx, id);
    else passoBomba(ctx, id);
  }
  passoMinas(ctx);
  passoRadiacao(ctx);
}
