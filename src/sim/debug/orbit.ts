/**
 * Entidade de teste da T-008: um corpo em órbita circular, para verificar o passo fixo e a
 * interpolação do render. Sai de cena quando o início de partida existir (T-056).
 */
import { createEntity, entitiesWith, getComponent, setComponent } from '../core/entities';
import type { CommandHandler, SystemFn } from '../core/pipeline';

declare module '../core/components' {
  interface ComponentMap {
    debugOrbit: { cx: number; cz: number; raio: number; periodoTicks: number };
  }
}

export const DEBUG_ORBIT_COMMAND = 'debug_orbita';

export interface DebugOrbitDados {
  cx: number;
  cz: number;
  raio: number;
  periodo_s: number;
}

function place(
  p: { x: number; z: number },
  o: { cx: number; cz: number; raio: number },
  a: number,
) {
  p.x = o.cx + Math.cos(a) * o.raio;
  p.z = o.cz + Math.sin(a) * o.raio;
}

export const debugOrbitHandlers: Record<string, CommandHandler> = {
  [DEBUG_ORBIT_COMMAND]: (ctx, command) => {
    const d = command.dados as unknown as DebugOrbitDados;
    const orbita = {
      cx: d.cx,
      cz: d.cz,
      raio: d.raio,
      periodoTicks: Math.round(d.periodo_s / ctx.dt),
    };
    const id = createEntity(ctx.state);
    const posicao = { x: 0, y: 0, z: 0 };
    place(posicao, orbita, 0);
    setComponent(ctx.state, id, 'owner', { nacao: command.nacao });
    setComponent(ctx.state, id, 'debugOrbit', orbita);
    setComponent(ctx.state, id, 'position', posicao);
  },
};

export const debugOrbitSystem: SystemFn = (ctx) => {
  for (const id of entitiesWith(ctx.state, 'debugOrbit', 'position')) {
    const orbita = getComponent(ctx.state, id, 'debugOrbit')!;
    const angulo = (2 * Math.PI * (ctx.tick + 1)) / orbita.periodoTicks;
    place(getComponent(ctx.state, id, 'position')!, orbita, angulo);
  }
};
