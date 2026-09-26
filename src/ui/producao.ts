import { signal } from '@preact/signals';
import type { OpcaoDeMenu } from '../game/atalhosProducao';
import type { EntityId } from '../sim';

/** Painel de produção (PRD-03, UI-08), atualizado pelo loop principal. */
export interface EstadoDoPainel {
  /** Produtor próprio selecionado (Nave ou Impressora) e a sua fila. */
  produtor: {
    id: EntityId;
    tipo: string;
    /** UI-16: cartão de ação de unidade sem fila (sem a seção de fila). */
    cartaoDeAcao?: boolean;
    fila: Array<{ item: string; progresso: number }>;
  } | null;
  /** Estrutura própria em obra selecionada. */
  obra: { id: EntityId; tipo: string; progresso: number; instalada: boolean } | null;
  /** Opções do produtor (Nave) ou do menu aberto (Impressora). */
  opcoes: OpcaoDeMenu[];
  menu: 'unidades' | 'estruturas' | null;
  posicionando: string | null;
  motivo: string | null;
  reparando: boolean;
  estoque: Record<string, number>;
  /** CMB-28 (Nave): há mineradores recolhidos (o botão libera), ou null fora da Nave. */
  recolhidos: boolean | null;
  /** UNI-10: mísseis prontos (a frente sai primeiro) e a recarga do lançador, ou null. */
  misseis: { prontos: string[]; max: number; recarga_s: number } | null;
  /** UI-16: minas no carregador do Hover de Plantio selecionado, ou null. */
  minas: { n: number; max: number } | null;
  /** ENE-24 (D-59): modo suporte da Bateria Móvel selecionada, ou null. */
  suporte: boolean | null;
}

export const painelProducao = signal<EstadoDoPainel>({
  produtor: null,
  obra: null,
  opcoes: [],
  menu: null,
  posicionando: null,
  motivo: null,
  reparando: false,
  estoque: {},
  recolhidos: null,
  misseis: null,
  minas: null,
  suporte: null,
});

/** Aviso passageiro (AL-06, AL-11). */
export const avisoProducao = signal<{ texto: string; ate: number } | null>(null);

/** Ações dos botões do painel, ligadas pela entrada de comandos. */
export interface AcoesDoPainel {
  escolher(item: string): void;
  abrirMenu(menu: 'unidades' | 'estruturas'): void;
  cancelarItem(produtor: EntityId, indice: number): void;
  cancelarObra(obra: EntityId): void;
  /** CMB-28: Q da Nave. */
  recolherMineradores(): void;
  /** ENE-24: T da Bateria Móvel. */
  alternarSuporte(): void;
}

export const acoesDoPainel: { atual: AcoesDoPainel | null } = { atual: null };

/** UI-04: foto de cada item do cartão (ligada pela partida ao renderer do retrato). */
export const fotosDoPainel: { de: ((item: string) => string | null) | null } = { de: null };
