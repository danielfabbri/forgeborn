import './styles.css';
import { createFixedLoop } from './game/loop';
import { ligarEntradaCamera } from './input/cameraInput';
import { criarEstadoCamera, poseDaCamera } from './render/cameraRts';
import { EntityMeshes } from './render/entityMeshes';
import { PositionHistory } from './render/interpolation';
import { criarCeu, DIRECAO_TERRA } from './render/sky';
import { criarTerreno } from './render/terrain';
import { createView } from './render/view';
import { createSim } from './sim';
import { DEBUG_ORBIT_COMMAND, debugOrbitHandlers, debugOrbitSystem } from './sim/debug/orbit';
import { FAIXA_BORDA_M } from './sim/map/grids';
import { alturaEm } from './sim/map/heightmap';
import { PRESETS_DE_MAPA } from './sim/map/presets';
import { gerarMapaValido } from './sim/map/validacao';
import { debugStats } from './ui/debugStats';
import { mountUi } from './ui/mount';

declare global {
  interface Window {
    /** Sonda para os testes E2E (só existe com `?e2e` na URL). */
    __forgeborn?: {
      amostras: Array<{ t: number; tick: number; x: number }>;
      camera?: { x: number; z: number; altura: number; yaw: number };
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
const sim = createSim(seed, ['bra'], {
  systems: { movimento: debugOrbitSystem },
  commandHandlers: debugOrbitHandlers,
});
// T-008: entidade de teste em órbita, até existir o início de partida (T-056).
sim.enqueue({
  tick: 0,
  nacao: 'bra',
  tipo: DEBUG_ORBIT_COMMAND,
  dados: { cx: 0, cz: 0, raio: 20, periodo_s: 8 },
});

const history = new PositionHistory();
const meshes = new EntityMeshes(view.scene, (x, z) => alturaEm(pronto.mapa, x, z));
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
    meshes.sync(sim.state, history, alpha);
    view.render();
  },
});

const sonda: Window['__forgeborn'] = parametros.has('e2e') ? { amostras: [] } : undefined;
window.__forgeborn = sonda;

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

  const alvo = meshes.get(1);
  if (sonda && alvo) {
    sonda.amostras.push({ t: agora, tick: sim.state.tick, x: alvo.position.x });
    if (sonda.amostras.length > 600) sonda.amostras.shift();
  }
  requestAnimationFrame(frame);
};

requestAnimationFrame((agora) => {
  ultimoQuadro = agora;
  inicioJanela = agora;
  requestAnimationFrame(frame);
});
