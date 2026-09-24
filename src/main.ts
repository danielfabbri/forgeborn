import './styles.css';
import { Vector3 } from 'three';
import { cenaDaNacao, destinoDaPatrulha, patrulheiro } from './game/cenaDemo';
import { createFixedLoop } from './game/loop';
import { ligarEntradaCamera } from './input/cameraInput';
import { ligarEntradaComandos } from './input/comandoInput';
import { MENU_ESTRUTURAS, MENU_NAVE, MENU_UNIDADES } from './game/atalhosProducao';
import { barrasDe, corpos as corposDa, relogio, resumoDaJazida } from './game/hud';
import { resumoDaSelecao } from './game/painelSelecao';
import { t, type TextKey } from './i18n';
import { AneisDeSelecao } from './render/aneis';
import { BarrasRender, type CorpoComBarras } from './render/barras';
import { CombateRender } from './render/combate';
import { RetratoRender } from './render/retrato';
import {
  alturaMaxima,
  centrarEm,
  criarEstadoCamera,
  poseDaCamera,
  rumoDaCamera,
} from './render/cameraRts';
import { PositionHistory } from './render/interpolation';
import { JazidasRender } from './render/jazidas';
import { MemoriaDeFantasmas } from './render/fantasmas';
import { HologramaRender } from './render/holograma';
import { campoDaCamera, Minimapa } from './render/minimapa';
import { NevoaRender } from './render/nevoa';
import { SinaisRender } from './render/sinais';
import { pontoNoTerreno } from './render/picking';
import { criarCeu } from './render/sky';
import { criarTerreno } from './render/terrain';
import { UnidadesRender } from './render/unidades';
import { createView } from './render/view';
import {
  createSim,
  dados,
  type EntityId,
  getComponent,
  type NacaoId,
  param,
  type SimEvent,
} from './sim';
import type { SystemContext } from './sim/core/pipeline';
import { DEBUG_CRIAR_COMMAND, DEBUG_ESTOQUE_COMMAND, debugCriarHandlers } from './sim/debug/criar';
import { emTransito, estoque, SEMEAR_JAZIDAS_COMMAND } from './sim/economia';
import { DEBUG_ENCHER_BANCO_COMMAND, leituraDaRede } from './sim/energia';
import { avancar, norteEm, type Vec3 } from './sim/map/esfera';
import { alturaEm } from './sim/map/heightmap';
import { PRESETS_DE_MAPA } from './sim/map/presets';
import { gerarMapaValido } from './sim/map/validacao';
import { ATIVAR_IA_COMMAND } from './sim/ia';
import { INICIAR_PARTIDA_COMMAND, validarPosicionamento } from './sim/producao';
import { direcaoDe } from './sim/units/superficie';
import { explorado, visivelPara } from './sim/visao/nevoa';
import { satelitesAtivos } from './sim/visao/satelite';
import { comandosDoJogo, sistemasDoJogo } from './sim/units';
import { debugStats } from './ui/debugStats';
import { mountUi } from './ui/mount';
import {
  acoesDaSelecao,
  barraSuperior,
  canvasDoRetrato,
  fimDePartida,
  painelSelecao,
  tooltip,
} from './ui/hud';
import { acoesDoPainel, avisoProducao, painelProducao } from './ui/producao';

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
      /** Corpos com barras desenhadas neste quadro (UI-07). */
      barras?: () => number;
      /** A estrutura cabe no ponto de tela (px) (PRD-10)? */
      localValido?: (tipo: string, x: number, y: number) => boolean;
    };
  }
}

const viewport = document.getElementById('viewport');
const uiRoot = document.getElementById('ui');
if (!viewport || !uiRoot) {
  throw new Error('index.html precisa dos elementos #viewport e #ui');
}
const parametros = new URLSearchParams(location.search);

const view = createView(viewport);
mountUi(uiRoot);

// Planeta: preset Mare Tranquillitatis até existir a configuração de partida (T-104).
const preset = PRESETS_DE_MAPA.find((p) => p.id === 'mare_tranquillitatis')!;
const pronto = gerarMapaValido(preset.seed, preset.tamanho, preset.zonas, preset.cenario);
const R = pronto.mapa.raio_m;
// VIS-01: névoa na tela na partida real; a cena de demonstração mostra tudo (`?nevoa=1` liga).
const cenaDeDemonstracao =
  parametros.has('demo') || parametros.has('e2e') || Number(parametros.get('estresse') ?? 0) > 0;
const nevoaNaTela = !cenaDeDemonstracao || parametros.get('nevoa') === '1';
const nevoa = nevoaNaTela ? new NevoaRender(pronto.grades.nevoa.esfera.n) : null;
nevoa?.atualizar(undefined);
const terreno = criarTerreno(pronto.mapa, nevoa);
const ceu = criarCeu();
view.scene.add(terreno.objeto, ceu.objeto);

// Câmera: RTS por padrão (CTL-01); `?camera=geral` abre na visão planetária (CTL-16) e
// `?camera=cinematica` numa vista baixa que olha para a Terra no horizonte.
const modoCamera = parametros.get('camera') ?? 'rts';
const zonaInicial = pronto.mapa.zonasDePouso[modoCamera === 'cinematica' ? 2 : 0]!;
const camera = criarEstadoCamera(zonaInicial.d, R);
if (modoCamera === 'geral') {
  camera.altura = camera.alturaAlvo = alturaMaxima(camera);
} else if (modoCamera === 'cinematica') {
  camera.altura = camera.alturaAlvo = 18;
}
const entradaCamera =
  modoCamera === 'rts'
    ? ligarEntradaCamera(viewport, camera, { rolagemPelasBordas: () => true })
    : null;
let chaoSuave = alturaEm(pronto.mapa, camera.foco);

// A seed vem de fora da simulação; aqui o relógio real é permitido (TEC-05 vale para src/sim).
const seed = Date.now() % 2_147_483_647;
const jogador: NacaoId = 'bra';
// `?estresse=N`: N unidades divididas entre 4 nações (teste de carga de TEC-16).
const estresse = Math.max(0, Number(parametros.get('estresse') ?? 0) || 0);
const nacoes: NacaoId[] = estresse > 0 ? ['bra', 'usa', 'chn', 'rus'] : ['bra', 'usa'];
const sim = createSim(seed, nacoes, {
  mundo: pronto,
  systems: sistemasDoJogo,
  commandHandlers: { ...comandosDoJogo, ...debugCriarHandlers },
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
// Jazidas da distribuição (CEN-10).
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
    const extras = estresse > 0 ? Math.ceil(estresse / nacoes.length) - 15 - (k === 0 ? 1 : 0) : 0;
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
    sim.enqueue({ tick: 1, nacao, tipo: DEBUG_ESTOQUE_COMMAND, dados: { modo: 'alto' } as never });
  }
  const patrulha = destinoDaPatrulha(zonaDe(0), R);
  sim.enqueue({
    tick: 1,
    nacao: jogador,
    tipo: 'patrulhar',
    dados: { ids: [ID_PATRULHEIRO], x: patrulha[0], y: patrulha[1], z: patrulha[2] },
  });
} else {
  sim.enqueue({
    tick: 0,
    nacao: jogador,
    tipo: INICIAR_PARTIDA_COMMAND,
    dados: {
      modo: 'padrao',
      nacoes: nacoes.map((nacao, k) => ({ nacao, zona: zonaDe(k).d })),
    } as never,
  });
  // §13: as outras nações são IAs; `?ia=facil|normal|dificil|brutal` escolhe o nível
  // (até a configuração da partida, T-104).
  const nivelIa = parametros.get('ia') ?? 'normal';
  for (const nacao of nacoes) {
    if (nacao === jogador) continue;
    sim.enqueue({ tick: 0, nacao, tipo: ATIVAR_IA_COMMAND, dados: { nivel: nivelIa } as never });
  }
}

const history = new PositionHistory();
const unidades = new UnidadesRender(view.scene, jogador);
const combate = new CombateRender(view.scene, R, (d) => alturaEm(pronto.mapa, d));
const marcas = new SinaisRender(view.scene, R, (d) => alturaEm(pronto.mapa, d));
const jazidas = new JazidasRender(view.scene);
const aneis = new AneisDeSelecao(view.scene, (d) => alturaEm(pronto.mapa, d), R);
const holograma = new HologramaRender(view.scene, R, (d) => alturaEm(pronto.mapa, d));
const barras = new BarrasRender(view.scene);
const retrato = new RetratoRender();
/** UI-07: Tab alterna as barras entre automático e "sempre". */
let barrasSempre = false;
window.addEventListener('keydown', (e) => {
  if (e.code !== 'Tab' || e.repeat) return;
  e.preventDefault();
  barrasSempre = !barrasSempre;
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
        validarLocal: (tipo, d) => validarPosicionamento(leitura(), tipo, d, jogador),
        holograma,
      })
    : null;
if (comandos) {
  acoesDoPainel.atual = {
    escolher: (item) => comandos.escolher(item as never),
    abrirMenu: (menu) => comandos.abrirMenu(menu),
    cancelarItem: (produtor, indice) => comandos.cancelarItem(produtor, indice),
    cancelarObra: (obra) => comandos.cancelarObra(obra),
  };
  acoesDaSelecao.filtrar = (ids) => comandos.selecionar(ids);
}

/** UI-07: barras dos corpos visíveis (do lado da câmera). */
const corposComBarras: CorpoComBarras[] = [];
const sincronizarBarras = (): void => {
  corposComBarras.length = 0;
  const selecionados = new Set(comandos?.selecao ?? []);
  const olho = view.camera.position;
  for (const c of unidades.corpos) {
    const doLado =
      (olho.x - c.x) * c.cima[0] + (olho.y - c.y) * c.cima[1] + (olho.z - c.z) * c.cima[2] > 0;
    if (!doLado) continue;
    const b = barrasDe(sim.state, c.id, selecionados.has(c.id), barrasSempre);
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
const atualizarHud = (agora: number): void => {
  const transito = emTransito(sim.state, jogador);
  const noEstoque = estoque(sim.state, jogador);
  barraSuperior.value = {
    recursos: dados.recursos.map((r) => ({
      id: r.id,
      cor: r.cor,
      quantidade: noEstoque[r.id] ?? 0,
      transito: transito[r.id] ?? 0,
    })),
    energia: leituraDaRede(sim.state, jogador),
    corpos: corposDa(sim.state, jogador),
    relogio: relogio(sim.state.tick, sim.tickHz),
  };
  painelSelecao.value = resumoDaSelecao(sim.state, comandos?.selecao ?? []);
  const resultado = sim.state.resultado;
  fimDePartida.value = !resultado
    ? null
    : resultado.vencedor === null
      ? 'empate'
      : resultado.vencedor === jogador
        ? 'vitoria'
        : 'derrota';

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
};

/** Painel de produção: produtor ou obra própria selecionados e o estado da entrada. */
const atualizarPainel = (agora: number): void => {
  if (avisoProducao.value && agora > avisoProducao.value.ate) avisoProducao.value = null;
  if (!comandos) return;
  const proprios = comandos.selecao.filter(
    (id) => getComponent(sim.state, id, 'owner')?.nacao === jogador,
  );
  const obraId = proprios.find((id) => getComponent(sim.state, id, 'obra'));
  const produtorId = proprios.find(
    (id) => getComponent(sim.state, id, 'producer') && !getComponent(sim.state, id, 'obra'),
  );
  const tipoDe = (id: EntityId) =>
    getComponent(sim.state, id, 'unit')?.tipo ?? getComponent(sim.state, id, 'structure')!.tipo;
  const entrada = comandos.estado;
  const tipoProdutor = produtorId !== undefined ? tipoDe(produtorId) : null;
  const opcoes =
    tipoProdutor === 'ship'
      ? MENU_NAVE
      : entrada.menu === 'unidades'
        ? MENU_UNIDADES
        : entrada.menu === 'estruturas'
          ? MENU_ESTRUTURAS
          : [];
  const obra = obraId !== undefined ? getComponent(sim.state, obraId, 'obra')! : null;
  painelProducao.value = {
    produtor:
      produtorId !== undefined
        ? {
            id: produtorId,
            tipo: tipoProdutor!,
            fila: getComponent(sim.state, produtorId, 'producer')!.fila.map((item) => ({
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
        ? { id: obraId, tipo: tipoDe(obraId), progresso: obra.progresso, instalada: obra.instalada }
        : null,
    opcoes,
    menu: entrada.menu,
    posicionando: entrada.posicionando,
    motivo: entrada.motivo,
    reparando: entrada.reparando,
    estoque: estoque(sim.state, jogador),
  };
};
let ultimoPainel = 0;
let versaoNevoa = 0;

/** VIS-09/CTL-03: minimapa no canto inferior esquerdo (UI-05), só no modo RTS. */
const minimapa = comandos
  ? new Minimapa(uiRoot, pronto.grades.nevoa.esfera.n, {
      centrar: (d) => centrarEm(camera, d),
      ordenar: (d) => comandos.ordenarEm(d),
    })
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
      cor: dados.nacoes.find((n) => n.id === c.nacao)?.cor ?? '#888888',
      estrutura: !c.movel,
    })),
    fantasmas: nevoa ? fantasmas.visiveis(ctx, jogador).map((f) => [f.x, f.y, f.z]) : [],
    sinais: sim.state.sinais[jogador] ?? [],
    satelites: satelitesAtivos(ctx)
      .filter((s) => s.nacao === jogador)
      .map((s) => ({ ponto: s.ponto, angulo: param('satelite_visao_m') / R })),
    campo: campoDaCamera(view.camera, R),
    agora: performance.now(),
  });
};
let tickTotalMs = 0;
let tickCount = 0;

const loop = createFixedLoop({
  tickHz: sim.tickHz,
  step: () => {
    history.capture(sim.state);
    const inicio = performance.now();
    const eventos = sim.step();
    tickTotalMs += performance.now() - inicio;
    avisar(eventos);
    combate.registrar(sim.state, eventos, performance.now());
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
    jazidas.sync(sim.state, nevoa ? exploradoPeloJogador : null);
    aneis.sync(comandos ? comandos.selecionadosDesenhados() : [], jogador);
    sincronizarBarras();
    // VIS-06/VIS-08: sinais de radar e o círculo dos satélites do jogador.
    marcas.sync(
      sim.state.sinais[jogador] ?? [],
      satelitesAtivos(leitura())
        .filter((s) => s.nacao === jogador)
        .map((s) => ({ ponto: s.ponto, raio: param('satelite_visao_m') })),
      performance.now(),
    );
    combate.sync(
      sim.state,
      (id) => unidades.get(id),
      performance.now(),
      nevoa ? exploradoPeloJogador : null,
    );
    view.render();
    desenharMinimapa();
    const sel = painelSelecao.peek();
    if (sel.tipo === 'corpo') {
      retrato.desenhar(canvasDoRetrato.peek(), sel.modelo as never, sel.cor, 1 / 60);
    }
  },
});

const sonda: Window['__forgeborn'] = parametros.has('e2e') ? { amostras: [] } : undefined;
window.__forgeborn = sonda;
if (sonda) {
  const ponto = new Vector3();
  sonda.naTela = (id) => {
    const c = unidades.get(id);
    if (!c) return null;
    // Do outro lado do planeta: fora da tela.
    const olho = view.camera.position;
    if ((olho.x - c.x) * c.cima[0] + (olho.y - c.y) * c.cima[1] + (olho.z - c.z) * c.cima[2] <= 0) {
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
    return { x: r.left + ((ponto.x + 1) / 2) * r.width, y: r.top + ((1 - ponto.y) / 2) * r.height };
  };
  sonda.posicao = (id) => {
    const p = getComponent(sim.state, id, 'position');
    return p ? [p.x, p.y, p.z] : null;
  };
  sonda.tipo = (id) =>
    getComponent(sim.state, id, 'unit')?.tipo ??
    getComponent(sim.state, id, 'structure')?.tipo ??
    null;
  sonda.ordem = (id) => getComponent(sim.state, id, 'order')?.tipo ?? null;
  sonda.nacao = (id) => getComponent(sim.state, id, 'owner')?.nacao ?? null;
  sonda.encontro = (id) => getComponent(sim.state, id, 'producer')?.pontoDeEncontro ?? null;
  sonda.chaoNaTela = (x, y) => pontoNoTerreno(view.camera, viewport, x, y, pronto.mapa) !== null;
  sonda.noMinimapa = (d) => minimapa?.pontoDe(d) ?? null;
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
  sonda.barras = () => corposComBarras.length;
  sonda.criarNaTela = (tipo, nacao, x, y) => {
    const p = pontoNoTerreno(view.camera, viewport, x, y, pronto.mapa);
    if (!p || !nacoes.includes(nacao as NacaoId)) return false;
    const unidade = dados.moveis.some((m) => m.id === tipo);
    sim.enqueue({
      tick: sim.state.tick,
      nacao: nacao as NacaoId,
      tipo: DEBUG_CRIAR_COMMAND,
      dados: [unidade ? { unidade: tipo, d: p } : { estrutura: tipo, d: p }] as never,
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
          (olho.x - j.x) * j.cima[0] + (olho.y - j.y) * j.cima[1] + (olho.z - j.z) * j.cima[2] > 0,
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

const posicionarCamera = (dt: number): void => {
  entradaCamera?.atualizar(dt);
  // O chão sob o foco é suavizado para a câmera não saltar em bordas de platô.
  const chao = alturaEm(pronto.mapa, camera.foco);
  chaoSuave += (chao - chaoSuave) * (1 - Math.exp(-6 * dt));
  const { olho, alvo, cima } = poseDaCamera(camera, chaoSuave);
  pontoFocal.set(...alvo);
  // ART-11: Sol e Terra no referencial local do foco.
  ceu.atualizar(camera.foco, norteEm(camera.foco, camera.frente), pontoFocal);
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
  posicionarCamera(Math.min((agora - ultimoQuadro) / 1000, 0.1));
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

requestAnimationFrame((agora) => {
  ultimoQuadro = agora;
  inicioJanela = agora;
  requestAnimationFrame(frame);
});
