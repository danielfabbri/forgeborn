/**
 * Portão (UNI-09, D-54): bloqueia como o Muro, mas abre sozinho em `portao_tempo_abrir_s`
 * quando uma unidade móvel própria chega a `portao_raio_abertura_m` e fecha
 * `portao_tempo_fechar_apos_s` depois que a última unidade própria sai do raio. Aberto (por
 * inteiro), deixa de ser obstáculo e qualquer um passa. Não fecha com alguém dentro do vão.
 * O dono pode trancá-lo (trancado não abre). O Muro (UNI-08) é só a estrutura com obstáculo.
 */
import {
  entitiesWith,
  getComponent,
  isAlive,
  removeComponent,
  setComponent,
} from '../core/entities';
import type { CommandHandler, SystemContext } from '../core/pipeline';
import { param } from '../data';
import { raioDaPegada } from '../units/criar';
import { statsMovel } from '../units/stats';
import { distanciaAoObstaculo, obstaculoDaEstrutura } from '../units/segmentos';
import { direcaoDe, distanciaM, raioDoMundo } from '../units/superficie';

export const TRANCAR_PORTAO_COMMAND = 'trancar_portao';

export function passoPortoes(ctx: SystemContext): void {
  const { state, dt } = ctx;
  for (const id of entitiesWith(state, 'portao', 'owner', 'position')) {
    if (getComponent(state, id, 'obra')) continue;
    const portao = getComponent(state, id, 'portao')!;
    const nacao = getComponent(state, id, 'owner')!.nacao;
    const d = direcaoDe(getComponent(state, id, 'position')!);
    const obstaculo = obstaculoDaEstrutura(state, id, raioDaPegada('gate'));
    const R = raioDoMundo(ctx);
    let proprioPerto = false;
    let alguemNoVao = false;
    for (const u of entitiesWith(state, 'unit', 'owner', 'position')) {
      const du = direcaoDe(getComponent(state, u, 'position')!);
      const dist = distanciaM(ctx, d, du);
      if (
        getComponent(state, u, 'owner')!.nacao === nacao &&
        dist <= param('portao_raio_abertura_m')
      ) {
        proprioPerto = true;
      }
      // D-56: alguém sobre o segmento do portão impede o fechamento.
      const r = statsMovel(getComponent(state, u, 'unit')!.tipo).raio_m;
      if (distanciaAoObstaculo(R, d, obstaculo, du) <= r) alguemNoVao = true;
    }
    const passo = dt / param('portao_tempo_abrir_s');
    if (proprioPerto && !portao.trancado) {
      portao.semUnidade_s = 0;
      portao.abertura = Math.min(1, portao.abertura + passo);
    } else {
      portao.semUnidade_s += dt;
      if (portao.semUnidade_s >= param('portao_tempo_fechar_apos_s') - 1e-9 && !alguemNoVao) {
        portao.abertura = Math.max(0, portao.abertura - passo);
      }
    }
    // Só por inteiro aberto deixa de bloquear.
    const bloqueia = portao.abertura < 1 - 1e-9;
    const temObstaculo = getComponent(state, id, 'obstacle') !== undefined;
    if (bloqueia && !temObstaculo) {
      setComponent(state, id, 'obstacle', obstaculo);
      state.versaoObstaculos++;
    } else if (!bloqueia && temObstaculo) {
      removeComponent(state, id, 'obstacle');
      state.versaoObstaculos++;
    }
  }
}

export const comandosDePortao: Record<string, CommandHandler> = {
  /** UNI-09 (Portão, T): tranca ou destranca. */
  [TRANCAR_PORTAO_COMMAND]: (ctx, comando) => {
    const d = (comando.dados ?? {}) as { ids?: unknown };
    if (!Array.isArray(d.ids)) return;
    for (const id of d.ids) {
      if (typeof id !== 'number' || !isAlive(ctx.state, id)) continue;
      if (getComponent(ctx.state, id, 'owner')?.nacao !== comando.nacao) continue;
      const portao = getComponent(ctx.state, id, 'portao');
      if (portao) portao.trancado = !portao.trancado;
    }
  },
};
