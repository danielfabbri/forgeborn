import './styles.css';
import { createFixedLoop } from './game/loop';
import { EntityMeshes } from './render/entityMeshes';
import { PositionHistory } from './render/interpolation';
import { createView } from './render/view';
import { createSim } from './sim';
import { DEBUG_ORBIT_COMMAND, debugOrbitHandlers, debugOrbitSystem } from './sim/debug/orbit';
import { debugStats } from './ui/debugStats';
import { mountUi } from './ui/mount';

declare global {
  interface Window {
    /** Sonda para os testes E2E (só existe com `?e2e` na URL). */
    __forgeborn?: { amostras: Array<{ t: number; tick: number; x: number }> };
  }
}

const viewport = document.getElementById('viewport');
const uiRoot = document.getElementById('ui');
if (!viewport || !uiRoot) {
  throw new Error('index.html precisa dos elementos #viewport e #ui');
}

const view = createView(viewport);
mountUi(uiRoot);

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
const meshes = new EntityMeshes(view.scene);
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

const sonda: Window['__forgeborn'] = new URLSearchParams(location.search).has('e2e')
  ? { amostras: [] }
  : undefined;
window.__forgeborn = sonda;

let ultimoQuadro = 0;
let quadros = 0;
let inicioJanela = 0;

const frame = (agora: number): void => {
  loop.advance(agora - ultimoQuadro);
  ultimoQuadro = agora;
  quadros++;

  if (agora - inicioJanela >= 500) {
    debugStats.value = {
      fps: (quadros * 1000) / (agora - inicioJanela),
      tickMs: tickCount > 0 ? tickTotalMs / tickCount : 0,
      entidades: sim.state.entities.length,
      tick: sim.state.tick,
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
