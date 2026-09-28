import { signal } from '@preact/signals';
import type { EntityId } from '../sim';
import type { Alerta } from '../game/alertas';
import type { FimDaPartida } from '../game/fimDePartida';
import type { LeituraDaRede } from '../sim/energia';

/** UI-01: barra superior, atualizada pelo loop principal. */
export interface EstadoDaBarra {
  recursos: Array<{ id: string; cor: string; quantidade: number; transito: number }>;
  energia: LeituraDaRede | null;
  /** ENE-22 (D-85): redes com geração fora da rede da Nave. */
  redesIsoladas?: number;
  corpos: { n: number; limite: number };
  relogio: string;
  /** UI-17 (D-81): temperamento de cada nação adversária em relação ao jogador. */
  nacoes: Array<{
    id: string;
    cor: string;
    /** `invadida`: unidade dela no meu domínio (D-88: o aviso foi meu, sem prazo de guerra). */
    estado: 'pacifico' | 'alerta' | 'invadida' | 'inimigo';
    prazo: number | null;
  }>;
}

export const barraSuperior = signal<EstadoDaBarra>({
  recursos: [],
  energia: null,
  corpos: { n: 0, limite: 0 },
  relogio: '0:00',
  nacoes: [],
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
      /**
       * ENE-22/ENE-25 (D-85): a rede da estrutura própria que usa energia; 'sem_rede' fora de
       * qualquer rede com outras estruturas; null para quem não usa energia.
       */
      rede?:
        { geracao: number; banco: number; capacidade: number; membros: number } | 'sem_rede' | null;
      /** ENE-26: a estrutura tem cabos (o botão Desplugar aparece). */
      cabos?: number;
    }
  | { tipo: 'grupo'; grupos: Array<{ modelo: string; ids: EntityId[]; hp: number[] }> }
  | { tipo: 'jazida'; recurso: string; quantidade: number; inicial: number; hovers: number };

export const painelSelecao = signal<EstadoDaSelecao>({ tipo: 'nenhum' });

/** UI-09/UI-13: tooltip na posição do mouse (px). */
export const tooltip = signal<{ texto: string; x: number; y: number } | null>(null);

/** FLX-12: fim de partida do jogador (resultado e estatísticas), ou null enquanto joga. */
export const fimDePartida = signal<FimDaPartida | null>(null);
/** CAM-07: passo do tutorial na tela (null fora dele ou pulado). */
export const tutorialNaTela = signal<{ passo: number; total: number } | null>(null);
export const acoesDoTutorial: { pular: () => void; irAoPonto: () => void } = {
  pular: () => {},
  irAoPonto: () => {},
};

/** CAM-08: resultado da missão da campanha (0 estrelas = derrota), ou null fora dela. */
export const fimDaMissao = signal<{ estrelas: number; missao: string } | null>(null);

/** REG-21/FLX-11: simulação pausada; o menu de pausa pode estar aberto ou não (pausa tática). */
export const pausado = signal(false);
/** TEC-27: o campo de macetes está aberto. */
export const maceteAberto = signal(false);
export const maceteDesconhecido = signal(false);
/** TEC-27: aplica um macete; false = texto desconhecido. */
export const acoesDoMacete: { enviar: (texto: string) => boolean } = { enviar: () => false };
export const menuDePausa = signal<'fechado' | 'aberto' | 'configuracoes'>('fechado');

/** Ações do menu de pausa e do fim de partida, ligadas pela partida. */
export const acoesDaPartida: {
  /** UI-01: o botão Menu da barra superior abre o menu de pausa. */
  abrirMenu: () => void;
  continuar: () => void;
  reiniciar: () => void;
  renderSe: () => void;
  jogarDeNovo: () => void;
  sair: () => void;
} = {
  abrirMenu: () => {},
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

/** UI-06: os alertas visíveis (mais recente primeiro) e o clique que leva ao local. */
export const alertasVisiveis = signal<Alerta[]>([]);
export const acoesDosAlertas: { irPara: (a: Alerta) => void } = { irPara: () => {} };

/** REG-29 (D-88): declarar guerra a uma nação (botão do AL-22 e temperamento da barra). */
export const acoesDaDiplomacia: { declararGuerra: (nacao: string) => void } = {
  declararGuerra: () => {},
};

/** UI-17: nação cujo temperamento está aberto na barra (mostra Declarar guerra), ou null. */
export const temperamentoAberto = signal<string | null>(null);

/** Canvas do retrato 3D (UI-03), montado pelo painel e desenhado pelo render. */
export const canvasDoRetrato = signal<HTMLCanvasElement | null>(null);

/** UI-15: quantos mineradores e impressoras estão parados, e a ação de ir ao próximo. */
export type TipoDeParado = 'mineradores' | 'impressoras';
export const parados = signal<Record<TipoDeParado, number>>({ mineradores: 0, impressoras: 0 });
export const acoesDosParados: { proximo: (tipo: TipoDeParado) => void } = { proximo: () => {} };

/** Clicar num grupo filtra a seleção (UI-03). */
export const acoesDaSelecao: {
  filtrar: ((ids: EntityId[]) => void) | null;
  /** UNI-09: T do Portão (tranca ou destranca). */
  trancar: ((id: EntityId) => void) | null;
  /** ENE-26: Desplugar (tira os cabos da estrutura). */
  desplugar: ((id: EntityId) => void) | null;
} = { filtrar: null, trancar: null, desplugar: null };
