/**
 * Sistema de movimento (MOV-01 a MOV-07) na superfície do planeta (CEN-14): passo de cada
 * unidade pelo grande círculo, separação entre corpos, obstáculos rígidos, pouso e decolagem de
 * drones e altura final (solo ou voo).
 */
import type { ComponentMap, Ponto } from '../core/components';
import { entitiesWith, getComponent } from '../core/entities';
import type { SystemContext } from '../core/pipeline';
import type { EntityId } from '../core/types';
import { param } from '../data';
import {
  arco,
  avancar,
  girar,
  normalizar,
  norteEm,
  produtoEscalar,
  produtoVetorial,
  tangente,
  type Vec3,
} from '../map/esfera';
import { celulaDe } from '../map/grids';
import { aEstrela, linhaLivre, livre, type Navegavel, passoDoFluxo } from '../map/pathfinding';
import { fluxoPara, navegavel } from './navegacao';
import { ALTURA_HOVER_M, altitudeDrone, statsMovel } from './stats';
import { chaoEm, direcaoDe, distanciaM, posicionar, raioDoMundo } from './superficie';

type Locomocao = ComponentMap['locomotion'];

const TAU = Math.PI * 2;
/** Distância para considerar um ponto de passagem intermediário atingido. */
const PASSAGEM_M = 1.5;
/** Distância para considerar o destino final atingido. */
const CHEGADA_M = 0.4;
/** Distância a partir da qual um grupo em campo de fluxo segue direto para o seu lugar. */
const APROXIMACAO_FLUXO_M = 30;
const TEMPO_TRAVADO_S = 2;
/** Deslocamento líquido abaixo do qual a unidade conta como travada. */
const DESLOCAMENTO_MINIMO_M = 0.5;
/** Tamanho (m) dos baldes espaciais da separação. */
const BALDE_M = 4;

function livreEm(g: Navegavel | null, d: Vec3): boolean {
  return !g || livre(g, celulaDe(g.nav, d));
}

/** Ângulo com sinal (rad) de `de` para `para`, ambos tangentes em p, em torno da vertical p. */
function anguloNoPlano(p: Vec3, de: Vec3, para: Vec3): number {
  return Math.atan2(produtoEscalar(p, produtoVetorial(de, para)), produtoEscalar(de, para));
}

/** Traça a rota (A*) até o destino da unidade; pelo grande círculo para drones ou sem mapa. */
export function tracarRota(g: Navegavel | null, loc: Locomocao, d: Vec3, aerea: boolean): void {
  if (!loc.destino) return;
  loc.fluxo = null;
  loc.rota = aerea || !g ? [loc.destino] : ((aEstrela(g, d, loc.destino) as Ponto[] | null) ?? []);
  if (!aerea && g && loc.rota.length > 0) loc.destino = loc.rota[loc.rota.length - 1]!;
}

function ehAereaId(ctx: SystemContext, id: EntityId): boolean {
  return statsMovel(getComponent(ctx.state, id, 'unit')!.tipo).camada === 'ar';
}

function chegou(ctx: SystemContext, g: Navegavel | null, id: EntityId, loc: Locomocao): void {
  const ordem = getComponent(ctx.state, id, 'order')!;
  const d = direcaoDe(getComponent(ctx.state, id, 'position')!);
  loc.rota = [];
  loc.fluxo = null;
  if (ordem.tipo === 'patrulhar' && ordem.patrulha) {
    const [a, b] = ordem.patrulha;
    ordem.patrulha = [b, a];
    loc.destino = a;
    tracarRota(g, loc, d, ehAereaId(ctx, id));
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
  d: Vec3,
): Vec3 | null {
  while (loc.rota.length > 0) {
    const w = loc.rota[0]!;
    const ultimo = loc.rota.length === 1 && !loc.fluxo;
    if (distanciaM(ctx, w, d) > (ultimo ? CHEGADA_M : PASSAGEM_M)) return w;
    loc.rota.shift();
    if (ultimo) {
      chegou(ctx, g, id, loc);
      return loc.rota[0] ?? null;
    }
  }
  if (loc.fluxo && loc.destino && g) {
    const perto = distanciaM(ctx, loc.destino, d) < APROXIMACAO_FLUXO_M;
    const campo = fluxoPara(ctx, loc.fluxo);
    const passo = campo ? passoDoFluxo(g, campo, d) : null;
    if ((perto && linhaLivre(g, d, loc.destino)) || !passo) {
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
  const d = direcaoDe(getComponent(state, id, 'position')!);
  const visao = statsMovel(getComponent(state, id, 'unit')!.tipo).visao_m;
  return entitiesWith(state, 'owner', 'position').some((outro) => {
    if (getComponent(state, outro, 'owner')!.nacao === dono) return false;
    return distanciaM(ctx, d, direcaoDe(getComponent(state, outro, 'position')!)) <= visao;
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

function passo(ctx: SystemContext, g: Navegavel | null, id: EntityId, dt: number): void {
  const { state } = ctx;
  const s = statsMovel(getComponent(state, id, 'unit')!.tipo);
  const aerea = s.camada === 'ar';
  const loc = getComponent(state, id, 'locomotion')!;
  const pos = getComponent(state, id, 'position')!;
  const ordem = getComponent(state, id, 'order')!;
  const R = raioDoMundo(ctx);
  const d = direcaoDe(pos);
  // O rumo é mantido tangente (a separação e o arredondamento podem desviá-lo um pouco).
  let rumo: Vec3 = tangente(d, loc.rumo) ?? norteEm(d);

  if (aerea && !atualizarAr(ctx, id, loc, dt)) {
    loc.speed = 0;
    loc.rumo = rumo;
    return;
  }

  const alvo = ordem.tipo === 'manter' ? null : proximoAlvo(ctx, g, id, loc, d);
  const velMax = Math.min(s.vel_m_s, loc.limiteVel ?? Infinity);
  // MOV-03: da parada à velocidade máxima em aceleracao_*_s.
  const aceleracao = s.vel_m_s / param(aerea ? 'aceleracao_ar_s' : 'aceleracao_solo_s');
  let velAlvo = 0;
  if (alvo) {
    const desejado = tangente(d, alvo);
    if (desejado) {
      const giro = ((s.giro_graus_s * Math.PI) / 180) * dt;
      const delta = anguloNoPlano(d, rumo, desejado);
      rumo = normalizar(girar(rumo, d, Math.max(-giro, Math.min(giro, delta))));
      const desalinhado = Math.abs(anguloNoPlano(d, rumo, desejado)) > Math.PI / 4;
      velAlvo = desalinhado ? velMax * 0.25 : velMax;
    }
    if (loc.rota.length === 1 && !loc.fluxo) {
      velAlvo = Math.min(velAlvo, Math.sqrt(2 * aceleracao * distanciaM(ctx, d, alvo)));
    }
    loc.ocioso_s = 0;
  } else if (ordem.tipo !== 'patrulhar') {
    loc.ocioso_s += dt;
  }
  const dv = aceleracao * dt;
  loc.speed =
    loc.speed < velAlvo ? Math.min(velAlvo, loc.speed + dv) : Math.max(velAlvo, loc.speed - dv);

  const angulo = (loc.speed * dt) / R;
  let novo = d;
  if (angulo > 0) {
    const cheio = avancar(d, rumo, angulo);
    // MOV-01: terreno intransponível barra hovers; eles deslizam pela borda quando dá.
    if (aerea || livreEm(g, cheio.p)) {
      novo = cheio.p;
      rumo = cheio.rumo;
    } else {
      const lateral = [Math.PI / 4, -Math.PI / 4]
        .map((a) => avancar(d, normalizar(girar(rumo, d, a)), angulo * Math.SQRT1_2))
        .find((t) => livreEm(g, t.p));
      if (lateral) novo = lateral.p;
      else loc.speed = 0;
    }
  }
  posicionar(ctx, pos, novo, 0);
  loc.rumo = tangente(novo, rumo) ?? rumo;

  // Unidade presa (aglomeração, funil ou quina): se em TEMPO_TRAVADO_S não se afastou
  // DESLOCAMENTO_MINIMO_M da âncora, contando o efeito da separação, refaz a rota por A*.
  // A posição de início do tick já inclui a separação do tick anterior.
  if (!alvo) {
    loc.travado_s = 0;
    loc.ancora = null;
  } else if (!loc.ancora || distanciaM(ctx, loc.ancora, d) >= DESLOCAMENTO_MINIMO_M) {
    loc.travado_s = 0;
    loc.ancora = d;
  } else {
    loc.travado_s += dt;
    if (loc.travado_s >= TEMPO_TRAVADO_S) {
      loc.travado_s = 0;
      loc.ancora = d;
      tracarRota(g, loc, novo, aerea);
    }
  }
}

/** Corpo que ocupa o solo para colisão: hovers e drones pousados. */
function noSolo(ctx: SystemContext, id: EntityId): boolean {
  const ar = getComponent(ctx.state, id, 'air');
  return !ar || ar.estado === 'pousado';
}

/** Desloca a direção d por um vetor tangente (m) e devolve a nova direção. */
function deslocar(d: Vec3, v: Vec3, R: number): Vec3 {
  return normalizar([d[0] + v[0] / R, d[1] + v[1] / R, d[2] + v[2] / R]);
}

/**
 * MOV-04: separação suave por correção de posição (sem velocidade, sem tremer).
 * Hovers entre si e drones em voo entre si; quem mantém posição não é empurrado.
 * As posições são tratadas na esfera de raio `raio_m` (a altura é refeita depois).
 */
function separar(ctx: SystemContext, g: Navegavel | null, ids: EntityId[]): void {
  const { state } = ctx;
  const R = raioDoMundo(ctx);
  const dirs = new Map<EntityId, Vec3>(
    ids.map((id) => [id, direcaoDe(getComponent(state, id, 'position')!)]),
  );
  const baldes = new Map<string, EntityId[]>();
  const celula = (d: Vec3) => d.map((v) => Math.floor((v * R) / BALDE_M)) as Vec3;
  const chave = (solo: boolean, c: Vec3) => `${solo ? 's' : 'a'}:${c[0]}:${c[1]}:${c[2]}`;
  for (const id of ids) {
    const k = chave(noSolo(ctx, id), celula(dirs.get(id)!));
    const lista = baldes.get(k);
    if (lista) lista.push(id);
    else baldes.set(k, [id]);
  }
  const peso = (id: EntityId) => (getComponent(state, id, 'order')!.tipo === 'manter' ? 0 : 1);
  for (const id of ids) {
    const solo = noSolo(ctx, id);
    const ra = statsMovel(getComponent(state, id, 'unit')!.tipo).raio_m;
    const c = celula(dirs.get(id)!);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          for (const outro of baldes.get(chave(solo, [c[0] + dx, c[1] + dy, c[2] + dz])) ?? []) {
            if (outro <= id) continue;
            const p = dirs.get(id)!;
            const q = dirs.get(outro)!;
            const rb = statsMovel(getComponent(state, outro, 'unit')!.tipo).raio_m;
            const dist = R * arco(p, q);
            const sobreposicao = ra + rb - dist;
            if (sobreposicao <= 0.01) continue;
            let u = tangente(p, q);
            if (!u || dist < 1e-6) {
              // Mesma posição: direção determinística pelo par de IDs.
              u = normalizar(girar(norteEm(p), p, (id * 2.399963 + outro * 0.618034) % TAU));
            }
            const [pa, pb] = [peso(id), peso(outro)];
            const [wa, wb] = pa + pb === 0 ? [0.5, 0.5] : [pa / (pa + pb), pb / (pa + pb)];
            const novoP = deslocar(
              p,
              [-u[0] * sobreposicao * wa, -u[1] * sobreposicao * wa, -u[2] * sobreposicao * wa],
              R,
            );
            const novoQ = deslocar(
              q,
              [u[0] * sobreposicao * wb, u[1] * sobreposicao * wb, u[2] * sobreposicao * wb],
              R,
            );
            if (!solo || livreEm(g, novoP)) dirs.set(id, novoP);
            if (!solo || livreEm(g, novoQ)) dirs.set(outro, novoQ);
          }
        }
      }
    }
  }
  // Obstáculos rígidos empurram unidades de solo para fora.
  const obstaculos = entitiesWith(state, 'obstacle', 'position').map((o) => ({
    d: direcaoDe(getComponent(state, o, 'position')!),
    raio: getComponent(state, o, 'obstacle')!.raio,
  }));
  for (const id of ids) {
    if (!noSolo(ctx, id)) continue;
    const r = statsMovel(getComponent(state, id, 'unit')!.tipo).raio_m;
    for (const o of obstaculos) {
      const p = dirs.get(id)!;
      const raio = o.raio + r;
      const dist = R * arco(p, o.d);
      if (dist >= raio) continue;
      const fora = tangente(o.d, p) ?? norteEm(o.d);
      dirs.set(id, avancar(o.d, fora, raio / R).p);
    }
  }
  for (const id of ids) posicionar(ctx, getComponent(state, id, 'position')!, dirs.get(id)!, 0);
}

function ajustarAltura(ctx: SystemContext, ids: EntityId[]): void {
  const { state } = ctx;
  for (const id of ids) {
    const pos = getComponent(state, id, 'position')!;
    const d = direcaoDe(pos);
    const chao = chaoEm(ctx, d) + ALTURA_HOVER_M;
    const ar = getComponent(state, id, 'air');
    let altura = chao;
    if (ar && ar.estado !== 'pousado') {
      // MOV-02: altitude radial acima da esfera de raio `raio_m`.
      const alto = altitudeDrone();
      if (ar.estado === 'voando') {
        altura = alto;
      } else {
        const total = param(ar.estado === 'pousando' ? 'tempo_pouso_s' : 'tempo_decolagem_s');
        const t = Math.max(0, Math.min(1, ar.timer_s / total));
        altura = ar.estado === 'pousando' ? chao + (alto - chao) * t : alto + (chao - alto) * t;
      }
    }
    posicionar(ctx, pos, d, altura);
  }
}

export function sistemaMovimento(ctx: SystemContext): void {
  const g = navegavel(ctx);
  const ids = entitiesWith(ctx.state, 'unit', 'locomotion', 'position');
  for (const id of ids) passo(ctx, g, id, ctx.dt);
  separar(ctx, g, ids);
  ajustarAltura(ctx, ids);
}
