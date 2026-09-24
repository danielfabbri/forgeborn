/**
 * Militar da IA (IA-01, IA-04, IA-05, §13.2): defesa da base, ondas de ataque, recuo e micro.
 *
 * Onda (IA-04): parte com o VR do exército ≥ `vr_exercito_ataque` (× `ia_ondas_grandes_mult` no
 * traço "ondas grandes") e o relógio além de `primeiro_ataque_min`, contra a nação inimiga
 * conhecida mais próxima (Brutal: a mais fraca); recua abaixo de `ia_recuo_vr_pct`% do VR
 * inicial se o inimigo à vista for maior. Micro: 1 foco de fogo; 2 recuo de feridos
 * (`ia_ferido_pct`); 3 kite (`ia_kite_pct`).
 */
import type { Ponto } from '../core/components';
import { getComponent } from '../core/entities';
import type { SystemContext } from '../core/pipeline';
import type { EntityId, NacaoId } from '../core/types';
import { param } from '../data';
import { armaDe } from '../combate/armas';
import { avancar, tangente } from '../map/esfera';
import { bordaDe } from '../producao/alcance';
import { direcaoDe, distanciaM, raioDoMundo } from '../units/superficie';
import { comandar, dificuldade, maisProximo, proprios, temTraco, vrDe } from './base';
import type { Quadro } from './quadro';

const pos = (ctx: SystemContext, id: EntityId): Ponto =>
  direcaoDe(getComponent(ctx.state, id, 'position')!);

/** Pontos para onde vale a pena ir: estruturas inimigas conhecidas ou zonas de pouso inexploradas. */
function zonasDoMapa(ctx: SystemContext): Ponto[] {
  const mapa = ctx.mundo?.mapa as { zonasDePouso?: Array<{ d: Ponto }> } | undefined;
  return mapa?.zonasDePouso?.map((z) => z.d) ?? [];
}

/** A frente: a estrutura inimiga conhecida mais próxima ou a zona de pouso alheia mais próxima. */
export function frente(ctx: SystemContext, q: Quadro): Ponto | null {
  const conhecidas = Object.values(q.ia.conhecidas);
  const perto = maisProximo(ctx, q.base, conhecidas, (c) => c.d);
  if (perto) return perto.d;
  const zonas = zonasDoMapa(ctx).filter((z) => distanciaM(ctx, z, q.base) > 30);
  return maisProximo(ctx, q.base, zonas, (z) => z);
}

function pontoDeReuniao(ctx: SystemContext, q: Quadro): Ponto {
  const alvo = frente(ctx, q);
  const rumo = alvo ? tangente(q.base, alvo) : null;
  // A reunião fica na metade do raio de defesa, do lado da frente.
  const metros = param('ia_raio_defesa_m') / 2;
  return rumo ? avancar(q.base, rumo, metros / raioDoMundo(ctx)).p : q.base;
}

/** Manda ids para o ponto, sem refazer a ordem de quem já vai para lá. */
function enviar(
  ctx: SystemContext,
  q: Quadro,
  ids: EntityId[],
  ponto: Ponto,
  tipo: 'atacar_mover' | 'mover',
): void {
  const precisam = ids.filter((id) => {
    const ordem = getComponent(ctx.state, id, 'order')!.tipo;
    const destino = getComponent(ctx.state, id, 'locomotion')!.destino;
    if (ordem === 'atacar') return false;
    if (ordem === tipo && destino && distanciaM(ctx, destino, ponto) < 8) return false;
    // Parado perto do ponto: já chegou.
    return distanciaM(ctx, pos(ctx, id), ponto) > 6 || ordem !== 'nenhuma';
  });
  if (precisam.length === 0) return;
  comandar(ctx, q.nacao, tipo, { ids: precisam, x: ponto[0], y: ponto[1], z: ponto[2] });
}

/** Nação-alvo (IA-04): a conhecida mais próxima; na Brutal, a mais fraca (menos VR conhecido). */
function escolherAlvo(ctx: SystemContext, q: Quadro): { nacao: NacaoId; ponto: Ponto } | null {
  const porNacao = new Map<NacaoId, Array<{ d: Ponto; tipo: string }>>();
  for (const c of Object.values(q.ia.conhecidas)) {
    if (ctx.state.placar[c.nacao]?.eliminada) continue;
    const lista = porNacao.get(c.nacao) ?? [];
    lista.push(c);
    porNacao.set(c.nacao, lista);
  }
  if (porNacao.size === 0) return null;
  const nacoes = [...porNacao.keys()].sort();
  const distancia = (n: NacaoId) =>
    Math.min(...porNacao.get(n)!.map((c) => distanciaM(ctx, q.base, c.d)));
  const forca = (n: NacaoId) => porNacao.get(n)!.length;
  const nacao =
    q.nivel === 'brutal'
      ? nacoes.sort((a, b) => forca(a) - forca(b) || distancia(a) - distancia(b))[0]!
      : nacoes.sort((a, b) => distancia(a) - distancia(b))[0]!;
  // Prefere a Nave; senão, a estrutura conhecida mais próxima.
  const estruturas = porNacao.get(nacao)!;
  const nave = estruturas.find((c) => c.tipo === 'ship');
  const ponto = nave?.d ?? maisProximo(ctx, q.base, estruturas, (c) => c.d)!.d;
  return { nacao, ponto };
}

/** VR inimigo visível perto do exército (para decidir o recuo). */
function vrInimigoPerto(ctx: SystemContext, q: Quadro, centro: Ponto): number {
  const perto = q.inimigos.filter(
    (id) =>
      getComponent(ctx.state, id, 'arma') &&
      distanciaM(ctx, pos(ctx, id), centro) <= param('ia_raio_defesa_m'),
  );
  return vrDe(ctx.state, perto);
}

function centroide(ctx: SystemContext, ids: EntityId[]): Ponto {
  const s = ids.reduce<[number, number, number]>(
    (a, id) => {
      const p = pos(ctx, id);
      return [a[0] + p[0], a[1] + p[1], a[2] + p[2]];
    },
    [0, 0, 0],
  );
  const n = Math.hypot(...s) || 1;
  return [s[0] / n, s[1] / n, s[2] / n];
}

/** Micro (§13.2): foco de fogo, recuo de feridos e kite, conforme o nível. */
function micro(ctx: SystemContext, q: Quadro, exercito: EntityId[], reuniao: Ponto): void {
  const nivel = dificuldade(q.nivel, 'micro');
  if (nivel <= 0) return;
  const { state } = ctx;
  // 2: feridos recuam para a reunião.
  if (nivel >= 2) {
    const feridos = exercito.filter((id) => {
      const vida = getComponent(state, id, 'vida')!;
      return vida.hp / vida.max < param('ia_ferido_pct') / 100;
    });
    if (feridos.length > 0) enviar(ctx, q, feridos, reuniao, 'mover');
  }
  // 3: OPQ e drones recuam com o inimigo armado mais perto que `ia_kite_pct` do alcance.
  if (nivel >= 3) {
    for (const id of exercito) {
      const tipo = getComponent(state, id, 'unit')!.tipo;
      if (tipo !== 'hover_opq' && tipo !== 'drone_laser') continue;
      const alcance = armaDe(getComponent(state, id, 'arma')!.id).alcance_m;
      const d = pos(ctx, id);
      const ameaca = maisProximo(
        ctx,
        d,
        q.inimigos.filter((e) => getComponent(state, e, 'arma') && getComponent(state, e, 'unit')),
        (e) => pos(ctx, e),
      );
      if (ameaca === null) continue;
      const de = pos(ctx, ameaca);
      if (distanciaM(ctx, d, de) - bordaDe(ctx, ameaca) >= (alcance * param('ia_kite_pct')) / 100)
        continue;
      const rumo = tangente(de, d);
      if (!rumo) continue;
      const recuo = avancar(de, rumo, alcance / raioDoMundo(ctx)).p;
      comandar(ctx, q.nacao, 'mover', { ids: [id], x: recuo[0], y: recuo[1], z: recuo[2] });
    }
  }
  // 1: foco de fogo — quem está engajado ataca o inimigo de menor HP entre os alvos atuais.
  const engajados = exercito.filter((id) => getComponent(state, id, 'arma')!.alvo !== null);
  const alvos = [...new Set(engajados.map((id) => getComponent(state, id, 'arma')!.alvo!))].filter(
    (a) => q.inimigos.includes(a),
  );
  if (alvos.length < 2) return;
  const foco = alvos.sort(
    (a, b) => getComponent(state, a, 'vida')!.hp - getComponent(state, b, 'vida')!.hp || a - b,
  )[0]!;
  const ids = engajados.filter((id) => getComponent(state, id, 'arma')!.alvo !== foco);
  if (ids.length > 0) comandar(ctx, q.nacao, 'atacar', { ids, alvo: foco });
}

export function decidirMilitar(ctx: SystemContext, q: Quadro): void {
  const { state } = ctx;
  const exercito = q.exercito;
  const reuniao = pontoDeReuniao(ctx, q);
  const vr = vrDe(state, exercito);

  // Defesa: inimigo visível perto de uma estrutura própria.
  const estruturas = proprios(state, q.nacao).filter((id) => getComponent(state, id, 'structure'));
  const ameacas = q.inimigos.filter((e) =>
    estruturas.some((s) => distanciaM(ctx, pos(ctx, e), pos(ctx, s)) <= param('ia_raio_defesa_m')),
  );
  if (ameacas.length > 0 && !q.ia.onda) {
    q.ia.postura = 'defender';
    const alvo = maisProximo(ctx, q.base, ameacas, (e) => pos(ctx, e))!;
    enviar(ctx, q, exercito, pos(ctx, alvo), 'atacar_mover');
    micro(ctx, q, exercito, reuniao);
    return;
  }

  if (q.ia.onda) {
    const onda = q.ia.onda;
    const membros = onda.membros.filter((id) => exercito.includes(id));
    onda.membros = membros;
    const vrOnda = vrDe(state, membros);
    const alvo = escolherAlvoDaNacao(ctx, q, onda.alvo);
    // Quem ficou em casa espera a próxima onda na reunião.
    const emCasa = exercito.filter((id) => !membros.includes(id));
    enviar(
      ctx,
      q,
      emCasa.filter((id) => getComponent(state, id, 'order')!.tipo === 'nenhuma'),
      reuniao,
      'atacar_mover',
    );
    if (!alvo || membros.length === 0) {
      q.ia.onda = null;
    } else if (
      vrOnda < (onda.vrInicial * param('ia_recuo_vr_pct')) / 100 &&
      vrInimigoPerto(ctx, q, centroide(ctx, membros)) > vrOnda
    ) {
      // IA-04: recuo.
      q.ia.onda = null;
      enviar(ctx, q, membros, reuniao, 'mover');
      return;
    } else {
      onda.ponto = alvo;
      enviar(ctx, q, membros, alvo, 'atacar_mover');
      micro(ctx, q, membros, reuniao);
      return;
    }
  }

  const minimo =
    dificuldade(q.nivel, 'vr_exercito_ataque') *
    (temTraco(q.nacao, 'ondas grandes') ? param('ia_ondas_grandes_mult') : 1);
  const pronto = q.minutos >= dificuldade(q.nivel, 'primeiro_ataque_min') && vr >= minimo;
  if (pronto) {
    const alvo = escolherAlvo(ctx, q);
    if (alvo) {
      q.ia.onda = { vrInicial: vr, alvo: alvo.nacao, ponto: alvo.ponto, membros: [...exercito] };
      q.ia.postura = 'atacar';
      enviar(ctx, q, exercito, alvo.ponto, 'atacar_mover');
      return;
    }
    // Ninguém conhecido: o exército vai procurar pela frente (zona de pouso alheia).
    const busca = frente(ctx, q);
    if (busca) {
      enviar(ctx, q, exercito, busca, 'atacar_mover');
      return;
    }
  }
  // Reunião: quem está parado longe se junta.
  const ociosos = exercito.filter((id) => getComponent(state, id, 'order')!.tipo === 'nenhuma');
  enviar(ctx, q, ociosos, reuniao, 'atacar_mover');
}

/** Ponto de ataque dentro da nação-alvo da onda (Nave, senão a estrutura conhecida mais perto). */
function escolherAlvoDaNacao(ctx: SystemContext, q: Quadro, nacao: NacaoId): Ponto | null {
  if (ctx.state.placar[nacao]?.eliminada) return null;
  const estruturas = Object.values(q.ia.conhecidas).filter((c) => c.nacao === nacao);
  if (estruturas.length === 0) return null;
  const nave = estruturas.find((c) => c.tipo === 'ship');
  return nave?.d ?? maisProximo(ctx, q.base, estruturas, (c) => c.d)!.d;
}
