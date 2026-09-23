/**
 * Mundos e partidas de teste para os sistemas de unidades.
 *
 * O mundo liso é um planeta do tamanho do mapa M (CEN-14), sem relevo. Para os testes lerem em
 * metros, há um mapa local em volta da BASE (um ponto do equador): x ao longo de E1, z ao longo
 * de E2 (norte), medidos pelo arco.
 */
import { createSim, type EntityId, getComponent, type NacaoId, type Sim } from '../../src/sim';
import { dados } from '../../src/sim/data';
import { DEBUG_CRIAR_COMMAND, debugCriarHandlers } from '../../src/sim/debug/criar';
import type { EstruturasId, MoveisId } from '../../src/sim/data';
import {
  arco,
  avancar,
  celulasPorAresta,
  normalizar,
  produtoEscalar,
  tangente,
  type Vec3,
} from '../../src/sim/map/esfera';
import { derivarGrades } from '../../src/sim/map/grids';
import {
  codificarAltura,
  direcaoDoVertice,
  type Heightmap,
  indiceDoVertice,
} from '../../src/sim/map/heightmap';
import type { Mundo } from '../../src/sim/map/mundo';
import { PRESETS_DE_MAPA } from '../../src/sim/map/presets';
import { gerarMapaValido } from '../../src/sim/map/validacao';
import { comandosDoJogo, sistemasDoJogo } from '../../src/sim/units';

export const RAIO = dados.tamanhos_mapa.find((t) => t.id === 'm')!.raio_m;
export const BASE: Vec3 = [1, 0, 0];
const E1: Vec3 = [0, 0, 1];
const E2: Vec3 = [0, 1, 0];

/** Direção do ponto local (x, z), em metros a partir da BASE. */
export function ponto(x: number, z: number, raio = RAIO): Vec3 {
  const dist = Math.hypot(x, z);
  if (dist < 1e-12) return BASE;
  const rumo = normalizar([E1[0] * x + E2[0] * z, E1[1] * x + E2[1] * z, E1[2] * x + E2[2] * z]);
  return avancar(BASE, rumo, dist / raio).p;
}

/** Coordenadas locais (x, z), em metros, da direção d. */
export function local(d: Vec3, raio = RAIO): { x: number; z: number } {
  const t = tangente(BASE, d);
  if (!t) return { x: 0, z: 0 };
  const dist = raio * arco(BASE, d);
  return { x: dist * produtoEscalar(t, E1), z: dist * produtoEscalar(t, E2) };
}

/** Alvo de um comando de movimento no ponto local (x, z). */
export function alvo(x: number, z: number): { x: number; y: number; z: number } {
  const d = ponto(x, z);
  return { x: d[0], y: d[1], z: d[2] };
}

/** Posição da unidade em coordenadas locais, com a altura acima da esfera. */
export function pos(sim: Sim, id: EntityId): { x: number; z: number; altura: number } {
  const p = getComponent(sim.state, id, 'position')!;
  const r = Math.hypot(p.x, p.y, p.z);
  return { ...local([p.x / r, p.y / r, p.z / r]), altura: r - RAIO };
}

/**
 * Planeta liso do tamanho do mapa M; `parede(x, z)` (coordenadas locais) levanta um paredão
 * de 20 m onde for true, só no hemisfério da BASE.
 */
export function mundoLiso(parede?: (x: number, z: number) => boolean): Mundo {
  if (!parede && liso) return liso;
  const resolucao = celulasPorAresta(RAIO, 1);
  const alturas = new Uint16Array(6 * (resolucao + 1) ** 2);
  for (let face = 0; face < 6; face++) {
    for (let j = 0; j <= resolucao; j++) {
      for (let i = 0; i <= resolucao; i++) {
        const d = direcaoDoVertice(resolucao, face, i, j);
        let h = 0;
        if (parede && produtoEscalar(d, BASE) > 0) {
          const { x, z } = local(d);
          if (parede(x, z)) h = 20;
        }
        alturas[indiceDoVertice(resolucao, face, i, j)] = codificarAltura(h);
      }
    }
  }
  const mapa: Heightmap = { raio_m: RAIO, resolucao, alturas };
  const mundo = { mapa, grades: derivarGrades(mapa) };
  if (!parede) liso = mundo;
  return mundo;
}
let liso: Mundo | null = null;

let lua: ReturnType<typeof gerarMapaValido> | null = null;
/** Preset Mare Tranquillitatis (M, 4 zonas). */
export function mundoLua(seed?: number): ReturnType<typeof gerarMapaValido> {
  const preset = PRESETS_DE_MAPA.find((p) => p.id === 'mare_tranquillitatis')!;
  if (seed !== undefined) return gerarMapaValido(seed, 'm', 4, 'lua');
  lua ??= gerarMapaValido(preset.seed, preset.tamanho, preset.zonas, preset.cenario);
  return lua;
}

/** Criação em coordenadas locais (x, z) ou numa direção `d`. */
export type Criacao = ({ unidade: MoveisId } | { estrutura: EstruturasId } | { mina: true }) & {
  nacao?: NacaoId;
} & ({ x: number; z: number } | { d: Vec3 });

/** Partida com os sistemas do jogo e o comando de depuração que cria corpos. */
export function partida(mundo: Mundo | undefined, nacoes: NacaoId[] = ['bra', 'usa']): Sim {
  return createSim(1, nacoes, {
    mundo,
    systems: sistemasDoJogo,
    commandHandlers: { ...comandosDoJogo, ...debugCriarHandlers },
  });
}

/** Cria corpos no próximo tick e devolve os IDs novos. */
export function criar(sim: Sim, criacoes: Criacao[], nacao: NacaoId = 'bra'): EntityId[] {
  const antes = sim.state.nextEntityId;
  const comDirecao = criacoes.map((c) => {
    if ('d' in c) return c;
    const { x, z, ...resto } = c;
    return { ...resto, d: ponto(x, z) };
  });
  sim.enqueue({
    tick: sim.state.tick,
    nacao,
    tipo: DEBUG_CRIAR_COMMAND,
    dados: comDirecao as never,
  });
  sim.step();
  return Array.from({ length: sim.state.nextEntityId - antes }, (_, k) => antes + k);
}

export function ordenar(
  sim: Sim,
  tipo: string,
  dados: Record<string, unknown>,
  nacao: NacaoId = 'bra',
): void {
  sim.enqueue({ tick: sim.state.tick, nacao, tipo, dados: dados as never });
}
