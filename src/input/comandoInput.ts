/**
 * Seleção (CTL-04 – CTL-06), ordens (CTL-07 parcial) e atalhos de §12.4, inclusive os de
 * produção (PRD-01) e o posicionamento de estruturas com holograma (UI-08). Toda ordem vira um
 * Comando serializável na simulação (TEC-07); aqui só se lê o estado.
 */
import { type PerspectiveCamera, Vector3 } from 'three';
import {
  type Caixa,
  combinar,
  type CorpoNaTela,
  corpoNoPonto,
  Grupos,
  mesmoTipoNaTela,
  selecionarCaixa,
  ToqueDuplo,
} from '../game/selecao';
import {
  MENU_BASE,
  MENU_ESTRUTURAS,
  MENU_MISSEIS,
  MENU_NAVE,
  MENU_UNIDADES,
  type OpcaoDeMenu,
} from '../game/atalhosProducao';
import { centrarEm, type EstadoCameraRts } from '../render/cameraRts';
import { pontoNoTerreno } from '../render/picking';
import type { DestrocoDesenhado } from '../render/combate';
import type { JazidaDesenhada } from '../render/jazidas';
import type { SinalDeOrdem } from '../render/sinalizadores';
import type { CorpoDesenhado } from '../render/unidades';
import { type EntityId, getComponent, isAlive, type NacaoId, type Sim } from '../sim';
import type { CustosId, EstruturasId } from '../sim/data';
import { arco, normalizar, tangente, type Vec3 } from '../sim/map/esfera';
import {
  anguloDoRumo,
  centroDoSegmento,
  encaixeEm,
  pontasLivres,
  rumoDoAngulo,
} from '../game/encaixeDeMuro';
import { ehSegmento } from '../sim/units/segmentos';
import type { Heightmap } from '../sim/map/heightmap';

/** Corpo ou jazida que pode ser apontado na tela. */
interface Projetavel {
  id: EntityId;
  tipo: string;
  nacao: string | null;
  movel: boolean;
  x: number;
  y: number;
  z: number;
  cima: [number, number, number];
  raio: number;
  altura: number;
}

/** Estruturas com cartão de fabricação próprio (§12.4). */
const MENUS_DE_ESTRUTURA: ReadonlyArray<[string, OpcaoDeMenu[]]> = [
  ['satellite_uplink', MENU_BASE],
  ['missile_silo', MENU_MISSEIS],
];

/** Distância (px) a partir da qual o arrasto vira caixa de seleção. */
const LIMIAR_ARRASTO_PX = 6;
/** D-56 (apresentação): o arrasto só gira o segmento depois disso (m), contra tremidas. */
const GIRO_MINIMO_M = 0.8;

type Modo =
  | 'normal'
  | 'mover_ignorando'
  | 'patrulhar'
  | 'atacar_mover'
  | 'reparar'
  | 'plantar'
  | 'campo'
  | 'reciclar'
  | 'satelite'
  | 'varredura';

/** Ordens de deslocamento que um clique no terreno pode dar. */
type OrdemNoTerreno = 'mover' | 'mover_ignorando' | 'patrulhar' | 'atacar_mover';

export type MenuDeProducao = 'unidades' | 'estruturas' | null;

/** Estado de produção da entrada, para o painel (UI-08). */
export interface EstadoDaEntrada {
  menu: MenuDeProducao;
  posicionando: EstruturasId | null;
  /** Motivo de o local sob o cursor não servir (PRD-10), ou null. */
  motivo: string | null;
  reparando: boolean;
}

/** Holograma da pegada sob o cursor (UI-08). */
export interface HologramaDePosicionamento {
  mostrar(tipo: EstruturasId, d: Vec3, valido: boolean, rumo?: Vec3 | null): void;
  esconder(): void;
}

export interface EntradaComandos {
  readonly selecao: readonly EntityId[];
  readonly estado: EstadoDaEntrada;
  /** Última posição do mouse (px), para o tooltip (UI-09). */
  readonly mouse: { x: number; y: number } | null;
  /** Jazida sob o ponto de tela (UI-13), ou null. */
  jazidaNoPonto(x: number, y: number): EntityId | null;
  /** Troca a seleção (clique num grupo do painel, UI-03). */
  selecionar(ids: EntityId[]): void;
  /** Botões do painel de produção: o mesmo que a tecla do item. */
  escolher(item: CustosId): void;
  abrirMenu(menu: MenuDeProducao): void;
  cancelarItem(produtor: EntityId, indice: number): void;
  cancelarObra(obra: EntityId): void;
  /** Corpos selecionados desenhados no quadro atual (para os anéis). */
  selecionadosDesenhados(): CorpoDesenhado[];
  /** CTL-03: clique direito no minimapa dá ordem de movimento para a direção. */
  ordenarEm(d: Vec3): void;
  /** CMB-28: recolhe ou libera os mineradores (Q da Nave). */
  recolherMineradores(): void;
  /** ENE-24: liga ou desliga o suporte das Baterias Móveis selecionadas. */
  alternarSuporte(): void;
  dispose(): void;
}

export interface OpcoesEntradaComandos {
  viewport: HTMLElement;
  camadaUi: HTMLElement;
  camera: PerspectiveCamera;
  estadoCamera: EstadoCameraRts;
  mapa: Heightmap;
  sim: Sim;
  jogador: NacaoId;
  corpos: () => readonly CorpoDesenhado[];
  /** Jazidas desenhadas (alvo do clique direito de coleta, CTL-07). */
  jazidas?: () => readonly JazidaDesenhada[];
  /** Destroços desenhados (alvo do clique direito de reciclar, CTL-07). */
  destrocos?: () => readonly DestrocoDesenhado[];
  aoMudarSelecao?: (ids: readonly EntityId[]) => void;
  /** PRD-10: por que o local não serve, ou null (a validação da simulação). */
  validarLocal?: (tipo: EstruturasId, d: Vec3, rumo?: Vec3 | null) => string | null;
  holograma?: HologramaDePosicionamento;
  /** UI-14: sinalizador e som da ordem no ponto (direção). */
  sinalizar?: (tipo: SinalDeOrdem, d: Vec3) => void;
  /** §12.4: Esc sem modo a cancelar abre o menu de pausa (FLX-11). */
  aoEsc?: () => void;
  /** Menu aberto por cima do jogo: as teclas de comando não valem. */
  bloqueado?: () => boolean;
}

export function ligarEntradaComandos(o: OpcoesEntradaComandos): EntradaComandos {
  const { viewport, sim, jogador } = o;
  let selecao: EntityId[] = [];
  let modo: Modo = 'normal';
  let menuAberto: MenuDeProducao = null;
  let posicionando: EstruturasId | null = null;
  let motivo: string | null = null;
  let mouse: { x: number; y: number } | null = null;
  let inicio: { x: number; y: number } | null = null;
  let arrastando = false;
  const grupos = new Grupos();
  const cliqueDuplo = new ToqueDuplo();
  const teclaDupla = new ToqueDuplo();

  const caixaDiv = document.createElement('div');
  caixaDiv.className = 'caixa-selecao';
  caixaDiv.hidden = true;
  o.camadaUi.appendChild(caixaDiv);

  const definirSelecao = (ids: EntityId[]) => {
    selecao = ids;
    o.aoMudarSelecao?.(selecao);
  };
  const definirModo = (novo: Modo) => {
    modo = novo;
    viewport.style.cursor = novo === 'normal' && !posicionando ? '' : 'crosshair';
  };
  const sairDaProducao = () => {
    menuAberto = null;
    posicionando = null;
    motivo = null;
    giro = null;
    segmentoAtual = null;
    o.holograma?.esconder();
    definirModo(modo);
  };

  const v = new Vector3();
  const naTela = (): CorpoNaTela[] => projetar(o.corpos());
  const jazidasNaTela = (): CorpoNaTela[] =>
    projetar(
      (o.jazidas?.() ?? []).map((j) => ({
        ...j,
        tipo: 'jazida',
        nacao: null,
        movel: false,
      })),
    );
  const destrocosNaTela = (): CorpoNaTela[] =>
    projetar(
      (o.destrocos?.() ?? []).map((d) => ({
        ...d,
        tipo: 'destroco',
        nacao: null,
        movel: false,
      })),
    );
  const projetar = (lista: readonly Projetavel[]): CorpoNaTela[] => {
    const r = viewport.getBoundingClientRect();
    const escala = r.height / (2 * Math.tan((o.camera.fov * Math.PI) / 360));
    return lista.map((c) => {
      // Centro do corpo: meia altura acima da base, pela vertical local.
      v.set(
        c.x + (c.cima[0] * c.altura) / 2,
        c.y + (c.cima[1] * c.altura) / 2,
        c.z + (c.cima[2] * c.altura) / 2,
      );
      const distancia = o.camera.position.distanceTo(v);
      // Atrás do planeta não conta: a câmera precisa estar acima do plano tangente do corpo.
      const doLadoVisivel =
        (o.camera.position.x - c.x) * c.cima[0] +
          (o.camera.position.y - c.y) * c.cima[1] +
          (o.camera.position.z - c.z) * c.cima[2] >
        0;
      v.project(o.camera);
      const visivel =
        doLadoVisivel && v.z > -1 && v.z < 1 && Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1;
      return {
        id: c.id,
        tipo: c.tipo,
        nacao: c.nacao,
        movel: c.movel,
        sx: r.left + ((v.x + 1) / 2) * r.width,
        sy: r.top + ((1 - v.y) / 2) * r.height,
        sr: (c.raio * escala) / Math.max(distancia, 1),
        naTela: visivel,
      };
    });
  };

  const enviar = (tipo: string, dados: Record<string, unknown>) => {
    sim.enqueue({ tick: sim.state.tick, nacao: jogador, tipo, dados: dados as never });
  };
  /** UI-14: sinaliza a ordem sobre o corpo `id` ou no terreno sob o cursor. */
  const sinal = (tipo: SinalDeOrdem, px: number, py: number, id: EntityId | null = null) => {
    if (!o.sinalizar) return;
    const corpo =
      id === null
        ? undefined
        : (o.corpos().find((c) => c.id === id) ??
          o.jazidas?.().find((j) => j.id === id) ??
          o.destrocos?.().find((d) => d.id === id));
    const ponto = corpo
      ? ([corpo.x, corpo.y, corpo.z] as Vec3)
      : pontoNoTerreno(o.camera, viewport, px, py, o.mapa);
    if (ponto) o.sinalizar(tipo, normalizar(ponto));
  };
  /** D-51: satélites próprios selecionados. */
  const satelites = () =>
    selecao.filter(
      (id) =>
        isAlive(sim.state, id) &&
        getComponent(sim.state, id, 'owner')?.nacao === jogador &&
        getComponent(sim.state, id, 'satelite') !== undefined,
    );
  const minhas = (componente: 'unit' | 'producer' | 'structure') =>
    selecao.filter(
      (id) =>
        isAlive(sim.state, id) &&
        getComponent(sim.state, id, 'owner')?.nacao === jogador &&
        getComponent(sim.state, id, componente) !== undefined,
    );

  /** Hovers de exploração selecionados (os que coletam). */
  const coletores = () =>
    minhas('unit').filter((id) => getComponent(sim.state, id, 'coleta') !== undefined);

  const tipoDe = (id: EntityId) =>
    getComponent(sim.state, id, 'unit')?.tipo ?? getComponent(sim.state, id, 'structure')?.tipo;
  const doTipo = (tipo: string) =>
    selecao.filter(
      (id) =>
        isAlive(sim.state, id) &&
        getComponent(sim.state, id, 'owner')?.nacao === jogador &&
        tipoDe(id) === tipo &&
        !getComponent(sim.state, id, 'obra'),
    );
  /** Quem constrói e repara (PRD-13, PRD-18). */
  const trabalhadores = () => [...doTipo('printer'), ...doTipo('hover_explorer')];

  /** Impressora selecionada com a menor fila (a que recebe a estrutura). */
  const impressoraLivre = (): EntityId | null => {
    const fila = (id: EntityId) => getComponent(sim.state, id, 'producer')!.fila.length;
    return doTipo('printer').sort((a, b) => fila(a) - fila(b) || a - b)[0] ?? null;
  };

  const escolher = (item: CustosId) => {
    // UI-16 (D-62): a foto da mina entra no modo de plantar; o clique no terreno escolhe o ponto.
    if (item === 'mine') {
      if (doTipo('hover_minelayer').length > 0) definirModo('plantar');
      return;
    }
    if (MENU_ESTRUTURAS.some((opcao) => opcao.item === item)) {
      if (doTipo('printer').length === 0) return;
      menuAberto = null;
      posicionando = item as EstruturasId;
      motivo = null;
      definirModo('normal');
      return;
    }
    // UNI-04 (D-55): a Base de Lançamento imprime o Satélite; UNI-10: a Lança-Mísseis, mísseis.
    for (const [tipo, menu] of MENUS_DE_ESTRUTURA) {
      const produtores = doTipo(tipo);
      if (produtores.length > 0 && menu.some((opcao) => opcao.item === item)) {
        enviar('imprimir', { ids: produtores, item });
        return;
      }
    }
    const naves = doTipo('ship');
    if (naves.length > 0 && MENU_NAVE.some((opcao) => opcao.item === item)) {
      enviar('imprimir', { ids: naves, item });
      return;
    }
    const impressoras = doTipo('printer');
    if (impressoras.length > 0) enviar('imprimir', { ids: impressoras, item });
  };

  /**
   * D-56: Muro e Portão. `giro` existe enquanto o botão está apertado: o segmento gira em volta
   * do pivô (o centro, ou a ponta encaixada) apontando para o cursor.
   */
  let giro: { pivo: Vec3; encaixado: boolean; rumo: Vec3 } | null = null;
  /** Último giro usado (ângulo a partir do norte local), para o próximo segmento livre. */
  let ultimoAngulo = 0;
  /** O segmento sob o cursor agora (centro e rumo), para o holograma e a confirmação. */
  let segmentoAtual: { centro: Vec3; rumo: Vec3 } | null = null;

  const segmentoSob = (d: Vec3): { pivo: Vec3; encaixado: boolean; rumo: Vec3 } => {
    const encaixe = encaixeEm(pontasLivres(sim.state, jogador, o.mapa.raio_m), d, o.mapa.raio_m);
    return encaixe
      ? { pivo: encaixe.ponta, encaixado: true, rumo: encaixe.saida }
      : { pivo: d, encaixado: false, rumo: rumoDoAngulo(d, ultimoAngulo) };
  };

  /** UI-08: holograma verde ou vermelho sob o cursor. */
  const atualizarHolograma = (px: number, py: number) => {
    if (!posicionando) return;
    const ponto = pontoNoTerreno(o.camera, viewport, px, py, o.mapa);
    if (!ponto) {
      o.holograma?.esconder();
      return;
    }
    const d = normalizar(ponto);
    if (!ehSegmento(posicionando)) {
      motivo = o.validarLocal?.(posicionando, d) ?? null;
      o.holograma?.mostrar(posicionando, d, motivo === null);
      return;
    }
    let base = giro ?? segmentoSob(d);
    if (giro) {
      // Arrastando: o segmento aponta do pivô para o cursor.
      const rumo =
        arco(giro.pivo, d) * o.mapa.raio_m > GIRO_MINIMO_M ? tangente(giro.pivo, d) : null;
      if (rumo) giro = base = { ...giro, rumo };
    }
    segmentoAtual = centroDoSegmento(
      posicionando,
      base.pivo,
      base.rumo,
      base.encaixado,
      o.mapa.raio_m,
    );
    motivo = o.validarLocal?.(posicionando, segmentoAtual.centro, segmentoAtual.rumo) ?? null;
    o.holograma?.mostrar(posicionando, segmentoAtual.centro, motivo === null, segmentoAtual.rumo);
  };

  /** D-56: apertar começa o giro do segmento (no centro, ou na ponta encaixada). */
  const comecarGiro = (px: number, py: number): boolean => {
    if (!posicionando || !ehSegmento(posicionando)) return false;
    const ponto = pontoNoTerreno(o.camera, viewport, px, py, o.mapa);
    if (!ponto) return false;
    giro = segmentoSob(normalizar(ponto));
    atualizarHolograma(px, py);
    return true;
  };

  const confirmarPosicionamento = (px: number, py: number, manter: boolean) => {
    if (!posicionando) return;
    const impressora = impressoraLivre();
    if (ehSegmento(posicionando)) {
      atualizarHolograma(px, py);
      const seg = segmentoAtual;
      giro = null;
      if (!seg || impressora === null) return;
      if (o.validarLocal?.(posicionando, seg.centro, seg.rumo)) return;
      ultimoAngulo = anguloDoRumo(seg.centro, seg.rumo);
      enviar('posicionar_estrutura', {
        id: impressora,
        tipo: posicionando,
        x: seg.centro[0],
        y: seg.centro[1],
        z: seg.centro[2],
        rumo: seg.rumo,
      });
      if (!manter) sairDaProducao();
      return;
    }
    const ponto = pontoNoTerreno(o.camera, viewport, px, py, o.mapa);
    if (!ponto || impressora === null) return;
    const d = normalizar(ponto);
    if (o.validarLocal?.(posicionando, d)) return;
    enviar('posicionar_estrutura', {
      id: impressora,
      tipo: posicionando,
      x: d[0],
      y: d[1],
      z: d[2],
    });
    if (!manter) sairDaProducao();
  };

  /** CTL-07: canteiro próprio → auxiliar; próprio danificado → reparar. */
  const trabalhoNoPonto = (px: number, py: number): boolean => {
    const quem = trabalhadores();
    if (quem.length === 0) return false;
    const alvo = corpoNoPonto(naTela(), px, py);
    if (!alvo || alvo.nacao !== jogador) return false;
    if (getComponent(sim.state, alvo.id, 'obra')) {
      enviar('construir', { ids: quem, alvo: alvo.id });
      sinal('construir', px, py, alvo.id);
      return true;
    }
    const vida = getComponent(sim.state, alvo.id, 'vida');
    if (vida && vida.hp < vida.max && !quem.includes(alvo.id)) {
      enviar('reparar', { ids: quem, alvo: alvo.id });
      sinal('construir', px, py, alvo.id);
      return true;
    }
    return false;
  };

  /**
   * CTL-07 (parcial): jazida → coletar (hovers de exploração; os demais se movem até lá);
   * terreno → mover; com só produtores selecionados → ponto de encontro.
   */
  /** CTL-07: inimigo → atacar (CMB-15); destroço → reciclar (hovers, ECO-28). */
  const alvoDeCombateNoPonto = (px: number, py: number): boolean => {
    const unidades = minhas('unit');
    if (unidades.length === 0) return false;
    const alvo = corpoNoPonto(naTela(), px, py);
    // D-51: satélite só é alvo de satélite.
    if (alvo && alvo.nacao !== null && alvo.nacao !== jogador && alvo.tipo !== 'satellite') {
      enviar('atacar', { ids: unidades, alvo: alvo.id });
      sinal('atacar', px, py, alvo.id);
      return true;
    }
    const hovers = doTipo('hover_explorer');
    const destroco = hovers.length > 0 ? corpoNoPonto(destrocosNaTela(), px, py) : null;
    if (destroco) {
      enviar('reciclar', { ids: hovers, alvo: destroco.id });
      sinal('reciclar', px, py, destroco.id);
      return true;
    }
    return false;
  };

  /**
   * CTL-07: estrutura própria com portas de recarga → recarregar ali (D-50); Bateria Móvel
   * própria → ir até ela e encher (D-57). Só vale para quem não está com a bateria cheia (as
   * cheias seguem para reparar ou mover).
   */
  const recargaNoPonto = (px: number, py: number): boolean => {
    const alvo = corpoNoPonto(naTela(), px, py);
    const naoCheias = (ids: EntityId[]) =>
      ids.filter((id) => {
        const b = getComponent(sim.state, id, 'bateria');
        return b !== undefined && b.en < b.max - 1e-9;
      });
    if (alvo && alvo.nacao === jogador && getComponent(sim.state, alvo.id, 'suporte')) {
      const unidades = naoCheias(minhas('unit').filter((id) => id !== alvo.id));
      if (unidades.length === 0) return false;
      enviar('recarregar_na_bateria', { ids: unidades, bateria: alvo.id });
      sinal('recarregar', px, py, alvo.id);
      return true;
    }
    if (!alvo || alvo.nacao !== jogador || !getComponent(sim.state, alvo.id, 'portas'))
      return false;
    if (getComponent(sim.state, alvo.id, 'obra')) return false;
    // Estrutura danificada: quem já está cheio vai reparar (trabalhoNoPonto), não recarregar.
    const vida = getComponent(sim.state, alvo.id, 'vida');
    const danificada = vida !== undefined && vida.hp < vida.max;
    const comRecarga = minhas('unit').filter((id) => getComponent(sim.state, id, 'recarga'));
    const unidades = danificada ? naoCheias(comRecarga) : comRecarga;
    if (unidades.length === 0) return false;
    enviar('recarregar', { ids: unidades, estrutura: alvo.id });
    sinal('recarregar', px, py, alvo.id);
    return true;
  };

  /** D-51: satélite inimigo → atacar em órbita; terreno → reposicionar. */
  const ordemDosSatelites = (px: number, py: number): void => {
    const sats = satelites();
    if (sats.length === 0) return;
    const alvo = corpoNoPonto(naTela(), px, py);
    if (alvo && alvo.tipo === 'satellite' && alvo.nacao !== jogador) {
      enviar('atacar_satelite', { ids: sats, alvo: alvo.id });
      sinal('atacar', px, py, alvo.id);
      return;
    }
    const ponto = pontoNoTerreno(o.camera, viewport, px, py, o.mapa);
    if (!ponto) return;
    enviar('reposicionar_satelite', { ids: sats, x: ponto[0], y: ponto[1], z: ponto[2] });
    o.sinalizar?.('satelite', normalizar(ponto));
  };

  /** UNI-10 (D-63): Base de Lança-Mísseis selecionada → lança o míssil da frente no ponto. */
  const misseisNoPonto = (px: number, py: number): boolean => {
    const silos = doTipo('missile_silo');
    if (silos.length === 0) return false;
    const ponto = pontoNoTerreno(o.camera, viewport, px, py, o.mapa);
    if (!ponto) return true;
    enviar('lancar_missil', { ids: silos, x: ponto[0], y: ponto[1], z: ponto[2] });
    o.sinalizar?.('atacar', normalizar(ponto));
    return true;
  };

  /** ENE-23 (D-59): Bateria Móvel selecionada + unidade própria → ir carregá-la. */
  const bateriaParaUnidade = (px: number, py: number): boolean => {
    const baterias = minhas('unit').filter((id) => getComponent(sim.state, id, 'suporte'));
    if (baterias.length === 0) return false;
    const alvo = corpoNoPonto(naTela(), px, py);
    if (!alvo || alvo.nacao !== jogador || baterias.includes(alvo.id)) return false;
    if (!getComponent(sim.state, alvo.id, 'bateria') || !getComponent(sim.state, alvo.id, 'unit'))
      return false;
    enviar('carregar_unidade', { ids: baterias, alvo: alvo.id });
    sinal('recarregar', px, py, alvo.id);
    return true;
  };

  /** CTL-07/ECO-22 (D-60): Silo Móvel próprio → os hovers com carga descarregam nele. */
  const siloNoPonto = (px: number, py: number): boolean => {
    const alvo = corpoNoPonto(naTela(), px, py);
    if (!alvo || alvo.nacao !== jogador || !getComponent(sim.state, alvo.id, 'silo')) return false;
    const hovers = coletores().filter(
      (id) => (getComponent(sim.state, id, 'coleta')?.carga ?? 0) > 0,
    );
    if (hovers.length === 0) return false;
    enviar('descarregar_no_silo', { ids: hovers, silo: alvo.id });
    sinal('descarregar', px, py, alvo.id);
    return true;
  };

  const ordemNoPonto = (px: number, py: number, tipo: OrdemNoTerreno) => {
    if (tipo === 'mover') ordemDosSatelites(px, py);
    if (tipo === 'mover' && misseisNoPonto(px, py)) return;
    if (minhas('unit').length + minhas('producer').length === 0) return;
    if (tipo === 'mover' && alvoDeCombateNoPonto(px, py)) return;
    if (tipo === 'mover' && bateriaParaUnidade(px, py)) return;
    if (tipo === 'mover' && siloNoPonto(px, py)) return;
    if (tipo === 'mover' && recargaNoPonto(px, py)) return;
    if (tipo === 'mover' && trabalhoNoPonto(px, py)) return;
    if (tipo === 'mover') {
      const jazida = corpoNoPonto(jazidasNaTela(), px, py);
      const hovers = coletores();
      if (jazida && hovers.length > 0) {
        enviar('coletar', { ids: hovers, jazida: jazida.id });
        sinal('coletar', px, py, jazida.id);
        const outros = minhas('unit').filter((id) => !hovers.includes(id));
        const alvo = pontoNoTerreno(o.camera, viewport, px, py, o.mapa);
        if (outros.length > 0 && alvo) {
          enviar('mover', { ids: outros, x: alvo[0], y: alvo[1], z: alvo[2] });
        }
        return;
      }
    }
    const ponto = pontoNoTerreno(o.camera, viewport, px, py, o.mapa);
    if (ponto) ordemNaDirecao(ponto, tipo);
  };

  /** Ordem para um ponto do mundo: unidades vão; produtores sem unidades ganham o encontro. */
  const ordemNaDirecao = (ponto: Vec3, tipo: OrdemNoTerreno) => {
    // O comando leva a direção do ponto (a simulação normaliza).
    const [x, y, z] = ponto;
    const unidades = minhas('unit');
    const marca: SinalDeOrdem =
      tipo === 'patrulhar' ? 'patrulhar' : tipo === 'atacar_mover' ? 'atacar' : 'mover';
    if (unidades.length > 0) {
      enviar(tipo, { ids: unidades, x, y, z });
      o.sinalizar?.(marca, normalizar(ponto));
      return;
    }
    const produtores = minhas('producer');
    if (produtores.length > 0 && tipo === 'mover') {
      enviar('ponto_de_encontro', { ids: produtores, x, y, z });
      o.sinalizar?.(marca, normalizar(ponto));
    }
  };

  const mostrarCaixa = (c: Caixa) => {
    const r = o.camadaUi.getBoundingClientRect();
    caixaDiv.hidden = false;
    caixaDiv.style.left = `${Math.min(c.x0, c.x1) - r.left}px`;
    caixaDiv.style.top = `${Math.min(c.y0, c.y1) - r.top}px`;
    caixaDiv.style.width = `${Math.abs(c.x1 - c.x0)}px`;
    caixaDiv.style.height = `${Math.abs(c.y1 - c.y0)}px`;
  };

  const apertou = (e: PointerEvent) => {
    if (e.button !== 0) return;
    inicio = { x: e.clientX, y: e.clientY };
    arrastando = false;
    comecarGiro(e.clientX, e.clientY);
  };
  const moveu = (e: PointerEvent) => {
    mouse = { x: e.clientX, y: e.clientY };
    atualizarHolograma(e.clientX, e.clientY);
    if (!inicio) return;
    if (!arrastando && Math.hypot(e.clientX - inicio.x, e.clientY - inicio.y) > LIMIAR_ARRASTO_PX) {
      arrastando = modo === 'normal' && !posicionando;
    }
    if (arrastando) mostrarCaixa({ x0: inicio.x, y0: inicio.y, x1: e.clientX, y1: e.clientY });
  };
  const soltou = (e: PointerEvent) => {
    if (e.button === 2) {
      if (posicionando || menuAberto) sairDaProducao();
      else if (modo !== 'normal') definirModo('normal');
      else ordemNoPonto(e.clientX, e.clientY, 'mover');
      return;
    }
    if (e.button !== 0 || !inicio) return;
    const origem = inicio;
    inicio = null;
    caixaDiv.hidden = true;
    if (posicionando) {
      arrastando = false;
      confirmarPosicionamento(e.clientX, e.clientY, e.shiftKey);
      return;
    }
    if (modo === 'reparar') {
      arrastando = false;
      trabalhoNoPonto(e.clientX, e.clientY);
      definirModo('normal');
      return;
    }
    // UNI-02: plantar mina ou Campo minado no ponto; ECO-28: reciclar o destroço.
    if (modo === 'satelite' || modo === 'varredura') {
      arrastando = false;
      const ponto = pontoNoTerreno(o.camera, viewport, e.clientX, e.clientY, o.mapa);
      if (ponto) {
        enviar(modo === 'satelite' ? 'reposicionar_satelite' : 'varredura', {
          ids: doTipo('satellite_uplink'),
          x: ponto[0],
          y: ponto[1],
          z: ponto[2],
        });
        o.sinalizar?.('satelite', normalizar(ponto));
      }
      definirModo('normal');
      return;
    }
    if (modo === 'plantar' || modo === 'campo' || modo === 'reciclar') {
      arrastando = false;
      if (modo === 'reciclar') {
        const destroco = corpoNoPonto(destrocosNaTela(), e.clientX, e.clientY);
        if (destroco) enviar('reciclar', { ids: doTipo('hover_explorer'), alvo: destroco.id });
      } else {
        const ponto = pontoNoTerreno(o.camera, viewport, e.clientX, e.clientY, o.mapa);
        if (ponto) {
          enviar(modo === 'plantar' ? 'plantar_mina' : 'campo_minado', {
            ids: doTipo('hover_minelayer'),
            x: ponto[0],
            y: ponto[1],
            z: ponto[2],
          });
        }
      }
      definirModo('normal');
      return;
    }
    if (modo !== 'normal') {
      ordemNoPonto(e.clientX, e.clientY, modo);
      definirModo('normal');
      return;
    }
    const corpos = naTela();
    if (arrastando) {
      arrastando = false;
      const caixa = { x0: origem.x, y0: origem.y, x1: e.clientX, y1: e.clientY };
      definirSelecao(combinar(selecao, selecionarCaixa(corpos, caixa, jogador), e.shiftKey, false));
      return;
    }
    const alvo = corpoNoPonto(corpos, e.clientX, e.clientY);
    if (!alvo) {
      // UI-13: clicar numa jazida a seleciona sozinha.
      const jazida = corpoNoPonto(jazidasNaTela(), e.clientX, e.clientY);
      if (jazida) definirSelecao([jazida.id]);
      else if (!e.shiftKey) definirSelecao([]);
      return;
    }
    const duplo = cliqueDuplo.tocar(`c${alvo.id}`, performance.now());
    if (duplo || e.ctrlKey) {
      definirSelecao(combinar(selecao, mesmoTipoNaTela(corpos, alvo), e.shiftKey, false));
    } else {
      definirSelecao(combinar(selecao, [alvo.id], e.shiftKey, true));
    }
  };
  const menu = (e: Event) => e.preventDefault();

  const centralizar = (ids: EntityId[]) => {
    const pontos = ids
      .map((id) => getComponent(sim.state, id, 'position'))
      .filter((p) => p !== undefined);
    if (pontos.length === 0) return;
    const soma = pontos.reduce<Vec3>((s, p) => [s[0] + p.x, s[1] + p.y, s[2] + p.z], [0, 0, 0]);
    centrarEm(o.estadoCamera, normalizar(soma));
  };

  /** Menu aberto ou posicionamento: as teclas escolhem itens (§12.4). */
  const teclaDeProducao = (e: KeyboardEvent): boolean => {
    if (!menuAberto && !posicionando) return false;
    if (e.code === 'Escape') {
      sairDaProducao();
      e.preventDefault();
      return true;
    }
    if (posicionando) return true;
    const opcoes: OpcaoDeMenu[] = menuAberto === 'unidades' ? MENU_UNIDADES : MENU_ESTRUTURAS;
    const opcao = opcoes.find((x) => x.codigo === e.code);
    if (opcao) {
      escolher(opcao.item);
      e.preventDefault();
    }
    return true;
  };

  const tecla = (e: KeyboardEvent) => {
    if (e.repeat || o.bloqueado?.()) return;
    if (!e.ctrlKey && !e.altKey && !e.metaKey && teclaDeProducao(e)) return;
    const digito = /^Digit([1-9])$/.exec(e.code);
    if (digito) {
      const n = Number(digito[1]);
      e.preventDefault();
      if (e.ctrlKey) {
        grupos.definir(n, selecao);
        return;
      }
      const ids = grupos.obter(n, (id) => isAlive(sim.state, id));
      definirSelecao(ids);
      if (teclaDupla.tocar(`g${n}`, performance.now())) centralizar(ids);
      return;
    }
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    // §12.4 (Nave): E Hover de Exploração, I Impressora.
    const daNave = doTipo('ship').length > 0 ? MENU_NAVE.find((x) => x.codigo === e.code) : null;
    if (daNave) {
      escolher(daNave.item);
      e.preventDefault();
      return;
    }
    for (const [tipo, menu] of MENUS_DE_ESTRUTURA) {
      const opcao = doTipo(tipo).length > 0 ? menu.find((x) => x.codigo === e.code) : null;
      if (opcao) {
        escolher(opcao.item);
        e.preventDefault();
        return;
      }
    }
    switch (e.code) {
      // §12.4 (Impressora): U menu de unidades; B menu de estruturas.
      case 'KeyU':
      case 'KeyB':
        if (doTipo('printer').length === 0) return;
        menuAberto = e.code === 'KeyU' ? 'unidades' : 'estruturas';
        break;
      case 'KeyS':
        enviar('parar', { ids: minhas('unit') });
        break;
      // §12.4 (Nave) Q: recolher ou liberar os mineradores (CMB-28).
      case 'KeyQ':
        if (doTipo('ship').length === 0) return;
        enviar('recolher_mineradores', {});
        break;
      case 'KeyH':
        enviar('manter_posicao', { ids: minhas('unit') });
        break;
      // §12.4: M move ignorando inimigos (D-32); A ataque-movimento (CMB-14); X postura (CMB-13).
      case 'KeyM':
        if (minhas('unit').length > 0) definirModo('mover_ignorando');
        break;
      case 'KeyA':
        if (minhas('unit').length > 0) definirModo('atacar_mover');
        break;
      case 'KeyX':
        if (minhas('unit').length === 0) return;
        enviar('alternar_postura', { ids: minhas('unit') });
        break;
      // §12.4 (Hover de Exploração) F: reciclar (ECO-28).
      case 'KeyF':
        if (doTipo('hover_explorer').length === 0) return;
        definirModo('reciclar');
        break;
      case 'KeyP':
        if (minhas('unit').length > 0) definirModo('patrulhar');
        break;
      case 'Escape':
        if (modo !== 'normal') definirModo('normal');
        else o.aoEsc?.();
        break;
      // §12.4: R recarrega agora (ENE-12).
      case 'KeyR':
        if (minhas('unit').length === 0) return;
        enviar('recarregar', { ids: minhas('unit') });
        break;
      // §12.4 T: Bateria Móvel liga o suporte; Usina Nuclear liga (o silo não ancora, D-60).
      case 'KeyT': {
        const baterias = minhas('unit').filter((id) => getComponent(sim.state, id, 'suporte'));
        const usinas = minhas('structure').filter((id) => getComponent(sim.state, id, 'reator'));
        const plantadores = doTipo('hover_minelayer');
        const observadores = doTipo('hover_scout');
        const bases = doTipo('satellite_uplink');
        // §12.4 (Portão) T: trancar ou destrancar (UNI-09).
        const portoes = doTipo('gate');
        if (portoes.length > 0) enviar('trancar_portao', { ids: portoes });
        if (
          portoes.length +
            baterias.length +
            usinas.length +
            plantadores.length +
            observadores.length +
            bases.length ===
          0
        )
          return;
        // §12.4 (Hover de Observação) T: Modo Sentinela; (Base de Lançamento) T: reposicionar.
        if (observadores.length > 0) enviar('sentinela', { ids: observadores });
        if (bases.length > 0) definirModo('satelite');
        // §12.4 (Plantio de Minas) T: plantar mina no ponto.
        if (plantadores.length > 0) definirModo('plantar');
        if (baterias.length > 0) enviar('suporte_bateria', { ids: baterias });
        if (usinas.length > 0) enviar('ligar_usina', { ids: usinas });
        break;
      }
      // §12.4 G: Silo Móvel descarrega agora; Hover de Exploração repara (PRD-18).
      case 'KeyG': {
        const silos = minhas('unit').filter((id) => getComponent(sim.state, id, 'silo'));
        const hovers = doTipo('hover_explorer');
        const plantadores = doTipo('hover_minelayer');
        const bases = doTipo('satellite_uplink');
        if (silos.length + hovers.length + plantadores.length + bases.length === 0) return;
        // §12.4 (Base de Lançamento) G: Varredura Orbital no ponto.
        if (bases.length > 0) definirModo('varredura');
        if (silos.length > 0) enviar('descarregar_silo', { ids: silos });
        if (hovers.length > 0) definirModo('reparar');
        // §12.4 (Plantio de Minas) G: Campo minado na direção indicada.
        if (plantadores.length > 0) definirModo('campo');
        break;
      }
      default:
        return;
    }
    e.preventDefault();
  };

  viewport.addEventListener('pointerdown', apertou);
  window.addEventListener('pointermove', moveu);
  window.addEventListener('pointerup', soltou);
  viewport.addEventListener('contextmenu', menu);
  window.addEventListener('keydown', tecla);

  return {
    get selecao() {
      return selecao;
    },
    get estado(): EstadoDaEntrada {
      return { menu: menuAberto, posicionando, motivo, reparando: modo === 'reparar' };
    },
    get mouse() {
      return mouse;
    },
    jazidaNoPonto(x, y) {
      return corpoNoPonto(jazidasNaTela(), x, y)?.id ?? null;
    },
    selecionar(ids) {
      definirSelecao(ids.filter((id) => isAlive(sim.state, id)));
    },
    escolher,
    abrirMenu(menu) {
      if (doTipo('printer').length === 0) return;
      sairDaProducao();
      menuAberto = menu;
    },
    cancelarItem(produtor, indice) {
      enviar('cancelar_impressao', { id: produtor, indice });
    },
    cancelarObra(obra) {
      enviar('cancelar_obra', { ids: [obra] });
    },
    selecionadosDesenhados() {
      const vivos = selecao.filter((id) => isAlive(sim.state, id));
      if (vivos.length !== selecao.length) definirSelecao(vivos);
      const porId = new Map(o.corpos().map((c) => [c.id, c]));
      return vivos.map((id) => porId.get(id)).filter((c) => c !== undefined);
    },
    ordenarEm(d) {
      ordemNaDirecao(d, 'mover');
    },
    alternarSuporte() {
      const baterias = minhas('unit').filter((id) => getComponent(sim.state, id, 'suporte'));
      if (baterias.length > 0) enviar('suporte_bateria', { ids: baterias });
    },
    recolherMineradores() {
      if (doTipo('ship').length > 0) enviar('recolher_mineradores', {});
    },
    dispose() {
      viewport.removeEventListener('pointerdown', apertou);
      window.removeEventListener('pointermove', moveu);
      window.removeEventListener('pointerup', soltou);
      viewport.removeEventListener('contextmenu', menu);
      window.removeEventListener('keydown', tecla);
      caixaDiv.remove();
    },
  };
}
