import { signal } from '@preact/signals';
import type { EntityId } from '../sim';
import type { LeituraDaRede } from '../sim/energia';

/** UI-01: barra superior, atualizada pelo loop principal. */
export interface EstadoDaBarra {
  recursos: Array<{ id: string; cor: string; quantidade: number; transito: number }>;
  energia: LeituraDaRede | null;
  corpos: { n: number; limite: number };
  relogio: string;
}

export const barraSuperior = signal<EstadoDaBarra>({
  recursos: [],
  energia: null,
  corpos: { n: 0, limite: 0 },
  relogio: '0:00',
});

/** UI-03 e UI-13: o que o painel de seleção mostra. */
export type EstadoDaSelecao =
  | { tipo: 'nenhum' }
  | {
      tipo: 'corpo';
      id: EntityId;
      modelo: string;
      cor: string;
      hp: number;
      hpMax: number;
      en: { atual: number; max: number } | null;
      estado: string;
      carga: { atual: number; max: number; recurso: string | null } | null;
      arma: { dano: number; alcance: number } | null;
      /** CMB-13 (null: desarmada ou estrutura). */
      postura: string | null;
    }
  | { tipo: 'grupo'; grupos: Array<{ modelo: string; ids: EntityId[]; hp: number[] }> }
  | { tipo: 'jazida'; recurso: string; quantidade: number; inicial: number; hovers: number };

export const painelSelecao = signal<EstadoDaSelecao>({ tipo: 'nenhum' });

/** UI-09/UI-13: tooltip na posição do mouse (px). */
export const tooltip = signal<{ texto: string; x: number; y: number } | null>(null);

/** REG-11/REG-12: resultado da partida para o jogador, ou null. */
export const fimDePartida = signal<'vitoria' | 'derrota' | 'empate' | null>(null);

/** Canvas do retrato 3D (UI-03), montado pelo painel e desenhado pelo render. */
export const canvasDoRetrato = signal<HTMLCanvasElement | null>(null);

/** Clicar num grupo filtra a seleção (UI-03). */
export const acoesDaSelecao: { filtrar: ((ids: EntityId[]) => void) | null } = { filtrar: null };
