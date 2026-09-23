import './styles.css';
import { cenaDaNacao, patrulheiro } from './game/cenaDemo';
import { createFixedLoop } from './game/loop';
import { ligarEntradaCamera } from './input/cameraInput';
import { ligarEntradaComandos } from './input/comandoInput';
import { AneisDeSelecao } from './render/aneis';
import { criarEstadoCamera, poseDaCamera } from './render/cameraRts';
import { PositionHistory } from './render/interpolation';
import { criarCeu, DIRECAO_TERRA } from './render/sky';
import { criarTerreno } from './render/terrain';
import { UnidadesRender } from './render/unidades';
import { createView } from './render/view';
import { Vector3 } from 'three';
import { createSim, type EntityId, getComponent, type NacaoId } from './sim';
import { DEBUG_CRIAR_COMMAND, debugCriarHandlers } from './sim/debug/criar';
import { FAIXA_BORDA_M } from './sim/map/grids';
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
      camera?: { x: number; z: number; altura: number; yaw: number };
      selecao?: readonly EntityId[];
      /** Posição de tela (px) de um corpo, para os testes clicarem nele. */
      naTela?: (id: EntityId) => { x: number; y: number } | null;
      posicao?: (id: EntityId) => { x: number; z: number } | null;
      tipo?: (id: EntityId) => string | null;
      ordem?: (id: EntityId) => string | null;
      nacao?: (id: EntityId) => string | null;
      encontro?: (id: EntityId) => [number, number] | null;
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

// Mapa: preset Mare Tranquillitatis até existir a configuração de partida (T-104).
const preset = PRESETS_DE_MAPA.find((p) => p.id === 'mare_tranquillitatis')!;
const pronto = gerarMapaValido(preset.seed, preset.tamanho, preset.zonas, preset.cenario);
const terreno = criarTerreno(pronto.mapa);
view.scene.add(terreno.objeto, criarCeu());

// Câmera: RTS por padrão (CTL-01); `?camera=geral` e `?camera=cinematica` são vistas fixas.
const modoCamera = parametros.get('camera') ?? 'rts';
const zonaInicial = pronto.mapa.zonasDePouso[0]!;
const camera = criarEstadoCamera(
  zonaInicial.x,
  zonaInicial.z,
  pronto.mapa.lado_m / 2 - FAIXA_BORDA_M,
);
const entradaCamera =
  modoCamera === 'rts'
    ? ligarEntradaCamera(viewport, camera, { rolagemPelasBordas: () => true })
    : null;
let chaoSuave = alturaEm(pronto.mapa, camera.focoX, camera.focoZ);

if (modoCamera === 'cinematica') {
  // Vista baixa sobre uma zona de pouso, olhando para o horizonte onde está a Terra.
  const zona = pronto.mapa.zonasDePouso[2]!;
  const olho = { x: zona.x - 30, y: 26, z: zona.z - 10 };
  view.camera.position.set(olho.x, olho.y, olho.z);
  view.camera.lookAt(olho.x + DIRECAO_TERRA.x * 100, 12, olho.z + DIRECAO_TERRA.z * 100);
  view.focarSombras(olho.x + DIRECAO_TERRA.x * 90, olho.z + DIRECAO_TERRA.z * 90);
}

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
  dados: [patrulheiro(jogador, zonaDe(0))] as never,
});
nacoes.forEach((nacao, k) => {
  const extras = estresse > 0 ? Math.ceil(estresse / nacoes.length) - 11 - (k === 0 ? 1 : 0) : 0;
  sim.enqueue({
    tick: 0,
    nacao,
    tipo: DEBUG_CRIAR_COMMAND,
    dados: cenaDaNacao(nacao, zonaDe(k), Math.max(0, extras)) as never,
  });
});
const ID_PATRULHEIRO = 1;
sim.enqueue({
  tick: 1,
  nacao: jogador,
  tipo: 'patrulhar',
  dados: { ids: [ID_PATRULHEIRO], x: zonaDe(0).x - 18, z: zonaDe(0).z + 14 },
});

const history = new PositionHistory();
const unidades = new UnidadesRender(view.scene);
const aneis = new AneisDeSelecao(view.scene, (x, z) => alturaEm(pronto.mapa, x, z));
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
    ponto.set(c.x, c.y + c.altura / 2, c.z).project(view.camera);
    const r = viewport.getBoundingClientRect();
    return { x: r.left + ((ponto.x + 1) / 2) * r.width, y: r.top + ((1 - ponto.y) / 2) * r.height };
  };
  sonda.posicao = (id) => {
    const p = getComponent(sim.state, id, 'position');
    return p ? { x: p.x, z: p.z } : null;
  };
  sonda.tipo = (id) =>
    getComponent(sim.state, id, 'unit')?.tipo ??
    getComponent(sim.state, id, 'structure')?.tipo ??
    null;
  sonda.ordem = (id) => getComponent(sim.state, id, 'order')?.tipo ?? null;
  sonda.nacao = (id) => getComponent(sim.state, id, 'owner')?.nacao ?? null;
  sonda.encontro = (id) => getComponent(sim.state, id, 'producer')?.pontoDeEncontro ?? null;
  Object.defineProperty(sonda, 'selecao', { get: () => comandos?.selecao ?? [] });
}

let ultimoQuadro = 0;
let quadros = 0;
let inicioJanela = 0;

const posicionarCamera = (dt: number): void => {
  if (!entradaCamera) return;
  entradaCamera.atualizar(dt);
  // O chão sob o foco é suavizado para a câmera não saltar em bordas de platô.
  const chao = alturaEm(pronto.mapa, camera.focoX, camera.focoZ);
  chaoSuave += (chao - chaoSuave) * (1 - Math.exp(-6 * dt));
  const { olho, alvo } = poseDaCamera(camera, chaoSuave);
  view.camera.position.set(...olho);
  view.camera.lookAt(...alvo);
  view.camera.updateMatrixWorld();
  view.focarSombras(camera.focoX, camera.focoZ);
  if (sonda) {
    sonda.camera = { x: camera.focoX, z: camera.focoZ, altura: camera.altura, yaw: camera.yaw };
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
