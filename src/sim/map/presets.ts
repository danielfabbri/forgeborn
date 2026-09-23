import type { CenariosId, TamanhosMapaId } from '../data';
import type { Simetria } from './lunar';

/**
 * CEN-12 e §14.4: seeds curadas por cenário, além da opção "Aleatória".
 * O nome visível vem do i18n, na chave `mapa.<id>` (TEC-23).
 */
export interface PresetDeMapa {
  id: string;
  cenario: CenariosId;
  tamanho: TamanhosMapaId;
  zonas: Simetria;
  /** Mínimo e máximo de jogadores. */
  jogadores: readonly [number, number];
  seed: number;
}

export const PRESETS_DE_MAPA: readonly PresetDeMapa[] = [
  { id: 'mare_imbrium', cenario: 'lua', tamanho: 'p', zonas: 2, jogadores: [2, 2], seed: 27 },
  {
    id: 'mare_tranquillitatis',
    cenario: 'lua',
    tamanho: 'm',
    zonas: 4,
    jogadores: [2, 4],
    seed: 24,
  },
  { id: 'oceanus_procellarum', cenario: 'lua', tamanho: 'g', zonas: 4, jogadores: [3, 4], seed: 1 },
];
