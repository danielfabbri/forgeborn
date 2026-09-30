import { corDaNacao, corDoRecurso, emblemaDe, modoDaltonico } from './paleta';
import { criarFarol } from '../render/farol';
import { DESTAQUES, TOTAL_DE_PASSOS, Tutorial } from './tutorial';
import { ambientacaoDe } from '../render/ambientacao';
import { criarLaboratorio } from '../render/laboratorio';
import type { CenariosId } from '../sim/data';
import { effect } from '@preact/signals';
import { Color, Vector3 } from 'three';
import { cenaDaNacao, destinoDaPatrulha, patrulheiro } from './cenaDemo';
import {
  comandosDeInicio,
  type ConfigFreeBattle,
  configPadrao,
  DIFICULDADES,
  type PartidaResolvida,
  resolver,
} from './freeBattle';
import { createFixedLoop } from './loop';
import {
  type ControleDireto,
  FOV_1P,
  ligarControleDireto,
  rumoEmGraus,
} from '../input/controleDireto';

import {
  alterarConfiguracoes,
  aplicarEscalaDaInterface,
  configuracoes,
  PRESETS_GRAFICOS,
} from './configuracoes';
import { somInterno, tocarSom } from '../audio/sfx';
import { SomDaPartida } from '../audio/somDaPartida';
import { Poeira } from '../render/poeira';
import { criarMar } from '../render/lagos';
import { corDaRocha, criarPedras } from '../render/pedras';
import { LuzesRender } from '../render/luzes';
import { tempestadeAtiva } from '../sim/cenario/tempestade';
import { trilhas } from '../audio/trilhas';
import { falar } from '../audio/voz';
import { textoDoAlerta } from '../ui/Alertas';
import { type Alerta, CentralDeAlertas } from './alertas';
import { estadoEm as estadoDoPouso, poseDaCinematica } from './cinematica';
import { fimDaPartida } from './fimDePartida';
import {
  irParaCampanha,
  irParaMenu,
  irParaPartida,
  lerMissaoDaUrl,
  lerPartidaDaUrl,
  novaSeed,
} from './navegacao';
import {
  comandosDaMissao,
  estrelas,
  pontoMarcado,
  lerSlot,
  registrar,
  resolverMissao,
  salvarSlot,
} from './campanha';
import { ligarEntradaCamera } from '../input/cameraInput';
import { ligarEntradaComandos } from '../input/comandoInput';
import {
  COM_CARTAO_DE_ACAO,
  MENU_ARSENAL,
  MENU_BASE,
  MENU_ESTRUTURAS,
  MENU_HANGAR,
  MENU_MINAS,
  MENU_MISSEIS,
  MENU_PORTO,
  MENU_NAVE,
  MENU_UNIDADES,
} from './atalhosProducao';
import { barrasDe, corpos as corposDa, relogio, resumoDaJazida } from './hud';
import { resumoDaSelecao } from './painelSelecao';
import { ociosos } from '../sim/economia/diretiva';
import { t, type TextKey } from '../i18n';
import { AneisDeSelecao } from '../render/aneis';
import { BarrasRender, type CorpoComBarras } from '../render/barras';
import { CombateRender } from '../render/combate';
import { RetratoRender } from '../render/retrato';
import type { TipoDeModelo } from '../render/modelos';
import {
  alturaMaxima,
  centrarEm,
  criarEstadoCamera,
  fatorPlanetario,
  poseDaCamera,
  rumoDaCamera,
} from '../render/cameraRts';
import { PositionHistory } from '../render/interpolation';
import { JazidasRender } from '../render/jazidas';
import { MemoriaDeFantasmas } from '../render/fantasmas';
import { MarcadorDeImpacto } from '../render/marcadorImpacto';
import { EmblemasRender } from '../render/emblemas';
import { Particulas } from '../render/particulas';
import { Efeitos } from '../render/vfx';
import { HologramaRender } from '../render/holograma';
import { campoDaCamera, Minimapa } from '../render/minimapa';
import { NevoaRender } from '../render/nevoa';
import { SinaisRender } from '../render/sinais';
import { SinalizadoresRender } from '../render/sinalizadores';
import { pontoNoTerreno } from '../render/picking';
import { criarCeu } from '../render/sky';
import { criarTerreno } from '../render/terrain';
import { UnidadesRender } from '../render/unidades';
import { createView, FOV_RTS } from '../render/view';
import {
  createSim,
  dados,
  type EntityId,
  entitiesWith,
  getComponent,
  isAlive,
  type NacaoId,
  param,
  type SimEvent,
} from '../sim';
import type { SystemContext } from '../sim/core/pipeline';
import {
  DEBUG_CRIAR_COMMAND,
  DEBUG_DESTRUIR_COMMAND,
  DEBUG_ESTOQUE_COMMAND,
  debugCriarHandlers,
} from '../sim/debug/criar';
import { comandosDeMacete, MACETE_COMMAND } from '../sim/debug/macete';
import { interpretarMacete } from './macetes';
import { emTransito, estoque, SEMEAR_JAZIDAS_COMMAND } from '../sim/economia';
import { DEBUG_ENCHER_BANCO_COMMAND, leituraDaRede } from '../sim/energia';
import { avancar, normalizar, norteEm, tangente, type Vec3 } from '../sim/map/esfera';
import { alturaDaSuperficie, alturaEm } from '../sim/map/heightmap';
import { emLiquido } from '../sim/map/lagos';
import { PRESETS_DE_MAPA } from '../sim/map/presets';
import { gerarMapaValido } from '../sim/map/validacao';
import { validarPosicionamento } from '../sim/producao';
import { direcaoDe } from '../sim/units/superficie';
import { explorado, visivelPara } from '../sim/visao/nevoa';
import { satelitesAtivos } from '../sim/visao/satelite';
import { alcanceDoProximo } from '../sim/combate/misseis';
import { liberado } from '../sim/producao/custos';
import { comandosDoJogo, sistemasDoJogo } from '../sim/units';
import { debugStats } from '../ui/debugStats';
import { mountUi } from '../ui/mount';
import {
  acoesDaPartida,
  acoesDaSelecao,
  acoesDaDiplomacia,
  acoesDosAlertas,
  alertasVisiveis,
  controleDireto,
  sinalPerdido,
  barraSuperior,
  canvasDoRetrato,
  fimDePartida,
  menuDePausa,
  painelSelecao,
  pausado,
  tooltip,
  acoesDosParados,
  parados,
  type TipoDeParado,
  fimDaMissao,
  acoesDoTutorial,
  tutorialNaTela,
  acoesDoMacete,
  maceteAberto,
  maceteDesconhecido,
} from '../ui/hud';
import { acoesDoPainel, avisoProducao, fotosDoPainel, painelProducao } from '../ui/producao';
import { DECLARAR_GUERRA_COMMAND, emGuerra, prazoDoAviso } from '../sim/relacoes/temperamento';
import { AtmosferaDeFora } from '../render/atmosfera';
import { caboAlcanca } from '../sim/energia/cabos';
import { redesIsoladas } from '../sim/energia';
import { ligadasComEnergia, precisaDeEnergia, redesDa } from '../sim/energia/cabos';
import { CabosRender, type MarcadorSemRede } from '../render/cabos';

/** D-42: a habilidade do clique direito de cada unidade (chave de i18n). */
const HABILIDADES: Record<string, string> = {
  hover_explorer: 'direto.habilidade.descarregar',
  hover_minelayer: 'direto.habilidade.plantar',
  hover_scout: 'direto.habilidade.sentinela',
  drone_bomber: 'direto.habilidade.pousar',
  drone_laser: 'direto.habilidade.pousar',
};

declare global {
  interface Window {
    /** Sonda para os testes E2E (só existe com `?e2e` na URL). */
    __forgeborn?: {
      amostras: Array<{ t: number; tick: number; x: number }>;
      camera?: { foco: Vec3; altura: number; rumo: number };
      selecao?: readonly EntityId[];
      /** Posição de tela (px) de um corpo, para os testes clicarem nele. */
      naTela?: (id: EntityId) => { x: number; y: number } | null;
      posicao?: (id: EntityId) => Vec3 | null;
      tipo?: (id: EntityId) => string | null;
      ordem?: (id: EntityId) => string | null;
      nacao?: (id: EntityId) => string | null;
      encontro?: (id: EntityId) => Vec3 | null;
      /** O raio sob o ponto de tela (px) toca o chão do planeta? */
      chaoNaTela?: (x: number, y: number) => boolean;
      /** Controle direto (CTL-08): unidade pilotada, câmera e alvo sob a mira. */
      direto?: () => { ativo: EntityId | null; modo: string; alvo: EntityId | null } | null;
      /** Ponto de tela (px) de uma direção no minimapa (CTL-03), ou null do outro lado. */
      noMinimapa?: (d: Vec3) => { x: number; y: number } | null;
      coleta?: (id: EntityId) => { estado: string; jazida: EntityId | null } | null;
      silo?: (id: EntityId) => string | null;
      /** Jazidas desenhadas visíveis na tela (px), para os testes clicarem nelas. */
      jazidasNaTela?: () => Array<{ id: EntityId; recurso: string; x: number; y: number }>;
      fila?: (id: EntityId) => Array<{ item: string; obra: EntityId | null }> | null;
      obra?: (id: EntityId) => { instalada: boolean; progresso: number } | null;
      /** Cria um corpo no chão sob o ponto de tela (px), pelo comando de depuração. */
      criarNaTela?: (tipo: string, nacao: string, x: number, y: number) => boolean;
      /** Estado da recarga de uma unidade e a estrutura (D-50). */
      recarga?: (id: EntityId) => { estado: string; estrutura: EntityId | null } | null;
      /** Destrói um corpo (comando de depuração), para os testes de perda (CTL-13). */
      destruir?: (id: EntityId) => void;
      /** Corpos com barras desenhadas neste quadro (UI-07). */
      barras?: () => number;
      /** A estrutura cabe no ponto de tela (px) (PRD-10)? */
      localValido?: (tipo: string, x: number, y: number) => boolean;
      /** Satélites (D-51): dono, estado e se está indo a um destino. */
      satelites?: () => Array<{ id: EntityId; nacao: string; estado: string; indo: boolean }>;
      /** Sinalizadores do clique direito ativos (UI-14), pelo tipo. */
      sinalizadores?: () => string[];
      /** Minas a plantar do Hover de Plantio (UNI-02), ou null. */
      plantios?: (id: EntityId) => { plantios: number; carregador: number } | null;
      /** UNI-10: mísseis prontos de uma Base de Lança-Mísseis e mísseis em voo. */
      misseis?: (id: EntityId) => string[] | null;
      misseisEmVoo?: () => number;
      /** Rumo guardado de uma estrutura (D-56), ou null. */
      rumo?: (id: EntityId) => Vec3 | null;
    };
  }
}

/** Monta e roda a partida da página (FLX-14): chamada pela entrada depois do carregamento. */
/** O terreno da partida, para o preset gráfico ajustar o LOD (TEC-19). */
let terrenoAtual: { aplicarLod(fator: number): void } | null = null;

export function iniciarPartida(): void {
  const viewport = document.getElementById('viewport');
  const uiRoot = document.getElementById('ui');
  if (!viewport || !uiRoot) {
    throw new Error('index.html precisa dos elementos #viewport e #ui');
  }
  const parametros = new URLSearchParams(location.search);

  // TEC-19/FLX-13: preset gráfico e escala da interface valem na hora.
  const view = createView(viewport, PRESETS_GRAFICOS[configuracoes.value.grafico]);
  mountUi(uiRoot);
  // FLX-09: a cinemática de pouso se pula com Esc, Espaço ou clique. Em captura e antes de tudo,
  // para a tecla não abrir o menu de pausa nem virar ordem.
  const pouso = { ativo: false, terminar: () => {} };
  const pularPouso = (e: Event) => {
    if (!pouso.ativo) return;
    if (e instanceof KeyboardEvent && e.code !== 'Escape' && e.code !== 'Space') return;
    e.preventDefault();
    e.stopImmediatePropagation();
    pouso.terminar();
  };
  window.addEventListener('keydown', pularPouso, { capture: true });
  window.addEventListener('pointerdown', pularPouso, { capture: true });
  effect(() => {
    const c = configuracoes.value;
    const preset = PRESETS_GRAFICOS[c.grafico];
    view.aplicarGraficos(preset.escala, preset.sombra, preset.ssao);
    terrenoAtual?.aplicarLod(preset.lod);
    aplicarEscalaDaInterface(document.documentElement, c.escalaInterface);
  });

  // VIS-01: névoa na tela na partida real; a cena de demonstração mostra tudo (`?nevoa=1` liga).
  const cenaDeDemonstracao =
    parametros.has('demo') || parametros.has('e2e') || Number(parametros.get('estresse') ?? 0) > 0;
  /**
   * A partida (T-104): a configuração de Free Battle da URL (FLX-14) sorteada pela seed. Sem ela,
   * `?ia=` monta a configuração padrão com esse nível. A cena de demonstração usa o preset padrão.
   */
  const daUrl = lerPartidaDaUrl(parametros);
  // CAM-01: a missão da campanha na URL (slot, missão e nação do slot).
  const naUrl = lerMissaoDaUrl(parametros);
  const daMissao = naUrl ? resolverMissao(naUrl.missao, naUrl.nacao as NacaoId, naUrl.slot) : null;
  const configDaPartida: ConfigFreeBattle =
    daUrl?.config ??
    (() => {
      const c = configPadrao();
      const nivel = parametros.get('ia');
      if (nivel && DIFICULDADES.includes(nivel))
        c.oponentes.forEach((o) => (o.dificuldade = nivel));
      return c;
    })();
  const seedDaPartida = daUrl?.seed ?? novaSeed();
  const resolvida: PartidaResolvida | null = daMissao
    ? daMissao.resolvida
    : cenaDeDemonstracao
      ? null
      : resolver(configDaPartida, seedDaPartida);
  const preset = PRESETS_DE_MAPA.find((p) => p.id === 'mare_tranquillitatis')!;
  const pronto = resolvida
    ? gerarMapaValido(resolvida.mapa.seed, resolvida.mapa.zonas, resolvida.mapa.cenario)
    : gerarMapaValido(preset.seed, preset.zonas, preset.cenario);
  const R = pronto.mapa.raio_m;
  const nevoaNaTela = !cenaDeDemonstracao || parametros.get('nevoa') === '1';
  const nevoa = nevoaNaTela ? new NevoaRender(pronto.grades.nevoa.esfera.n) : null;
  nevoa?.atualizar(undefined);
  // §18.2/§14.5: céu, Sol, luz e chão do cenário (o Campo de testes ganha o laboratório).
  const cenarioDaPartida: CenariosId = resolvida?.mapa.cenario ?? 'lua';
  const ambientacao = ambientacaoDe(cenarioDaPartida);
  view.ambientar(ambientacao);
  // §14.5: plataformas nas zonas de pouso e pistas até os pontos médios (Campo de testes).
  const pontosMedios = [...pronto.mapa.contestados, ...pronto.mapa.centrais];
  const pistas = ambientacao.grama
    ? {
        zonas: pronto.mapa.zonasDePouso.map((z) => z.d),
        segmentos: pontosMedios.flatMap((m) =>
          m.zonasDePouso.map((k) => [pronto.mapa.zonasDePouso[k]!.d, m.d] as const),
        ),
      }
    : null;
  const terreno = criarTerreno(pronto.mapa, nevoa, ambientacao, pistas);
  terrenoAtual = terreno;
  terreno.aplicarLod(PRESETS_GRAFICOS[configuracoes.value.grafico].lod);
  const ceu = criarCeu(ambientacao);
  view.scene.add(terreno.objeto, ceu.objeto);
  // CEN-04/§14.7 (D-90): mares de metano espelhados (Titã).
  if (pronto.mapa.mar) {
    view.scene.add(
      criarMar(
        pronto.mapa.mar.nivel,
        R,
        ambientacao.horizonte ?? new Color(0, 0, 0),
        nevoa,
        ambientacao.escuroBrilho,
      ),
    );
  }
  // CEN-17: pedras neutras.
  const pedras = criarPedras(
    pronto.mapa.pedras ?? [],
    R,
    (d) => alturaDaSuperficie(pronto.mapa, d),
    ambientacao.tinta,
    ambientacao.grama,
    nevoa,
    ambientacao.escuroBrilho,
  );
  if (pedras) view.scene.add(pedras);
  // CEN-03/§14.6: a tempestade de poeira (força 0 a 1, suavizada) no céu, na névoa, na luz e no ar.
  const poeira = ambientacao.tempestade ? new Poeira(ambientacao.tempestade.cor) : null;
  if (poeira) view.scene.add(poeira.objeto);
  let forcaDaTempestade = 0;
  const atmosferaDeFora =
    ambientacao.ceu && ambientacao.horizonte && ambientacao.tetoCamera === null
      ? new AtmosferaDeFora(R, ambientacao.horizonte, param('atmosfera_opacidade_pct') / 100)
      : null;
  if (atmosferaDeFora) view.scene.add(atmosferaDeFora.objeto);
  const atualizarClima = (dt: number): void => {
    if (!poeira) return;
    const alvo = tempestadeAtiva(sim.state) ? 1 : 0;
    forcaDaTempestade += (alvo - forcaDaTempestade) * (1 - Math.exp(-dt / 2.5));
    view.clima(forcaDaTempestade);
    ceu.clima(forcaDaTempestade);
    poeira.atualizar(forcaDaTempestade, camera.foco, pontoFocal, dt);
  };
  if (cenarioDaPartida === 'terra_lab') {
    view.scene.add(
      criarLaboratorio(
        pronto.mapa.zonasDePouso,
        pronto.mapa.raio_m,
        (d) => alturaDaSuperficie(pronto.mapa, d),
        { pontos: pontosMedios.map((m) => m.d), segmentos: pistas?.segmentos ?? [] },
      ),
    );
  }

  // Câmera: RTS por padrão (CTL-01); `?camera=geral` abre na visão planetária (CTL-16) e
  // `?camera=cinematica` numa vista baixa que olha para a Terra no horizonte.
  const modoCamera = parametros.get('camera') ?? 'rts';
  const zonaInicial =
    pronto.mapa.zonasDePouso[
      resolvida ? resolvida.zonas[0]! : modoCamera === 'cinematica' ? 2 : 0
    ]!;
  const camera = criarEstadoCamera(zonaInicial.d, R);
  // §14.5: na Terra a câmera não sobe até ver a curvatura do planeta.
  if (ambientacao.tetoCamera !== null) {
    camera.teto = ambientacao.tetoCamera;
    camera.altura = camera.alturaAlvo = Math.min(camera.altura, camera.teto);
  }
  if (modoCamera === 'geral') {
    camera.altura = camera.alturaAlvo = alturaMaxima(camera);
  } else if (modoCamera === 'cinematica') {
    camera.altura = camera.alturaAlvo = 18;
  }
  const entradaCamera =
    modoCamera === 'rts'
      ? ligarEntradaCamera(viewport, camera, {
          rolagemPelasBordas: () =>
            configuracoes.value.rolagemPelasBordas && menuDePausa.value === 'fechado',
          bloqueado: () => direto?.ativo != null,
        })
      : null;
  let chaoSuave = alturaEm(pronto.mapa, camera.foco);

  // A seed vem de fora da simulação; aqui o relógio real é permitido (TEC-05 vale para src/sim).
  const seed = seedDaPartida;
  const jogador: NacaoId = resolvida?.jogador ?? 'bra';
  // `?estresse=N`: N unidades divididas entre 4 nações (teste de carga de TEC-16).
  const estresse = Math.max(0, Number(parametros.get('estresse') ?? 0) || 0);
  const nacoes: NacaoId[] =
    resolvida?.nacoes ?? (estresse > 0 ? ['bra', 'usa', 'chn', 'rus'] : ['bra', 'usa']);
  const sim = createSim(seed, nacoes, {
    mundo: pronto,
    // CEN-02: os modificadores do cenário valem na simulação.
    cenario: cenarioDaPartida,
    systems: sistemasDoJogo,
    commandHandlers: { ...comandosDoJogo, ...debugCriarHandlers, ...comandosDeMacete },
  });

  // `?demo` (e os testes E2E): cena de demonstração com uma unidade e uma estrutura de cada tipo.
  // Sem ela, o início de partida (T-056): Nave e 1 Hover por nação, estoque padrão.
  const demo = cenaDeDemonstracao;
  const zonas = pronto.mapa.zonasDePouso;
  const zonaDe = (k: number) => zonas[(k * zonas.length) / nacoes.length]!;
  const ID_PATRULHEIRO = 1;
  if (demo) {
    // O patrulheiro do jogador é o primeiro corpo (ID 1) e a sonda E2E acompanha a sua posição.
    sim.enqueue({
      tick: 0,
      nacao: jogador,
      tipo: DEBUG_CRIAR_COMMAND,
      dados: [patrulheiro(jogador, zonaDe(0), R)] as never,
    });
  }
  // Jazidas da distribuição (CEN-10); na partida real, vêm com os comandos de início.
  if (demo)
    sim.enqueue({
      tick: 0,
      nacao: jogador,
      tipo: SEMEAR_JAZIDAS_COMMAND,
      dados: pronto.jazidas.jazidas.map((j) => ({
        recurso: j.recurso,
        quantidade: j.quantidade,
        d: j.d,
      })) as never,
    });
  if (demo) {
    nacoes.forEach((nacao, k) => {
      const extras =
        estresse > 0 ? Math.ceil(estresse / nacoes.length) - 15 - (k === 0 ? 1 : 0) : 0;
      sim.enqueue({
        tick: 0,
        nacao,
        tipo: DEBUG_CRIAR_COMMAND,
        dados: cenaDaNacao(nacao, zonaDe(k), R, Math.max(0, extras)) as never,
      });
    });
    // REG-06: toda nação começa com o banco cheio; o estoque é o do modo alto (REG-05).
    for (const nacao of nacoes) {
      sim.enqueue({ tick: 1, nacao, tipo: DEBUG_ENCHER_BANCO_COMMAND, dados: {} as never });
      sim.enqueue({
        tick: 1,
        nacao,
        tipo: DEBUG_ESTOQUE_COMMAND,
        dados: { modo: 'alto' } as never,
      });
    }
    const patrulha = destinoDaPatrulha(zonaDe(0), R);
    sim.enqueue({
      tick: 1,
      nacao: jogador,
      tipo: 'patrulhar',
      dados: { ids: [ID_PATRULHEIRO], x: patrulha[0], y: patrulha[1], z: patrulha[2] },
    });
  } else {
    // T-104: jazidas, início (REG-04 a REG-08) e IAs da configuração.
    const inicio = daMissao
      ? comandosDaMissao(daMissao, pronto)
      : comandosDeInicio(resolvida!, pronto);
    for (const comando of inicio) sim.enqueue(comando);
  }

  const history = new PositionHistory();
  const unidades = new UnidadesRender(view.scene, jogador);
  const combate = new CombateRender(view.scene, R, (d) => alturaDaSuperficie(pronto.mapa, d));
  // ART-07: partículas e efeitos, na quantidade do preset (TEC-19).
  const particulas = new Particulas(
    view.scene,
    () => PRESETS_GRAFICOS[configuracoes.value.grafico].particulas,
  );
  const efeitos = new Efeitos(view.scene, R, (d) => alturaDaSuperficie(pronto.mapa, d), particulas);
  const marcas = new SinaisRender(view.scene, R, (d) => alturaDaSuperficie(pronto.mapa, d));
  // UI-14: sinalizadores e sons das ordens do clique direito.
  const sinalizadores = new SinalizadoresRender(view.scene, R, (d) =>
    alturaDaSuperficie(pronto.mapa, d),
  );
  // ECO-04 (D-89): o corpo das jazidas é da mesma rocha das pedras do cenário.
  const jazidas = new JazidasRender(view.scene, corDaRocha(ambientacao.tinta, ambientacao.grama));
  const aneis = new AneisDeSelecao(view.scene, (d) => alturaDaSuperficie(pronto.mapa, d), R);
  const holograma = new HologramaRender(view.scene, R, (d) => alturaDaSuperficie(pronto.mapa, d));
  const barras = new BarrasRender(view.scene);
  // ENE-27/ENE-29 (D-85): cabos no chão e marcadores de sem rede.
  const cabosRender = new CabosRender(view.scene, R, (d) => alturaDaSuperficie(pronto.mapa, d));
  let semRede: MarcadorSemRede[] = [];
  let comEnergia = new Set<EntityId>();
  const luzes = new LuzesRender(view.scene);
  let ultimoSemRede = 0;
  const sincronizarCabos = (): void => {
    const st = sim.state;
    const direcao = (id: EntityId) => direcaoDe(getComponent(st, id, 'position')!);
    const cabos = st.cabos
      .filter(([a, b]) => {
        const dono = getComponent(st, a, 'owner')?.nacao;
        if (!dono) return false;
        // Os alheios só com as duas pontas à vista (VIS-01).
        return dono === jogador || (visivelAoJogador(a) && visivelAoJogador(b));
      })
      .map(([a, b]) => ({
        a: direcao(a),
        b: direcao(b),
      }));
    const agora = performance.now();
    if (agora - ultimoSemRede > 250) {
      ultimoSemRede = agora;
      // ENE-27/ART-13 (D-86): estruturas de todas as nações numa rede com energia.
      comEnergia = new Set(
        Object.keys(st.energia).flatMap((n) => [...ligadasComEnergia(st, n as NacaoId)]),
      );
      const ligadas = new Set(
        redesDa(st, jogador)
          .filter((g) => g.length > 1)
          .flat(),
      );
      semRede = unidades.corpos
        .filter(
          (c) =>
            !c.movel &&
            c.nacao === jogador &&
            !ligadas.has(c.id) &&
            !getComponent(st, c.id, 'obra') &&
            precisaDeEnergia(st, c.id),
        )
        .map((c) => ({ x: c.x, y: c.y, z: c.z, cima: c.cima, altura: c.altura }));
    }
    cabosRender.sync(cabos, semRede, agora);
    // ART-13: luzes piscando nas estruturas ligadas (as alheias, só as à vista).
    luzes.sync(
      unidades.corpos
        .filter(
          (c) =>
            !c.movel && c.nacao !== null && comEnergia.has(c.id) && !getComponent(st, c.id, 'obra'),
        )
        .map((c) => ({ ...c, cor: corDaNacao(c.nacao!) })),
      agora,
    );
  };
  const emblemas = new EmblemasRender(view.scene);
  const retrato = new RetratoRender();
  // UI-04: fotos dos itens do cartão de produção, na cor da nação do jogador.
  fotosDoPainel.de = (item) => retrato.miniatura(item as TipoDeModelo, corDaNacao(jogador));
  /** UI-07: Tab alterna as barras entre automático e "sempre" (a mesma opção das Configurações). */
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'Tab' || e.repeat) return;
    e.preventDefault();
    alterarConfiguracoes({ barrasSempre: !configuracoes.value.barrasSempre });
  });
  /** Contexto só de leitura para a validação de posicionamento (PRD-10) na interface. */
  const fantasmas = new MemoriaDeFantasmas();
  /** VIS-01: o que o jogador vê (os próprios corpos sempre). */
  const visivelAoJogador = (id: EntityId): boolean => !nevoa || visivelPara(leitura(), jogador, id);
  /** Jazidas, destroços e projéteis só em área já explorada (VIS-01). */
  const exploradoPeloJogador = (id: EntityId): boolean => {
    if (!nevoa) return true;
    const p = getComponent(sim.state, id, 'position');
    return p !== undefined && explorado(leitura(), jogador, direcaoDe(p));
  };
  const leitura = (): SystemContext => ({
    state: sim.state,
    tick: sim.state.tick,
    dt: 1 / sim.tickHz,
    commands: [],
    mundo: pronto,
    emit: () => {},
  });
  const comandos =
    modoCamera === 'rts'
      ? ligarEntradaComandos({
          viewport,
          camadaUi: uiRoot,
          camera: view.camera,
          estadoCamera: camera,
          mapa: pronto.mapa,
          sim,
          jogador,
          corpos: () => unidades.corpos,
          jazidas: () => jazidas.desenhadas,
          destrocos: () => combate.destrocosDesenhados,
          validarLocal: (tipo, d, rumo) => validarPosicionamento(leitura(), tipo, d, jogador, rumo),
          caboAlcanca: (de, para) => caboAlcanca(leitura(), de, para),
          holograma,
          sinalizar: (tipo, d) => {
            sinalizadores.mostrar(tipo, d, performance.now());
            tocarSom(`ordem_${tipo}`, 0.8);
          },
          aoEsc: () => abrirMenuDePausa(),
          bloqueado: () =>
            menuDePausa.value !== 'fechado' || fimDePartida.value !== null || direto?.ativo != null,
        })
      : null;

  // CTL-08 a CTL-15: controle direto (V com 1 unidade móvel própria selecionada).
  const direto: ControleDireto | null = comandos
    ? ligarControleDireto({
        viewport,
        camera: view.camera,
        sim,
        jogador,
        mapa: pronto.mapa,
        corpo: (id) => unidades.get(id),
        corpos: () => unidades.corpos,
        jazidas: () => jazidas.desenhadas,
        aoSair: (onde, perdida) => {
          // Esc volta à visão RTS centrada na unidade; a perdida mostra SINAL PERDIDO (CTL-13).
          centrarEm(camera, onde);
          view.camera.fov = FOV_RTS;
          view.camera.updateProjectionMatrix();
          controleDireto.value = null;
          document.body.classList.remove('em-controle-direto');
          if (perdida) {
            sinalPerdido.value = true;
            setTimeout(() => (sinalPerdido.value = false), SINAL_PERDIDO_MS);
          }
        },
      })
    : null;
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'KeyV' || e.repeat || !direto || direto.ativo !== null) return;
    if (menuDePausa.value !== 'fechado' || fimDePartida.value) return;
    const sel = comandos!.selecao.filter((id) => isAlive(sim.state, id));
    const id = sel[0];
    if (sel.length !== 1 || id === undefined) return;
    if (getComponent(sim.state, id, 'owner')?.nacao !== jogador) return;
    if (!getComponent(sim.state, id, 'unit')) return;
    e.preventDefault();
    direto.entrar(id);
    view.camera.fov = FOV_1P;
    view.camera.updateProjectionMatrix();
    document.body.classList.add('em-controle-direto');
  });
  if (comandos) {
    acoesDoPainel.atual = {
      escolher: (item) => comandos.escolher(item as never),
      abrirMenu: (menu) => comandos.abrirMenu(menu),
      cancelarItem: (produtor, indice) => comandos.cancelarItem(produtor, indice),
      cancelarObra: (obra) => comandos.cancelarObra(obra),
      recolherMineradores: () => comandos.recolherMineradores(),
    };
    acoesDaSelecao.filtrar = (ids) => comandos.selecionar(ids);
    acoesDaSelecao.desplugar = (id) =>
      sim.enqueue({
        tick: sim.state.tick,
        nacao: jogador,
        tipo: 'desligar_cabos',
        dados: { ids: [id] } as never,
      });
    acoesDaSelecao.trancar = (id) =>
      sim.enqueue({
        tick: sim.state.tick,
        nacao: jogador,
        tipo: 'trancar_portao',
        dados: { ids: [id] } as never,
      });
  }

  /** UI-15: mineradores (ECO-19) e impressoras parados do jogador, em ordem de ID. */
  const paradosAgora = (): Record<TipoDeParado, EntityId[]> => {
    const ctx = leitura();
    const impressoras = entitiesWith(sim.state, 'producer', 'unit', 'owner').filter((id) => {
      if (getComponent(sim.state, id, 'owner')!.nacao !== jogador) return false;
      if (getComponent(sim.state, id, 'unit')!.tipo !== 'printer') return false;
      if (getComponent(sim.state, id, 'producer')!.fila.length > 0) return false;
      if (getComponent(sim.state, id, 'trabalho')) return false;
      const recarga = getComponent(sim.state, id, 'recarga');
      if (recarga && recarga.estado !== 'nenhuma') return false;
      return !getComponent(sim.state, id, 'locomotion')!.destino;
    });
    return { mineradores: ociosos(ctx, jogador), impressoras };
  };
  const cicloDosParados: Record<TipoDeParado, number> = { mineradores: 0, impressoras: 0 };
  let paradosEm = 0;
  const atualizarParados = (agora: number): void => {
    if (agora - paradosEm < 250) return;
    paradosEm = agora;
    const p = paradosAgora();
    const atual = parados.peek();
    if (atual.mineradores !== p.mineradores.length || atual.impressoras !== p.impressoras.length) {
      parados.value = { mineradores: p.mineradores.length, impressoras: p.impressoras.length };
    }
  };
  acoesDosParados.proximo = (tipo) => {
    const lista = paradosAgora()[tipo];
    if (lista.length === 0 || !comandos || direto?.ativo != null) return;
    const id = lista[cicloDosParados[tipo]++ % lista.length]!;
    comandos.selecionar([id]);
    centrarEm(camera, direcaoDe(getComponent(sim.state, id, 'position')!));
  };

  /**
   * UNI-10/UNI-13: anéis no chão do alcance do míssil da frente das Lança-Mísseis selecionadas e
   * do campo das Torres Magnéticas do jogador.
   */
  const aneisDeAlcance = (): Array<{ ponto: Vec3; raio: number }> => {
    const aneis: Array<{ ponto: Vec3; raio: number }> = [];
    const selecionados = new Set(comandos?.selecao ?? []);
    for (const id of entitiesWith(sim.state, 'lancador', 'owner', 'position')) {
      if (getComponent(sim.state, id, 'owner')!.nacao !== jogador || !selecionados.has(id))
        continue;
      const alcance = alcanceDoProximo(leitura(), id);
      if (alcance)
        aneis.push({
          ponto: direcaoDe(getComponent(sim.state, id, 'position')!),
          raio: alcance.alcance,
        });
    }
    // CAM-07: o ponto marcado do passo 6.
    if (tutorial && !tutorialPulado && tutorial.passo === 6) {
      aneis.push({ ponto: tutorial.pontoMarcado, raio: 12 });
    }
    for (const id of entitiesWith(sim.state, 'magnetico', 'owner', 'position')) {
      if (getComponent(sim.state, id, 'owner')!.nacao !== jogador) continue;
      if (getComponent(sim.state, id, 'obra')) continue;
      aneis.push({
        ponto: direcaoDe(getComponent(sim.state, id, 'position')!),
        raio: param('mag_raio_m'),
      });
    }
    return aneis;
  };

  /** UI-07: barras dos corpos visíveis (do lado da câmera). */
  const corposComBarras: CorpoComBarras[] = [];
  const sincronizarBarras = (): void => {
    corposComBarras.length = 0;
    const selecionados = new Set(comandos?.selecao ?? []);
    const olho = view.camera.position;
    for (const c of unidades.corpos) {
      // No controle direto, o corpo pilotado mostra HP e EN no HUD (CTL-14), não na barra.
      if (c.id === direto?.ativo) continue;
      // UI-07 (D-58): só as unidades do jogador mostram barras.
      if (c.nacao !== jogador) continue;
      const doLado =
        (olho.x - c.x) * c.cima[0] + (olho.y - c.y) * c.cima[1] + (olho.z - c.z) * c.cima[2] > 0;
      if (!doLado) continue;
      const b = barrasDe(sim.state, c.id, selecionados.has(c.id), configuracoes.value.barrasSempre);
      if (b)
        corposComBarras.push({ x: c.x, y: c.y, z: c.z, cima: c.cima, altura: c.altura, barras: b });
    }
    const pixel =
      (2 * Math.tan((view.camera.fov * Math.PI) / 360)) / Math.max(1, viewport.clientHeight);
    barras.sync(corposComBarras, pixel);
  };

  /** UI-01, UI-03, UI-13: barra superior, painel de seleção e tooltip de jazida. */
  const ATRASO_TOOLTIP_MS = 400;
  let jazidaSobMouse: { id: EntityId; desde: number } | null = null;
  /** CTL-11: o marcador do impacto previsto da bomba (a mesma conta da simulação). */
  const impacto = new MarcadorDeImpacto(
    view.scene,
    dados.armas.find((a) => a.id === 'bomb')?.splash_m ?? 1,
  );
  const marcarImpacto = (): void => {
    const id = direto?.ativo ?? null;
    if (id === null || getComponent(sim.state, id, 'unit')?.tipo !== 'drone_bomber') {
      impacto.mostrar(null, null);
      return;
    }
    const d = direcaoDe(getComponent(sim.state, id, 'position')!);
    const loc = getComponent(sim.state, id, 'locomotion')!;
    const p = getComponent(sim.state, id, 'pilotado');
    const rumo = (p?.deslocamento && tangente(d, p.deslocamento)) || loc.rumo;
    const ponto = avancar(d, rumo, (loc.speed * param('bomba_tempo_queda_s')) / R).p;
    const r = R + alturaEm(pronto.mapa, ponto);
    impacto.mostrar([ponto[0] * r, ponto[1] * r, ponto[2] * r], ponto);
  };

  /** Apresentação: raio (m) do ambiente sonoro em volta de quem ouve. */
  const ALCANCE_DO_AMBIENTE_M = 40;
  /** CTL-13 (apresentação): 1,5 s de estática no SINAL PERDIDO. */
  const SINAL_PERDIDO_MS = 1500;
  /** CTL-14: o HUD do controle direto, lido do estado da simulação. */
  const atualizarHudDireto = (): void => {
    const id = direto?.ativo ?? null;
    const corpo = id !== null ? unidades.get(id) : undefined;
    if (id === null || !corpo) return;
    const st = sim.state;
    const tipo = getComponent(st, id, 'unit')!.tipo;
    const vida = getComponent(st, id, 'vida')!;
    const bateria = getComponent(st, id, 'bateria');
    const arma = getComponent(st, id, 'arma');
    const pilotado = getComponent(st, id, 'pilotado');
    const coleta = getComponent(st, id, 'coleta');
    const total = arma ? (dados.armas.find((a) => a.id === arma.id)?.recarga_s ?? 0) : 0;
    const alvo = direto!.alvo;
    const donoDoAlvo = alvo !== null ? getComponent(st, alvo, 'owner')?.nacao : undefined;
    const cima = corpo.cima;
    const norte = norteEm(cima);
    const rumoDe = (v: Vec3) => rumoEmGraus(cima, v, norte);
    controleDireto.value = {
      modo: direto!.modo,
      tipo,
      hp: vida.hp,
      hpMax: vida.max,
      en: bateria ? { atual: bateria.en, max: bateria.max } : null,
      recarga: arma ? (total > 0 ? 1 - arma.recarga_s / total : 1) : null,
      trava:
        arma?.id === 'opq_torpedo' && pilotado?.segurando && pilotado.travando !== null
          ? Math.min(1, pilotado.trava_s / param('trava_torpedo_s'))
          : null,
      mira:
        alvo === null
          ? null
          : getComponent(st, alvo, 'jazida')
            ? 'jazida'
            : donoDoAlvo === jogador
              ? 'aliado'
              : 'inimigo',
      rumo: rumoDe(direto!.mira),
      sinais: (st.sinais[jogador] ?? [])
        .map((p) => tangente(cima, p))
        .filter((v): v is Vec3 => v !== null)
        .map(rumoDe),
      carga: coleta ? { atual: coleta.carga, max: param('carga_hover_u') } : null,
      habilidade: HABILIDADES[tipo] ?? null,
    };
  };

  const atualizarHud = (agora: number): void => {
    atualizarHudDireto();
    atualizarAmbiente();
    alertasVisiveis.value = centralDeAlertas.visiveis(
      sim.state.tick / sim.tickHz,
      DURACAO_ALERTA_S,
    );
    const transito = emTransito(sim.state, jogador);
    const noEstoque = estoque(sim.state, jogador);
    barraSuperior.value = {
      recursos: dados.recursos.map((r) => ({
        id: r.id,
        cor: corDoRecurso(r.id),
        quantidade: noEstoque[r.id] ?? 0,
        transito: transito[r.id] ?? 0,
      })),
      energia: leituraDaRede(sim.state, jogador),
      redesIsoladas: redesIsoladas(sim.state, jogador),
      corpos: corposDa(sim.state, jogador),
      relogio: relogio(sim.state.tick, sim.tickHz),
      nacoes: sim.state.nacoes
        .filter((n) => n !== jogador && !sim.state.placar[n]?.eliminada)
        .map((n) => {
          // UI-17: o prazo que ela me deu; D-88: o aviso que eu dei não tem prazo de guerra.
          const prazo = prazoDoAviso(sim.state, n, jogador);
          const estado = emGuerra(sim.state, n, jogador)
            ? ('inimigo' as const)
            : prazo !== null
              ? ('alerta' as const)
              : prazoDoAviso(sim.state, jogador, n) !== null
                ? ('invadida' as const)
                : ('pacifico' as const);
          return { id: n, cor: corDaNacao(n), estado, prazo };
        }),
    };
    painelSelecao.value = resumoDaSelecao(sim.state, comandos?.selecao ?? []);
    // FLX-12: ao fim (ou na eliminação do jogador), congela as estatísticas e para a simulação.
    if (!fimDePartida.value) {
      const fim = fimDaPartida(sim.state, jogador, sim.tickHz, rendeu);
      if (fim) {
        if (daMissao) registrarFimDaMissao(fim.resultado, fim.duracao_s);
        fimDePartida.value = fim;
        menuDePausa.value = 'fechado';
        pausado.value = true;
      }
    }

    const mouse = comandos?.mouse ?? null;
    const jazida = mouse ? comandos!.jazidaNoPonto(mouse.x, mouse.y) : null;
    if (jazida === null) jazidaSobMouse = null;
    else if (jazidaSobMouse?.id !== jazida) jazidaSobMouse = { id: jazida, desde: agora };
    const resumo =
      jazidaSobMouse && agora - jazidaSobMouse.desde >= ATRASO_TOOLTIP_MS
        ? resumoDaJazida(sim.state, jazidaSobMouse.id)
        : null;
    tooltip.value =
      resumo && mouse
        ? {
            texto: t('jazida.tooltip', {
              recurso: t(`recurso_nome.${resumo.recurso}` as TextKey),
              quantidade: Math.floor(resumo.quantidade),
            }),
            x: mouse.x,
            y: mouse.y,
          }
        : null;
  };

  /** Avisos da produção do jogador (AL-06, AL-11). */
  const DURACAO_AVISO_MS = 3000;
  const avisar = (eventos: readonly SimEvent[]): void => {
    for (const e of eventos) {
      if (e.tipo !== 'alerta') continue;
      const dados = e.dados as { id: string; nacao: string; faltam?: Record<string, number> };
      if (dados.nacao !== jogador) continue;
      let texto: string | null = null;
      if (dados.id === 'AL-06') {
        const lista = Object.entries(dados.faltam ?? {})
          .map(([r, u]) => `${Math.ceil(u)} ${t(`recurso.${r}` as TextKey)}`)
          .join(', ');
        texto = t('alerta.AL-06', { lista });
      } else if (dados.id === 'AL-11') {
        const limite = (e.dados as { limite: string }).limite;
        texto = t('alerta.AL-11', { limite: t(`limite.${limite}` as TextKey) });
      }
      if (texto) avisoProducao.value = { texto, ate: performance.now() + DURACAO_AVISO_MS };
    }
    // ENE-26 (D-87): cabo trocado (saída única já usada) ou recusado (Nave ou Central cheia).
    for (const e of eventos) {
      if (e.tipo !== 'cabo_trocado' && e.tipo !== 'cabo_recusado') continue;
      if ((e.dados as { nacao: string }).nacao !== jogador) continue;
      avisoProducao.value = {
        texto: t(e.tipo === 'cabo_trocado' ? 'cabo.trocado' : 'cabo.recusado.saidas'),
        ate: performance.now() + DURACAO_AVISO_MS,
      };
      if (e.tipo === 'cabo_recusado') tocarSom('erro');
    }
    // UNI-10: lançamento recusado (fora do alcance, sem míssil ou recarregando).
    for (const e of eventos) {
      if (e.tipo !== 'missil_recusado') continue;
      const d = e.dados as { nacao: string; motivo: string };
      if (d.nacao !== jogador) continue;
      avisoProducao.value = {
        texto: t(`missil.recusado.${d.motivo}` as TextKey),
        ate: performance.now() + DURACAO_AVISO_MS,
      };
      tocarSom('erro');
    }
  };

  /** Painel de produção: produtor ou obra própria selecionados e o estado da entrada. */
  const atualizarPainel = (agora: number): void => {
    if (avisoProducao.value && agora > avisoProducao.value.ate) avisoProducao.value = null;
    if (!comandos) return;
    const proprios = comandos.selecao.filter(
      (id) => getComponent(sim.state, id, 'owner')?.nacao === jogador,
    );
    const obraId = proprios.find((id) => getComponent(sim.state, id, 'obra'));
    const tipoDe = (id: EntityId) =>
      getComponent(sim.state, id, 'unit')?.tipo ?? getComponent(sim.state, id, 'structure')!.tipo;
    // UI-16 (D-62): sem produtor, o cartão de ação da unidade (Plantio de Minas, Bateria Móvel).
    const produtorId =
      proprios.find(
        (id) => getComponent(sim.state, id, 'producer') && !getComponent(sim.state, id, 'obra'),
      ) ??
      proprios.find(
        (id) => getComponent(sim.state, id, 'unit') && COM_CARTAO_DE_ACAO.has(tipoDe(id)),
      );
    const entrada = comandos.estado;
    const tipoProdutor = produtorId !== undefined ? tipoDe(produtorId) : null;
    const todasAsOpcoes =
      tipoProdutor === 'ship'
        ? MENU_NAVE
        : tipoProdutor === 'satellite_uplink'
          ? MENU_BASE
          : tipoProdutor === 'hover_minelayer'
            ? MENU_MINAS
            : tipoProdutor === 'missile_silo'
              ? MENU_MISSEIS
              : tipoProdutor === 'port'
                ? MENU_PORTO
                : tipoProdutor === 'hangar'
                  ? MENU_HANGAR
                  : tipoProdutor === 'arsenal'
                    ? MENU_ARSENAL
                    : entrada.menu === 'unidades'
                      ? MENU_UNIDADES
                      : entrada.menu === 'estruturas'
                        ? MENU_ESTRUTURAS
                        : [];
    // CAM-02: na campanha, os cartões só mostram o que está liberado na missão.
    const opcoes = todasAsOpcoes.filter((o) => liberado(sim.state, o.item));
    const obra = obraId !== undefined ? getComponent(sim.state, obraId, 'obra')! : null;
    painelProducao.value = {
      produtor:
        produtorId !== undefined
          ? {
              id: produtorId,
              tipo: tipoProdutor!,
              cartaoDeAcao: !getComponent(sim.state, produtorId, 'producer'),
              fila: (getComponent(sim.state, produtorId, 'producer')?.fila ?? []).map((item) => ({
                item: item.item,
                progresso:
                  item.obra !== null
                    ? (getComponent(sim.state, item.obra, 'obra')?.progresso ?? 0)
                    : item.progresso,
              })),
            }
          : null,
      obra:
        obra && obraId !== undefined
          ? {
              id: obraId,
              tipo: tipoDe(obraId),
              progresso: obra.progresso,
              instalada: obra.instalada,
            }
          : null,
      opcoes,
      menu: entrada.menu,
      posicionando: entrada.posicionando,
      motivo: entrada.motivo,
      reparando: entrada.reparando,
      estoque: estoque(sim.state, jogador),
      recolhidos:
        tipoProdutor === 'ship'
          ? entitiesWith(sim.state, 'abrigo', 'owner').some(
              (id) => getComponent(sim.state, id, 'owner')!.nacao === jogador,
            )
          : null,
      misseis:
        tipoProdutor === 'missile_silo'
          ? {
              prontos: [...(getComponent(sim.state, produtorId!, 'lancador')?.prontos ?? [])],
              max: param('misseis_max_base'),
              recarga_s: getComponent(sim.state, produtorId!, 'lancador')?.recarga_s ?? 0,
            }
          : null,
      minas:
        tipoProdutor === 'hover_minelayer'
          ? {
              n: getComponent(sim.state, produtorId!, 'lancaMinas')?.carregador ?? 0,
              max: param('magazine_minas'),
            }
          : null,
    };
  };
  let ultimoPainel = 0;
  let ultimoEfeito = performance.now();
  let versaoNevoa = 0;

  /** VIS-09/CTL-03: minimapa no canto inferior esquerdo (UI-05), só no modo RTS. */
  const minimapa = comandos
    ? new Minimapa(
        uiRoot,
        pronto.grades.nevoa.esfera.n,
        {
          centrar: (d) => centrarEm(camera, d),
          ordenar: (d) => comandos.ordenarEm(d),
        },
        // CTL-03 (D-86): o mapa-múndi fica parado, com a zona de pouso do jogador no meio.
        zonaInicial.d,
        pronto.mapa.mar ? (d) => emLiquido(pronto.mapa, d) : null,
      )
    : null;
  const desenharMinimapa = (): void => {
    if (!minimapa) return;
    const ctx = leitura();
    minimapa.desenhar({
      foco: camera.foco,
      frente: camera.frente,
      estados: nevoa ? sim.state.nevoa[jogador] : undefined,
      versaoNevoa,
      corpos: unidades.corpos.map((c) => ({
        d: [c.x, c.y, c.z],
        cor: corDaNacao(c.nacao),
        forma: modoDaltonico() ? emblemaDe(c.nacao) : null,
        estrutura: !c.movel,
      })),
      fantasmas: nevoa ? fantasmas.visiveis(ctx, jogador).map((f) => [f.x, f.y, f.z]) : [],
      sinais: sim.state.sinais[jogador] ?? [],
      satelites: satelitesAtivos(ctx)
        .filter((s) => s.nacao === jogador)
        .map((s) => ({ ponto: s.ponto, angulo: param('satelite_visao_m') / R })),
      marcadores: pontoDoPasso6() ? [pontoDoPasso6()!] : [],
      // UI-17: domínio (REG-25) das estruturas alheias vistas ou lembradas.
      dominios: [
        ...unidades.corpos
          .filter((c) => !c.movel && c.nacao !== jogador)
          .map((c) => ({ d: normalizar([c.x, c.y, c.z]), nacao: c.nacao })),
        ...(nevoa ? fantasmas.visiveis(ctx, jogador) : []).map((f) => ({
          d: normalizar([f.x, f.y, f.z]),
          nacao: f.nacao,
        })),
      ].map((x) => ({
        d: x.d,
        cor: corDaNacao(x.nacao),
        angulo: param('dominio_estrutura_m') / R,
      })),
      campo: campoDaCamera(view.camera, R),
      agora: performance.now(),
    });
  };
  let tickTotalMs = 0;
  let tickCount = 0;

  // FLX-11/REG-21: Esc abre o menu de pausa (e pausa); Pause pausa sem menu (pausa tática).
  let rendeu = false;
  const abrirMenuDePausa = () => {
    if (fimDePartida.value) return;
    menuDePausa.value = 'aberto';
    pausado.value = true;
  };
  const continuar = () => {
    menuDePausa.value = 'fechado';
    pausado.value = false;
  };
  // Em captura: com o menu aberto, o Esc fecha o menu e não chega à entrada de comandos.
  window.addEventListener(
    'keydown',
    (e) => {
      if (e.repeat || fimDePartida.value || pouso.ativo) return;
      if (e.code === 'Escape' && menuDePausa.value !== 'fechado') {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (menuDePausa.value === 'configuracoes') menuDePausa.value = 'aberto';
        else continuar();
      } else if (e.code === 'Pause' && menuDePausa.value === 'fechado') {
        e.preventDefault();
        e.stopImmediatePropagation();
        pausado.value = !pausado.value;
      }
    },
    { capture: true },
  );
  /** CAM-05/CAM-07: o tutorial da Missão 0 (texto, voz e destaque do passo). */
  const tutorial =
    daMissao?.missao.ordem === 0
      ? new Tutorial(
          jogador,
          pontoMarcado(pronto, pronto.mapa.zonasDePouso[daMissao.resolvida.zonas[0]!]!.d),
        )
      : null;
  let tutorialPulado = false;
  const mostrarPasso = (): void => {
    if (!tutorial || tutorialPulado) return;
    tutorialNaTela.value = { passo: tutorial.passo, total: TOTAL_DE_PASSOS };
    const chave = tutorial.concluido ? 'tutorial.concluido' : `tutorial.passo${tutorial.passo}`;
    falar(t(chave as TextKey), 'media');
  };
  acoesDoTutorial.pular = () => {
    tutorialPulado = true;
    tutorialNaTela.value = null;
    for (const el of document.querySelectorAll('.tutorial-destaque'))
      el.classList.remove('tutorial-destaque');
  };
  mostrarPasso();
  /** CAM-07: o ponto marcado enquanto o passo 6 está na tela (farol, minimapa e atalho). */
  const pontoDoPasso6 = (): Vec3 | null =>
    tutorial && !tutorialPulado && tutorial.passo === 6 ? tutorial.pontoMarcado : null;
  const farol = tutorial
    ? criarFarol(tutorial.pontoMarcado, R + alturaEm(pronto.mapa, tutorial.pontoMarcado))
    : null;
  if (farol) {
    farol.visible = false;
    view.scene.add(farol);
  }
  acoesDoTutorial.irAoPonto = () => {
    const p = pontoDoPasso6();
    if (p) centrarEm(camera, p);
  };
  let destaqueEm = 0;
  /** O elemento que resolve o passo pulsa na interface. */
  const destacarPasso = (agora: number): void => {
    if (!tutorial || tutorialPulado || agora - destaqueEm < 250) return;
    destaqueEm = agora;
    const seletores = tutorial.concluido ? [] : (DESTAQUES[tutorial.passo] ?? []);
    const alvos = new Set(seletores.flatMap((s) => [...document.querySelectorAll(s)]));
    for (const el of document.querySelectorAll('.tutorial-destaque'))
      if (!alvos.has(el)) el.classList.remove('tutorial-destaque');
    for (const el of alvos) el.classList.add('tutorial-destaque');
  };

  /** CAM-03/CAM-08: o menor HP da Nave do jogador (%), medido a cada tick da missão. */
  let naveMinimaPct = 100;
  const acompanharNave = (): void => {
    if (!daMissao) return;
    for (const id of entitiesWith(sim.state, 'structure', 'owner', 'vida')) {
      if (getComponent(sim.state, id, 'structure')!.tipo !== 'ship') continue;
      if (getComponent(sim.state, id, 'owner')!.nacao !== jogador) continue;
      const v = getComponent(sim.state, id, 'vida')!;
      naveMinimaPct = Math.min(naveMinimaPct, (100 * v.hp) / v.max);
    }
  };
  /** CAM-08: na vitória, estrelas e melhor tempo entram no slot (a próxima missão abre). */
  const registrarFimDaMissao = (resultado: string, duracao_s: number): void => {
    if (!daMissao) return;
    const n =
      resultado === 'vitoria'
        ? estrelas(duracao_s, daMissao.missao.tempo_par_min, naveMinimaPct)
        : 0;
    fimDaMissao.value = { estrelas: n, missao: daMissao.missao.id };
    if (n === 0) return;
    void lerSlot(daMissao.slot).then((slot) => {
      if (!slot) return;
      return salvarSlot(
        daMissao.slot,
        registrar(slot, daMissao.missao.id, { estrelas: n, melhor_s: duracao_s }),
      );
    });
  };
  const recarregarPartida = (novaSeedDaPartida: boolean) => {
    if (daMissao) {
      location.reload();
    } else if (resolvida) {
      irParaPartida(configDaPartida, novaSeedDaPartida ? novaSeed() : seedDaPartida);
    } else {
      location.reload();
    }
  };
  acoesDaPartida.continuar = continuar;
  acoesDaPartida.abrirMenu = () => abrirMenuDePausa();
  acoesDaPartida.reiniciar = () => recarregarPartida(false);
  acoesDaPartida.jogarDeNovo = () => recarregarPartida(true);
  acoesDaPartida.sair = () => (daMissao ? irParaCampanha(daMissao.slot) : irParaMenu());
  acoesDaPartida.renderSe = () => {
    // REG-13: render-se elimina a nação do jogador; a simulação roda o tick do comando.
    rendeu = true;
    sim.enqueue({ tick: sim.state.tick, nacao: jogador, tipo: 'render_se', dados: {} as never });
    continuar();
  };

  // UI-06: alertas da simulação e os do que o jogador vê (fora da tela, rede, reserva, ociosos).
  const centralDeAlertas = new CentralDeAlertas({
    jogador,
    naTela: (id) => {
      const c = unidades.get(id);
      if (!c) return false;
      const olho = view.camera.position;
      const doLado =
        (olho.x - c.x) * c.cima[0] + (olho.y - c.y) * c.cima[1] + (olho.z - c.z) * c.cima[2] > 0;
      if (!doLado) return false;
      const v = new Vector3(c.x, c.y, c.z).project(view.camera);
      return v.z < 1 && Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1;
    },
  });
  // AUD-01: as trilhas da partida; AUD-02/AUD-04: efeitos e ambiente sintetizados.
  trilhas.tocar('partida');
  const som = new SomDaPartida({
    raio: R,
    ouvinte: () => {
      const id = direto?.ativo ?? null;
      const c = id !== null ? unidades.get(id) : undefined;
      return c ? [c.x, c.y, c.z] : [pontoFocal.x, pontoFocal.y, pontoFocal.z];
    },
    posicao: (id) => {
      if (!visivelAoJogador(id)) return null;
      const c = unidades.get(id);
      return c ? [c.x, c.y, c.z] : null;
    },
    explorado: (d) => !nevoa || explorado(leitura(), jogador, d),
    projetil: (arma) => dados.armas.find((a) => a.id === arma)?.projetil ?? null,
  });
  /** AUD-03/AUD-05: sinal sonoro pela prioridade e a voz da IA (a pilha é a legenda). */
  const aoAlertar = (alerta: Alerta): void => {
    // AUD-03 (D-84): prioridade baixa fica só na pilha, sem voz nem bipe.
    if (alerta.prioridade === 'baixa') return;
    tocarSom(
      alerta.prioridade === 'critica'
        ? 'alerta_critica'
        : alerta.prioridade === 'alta'
          ? 'alerta_alta'
          : 'alerta_baixa',
    );
    falar(textoDoAlerta(alerta), alerta.prioridade);
  };
  /** AUD-04: o ambiente segue os hovers que se movem ou mineram perto de quem ouve. */
  const atualizarAmbiente = (): void => {
    const o = som.ouvinte();
    let movendo = 0;
    let minerando = 0;
    for (const c of unidades.corpos) {
      if (!c.movel || c.nacao !== jogador) continue;
      if (Math.hypot(c.x - o[0], c.y - o[1], c.z - o[2]) > ALCANCE_DO_AMBIENTE_M) continue;
      if ((getComponent(sim.state, c.id, 'locomotion')?.speed ?? 0) > 0.2) movendo++;
      if (getComponent(sim.state, c.id, 'coleta')?.estado === 'minerando') minerando++;
    }
    // AUD-02: vento nos cenários com atmosfera, mais forte na tempestade (CEN-03).
    som.ambiente.atualizar(
      movendo / 4,
      minerando / 2,
      ambientacao.vento +
        (1 - ambientacao.vento) * forcaDaTempestade * (ambientacao.vento > 0 ? 1 : 0),
    );
    somInterno(direto?.ativo != null && direto.modo === '1p');
  };
  /** UI-06 (apresentação): cada alerta fica 10 s na pilha. */
  const DURACAO_ALERTA_S = 10;
  const irAoAlerta = (a: Alerta): void => {
    if (!a.local || direto?.ativo != null) return;
    centrarEm(camera, a.local);
  };
  acoesDosAlertas.irPara = irAoAlerta;
  // REG-29 (D-88): o jogador declara guerra (Comando serializável, como qualquer ordem).
  acoesDaDiplomacia.declararGuerra = (nacao) =>
    sim.enqueue({
      tick: sim.state.tick,
      nacao: jogador,
      tipo: DECLARAR_GUERRA_COMMAND,
      dados: { nacao },
    });
  // UI-06: Espaço vai ao último alerta.
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'Space' || e.repeat || direto?.ativo != null) return;
    if (menuDePausa.value !== 'fechado' || fimDePartida.value) return;
    const ultimo = centralDeAlertas.ultimoComLocal;
    if (!ultimo) return;
    e.preventDefault();
    irAoAlerta(ultimo);
  });

  // TEC-27 (D-76): Enter abre o campo de macetes; o macete entra na simulação como Comando.
  acoesDoMacete.enviar = (texto) => {
    const macete = interpretarMacete(texto);
    if (!macete) return false;
    sim.enqueue({
      tick: sim.state.tick,
      nacao: jogador,
      tipo: MACETE_COMMAND,
      dados: { recurso: macete.tipo === 'todos' ? 'todos' : macete.recurso },
    });
    return true;
  };
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.repeat || maceteAberto.value || direto?.ativo != null) return;
    if (pouso.ativo || menuDePausa.value !== 'fechado' || fimDePartida.value) return;
    if ((e.target as HTMLElement | null)?.closest?.('input, textarea, select')) return;
    e.preventDefault();
    maceteDesconhecido.value = false;
    maceteAberto.value = true;
  });
  // Com o campo aberto, nenhuma tecla chega aos atalhos (nem antes de o campo ganhar o foco).
  const segurarTecla = (e: KeyboardEvent) => {
    if (!maceteAberto.value) return;
    const campo = document.querySelector<HTMLInputElement>('[data-testid="macetes-campo"]');
    if (campo && e.target === campo) return;
    e.stopImmediatePropagation();
    campo?.focus();
  };
  window.addEventListener('keydown', segurarTecla, { capture: true });
  window.addEventListener('keyup', segurarTecla, { capture: true });

  const loop = createFixedLoop({
    tickHz: sim.tickHz,
    step: () => {
      history.capture(sim.state);
      const inicio = performance.now();
      const eventos = sim.step();
      tickTotalMs += performance.now() - inicio;
      acompanharNave();
      if (tutorial?.atualizar(leitura(), eventos)) mostrarPasso();
      avisar(eventos);
      som.eventos(eventos);
      for (const alerta of centralDeAlertas.processar(
        eventos,
        sim.state,
        sim.state.tick / sim.tickHz,
      )) {
        aoAlertar(alerta);
      }
      combate.registrar(sim.state, eventos, performance.now());
      unidades.registrar(eventos);
      efeitos.registrar(sim.state, eventos, performance.now(), (d) =>
        nevoa ? explorado(leitura(), jogador, d) : true,
      );
      tickCount++;
    },
    render: (alpha) => {
      unidades.sync(
        sim.state,
        history,
        alpha,
        nevoa ? visivelAoJogador : null,
        nevoa ? fantasmas.visiveis(leitura(), jogador) : [],
      );
      posicionarCamera(dtDoQuadro);
      terreno.focar(camera.foco);
      atualizarClima(dtDoQuadro);
      // CTL-16 (D-83): ao afastar, o céu dá lugar ao espaço e a atmosfera vira uma esfera.
      const planetario = direto?.ativo != null ? 0 : fatorPlanetario(camera);
      view.espaco(planetario);
      ceu.espaco(planetario);
      atmosferaDeFora?.atualizar(planetario, ceu.sol);
      jazidas.sync(sim.state, nevoa ? exploradoPeloJogador : null);
      // UI-11: emblemas das nações sobre os corpos no modo daltônico.
      emblemas.sync(unidades.corpos, modoDaltonico());
      unidades.oculto = direto?.ativo != null && direto.modo === '1p' ? direto.ativo : null;
      aneis.sync(
        comandos && direto?.ativo == null ? comandos.selecionadosDesenhados() : [],
        jogador,
      );
      sincronizarBarras();
      sincronizarCabos();
      atualizarParados(performance.now());
      destacarPasso(performance.now());
      if (farol) {
        farol.visible = pontoDoPasso6() !== null;
        farol.pulsar(performance.now());
      }
      // VIS-06/VIS-08: sinais de radar e o círculo dos satélites do jogador.
      marcas.sync(
        sim.state.sinais[jogador] ?? [],
        [
          ...satelitesAtivos(leitura())
            .filter((s) => s.nacao === jogador)
            .map((s) => ({ ponto: s.ponto, raio: param('satelite_visao_m') })),
          ...aneisDeAlcance(),
        ],
        performance.now(),
      );
      combate.sync(
        sim.state,
        (id) => unidades.get(id),
        performance.now(),
        nevoa ? exploradoPeloJogador : null,
        alpha / sim.tickHz,
      );
      sinalizadores.sync(performance.now());
      const agoraEfeitos = performance.now();
      efeitos.sync(
        sim.state,
        unidades.corpos,
        agoraEfeitos,
        Math.min(0.1, (agoraEfeitos - ultimoEfeito) / 1000),
        nevoa ? exploradoPeloJogador : () => true,
        unidades.linhasDeImpressao,
      );
      ultimoEfeito = agoraEfeitos;
      view.render();
      desenharMinimapa();
      const sel = painelSelecao.peek();
      if (sel.tipo === 'corpo') {
        retrato.desenhar(canvasDoRetrato.peek(), sel.modelo as never, sel.cor, 1 / 60);
      }
    },
  });

  const sonda: Window['__forgeborn'] =
    parametros.has('e2e') || parametros.has('sonda') ? { amostras: [] } : undefined;
  window.__forgeborn = sonda;
  if (sonda) {
    const ponto = new Vector3();
    sonda.naTela = (id) => {
      const c = unidades.get(id);
      if (!c) return null;
      // Do outro lado do planeta: fora da tela.
      const olho = view.camera.position;
      if (
        (olho.x - c.x) * c.cima[0] + (olho.y - c.y) * c.cima[1] + (olho.z - c.z) * c.cima[2] <=
        0
      ) {
        return null;
      }
      ponto
        .set(
          c.x + (c.cima[0] * c.altura) / 2,
          c.y + (c.cima[1] * c.altura) / 2,
          c.z + (c.cima[2] * c.altura) / 2,
        )
        .project(view.camera);
      const r = viewport.getBoundingClientRect();
      return {
        x: r.left + ((ponto.x + 1) / 2) * r.width,
        y: r.top + ((1 - ponto.y) / 2) * r.height,
      };
    };
    sonda.posicao = (id) => {
      const p = getComponent(sim.state, id, 'position');
      return p ? [p.x, p.y, p.z] : null;
    };
    sonda.satelites = () =>
      entitiesWith(sim.state, 'satelite', 'owner').map((id) => {
        const s = getComponent(sim.state, id, 'satelite')!;
        return {
          id,
          nacao: getComponent(sim.state, id, 'owner')!.nacao,
          estado: s.estado,
          indo: s.destino !== null,
        };
      });
    sonda.sinalizadores = () => sinalizadores.tipos;
    sonda.plantios = (id) => {
      const l = getComponent(sim.state, id, 'lancaMinas');
      return l ? { plantios: l.plantios.length, carregador: l.carregador } : null;
    };
    sonda.misseis = (id) => getComponent(sim.state, id, 'lancador')?.prontos.slice() ?? null;
    sonda.misseisEmVoo = () =>
      entitiesWith(sim.state, 'projetil').filter(
        (id) => getComponent(sim.state, id, 'projetil')!.tipo === 'missil',
      ).length;
    sonda.rumo = (id) => getComponent(sim.state, id, 'structure')?.rumo ?? null;
    sonda.tipo = (id) =>
      (getComponent(sim.state, id, 'satelite') ? 'satellite' : null) ??
      getComponent(sim.state, id, 'unit')?.tipo ??
      getComponent(sim.state, id, 'structure')?.tipo ??
      null;
    sonda.ordem = (id) => getComponent(sim.state, id, 'order')?.tipo ?? null;
    sonda.nacao = (id) => getComponent(sim.state, id, 'owner')?.nacao ?? null;
    sonda.encontro = (id) => getComponent(sim.state, id, 'producer')?.pontoDeEncontro ?? null;
    sonda.chaoNaTela = (x, y) => pontoNoTerreno(view.camera, viewport, x, y, pronto.mapa) !== null;
    sonda.noMinimapa = (d) => minimapa?.pontoDe(d) ?? null;
    sonda.direto = () =>
      direto ? { ativo: direto.ativo, modo: direto.modo, alvo: direto.alvo } : null;
    sonda.coleta = (id) => {
      const c = getComponent(sim.state, id, 'coleta');
      return c ? { estado: c.estado, jazida: c.jazida } : null;
    };
    sonda.silo = (id) => getComponent(sim.state, id, 'silo')?.estado ?? null;
    sonda.fila = (id) =>
      getComponent(sim.state, id, 'producer')?.fila.map((i) => ({ item: i.item, obra: i.obra })) ??
      null;
    sonda.obra = (id) => {
      const o = getComponent(sim.state, id, 'obra');
      return o ? { instalada: o.instalada, progresso: o.progresso } : null;
    };
    // UI-07 (D-83): as barras cheias (selecionadas ou no modo "sempre").
    sonda.barras = () => corposComBarras.filter((c) => c.barras.opacidade >= 1).length;
    sonda.recarga = (id) => {
      const r = getComponent(sim.state, id, 'recarga');
      return r ? { estado: r.estado, estrutura: r.estrutura } : null;
    };
    sonda.destruir = (id) =>
      sim.enqueue({
        tick: sim.state.tick,
        nacao: jogador,
        tipo: DEBUG_DESTRUIR_COMMAND,
        dados: { id },
      });
    sonda.criarNaTela = (tipo, nacao, x, y) => {
      const p = pontoNoTerreno(view.camera, viewport, x, y, pronto.mapa);
      if (!p || !nacoes.includes(nacao as NacaoId)) return false;
      const unidade = dados.moveis.some((m) => m.id === tipo);
      sim.enqueue({
        tick: sim.state.tick,
        nacao: nacao as NacaoId,
        tipo: DEBUG_CRIAR_COMMAND,
        dados: [
          unidade
            ? { unidade: tipo, d: p }
            : { estrutura: tipo, d: p, comSatelite: tipo === 'satellite_uplink' },
        ] as never,
      });
      return true;
    };
    sonda.localValido = (tipo, x, y) => {
      const p = pontoNoTerreno(view.camera, viewport, x, y, pronto.mapa);
      if (!p) return false;
      const r = Math.hypot(...p);
      const d: Vec3 = [p[0] / r, p[1] / r, p[2] / r];
      return validarPosicionamento(leitura(), tipo as never, d, jogador) === null;
    };
    sonda.jazidasNaTela = () => {
      const r = viewport.getBoundingClientRect();
      const olho = view.camera.position;
      return jazidas.desenhadas
        .filter(
          (j) =>
            (olho.x - j.x) * j.cima[0] + (olho.y - j.y) * j.cima[1] + (olho.z - j.z) * j.cima[2] >
            0,
        )
        .map((j) => {
          ponto.set(j.x, j.y, j.z).project(view.camera);
          return {
            id: j.id,
            recurso: j.recurso,
            x: r.left + ((ponto.x + 1) / 2) * r.width,
            y: r.top + ((1 - ponto.y) / 2) * r.height,
          };
        })
        .filter((p) => p.x > 20 && p.y > 20 && p.x < r.width - 20 && p.y < r.height - 20);
    };
    Object.defineProperty(sonda, 'selecao', { get: () => comandos?.selecao ?? [] });
  }

  let ultimoQuadro = 0;
  let quadros = 0;
  let inicioJanela = 0;
  const pontoFocal = new Vector3();

  /**
   * Vista cinematográfica: rente ao chão, 45 m atrás da base (contra a Terra), olhando o horizonte
   * no rumo da Terra. Num planeta pequeno o horizonte cai rápido com a altura, então o olho fica
   * a 1,8 m do chão e o horizonte é medido no próprio olho.
   */
  const posicionarCinematica = (): void => {
    const noFoco = new Vector3(...camera.foco);
    const rumoTerra = ceu.terra.clone().addScaledVector(noFoco, -ceu.terra.dot(noFoco)).normalize();
    const onde = avancar(camera.foco, [-rumoTerra.x, -rumoTerra.y, -rumoTerra.z], 45 / R).p;
    const cima = new Vector3(...onde);
    // ART-11: aqui o observador é o próprio olho; o céu é refeito a partir dele.
    const r = R + alturaEm(pronto.mapa, onde) + 1.8;
    const olho = new Vector3(onde[0] * r, onde[1] * r, onde[2] * r);
    ceu.atualizar(onde, norteEm(onde, camera.frente), olho);
    const horizonte = ceu.terra.clone().addScaledVector(cima, -ceu.terra.dot(cima)).normalize();
    view.camera.position.copy(olho);
    view.camera.up.copy(cima);
    view.camera.lookAt(
      view.camera.position.clone().addScaledVector(horizonte, 100).addScaledVector(cima, 3),
    );
  };

  let dtDoQuadro = 0;
  const posicionarCamera = (dt: number): void => {
    if (pouso.ativo && cameraDoPouso()) return;
    entradaCamera?.atualizar(dt);
    const pose = direto?.atualizar(performance.now()) ?? null;
    if (pose) {
      // CTL-15: câmera de 1ª ou 3ª pessoa na unidade.
      const d = normalizar(pose.olho);
      camera.foco = d;
      ceu.atualizar(d, norteEm(d), new Vector3(...pose.olho));
      view.camera.up.set(...pose.cima);
      view.camera.position.set(...pose.olho);
      pontoFocal.set(...pose.alvo);
      view.camera.lookAt(pontoFocal);
      view.camera.updateMatrixWorld();
      view.focarSombras(new Vector3(...pose.olho), ceu.sol, ceu.terra);
      marcarImpacto();
      return;
    }
    impacto.mostrar(null, null);
    // O chão sob o foco é suavizado para a câmera não saltar em bordas de platô.
    const chao = alturaEm(pronto.mapa, camera.foco);
    chaoSuave += (chao - chaoSuave) * (1 - Math.exp(-6 * dt));
    const { olho, alvo, cima } = poseDaCamera(camera, chaoSuave);
    pontoFocal.set(...alvo);
    // ART-11: Sol e Terra no referencial local do foco.
    ceu.atualizar(
      camera.foco,
      norteEm(camera.foco, camera.frente),
      pontoFocal,
      new Vector3(...olho),
    );
    view.camera.up.set(...cima);
    view.camera.position.set(...olho);
    if (modoCamera === 'cinematica') {
      posicionarCinematica();
    } else {
      view.camera.lookAt(pontoFocal);
    }
    view.camera.updateMatrixWorld();
    view.focarSombras(pontoFocal, ceu.sol, ceu.terra);
    if (sonda) {
      sonda.camera = { foco: [...camera.foco], altura: camera.altura, rumo: rumoDaCamera(camera) };
    }
  };

  const frame = (agora: number): void => {
    // O próximo quadro é agendado mesmo se este lançar erro: um erro não congela a tela.
    requestAnimationFrame(frame);
    try {
      quadro(agora);
    } catch (erro) {
      console.error(erro);
    }
  };
  const quadro = (agora: number): void => {
    // A câmera é posta no render, depois da interpolação dos corpos (no controle direto ela
    // segue a posição desenhada da unidade deste mesmo quadro, sem tremer).
    dtDoQuadro = Math.min((agora - ultimoQuadro) / 1000, 0.1);
    // REG-20: a velocidade de jogo muda quantos ticks rodam por segundo real.
    loop.speed = resolvida?.velocidade ?? 1;
    loop.paused = pausado.value;
    loop.advance(agora - ultimoQuadro);
    ultimoQuadro = agora;
    quadros++;

    if (agora - ultimoPainel >= 100) {
      atualizarPainel(agora);
      atualizarHud(agora);
      // TEC-17: a textura da névoa acompanha a grade do jogador.
      versaoNevoa++;
      if (nevoa) {
        nevoa.atualizar(sim.state.nevoa[jogador]);
        fantasmas.atualizar(leitura(), jogador);
      }
      ultimoPainel = agora;
    }

    if (agora - inicioJanela >= 500) {
      debugStats.value = {
        fps: (quadros * 1000) / (agora - inicioJanela),
        tickMs: tickCount > 0 ? tickTotalMs / tickCount : 0,
        entidades: sim.state.entities.length,
        tick: sim.state.tick,
        drawCalls: view.renderer.info.render.calls,
        triangulos: view.renderer.info.render.triangles,
        estoque: estoque(sim.state, jogador),
        transito: emTransito(sim.state, jogador),
        energia: leituraDaRede(sim.state, jogador),
      };
      quadros = 0;
      inicioJanela = agora;
      tickTotalMs = 0;
      tickCount = 0;
    }

    if (sonda) {
      const alvo = unidades.get(ID_PATRULHEIRO);
      if (alvo) {
        sonda.amostras.push({ t: agora, tick: sim.state.tick, x: alvo.x });
        if (sonda.amostras.length > 600) sonda.amostras.shift();
      }
    }
  };

  // FLX-09: cinemática de pouso na partida real (a cena de demonstração começa pousada).
  let cameraDoPouso = (): boolean => false;
  if (resolvida) {
    // O tick 0 monta a partida (a Nave e o hover existem); depois a simulação para até o fim.
    history.capture(sim.state);
    sim.step();
    const doJogador = (tipo: string) =>
      sim.state.entities.find(
        (id) =>
          (getComponent(sim.state, id, 'structure')?.tipo === tipo ||
            getComponent(sim.state, id, 'unit')?.tipo === tipo) &&
          getComponent(sim.state, id, 'owner')?.nacao === jogador,
      );
    const nave = doJogador('ship');
    const hover = doJogador('hover_explorer');
    if (nave !== undefined) {
      const zona = direcaoDe(getComponent(sim.state, nave, 'position')!);
      const posNave = getComponent(sim.state, nave, 'position')!;
      const posHover = hover !== undefined ? getComponent(sim.state, hover, 'position')! : null;
      const inicio = performance.now();
      const duracao_ms = param('duracao_pouso_s') * 1000;
      let tocou = false;
      pausado.value = true;
      pouso.ativo = true;
      document.body.classList.add('em-cinematica');
      const dica = document.createElement('div');
      dica.className = 'dica-pouso';
      dica.dataset.testid = 'pouso';
      dica.textContent = t('pouso.pular');
      document.body.appendChild(dica);
      pouso.terminar = () => {
        if (!pouso.ativo) return;
        pouso.ativo = false;
        unidades.deslocamentoVisual.clear();
        unidades.aberturaDaRampa.clear();
        dica.remove();
        document.body.classList.remove('em-cinematica');
        centrarEm(camera, zona);
        pausado.value = false;
      };
      cameraDoPouso = (): boolean => {
        const f = (performance.now() - inicio) / duracao_ms;
        if (f >= 1) {
          pouso.terminar();
          return false;
        }
        const e = estadoDoPouso(f);
        unidades.deslocamentoVisual.set(nave, [
          zona[0] * e.alturaDaNave,
          zona[1] * e.alturaDaNave,
          zona[2] * e.alturaDaNave,
        ]);
        unidades.aberturaDaRampa.set(nave, e.aberturaDaRampa);
        if (hover !== undefined && posHover) {
          const k = 1 - e.saidaDoHover;
          unidades.deslocamentoVisual.set(hover, [
            (posNave.x - posHover.x) * k,
            (posNave.y - posHover.y) * k,
            (posNave.z - posHover.z) * k,
          ]);
        }
        const chao = alturaEm(pronto.mapa, zona);
        if (e.poeira) {
          // A poeira de regolito sobe em anel sob a Nave.
          const r = R + chao + 0.5;
          particulas.emitir(
            {
              origem: [zona[0] * r, zona[1] * r, zona[2] * r],
              cima: zona,
              n: 14,
              velocidade: [4, 12],
              espalhamento: 1.4,
              vida_s: [1.2, 2.6],
              cor: [0.52, 0.5, 0.47],
              tamanho: 1.6,
              gravidade: 1.62,
            },
            'poeira',
          );
        }
        if (!tocou && e.alturaDaNave < 0.5) {
          tocou = true;
          tocarSom('explosao_grande', 0.7);
        }
        const pose = poseDaCinematica(zona, R, chao, f, e.alturaDaNave);
        ceu.atualizar(zona, norteEm(zona), new Vector3(...pose.alvo));
        view.camera.up.set(...pose.cima);
        view.camera.position.set(...pose.olho);
        pontoFocal.set(...pose.alvo);
        view.camera.lookAt(pontoFocal);
        view.camera.updateMatrixWorld();
        view.focarSombras(pontoFocal, ceu.sol, ceu.terra);
        return true;
      };
    }
  }

  requestAnimationFrame((agora) => {
    ultimoQuadro = agora;
    inicioJanela = agora;
    requestAnimationFrame(frame);
  });
}
