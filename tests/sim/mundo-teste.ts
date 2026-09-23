/** Mundos e partidas de teste para os sistemas de unidades. */
import { createSim, type EntityId, type NacaoId, type Sim } from '../../src/sim';
import type { EstruturasId, MoveisId } from '../../src/sim/data';
import { derivarGrades } from '../../src/sim/map/grids';
import { codificarAltura, type Heightmap } from '../../src/sim/map/heightmap';
import type { Mundo } from '../../src/sim/map/mundo';
import { PRESETS_DE_MAPA } from '../../src/sim/map/presets';
import { gerarMapaValido } from '../../src/sim/map/validacao';
import {
  comandosDoJogo,
  criarEstrutura,
  criarMina,
  criarUnidade,
  sistemasDoJogo,
} from '../../src/sim/units';

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

export type Criacao =
  | { unidade: MoveisId; nacao?: NacaoId; x: number; z: number }
  | { estrutura: EstruturasId; nacao?: NacaoId; x: number; z: number }
  | { mina: true; nacao?: NacaoId; x: number; z: number };

/** Partida com os sistemas do jogo e um comando de teste `teste_criar`. */
export function partida(mundo: Mundo | undefined, nacoes: NacaoId[] = ['bra', 'usa']): Sim {
  return createSim(1, nacoes, {
    mundo,
    systems: sistemasDoJogo,
    commandHandlers: {
      ...comandosDoJogo,
      teste_criar: (ctx, comando) => {
        for (const c of comando.dados as unknown as Criacao[]) {
          const nacao = c.nacao ?? comando.nacao;
          if ('unidade' in c) criarUnidade(ctx, nacao, c.unidade, c.x, c.z);
          else if ('estrutura' in c) criarEstrutura(ctx, nacao, c.estrutura, c.x, c.z);
          else criarMina(ctx, nacao, c.x, c.z);
        }
      },
    },
  });
}

/** Cria corpos no próximo tick e devolve os IDs novos. */
export function criar(sim: Sim, criacoes: Criacao[], nacao: NacaoId = 'bra'): EntityId[] {
  const antes = sim.state.nextEntityId;
  sim.enqueue({ tick: sim.state.tick, nacao, tipo: 'teste_criar', dados: criacoes as never });
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
