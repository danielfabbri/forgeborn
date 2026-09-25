/**
 * Navegação da partida: grade do mapa + células bloqueadas por obstáculos rígidos (MOV-04).
 * Tudo aqui é derivado do estado e do mundo, guardado em cache fora do snapshot.
 */
import type { Ponto } from '../core/components';
import { entitiesWith, getComponent } from '../core/entities';
import type { SystemContext } from '../core/pipeline';
import type { SimState } from '../core/state';
import { celulasNoRaio } from '../map/conectividade';
import { avancar } from '../map/esfera';
import { campoDeFluxo, type Navegavel } from '../map/pathfinding';
import type { NacaoId } from '../core/types';
import { dados } from '../data';
import { minasReveladas } from '../visao/nevoa';
import { direcaoDe } from './superficie';

interface Cache {
  versao: number;
  navegavel: Navegavel;
  fluxos: Map<string, Int32Array>;
}

const caches = new WeakMap<SimState, Cache>();

/** Marca as células do obstáculo: o círculo, ou os círculos ao longo do eixo (D-56). */
function marcar(ctx: SystemContext, bloqueado: Uint8Array, id: number): void {
  const nav = ctx.mundo!.grades.navegacao;
  const o = getComponent(ctx.state, id, 'obstacle')!;
  const d = direcaoDe(getComponent(ctx.state, id, 'position')!);
  if (!o.meio || !o.eixo) {
    for (const c of celulasNoRaio(nav, d, o.raio)) bloqueado[c] = 1;
    return;
  }
  const R = nav.raio_m;
  const passo = Math.max(0.25, nav.celula_m / 2);
  const n = Math.ceil((2 * o.meio) / passo);
  // O segmento é mais fino que a célula: bloqueia toda célula que ele toca (sem frestas).
  const raio = o.raio + nav.celula_m / 2;
  for (let k = 0; k <= n; k++) {
    const p = avancar(d, o.eixo, (-o.meio + (2 * o.meio * k) / n) / R).p;
    for (const c of celulasNoRaio(nav, p, raio)) bloqueado[c] = 1;
  }
}

const ehPortao = (ctx: SystemContext, id: number) =>
  getComponent(ctx.state, id, 'portao') !== undefined;

function montar(ctx: SystemContext, incluir: (id: number) => boolean): Uint8Array {
  const bloqueado = new Uint8Array(ctx.mundo!.grades.navegacao.esfera.celulas);
  for (const id of entitiesWith(ctx.state, 'obstacle', 'position')) {
    if (incluir(id)) marcar(ctx, bloqueado, id);
  }
  return bloqueado;
}

export function navegavel(ctx: SystemContext): Navegavel | null {
  if (!ctx.mundo) return null;
  const { state } = ctx;
  const atual = caches.get(state);
  if (
    atual &&
    atual.versao === state.versaoObstaculos &&
    atual.navegavel.nav === ctx.mundo.grades.navegacao
  ) {
    return atual.navegavel;
  }
  const nav = ctx.mundo.grades.navegacao;
  const novo: Cache = {
    versao: state.versaoObstaculos,
    navegavel: { nav, bloqueado: montar(ctx, () => true) },
    fluxos: new Map(),
  };
  caches.set(state, novo);
  return novo.navegavel;
}

/** Os obstáculos sem os Portões (base das navegações por nação, D-56). */
const semPortoes = new WeakMap<SimState, { versao: number; bloqueado: Uint8Array }>();
function bloqueadoSemPortoes(ctx: SystemContext): Uint8Array {
  const atual = semPortoes.get(ctx.state);
  if (atual && atual.versao === ctx.state.versaoObstaculos) return atual.bloqueado;
  const bloqueado = montar(ctx, (id) => !ehPortao(ctx, id));
  semPortoes.set(ctx.state, { versao: ctx.state.versaoObstaculos, bloqueado });
  return bloqueado;
}

const porNacao = new WeakMap<SimState, Map<NacaoId, { chave: string; navegavel: Navegavel }>>();

/**
 * Navegação de uma nação: a comum mais as minas inimigas que ela vê, bloqueadas no raio de
 * gatilho (CMB-20); os Portões destrancados da própria nação ficam livres (D-56). Sem minas nem
 * portão próprio, é a comum.
 */
export function navegavelDa(ctx: SystemContext, nacao: NacaoId | undefined): Navegavel | null {
  const base = navegavel(ctx);
  if (!base || !nacao) return base;
  const { state } = ctx;
  const minas = minasReveladas(ctx, nacao);
  const proprios = entitiesWith(state, 'portao', 'owner').filter(
    (id) =>
      getComponent(state, id, 'owner')!.nacao === nacao &&
      !getComponent(state, id, 'portao')!.trancado,
  );
  if (minas.length === 0 && proprios.length === 0) return base;
  const chave = `${state.versaoObstaculos}|${minas.join(',')}|${proprios.join(',')}`;
  let mapa = porNacao.get(state);
  if (!mapa) porNacao.set(state, (mapa = new Map()));
  const atual = mapa.get(nacao);
  if (atual && atual.chave === chave) return atual.navegavel;
  const bloqueado = new Uint8Array(
    proprios.length > 0 ? bloqueadoSemPortoes(ctx) : base.bloqueado!,
  );
  if (proprios.length > 0) {
    const livres = new Set(proprios);
    for (const id of entitiesWith(state, 'portao', 'obstacle', 'position')) {
      if (!livres.has(id)) marcar(ctx, bloqueado, id);
    }
  }
  const gatilho = dados.armas.find((a) => a.id === 'mine_blast')!.alcance_m;
  for (const id of minas) {
    const d = direcaoDe(getComponent(state, id, 'position')!);
    for (const c of celulasNoRaio(base.nav, d, gatilho)) bloqueado[c] = 1;
  }
  const navegavelNova: Navegavel = { nav: base.nav, bloqueado };
  mapa.set(nacao, { chave, navegavel: navegavelNova });
  return navegavelNova;
}

/** Navegação da nação dona do corpo. */
export function navegavelDe(ctx: SystemContext, id: number): Navegavel | null {
  return navegavelDa(ctx, getComponent(ctx.state, id, 'owner')?.nacao);
}

/** Campo de fluxo até `alvo`, calculado uma vez por alvo e versão de obstáculos. */
export function fluxoPara(ctx: SystemContext, alvo: Ponto): Int32Array | null {
  const g = navegavel(ctx);
  if (!g) return null;
  const cache = caches.get(ctx.state)!;
  const chave = alvo.join(',');
  let campo = cache.fluxos.get(chave);
  if (!campo) {
    if (cache.fluxos.size >= 32) cache.fluxos.clear();
    campo = campoDeFluxo(g, alvo);
    cache.fluxos.set(chave, campo);
  }
  return campo;
}
