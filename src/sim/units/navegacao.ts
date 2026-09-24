/**
 * Navegação da partida: grade do mapa + células bloqueadas por obstáculos rígidos (MOV-04).
 * Tudo aqui é derivado do estado e do mundo, guardado em cache fora do snapshot.
 */
import type { Ponto } from '../core/components';
import { entitiesWith, getComponent } from '../core/entities';
import type { SystemContext } from '../core/pipeline';
import type { SimState } from '../core/state';
import { celulasNoRaio } from '../map/conectividade';
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
  const bloqueado = new Uint8Array(nav.esfera.celulas);
  for (const id of entitiesWith(state, 'obstacle', 'position')) {
    const { raio } = getComponent(state, id, 'obstacle')!;
    const d = direcaoDe(getComponent(state, id, 'position')!);
    for (const c of celulasNoRaio(nav, d, raio)) bloqueado[c] = 1;
  }
  const novo: Cache = {
    versao: state.versaoObstaculos,
    navegavel: { nav, bloqueado },
    fluxos: new Map(),
  };
  caches.set(state, novo);
  return novo.navegavel;
}

const porNacao = new WeakMap<SimState, Map<NacaoId, { chave: string; navegavel: Navegavel }>>();

/**
 * Navegação de uma nação (CMB-20): a comum mais as minas inimigas que ela vê, bloqueadas no raio
 * de gatilho. Sem minas reveladas, é a comum.
 */
export function navegavelDa(ctx: SystemContext, nacao: NacaoId | undefined): Navegavel | null {
  const base = navegavel(ctx);
  if (!base || !nacao) return base;
  const minas = minasReveladas(ctx, nacao);
  if (minas.length === 0) return base;
  const chave = `${ctx.state.versaoObstaculos}|${minas.join(',')}`;
  let mapa = porNacao.get(ctx.state);
  if (!mapa) porNacao.set(ctx.state, (mapa = new Map()));
  const atual = mapa.get(nacao);
  if (atual && atual.chave === chave) return atual.navegavel;
  const bloqueado = new Uint8Array(base.bloqueado ?? new Uint8Array(base.nav.esfera.celulas));
  const gatilho = dados.armas.find((a) => a.id === 'mine_blast')!.alcance_m;
  for (const id of minas) {
    const d = direcaoDe(getComponent(ctx.state, id, 'position')!);
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
