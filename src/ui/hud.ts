import { signal } from '@preact/signals';
import type { EntityId } from '../sim';
import type { FimDaPartida } from '../game/fimDePartida';
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

/** FLX-12: fim de partida do jogador (resultado e estatísticas), ou null enquanto joga. */
export const fimDePartida = signal<FimDaPartida | null>(null);

/** REG-21/FLX-11: simulação pausada; o menu de pausa pode estar aberto ou não (pausa tática). */
export const pausado = signal(false);
export const menuDePausa = signal<'fechado' | 'aberto' | 'configuracoes'>('fechado');

/** Ações do menu de pausa e do fim de partida, ligadas pela partida. */
export const acoesDaPartida: {
  continuar: () => void;
  reiniciar: () => void;
  renderSe: () => void;
  jogarDeNovo: () => void;
  sair: () => void;
} = {
  continuar: () => {},
  reiniciar: () => {},
  renderSe: () => {},
  jogarDeNovo: () => {},
  sair: () => {},
};

/** CTL-14: HUD do controle direto (null fora dele). */
export interface EstadoDoControleDireto {
  modo: '1p' | '3p';
  tipo: string;
  hp: number;
  hpMax: number;
  en: { atual: number; max: number } | null;
  /** Arma: 1 = pronta; null sem arma. */
  recarga: number | null;
  /** CTL-11: progresso da trava do torpedo (0..1), ou null. */
  trava: number | null;
  /** O que está sob a mira. */
  mira: 'inimigo' | 'aliado' | 'jazida' | null;
  /** Rumo da mira (graus a partir do norte) e os sinais de radar (rumos, graus). */
  rumo: number;
  sinais: number[];
  carga: { atual: number; max: number } | null;
  /** Chave da habilidade do clique direito (D-42), ou null. */
  habilidade: string | null;
}
export const controleDireto = signal<EstadoDoControleDireto | null>(null);
/** CTL-13: "SINAL PERDIDO" na tela. */
export const sinalPerdido = signal(false);

/** Canvas do retrato 3D (UI-03), montado pelo painel e desenhado pelo render. */
export const canvasDoRetrato = signal<HTMLCanvasElement | null>(null);

/** Clicar num grupo filtra a seleção (UI-03). */
export const acoesDaSelecao: { filtrar: ((ids: EntityId[]) => void) | null } = { filtrar: null };
