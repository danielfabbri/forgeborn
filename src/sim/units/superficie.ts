/**
 * Superfície do planeta para os sistemas de unidades (CEN-14): direção de uma posição, altura do
 * chão e distância pelo arco. Sem mundo carregado (testes do núcleo), vale uma esfera lisa.
 */
import type { SystemContext } from '../core/pipeline';
import { arco, normalizar, type Vec3 } from '../map/esfera';
import { alturaEm } from '../map/heightmap';

/** Raio da esfera lisa usada quando a partida não tem mundo. */
export const RAIO_SEM_MUNDO_M = 1000;

export interface Posicao {
  x: number;
  y: number;
  z: number;
}

export function raioDoMundo(ctx: SystemContext): number {
  return ctx.mundo?.mapa.raio_m ?? RAIO_SEM_MUNDO_M;
}

export function direcaoDe(pos: Posicao): Vec3 {
  return normalizar([pos.x, pos.y, pos.z]);
}

/** Altura do terreno (m, radial, acima de `raio_m`) na direção d. */
export function chaoEm(ctx: SystemContext, d: Vec3): number {
  return ctx.mundo ? alturaEm(ctx.mundo.mapa, d) : 0;
}

/** Coloca a posição na direção d, a `altura` m acima da esfera de raio `raio_m`. */
export function posicionar(ctx: SystemContext, pos: Posicao, d: Vec3, altura: number): void {
  const r = raioDoMundo(ctx) + altura;
  pos.x = d[0] * r;
  pos.y = d[1] * r;
  pos.z = d[2] * r;
}

/** Distância horizontal (m) pelo arco sobre a esfera de raio `raio_m`. */
export function distanciaM(ctx: SystemContext, a: Vec3, b: Vec3): number {
  return raioDoMundo(ctx) * arco(a, b);
}

/** Direção de um comando ({x, y, z}), normalizada; null se inválida. */
export function direcaoDoComando(dados: { x?: unknown; y?: unknown; z?: unknown }): Vec3 | null {
  const { x, y, z } = dados;
  if (typeof x !== 'number' || typeof y !== 'number' || typeof z !== 'number') return null;
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
  if (x === 0 && y === 0 && z === 0) return null;
  return normalizar([x, y, z]);
}
