/**
 * Plano de estruturas e apoio da IA (IA-08 a IA-10, D-66): a IA evolui a base pela tabela
 * `dados:ia_plano` do nível (a partir do minuto de cada item) e usa o que constrói: satélite
 * sobre o inimigo, mísseis curtos na defesa e longos contra estruturas (do Normal para cima),
 * minas perto da base, Silo Móvel na coleta mais longe e Bateria Móvel com a onda.
 */
import type { Ponto } from '../core/components';
import { entitiesWith, getComponent } from '../core/entities';
import type { SystemContext } from '../core/pipeline';
import type { EntityId } from '../core/types';
import { type CustosId, dados, type EstruturasId, param } from '../data';
import { ARMA_DO_MISSIL } from '../combate/misseis';
import { armaDe } from '../combate/armas';
import { cargaDoSilo, pontosDeEntrega } from '../economia/estoque';
import { avancar, norteEm, tangente } from '../map/esfera';
import { custoDe } from '../producao/custos';
import { direcaoDe, distanciaM, raioDoMundo } from '../units/superficie';
import { comandar, dosTipos, maisProximo, podePagar, tierPermitido } from './base';
import { construir, contarEstruturas, impressoraComVaga } from './economia';
import type { Quadro } from './quadro';

const ESTRUTURAS = new Set(dados.estruturas.map((e) => e.id as string));

/** Meta do item no nível agora (0 antes do minuto de início). */
function metaDo(q: Quadro, linha: (typeof dados.ia_plano)[number]): number {
  const minuto = linha[`min_${q.nivel}` as const] as number;
  if (q.minutos + 1e-9 < minuto) return 0;
  let meta = linha[q.nivel] as number;
  // IA-08: drones ou mísseis inimigos vistos pedem uma Antiaérea a mais.
  if (linha.item === 'aa_battery' && meta > 0) {
    const drones = (q.ia.observado['drone_laser'] ?? 0) + (q.ia.observado['drone_bomber'] ?? 0);
    if (drones > 0 || q.ia.viuMisseis) meta += 1;
  }
  return meta;
}

/** Quantos a nação tem do item (prontos, em obra e nas filas). */
function quantos(ctx: SystemContext, q: Quadro, item: string): number {
  if (ESTRUTURAS.has(item)) {
    return contarEstruturas(ctx, q, item as EstruturasId) + (q.naFila[item] ?? 0);
  }
  return dosTipos(ctx.state, q.nacao, item).length + (q.naFila[item] ?? 0);
}

function temUranio(ctx: SystemContext, q: Quadro): boolean {
  const u = ctx.state.estoques[q.nacao]!.u;
  return u >= custoDe('nuclear_plant').u + param('nuclear_consumo_u');
}

/** IA-08: o próximo item do plano abaixo da meta (para a coleta buscar o que falta), ou null. */
export function proximoDoPlano(ctx: SystemContext, q: Quadro): CustosId | null {
  for (const linha of dados.ia_plano) {
    const item = linha.item as string;
    if (quantos(ctx, q, item) >= metaDo(q, linha)) continue;
    if (!tierPermitido(q.nivel, item as CustosId)) continue;
    if (item === 'nuclear_plant' && !temUranio(ctx, q)) continue;
    return item as CustosId;
  }
  return null;
}

/** IA-08: o primeiro item abaixo da meta, na ordem da tabela; um pedido por decisão. */
function decidirPlano(ctx: SystemContext, q: Quadro): void {
  if (ctx.state.energia[q.nacao]!.racionamento) return;
  for (const linha of dados.ia_plano) {
    const item = linha.item as string;
    if (quantos(ctx, q, item) >= metaDo(q, linha)) continue;
    if (!tierPermitido(q.nivel, item as CustosId)) continue;
    if (item === 'nuclear_plant' && !temUranio(ctx, q)) continue;
    if (!podePagar(ctx.state, q.nacao, item as CustosId)) return;
    if (ESTRUTURAS.has(item)) {
      construir(ctx, q, item as EstruturasId);
      return;
    }
    const impressora = impressoraComVaga(ctx, q);
    if (impressora === null) return;
    comandar(ctx, q.nacao, 'imprimir', { ids: [impressora], item });
    q.naFila[item] = (q.naFila[item] ?? 0) + 1;
    return;
  }
}

/** Estrutura inimiga conhecida mais próxima de `de` (vista agora ou fantasma), ou null. */
function inimigoConhecido(q: Quadro, de: Ponto, ctx: SystemContext): Ponto | null {
  const pontos = Object.values(q.ia.conhecidas).map((m) => m.d as Ponto);
  return maisProximo(ctx, de, pontos, (p) => p) ?? null;
}

/** IA-09: cada base imprime o satélite, que fica sobre o inimigo conhecido mais próximo. */
function decidirSatelites(ctx: SystemContext, q: Quadro): void {
  const { state } = ctx;
  const satelites = entitiesWith(state, 'satelite', 'owner').filter(
    (id) => getComponent(state, id, 'owner')!.nacao === q.nacao,
  );
  for (const base of dosTipos(state, q.nacao, 'satellite_uplink')) {
    if (getComponent(state, base, 'obra')) continue;
    const temSatelite = satelites.some((s) => getComponent(state, s, 'satelite')!.base === base);
    const naFila = getComponent(state, base, 'producer')?.fila.length ?? 0;
    if (!temSatelite && naFila === 0 && podePagar(state, q.nacao, 'satellite')) {
      comandar(ctx, q.nacao, 'imprimir', { ids: [base], item: 'satellite' });
    }
  }
  const alvo = inimigoConhecido(q, q.base, ctx) ?? q.base;
  for (const id of satelites) {
    const s = getComponent(state, id, 'satelite')!;
    if (s.estado !== 'orbita') continue;
    const destino = s.destino ?? s.ponto;
    if (distanciaM(ctx, destino, alvo) <= 10) continue;
    comandar(ctx, q.nacao, 'reposicionar_satelite', {
      ids: [id],
      x: alvo[0],
      y: alvo[1],
      z: alvo[2],
    });
  }
}

/** IA-10: mantém os mísseis prontos e lança curtos na defesa e longos contra estruturas. */
function decidirMisseis(ctx: SystemContext, q: Quadro): void {
  const { state } = ctx;
  const agora = ctx.tick * ctx.dt;
  const ofensiva = q.nivel !== 'facil';
  for (const silo of dosTipos(state, q.nacao, 'missile_silo')) {
    if (getComponent(state, silo, 'obra')) continue;
    const lancador = getComponent(state, silo, 'lancador')!;
    const fila = getComponent(state, silo, 'producer')!.fila.map((i) => i.item);
    const todos = [...lancador.prontos, ...fila];
    const curtos = todos.filter((m) => m === 'missile_short').length;
    const longos = todos.filter((m) => m === 'missile_long').length;
    if (fila.length < param('ia_fila_por_produtor')) {
      if (curtos < param('ia_misseis_curtos') && podePagar(state, q.nacao, 'missile_short')) {
        comandar(ctx, q.nacao, 'imprimir', { ids: [silo], item: 'missile_short' });
      } else if (
        ofensiva &&
        longos < param('ia_misseis_longos') &&
        tierPermitido(q.nivel, 'missile_long') &&
        podePagar(state, q.nacao, 'missile_long')
      ) {
        comandar(ctx, q.nacao, 'imprimir', { ids: [silo], item: 'missile_long' });
      }
    }
    const frente = lancador.prontos[0];
    if (!frente || lancador.recarga_s > 1e-9) continue;
    const ds = direcaoDe(getComponent(state, silo, 'position')!);
    const alcance = armaDe(ARMA_DO_MISSIL[frente]).alcance_m;
    // Defesa: inimigo visível perto de uma estrutura própria e no alcance do míssil da frente.
    const estruturas = entitiesWith(state, 'structure', 'owner', 'position').filter(
      (id) => getComponent(state, id, 'owner')!.nacao === q.nacao,
    );
    const invasor = q.inimigos
      .filter((id) => getComponent(state, id, 'unit'))
      .map((id) => direcaoDe(getComponent(state, id, 'position')!))
      .find(
        (d) =>
          distanciaM(ctx, ds, d) <= alcance &&
          estruturas.some(
            (e) =>
              distanciaM(ctx, d, direcaoDe(getComponent(state, e, 'position')!)) <=
              param('ia_raio_defesa_m'),
          ),
      );
    if (invasor) {
      comandar(ctx, q.nacao, 'lancar_missil', {
        ids: [silo],
        x: invasor[0],
        y: invasor[1],
        z: invasor[2],
      });
      continue;
    }
    // Ofensiva (Normal para cima): longo contra estrutura conhecida, um a cada intervalo.
    if (!ofensiva || frente !== 'missile_long') continue;
    if (agora - (q.ia.ultimoLongo_s ?? -Infinity) < param('ia_missil_longo_intervalo_s')) continue;
    const alvo = Object.values(q.ia.conhecidas)
      .map((m) => m.d as Ponto)
      .filter((d) => distanciaM(ctx, ds, d) <= alcance)
      .sort((a, b) => distanciaM(ctx, ds, a) - distanciaM(ctx, ds, b))[0];
    if (!alvo) continue;
    q.ia.ultimoLongo_s = agora;
    comandar(ctx, q.nacao, 'lancar_missil', { ids: [silo], x: alvo[0], y: alvo[1], z: alvo[2] });
  }
}

/** IA-08: minas a `ia_minas_distancia_m` da base, na direção do inimigo, espalhadas em leque. */
function decidirMinas(ctx: SystemContext, q: Quadro): void {
  const { state } = ctx;
  const minas = entitiesWith(state, 'mine', 'owner').filter(
    (id) => getComponent(state, id, 'owner')!.nacao === q.nacao,
  ).length;
  const plantadores = dosTipos(state, q.nacao, 'hover_minelayer');
  if (minas >= plantadores.length * param('magazine_minas')) return;
  const inimigo = inimigoConhecido(q, q.base, ctx);
  const rumo = (inimigo && tangente(q.base, inimigo)) || norteEm(q.base);
  const R = raioDoMundo(ctx);
  let k = minas;
  for (const id of plantadores) {
    const lanca = getComponent(state, id, 'lancaMinas');
    if (!lanca || lanca.carregador === 0 || lanca.plantios.length > 0) continue;
    // Leque em volta da direção do inimigo: 0, +1, −1, +2, −2… passos de 6 m de lado.
    const lado = (k % 2 === 0 ? 1 : -1) * Math.ceil(k / 2) * 6;
    const frente = avancar(q.base, rumo, param('ia_minas_distancia_m') / R);
    const lateral =
      lado === 0 ? frente.p : avancar(frente.p, rotacionar90(frente.p, frente.rumo), lado / R).p;
    k++;
    comandar(ctx, q.nacao, 'plantar_mina', {
      ids: [id],
      x: lateral[0],
      y: lateral[1],
      z: lateral[2],
    });
  }
}

/** Rumo girado 90° no plano tangente em `d`. */
function rotacionar90(d: Ponto, rumo: Ponto): Ponto {
  return [
    d[1] * rumo[2] - d[2] * rumo[1],
    d[2] * rumo[0] - d[0] * rumo[2],
    d[0] * rumo[1] - d[1] * rumo[0],
  ];
}

/** IA-08: o Silo Móvel parado vai para perto da jazida em coleta mais longe dos depósitos. */
function decidirSilos(ctx: SystemContext, q: Quadro): void {
  const { state } = ctx;
  const depositos = pontosDeEntrega(ctx, q.nacao).filter((p) => p.tipo === 'deposito');
  const jazidas = new Set<EntityId>();
  for (const h of q.hovers) {
    const j = getComponent(state, h, 'coleta')?.jazida;
    if (j !== null && j !== undefined && getComponent(state, j, 'position')) jazidas.add(j);
  }
  let melhor: { d: Ponto; distancia: number } | null = null;
  for (const j of jazidas) {
    const d = direcaoDe(getComponent(state, j, 'position')!);
    const distancia = Math.min(...depositos.map((p) => distanciaM(ctx, d, p.d)));
    if (distancia < param('ia_distancia_expansao_m') / 2) continue;
    if (!melhor || distancia > melhor.distancia) melhor = { d, distancia };
  }
  if (!melhor) return;
  const perto = depositos.length > 0 ? depositos[0]!.d : q.base;
  const rumo = tangente(melhor.d, perto) ?? norteEm(melhor.d);
  const ponto = avancar(melhor.d, rumo, 12 / raioDoMundo(ctx)).p;
  for (const silo of dosTipos(state, q.nacao, 'mobile_silo')) {
    const s = getComponent(state, silo, 'silo')!;
    const loc = getComponent(state, silo, 'locomotion')!;
    if (s.estado !== 'solto' || loc.destino || cargaDoSilo(s) > 0) continue;
    const d = direcaoDe(getComponent(state, silo, 'position')!);
    if (distanciaM(ctx, d, ponto) <= 15) continue;
    comandar(ctx, q.nacao, 'mover', { ids: [silo], x: ponto[0], y: ponto[1], z: ponto[2] });
  }
}

/** IA-08: a Bateria Móvel acompanha a onda (no centro do exército); sem onda, fica na base. */
function decidirBaterias(ctx: SystemContext, q: Quadro): void {
  const { state } = ctx;
  const membros = (q.ia.onda?.membros ?? []).filter((id) => state.entities.includes(id));
  let alvo: Ponto = q.base;
  if (membros.length > 0) {
    const soma: Ponto = [0, 0, 0];
    for (const id of membros) {
      const p = getComponent(state, id, 'position')!;
      soma[0] += p.x;
      soma[1] += p.y;
      soma[2] += p.z;
    }
    const n = Math.hypot(...soma) || 1;
    alvo = [soma[0] / n, soma[1] / n, soma[2] / n];
  }
  for (const id of dosTipos(state, q.nacao, 'mobile_battery')) {
    if (getComponent(state, id, 'recarga')?.estado !== 'nenhuma') continue;
    const d = direcaoDe(getComponent(state, id, 'position')!);
    if (distanciaM(ctx, d, alvo) <= 10) continue;
    comandar(ctx, q.nacao, 'mover', { ids: [id], x: alvo[0], y: alvo[1], z: alvo[2] });
  }
}

/** Mísseis inimigos em voo que a nação vê (IA-08). */
function marcarMisseisVistos(ctx: SystemContext, q: Quadro): void {
  if (q.ia.viuMisseis) return;
  for (const id of entitiesWith(ctx.state, 'projetil', 'position')) {
    const p = getComponent(ctx.state, id, 'projetil')!;
    if (p.tipo !== 'missil' || p.nacao === q.nacao) continue;
    const d = direcaoDe(getComponent(ctx.state, id, 'position')!);
    if (distanciaM(ctx, d, q.base) <= 80) {
      q.ia.viuMisseis = true;
      return;
    }
  }
}

export function decidirPlanoDaIa(ctx: SystemContext, q: Quadro): void {
  marcarMisseisVistos(ctx, q);
  decidirPlano(ctx, q);
  decidirSatelites(ctx, q);
  decidirMisseis(ctx, q);
  decidirMinas(ctx, q);
  decidirSilos(ctx, q);
  decidirBaterias(ctx, q);
}
