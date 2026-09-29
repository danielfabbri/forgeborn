/**
 * Muro e Portão como segmentos (UNI-08, UNI-09, D-56): o obstáculo é um eixo de `pegada_m` de
 * comprimento na direção da estrutura, com `muro_espessura_m` de espessura. Aqui ficam as
 * contas de geometria no plano tangente (curtas o bastante para a curvatura não pesar).
 */
import type { ComponentMap, Ponto } from '../core/components';
import { getComponent } from '../core/entities';
import type { SimState } from '../core/state';
import type { EntityId } from '../core/types';
import { param } from '../data';
import { arco, avancar, norteEm, produtoEscalar, type Vec3 } from '../map/esfera';
import { statsEstrutura } from './stats';
import { direcaoDe } from './superficie';

/** Estruturas que são segmentos. */
export const SEGMENTOS: ReadonlySet<string> = new Set(['wall', 'gate']);

export const ehSegmento = (tipo: string): boolean => SEGMENTOS.has(tipo);

/** Meio comprimento do eixo (m): as pontas arredondadas completam `pegada_m`. */
export function meioEixo(tipo: string): number {
  return Math.max(0, statsEstrutura(tipo).pegada_m / 2 - param('muro_espessura_m') / 2);
}

/** Direção do segmento em `d`: a guardada ou o norte local. */
export function rumoDoSegmento(state: SimState, id: EntityId, d: Vec3): Ponto {
  return getComponent(state, id, 'structure')?.rumo ?? norteEm(d);
}

/** Obstáculo da estrutura: segmento para Muro e Portão, círculo que cobre a pegada nas demais. */
export function obstaculoDaEstrutura(
  state: SimState,
  id: EntityId,
  raioDaPegada: number,
): ComponentMap['obstacle'] {
  const tipo = getComponent(state, id, 'structure')!.tipo;
  if (!ehSegmento(tipo)) return { raio: raioDaPegada };
  const d = direcaoDe(getComponent(state, id, 'position')!);
  return {
    raio: param('muro_espessura_m') / 2,
    meio: meioEixo(tipo),
    eixo: rumoDoSegmento(state, id, d),
  };
}

/** Ponto do eixo do obstáculo (centro `c`) mais perto de `p`. */
export function maisPertoNoEixo(R: number, c: Vec3, o: ComponentMap['obstacle'], p: Vec3): Vec3 {
  if (!o.meio || !o.eixo) return c;
  const t = Math.max(-o.meio, Math.min(o.meio, R * produtoEscalar(p, o.eixo)));
  return avancar(c, o.eixo, t / R).p;
}

/** Distância (m) de `p` à borda do obstáculo (negativa dentro). */
export function distanciaAoObstaculo(
  R: number,
  c: Vec3,
  o: ComponentMap['obstacle'],
  p: Vec3,
): number {
  return R * arco(p, maisPertoNoEixo(R, c, o, p)) - o.raio;
}

/** As duas pontas (direções) de um segmento com centro `c`, rumo e meio comprimento total. */
export function pontas(R: number, c: Vec3, rumo: Vec3, meioTotal: number): [Vec3, Vec3] {
  return [avancar(c, rumo, meioTotal / R).p, avancar(c, rumo, -meioTotal / R).p];
}

/** Distância entre dois segmentos no plano (2D). */
export function distanciaSegmentos2d(
  a0: [number, number],
  a1: [number, number],
  b0: [number, number],
  b1: [number, number],
): number {
  const cruza = (p: number[], q: number[], r: number[]) =>
    (q[0]! - p[0]!) * (r[1]! - p[1]!) - (q[1]! - p[1]!) * (r[0]! - p[0]!);
  const d1 = cruza(a0, a1, b0);
  const d2 = cruza(a0, a1, b1);
  const d3 = cruza(b0, b1, a0);
  const d4 = cruza(b0, b1, a1);
  if (d1 * d2 < 0 && d3 * d4 < 0) return 0;
  return Math.min(
    pontoSegmento2d(a0, b0, b1),
    pontoSegmento2d(a1, b0, b1),
    pontoSegmento2d(b0, a0, a1),
    pontoSegmento2d(b1, a0, a1),
  );
}

export function pontoSegmento2d(
  p: [number, number],
  a: [number, number],
  b: [number, number],
): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}
