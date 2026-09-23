/**
 * Navegação da partida: grade do mapa + células bloqueadas por obstáculos rígidos (MOV-04).
 * Tudo aqui é derivado do estado e do mundo, guardado em cache fora do snapshot.
 */
import type { Ponto } from '../core/components';
import { entitiesWith, getComponent } from '../core/entities';
import type { SystemContext } from '../core/pipeline';
import type { SimState } from '../core/state';
import { campoDeFluxo, type Navegavel } from '../map/pathfinding';

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
  const bloqueado = new Uint8Array(nav.colunas * nav.linhas);
  for (const id of entitiesWith(state, 'obstacle', 'position')) {
    const { raio } = getComponent(state, id, 'obstacle')!;
    const p = getComponent(state, id, 'position')!;
    const alcance = Math.ceil(raio / nav.celula_m) + 1;
    const ci = Math.floor((p.x + nav.meio_m) / nav.celula_m);
    const cj = Math.floor((p.z + nav.meio_m) / nav.celula_m);
    for (let dj = -alcance; dj <= alcance; dj++) {
      for (let di = -alcance; di <= alcance; di++) {
        const i = ci + di;
        const j = cj + dj;
        if (i < 0 || j < 0 || i >= nav.colunas || j >= nav.linhas) continue;
        const cx = -nav.meio_m + (i + 0.5) * nav.celula_m;
        const cz = -nav.meio_m + (j + 0.5) * nav.celula_m;
        if (Math.hypot(cx - p.x, cz - p.z) <= raio) bloqueado[j * nav.colunas + i] = 1;
      }
    }
  }
  const novo: Cache = {
    versao: state.versaoObstaculos,
    navegavel: { nav, bloqueado },
    fluxos: new Map(),
  };
  caches.set(state, novo);
  return novo.navegavel;
}

/** Campo de fluxo até `alvo`, calculado uma vez por alvo e versão de obstáculos. */
export function fluxoPara(ctx: SystemContext, alvo: Ponto): Int32Array | null {
  const g = navegavel(ctx);
  if (!g) return null;
  const cache = caches.get(ctx.state)!;
  const chave = `${alvo[0]},${alvo[1]}`;
  let campo = cache.fluxos.get(chave);
  if (!campo) {
    if (cache.fluxos.size >= 32) cache.fluxos.clear();
    campo = campoDeFluxo(g, alvo);
    cache.fluxos.set(chave, campo);
  }
  return campo;
}
