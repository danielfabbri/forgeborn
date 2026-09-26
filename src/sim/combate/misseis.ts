/**
 * Mísseis (UNI-10 a UNI-12, D-63, D-64). A Base de Lança-Mísseis lança o míssil da frente da
 * fila de prontos num ponto dentro do alcance (mesmo no escuro); ele voa em arco e detona no
 * ponto. A Bateria Antiaérea dispara um míssil guiado por vez contra mísseis inimigos em voo e
 * drones no ar; o acerto é sorteado no disparo pela distância do alvo.
 */
import type { Ponto } from '../core/components';
import {
  createEntity,
  destroyEntity,
  entitiesWith,
  getComponent,
  isAlive,
  setComponent,
} from '../core/entities';
import type { CommandHandler, SystemContext } from '../core/pipeline';
import { nextU32 } from '../core/rng';
import type { EntityId, NacaoId } from '../core/types';
import { param } from '../data';
import { avancar, interpolarArco, tangente } from '../map/esfera';
import {
  chaoEm,
  direcaoDe,
  direcaoDoComando,
  distanciaM,
  type Posicao,
  posicionar,
  raioDoMundo,
} from '../units/superficie';
import { armaDe } from './armas';
import { aplicarDano, camadaDe } from './dano';
import { detonar } from './projeteis';
import { visivelPara } from '../visao/nevoa';

export const LANCAR_MISSIL_COMMAND = 'lancar_missil';

function posicao(ctx: SystemContext, d: Ponto, altura: number): Posicao {
  const pos = { x: 0, y: 0, z: 0 };
  posicionar(ctx, pos, d, altura);
  return pos;
}

/** Arma de cada míssil fabricado. */
export const ARMA_DO_MISSIL = {
  missile_short: 'missil_curto',
  missile_long: 'missil_longo',
} as const;

/** Apresentação do voo: altura do arco (m) em relação à distância, com um mínimo. */
const ARCO_FRACAO = 0.25;
const ARCO_MIN_M = 12;

/** Altura (m) do míssil sobre o chão na fração `f` do voo de `distancia` m. */
export function alturaDoArco(distancia: number, f: number): number {
  return 4 * Math.max(ARCO_MIN_M, distancia * ARCO_FRACAO) * f * (1 - f);
}

/** UNI-10: o ponto está no alcance do míssil da frente? */
export function alcanceDoProximo(
  ctx: SystemContext,
  base: EntityId,
): { arma: string; alcance: number } | null {
  const lancador = getComponent(ctx.state, base, 'lancador');
  const tipo = lancador?.prontos[0];
  if (!tipo) return null;
  const arma = armaDe(ARMA_DO_MISSIL[tipo]);
  return { arma: arma.id, alcance: arma.alcance_m };
}

function lancar(ctx: SystemContext, base: EntityId, ponto: Ponto): boolean {
  const { state } = ctx;
  const lancador = getComponent(state, base, 'lancador');
  if (!lancador || getComponent(state, base, 'obra')) return false;
  const nacao = getComponent(state, base, 'owner')!.nacao;
  if (lancador.prontos.length === 0 || lancador.recarga_s > 1e-9) {
    const motivo = lancador.prontos.length === 0 ? 'vazio' : 'recarga';
    ctx.emit('missil_recusado', { nacao, base, motivo });
    return false;
  }
  const arma = armaDe(ARMA_DO_MISSIL[lancador.prontos[0]!]);
  const origem = direcaoDe(getComponent(state, base, 'position')!);
  const distancia = distanciaM(ctx, origem, ponto);
  if (distancia > arma.alcance_m + 1e-9) {
    ctx.emit('missil_recusado', { nacao, base, motivo: 'alcance' });
    return false;
  }
  lancador.prontos.shift();
  lancador.recarga_s = arma.recarga_s ?? 0;
  const id = createEntity(state);
  setComponent(state, id, 'position', posicao(ctx, origem, chaoEm(ctx, origem) + 1));
  setComponent(state, id, 'projetil', {
    tipo: 'missil',
    arma: arma.id,
    atirador: base,
    nacao,
    alvo: null,
    ponto,
    voo_s: 0,
    dano: arma.dano,
    origem,
    total_s: Math.max(0.5, distancia / (arma.vel_projetil_m_s ?? 1)),
  });
  ctx.emit('disparo', { atirador: base, alvo: null, arma: arma.id, ponto });
  return true;
}

/** UNI-11: o míssil em arco; ao chegar, detona no ponto. */
export function passoMissil(ctx: SystemContext, id: EntityId): void {
  const { state, dt } = ctx;
  const p = getComponent(state, id, 'projetil')!;
  const pos = getComponent(state, id, 'position')!;
  p.voo_s += dt;
  const f = Math.min(1, p.voo_s / (p.total_s ?? 1));
  if (f >= 1 - 1e-9) {
    detonar(ctx, p.arma, p.ponto, p.atirador, p.nacao, null);
    destroyEntity(state, id);
    return;
  }
  const d = interpolarArco(p.origem!, p.ponto, f);
  const distancia = distanciaM(ctx, p.origem!, p.ponto);
  posicionar(ctx, pos, d, chaoEm(ctx, d) + alturaDoArco(distancia, f));
}

/** UNI-12: chance de acerto pela distância do alvo no disparo. */
export function chanceDeAcerto(distancia: number, alcance: number): number {
  const certeira = (alcance * param('aa_zona_certeira_pct')) / 100;
  const centro = param('aa_acerto_centro_pct') / 100;
  const borda = param('aa_acerto_borda_pct') / 100;
  if (distancia <= certeira) return centro;
  const t = Math.min(1, (distancia - certeira) / Math.max(1e-9, alcance - certeira));
  return centro + (borda - centro) * t;
}

/** Alvos da antiaérea: mísseis inimigos em voo primeiro, depois drones inimigos no ar. */
function alvoDaAntiaerea(
  ctx: SystemContext,
  bateria: EntityId,
  nacao: NacaoId,
  alcance: number,
): { id: EntityId; distancia: number } | null {
  const { state } = ctx;
  const d = direcaoDe(getComponent(state, bateria, 'position')!);
  const perseguidos = new Set(
    entitiesWith(state, 'projetil')
      .map((id) => getComponent(state, id, 'projetil')!)
      .filter((p) => p.tipo === 'aa' && p.nacao === nacao && p.alvo !== null)
      .map((p) => p.alvo!),
  );
  const maisPerto = (ids: EntityId[]) => {
    let melhor: { id: EntityId; distancia: number } | null = null;
    for (const id of ids) {
      if (perseguidos.has(id)) continue;
      const distancia = distanciaM(ctx, d, direcaoDe(getComponent(state, id, 'position')!));
      if (distancia > alcance) continue;
      if (!melhor || distancia < melhor.distancia) melhor = { id, distancia };
    }
    return melhor;
  };
  const misseis = entitiesWith(state, 'projetil', 'position').filter((id) => {
    const p = getComponent(state, id, 'projetil')!;
    return p.tipo === 'missil' && p.nacao !== nacao;
  });
  const missil = maisPerto(misseis);
  if (missil) return missil;
  const drones = entitiesWith(state, 'unit', 'owner', 'position', 'vida').filter(
    (id) =>
      getComponent(state, id, 'owner')!.nacao !== nacao &&
      camadaDe(state, id) === 'ar' &&
      visivelPara(ctx, nacao, id),
  );
  return maisPerto(drones);
}

/** UNI-12 (D-64): um disparo por vez, a cada `recarga_s`, pago da rede. */
export function passoAntiaereas(ctx: SystemContext): void {
  const { state, dt } = ctx;
  const arma = armaDe('aa_missil');
  for (const id of entitiesWith(state, 'antiaerea', 'owner', 'position')) {
    if (getComponent(state, id, 'obra')) continue;
    const aa = getComponent(state, id, 'antiaerea')!;
    aa.recarga_s = Math.max(0, aa.recarga_s - dt);
    if (aa.recarga_s > 1e-9) continue;
    const nacao = getComponent(state, id, 'owner')!.nacao;
    const alvo = alvoDaAntiaerea(ctx, id, nacao, arma.alcance_m);
    if (!alvo) continue;
    const rede = state.energia[nacao];
    if (!rede || rede.banco < arma.en_disparo - 1e-9) continue;
    rede.banco -= arma.en_disparo;
    aa.recarga_s = arma.recarga_s ?? 0;
    aa.alvo = alvo.id;
    const sorteio = nextU32(state.rng) / 2 ** 32;
    const d = direcaoDe(getComponent(state, id, 'position')!);
    const tiro = createEntity(state);
    setComponent(state, tiro, 'position', posicao(ctx, d, chaoEm(ctx, d) + 3));
    setComponent(state, tiro, 'projetil', {
      tipo: 'aa',
      arma: arma.id,
      atirador: id,
      nacao,
      alvo: alvo.id,
      ponto: direcaoDe(getComponent(state, alvo.id, 'position')!),
      voo_s: 0,
      dano: arma.dano,
      acerta: sorteio < chanceDeAcerto(alvo.distancia, arma.alcance_m),
    });
    ctx.emit('disparo', { atirador: id, alvo: alvo.id, arma: arma.id });
  }
}

/** UNI-12: o antiaéreo persegue o alvo; acerta ou explode sozinho perto dele. */
export function passoAntiaereo(ctx: SystemContext, id: EntityId): void {
  const { state, dt } = ctx;
  const p = getComponent(state, id, 'projetil')!;
  const pos = getComponent(state, id, 'position')!;
  const arma = armaDe(p.arma);
  const d = direcaoDe(pos);
  const vivo = p.alvo !== null && isAlive(state, p.alvo);
  const alvoPos = vivo ? getComponent(state, p.alvo!, 'position') : undefined;
  p.voo_s += dt;
  const tempoMax = (arma.alcance_m * 2) / (arma.vel_projetil_m_s ?? 1);
  if (!alvoPos || p.voo_s > tempoMax) {
    // Sem alvo (já destruído) ou tempo demais: explode sozinho.
    ctx.emit('explosao', { d, raio: 0.8, arma: p.arma });
    destroyEntity(state, id);
    return;
  }
  const da = direcaoDe(alvoPos);
  const hAlvo = Math.hypot(alvoPos.x, alvoPos.y, alvoPos.z) - raioDoMundo(ctx);
  const passo = (arma.vel_projetil_m_s ?? 0) * dt;
  if (distanciaM(ctx, d, da) <= passo) {
    if (p.acerta) {
      const outro = getComponent(state, p.alvo!, 'projetil');
      if (outro) {
        ctx.emit('missil_interceptado', { id: p.alvo, nacao: p.nacao, d: da });
        destroyEntity(state, p.alvo!);
      } else {
        aplicarDano(ctx, p.alvo!, arma.dano, 'explosivo', p.atirador, p.nacao);
      }
    }
    ctx.emit('explosao', { d: da, raio: p.acerta ? 1.5 : 0.8, arma: p.arma });
    destroyEntity(state, id);
    return;
  }
  const rumo = tangente(d, da);
  const novo = rumo ? avancar(d, rumo, passo / raioDoMundo(ctx)).p : d;
  const h = Math.hypot(pos.x, pos.y, pos.z) - raioDoMundo(ctx);
  posicionar(ctx, pos, novo, h + (hAlvo - h) * Math.min(1, dt * 3));
}

export function passoLancadores(ctx: SystemContext): void {
  for (const id of entitiesWith(ctx.state, 'lancador')) {
    const l = getComponent(ctx.state, id, 'lancador')!;
    l.recarga_s = Math.max(0, l.recarga_s - ctx.dt);
  }
}

export const comandosDeMisseis: Record<string, CommandHandler> = {
  /** UNI-10: clique direito com a Base de Lança-Mísseis selecionada. */
  [LANCAR_MISSIL_COMMAND]: (ctx, comando) => {
    const d = (comando.dados ?? {}) as { ids?: unknown; x?: unknown; y?: unknown; z?: unknown };
    const ponto = direcaoDoComando(d);
    if (!ponto || !Array.isArray(d.ids)) return;
    for (const id of [...new Set(d.ids)].sort((a, b) => Number(a) - Number(b))) {
      if (typeof id !== 'number' || !isAlive(ctx.state, id)) continue;
      if (getComponent(ctx.state, id, 'owner')?.nacao !== comando.nacao) continue;
      lancar(ctx, id, ponto);
    }
  },
};
