/**
 * Temperamento e domínio entre nações (REG-24 a REG-29, D-81, D-88). Todo par começa pacífico.
 * Unidade móvel de B no domínio de A (a até `dominio_estrutura_m` de uma estrutura ou
 * `dominio_unidade_m` de uma unidade de A) gera um aviso e o par fica em alerta; estrutura nunca
 * invade. No domínio de uma IA, se B continuar lá por `ultimato_s`, o par entra em guerra; no
 * domínio do jogador não há guerra automática: ele declara (Comando "declarar_guerra"). Dano entre
 * as duas abre a guerra na hora. A guerra esfria depois de `guerra_esfria_s` sem dano e sem invasão.
 */
import { entitiesWith, getComponent } from '../core/entities';
import type { CommandHandler, SystemContext } from '../core/pipeline';
import type { SimState } from '../core/state';
import type { EntityId, NacaoId } from '../core/types';
import { param } from '../data';
import { produtoEscalar, type Vec3 } from '../map/esfera';
import { direcaoDe, raioDoMundo } from '../units/superficie';

export type Temperamento = 'pacifico' | 'alerta' | 'inimigo';

export interface Relacao {
  guerra: boolean;
  /** REG-28: segundos seguidos sem dano e sem invasão (na guerra). */
  calma_s: number;
  /** REG-26: prazo (s) que a nação da chave deu à outra para sair do domínio dela. */
  avisos: Partial<Record<NacaoId, number>>;
}

/** De quanto em quanto tempo (ticks) os domínios são conferidos. */
const PERIODO_TICKS = 5;

export function chaveDoPar(a: NacaoId, b: NacaoId): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function relacao(state: SimState, a: NacaoId, b: NacaoId): Relacao {
  const k = chaveDoPar(a, b);
  return (state.relacoes[k] ??= { guerra: false, calma_s: 0, avisos: {} });
}

/** REG-24: as duas nações estão em guerra? */
export function emGuerra(state: SimState, a: NacaoId, b: NacaoId): boolean {
  if (a === b) return false;
  return state.relacoes[chaveDoPar(a, b)]?.guerra ?? false;
}

/** REG-24: o temperamento de `de` em relação a `para`. */
export function temperamento(state: SimState, de: NacaoId, para: NacaoId): Temperamento {
  const r = state.relacoes[chaveDoPar(de, para)];
  if (!r) return 'pacifico';
  if (r.guerra) return 'inimigo';
  return r.avisos[de] !== undefined ? 'alerta' : 'pacifico';
}

/** Prazo (s) que `de` deu a `para` para sair do domínio dela, ou null. */
export function prazoDoAviso(state: SimState, de: NacaoId, para: NacaoId): number | null {
  return state.relacoes[chaveDoPar(de, para)]?.avisos[de] ?? null;
}

function abrirGuerra(ctx: SystemContext, a: NacaoId, b: NacaoId): void {
  const r = relacao(ctx.state, a, b);
  r.calma_s = 0;
  if (r.guerra) return;
  r.guerra = true;
  r.avisos = {};
  ctx.emit('alerta', { id: 'AL-20', nacao: a, outra: b });
  ctx.emit('alerta', { id: 'AL-20', nacao: b, outra: a });
  ctx.emit('temperamento', { a, b, guerra: true });
}

/** REG-27: dano de `atacante` em `alvo` põe o par em guerra (e zera a calma). */
export function registrarDano(ctx: SystemContext, atacante: NacaoId, alvo: NacaoId): void {
  if (atacante === alvo) return;
  abrirGuerra(ctx, atacante, alvo);
}

/** Um corpo que marca domínio (REG-25): posição e raio. */
interface Marco {
  d: Vec3;
  /** cos do raio angular do domínio (comparado ao produto escalar, sem acos). */
  cosRaio: number;
  /** REG-26 (D-88): unidade móvel (só ela invade). */
  movel: boolean;
  /** REG-25 (D-88): marca domínio (falso para a unidade dentro da base alheia). */
  marca: boolean;
}

/** REG-26 (D-88): a nação é do jogador (não está sob controle da IA)? */
export function ehDoJogador(state: SimState, nacao: NacaoId): boolean {
  return state.ias[nacao] === undefined;
}

/** Corpos de cada nação que marcam domínio (minas e satélites não contam). */
function marcos(state: SimState, R: number): Map<NacaoId, Array<Marco & { id: EntityId }>> {
  const porNacao = new Map<NacaoId, Array<Marco & { id: EntityId }>>();
  const cosEstrutura = Math.cos(param('dominio_estrutura_m') / R);
  const cosUnidade = Math.cos(param('dominio_unidade_m') / R);
  for (const id of entitiesWith(state, 'owner', 'position')) {
    if (getComponent(state, id, 'mine') || getComponent(state, id, 'satelite')) continue;
    const estrutura = getComponent(state, id, 'structure');
    const unidade = getComponent(state, id, 'unit');
    if (!estrutura && !unidade) continue;
    // CMB-28: hover recolhido no abrigo não está no mapa.
    if (getComponent(state, id, 'abrigo')?.estado === 'dentro') continue;
    const nacao = getComponent(state, id, 'owner')!.nacao;
    const lista = porNacao.get(nacao) ?? [];
    lista.push({
      id,
      d: direcaoDe(getComponent(state, id, 'position')!),
      cosRaio: estrutura ? cosEstrutura : cosUnidade,
      movel: !estrutura,
      marca: true,
    });
    porNacao.set(nacao, lista);
  }
  // REG-25 (D-88): o domínio de uma unidade não vale dentro da base (domínio de estruturas) de
  // outra nação. A unidade continua lá como corpo (pode invadir); só não marca domínio.
  const bases = [...porNacao].map(
    ([nacao, lista]) => [nacao, lista.filter((m) => !m.movel)] as const,
  );
  for (const [nacao, lista] of porNacao) {
    for (const m of lista) {
      if (!m.movel) continue;
      m.marca = !bases.some(
        ([outra, estruturas]) =>
          outra !== nacao && estruturas.some((e) => produtoEscalar(e.d, m.d) > e.cosRaio),
      );
    }
  }
  return porNacao;
}

/** A primeira unidade móvel de B dentro do domínio de A (REG-25, REG-26), ou null. */
function invasor(
  dominio: readonly Marco[],
  corpos: ReadonlyArray<Marco & { id: EntityId }>,
): (Marco & { id: EntityId }) | null {
  for (const c of corpos) {
    if (!c.movel) continue;
    for (const m of dominio) {
      if (m.marca && produtoEscalar(m.d, c.d) > m.cosRaio) return c;
    }
  }
  return null;
}

/**
 * REG-25: consulta de domínio montada uma vez (para muitos pontos): as nações, fora `exceto`,
 * cujo domínio contém o ponto d.
 */
export function consultaDeDominio(ctx: SystemContext): (d: Vec3, exceto?: NacaoId) => NacaoId[] {
  const porNacao = marcos(ctx.state, raioDoMundo(ctx));
  return (d, exceto) => {
    const donos: NacaoId[] = [];
    for (const [nacao, lista] of porNacao) {
      if (nacao === exceto) continue;
      if (lista.some((m) => m.marca && produtoEscalar(m.d, d) > m.cosRaio)) donos.push(nacao);
    }
    return donos.sort();
  };
}

/** REG-25: nações (fora `exceto`) cujo domínio contém o ponto d. */
export function donosDoDominio(ctx: SystemContext, d: Vec3, exceto?: NacaoId): NacaoId[] {
  return consultaDeDominio(ctx)(d, exceto);
}

/** Sistema do temperamento: avisos, prazos, guerra por invasão e trégua (REG-26, REG-28). */
export function sistemaTemperamento(ctx: SystemContext): void {
  const { state } = ctx;
  if (ctx.tick % PERIODO_TICKS !== 0) return;
  const passo = PERIODO_TICKS * ctx.dt;
  const R = raioDoMundo(ctx);
  const porNacao = marcos(state, R);
  const vivas = state.nacoes.filter((n) => !state.placar[n]?.eliminada);
  for (let i = 0; i < vivas.length; i++) {
    for (let j = i + 1; j < vivas.length; j++) {
      const a = vivas[i]!;
      const b = vivas[j]!;
      const deA = porNacao.get(a) ?? [];
      const deB = porNacao.get(b) ?? [];
      const bEmA = invasor(deA, deB);
      const aEmB = invasor(deB, deA);
      const r = relacao(state, a, b);
      if (r.guerra) {
        r.calma_s = bEmA || aEmB ? 0 : r.calma_s + passo;
        if (r.calma_s >= param('guerra_esfria_s') - 1e-9) {
          r.guerra = false;
          r.calma_s = 0;
          ctx.emit('alerta', { id: 'AL-21', nacao: a, outra: b });
          ctx.emit('alerta', { id: 'AL-21', nacao: b, outra: a });
          ctx.emit('temperamento', { a, b, guerra: false });
        }
        continue;
      }
      for (const [dono, intruso, corpo] of [
        [a, b, bEmA],
        [b, a, aEmB],
      ] as const) {
        if (!corpo) {
          delete r.avisos[dono];
          continue;
        }
        const prazo = r.avisos[dono];
        const doJogador = ehDoJogador(state, dono);
        if (prazo === undefined) {
          r.avisos[dono] = param('ultimato_s');
          // D-88: o jogador avisado ouve AL-19; o dono jogador recebe AL-22 (com Declarar guerra).
          if (doJogador)
            ctx.emit('alerta', { id: 'AL-22', nacao: dono, outra: intruso, d: corpo.d });
          else ctx.emit('alerta', { id: 'AL-19', nacao: intruso, outra: dono, d: corpo.d });
          continue;
        }
        r.avisos[dono] = Math.max(0, prazo - passo);
        // No domínio do jogador o prazo só orienta a IA intrusa: a guerra é decisão dele (REG-29).
        if (!doJogador && r.avisos[dono]! <= 1e-9) {
          abrirGuerra(ctx, dono, intruso);
          break;
        }
      }
    }
  }
}

export const DECLARAR_GUERRA_COMMAND = 'declarar_guerra';

export const comandosDoTemperamento: Record<string, CommandHandler> = {
  /** REG-29 (D-88): a nação que envia declara guerra a `nacao`. */
  [DECLARAR_GUERRA_COMMAND]: (ctx, comando) => {
    const outra = (comando.dados as { nacao?: unknown } | null)?.nacao;
    const { state } = ctx;
    if (typeof outra !== 'string' || outra === comando.nacao) return;
    if (!state.nacoes.includes(outra as NacaoId) || state.placar[outra as NacaoId]?.eliminada)
      return;
    abrirGuerra(ctx, comando.nacao, outra as NacaoId);
  },
};
