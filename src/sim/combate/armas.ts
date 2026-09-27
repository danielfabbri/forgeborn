/**
 * Aquisição de alvo, posturas, perseguição e disparo (CMB-04, CMB-06 a CMB-08, CMB-12 a
 * CMB-18, D-31, D-32).
 *
 * Unidades Agressivas ou Defensivas engajam inimigos na visão e perseguem dentro da coleira;
 * Manter posição e "mover" só disparam no alcance; Passiva e "mover ignorando" não disparam.
 * Estruturas armadas disparam em qualquer alvo no alcance, com energia da rede (ENE-03).
 */
import type { ComponentMap, Ponto } from '../core/components';
import { createEntity, entitiesWith, getComponent, isAlive, setComponent } from '../core/entities';
import type { SystemContext } from '../core/pipeline';
import type { SimState } from '../core/state';
import type { EntityId, NacaoId } from '../core/types';
import { type ArmasRow, dados, param } from '../data';
import { emReserva, gastar } from '../energia/bateria';
import { avancar, norteEm, tangente, type Vec3 } from '../map/esfera';
import { bordaDe, pararNoLugar } from '../producao/alcance';
import { tracarRota } from '../units/movimento';
import { navegavelDe } from '../units/navegacao';
import { visivelPara } from '../visao/nevoa';
import { ALTURA_HOVER_M, statsMovel } from '../units/stats';
import { chaoEm, direcaoDe, distanciaM, posicionar, raioDoMundo } from '../units/superficie';
import { aplicarDano, camadaDe, danoContra, type TipoDeDano } from './dano';
import { multVisao } from '../cenario/tempestade';

const armas = new Map(dados.armas.map((a) => [a.id, a]));

export function armaDe(id: string): ArmasRow {
  return armas.get(id as ArmasRow['id'])!;
}

/** CMB-04: a arma atinge a camada do alvo? */
function atingeCamada(arma: ArmasRow, camada: 'solo' | 'ar'): boolean {
  return arma.alvos.includes(camada);
}

function nacaoDe(state: SimState, id: EntityId): NacaoId | undefined {
  return getComponent(state, id, 'owner')?.nacao;
}

/** Alvo que a arma pode atacar agora (inimigo vivo, na camada certa, visível). */
export function alvoValido(
  ctx: SystemContext,
  atirador: EntityId,
  alvo: EntityId,
  arma: ArmasRow,
): boolean {
  const { state } = ctx;
  if (!isAlive(state, alvo)) return false;
  const vida = getComponent(state, alvo, 'vida');
  if (!vida || vida.hp <= 0) return false;
  const dono = nacaoDe(state, alvo);
  const nacao = nacaoDe(state, atirador);
  if (!dono || !nacao || dono === nacao) return false;
  if (!atingeCamada(arma, camadaDe(state, alvo))) return false;
  // Só o que a nação vê: furtivos só revelados (VIS-05, CMB-20, CMB-22).
  return visivelPara(ctx, nacao, alvo);
}

/** CMB-12: classe de prioridade (menor = antes). */
function prioridade(state: SimState, atirador: EntityId, alvo: EntityId): number {
  const combate = getComponent(state, atirador, 'combate');
  if (combate?.ultimoAtacante === alvo && combate.semDano_s < param('estado_combate_s')) {
    return 1;
  }
  const armado = getComponent(state, alvo, 'arma') !== undefined;
  if (getComponent(state, alvo, 'unit')) return armado ? 2 : 3;
  if (getComponent(state, alvo, 'structure')) return armado ? 4 : 5;
  return 6;
}

/** Distância (m) do centro do atirador até a borda do alvo. */
function distanciaAoAlvo(ctx: SystemContext, atirador: EntityId, alvo: EntityId): number {
  const da = direcaoDe(getComponent(ctx.state, atirador, 'position')!);
  const dv = direcaoDe(getComponent(ctx.state, alvo, 'position')!);
  return Math.max(0, distanciaM(ctx, da, dv) - bordaDe(ctx, alvo));
}

/** CMB-08: onde o alvo estará daqui a `bomba_tempo_queda_s` (mira preditiva). */
export function pontoPrevisto(ctx: SystemContext, alvo: EntityId): Vec3 {
  const d = direcaoDe(getComponent(ctx.state, alvo, 'position')!);
  const loc = getComponent(ctx.state, alvo, 'locomotion');
  if (!loc || loc.speed <= 0) return d;
  const rumo = tangente(d, loc.rumo) ?? norteEm(d);
  return avancar(d, rumo, (loc.speed * param('bomba_tempo_queda_s')) / raioDoMundo(ctx)).p;
}

/** CMB-16: dano já a caminho de cada alvo (projéteis em voo e disparos deste tick). */
export type Pendente = Map<EntityId, number>;

export function danoPendente(state: SimState): Pendente {
  const pendente: Pendente = new Map();
  for (const id of entitiesWith(state, 'projetil')) {
    const p = getComponent(state, id, 'projetil')!;
    if (p.alvo !== null) pendente.set(p.alvo, (pendente.get(p.alvo) ?? 0) + p.dano);
  }
  return pendente;
}

interface Candidato {
  id: EntityId;
  classe: number;
  distancia: number;
  hp: number;
}

/**
 * CMB-12/CMB-16: o melhor alvo entre os válidos a até `raio` do atirador (e, com coleira, a
 * até `coleira + alcance` da origem).
 */
function escolherAlvo(
  ctx: SystemContext,
  atirador: EntityId,
  arma: ArmasRow,
  raio: number,
  coleira: { origem: Vec3; metros: number } | null,
  pendente: Pendente,
): EntityId | null {
  const { state } = ctx;
  const candidatos: Candidato[] = [];
  for (const id of entitiesWith(state, 'vida', 'owner', 'position')) {
    if (!alvoValido(ctx, atirador, id, arma)) continue;
    const distancia = distanciaAoAlvo(ctx, atirador, id);
    if (distancia > raio) continue;
    if (coleira) {
      const dv = direcaoDe(getComponent(state, id, 'position')!);
      if (
        distanciaM(ctx, coleira.origem, dv) - bordaDe(ctx, id) >
        coleira.metros + arma.alcance_m
      ) {
        continue;
      }
    }
    candidatos.push({
      id,
      classe: prioridade(state, atirador, id),
      distancia,
      hp: getComponent(state, id, 'vida')!.hp,
    });
  }
  if (candidatos.length === 0) return null;
  // CMB-16: sem desperdício — evita quem já vai morrer com o dano a caminho, se houver outro.
  const uteis = candidatos.filter((c) => (pendente.get(c.id) ?? 0) < c.hp);
  const lista = uteis.length > 0 ? uteis : candidatos;
  lista.sort(
    (a, b) => a.classe - b.classe || a.distancia - b.distancia || a.hp - b.hp || a.id - b.id,
  );
  return lista[0]!.id;
}

/** Leva a unidade a `ponto`, refazendo a rota só quando o ponto andou. */
function perseguir(
  ctx: SystemContext,
  id: EntityId,
  arma: ComponentMap['arma'],
  ponto: Ponto,
): void {
  if (arma.perseguindo && distanciaM(ctx, arma.perseguindo, ponto) < 1.5) return;
  const loc = getComponent(ctx.state, id, 'locomotion')!;
  const aerea = statsMovel(getComponent(ctx.state, id, 'unit')!.tipo).camada === 'ar';
  loc.destino = ponto;
  loc.limiteVel = null;
  loc.travado_s = 0;
  loc.ancora = null;
  tracarRota(navegavelDe(ctx, id), loc, direcaoDe(getComponent(ctx.state, id, 'position')!), aerea);
  arma.perseguindo = ponto;
}

function pararPerseguicao(ctx: SystemContext, id: EntityId, arma: ComponentMap['arma']): void {
  if (arma.perseguindo) pararNoLugar(ctx, id);
  arma.perseguindo = null;
}

/** Dispara no alvo (CMB-06 a CMB-08); o custo de energia já foi pago. */
function disparar(
  ctx: SystemContext,
  atirador: EntityId,
  arma: ArmasRow,
  alvo: EntityId,
  pendente: Pendente,
): void {
  const { state } = ctx;
  const nacao = nacaoDe(state, atirador)!;
  const tipo = arma.tipo_dano as TipoDeDano;
  ctx.emit('disparo', { atirador, alvo, arma: arma.id });
  if (arma.projetil === 'hitscan') {
    aplicarDano(ctx, alvo, arma.dano, tipo, atirador, nacao);
    return;
  }
  const dano = danoContra(state, alvo, arma.dano, tipo);
  const origem = getComponent(state, atirador, 'position')!;
  const da = direcaoDe(origem);
  const id = createEntity(state);
  const bomba = arma.projetil === 'balistico';
  const pos = { x: 0, y: 0, z: 0 };
  const altura = bomba
    ? Math.hypot(origem.x, origem.y, origem.z) - raioDoMundo(ctx)
    : chaoEm(ctx, da) + ALTURA_HOVER_M;
  posicionar(ctx, pos, da, altura);
  setComponent(state, id, 'position', pos);
  setComponent(state, id, 'projetil', {
    tipo: bomba ? 'bomba' : 'torpedo',
    arma: arma.id,
    atirador,
    nacao,
    alvo,
    ponto: bomba ? pontoPrevisto(ctx, alvo) : direcaoDe(getComponent(state, alvo, 'position')!),
    voo_s: 0,
    dano,
  });
  pendente.set(alvo, (pendente.get(alvo) ?? 0) + dano);
}

/** CTL-11: disparo do controle direto no alvo (já pago). */
export function dispararEm(
  ctx: SystemContext,
  atirador: EntityId,
  arma: ArmasRow,
  alvo: EntityId,
): void {
  disparar(ctx, atirador, arma, alvo, danoPendente(ctx.state));
}

/** D-40: torpedo sem trava, reto no rumo, a partir do atirador. */
export function dispararReto(
  ctx: SystemContext,
  atirador: EntityId,
  arma: ArmasRow,
  rumo: Vec3,
): void {
  const { state } = ctx;
  const nacao = nacaoDe(state, atirador)!;
  const da = direcaoDe(getComponent(state, atirador, 'position')!);
  const id = createEntity(state);
  const pos = { x: 0, y: 0, z: 0 };
  posicionar(ctx, pos, da, chaoEm(ctx, da) + ALTURA_HOVER_M);
  setComponent(state, id, 'position', pos);
  setComponent(state, id, 'projetil', {
    tipo: 'torpedo',
    arma: arma.id,
    atirador,
    nacao,
    alvo: null,
    ponto: da,
    voo_s: 0,
    dano: arma.dano,
    rumo,
  });
  ctx.emit('disparo', { atirador, alvo: null, arma: arma.id });
}

/** CTL-11: bomba do controle direto no ponto de impacto previsto. */
export function soltarBomba(
  ctx: SystemContext,
  atirador: EntityId,
  arma: ArmasRow,
  ponto: Vec3,
): void {
  const { state } = ctx;
  const nacao = nacaoDe(state, atirador)!;
  const origem = getComponent(state, atirador, 'position')!;
  const id = createEntity(state);
  const pos = { x: 0, y: 0, z: 0 };
  posicionar(
    ctx,
    pos,
    direcaoDe(origem),
    Math.hypot(origem.x, origem.y, origem.z) - raioDoMundo(ctx),
  );
  setComponent(state, id, 'position', pos);
  setComponent(state, id, 'projetil', {
    tipo: 'bomba',
    arma: arma.id,
    atirador,
    nacao,
    alvo: null,
    ponto,
    voo_s: 0,
    dano: arma.dano,
  });
  ctx.emit('disparo', { atirador, alvo: null, arma: arma.id, ponto });
}

/** Alvo dentro do alcance da arma (CTL-11 usa a mesma regra). */
export function noAlcance(
  ctx: SystemContext,
  id: EntityId,
  arma: ArmasRow,
  alvo: EntityId,
): boolean {
  return noAlcanceDeTiro(ctx, id, arma, alvo);
}

/** Paga e dispara, se a arma está pronta e o alvo no alcance. */
function tentarDisparo(
  ctx: SystemContext,
  id: EntityId,
  componente: ComponentMap['arma'],
  arma: ArmasRow,
  alvo: EntityId,
  pendente: Pendente,
): void {
  if (componente.recarga_s > 1e-9) return;
  if (!noAlcanceDeTiro(ctx, id, arma, alvo)) return;
  if (arma.fonte_en === 'bateria') {
    const b = getComponent(ctx.state, id, 'bateria');
    if (b && b.en < arma.en_disparo - 1e-9) return;
    gastar(ctx, id, arma.en_disparo);
  }
  disparar(ctx, id, arma, alvo, pendente);
  componente.recarga_s = arma.recarga_s ?? 0;
}

/** Alvo entre o alcance mínimo e o máximo (bomba: ponto previsto na horizontal, CMB-08). */
function noAlcanceDeTiro(
  ctx: SystemContext,
  id: EntityId,
  arma: ArmasRow,
  alvo: EntityId,
): boolean {
  if (arma.projetil === 'balistico') {
    const da = direcaoDe(getComponent(ctx.state, id, 'position')!);
    return distanciaM(ctx, da, pontoPrevisto(ctx, alvo)) <= arma.alcance_m;
  }
  const distancia = distanciaAoAlvo(ctx, id, alvo);
  return distancia <= arma.alcance_m && distancia >= arma.alcance_min_m;
}

/** CMB-13: metros de coleira da postura. */
function coleiraDa(postura: ComponentMap['arma']['postura']): number | null {
  if (postura === 'agressiva') return param('leash_agressivo_m');
  if (postura === 'defensiva') return param('leash_defensivo_m');
  return null;
}

/** Estrutura armada: qualquer alvo válido no alcance, com energia da rede (ENE-03, ENE-04). */
function passoEstrutura(ctx: SystemContext, id: EntityId, pendente: Pendente): void {
  const componente = getComponent(ctx.state, id, 'arma')!;
  const arma = armaDe(componente.id);
  componente.recarga_s = Math.max(0, componente.recarga_s - ctx.dt * componente.atendido);
  const alvo = escolherAlvo(ctx, id, arma, arma.alcance_m, null, pendente);
  componente.alvo = alvo;
  // A rede atende no próximo tick a demanda deste (a torre em racionamento dispara mais devagar).
  componente.demanda_en_s = alvo !== null && arma.recarga_s ? arma.en_disparo / arma.recarga_s : 0;
  if (alvo !== null) {
    const pronta = componente.recarga_s <= 1e-9;
    if (pronta && noAlcanceDeTiro(ctx, id, arma, alvo)) {
      disparar(ctx, id, arma, alvo, pendente);
      componente.recarga_s = arma.recarga_s ?? 0;
    }
  }
}

/** Volta à ordem de patrulha ou de ataque-movimento interrompida pelo engajamento. */
function retomarOrdem(ctx: SystemContext, id: EntityId, componente: ComponentMap['arma']): void {
  const r = componente.retomar!;
  const ordem = getComponent(ctx.state, id, 'order')!;
  const loc = getComponent(ctx.state, id, 'locomotion')!;
  ordem.tipo = r.tipo;
  ordem.patrulha = r.patrulha;
  loc.destino = r.destino;
  const aerea = statsMovel(getComponent(ctx.state, id, 'unit')!.tipo).camada === 'ar';
  tracarRota(navegavelDe(ctx, id), loc, direcaoDe(getComponent(ctx.state, id, 'position')!), aerea);
  componente.retomar = null;
  componente.origem = null;
  componente.perseguindo = null;
}

/** Unidade armada: alvo, perseguição dentro da coleira, recuo (D-31) e disparo. */
function passoUnidade(ctx: SystemContext, id: EntityId, pendente: Pendente): void {
  const { state } = ctx;
  const componente = getComponent(state, id, 'arma')!;
  const arma = armaDe(componente.id);
  componente.recarga_s = Math.max(0, componente.recarga_s - ctx.dt);
  const ordem = getComponent(state, id, 'order')!;
  const recarga = getComponent(state, id, 'recarga');
  const ar = getComponent(state, id, 'air');
  const d = direcaoDe(getComponent(state, id, 'position')!);
  // D-44: em controle direto, só o jogador dispara (pilotagem.ts).
  if (getComponent(state, id, 'pilotado')) {
    componente.alvo = null;
    return;
  }
  // CMB-15: a ordem de ataque direta vale mesmo na postura Passiva.
  const inativa =
    (componente.postura === 'passiva' && ordem.tipo !== 'atacar') ||
    ordem.tipo === 'mover_ignorando' ||
    ordem.tipo === 'tarefa' ||
    (recarga !== undefined && recarga.estado !== 'nenhuma') ||
    (ar !== undefined && ar.estado !== 'voando') ||
    emReserva(ctx, id);
  if (inativa) {
    componente.alvo = null;
    return;
  }

  // CMB-15: ataque direto.
  if (ordem.tipo === 'atacar') {
    const alvo = componente.alvoDireto;
    if (alvo === null || !alvoValido(ctx, id, alvo, arma)) {
      ordem.tipo = 'nenhuma';
      componente.alvoDireto = null;
      componente.alvo = null;
      pararPerseguicao(ctx, id, componente);
      return;
    }
    componente.alvo = alvo;
    mover(ctx, id, componente, arma, alvo);
    tentarDisparo(ctx, id, componente, arma, alvo, pendente);
    return;
  }

  const manter = ordem.tipo === 'manter' || componente.postura === 'manter';
  const soNoAlcance = manter || ordem.tipo === 'mover';
  const visao = statsMovel(getComponent(state, id, 'unit')!.tipo).visao_m * multVisao(state);
  const metros = coleiraDa(componente.postura);

  // Patrulha e ataque-movimento (CMB-14): engajam o que aparecer na visão e depois retomam.
  if (ordem.tipo === 'patrulhar' || ordem.tipo === 'atacar_mover') {
    const alvo = escolherAlvo(
      ctx,
      id,
      arma,
      visao,
      metros ? { origem: d, metros } : null,
      pendente,
    );
    if (alvo === null) {
      componente.alvo = null;
      return;
    }
    componente.retomar = {
      tipo: ordem.tipo,
      patrulha: ordem.patrulha,
      destino: getComponent(state, id, 'locomotion')!.destino,
    };
    ordem.tipo = 'nenhuma';
    componente.origem = d;
  }

  const raio = soNoAlcance ? arma.alcance_m : visao;
  const coleira =
    !soNoAlcance && metros !== null ? { origem: componente.origem ?? d, metros } : null;
  const alvo = escolherAlvo(ctx, id, arma, raio, coleira, pendente);
  componente.alvo = alvo;
  if (alvo === null) {
    if (ordem.tipo !== 'nenhuma') return;
    pararPerseguicao(ctx, id, componente);
    if (componente.retomar) {
      retomarOrdem(ctx, id, componente);
    } else if (componente.origem) {
      // Sem alvo: volta à origem da coleira.
      if (distanciaM(ctx, d, componente.origem) > 1)
        perseguir(ctx, id, componente, componente.origem);
      else componente.origem = null;
    }
    return;
  }
  if (!soNoAlcance && ordem.tipo === 'nenhuma') {
    componente.origem ??= d;
    mover(ctx, id, componente, arma, alvo);
  }
  tentarDisparo(ctx, id, componente, arma, alvo, pendente);
}

/** Aproxima até o alcance, recua de dentro do alcance mínimo (D-31) ou para no alcance. */
function mover(
  ctx: SystemContext,
  id: EntityId,
  componente: ComponentMap['arma'],
  arma: ArmasRow,
  alvo: EntityId,
): void {
  const { state } = ctx;
  const d = direcaoDe(getComponent(state, id, 'position')!);
  const dv = direcaoDe(getComponent(state, alvo, 'position')!);
  if (arma.projetil === 'balistico') {
    // Bombardeiro: sobre o ponto previsto.
    const previsto = pontoPrevisto(ctx, alvo);
    if (distanciaM(ctx, d, previsto) > arma.alcance_m * 0.5)
      perseguir(ctx, id, componente, previsto);
    else pararPerseguicao(ctx, id, componente);
    return;
  }
  const distancia = distanciaAoAlvo(ctx, id, alvo);
  if (distancia > arma.alcance_m) {
    perseguir(ctx, id, componente, dv);
  } else if (distancia < arma.alcance_min_m) {
    const rumo = tangente(dv, d) ?? norteEm(dv);
    const recuo = bordaDe(ctx, alvo) + (arma.alcance_min_m + arma.alcance_m) / 2;
    perseguir(ctx, id, componente, avancar(dv, rumo, recuo / raioDoMundo(ctx)).p);
  } else {
    pararPerseguicao(ctx, id, componente);
  }
}

/** Sistema `combate` (TEC-06). */
export function sistemaCombate(ctx: SystemContext): void {
  const { state, dt } = ctx;
  for (const id of entitiesWith(state, 'combate')) {
    const combate = getComponent(state, id, 'combate')!;
    combate.semCombate_s += dt;
    combate.semDano_s += dt;
  }
  const pendente = danoPendente(state);
  for (const id of entitiesWith(state, 'arma', 'position')) {
    if (getComponent(state, id, 'autodestruicao')) continue;
    if (getComponent(state, id, 'structure')) passoEstrutura(ctx, id, pendente);
    else passoUnidade(ctx, id, pendente);
  }
}
