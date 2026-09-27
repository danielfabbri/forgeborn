import type { CenariosId } from '../data';
import type { Simetria } from './lunar';

/**
 * CEN-12 e §14.4: seeds curadas por cenário, além da opção "Aleatória". O raio vem do cenário
 * (CEN-16); o preset define a simetria (zonas) e os jogadores.
 * O nome visível vem do i18n, na chave `mapa.<id>` (TEC-23).
 */
export interface PresetDeMapa {
  id: string;
  cenario: CenariosId;
  zonas: Simetria;
  /** Mínimo e máximo de jogadores. */
  jogadores: readonly [number, number];
  seed: number;
  /** Só na campanha (fora do Free Battle), como o Campo de testes da Terra (§14.5). */
  soCampanha?: boolean;
}

export const PRESETS_DE_MAPA: readonly PresetDeMapa[] = [
  { id: 'mare_imbrium', cenario: 'lua', zonas: 2, jogadores: [2, 2], seed: 27 },
  {
    id: 'mare_tranquillitatis',
    cenario: 'lua',

    zonas: 4,
    jogadores: [2, 4],
    seed: 24,
  },
  { id: 'oceanus_procellarum', cenario: 'lua', zonas: 4, jogadores: [3, 4], seed: 1 },
  // D-73: mapas da campanha v1.0 (Missão 0 na Terra e Missão 2 em Shackleton).
  {
    id: 'campo_de_testes',
    cenario: 'terra_lab',

    zonas: 2,
    jogadores: [2, 2],
    seed: 11,
    soCampanha: true,
  },
  {
    id: 'cratera_shackleton',
    cenario: 'lua_shackleton',

    zonas: 4,
    jogadores: [2, 4],
    seed: 42,
  },
  // §14.6 (D-77): Marte.
  { id: 'utopia_planitia', cenario: 'marte', zonas: 2, jogadores: [2, 2], seed: 7 },
  { id: 'valles_marineris', cenario: 'marte', zonas: 4, jogadores: [2, 4], seed: 13 },
  { id: 'hellas_planitia', cenario: 'marte', zonas: 4, jogadores: [3, 4], seed: 5 },
  // §14.7 (D-78): Titã, com lagos de metano (CEN-04).
  { id: 'xanadu', cenario: 'tita', zonas: 2, jogadores: [2, 2], seed: 3 },
  { id: 'ligeia_mare', cenario: 'tita', zonas: 4, jogadores: [2, 4], seed: 17 },
  { id: 'kraken_mare', cenario: 'tita', zonas: 4, jogadores: [3, 4], seed: 9 },
];
