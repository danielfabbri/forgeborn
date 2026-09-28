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
import { entitiesWith, getComponent } from '../core/entities';
import type { SystemContext } from '../core/pipeline';
import type { EntityId, NacaoId } from '../core/types';
import { dados, type EstruturasId, param } from '../data';
import { raioDaPegada } from '../units/criar';
import { statsMovel } from '../units/stats';
import { limiarDeRecarga, papelDe } from '../energia/bateria';
import { armaDe } from '../combate/armas';
import { avancar, produtoEscalar, tangente } from '../map/esfera';
import { bordaDe } from '../producao/alcance';
import { direcaoDe, distanciaM, raioDoMundo } from '../units/superficie';
import { comandar, dificuldade, maisProximo, proprios, temTraco, vrDe } from './base';
import type { Quadro } from './quadro';
import { GERADOR_LUA } from '../map/lunar';
import { emGuerra } from '../relacoes/temperamento';

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

/** Além do pé da rampa (m), para a reunião não ficar no corredor de subida. */
const ALEM_DA_RAMPA_M = 12;

/**
 * Reunião do exército: no pé da rampa da própria zona mais voltada para a frente, fora da base
 * (alcançável e longe de onde Impressoras e hovers trabalham; com a espera longa até o 1º ataque,
 * D-79, o exército cresce ali). Sem rampas conhecidas, na borda do raio de defesa.
 */
function pontoDeReuniao(ctx: SystemContext, q: Quadro): Ponto {
  const alvo = frente(ctx, q);
  if (!alvo) return q.base;
  const R = raioDoMundo(ctx);
  const mapa = ctx.mundo?.mapa as
    { zonasDePouso?: Array<{ d: Ponto; rampas: Ponto[] }> } | undefined;
  const zona = mapa?.zonasDePouso?.find((z) => distanciaM(ctx, z.d, q.base) < 30);
  if (zona && zona.rampas.length > 0) {
    // Com a frente no antípoda (mapa de 2 zonas) todo rumo serve: fica a 1ª rampa.
    const paraAFrente = tangente(zona.d, alvo);
    const rampa = paraAFrente
      ? [...zona.rampas].sort(
          (a, b) => produtoEscalar(b, paraAFrente) - produtoEscalar(a, paraAFrente),
        )[0]!
      : zona.rampas[0]!;
    const metros =
      GERADOR_LUA.raioPlato +
      GERADOR_LUA.folgaTopo +
      GERADOR_LUA.comprimentoRampa +
      ALEM_DA_RAMPA_M;
    return avancar(zona.d, rampa, metros / R).p;
  }
  const rumo = tangente(q.base, alvo);
  return rumo ? avancar(q.base, rumo, param('ia_raio_defesa_m') / R).p : q.base;
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

/**
 * Nação-alvo. IA-04: entre as nações em guerra com a IA, a conhecida mais próxima (na Brutal, a
 * mais fraca, com menos estruturas conhecidas). IA-12 (D-82), sem guerra: provocação — Fácil
 * nunca; Normal a mais fraca, só se ela tiver menos estruturas que a própria IA; Difícil a mais
 * próxima; Brutal a mais fraca.
 */
function escolherAlvo(ctx: SystemContext, q: Quadro): { nacao: NacaoId; ponto: Ponto } | null {
  const { state } = ctx;
  const porNacao = new Map<NacaoId, Array<{ d: Ponto; tipo: string }>>();
  for (const c of Object.values(q.ia.conhecidas)) {
    if (state.placar[c.nacao]?.eliminada) continue;
    const lista = porNacao.get(c.nacao) ?? [];
    lista.push(c);
    porNacao.set(c.nacao, lista);
  }
  if (porNacao.size === 0) return null;
  const distancia = (n: NacaoId) =>
    Math.min(...porNacao.get(n)!.map((c) => distanciaM(ctx, q.base, c.d)));
  const forca = (n: NacaoId) => porNacao.get(n)!.length;
  const maisProxima = (lista: NacaoId[]) =>
    [...lista].sort((a, b) => distancia(a) - distancia(b) || (a < b ? -1 : 1))[0]!;
  const maisFraca = (lista: NacaoId[]) =>
    [...lista].sort(
      (a, b) => forca(a) - forca(b) || distancia(a) - distancia(b) || (a < b ? -1 : 1),
    )[0]!;
  const nacoes = [...porNacao.keys()].sort();
  const emGuerraCom = nacoes.filter((n) => emGuerra(state, q.nacao, n));
  let nacao: NacaoId | null = null;
  if (emGuerraCom.length > 0) {
    nacao = q.nivel === 'brutal' ? maisFraca(emGuerraCom) : maisProxima(emGuerraCom);
  } else if (q.nivel === 'normal') {
    const alvo = maisFraca(nacoes);
    const minhas = entitiesWith(state, 'structure', 'owner').filter(
      (id) => getComponent(state, id, 'owner')!.nacao === q.nacao,
    ).length;
    if (forca(alvo) < minhas) nacao = alvo;
  } else if (q.nivel === 'dificil') {
    nacao = maisProxima(nacoes);
  } else if (q.nivel === 'brutal') {
    nacao = maisFraca(nacoes);
  }
  if (nacao === null) return null;
  const ponto = escolherAlvoDaNacao(ctx, q, nacao);
  return ponto ? { nacao, ponto } : null;
}

/** Sem alvo conhecido, a IA pode sair procurando (entrando em domínios alheios)? */
function podeBuscar(ctx: SystemContext, q: Quadro): boolean {
  if (q.nivel === 'dificil' || q.nivel === 'brutal') return true;
  return ctx.state.nacoes.some((n) => emGuerra(ctx.state, q.nacao, n));
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

/** Energia (EN) para ir até `destino` e voltar, pelo gasto de movimento (ENE-09). */
function energiaDeViagem(ctx: SystemContext, id: EntityId, destino: Ponto): number {
  const s = statsMovel(getComponent(ctx.state, id, 'unit')!.tipo);
  return ((2 * distanciaM(ctx, pos(ctx, id), destino)) / s.vel_m_s) * s.mov_en_s;
}

/**
 * Pronta para a onda: chega à frente e volta sem cair no limiar de auto-recarga do papel
 * (ENE-15) e não está indo recarregar.
 */
function prontaPara(ctx: SystemContext, id: EntityId, destino: Ponto): boolean {
  const b = getComponent(ctx.state, id, 'bateria')!;
  const recarga = getComponent(ctx.state, id, 'recarga');
  if (recarga && recarga.estado !== 'nenhuma') return false;
  const limiar =
    (b.max * limiarDeRecarga(papelDe(getComponent(ctx.state, id, 'unit')!.tipo))) / 100;
  return b.en - energiaDeViagem(ctx, id, destino) > limiar;
}

export function decidirMilitar(ctx: SystemContext, q: Quadro): void {
  const { state } = ctx;
  const exercito = q.exercito;
  const reuniao = pontoDeReuniao(ctx, q);

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
    // Quem morreu ou saiu para recarregar deixa a onda.
    const membros = onda.membros.filter((id) => {
      if (!exercito.includes(id)) return false;
      const recarga = getComponent(state, id, 'recarga');
      return !recarga || recarga.estado === 'nenhuma';
    });
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
  // Só parte quem tem bateria para a ida e a volta; o VR de IA-04 conta só esses.
  const destinoDaOnda = escolherAlvo(ctx, q)?.ponto ?? frente(ctx, q) ?? reuniao;
  const prontos = exercito.filter((id) => prontaPara(ctx, id, destinoDaOnda));
  const vrPronto = vrDe(state, prontos);
  // Quem está parado na reunião sem bateria para a viagem vai recarregar antes.
  const recarregar = exercito.filter(
    (id) =>
      !prontos.includes(id) &&
      getComponent(state, id, 'order')!.tipo === 'nenhuma' &&
      getComponent(state, id, 'recarga')!.estado === 'nenhuma',
  );
  if (recarregar.length > 0) comandar(ctx, q.nacao, 'recarregar', { ids: recarregar });
  const pronto = q.minutos >= dificuldade(q.nivel, 'primeiro_ataque_min') && vrPronto >= minimo;
  if (pronto) {
    const alvo = escolherAlvo(ctx, q);
    if (alvo) {
      q.ia.onda = {
        vrInicial: vrPronto,
        alvo: alvo.nacao,
        ponto: alvo.ponto,
        membros: [...prontos],
      };
      q.ia.postura = 'atacar';
      enviar(ctx, q, prontos, alvo.ponto, 'atacar_mover');
      return;
    }
    // Ninguém conhecido: o exército vai procurar pela frente (zona de pouso alheia), se pode.
    const busca = podeBuscar(ctx, q) ? frente(ctx, q) : null;
    if (busca) {
      enviar(ctx, q, prontos, busca, 'atacar_mover');
      return;
    }
  }
  // Reunião: quem está parado longe se junta.
  const ociosos = exercito.filter((id) => getComponent(state, id, 'order')!.tipo === 'nenhuma');
  enviar(ctx, q, ociosos, reuniao, 'atacar_mover');
}

/**
 * Ponto de ataque dentro da nação-alvo (IA-04 escolhe a nação; o ponto é da IA): a estrutura
 * conhecida menos protegida — com menos estruturas armadas conhecidas cobrindo-a pelo alcance
 * da arma delas —, e a mais próxima no empate. Expansões e usinas caem antes da Nave.
 */
function escolherAlvoDaNacao(ctx: SystemContext, q: Quadro, nacao: NacaoId): Ponto | null {
  if (ctx.state.placar[nacao]?.eliminada) return null;
  const estruturas = Object.values(q.ia.conhecidas).filter((c) => c.nacao === nacao);
  if (estruturas.length === 0) return null;
  const armadas = estruturas.filter((c) => estruturaArmada(c.tipo));
  const cobertura = (d: Ponto) =>
    armadas.filter(
      (a) =>
        distanciaM(ctx, a.d, d) <=
        alcanceDaEstrutura(a.tipo) + raioDaPegada(a.tipo as EstruturasId),
    ).length;
  const ordenadas = [...estruturas].sort(
    (a, b) =>
      cobertura(a.d) - cobertura(b.d) ||
      distanciaM(ctx, q.base, a.d) - distanciaM(ctx, q.base, b.d),
  );
  return ordenadas[0]!.d;
}

function estruturaArmada(tipo: string): boolean {
  return dados.estruturas.find((e) => e.id === tipo)?.arma != null;
}

function alcanceDaEstrutura(tipo: string): number {
  const arma = dados.estruturas.find((e) => e.id === tipo)?.arma;
  return arma ? armaDe(arma).alcance_m : 0;
}
