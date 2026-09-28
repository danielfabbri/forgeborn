/**
 * Cabos e redes (ENE-25 a ENE-29, UNI-15, D-85): estruturas prontas ligadas por cabos formam uma
 * rede; cada rede tem a geração, o banco e o consumo das próprias estruturas. O banco fica
 * guardado nas estruturas (`state.bancos`) e se divide quando uma rede se parte.
 */
import { entitiesWith, getComponent, isAlive } from '../core/entities';
import type { CommandHandler, SystemContext } from '../core/pipeline';
import type { SimState } from '../core/state';
import type { EntityId, NacaoId } from '../core/types';
import { param } from '../data';
import { arco } from '../map/esfera';
import { raioDaPegada } from '../units/criar';
import { statsEstrutura } from '../units/stats';
import { direcaoDe, raioDoMundo } from '../units/superficie';
import type { Vec3 } from '../map/esfera';
import type { EstruturasId } from '../data';

/** Estrutura pronta, viva e da nação (PRD-12: em obra não entra na rede). */
function pronta(state: SimState, id: EntityId, nacao?: NacaoId): boolean {
  if (!isAlive(state, id) || !getComponent(state, id, 'structure')) return false;
  if (getComponent(state, id, 'obra')) return false;
  return nacao === undefined || getComponent(state, id, 'owner')?.nacao === nacao;
}

/** ENE-26: a Nave e a Central de Distribuição alcançam mais longe. */
function alcanceDe(state: SimState, id: EntityId): number {
  const tipo = getComponent(state, id, 'structure')!.tipo;
  return tipo === 'ship' || tipo === 'power_hub'
    ? param('cabo_alcance_central_m')
    : param('cabo_alcance_m');
}

/** Distância (m) entre as bordas das pegadas de duas estruturas. */
export function distanciaEntreBordas(ctx: SystemContext, a: EntityId, b: EntityId): number {
  const { state } = ctx;
  const R = raioDoMundo(ctx);
  const da = direcaoDe(getComponent(state, a, 'position')!);
  const db = direcaoDe(getComponent(state, b, 'position')!);
  const ta = getComponent(state, a, 'structure')!.tipo;
  const tb = getComponent(state, b, 'structure')!.tipo;
  return R * arco(da, db) - raioDaPegada(ta) - raioDaPegada(tb);
}

/** ENE-26: o cabo entre as duas estruturas cabe no alcance? */
export function caboAlcanca(ctx: SystemContext, a: EntityId, b: EntityId): boolean {
  const alcance = Math.max(alcanceDe(ctx.state, a), alcanceDe(ctx.state, b));
  return distanciaEntreBordas(ctx, a, b) <= alcance + 1e-9;
}

export function temCabo(state: SimState, a: EntityId, b: EntityId): boolean {
  const [x, y] = a < b ? [a, b] : [b, a];
  return state.cabos.some(([p, q]) => p === x && q === y);
}

/** Liga as duas estruturas (sem conferir o alcance). */
export function ligarCabo(state: SimState, a: EntityId, b: EntityId): boolean {
  if (a === b || temCabo(state, a, b)) return false;
  state.cabos.push(a < b ? [a, b] : [b, a]);
  state.cabos.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  return true;
}

export function cabosDe(state: SimState, id: EntityId): EntityId[] {
  return state.cabos.filter(([a, b]) => a === id || b === id).map(([a, b]) => (a === id ? b : a));
}

/** ENE-27: tira os cabos cujas pontas deixaram de existir, e os bancos de quem morreu. */
export function limparCabos(state: SimState): void {
  state.cabos = state.cabos.filter(([a, b]) => isAlive(state, a) && isAlive(state, b));
  for (const k of Object.keys(state.bancos)) {
    if (!isAlive(state, Number(k))) delete state.bancos[Number(k)];
  }
}

/** ENE-25: as redes da nação (componentes conexos pelos cabos), cada uma em ordem de id. */
export function redesDa(state: SimState, nacao: NacaoId): EntityId[][] {
  const ids = entitiesWith(state, 'structure', 'owner').filter((id) => pronta(state, id, nacao));
  const pai = new Map<EntityId, EntityId>(ids.map((id) => [id, id]));
  const raiz = (x: EntityId): EntityId => {
    let r = x;
    while (pai.get(r)! !== r) r = pai.get(r)!;
    pai.set(x, r);
    return r;
  };
  for (const [a, b] of state.cabos) {
    if (!pai.has(a) || !pai.has(b)) continue;
    const ra = raiz(a);
    const rb = raiz(b);
    if (ra !== rb) pai.set(Math.max(ra, rb), Math.min(ra, rb));
  }
  const grupos = new Map<EntityId, EntityId[]>();
  for (const id of ids) {
    const r = raiz(id);
    const g = grupos.get(r) ?? [];
    g.push(id);
    grupos.set(r, g);
  }
  return [...grupos.values()].sort((a, b) => a[0]! - b[0]!);
}

/** A rede (membros) da estrutura, ou [] se ela não está pronta. */
export function redeDe(state: SimState, id: EntityId): EntityId[] {
  const nacao = getComponent(state, id, 'owner')?.nacao;
  if (!nacao) return [];
  return redesDa(state, nacao).find((g) => g.includes(id)) ?? [];
}

function capacidadeDe(state: SimState, membros: readonly EntityId[]): number {
  return membros.reduce(
    (s, id) => s + statsEstrutura(getComponent(state, id, 'structure')!.tipo).banco_en,
    0,
  );
}

/** A rede da Nave (a principal da nação), ou, sem Nave, a de maior capacidade. */
export function redePrincipal(state: SimState, nacao: NacaoId): EntityId[] {
  const redes = redesDa(state, nacao);
  const comNave = redes.find((g) =>
    g.some((id) => getComponent(state, id, 'structure')!.tipo === 'ship'),
  );
  if (comNave) return comNave;
  return (
    [...redes].sort(
      (a, b) => capacidadeDe(state, b) - capacidadeDe(state, a) || a[0]! - b[0]!,
    )[0] ?? []
  );
}

/** ENE-29: o tipo precisa de energia (gera, guarda, consome, dispara pela rede, tem portas)? */
export function tipoPrecisaDeEnergia(tipo: EstruturasId): boolean {
  const s = statsEstrutura(tipo);
  return (
    s.geracao_en_s > 0 ||
    s.banco_en > 0 ||
    s.portas > 0 ||
    s.manutencao_en_s > 0 ||
    s.arma != null ||
    TIPOS_QUE_CONSOMEM.has(tipo)
  );
}

/**
 * Estruturas que imprimem com a energia da rede (PRD-06). O Armazém funciona sem rede (ENE-29):
 * só o disparo do Abrigo depende dela.
 */
const TIPOS_QUE_CONSOMEM = new Set<string>(['satellite_uplink', 'missile_silo']);

/** ENE-29: a estrutura precisa de energia? */
export function precisaDeEnergia(state: SimState, id: EntityId): boolean {
  const tipo = getComponent(state, id, 'structure')?.tipo;
  return tipo !== undefined && tipoPrecisaDeEnergia(tipo as EstruturasId);
}

/**
 * IA-13: um canteiro de `tipo` em d alcançaria por cabo alguma estrutura da lista? (Raio da
 * pegada como borda.)
 */
export function alcancaAlguma(
  ctx: SystemContext,
  tipo: EstruturasId,
  d: Vec3,
  membros: readonly EntityId[],
): boolean {
  const R = raioDoMundo(ctx);
  const proprio = tipo === 'ship' || tipo === 'power_hub';
  return membros.some((id) => {
    const outro = getComponent(ctx.state, id, 'structure')!.tipo;
    const alcance =
      proprio || outro === 'ship' || outro === 'power_hub'
        ? param('cabo_alcance_central_m')
        : param('cabo_alcance_m');
    const dist =
      R * arco(d, direcaoDe(getComponent(ctx.state, id, 'position')!)) -
      raioDaPegada(tipo) -
      raioDaPegada(outro);
    return dist <= alcance + 1e-9;
  });
}

/** Banco (EN) guardado nas estruturas da lista. */
export function bancoDe(state: SimState, membros: readonly EntityId[]): number {
  return membros.reduce((s, id) => s + (state.bancos[id] ?? 0), 0);
}

/** Reparte `total` entre os membros na proporção do `banco_en` de cada um. */
export function repartirBanco(state: SimState, membros: readonly EntityId[], total: number): void {
  const soma = capacidadeDe(state, membros);
  for (const id of membros) {
    const cap = statsEstrutura(getComponent(state, id, 'structure')!.tipo).banco_en;
    if (cap > 0 && soma > 0) state.bancos[id] = (total * cap) / soma;
    else delete state.bancos[id];
  }
}

/** ENE-28: paga `en` do banco da rede da estrutura; false se não há o bastante. */
export function gastarDaRede(state: SimState, id: EntityId, en: number): boolean {
  const membros = redeDe(state, id);
  const banco = bancoDe(state, membros);
  if (banco < en - 1e-9) return false;
  repartirBanco(state, membros, banco - en);
  // A leitura da nação acompanha a rede da Nave.
  const nacao = getComponent(state, id, 'owner')!.nacao;
  const principal = redePrincipal(state, nacao);
  if (principal.includes(id)) {
    const rede = state.energia[nacao]!;
    rede.banco = rede.bancoEscrito = bancoDe(state, principal);
  }
  return true;
}

/** Banco (EN) disponível na rede da estrutura. */
export function bancoDaRedeDe(state: SimState, id: EntityId): number {
  return bancoDe(state, redeDe(state, id));
}

/** Enche o banco de todas as redes da nação (início de partida e depuração). */
export function encherBancos(state: SimState, nacao: NacaoId): void {
  for (const g of redesDa(state, nacao)) repartirBanco(state, g, capacidadeDe(state, g));
  const rede = state.energia[nacao]!;
  rede.banco = rede.bancoEscrito = bancoDe(state, redePrincipal(state, nacao));
}

export const comandosDeCabos: Record<string, CommandHandler> = {
  /** ENE-26: puxa um cabo entre duas estruturas próprias prontas, dentro do alcance. */
  ligar_cabo: (ctx, comando) => {
    const d = (comando.dados ?? {}) as { de?: unknown; para?: unknown };
    if (typeof d.de !== 'number' || typeof d.para !== 'number') return;
    if (!pronta(ctx.state, d.de, comando.nacao) || !pronta(ctx.state, d.para, comando.nacao)) {
      return;
    }
    if (!caboAlcanca(ctx, d.de, d.para)) return;
    if (ligarCabo(ctx.state, d.de, d.para)) ctx.emit('cabo', { de: d.de, para: d.para });
  },
  /** ENE-26: Desplugar — remove todos os cabos das estruturas. */
  desligar_cabos: (ctx, comando) => {
    const d = (comando.dados ?? {}) as { ids?: unknown };
    if (!Array.isArray(d.ids)) return;
    const ids = new Set(
      d.ids.filter(
        (id): id is number =>
          typeof id === 'number' && getComponent(ctx.state, id, 'owner')?.nacao === comando.nacao,
      ),
    );
    ctx.state.cabos = ctx.state.cabos.filter(([a, b]) => !ids.has(a) && !ids.has(b));
  },
};
