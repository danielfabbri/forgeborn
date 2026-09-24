import './styles.css';
import { Vector3 } from 'three';
import { cenaDaNacao, destinoDaPatrulha, patrulheiro } from './game/cenaDemo';
import { createFixedLoop } from './game/loop';
import { ligarEntradaCamera } from './input/cameraInput';
import { ligarEntradaComandos } from './input/comandoInput';
import { MENU_ESTRUTURAS, MENU_NAVE, MENU_UNIDADES } from './game/atalhosProducao';
import { t, type TextKey } from './i18n';
import { AneisDeSelecao } from './render/aneis';
import { alturaMaxima, criarEstadoCamera, poseDaCamera, rumoDaCamera } from './render/cameraRts';
import { PositionHistory } from './render/interpolation';
import { JazidasRender } from './render/jazidas';
import { HologramaRender } from './render/holograma';
import { pontoNoTerreno } from './render/picking';
import { criarCeu } from './render/sky';
import { criarTerreno } from './render/terrain';
import { UnidadesRender } from './render/unidades';
import { createView } from './render/view';
import { createSim, type EntityId, getComponent, type NacaoId, type SimEvent } from './sim';
import type { SystemContext } from './sim/core/pipeline';
import { DEBUG_CRIAR_COMMAND, DEBUG_ESTOQUE_COMMAND, debugCriarHandlers } from './sim/debug/criar';
import { emTransito, estoque, SEMEAR_JAZIDAS_COMMAND } from './sim/economia';
import { DEBUG_ENCHER_BANCO_COMMAND, leituraDaRede } from './sim/energia';
import { avancar, norteEm, type Vec3 } from './sim/map/esfera';
import { alturaEm } from './sim/map/heightmap';
import { PRESETS_DE_MAPA } from './sim/map/presets';
import { gerarMapaValido } from './sim/map/validacao';
import { INICIAR_PARTIDA_COMMAND, validarPosicionamento } from './sim/producao';
import { comandosDoJogo, sistemasDoJogo } from './sim/units';
import { debugStats } from './ui/debugStats';
import { mountUi } from './ui/mount';
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
      coleta?: (id: EntityId) => { estado: string; jazida: EntityId | null } | null;
      silo?: (id: EntityId) => string | null;
      /** Jazidas desenhadas visíveis na tela (px), para os testes clicarem nelas. */
      jazidasNaTela?: () => Array<{ id: EntityId; recurso: string; x: number; y: number }>;
      fila?: (id: EntityId) => Array<{ item: string; obra: EntityId | null }> | null;
      obra?: (id: EntityId) => { instalada: boolean; progresso: number } | null;
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
const terreno = criarTerreno(pronto.mapa);
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
const demo = parametros.has('demo') || parametros.has('e2e') || estresse > 0;
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
}

const history = new PositionHistory();
const unidades = new UnidadesRender(view.scene);
const jazidas = new JazidasRender(view.scene);
const aneis = new AneisDeSelecao(view.scene, (d) => alturaEm(pronto.mapa, d), R);
const holograma = new HologramaRender(view.scene, R, (d) => alturaEm(pronto.mapa, d));
/** Contexto só de leitura para a validação de posicionamento (PRD-10) na interface. */
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
        validarLocal: (tipo, d) => validarPosicionamento(leitura(), tipo, d),
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
}

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
    tickCount++;
  },
  render: (alpha) => {
    unidades.sync(sim.state, history, alpha);
    jazidas.sync(sim.state);
    aneis.sync(comandos ? comandos.selecionadosDesenhados() : [], jogador);
    view.render();
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
  sonda.localValido = (tipo, x, y) => {
    const p = pontoNoTerreno(view.camera, viewport, x, y, pronto.mapa);
    if (!p) return false;
    const r = Math.hypot(...p);
    const d: Vec3 = [p[0] / r, p[1] / r, p[2] / r];
    return validarPosicionamento(leitura(), tipo as never, d) === null;
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
  posicionarCamera(Math.min((agora - ultimoQuadro) / 1000, 0.1));
  loop.advance(agora - ultimoQuadro);
  ultimoQuadro = agora;
  quadros++;

  if (agora - ultimoPainel >= 100) {
    atualizarPainel(agora);
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
  requestAnimationFrame(frame);
};

requestAnimationFrame((agora) => {
  ultimoQuadro = agora;
  inicioJanela = agora;
  requestAnimationFrame(frame);
});
