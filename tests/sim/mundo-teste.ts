/**
 * Mundos e partidas de teste para os sistemas de unidades.
 *
 * O mundo liso é um planeta do tamanho do mapa M (CEN-14), sem relevo. Para os testes lerem em
 * metros, há um mapa local em volta da BASE (um ponto do equador): x ao longo de E1, z ao longo
 * de E2 (norte), medidos pelo arco.
 */
import { createSim, type EntityId, getComponent, type NacaoId, type Sim } from '../../src/sim';
import { DEBUG_CRIAR_COMMAND, debugCriarHandlers } from '../../src/sim/debug/criar';
import type { CenariosId, EstruturasId, MoveisId, RecursosId } from '../../src/sim/data';
import { SEMEAR_JAZIDAS_COMMAND } from '../../src/sim/economia';
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
import { gerarMapaLunar } from '../../src/sim/map/lunar';
import { chaveDoPar } from '../../src/sim/relacoes/temperamento';

/**
 * Planetas de teste para as regras e o gerador (o gerador aceita qualquer raio; os cenários têm o
 * próprio, CEN-16): os raios dos antigos mapas P, M e G.
 */
export const RAIOS_DE_TESTE = { p: 108, m: 144, g: 180 } as const;
export const RAIO = RAIOS_DE_TESTE.m;
export const BASE: Vec3 = [1, 0, 0];
const E1: Vec3 = [0, 0, 1];
const E2: Vec3 = [0, 1, 0];

/** Direção do ponto local (x, z), em metros a partir da BASE. */
export function ponto(x: number, z: number, raio: number = RAIO): Vec3 {
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

/**
 * CEN-04 (D-90): mundo liso com mar. A terra (20 m) fica em z < 20 e z > 60 no hemisfério da base;
 * a faixa entre elas e o outro hemisfério (0 m) ficam abaixo do nível do líquido (10 m).
 */
export function mundoComMar(): Mundo {
  const base = mundoLiso((_x, z) => z < 20 || z > 60);
  const mapa = { ...base.mapa, mar: { nivel: 10 } };
  return { mapa, grades: derivarGrades(mapa) };
}

let lua: ReturnType<typeof gerarMapaValido> | null = null;
/**
 * Mapa lunar de 4 zonas no planeta de teste M (144 m), gerado e validado pela seed: para regras
 * que não dependem do tamanho do corpo e ficariam lentas no raio da Lua (CEN-16).
 */
export function mundoDeTeste(seed: number): Mundo {
  const mapa = gerarMapaLunar(seed, RAIOS_DE_TESTE.m, 4);
  return { mapa, grades: derivarGrades(mapa) };
}

/** Preset Mare Tranquillitatis (Lua, 4 zonas). */
export function mundoLua(seed?: number): ReturnType<typeof gerarMapaValido> {
  const preset = PRESETS_DE_MAPA.find((p) => p.id === 'mare_tranquillitatis')!;
  if (seed !== undefined) return gerarMapaValido(seed, 4, 'lua');
  lua ??= gerarMapaValido(preset.seed, preset.zonas, preset.cenario);
  return lua;
}

/** Criação em coordenadas locais (x, z) ou numa direção `d`. */
export type Criacao = (
  | { unidade: MoveisId; postura?: 'agressiva' | 'defensiva' | 'manter' | 'passiva' }
  | { estrutura: EstruturasId; comSatelite?: boolean; rumo?: Vec3; semCabo?: boolean }
  | { mina: true }
) & {
  nacao?: NacaoId;
} & ({ x: number; z: number } | { d: Vec3 });

/** Partida com os sistemas do jogo e o comando de depuração que cria corpos. */
/**
 * Partida de teste. `guerra` (padrão): as nações começam em guerra entre si (REG-24), para as
 * regras de combate valerem sem o aviso de domínio; os testes do temperamento passam `false`.
 */
export function partida(
  mundo: Mundo | undefined,
  nacoes: NacaoId[] = ['bra', 'usa'],
  cenario: CenariosId = 'lua',
  guerra = true,
): Sim {
  const sim = createSim(1, nacoes, {
    mundo,
    cenario,
    systems: sistemasDoJogo,
    commandHandlers: { ...comandosDoJogo, ...debugCriarHandlers },
  });
  if (guerra) {
    for (const a of nacoes) {
      for (const b of nacoes) {
        if (a < b) sim.state.relacoes[chaveDoPar(a, b)] = { guerra: true, calma_s: 0, avisos: {} };
      }
    }
  }
  return sim;
}

/** Marca todo o mapa como explorado pela nação (VIS-01), para testes de outras regras. */
export function revelar(sim: Sim, nacao: NacaoId = 'bra', mundo: Mundo = mundoLiso()): void {
  const celulas = mundo.grades.nevoa.esfera.celulas;
  sim.state.nevoa[nacao] = new Array<number>(celulas).fill(1);
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

/** Semeia jazidas em coordenadas locais (x, z) no próximo tick e devolve os IDs novos. */
export function semear(
  sim: Sim,
  jazidas: Array<{ recurso: RecursosId; quantidade: number; x: number; z: number }>,
): EntityId[] {
  const antes = sim.state.nextEntityId;
  sim.enqueue({
    tick: sim.state.tick,
    nacao: sim.state.nacoes[0]!,
    tipo: SEMEAR_JAZIDAS_COMMAND,
    dados: jazidas.map((j) => ({
      recurso: j.recurso,
      quantidade: j.quantidade,
      d: ponto(j.x, j.z),
    })) as never,
  });
  sim.step();
  return Array.from({ length: sim.state.nextEntityId - antes }, (_, k) => antes + k);
}
