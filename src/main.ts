import './styles.css';
import { Vector3 } from 'three';
import { cenaDaNacao, destinoDaPatrulha, patrulheiro } from './game/cenaDemo';
import { createFixedLoop } from './game/loop';
import { ligarEntradaCamera } from './input/cameraInput';
import { ligarEntradaComandos } from './input/comandoInput';
import { AneisDeSelecao } from './render/aneis';
import { alturaMaxima, criarEstadoCamera, poseDaCamera, rumoDaCamera } from './render/cameraRts';
import { PositionHistory } from './render/interpolation';
import { pontoNoTerreno } from './render/picking';
import { criarCeu } from './render/sky';
import { criarTerreno } from './render/terrain';
import { UnidadesRender } from './render/unidades';
import { createView } from './render/view';
import { createSim, type EntityId, getComponent, type NacaoId } from './sim';
import { DEBUG_CRIAR_COMMAND, debugCriarHandlers } from './sim/debug/criar';
import { avancar, norteEm, type Vec3 } from './sim/map/esfera';
import { alturaEm } from './sim/map/heightmap';
import { PRESETS_DE_MAPA } from './sim/map/presets';
import { gerarMapaValido } from './sim/map/validacao';
import { comandosDoJogo, sistemasDoJogo } from './sim/units';
import { debugStats } from './ui/debugStats';
import { mountUi } from './ui/mount';

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

// Cena de demonstração do M2, até existir o início de partida (T-056). O patrulheiro do
// jogador é o primeiro corpo (ID 1) e a sonda E2E acompanha a sua posição desenhada.
const zonas = pronto.mapa.zonasDePouso;
const zonaDe = (k: number) => zonas[(k * zonas.length) / nacoes.length]!;
sim.enqueue({
  tick: 0,
  nacao: jogador,
  tipo: DEBUG_CRIAR_COMMAND,
  dados: [patrulheiro(jogador, zonaDe(0), R)] as never,
});
nacoes.forEach((nacao, k) => {
  const extras = estresse > 0 ? Math.ceil(estresse / nacoes.length) - 11 - (k === 0 ? 1 : 0) : 0;
  sim.enqueue({
    tick: 0,
    nacao,
    tipo: DEBUG_CRIAR_COMMAND,
    dados: cenaDaNacao(nacao, zonaDe(k), R, Math.max(0, extras)) as never,
  });
});
const ID_PATRULHEIRO = 1;
const patrulha = destinoDaPatrulha(zonaDe(0), R);
sim.enqueue({
  tick: 1,
  nacao: jogador,
  tipo: 'patrulhar',
  dados: { ids: [ID_PATRULHEIRO], x: patrulha[0], y: patrulha[1], z: patrulha[2] },
});

const history = new PositionHistory();
const unidades = new UnidadesRender(view.scene);
const aneis = new AneisDeSelecao(view.scene, (d) => alturaEm(pronto.mapa, d), R);
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
      })
    : null;
let tickTotalMs = 0;
let tickCount = 0;

const loop = createFixedLoop({
  tickHz: sim.tickHz,
  step: () => {
    history.capture(sim.state);
    const inicio = performance.now();
    sim.step();
    tickTotalMs += performance.now() - inicio;
    tickCount++;
  },
  render: (alpha) => {
    unidades.sync(sim.state, history, alpha);
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

  if (agora - inicioJanela >= 500) {
    debugStats.value = {
      fps: (quadros * 1000) / (agora - inicioJanela),
      tickMs: tickCount > 0 ? tickTotalMs / tickCount : 0,
      entidades: sim.state.entities.length,
      tick: sim.state.tick,
      drawCalls: view.renderer.info.render.calls,
      triangulos: view.renderer.info.render.triangles,
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
