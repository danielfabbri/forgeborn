/**
 * Ciclo de coleta do Hover de Exploração (ECO-06, ECO-09 a ECO-12, ECO-20).
 *
 * Estados: ocioso → indo_jazida → minerando → indo_entregar → descarregando → (volta à jazida).
 * Sem vaga livre (ECO-06), o hover procura outra jazida do mesmo tipo a até
 * `raio_busca_jazida_m`; se não houver, espera na fila. A vaga é liberada quando o hover sai
 * para entregar. Qualquer ordem manual de movimento interrompe a coleta (a carga fica a bordo).
 */
import { entitiesWith, getComponent, removeComponent } from '../core/entities';
import type { CommandHandler, SystemContext } from '../core/pipeline';
import type { EntityId } from '../core/types';
import { dados, param, type RecursosId } from '../data';
import { avancar, girar, normalizar, norteEm, tangente, TAU, type Vec3 } from '../map/esfera';
import { tracarRota } from '../units/movimento';
import { navegavelDe } from '../units/navegacao';
import { statsMovel } from '../units/stats';
import { direcaoDe, distanciaM, raioDoMundo } from '../units/superficie';
import { emReserva, gastar } from '../energia/bateria';
import { bonusDaNacao } from '../ia/base';
import { cargaDoSilo, creditar, entregaMaisProxima, vivo } from './estoque';
import { atualizarRaio, esgotar, jazidaViva, todasAsJazidas, vagasLivres } from './jazidas';

/** Taxa de mineração de cada recurso (`dados:recursos`). */
const TAXA = Object.fromEntries(dados.recursos.map((r) => [r.id, r.taxa_mineracao_u_s])) as Record<
  RecursosId,
  number
>;

/** Coloca o hover a caminho de `alvo` sob uma tarefa automática. */
export function irPara(ctx: SystemContext, id: EntityId, alvo: Vec3): void {
  const loc = getComponent(ctx.state, id, 'locomotion')!;
  const ordem = getComponent(ctx.state, id, 'order')!;
  ordem.tipo = 'tarefa';
  ordem.patrulha = null;
  loc.destino = alvo;
  loc.limiteVel = null;
  loc.travado_s = 0;
  loc.ancora = null;
  tracarRota(navegavelDe(ctx, id), loc, direcaoDe(getComponent(ctx.state, id, 'position')!), false);
}

/** Para o hover no lugar, mantendo a tarefa. */
function parar(ctx: SystemContext, id: EntityId): void {
  const loc = getComponent(ctx.state, id, 'locomotion')!;
  loc.destino = null;
  loc.rota = [];
  loc.fluxo = null;
}

function raioDoHover(ctx: SystemContext, id: EntityId): number {
  return statsMovel(getComponent(ctx.state, id, 'unit')!.tipo).raio_m;
}

/** Distância (m) entre o casco do hover e a borda da jazida. */
function folgaAteJazida(ctx: SystemContext, hover: EntityId, jazida: EntityId): number {
  const dh = direcaoDe(getComponent(ctx.state, hover, 'position')!);
  const dj = direcaoDe(getComponent(ctx.state, jazida, 'position')!);
  const raioJ = getComponent(ctx.state, jazida, 'obstacle')!.raio;
  return distanciaM(ctx, dh, dj) - raioJ - raioDoHover(ctx, hover);
}

/** Posição da vaga k em volta da jazida (a meio caminho da distância de mineração). */
function posicaoDaVaga(ctx: SystemContext, jazida: EntityId, hover: EntityId, k: number): Vec3 {
  const dj = direcaoDe(getComponent(ctx.state, jazida, 'position')!);
  const raioJ = getComponent(ctx.state, jazida, 'obstacle')!.raio;
  const rumo = normalizar(girar(norteEm(dj), dj, (k * TAU) / param('slots_por_jazida')));
  const distancia = raioJ + raioDoHover(ctx, hover) + param('distancia_mineracao_m') / 2;
  return avancar(dj, rumo, distancia / raioDoMundo(ctx)).p;
}

/** Ponto de espera da fila: um pouco além das vagas, do lado de onde o hover vem. */
function posicaoDeEspera(ctx: SystemContext, jazida: EntityId, hover: EntityId): Vec3 {
  const dj = direcaoDe(getComponent(ctx.state, jazida, 'position')!);
  const dh = direcaoDe(getComponent(ctx.state, hover, 'position')!);
  const raioJ = getComponent(ctx.state, jazida, 'obstacle')!.raio;
  const rumo = tangente(dj, dh) ?? norteEm(dj);
  const distancia = raioJ + raioDoHover(ctx, hover) + param('distancia_mineracao_m') + 3;
  return avancar(dj, rumo, distancia / raioDoMundo(ctx)).p;
}

/** Tira o hover das vagas e da fila da jazida em que estava. */
export function liberar(ctx: SystemContext, hover: EntityId): void {
  const coleta = getComponent(ctx.state, hover, 'coleta')!;
  if (!jazidaViva(ctx, coleta.jazida)) return;
  const jazida = getComponent(ctx.state, coleta.jazida!, 'jazida')!;
  jazida.vagas = jazida.vagas.map((h) => (h === hover ? null : h));
  jazida.fila = jazida.fila.filter((h) => h !== hover);
}

/** Jazida do mesmo tipo com vaga livre mais próxima de `perto`, a até `raio_busca_jazida_m`. */
function alternativa(
  ctx: SystemContext,
  recurso: RecursosId,
  perto: Vec3,
  exceto: EntityId | null,
): EntityId | null {
  let melhor: EntityId | null = null;
  let melhorDistancia = Infinity;
  for (const id of todasAsJazidas(ctx)) {
    if (id === exceto) continue;
    const jazida = getComponent(ctx.state, id, 'jazida')!;
    if (jazida.recurso !== recurso || vagasLivres(jazida) === 0) continue;
    const distancia = distanciaM(ctx, perto, direcaoDe(getComponent(ctx.state, id, 'position')!));
    if (distancia <= param('raio_busca_jazida_m') && distancia < melhorDistancia) {
      melhorDistancia = distancia;
      melhor = id;
    }
  }
  return melhor;
}

function ficarOcioso(ctx: SystemContext, hover: EntityId): void {
  const coleta = getComponent(ctx.state, hover, 'coleta')!;
  liberar(ctx, hover);
  coleta.estado = 'ocioso';
  coleta.jazida = null;
  coleta.recurso = null;
  coleta.manual = false;
  parar(ctx, hover);
}

/** ECO-10: parte para o ponto de entrega mais próximo pelo caminho. */
export function iniciarEntrega(ctx: SystemContext, hover: EntityId): void {
  const coleta = getComponent(ctx.state, hover, 'coleta')!;
  const nacao = getComponent(ctx.state, hover, 'owner')!.nacao;
  const dh = direcaoDe(getComponent(ctx.state, hover, 'position')!);
  liberar(ctx, hover);
  const ponto = entregaMaisProxima(ctx, nacao, dh);
  if (!ponto) {
    coleta.estado = 'indo_entregar';
    coleta.entrega = null;
    parar(ctx, hover);
    return;
  }
  coleta.estado = 'indo_entregar';
  coleta.entrega = ponto.id;
  const rumo = tangente(ponto.d, dh) ?? norteEm(ponto.d);
  const distancia = ponto.borda + raioDoHover(ctx, hover) + param('raio_deposito_m') / 2;
  irPara(ctx, hover, avancar(ponto.d, rumo, distancia / raioDoMundo(ctx)).p);
}

/**
 * Designa o hover a uma jazida (ECO-06, ECO-20). Com carga de outro recurso, entrega primeiro.
 * Sem vaga, tenta outra do mesmo tipo por perto; senão, entra na fila.
 */
export function designar(
  ctx: SystemContext,
  hover: EntityId,
  jazida: EntityId,
  manual: boolean,
): void {
  const coleta = getComponent(ctx.state, hover, 'coleta')!;
  const alvo = getComponent(ctx.state, jazida, 'jazida')!;
  removeComponent(ctx.state, hover, 'trabalho');
  liberar(ctx, hover);
  coleta.jazida = jazida;
  coleta.recurso = alvo.recurso;
  coleta.manual = manual;
  if (coleta.carga > 0 && coleta.cargaRecurso !== alvo.recurso) {
    iniciarEntrega(ctx, hover);
    return;
  }
  if (vagasLivres(alvo) > 0) {
    ocuparVaga(ctx, hover, jazida);
    return;
  }
  const dj = direcaoDe(getComponent(ctx.state, jazida, 'position')!);
  const outra = alternativa(ctx, alvo.recurso, dj, jazida);
  if (outra !== null) {
    ocuparVaga(ctx, hover, outra);
    return;
  }
  alvo.fila.push(hover);
  coleta.estado = 'esperando';
  irPara(ctx, hover, posicaoDeEspera(ctx, jazida, hover));
}

/** Ocupa a vaga livre de menor índice (posições fixas em volta da jazida). */
function ocuparVaga(ctx: SystemContext, hover: EntityId, jazida: EntityId): void {
  const coleta = getComponent(ctx.state, hover, 'coleta')!;
  const alvo = getComponent(ctx.state, jazida, 'jazida')!;
  const k = alvo.vagas.indexOf(null);
  alvo.vagas[k] = hover;
  coleta.jazida = jazida;
  coleta.estado = 'indo_jazida';
  irPara(ctx, hover, posicaoDaVaga(ctx, jazida, hover, k));
}

function vagaDe(vagas: Array<EntityId | null>, hover: EntityId): number {
  return vagas.indexOf(hover);
}

/** Depois de entregar (ECO-12) ou de perder a jazida: volta a ela ou a outra do mesmo tipo. */
function voltarAoTrabalho(ctx: SystemContext, hover: EntityId, perto: Vec3 | null): void {
  const coleta = getComponent(ctx.state, hover, 'coleta')!;
  if (jazidaViva(ctx, coleta.jazida)) {
    designar(ctx, hover, coleta.jazida!, coleta.manual);
    return;
  }
  const outra = coleta.recurso && perto ? alternativa(ctx, coleta.recurso, perto, null) : null;
  if (outra !== null) designar(ctx, hover, outra, false);
  else ficarOcioso(ctx, hover);
}

/** ECO-28: a sucata vira os recursos da composição ao ser descarregada. */
function descarregarSucata(ctx: SystemContext, hover: EntityId): boolean {
  const coleta = getComponent(ctx.state, hover, 'coleta')!;
  if (!vivo(ctx.state, coleta.entrega)) return false;
  const nacao = getComponent(ctx.state, hover, 'owner')!.nacao;
  const silo = getComponent(ctx.state, coleta.entrega, 'silo');
  if (silo && silo.estado !== 'ancorado') return false;
  const espaco = silo ? param('capacidade_silo_u') - cargaDoSilo(silo) : Infinity;
  const fracao = Math.min(1, espaco / Math.max(coleta.carga, 1e-9));
  for (const [r, u] of Object.entries(coleta.sucata!) as Array<[RecursosId, number]>) {
    const parte = u * fracao;
    if (silo) silo.carga[r] = (silo.carga[r] ?? 0) + parte;
    else creditar(ctx.state, nacao, r, parte);
    coleta.sucata![r] = u - parte;
  }
  coleta.carga *= 1 - fracao;
  if (!silo) ctx.emit('entrega', { nacao, recurso: 'sucata', u: coleta.carga, hover });
  if (coleta.carga <= 1e-9) {
    coleta.carga = 0;
    coleta.sucata = null;
  }
  return true;
}

/** Descarrega a carga no ponto de entrega (ECO-14 ou ECO-22). */
function descarregar(ctx: SystemContext, hover: EntityId): boolean {
  const coleta = getComponent(ctx.state, hover, 'coleta')!;
  if (coleta.sucata) return descarregarSucata(ctx, hover);
  if (!vivo(ctx.state, coleta.entrega) || !coleta.cargaRecurso) return false;
  const nacao = getComponent(ctx.state, hover, 'owner')!.nacao;
  const silo = getComponent(ctx.state, coleta.entrega, 'silo');
  if (silo) {
    if (silo.estado !== 'ancorado') return false;
    const espaco = param('capacidade_silo_u') - cargaDoSilo(silo);
    const u = Math.min(espaco, coleta.carga);
    silo.carga[coleta.cargaRecurso] = (silo.carga[coleta.cargaRecurso] ?? 0) + u;
    coleta.carga -= u;
  } else {
    creditar(ctx.state, nacao, coleta.cargaRecurso, coleta.carga);
    ctx.emit('entrega', { nacao, recurso: coleta.cargaRecurso, u: coleta.carga, hover });
    coleta.carga = 0;
  }
  if (coleta.carga <= 1e-9) {
    coleta.carga = 0;
    coleta.cargaRecurso = null;
  }
  return true;
}

function passo(ctx: SystemContext, hover: EntityId, dt: number): void {
  const { state } = ctx;
  const coleta = getComponent(state, hover, 'coleta')!;
  const ordem = getComponent(state, hover, 'order')!;
  // Ordem manual (mover, parar, manter, patrulhar) interrompe a coleta.
  if (ordem.tipo !== 'tarefa') {
    if (coleta.estado !== 'ocioso') {
      liberar(ctx, hover);
      coleta.estado = 'ocioso';
      coleta.jazida = null;
      coleta.recurso = null;
      coleta.manual = false;
    }
    return;
  }
  // Indo recarregar (ENE-15): a coleta espera; a recarga retoma depois (retomarColeta).
  const recarga = getComponent(state, hover, 'recarga');
  if (recarga && recarga.estado !== 'nenhuma') return;
  // ECO-13: em fuga, a coleta espera; a fuga retoma depois.
  if (getComponent(state, hover, 'fuga')) return;
  const loc = getComponent(state, hover, 'locomotion')!;
  const dh = direcaoDe(getComponent(state, hover, 'position')!);
  switch (coleta.estado) {
    case 'ocioso':
      return;
    case 'esperando': {
      if (!jazidaViva(ctx, coleta.jazida)) {
        voltarAoTrabalho(ctx, hover, dh);
        return;
      }
      const jazida = getComponent(state, coleta.jazida!, 'jazida')!;
      if (vagasLivres(jazida) > 0 && jazida.fila[0] === hover) {
        jazida.fila.shift();
        ocuparVaga(ctx, hover, coleta.jazida!);
      }
      return;
    }
    case 'indo_jazida': {
      if (!jazidaViva(ctx, coleta.jazida)) {
        voltarAoTrabalho(ctx, hover, dh);
        return;
      }
      if (folgaAteJazida(ctx, hover, coleta.jazida!) <= param('distancia_mineracao_m')) {
        coleta.estado = 'minerando';
        parar(ctx, hover);
        return;
      }
      // Chegou à vaga sem alcançar a jazida (ela encolheu): refaz a aproximação.
      if (!loc.destino) {
        const jazida = getComponent(state, coleta.jazida!, 'jazida')!;
        irPara(ctx, hover, posicaoDaVaga(ctx, coleta.jazida!, hover, vagaDe(jazida.vagas, hover)));
      }
      return;
    }
    case 'minerando': {
      if (!jazidaViva(ctx, coleta.jazida)) {
        if (coleta.carga > 0) iniciarEntrega(ctx, hover);
        else voltarAoTrabalho(ctx, hover, dh);
        return;
      }
      if (folgaAteJazida(ctx, hover, coleta.jazida!) > param('distancia_mineracao_m')) {
        coleta.estado = 'indo_jazida';
        const jazida = getComponent(state, coleta.jazida!, 'jazida')!;
        irPara(ctx, hover, posicaoDaVaga(ctx, coleta.jazida!, hover, vagaDe(jazida.vagas, hover)));
        return;
      }
      const jazida = getComponent(state, coleta.jazida!, 'jazida')!;
      // ENE-10/ENE-11: minerar gasta `en_minerar_s`; no Modo Reserva o hover não minera.
      if (emReserva(ctx, hover)) return;
      // §13.2: `bonus_coleta_pct` da dificuldade da IA acelera a mineração.
      const bonus =
        1 + bonusDaNacao(state, getComponent(state, hover, 'owner')!.nacao, 'bonus_coleta_pct');
      const taxa = TAXA[jazida.recurso] * bonus * gastar(ctx, hover, param('en_minerar_s') * dt);
      const u = Math.min(taxa * dt, param('carga_hover_u') - coleta.carga, jazida.quantidade);
      coleta.carga += u;
      coleta.cargaRecurso = jazida.recurso;
      jazida.quantidade -= u;
      if (jazida.quantidade <= 1e-9) {
        const lugar = direcaoDe(getComponent(state, coleta.jazida!, 'position')!);
        esgotar(ctx, coleta.jazida!);
        coleta.jazida = null;
        if (coleta.carga > 0) iniciarEntrega(ctx, hover);
        else voltarAoTrabalho(ctx, hover, lugar);
        return;
      }
      atualizarRaio(ctx, coleta.jazida!);
      if (coleta.carga >= param('carga_hover_u') - 1e-9) iniciarEntrega(ctx, hover);
      return;
    }
    case 'indo_entregar': {
      const valida =
        vivo(state, coleta.entrega) &&
        (!getComponent(state, coleta.entrega, 'silo') ||
          getComponent(state, coleta.entrega, 'silo')!.estado === 'ancorado');
      if (!valida) {
        iniciarEntrega(ctx, hover);
        return;
      }
      const alvo = coleta.entrega!;
      const da = direcaoDe(getComponent(state, alvo, 'position')!);
      const borda =
        getComponent(state, alvo, 'obstacle')?.raio ??
        statsMovel(getComponent(state, alvo, 'unit')!.tipo).raio_m;
      const folga = distanciaM(ctx, dh, da) - borda - raioDoHover(ctx, hover);
      if (folga <= param('raio_deposito_m')) {
        coleta.estado = 'descarregando';
        coleta.timer_s = param('tempo_descarga_hover_s');
        parar(ctx, hover);
      } else if (!loc.destino) {
        iniciarEntrega(ctx, hover);
      }
      return;
    }
    case 'descarregando': {
      coleta.timer_s -= dt;
      if (coleta.timer_s > 1e-9) return;
      if (!descarregar(ctx, hover) || coleta.carga > 0) {
        iniciarEntrega(ctx, hover);
        return;
      }
      // ECO-28: reciclando, o hover volta ao destroço (a reciclagem o leva).
      if (getComponent(state, hover, 'trabalho')) {
        coleta.estado = 'ocioso';
        parar(ctx, hover);
        return;
      }
      const perto = jazidaViva(ctx, coleta.jazida)
        ? direcaoDe(getComponent(state, coleta.jazida!, 'position')!)
        : dh;
      voltarAoTrabalho(ctx, hover, perto);
      return;
    }
  }
}

/** D-28: depois da recarga, o hover volta à coleta (entrega a carga ou volta à jazida). */
export function retomarColeta(ctx: SystemContext, hover: EntityId): void {
  const coleta = getComponent(ctx.state, hover, 'coleta')!;
  getComponent(ctx.state, hover, 'order')!.tipo = 'tarefa';
  if (coleta.carga > 0) {
    iniciarEntrega(ctx, hover);
    return;
  }
  const perto = direcaoDe(getComponent(ctx.state, hover, 'position')!);
  voltarAoTrabalho(ctx, hover, perto);
}

export function passoColeta(ctx: SystemContext): void {
  for (const hover of entitiesWith(ctx.state, 'coleta', 'position')) passo(ctx, hover, ctx.dt);
}

/** ECO-20: ordem manual de coleta (clique direito numa jazida). */
export const comandosDeColeta: Record<string, CommandHandler> = {
  coletar: (ctx, comando) => {
    const d = (comando.dados ?? {}) as { ids?: unknown; jazida?: unknown };
    if (typeof d.jazida !== 'number' || !jazidaViva(ctx, d.jazida)) return;
    if (!Array.isArray(d.ids)) return;
    const ids = [...new Set(d.ids)]
      .filter((id): id is number => typeof id === 'number' && vivo(ctx.state, id))
      .filter(
        (id) =>
          getComponent(ctx.state, id, 'owner')?.nacao === comando.nacao &&
          getComponent(ctx.state, id, 'coleta') !== undefined,
      )
      .sort((a, b) => a - b);
    for (const id of ids) designar(ctx, id, d.jazida, true);
  },
};
