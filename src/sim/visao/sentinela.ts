/**
 * Modo Sentinela do Hover de Observação (UNI-03, VIS-06, VIS-07, CMB-22).
 *
 * Implanta em `tempo_implantar_sentinela_s` e recolhe em `tempo_recolher_sentinela_s`; ativo, fica
 * imóvel, gasta `en_sentinela_s`, vê `sentinela_visao_m`, detecta `sentinela_deteccao_m` e tem
 * radar de `sentinela_radar_m`: a cada `radar_atualizacao_s`, unidades inimigas no raio e fora da
 * visão viram sinais sem tipo; quem entra no radar dispara AL-03 com a contagem e um dos 8 rumos.
 */
import type { Ponto } from '../core/components';
import {
  entitiesWith,
  getComponent,
  isAlive,
  removeComponent,
  setComponent,
} from '../core/entities';
import type { CommandHandler, SystemContext } from '../core/pipeline';
import type { EntityId, NacaoId } from '../core/types';
import { param } from '../data';
import { emReserva, gastar } from '../energia/bateria';
import { normalizar, norteEm, produtoEscalar, produtoVetorial, tangente } from '../map/esfera';
import { pararNoLugar } from '../producao/alcance';
import { direcaoDe, distanciaM } from '../units/superficie';
import { visivelPara } from './nevoa';

/** VIS-07: os 8 rumos, do norte no sentido horário. */
export const RUMOS = [
  'norte',
  'nordeste',
  'leste',
  'sudeste',
  'sul',
  'sudoeste',
  'oeste',
  'noroeste',
] as const;

/** Rumo (de 8) de `para` visto de `de`, pelo norte do planeta (CEN-15). */
export function rumoDe(de: Ponto, para: Ponto): (typeof RUMOS)[number] {
  const t = tangente(de, para);
  if (!t) return 'norte';
  const norte = norteEm(de);
  const leste = normalizar(produtoVetorial(norte, de));
  const angulo = Math.atan2(produtoEscalar(t, leste), produtoEscalar(t, norte));
  const k = Math.round(angulo / (Math.PI / 4));
  return RUMOS[((k % 8) + 8) % 8]!;
}

const MOVIMENTO = new Set([
  'mover',
  'mover_ignorando',
  'patrulhar',
  'atacar_mover',
  'atacar',
  'tarefa',
]);

/** Máquina de estados da Sentinela e o radar (sistema `combate`, a cada tick). */
export function passoSentinelas(ctx: SystemContext): void {
  const { state, dt } = ctx;
  for (const id of entitiesWith(state, 'sentinela')) {
    const s = getComponent(state, id, 'sentinela')!;
    const ordem = getComponent(state, id, 'order')!.tipo;
    const loc = getComponent(state, id, 'locomotion')!;
    // Ordem de movimento: recolhe antes de andar (a Sentinela é imóvel).
    const querAndar = MOVIMENTO.has(ordem) && loc.destino !== null;
    if (s.estado === 'implantando') {
      if (querAndar) {
        removeComponent(state, id, 'sentinela');
        continue;
      }
      s.timer_s -= dt;
      if (s.timer_s <= 1e-9) s.estado = 'ativo';
      continue;
    }
    if (s.estado === 'ativo') {
      // ENE-11: no Modo Reserva não fica em Sentinela.
      if (querAndar || emReserva(ctx, id)) {
        s.estado = 'recolhendo';
        s.timer_s = param('tempo_recolher_sentinela_s');
        continue;
      }
      gastar(ctx, id, param('en_sentinela_s') * dt);
      continue;
    }
    s.timer_s -= dt;
    if (s.timer_s <= 1e-9) removeComponent(state, id, 'sentinela');
  }
  const cadencia = Math.max(1, Math.round(param('radar_atualizacao_s') / dt));
  if (ctx.tick % cadencia === 0) atualizarRadar(ctx);
}

/** VIS-06/VIS-07: sinais de radar e AL-03 por nação. */
function atualizarRadar(ctx: SystemContext): void {
  const { state } = ctx;
  const raio = param('sentinela_radar_m');
  for (const nacao of state.nacoes) {
    const sinais: Ponto[] = [];
    const vistos = new Set<EntityId>();
    const sentinelas = entitiesWith(state, 'sentinela', 'owner', 'position').filter(
      (id) =>
        getComponent(state, id, 'owner')!.nacao === nacao &&
        getComponent(state, id, 'sentinela')!.estado === 'ativo',
    );
    for (const sentinela of sentinelas) {
      const ds = direcaoDe(getComponent(state, sentinela, 'position')!);
      const dentro = inimigosNoRaio(ctx, nacao, ds, raio);
      const antes = new Set(state.radar[sentinela] ?? []);
      const novos = dentro.filter((id) => !antes.has(id));
      state.radar[sentinela] = dentro;
      if (novos.length > 0) {
        const centro = centroide(
          novos.map((id) => direcaoDe(getComponent(state, id, 'position')!)),
        );
        ctx.emit('alerta', {
          id: 'AL-03',
          nacao,
          n: novos.length,
          direcao: rumoDe(ds, centro),
          d: centro,
        });
      }
      for (const id of dentro) {
        if (vistos.has(id) || visivelPara(ctx, nacao, id)) continue;
        vistos.add(id);
        sinais.push(direcaoDe(getComponent(state, id, 'position')!));
      }
    }
    state.sinais[nacao] = sinais;
  }
  // Sentinelas que deixaram de existir ou de estar ativas esquecem o radar.
  for (const chave of Object.keys(state.radar)) {
    const id = Number(chave);
    if (!isAlive(state, id) || getComponent(state, id, 'sentinela')?.estado !== 'ativo') {
      delete state.radar[chave];
    }
  }
}

function inimigosNoRaio(ctx: SystemContext, nacao: NacaoId, d: Ponto, raio: number): EntityId[] {
  const { state } = ctx;
  return entitiesWith(state, 'unit', 'owner', 'position').filter(
    (id) =>
      getComponent(state, id, 'owner')!.nacao !== nacao &&
      distanciaM(ctx, d, direcaoDe(getComponent(state, id, 'position')!)) <= raio,
  );
}

function centroide(ds: Ponto[]): Ponto {
  const s = ds.reduce<[number, number, number]>(
    (a, d) => [a[0] + d[0], a[1] + d[1], a[2] + d[2]],
    [0, 0, 0],
  );
  return normalizar(s);
}

export const comandosDeSentinela: Record<string, CommandHandler> = {
  /** §12.4 (Hover de Observação) T: Modo Sentinela liga/desliga. */
  sentinela: (ctx, comando) => {
    const d = (comando.dados ?? {}) as { ids?: unknown };
    if (!Array.isArray(d.ids)) return;
    for (const id of [...new Set(d.ids)].sort((a, b) => Number(a) - Number(b))) {
      if (typeof id !== 'number' || !isAlive(ctx.state, id)) continue;
      if (getComponent(ctx.state, id, 'owner')?.nacao !== comando.nacao) continue;
      if (getComponent(ctx.state, id, 'unit')?.tipo !== 'hover_scout') continue;
      const s = getComponent(ctx.state, id, 'sentinela');
      if (s) {
        if (s.estado === 'ativo') {
          s.estado = 'recolhendo';
          s.timer_s = param('tempo_recolher_sentinela_s');
        }
        continue;
      }
      if (emReserva(ctx, id)) continue;
      pararNoLugar(ctx, id);
      const ordem = getComponent(ctx.state, id, 'order')!;
      ordem.tipo = 'nenhuma';
      ordem.patrulha = null;
      setComponent(ctx.state, id, 'sentinela', {
        estado: 'implantando',
        timer_s: param('tempo_implantar_sentinela_s'),
      });
    }
  },
};
