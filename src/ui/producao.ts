import { signal } from '@preact/signals';
import type { OpcaoDeMenu } from '../game/atalhosProducao';
import type { EntityId } from '../sim';

/** Painel de produção (PRD-03, UI-08), atualizado pelo loop principal. */
export interface EstadoDoPainel {
  /** Produtor próprio selecionado (Nave ou Impressora) e a sua fila. */
  produtor: {
    id: EntityId;
    tipo: string;
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
});

/** Aviso passageiro (AL-06, AL-11). */
export const avisoProducao = signal<{ texto: string; ate: number } | null>(null);

/** Ações dos botões do painel, ligadas pela entrada de comandos. */
export interface AcoesDoPainel {
  escolher(item: string): void;
  abrirMenu(menu: 'unidades' | 'estruturas'): void;
  cancelarItem(produtor: EntityId, indice: number): void;
  cancelarObra(obra: EntityId): void;
}

export const acoesDoPainel: { atual: AcoesDoPainel | null } = { atual: null };
