import { describe, expect, it } from 'vitest';
import { createFixedLoop, type FixedLoop } from '../../src/game/loop';
import { PositionHistory } from '../../src/render/interpolation';
import { createEntity, createSim, getComponent, param, setComponent } from '../../src/sim';
import {
  DEBUG_ORBIT_COMMAND,
  debugOrbitHandlers,
  debugOrbitSystem,
} from '../../src/sim/debug/orbit';

const TICK_HZ = param('tick_hz');

/** Roda o driver com quadros de duração fixa e conta os ticks. */
function rodar(fps: number, segundos: number, ajustar?: (loop: FixedLoop) => void) {
  let ticks = 0;
  const alphas: number[] = [];
  const loop = createFixedLoop({
    tickHz: TICK_HZ,
    step: () => ticks++,
    render: (alpha) => alphas.push(alpha),
  });
  ajustar?.(loop);
  for (let i = 0; i < fps * segundos; i++) loop.advance(1000 / fps);
  return { ticks, alphas };
}

describe('TEC-04: driver de passo fixo', () => {
  it.each([30, 60, 144])('roda tick_hz ticks por segundo a %i FPS', (fps) => {
    const { ticks } = rodar(fps, 10);
    expect(Math.abs(ticks - TICK_HZ * 10)).toBeLessThanOrEqual(1);
  });

  it('renderiza todo quadro com alpha em [0, 1)', () => {
    const { alphas } = rodar(60, 2);
    expect(alphas).toHaveLength(120);
    expect(Math.min(...alphas)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...alphas)).toBeLessThan(1);
  });

  it.each([0.75, 1.5])('REG-20: velocidade %s× multiplica os ticks por segundo real', (speed) => {
    const { ticks } = rodar(60, 10, (loop) => (loop.speed = speed));
    expect(Math.abs(ticks - TICK_HZ * 10 * speed)).toBeLessThanOrEqual(1);
  });

  it('pausado não roda ticks, mas continua renderizando', () => {
    const { ticks, alphas } = rodar(60, 1, (loop) => (loop.paused = true));
    expect(ticks).toBe(0);
    expect(alphas).toHaveLength(60);
  });

  it('um quadro longo (aba em segundo plano) não vira rajada de ticks', () => {
    let ticks = 0;
    const loop = createFixedLoop({ tickHz: TICK_HZ, step: () => ticks++, render: () => {} });
    loop.advance(5_000);
    expect(ticks).toBe(Math.floor(250 / (1000 / TICK_HZ)));
  });
});

describe('TEC-04: interpolação do render', () => {
  it('fica entre a posição do tick anterior e a do atual', () => {
    const estado = createSim(1, ['usa']).state;
    const id = createEntity(estado);
    setComponent(estado, id, 'position', { x: 0, y: 0, z: 4 });
    const historico = new PositionHistory();
    historico.capture(estado);
    getComponent(estado, id, 'position')!.x = 10;

    const saida = { x: 0, y: 0, z: 0 };
    expect(historico.interpolate(id, { x: 10, y: 0, z: 4 }, 0.25, saida)).toEqual({
      x: 2.5,
      y: 0,
      z: 4,
    });

    const nova = createEntity(estado);
    expect(historico.interpolate(nova, { x: 7, y: 1, z: 2 }, 0.5, saida)).toEqual({
      x: 7,
      y: 1,
      z: 2,
    });
  });
});

describe('T-008: entidade de teste em órbita', () => {
  it('percorre o círculo pedido no período pedido, a cada tick', () => {
    const sim = createSim(9, ['bra'], {
      systems: { movimento: debugOrbitSystem },
      commandHandlers: debugOrbitHandlers,
    });
    sim.enqueue({
      tick: 0,
      nacao: 'bra',
      tipo: DEBUG_ORBIT_COMMAND,
      dados: { cx: 0, cz: 0, raio: 20, periodo_s: 8 },
    });
    const trajeto: Array<{ x: number; z: number }> = [];
    for (let i = 0; i < 8 * TICK_HZ; i++) {
      sim.step();
      const p = getComponent(sim.state, 1, 'position')!;
      expect(Math.hypot(p.x, p.z)).toBeCloseTo(20, 6);
      trajeto.push({ x: p.x, z: p.z });
    }
    // Anda a cada tick...
    for (let i = 1; i < trajeto.length; i++) expect(trajeto[i]).not.toEqual(trajeto[i - 1]);
    // ...e fecha a volta exatamente no período pedido.
    expect(trajeto.at(-1)!.x).toBeCloseTo(20, 6);
    expect(trajeto.at(-1)!.z).toBeCloseTo(0, 6);
  });
});
