/** Mundos e partidas de teste para os sistemas de unidades. */
import { createSim, type EntityId, type NacaoId, type Sim } from '../../src/sim';
import { type Criacao, DEBUG_CRIAR_COMMAND, debugCriarHandlers } from '../../src/sim/debug/criar';
import { derivarGrades } from '../../src/sim/map/grids';
import { codificarAltura, type Heightmap } from '../../src/sim/map/heightmap';
import type { Mundo } from '../../src/sim/map/mundo';
import { PRESETS_DE_MAPA } from '../../src/sim/map/presets';
import { gerarMapaValido } from '../../src/sim/map/validacao';
import { comandosDoJogo, sistemasDoJogo } from '../../src/sim/units';

/** Terreno plano de `lado` m; `parede(x, z)` levanta um paredão de 20 m onde for true. */
export function mundoPlano(lado = 128, parede?: (x: number, z: number) => boolean): Mundo {
  const resolucao = lado + 1;
  const alturas = new Uint16Array(resolucao * resolucao);
  for (let j = 0; j < resolucao; j++) {
    for (let i = 0; i < resolucao; i++) {
      const x = i - lado / 2;
      const z = j - lado / 2;
      alturas[j * resolucao + i] = codificarAltura(parede?.(x, z) ? 20 : 0);
    }
  }
  const mapa: Heightmap = { lado_m: lado, resolucao, alturas };
  return { mapa, grades: derivarGrades(mapa) };
}

let lua: ReturnType<typeof gerarMapaValido> | null = null;
/** Preset Mare Tranquillitatis (M, 4 zonas). */
export function mundoLua(seed?: number): ReturnType<typeof gerarMapaValido> {
  const preset = PRESETS_DE_MAPA.find((p) => p.id === 'mare_tranquillitatis')!;
  if (seed !== undefined) return gerarMapaValido(seed, 'm', 4, 'lua');
  lua ??= gerarMapaValido(preset.seed, preset.tamanho, preset.zonas, preset.cenario);
  return lua;
}

export type { Criacao };

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
  sim.enqueue({ tick: sim.state.tick, nacao, tipo: DEBUG_CRIAR_COMMAND, dados: criacoes as never });
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
