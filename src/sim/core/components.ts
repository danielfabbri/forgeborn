import type { ArmasId, CustosId, EstruturasId, MoveisId, RecursosId } from '../data';
import type { EntityId, NacaoId } from './types';

/** Direção unitária a partir do centro do planeta (CEN-14): um ponto da superfície. */
export type Ponto = [number, number, number];

/**
 * Componentes conhecidos da simulação (ECS leve, TEC-06): dados simples e serializáveis.
 * Outros módulos PODEM acrescentar componentes por declaration merging nesta interface.
 */
export interface ComponentMap {
  /** Posição no mundo, em metros, com o centro do planeta na origem (CEN-14). */
  position: { x: number; y: number; z: number };
  /** Nação dona do corpo. */
  owner: { nacao: NacaoId };
  /** Unidade móvel e seu tipo (linha de `dados:moveis`). */
  unit: { tipo: MoveisId };
  /** Estrutura e seu tipo (linha de `dados:estruturas`). */
  structure: {
    tipo: EstruturasId;
    /** UNI-08: frente do segmento (tangente) quando posicionado em linha; sem ela, o norte. */
    rumo?: Ponto;
  };
  /** Obstáculo rígido circular (MOV-04): estruturas e jazidas. */
  obstacle: {
    raio: number;
    /**
     * D-56: obstáculo em segmento (Muro, Portão): meio comprimento (m) do eixo que passa pelo
     * centro na direção tangente `eixo`; o obstáculo é tudo a até `raio` desse eixo.
     */
    meio?: number;
    eixo?: Ponto;
  };
  /** Estado de deslocamento de uma unidade móvel. */
  locomotion: {
    /** Rumo: vetor unitário tangente à superfície na posição atual (CEN-14). */
    rumo: [number, number, number];
    speed: number;
    /** Pontos de passagem restantes (direções). */
    rota: Ponto[];
    /** Posição final da ordem atual (o lugar da unidade na formação). */
    destino: Ponto | null;
    /** Alvo do campo de fluxo compartilhado do grupo (MOV-05), ou null para A*. */
    fluxo: Ponto | null;
    /** Teto de velocidade do grupo (MOV-06), ou null. */
    limiteVel: number | null;
    /** Segundos sem ordem de deslocamento. */
    ocioso_s: number;
    /** Segundos tentando andar sem se afastar da âncora (dispara nova rota). */
    travado_s: number;
    /** Onde a unidade estava quando começou a contar o travamento. */
    ancora: Ponto | null;
  };
  /** Ordem corrente de movimento (CTL-07, CMB-13). */
  order: {
    /**
     * `tarefa`: movimento conduzido por uma tarefa automática (coleta, ciclo do silo).
     * `mover_ignorando`: M, move sem disparar (D-32). `atacar`: alvo direto (CMB-15).
     * `atacar_mover`: A, ataque-movimento (CMB-14).
     */
    tipo:
      | 'nenhuma'
      | 'mover'
      | 'mover_ignorando'
      | 'patrulhar'
      | 'manter'
      | 'tarefa'
      | 'atacar'
      | 'atacar_mover';
    patrulha: [Ponto, Ponto] | null;
  };
  /** Drones (MOV-07). */
  air: { estado: 'voando' | 'pousando' | 'pousado' | 'decolando'; timer_s: number };
  /** Produtores (Nave e Impressora): fila única (PRD-03) e ponto de encontro (PRD-08). */
  producer: { pontoDeEncontro: Ponto | null; fila: ItemDaFila[] };
  /** HP corrente e máximo (CMB-01); o canteiro cresce com a obra (PRD-11). */
  vida: { hp: number; max: number };
  /**
   * Estrutura em construção (PRD-10 a PRD-14). Antes de `instalada`, a pegada só está reservada
   * (D-29): não é obstáculo nem tem HP. Até 100% não funciona (PRD-12).
   */
  obra: {
    progresso: number;
    instalada: boolean;
    /** Recursos pagos ao posicionar (PRD-04), base do reembolso (PRD-05, PRD-14). */
    pago: Partial<Record<RecursosId, number>>;
    /** Construtores ativos no último tick (PRD-15). */
    construtores: EntityId[];
  };
  /**
   * Ordem direta de construir, reparar ou reciclar (PRD-13, PRD-18, ECO-28); `auto` = reparo
   * da PRD-19.
   */
  trabalho: { tipo: 'construir' | 'reparar' | 'reciclar'; alvo: EntityId; auto: boolean };
  /**
   * Estado de combate de todo corpo com HP (ENE-15, ECO-13, CMB-12): tempos sem combate e sem
   * dano, quem atacou por último e a nação que causou o último dano (pontuação, REG-22).
   */
  combate: {
    semCombate_s: number;
    semDano_s: number;
    ultimoAtacante: EntityId | null;
    ultimoDanoNacao: NacaoId | null;
  };
  /** Arma do corpo (§8.4) e o engajamento dela (§9.5). */
  arma: {
    id: ArmasId;
    /** Segundos até poder disparar de novo. */
    recarga_s: number;
    alvo: EntityId | null;
    /** CMB-13: postura (estruturas não têm e disparam em qualquer alvo no alcance). */
    postura: 'agressiva' | 'defensiva' | 'manter' | 'passiva' | null;
    /** CMB-13: âncora da coleira (onde o engajamento começou). */
    origem: Ponto | null;
    /** Último ponto de perseguição traçado. */
    perseguindo: Ponto | null;
    /** CMB-15: alvo da ordem de ataque direta. */
    alvoDireto: EntityId | null;
    /** CMB-14/patrulha: a ordem a retomar depois do engajamento. */
    retomar: {
      tipo: 'patrulhar' | 'atacar_mover';
      patrulha: [Ponto, Ponto] | null;
      destino: Ponto | null;
    } | null;
    /** ENE-03/ENE-04: armas da rede (Torre, Nave) — demanda e fração atendida. */
    demanda_en_s: number;
    atendido: number;
  };
  /** Projétil em voo (CMB-07, CMB-08). */
  projetil: {
    tipo: 'torpedo' | 'bomba';
    arma: ArmasId;
    atirador: EntityId;
    nacao: NacaoId;
    alvo: EntityId | null;
    /** Última posição conhecida do alvo (torpedo) ou ponto de impacto (bomba). */
    ponto: Ponto;
    voo_s: number;
    /** CMB-16: dano esperado no alvo. */
    dano: number;
    /** D-40: torpedo sem trava do controle direto voa reto neste rumo. */
    rumo?: Ponto;
  };
  /**
   * Controle direto (CTL-08 a CTL-12): a entrada do jogador, atualizada pelo comando `pilotar`.
   * Enquanto existir, a unidade não age sozinha (D-44).
   */
  pilotado: {
    /** W/S e A/D, de -1 a 1. */
    frente: number;
    lateral: number;
    /** Para onde a mira aponta (tangente no chão): o corpo gira até ela. */
    rumo: Ponto;
    impulso: boolean;
    /** Clique esquerdo pressionado. */
    gatilho: boolean;
    /** Corpo ou jazida sob a mira, e o ponto do chão sob ela. */
    alvo: EntityId | null;
    ponto: Ponto | null;
    /** CTL-11: alvo sendo travado pelo torpedo e há quanto tempo. */
    travando: EntityId | null;
    trava_s: number;
    segurando: boolean;
    /** D-42: drone pedido no chão (clique direito pousa ou decola). */
    pousar: boolean;
    /** Direção do último deslocamento (a unidade freia nela sem entrada). */
    deslocamento: Ponto | null;
    /** D-42: plantio de mina em andamento (ponto e segundos). */
    plantio: { ponto: Ponto; timer_s: number } | null;
  };
  /** Destroço (ECO-27 a ECO-29). */
  destroco: { composicao: Partial<Record<RecursosId, number>>; restante_s: number };
  /** Zona de radiação da Usina Nuclear (CMB-24). */
  radiacao: { restante_s: number };
  /** D-57: unidade mandada à Bateria Móvel `bateria` para encher até 100%. */
  seguirBateria: { bateria: EntityId };
  /** ECO-13: hover em fuga; retoma após `fuga_hover_retorno_s` sem dano. */
  fuga: { abrigo: EntityId };
  /** Hover de Plantio de Minas (UNI-01, UNI-02). */
  lancaMinas: {
    carregador: number;
    /** Progresso da fabricação da próxima mina (0..1), ou null. */
    fabricando: number | null;
    /** Minas a plantar, em ordem, e o tempo do plantio corrente. */
    plantios: Ponto[];
    plantio_s: number;
  };
  /** Satélite da Base de Lançamento (UNI-04 a UNI-06, VIS-08). */
  satelite: {
    /** A Base de Lançamento que o mantém (UNI-05: cai com ela). */
    base: EntityId;
    estado: 'lancando' | 'orbita';
    timer_s: number;
    /** Ponto de visão persistente (no solo, sob o satélite) e para onde está indo. */
    ponto: Ponto;
    destino: Ponto | null;
    /** Recarga da Varredura Orbital e a varredura ativa. */
    recarga_s: number;
    varredura: { ponto: Ponto; restante_s: number } | null;
    /** D-51: HP e o laser orbital (recarga e alvo escolhido). */
    hp: number;
    max: number;
    recargaArma_s: number;
    alvo: EntityId | null;
  };
  /**
   * Modo Sentinela do Hover de Observação (UNI-03): implantando → ativo → recolhendo.
   * Parado; visão, detecção e radar próprios; camuflado (CMB-22).
   */
  sentinela: { estado: 'implantando' | 'ativo' | 'recolhendo'; timer_s: number };
  /** REG-10: nação eliminada; o corpo se desliga e explode sem dano em `em_s`. */
  autodestruicao: { em_s: number };
  /**
   * CMB-28 (D-52): hover recolhido. `indo` ao abrigo; `dentro`, fora do mapa, somando um
   * disparo de `abrigo_laser` à estrutura (recarga desse disparo em `recargas[0]`).
   */
  abrigo: { estrutura: EntityId; estado: 'indo' | 'dentro'; recargas: number[] };
  /** Portão (UNI-09, D-54): abertura 0..1, trancado pelo dono e segundos sem unidade própria. */
  portao: { abertura: number; trancado: boolean; semUnidade_s: number };
  /** Mina plantada (UNI-07): arma após `tempo_armar_mina_s`. */
  mine: { armada: boolean; timer_s: number };
  /**
   * Jazida de recurso (ECO-04, ECO-05). `vagas` tem `slots_por_jazida` posições fixas em volta da
   * jazida, com o hover designado (indo ou minerando) ou null.
   */
  jazida: {
    recurso: RecursosId;
    quantidade: number;
    inicial: number;
    vagas: Array<EntityId | null>;
    fila: EntityId[];
  };
  /** Ciclo de coleta do Hover de Exploração (ECO-09 a ECO-12, ECO-19, ECO-20). */
  coleta: {
    estado:
      'ocioso' | 'indo_jazida' | 'esperando' | 'minerando' | 'indo_entregar' | 'descarregando';
    jazida: EntityId | null;
    /** Recurso que o hover está coletando (ou vai coletar). */
    recurso: RecursosId | null;
    /** Carga a bordo e o recurso dela (ECO-15: em trânsito). */
    carga: number;
    cargaRecurso: RecursosId | null;
    /** Ponto de entrega escolhido (Nave, Armazém ou Silo Móvel). */
    entrega: EntityId | null;
    timer_s: number;
    /** ECO-20: designado pelo jogador (fica na jazida até esgotar). */
    manual: boolean;
    /** ECO-28: carga de sucata (composição do destroço), ou null. */
    sucata: Partial<Record<RecursosId, number>> | null;
  };
  /** ENE-08 a ENE-11: bateria de uma unidade móvel. */
  bateria: {
    en: number;
    max: number;
    /** ENE-15: auto-recarga ligada. */
    autoRecarga: boolean;
    /** ENE-20: recebeu energia de uma Bateria Móvel neste tick. */
    recebendo: boolean;
  };
  /** Ida à recarga (ENE-12 a ENE-16). */
  recarga: {
    estado: 'nenhuma' | 'indo' | 'fila' | 'acoplada';
    /** Estrutura com portas escolhida. */
    estrutura: EntityId | null;
    /** D-28: para onde voltar depois (posição e patrulha), se não for hover nem Impressora. */
    retorno: { ponto: Ponto; patrulha: [Ponto, Ponto] | null } | null;
    /** Saiu sozinha (auto-recarga) ou por ordem (R). */
    automatica: boolean;
  };
  /** ENE-12: portas de recarga de uma estrutura (posições fixas, com a unidade acoplada ou null). */
  portas: { ocupantes: Array<EntityId | null>; fila: EntityId[] };
  /** ENE-03/ENE-04: consumidor da rede (defesas, satélites, impressão na Nave). */
  consumidor: {
    /** 1 defesas, 2 satélites, 3 impressão na Nave (as portas são o nível 4). */
    prioridade: 1 | 2 | 3;
    demanda_en_s: number;
    /** Fração atendida no último tick (0..1). */
    atendido: number;
    /** ENE-04: satélite não atendido por inteiro fica offline. */
    offline: boolean;
  };
  /** ENE-06: Usina Nuclear. */
  reator: {
    ligado: boolean;
    /** Segundos restantes do ciclo de combustível atual (0 = precisa de Urânio). */
    ciclo_s: number;
    /** Tempo para religar (ENE-06). */
    religando_s: number;
    /** Sem Urânio (AL-10 já emitido). */
    semUranio: boolean;
  };
  /** ENE-18: modo suporte da Bateria Móvel. */
  suporte: {
    ligado: boolean;
    alvos: EntityId[];
    /** ENE-23 (D-59): unidade que o jogador mandou a bateria carregar, ou null. */
    atender?: EntityId | null;
  };
  /** Silo Móvel (ECO-22 a ECO-25). */
  silo: {
    /** D-60: sem âncora; `solto` recebe e anda; `descarregando` fica no depósito. */
    estado: 'solto' | 'indo_descarregar' | 'descarregando' | 'voltando';
    timer_s: number;
    carga: Partial<Record<RecursosId, number>>;
    /** Onde voltar depois do ciclo (ECO-24). */
    ancora: Ponto | null;
    cicloAutomatico: boolean;
    limiar_pct: number;
    entrega: EntityId | null;
  };
}

export type ComponentName = keyof ComponentMap;

/** Item da fila de um produtor (PRD-03 a PRD-06). */
export interface ItemDaFila {
  item: CustosId;
  /** 0..1 (unidades); estruturas guardam o progresso na `obra`. */
  progresso: number;
  pago: Partial<Record<RecursosId, number>>;
  /** Canteiro da estrutura (itens de estrutura da Impressora). */
  obra: EntityId | null;
}
