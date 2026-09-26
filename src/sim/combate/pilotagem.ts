/**
 * Controle direto (CTL-08 a CTL-12, D-40 a D-44) na simulação: assumir e soltar uma unidade,
 * a entrada do jogador (comando `pilotar`), disparo pela mira, trava do torpedo, mineração e
 * habilidade do clique direito. O movimento fica em `sistemaMovimento` (passoPilotado).
 */
import type { CommandHandler, SystemContext } from '../core/pipeline';
import {
  entitiesWith,
  getComponent,
  isAlive,
  removeComponent,
  setComponent,
} from '../core/entities';
import type { EntityId, QueuedCommand } from '../core/types';
import { param } from '../data';
import { descarregar, extrair, folgaAteJazida, liberar } from '../economia/coleta';
import { pontosDeEntrega } from '../economia/estoque';
import { gastar } from '../energia/bateria';
import { avancar, normalizar, tangente, type Vec3 } from '../map/esfera';
import { criarMina } from '../units/criar';
import { statsMovel } from '../units/stats';
import { direcaoDe, distanciaM, raioDoMundo } from '../units/superficie';
import { comandosDeSentinela } from '../visao/sentinela';
import { CHEGADA_PLANTIO_M } from './minas';
import { alvoValido, armaDe, dispararEm, dispararReto, noAlcance, soltarBomba } from './armas';

export const ASSUMIR_CONTROLE_COMMAND = 'assumir_controle';
export const SOLTAR_CONTROLE_COMMAND = 'soltar_controle';
export const PILOTAR_COMMAND = 'pilotar';
export const HABILIDADE_COMMAND = 'habilidade';

type Dados = Record<string, unknown>;
const dadosDe = (c: QueuedCommand) => (c.dados ?? {}) as Dados;
const ehVec3 = (v: unknown): v is Vec3 =>
  Array.isArray(v) && v.length === 3 && v.every((x) => typeof x === 'number' && Number.isFinite(x));
const faixa = (v: unknown) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0;

/** A unidade é própria, móvel e viva? */
function unidadeDa(ctx: SystemContext, comando: QueuedCommand): EntityId | null {
  const id = dadosDe(comando).id;
  if (typeof id !== 'number' || !isAlive(ctx.state, id)) return null;
  if (getComponent(ctx.state, id, 'owner')?.nacao !== comando.nacao) return null;
  if (!getComponent(ctx.state, id, 'unit') || !getComponent(ctx.state, id, 'locomotion'))
    return null;
  return id;
}

export function soltar(ctx: SystemContext, id: EntityId): void {
  if (!getComponent(ctx.state, id, 'pilotado')) return;
  removeComponent(ctx.state, id, 'pilotado');
  const ordem = getComponent(ctx.state, id, 'order');
  if (ordem) ordem.tipo = 'nenhuma';
  const loc = getComponent(ctx.state, id, 'locomotion');
  if (loc) {
    loc.destino = null;
    loc.rota = [];
  }
}

/** CTL-08: assume a unidade; a nação só pilota uma por vez. */
function assumir(ctx: SystemContext, id: EntityId): void {
  const { state } = ctx;
  const nacao = getComponent(state, id, 'owner')!.nacao;
  for (const outro of entitiesWith(state, 'pilotado', 'owner')) {
    if (outro !== id && getComponent(state, outro, 'owner')!.nacao === nacao) soltar(ctx, outro);
  }
  if (getComponent(state, id, 'pilotado')) return;
  // D-44: larga ordens, rota, coleta, recarga e fuga; o jogador conduz.
  const ordem = getComponent(state, id, 'order')!;
  ordem.tipo = 'nenhuma';
  ordem.patrulha = null;
  const loc = getComponent(state, id, 'locomotion')!;
  loc.destino = null;
  loc.rota = [];
  loc.fluxo = null;
  loc.limiteVel = null;
  const coleta = getComponent(state, id, 'coleta');
  if (coleta) {
    liberar(ctx, id);
    coleta.estado = 'ocioso';
    coleta.jazida = null;
  }
  removeComponent(state, id, 'fuga');
  const arma = getComponent(state, id, 'arma');
  if (arma) {
    arma.alvo = null;
    arma.alvoDireto = null;
    arma.perseguindo = null;
  }
  const ar = getComponent(state, id, 'air');
  setComponent(state, id, 'pilotado', {
    frente: 0,
    lateral: 0,
    rumo: loc.rumo,
    impulso: false,
    gatilho: false,
    alvo: null,
    ponto: null,
    travando: null,
    trava_s: 0,
    segurando: false,
    pousar: ar ? ar.estado === 'pousado' || ar.estado === 'pousando' : false,
    deslocamento: null,
    plantio: null,
  });
}

/** D-42: a habilidade do clique direito de cada unidade. */
function habilidade(ctx: SystemContext, comando: QueuedCommand, id: EntityId): void {
  const { state } = ctx;
  const tipo = getComponent(state, id, 'unit')!.tipo;
  const p = getComponent(state, id, 'pilotado')!;
  const repassar = (handlers: Record<string, CommandHandler>, nome: string) =>
    handlers[nome]!(ctx, { ...comando, tipo: nome, dados: { ids: [id] } });
  switch (tipo) {
    case 'hover_explorer': {
      // Descarrega no ponto de entrega ao alcance (`raio_deposito_m` da borda).
      const coleta = getComponent(state, id, 'coleta')!;
      if (coleta.carga <= 0) return;
      const d = direcaoDe(getComponent(state, id, 'position')!);
      const raio = statsMovel(tipo).raio_m;
      const ponto = pontosDeEntrega(ctx, comando.nacao)
        .map((e) => ({ e, folga: distanciaM(ctx, d, e.d) - e.borda - raio }))
        .filter((x) => x.folga <= param('raio_deposito_m'))
        .sort((a, b) => a.folga - b.folga)[0];
      if (!ponto) return;
      coleta.entrega = ponto.e.id;
      descarregar(ctx, id);
      return;
    }
    case 'hover_minelayer': {
      const lanca = getComponent(state, id, 'lancaMinas');
      if (!lanca || lanca.carregador === 0 || p.plantio) return;
      p.plantio = { ponto: direcaoDe(getComponent(state, id, 'position')!), timer_s: 0 };
      return;
    }
    case 'hover_scout':
      repassar(comandosDeSentinela, 'sentinela');
      return;
    case 'drone_bomber':
    case 'drone_laser':
      p.pousar = !p.pousar;
      return;
    default:
      // EX1, OPQ e Impressora não têm habilidade (D-42).
      return;
  }
}

export const comandosDePilotagem: Record<string, CommandHandler> = {
  [ASSUMIR_CONTROLE_COMMAND]: (ctx, comando) => {
    const id = unidadeDa(ctx, comando);
    if (id !== null) assumir(ctx, id);
  },
  [SOLTAR_CONTROLE_COMMAND]: (ctx, comando) => {
    const id = unidadeDa(ctx, comando);
    if (id !== null) soltar(ctx, id);
  },
  [PILOTAR_COMMAND]: (ctx, comando) => {
    const id = unidadeDa(ctx, comando);
    const p = id !== null ? getComponent(ctx.state, id, 'pilotado') : undefined;
    if (!p) return;
    const d = dadosDe(comando);
    p.frente = faixa(d.frente);
    p.lateral = faixa(d.lateral);
    p.impulso = d.impulso === true;
    p.gatilho = d.gatilho === true;
    if (ehVec3(d.rumo)) p.rumo = normalizar(d.rumo);
    p.alvo = typeof d.alvo === 'number' && isAlive(ctx.state, d.alvo) ? d.alvo : null;
    p.ponto = ehVec3(d.ponto) ? normalizar(d.ponto) : null;
  },
  [HABILIDADE_COMMAND]: (ctx, comando) => {
    const id = unidadeDa(ctx, comando);
    if (id !== null && getComponent(ctx.state, id, 'pilotado')) habilidade(ctx, comando, id);
  },
};

/**
 * CTL-10/CTL-11: gatilho do controle direto. Lasers acertam o alvo sob a mira no alcance; sem
 * alvo, o disparo se perde (D-44). O torpedo trava mantendo o clique `trava_torpedo_s` no alvo
 * e sai ao soltar: guiado se travou, reto se não (D-40). Bombas caem no impacto previsto. O
 * Hover de Exploração minera a jazida sob a mira.
 */
export function passoPilotagem(ctx: SystemContext): void {
  const { state, dt } = ctx;
  for (const id of entitiesWith(state, 'pilotado')) {
    const p = getComponent(state, id, 'pilotado')!;
    const d = direcaoDe(getComponent(state, id, 'position')!);

    // D-42: plantio de mina onde o clique direito foi dado (o hover precisa ficar no lugar).
    if (p.plantio) {
      const lanca = getComponent(state, id, 'lancaMinas');
      if (
        !lanca ||
        lanca.carregador === 0 ||
        distanciaM(ctx, d, p.plantio.ponto) > CHEGADA_PLANTIO_M
      ) {
        p.plantio = null;
      } else {
        p.plantio.timer_s += dt;
        if (p.plantio.timer_s >= param('tempo_plantar_mina_s') - 1e-9) {
          if (criarMina(ctx, getComponent(state, id, 'owner')!.nacao, p.plantio.ponto) !== null) {
            lanca.carregador--;
          }
          p.plantio = null;
        }
      }
    }

    // Hover de Exploração: minera a jazida sob a mira.
    const coleta = getComponent(state, id, 'coleta');
    if (coleta) {
      if (
        p.gatilho &&
        p.alvo !== null &&
        getComponent(state, p.alvo, 'jazida') &&
        folgaAteJazida(ctx, id, p.alvo) <= param('distancia_mineracao_m') &&
        coleta.carga < param('carga_hover_u') - 1e-9
      ) {
        extrair(ctx, id, p.alvo, dt);
      }
      continue;
    }

    const componente = getComponent(state, id, 'arma');
    if (!componente) continue;
    const arma = armaDe(componente.id);
    const pronta = () => {
      if (componente.recarga_s > 1e-9) return false;
      const b = getComponent(state, id, 'bateria');
      return arma.fonte_en !== 'bateria' || !b || b.en >= arma.en_disparo - 1e-9;
    };
    const pagar = () => {
      if (arma.fonte_en === 'bateria') gastar(ctx, id, arma.en_disparo);
      componente.recarga_s = arma.recarga_s ?? 0;
    };
    const alvoNaMira = p.alvo !== null && alvoValido(ctx, id, p.alvo, arma) ? p.alvo : null;

    if (arma.projetil === 'guiado') {
      if (p.gatilho) {
        p.segurando = true;
        if (alvoNaMira !== null && alvoNaMira === p.travando) p.trava_s += dt;
        else {
          p.travando = alvoNaMira;
          p.trava_s = 0;
        }
        continue;
      }
      if (!p.segurando) continue;
      // Soltou o clique: dispara (travado ou reto).
      const travado =
        p.travando !== null &&
        p.trava_s >= param('trava_torpedo_s') - 1e-9 &&
        alvoValido(ctx, id, p.travando, arma)
          ? p.travando
          : null;
      p.segurando = false;
      p.travando = null;
      p.trava_s = 0;
      if (!pronta()) continue;
      pagar();
      if (travado !== null) dispararEm(ctx, id, arma, travado);
      else
        dispararReto(
          ctx,
          id,
          arma,
          tangente(d, p.rumo) ?? getComponent(state, id, 'locomotion')!.rumo,
        );
      continue;
    }

    if (!p.gatilho || !pronta()) continue;
    if (arma.projetil === 'balistico') {
      // CTL-11: a bomba cai no ponto previsto pelo deslocamento durante a queda.
      const loc = getComponent(state, id, 'locomotion')!;
      const rumo = p.deslocamento ? (tangente(d, p.deslocamento) ?? loc.rumo) : loc.rumo;
      const ponto = avancar(
        d,
        rumo,
        (loc.speed * param('bomba_tempo_queda_s')) / raioDoMundo(ctx),
      ).p;
      pagar();
      soltarBomba(ctx, id, arma, ponto);
      continue;
    }
    // Hitscan.
    pagar();
    if (alvoNaMira !== null && noAlcance(ctx, id, arma, alvoNaMira)) {
      dispararEm(ctx, id, arma, alvoNaMira);
    } else ctx.emit('disparo', { atirador: id, alvo: null, arma: arma.id, ponto: p.ponto });
  }
}

/** CTL-12: bônus de dano da Sincronia para quem está em controle direto. */
export function multiplicadorDeSincronia(ctx: SystemContext, atacante: EntityId | null): number {
  return atacante !== null && getComponent(ctx.state, atacante, 'pilotado')
    ? 1 + param('controle_direto_bonus_dano_pct') / 100
    : 1;
}
