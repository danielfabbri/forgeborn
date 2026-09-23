/**
 * Sistema de movimento (MOV-01 a MOV-07): passo de cada unidade, separação entre corpos,
 * obstáculos rígidos, pouso e decolagem de drones e altura final (solo ou voo).
 */
import type { ComponentMap, Ponto } from '../core/components';
import { entitiesWith, getComponent } from '../core/entities';
import type { SystemContext } from '../core/pipeline';
import type { EntityId } from '../core/types';
import { param } from '../data';
import { celulaDe } from '../map/grids';
import { alturaEm } from '../map/heightmap';
import { aEstrela, linhaLivre, livre, type Navegavel, passoDoFluxo } from '../map/pathfinding';
import { fluxoPara, navegavel } from './navegacao';
import { ALTURA_HOVER_M, altitudeDrone, statsMovel } from './stats';

type Locomocao = ComponentMap['locomotion'];

const TAU = Math.PI * 2;
/** Distância para considerar um ponto de passagem intermediário atingido. */
const PASSAGEM_M = 1.5;
/** Distância para considerar o destino final atingido. */
const CHEGADA_M = 0.4;
/** Distância a partir da qual um grupo em campo de fluxo segue direto para o seu lugar. */
const APROXIMACAO_FLUXO_M = 30;
const TEMPO_TRAVADO_S = 2;

function diferencaAngular(a: number, b: number): number {
  let d = (a - b) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

function livreEm(g: Navegavel | null, x: number, z: number): boolean {
  if (!g) return true;
  const c = celulaDe(g.nav, x, z);
  return c !== null && livre(g, c[1] * g.nav.colunas + c[0]);
}

/** Traça a rota (A*) até o destino da unidade; em linha reta para drones ou sem mapa. */
export function tracarRota(
  g: Navegavel | null,
  loc: Locomocao,
  x: number,
  z: number,
  aerea: boolean,
): void {
  if (!loc.destino) return;
  loc.fluxo = null;
  loc.rota = aerea || !g ? [loc.destino] : (aEstrela(g, [x, z], loc.destino) ?? []);
  if (!aerea && g && loc.rota.length > 0) loc.destino = loc.rota[loc.rota.length - 1]!;
}

function ehAereaId(ctx: SystemContext, id: EntityId): boolean {
  return statsMovel(getComponent(ctx.state, id, 'unit')!.tipo).camada === 'ar';
}

function chegou(ctx: SystemContext, g: Navegavel | null, id: EntityId, loc: Locomocao): void {
  const ordem = getComponent(ctx.state, id, 'order')!;
  const pos = getComponent(ctx.state, id, 'position')!;
  loc.rota = [];
  loc.fluxo = null;
  if (ordem.tipo === 'patrulhar' && ordem.patrulha) {
    const [a, b] = ordem.patrulha;
    ordem.patrulha = [b, a];
    loc.destino = a;
    tracarRota(g, loc, pos.x, pos.z, ehAereaId(ctx, id));
    return;
  }
  loc.destino = null;
  loc.limiteVel = null;
  if (ordem.tipo === 'mover') ordem.tipo = 'nenhuma';
}

function proximoAlvo(
  ctx: SystemContext,
  g: Navegavel | null,
  id: EntityId,
  loc: Locomocao,
  x: number,
  z: number,
): Ponto | null {
  while (loc.rota.length > 0) {
    const w = loc.rota[0]!;
    const ultimo = loc.rota.length === 1 && !loc.fluxo;
    if (Math.hypot(w[0] - x, w[1] - z) > (ultimo ? CHEGADA_M : PASSAGEM_M)) return w;
    loc.rota.shift();
    if (ultimo) {
      chegou(ctx, g, id, loc);
      return loc.rota[0] ?? null;
    }
  }
  if (loc.fluxo && loc.destino && g) {
    const perto = Math.hypot(loc.destino[0] - x, loc.destino[1] - z) < APROXIMACAO_FLUXO_M;
    const campo = fluxoPara(ctx, loc.fluxo);
    const passo = campo ? passoDoFluxo(g, campo, x, z) : null;
    if ((perto && linhaLivre(g, [x, z], loc.destino)) || !passo) {
      loc.fluxo = null;
      loc.rota = [loc.destino];
      return loc.destino;
    }
    return passo;
  }
  return null;
}

/** Algum corpo de outra nação dentro da visão da unidade? (A névoa refina isso na T-070.) */
function inimigoVisivel(ctx: SystemContext, id: EntityId): boolean {
  const { state } = ctx;
  const dono = getComponent(state, id, 'owner')!.nacao;
  const p = getComponent(state, id, 'position')!;
  const visao = statsMovel(getComponent(state, id, 'unit')!.tipo).visao_m;
  return entitiesWith(state, 'owner', 'position').some((outro) => {
    if (getComponent(state, outro, 'owner')!.nacao === dono) return false;
    const q = getComponent(state, outro, 'position')!;
    return Math.hypot(q.x - p.x, q.z - p.z) <= visao;
  });
}

/** MOV-07: pouso automático e decolagem. Devolve se o drone pode se deslocar agora. */
function atualizarAr(ctx: SystemContext, id: EntityId, loc: Locomocao, dt: number): boolean {
  const ar = getComponent(ctx.state, id, 'air')!;
  const temOrdem = loc.destino !== null;
  const decolar = () => {
    ar.estado = 'decolando';
    ar.timer_s = param('tempo_decolagem_s');
    loc.ocioso_s = 0;
  };
  switch (ar.estado) {
    case 'voando':
      if (!temOrdem && loc.ocioso_s >= param('pouso_automatico_s')) {
        ar.estado = 'pousando';
        ar.timer_s = param('tempo_pouso_s');
        return false;
      }
      return true;
    case 'pousando':
      ar.timer_s -= dt;
      if (temOrdem || inimigoVisivel(ctx, id)) decolar();
      else if (ar.timer_s <= 0) ar.estado = 'pousado';
      return false;
    case 'pousado':
      if (temOrdem || inimigoVisivel(ctx, id)) decolar();
      return false;
    case 'decolando':
      ar.timer_s -= dt;
      if (ar.timer_s <= 0) ar.estado = 'voando';
      return false;
  }
}

function limitarAoMapa(ctx: SystemContext, pos: { x: number; z: number }): void {
  if (!ctx.mundo) return;
  const limite = ctx.mundo.mapa.lado_m / 2 - 1;
  pos.x = Math.max(-limite, Math.min(limite, pos.x));
  pos.z = Math.max(-limite, Math.min(limite, pos.z));
}

function passo(ctx: SystemContext, g: Navegavel | null, id: EntityId, dt: number): void {
  const { state } = ctx;
  const s = statsMovel(getComponent(state, id, 'unit')!.tipo);
  const aerea = s.camada === 'ar';
  const loc = getComponent(state, id, 'locomotion')!;
  const pos = getComponent(state, id, 'position')!;
  const ordem = getComponent(state, id, 'order')!;

  if (aerea && !atualizarAr(ctx, id, loc, dt)) {
    loc.speed = 0;
    return;
  }

  const alvo = ordem.tipo === 'manter' ? null : proximoAlvo(ctx, g, id, loc, pos.x, pos.z);
  const velMax = Math.min(s.vel_m_s, loc.limiteVel ?? Infinity);
  // MOV-03: da parada à velocidade máxima em aceleracao_*_s.
  const aceleracao = s.vel_m_s / param(aerea ? 'aceleracao_ar_s' : 'aceleracao_solo_s');
  let velAlvo = 0;
  if (alvo) {
    const dx = alvo[0] - pos.x;
    const dz = alvo[1] - pos.z;
    const desejado = Math.atan2(dz, dx);
    const giro = ((s.giro_graus_s * Math.PI) / 180) * dt;
    const delta = diferencaAngular(desejado, loc.heading);
    loc.heading += Math.max(-giro, Math.min(giro, delta));
    const desalinhado = Math.abs(diferencaAngular(desejado, loc.heading)) > Math.PI / 4;
    velAlvo = desalinhado ? velMax * 0.25 : velMax;
    if (loc.rota.length === 1 && !loc.fluxo) {
      velAlvo = Math.min(velAlvo, Math.sqrt(2 * aceleracao * Math.hypot(dx, dz)));
    }
    loc.ocioso_s = 0;
  } else if (ordem.tipo !== 'patrulhar') {
    loc.ocioso_s += dt;
  }
  const dv = aceleracao * dt;
  loc.speed =
    loc.speed < velAlvo ? Math.min(velAlvo, loc.speed + dv) : Math.max(velAlvo, loc.speed - dv);

  const nx = pos.x + Math.cos(loc.heading) * loc.speed * dt;
  const nz = pos.z + Math.sin(loc.heading) * loc.speed * dt;
  const [x0, z0] = [pos.x, pos.z];
  // MOV-01: terreno intransponível barra hovers; eles deslizam pela borda quando dá.
  if (aerea || livreEm(g, nx, nz)) {
    pos.x = nx;
    pos.z = nz;
  } else if (livreEm(g, nx, pos.z)) {
    pos.x = nx;
  } else if (livreEm(g, pos.x, nz)) {
    pos.z = nz;
  } else {
    loc.speed = 0;
  }
  limitarAoMapa(ctx, pos);

  // Unidade presa (aglomeração ou quina): refaz a rota depois de um tempo.
  if (alvo && Math.hypot(pos.x - x0, pos.z - z0) < 0.2 * velMax * dt) {
    loc.travado_s += dt;
    if (loc.travado_s >= TEMPO_TRAVADO_S) {
      loc.travado_s = 0;
      tracarRota(g, loc, pos.x, pos.z, aerea);
    }
  } else {
    loc.travado_s = 0;
  }
}

/** Corpo que ocupa o solo para colisão: hovers e drones pousados. */
function noSolo(ctx: SystemContext, id: EntityId): boolean {
  const ar = getComponent(ctx.state, id, 'air');
  return !ar || ar.estado === 'pousado';
}

/**
 * MOV-04: separação suave por correção de posição (sem velocidade, sem tremer).
 * Hovers entre si e drones em voo entre si; quem mantém posição não é empurrado.
 */
function separar(ctx: SystemContext, g: Navegavel | null, ids: EntityId[]): void {
  const { state } = ctx;
  const TAM = 4;
  const baldes = new Map<string, EntityId[]>();
  const chave = (solo: boolean, cx: number, cz: number) => `${solo ? 's' : 'a'}:${cx}:${cz}`;
  for (const id of ids) {
    const p = getComponent(state, id, 'position')!;
    const k = chave(noSolo(ctx, id), Math.floor(p.x / TAM), Math.floor(p.z / TAM));
    const lista = baldes.get(k);
    if (lista) lista.push(id);
    else baldes.set(k, [id]);
  }
  const peso = (id: EntityId) => (getComponent(state, id, 'order')!.tipo === 'manter' ? 0 : 1);
  for (const id of ids) {
    const solo = noSolo(ctx, id);
    const p = getComponent(state, id, 'position')!;
    const ra = statsMovel(getComponent(state, id, 'unit')!.tipo).raio_m;
    const cx = Math.floor(p.x / TAM);
    const cz = Math.floor(p.z / TAM);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        for (const outro of baldes.get(chave(solo, cx + dx, cz + dz)) ?? []) {
          if (outro <= id) continue;
          const q = getComponent(state, outro, 'position')!;
          const rb = statsMovel(getComponent(state, outro, 'unit')!.tipo).raio_m;
          let ex = q.x - p.x;
          let ez = q.z - p.z;
          let d = Math.hypot(ex, ez);
          const sobreposicao = ra + rb - d;
          if (sobreposicao <= 0.01) continue;
          if (d < 1e-6) {
            // Mesma posição: direção determinística pelo par de IDs.
            const a = (id * 2.399963 + outro * 0.618034) % TAU;
            ex = Math.cos(a);
            ez = Math.sin(a);
            d = 1;
          }
          const [pa, pb] = [peso(id), peso(outro)];
          const [wa, wb] = pa + pb === 0 ? [0.5, 0.5] : [pa / (pa + pb), pb / (pa + pb)];
          const ux = ex / d;
          const uz = ez / d;
          if (!solo || livreEm(g, p.x - ux * sobreposicao * wa, p.z - uz * sobreposicao * wa)) {
            p.x -= ux * sobreposicao * wa;
            p.z -= uz * sobreposicao * wa;
          }
          if (!solo || livreEm(g, q.x + ux * sobreposicao * wb, q.z + uz * sobreposicao * wb)) {
            q.x += ux * sobreposicao * wb;
            q.z += uz * sobreposicao * wb;
          }
        }
      }
    }
  }
  // Obstáculos rígidos empurram unidades de solo para fora.
  const obstaculos = entitiesWith(state, 'obstacle', 'position');
  for (const id of ids) {
    if (!noSolo(ctx, id)) continue;
    const p = getComponent(state, id, 'position')!;
    const r = statsMovel(getComponent(state, id, 'unit')!.tipo).raio_m;
    for (const o of obstaculos) {
      const q = getComponent(state, o, 'position')!;
      const raio = getComponent(state, o, 'obstacle')!.raio + r;
      const ex = p.x - q.x;
      const ez = p.z - q.z;
      const d = Math.hypot(ex, ez);
      if (d >= raio) continue;
      const [ux, uz] = d < 1e-6 ? [1, 0] : [ex / d, ez / d];
      p.x = q.x + ux * raio;
      p.z = q.z + uz * raio;
    }
  }
}

function ajustarAltura(ctx: SystemContext, ids: EntityId[]): void {
  const { state, mundo } = ctx;
  for (const id of ids) {
    const p = getComponent(state, id, 'position')!;
    const chao = (mundo ? alturaEm(mundo.mapa, p.x, p.z) : 0) + ALTURA_HOVER_M;
    const ar = getComponent(state, id, 'air');
    if (!ar || ar.estado === 'pousado') {
      p.y = chao;
      continue;
    }
    const alto = altitudeDrone();
    if (ar.estado === 'voando') {
      p.y = alto;
      continue;
    }
    const total = param(ar.estado === 'pousando' ? 'tempo_pouso_s' : 'tempo_decolagem_s');
    const t = Math.max(0, Math.min(1, ar.timer_s / total));
    p.y = ar.estado === 'pousando' ? chao + (alto - chao) * t : alto + (chao - alto) * t;
  }
}

export function sistemaMovimento(ctx: SystemContext): void {
  const g = navegavel(ctx);
  const ids = entitiesWith(ctx.state, 'unit', 'locomotion', 'position');
  for (const id of ids) passo(ctx, g, id, ctx.dt);
  separar(ctx, g, ids);
  ajustarAltura(ctx, ids);
}
