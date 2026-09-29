/**
 * Dano e blindagem (CMB-01 a CMB-03) e dano em área (CMB-10, CMB-11, CMB-26).
 * O HP é contínuo; a morte é resolvida no sistema `morte` (CMB-27).
 */
import { entitiesWith, getComponent } from '../core/entities';
import type { SystemContext } from '../core/pipeline';
import type { SimState } from '../core/state';
import type { EntityId, NacaoId } from '../core/types';
import { dados, param } from '../data';
import type { Vec3 } from '../map/esfera';
import { statsMovel } from '../units/stats';
import { direcaoDe, distanciaM } from '../units/superficie';
import { bordaDe } from '../producao/alcance';
import { visivelPara } from '../visao/nevoa';
import { registrarDano } from '../relacoes/temperamento';

export type TipoDeDano = 'laser' | 'explosivo' | 'ambiental';
type Classe = 'leve' | 'blindada' | 'estrutura';

const multiplicadores = new Map(dados.multiplicadores.map((m) => [m.tipo_dano, m]));

/** CMB-02: classe de blindagem do corpo. */
export function classeDe(state: SimState, id: EntityId): Classe {
  if (getComponent(state, id, 'structure')) return 'estrutura';
  if (getComponent(state, id, 'mine')) return 'leve';
  return statsMovel(getComponent(state, id, 'unit')!.tipo).blindagem as Classe;
}

/** CMB-01: dano aplicado (antes do mínimo de 1). */
export function danoContra(
  state: SimState,
  alvo: EntityId,
  dano: number,
  tipo: TipoDeDano,
  bonus = 0,
): number {
  const linha = multiplicadores.get(tipo)!;
  return Math.max(1, dano * linha[classeDe(state, alvo)] * (1 + bonus));
}

/** Camada do corpo (CMB-04): drones fora do chão estão no ar. */
export function camadaDe(state: SimState, id: EntityId): 'solo' | 'ar' {
  const ar = getComponent(state, id, 'air');
  return ar && ar.estado !== 'pousado' ? 'ar' : 'solo';
}

/**
 * CMB-01: aplica o dano e marca o combate dos dois lados (ENE-15, ECO-13). `atacante` null:
 * dano ambiental ou de mina sem dono vivo.
 */
export function aplicarDano(
  ctx: SystemContext,
  alvo: EntityId,
  dano: number,
  tipo: TipoDeDano,
  atacante: EntityId | null,
  nacao: NacaoId | null,
  /** Dano contínuo (radiação) não é um acerto: sem o mínimo de 1 (CMB-01). */
  continuo = false,
): void {
  const { state } = ctx;
  const vida = getComponent(state, alvo, 'vida');
  if (!vida || vida.hp <= 0) return;
  // CMB-28: hover recolhido não pode ser atingido.
  if (getComponent(state, alvo, 'abrigo')?.estado === 'dentro') return;
  // UNI-20: embarcada não é atingida (cai com o Transporte).
  if (getComponent(state, alvo, 'embarcado')) return;
  // CTL-12: Sincronia, bônus de dano de quem está em controle direto.
  if (atacante !== null && getComponent(state, atacante, 'pilotado')) {
    dano *= 1 + param('controle_direto_bonus_dano_pct') / 100;
  }
  const aplicado = continuo
    ? dano * multiplicadores.get(tipo)![classeDe(state, alvo)]
    : danoContra(state, alvo, dano, tipo);
  vida.hp -= aplicado;
  const combate = getComponent(state, alvo, 'combate');
  if (combate) {
    combate.semCombate_s = 0;
    combate.semDano_s = 0;
    combate.ultimoAtacante = atacante;
    if (nacao && nacao !== getComponent(state, alvo, 'owner')?.nacao) {
      combate.ultimoDanoNacao = nacao;
    }
  }
  // REG-27: dano entre nações abre a guerra e zera a trégua (a radiação não é agressão).
  const dono = getComponent(state, alvo, 'owner')?.nacao;
  if (!continuo && nacao && dono && nacao !== dono) registrarDano(ctx, nacao, dono);
  if (atacante !== null) {
    const doAtacante = getComponent(state, atacante, 'combate');
    if (doAtacante) doAtacante.semCombate_s = 0;
  }
  ctx.emit('dano', { alvo, atacante, dano: aplicado, tipo });
}

/** CMB-10: fração do dano a `distancia` do centro de uma área de raio `raio`. */
export function fatorDeSplash(distancia: number, raio: number, bordaPct: number): number {
  if (distancia > raio) return 0;
  const nucleo = (raio * param('nucleo_splash_pct')) / 100;
  if (distancia <= nucleo) return 1;
  const t = (distancia - nucleo) / (raio - nucleo);
  return 1 + (bordaPct / 100 - 1) * t;
}

export interface Area {
  centro: Vec3;
  raio: number;
  dano: number;
  tipo: TipoDeDano;
  bordaPct: number;
  camadas: ReadonlyArray<'solo' | 'ar'>;
  atacante: EntityId | null;
  /** CMB-11: nação do atacante (sem fogo amigo); null = ambiental, fere todas. */
  nacao: NacaoId | null;
}

/**
 * CMB-10/CMB-11: dano em área. A distância é medida até o centro da unidade e, nas estruturas,
 * até a borda da pegada (D-33). Minas só são atingidas quando reveladas (CMB-20).
 */
export function danoEmArea(ctx: SystemContext, area: Area): void {
  const { state } = ctx;
  for (const id of entitiesWith(state, 'vida', 'position')) {
    // Minas só são atingidas quando reveladas ao atacante (CMB-20).
    if (getComponent(state, id, 'mine') && !(area.nacao && visivelPara(ctx, area.nacao, id)))
      continue;
    if (area.nacao && getComponent(state, id, 'owner')?.nacao === area.nacao) continue;
    if (!area.camadas.includes(camadaDe(state, id))) continue;
    const d = direcaoDe(getComponent(state, id, 'position')!);
    const borda = getComponent(state, id, 'structure') ? bordaDe(ctx, id) : 0;
    const distancia = Math.max(0, distanciaM(ctx, area.centro, d) - borda);
    const fator = fatorDeSplash(distancia, area.raio, area.bordaPct);
    if (fator <= 0) continue;
    aplicarDano(ctx, id, area.dano * fator, area.tipo, area.atacante, area.nacao);
  }
}

/** ENE-15: sem causar nem sofrer dano há menos de `estado_combate_s`. */
export function emCombate(state: SimState, id: EntityId): boolean {
  const combate = getComponent(state, id, 'combate');
  return combate !== undefined && combate.semCombate_s < param('estado_combate_s');
}
