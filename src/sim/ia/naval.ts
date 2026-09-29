/**
 * IA-14 (D-90): IA naval. Em mapa com líquido perto da base, a IA constrói um Porto e mantém
 * Embarcações de Artilharia (patrulham perto do Porto e defendem a base) e Antena (exploram o
 * mar). Quando a onda (IA-04) não tem caminho por terra até o alvo, ela a leva de Transporte;
 * quando a melhor expansão (IA-07) fica numa ilha, leva uma Impressora até lá e ergue uma Usina
 * Solar e um Armazém ligados por cabo. Tudo por Comandos, como o jogador.
 */
import type { Ponto } from '../core/components';
import { entitiesWith, getComponent, isAlive } from '../core/entities';
import type { SystemContext } from '../core/pipeline';
import type { EntityId } from '../core/types';
import { param } from '../data';
import { alcancaAlguma, pontosDeBifurcacao } from '../energia/cabos';
import { mesmaTerra, rotulosDeAgua } from '../map/conectividade';
import { celulaLivreProxima, centroDoIndice } from '../map/pathfinding';
import { navegavel, navegavelAgua } from '../units/navegacao';
import { avancar, girar, norteEm, type Vec3 } from '../map/esfera';
import { emLiquido, terraPerto } from '../map/lagos';
import { validarPosicionamento } from '../producao/obra';
import { direcaoDe, distanciaM, raioDoMundo } from '../units/superficie';
import { ESCURO, estadoEm } from '../visao/nevoa';
import { comandar, podePagar } from './base';
import { impressoraComVaga, plantarCentral } from './economia';
import { procurarLocal } from './local';
import type { Quadro } from './quadro';

/** Rumos por anel e passo (m) dos anéis na procura do Porto e dos pontos de mar. */
const RUMOS = 32;
const PASSO_ANEL_M = 4;
/** Prazo (s) para a onda embarcar e para cada fase da expedição. */
const PRAZO_EMBARQUE_S = 90;
const PRAZO_EXPEDICAO_S = 240;
/** Raio (m) da reunião na margem do Porto e alcance (células) da procura de líquido. */
const REUNIAO_M = 25;
const BUSCA_DE_AGUA_CELULAS = 600;
/** Fração da bateria com que a Impressora parte para a ilha. */
const BATERIA_DA_EXPEDICAO = 0.9;

const pos = (ctx: SystemContext, id: EntityId): Ponto =>
  direcaoDe(getComponent(ctx.state, id, 'position')!);

function doTipo(ctx: SystemContext, q: Quadro, tipo: string, prontos = true): EntityId[] {
  return entitiesWith(ctx.state, 'owner')
    .filter((id) => getComponent(ctx.state, id, 'owner')!.nacao === q.nacao)
    .filter(
      (id) =>
        (getComponent(ctx.state, id, 'unit')?.tipo ??
          getComponent(ctx.state, id, 'structure')?.tipo) === tipo,
    )
    .filter((id) => !prontos || !getComponent(ctx.state, id, 'obra'));
}

/** Pontos em anéis em volta de c, até `ate` m, do mais perto para o mais longe. */
function aneis(ctx: SystemContext, c: Ponto, de: number, ate: number): Vec3[] {
  const R = raioDoMundo(ctx);
  const norte = norteEm(c);
  const pontos: Vec3[] = [];
  for (let r = de; r <= ate; r += PASSO_ANEL_M) {
    for (let k = 0; k < RUMOS; k++) {
      pontos.push(avancar(c, girar(norte, c, (k / RUMOS) * 2 * Math.PI), r / R).p);
    }
  }
  return pontos;
}

/** A terra (célula livre de solo) mais perto de d; d mesmo se não houver. */
function terraDe(ctx: SystemContext, d: Ponto): Ponto {
  const g = navegavel(ctx);
  const c = g ? celulaLivreProxima(g, d) : -1;
  return g && c >= 0 ? centroDoIndice(g.nav, c) : d;
}

/**
 * A e b ligados por terra (sem o mar)? Cada um pela terra mais perto dele (o alvo pode ser um
 * Porto, no líquido). Sem mundo ou sem mar, sempre.
 */
function porTerra(ctx: SystemContext, a: Ponto, b: Ponto): boolean {
  const nav = ctx.mundo?.grades.navegacao;
  return !nav || !nav.liquido || mesmaTerra(nav, terraDe(ctx, a), terraDe(ctx, b));
}

/** Onde pôr o Porto: o ponto de costa válido (PRD-10) mais perto da base, e se a rede alcança. */
function localDoPorto(ctx: SystemContext, q: Quadro): { d: Vec3; rede: boolean } | null {
  const mapa = ctx.mundo!.mapa;
  const pontos = pontosDeBifurcacao(ctx.state, q.nacao, false);
  let semRede: Vec3 | null = null;
  for (const d of aneis(ctx, q.base, 20, param('ia_porto_distancia_m'))) {
    if (!emLiquido(mapa, d) || !terraPerto(mapa, d, param('porto_distancia_borda_m'))) continue;
    // A Impressora da base imprime o Porto da borda da mesma terra.
    if (validarPosicionamento(ctx, 'port', d, q.nacao) !== null) continue;
    if (!terraAoLado(ctx, d, q.base)) continue;
    if (alcancaAlguma(ctx, 'port', d, pontos)) return { d, rede: true };
    semRede ??= d;
  }
  return semRede ? { d: semRede, rede: false } : null;
}

/** A terra livre mais perto de d está na terra de `base` (a Impressora chega à borda)? */
function terraAoLado(ctx: SystemContext, d: Vec3, base: Ponto): boolean {
  const g = navegavel(ctx);
  if (!g) return true;
  const c = celulaLivreProxima(g, d);
  return c >= 0 && mesmaTerra(g.nav, centroDoIndice(g.nav, c), base);
}

/** Porto próprio: constrói um perto da base (IA-14), com Central no caminho se precisar. */
function decidirPorto(ctx: SystemContext, q: Quadro): EntityId | null {
  const portos = doTipo(ctx, q, 'port', false);
  if (portos.length > 0) return doTipo(ctx, q, 'port')[0] ?? null;
  if ((q.naFila['port'] ?? 0) > 0 || !podePagar(ctx.state, q.nacao, 'port')) return null;
  const impressora = impressoraComVaga(ctx, q);
  if (impressora === null) return null;
  const local = localDoPorto(ctx, q);
  if (!local) return null;
  if (!local.rede) {
    plantarCentral(ctx, q, local.d, true);
    return null;
  }
  comandar(ctx, q.nacao, 'posicionar_estrutura', {
    id: impressora,
    tipo: 'port',
    x: local.d[0],
    y: local.d[1],
    z: local.d[2],
  });
  q.naFila['port'] = (q.naFila['port'] ?? 0) + 1;
  return null;
}

/** Mantém `meta` embarcações do tipo, imprimindo no Porto. */
function manter(ctx: SystemContext, q: Quadro, porto: EntityId, tipo: string, meta: number): void {
  const tem = doTipo(ctx, q, tipo).length + (q.naFila[tipo] ?? 0);
  if (tem >= meta || !podePagar(ctx.state, q.nacao, tipo as never)) return;
  const fila = getComponent(ctx.state, porto, 'producer')?.fila.length ?? 0;
  if (fila >= param('ia_fila_por_produtor')) return;
  comandar(ctx, q.nacao, 'imprimir', { ids: [porto], item: tipo });
  q.naFila[tipo] = (q.naFila[tipo] ?? 0) + 1;
}

const ociosa = (ctx: SystemContext, id: EntityId) =>
  getComponent(ctx.state, id, 'order')!.tipo === 'nenhuma' &&
  !getComponent(ctx.state, id, 'locomotion')!.destino;

/** Antena: vai ao ponto de mar ainda não explorado mais perto; Artilharia: defende e patrulha. */
function usarEmbarcacoes(ctx: SystemContext, q: Quadro, porto: EntityId): void {
  const mapa = ctx.mundo!.mapa;
  const R = raioDoMundo(ctx);
  for (const antena of doTipo(ctx, q, 'boat_antenna')) {
    if (!ociosa(ctx, antena)) continue;
    const alvo = aneis(ctx, pos(ctx, antena), 40, Math.min(Math.PI * R, 400)).find(
      (d) => emLiquido(mapa, d) && estadoEm(ctx, q.nacao, d) === ESCURO,
    );
    if (alvo)
      comandar(ctx, q.nacao, 'mover', { ids: [antena], x: alvo[0], y: alvo[1], z: alvo[2] });
  }
  const artilharia = doTipo(ctx, q, 'boat_artillery');
  const perto = q.inimigos.filter(
    (e) => distanciaM(ctx, pos(ctx, e), q.base) <= param('ia_raio_defesa_m'),
  );
  const ameaca = perto[0];
  for (const barco of artilharia) {
    if (ameaca !== undefined) {
      const d = pos(ctx, ameaca);
      comandar(ctx, q.nacao, 'atacar_mover', { ids: [barco], x: d[0], y: d[1], z: d[2] });
    } else if (ociosa(ctx, barco) && distanciaM(ctx, pos(ctx, barco), pos(ctx, porto)) > 30) {
      const d = pos(ctx, porto);
      comandar(ctx, q.nacao, 'mover', { ids: [barco], x: d[0], y: d[1], z: d[2] });
    }
  }
}

/** Esvazia a fila da Impressora: obras canceladas (PRD-14) e itens de impressão (PRD-05). */
function liberarFila(ctx: SystemContext, q: Quadro, impressora: EntityId): void {
  const fila = getComponent(ctx.state, impressora, 'producer')!.fila;
  const obras = fila.map((item) => item.obra).filter((obra): obra is number => obra !== null);
  if (obras.length > 0) comandar(ctx, q.nacao, 'cancelar_obra', { ids: obras });
  for (let k = fila.length - 1; k >= 0; k--) {
    if (fila[k]!.obra === null) {
      comandar(ctx, q.nacao, 'cancelar_impressao', { id: impressora, indice: k });
    }
  }
}

/** Terra da margem do Porto, onde as unidades se reúnem para embarcar. */
function margemDoPorto(ctx: SystemContext, porto: EntityId): Ponto {
  return terraDe(ctx, pos(ctx, porto));
}

/** Rótulo do corpo de líquido mais perto de d (−1 se nenhum). */
function marDe(ctx: SystemContext, d: Ponto): number {
  const agua = navegavelAgua(ctx);
  if (!agua) return -1;
  const c = celulaLivreProxima(agua, d, BUSCA_DE_AGUA_CELULAS);
  return c >= 0 ? rotulosDeAgua(agua.nav)[c]! : -1;
}

/** Transportes próprios vivos no mesmo mar do Porto (e vazios, se pedido). */
function transportesDoMar(
  ctx: SystemContext,
  q: Quadro,
  porto: EntityId,
  vazios = false,
): EntityId[] {
  const mar = marDe(ctx, pos(ctx, porto));
  return doTipo(ctx, q, 'boat_transport')
    .filter((t) => isAlive(ctx.state, t) && marDe(ctx, pos(ctx, t)) === mar)
    .filter(
      (t) => !vazios || (getComponent(ctx.state, t, 'transporte')?.passageiros.length ?? 0) === 0,
    );
}

/** Quantos dos `ids` estão reunidos na margem (a até REUNIAO_M). */
function reunidos(ctx: SystemContext, ids: EntityId[], margem: Ponto): number {
  return ids.filter((id) => distanciaM(ctx, pos(ctx, id), margem) <= REUNIAO_M).length;
}

/**
 * IA-14: a onda cujo alvo não tem caminho por terra (mas dá para o mar do Porto) vai de
 * Transporte: reúne-se na margem do Porto, embarca, navega e desembarca perto do alvo.
 */
function ondaPorMar(ctx: SystemContext, q: Quadro, porto: EntityId | null): void {
  const onda = q.ia.onda;
  if (!onda || onda.membros.length === 0 || porto === null) return;
  const agora = ctx.tick;
  const hz = Math.round(1 / ctx.dt);
  if (!onda.naval) {
    const centro = pos(ctx, onda.membros[0]!);
    if (porTerra(ctx, centro, onda.ponto)) return;
    if (marDe(ctx, onda.ponto) !== marDe(ctx, pos(ctx, porto))) return;
    onda.naval = { fase: 'embarcar', transportes: [], prazo_tick: agora + PRAZO_EMBARQUE_S * hz };
  }
  const naval = onda.naval;
  const capacidade = param('transporte_capacidade');
  const vivos = onda.membros.filter((id) => isAlive(ctx.state, id));
  const margem = margemDoPorto(ctx, porto);
  if (naval.fase === 'embarcar') {
    const precisa = Math.ceil(vivos.length / capacidade);
    const transportes = transportesDoMar(ctx, q, porto, true);
    if (transportes.length < precisa) manter(ctx, q, porto, 'boat_transport', precisa);
    // Reúne-se na margem do Porto (onde os Transportes chegam).
    const [x, y, z] = margem;
    const longe = vivos.filter((id) => distanciaM(ctx, pos(ctx, id), margem) > REUNIAO_M);
    if (longe.length > 0) comandar(ctx, q.nacao, 'mover', { ids: longe, x, y, z });
    const prontos = transportes.length >= precisa && reunidos(ctx, vivos, margem) >= vivos.length;
    if (!prontos && agora < naval.prazo_tick) return;
    const usados = transportes.slice(0, precisa);
    if (usados.length === 0) {
      delete onda.naval;
      return;
    }
    usados.forEach((t, k) => {
      const grupo = vivos.slice(k * capacidade, (k + 1) * capacidade);
      if (grupo.length > 0) comandar(ctx, q.nacao, 'embarcar', { ids: grupo, transporte: t });
    });
    naval.transportes = usados;
    naval.fase = 'aguardar';
    naval.prazo_tick = agora + PRAZO_EMBARQUE_S * hz;
    return;
  }
  if (naval.fase === 'aguardar') {
    const todos = vivos.every((id) => getComponent(ctx.state, id, 'embarcado'));
    if (!todos && agora < naval.prazo_tick) return;
    for (const t of naval.transportes.filter((id) => isAlive(ctx.state, id))) {
      const [x, y, z] = onda.ponto;
      comandar(ctx, q.nacao, 'desembarcar', { id: t, x, y, z });
    }
    naval.fase = 'navegar';
    naval.prazo_tick = agora + PRAZO_EXPEDICAO_S * hz;
    return;
  }
  // Navegando: acabou quando ninguém mais está embarcado (ou o prazo venceu).
  const aBordo = naval.transportes.some(
    (t) => (getComponent(ctx.state, t, 'transporte')?.passageiros.length ?? 0) > 0,
  );
  if (!aBordo || agora > naval.prazo_tick) delete onda.naval;
}

/**
 * IA-07/IA-14: jazida explorada numa ilha (sem caminho por terra, mas no mar do Porto) para uma
 * expansão por mar.
 */
function alvoNaIlha(ctx: SystemContext, q: Quadro, porto: EntityId): Ponto | null {
  const mar = marDe(ctx, pos(ctx, porto));
  const candidatas = entitiesWith(ctx.state, 'jazida', 'position')
    .map((id) => pos(ctx, id))
    .filter((d) => estadoEm(ctx, q.nacao, d) !== ESCURO)
    .filter((d) => !porTerra(ctx, q.base, d))
    .filter((d) =>
      entitiesWith(ctx.state, 'structure', 'owner').every(
        (s) => distanciaM(ctx, pos(ctx, s), d) > param('ia_distancia_expansao_m'),
      ),
    )
    .sort((a, b) => distanciaM(ctx, a, q.base) - distanciaM(ctx, b, q.base))
    .filter((d) => marDe(ctx, d) === mar);
  return candidatas[0] ?? null;
}

/** IA-14: expansão por mar, fase a fase. */
function expansaoPorMar(ctx: SystemContext, q: Quadro, porto: EntityId | null): void {
  const agora = ctx.tick;
  const hz = Math.round(1 / ctx.dt);
  let e = q.ia.expansaoNaval ?? null;
  if (!e) {
    if (porto === null || q.ia.onda) return;
    // Só quando a economia já quer expandir e não há expansão por terra à vista.
    if (q.hovers.length < 4) return;
    const alvo = alvoNaIlha(ctx, q, porto);
    const custo = ['solar_plant', 'storage'] as const;
    if (!alvo || !custo.every((c) => podePagar(ctx.state, q.nacao, c))) return;
    // Uma das Impressoras (a outra continua na base); a fila dela fica para as outras.
    if (q.impressoras.length < 2) return;
    const impressora = impressoraComVaga(ctx, q);
    if (impressora === null) return;
    liberarFila(ctx, q, impressora);
    e = q.ia.expansaoNaval = {
      alvo,
      impressora,
      transporte: null,
      fase: 'transporte',
      prazo_tick: agora + PRAZO_EXPEDICAO_S * hz,
    };
  }
  const fim = () => {
    q.ia.expansaoNaval = null;
  };
  if (!isAlive(ctx.state, e.impressora) || agora > e.prazo_tick) return fim();
  const renovar = () => (e!.prazo_tick = agora + PRAZO_EXPEDICAO_S * hz);
  switch (e.fase) {
    case 'transporte': {
      if (porto === null) return fim();
      // A Impressora vai à margem do Porto; o Transporte (do mar do Porto) a espera lá.
      const margem = margemDoPorto(ctx, porto);
      if (
        distanciaM(ctx, pos(ctx, e.impressora), margem) > REUNIAO_M &&
        ociosa(ctx, e.impressora)
      ) {
        const [x, y, z] = margem;
        comandar(ctx, q.nacao, 'mover', { ids: [e.impressora], x, y, z });
      }
      // Na ilha não há onde recarregar: parte com a bateria quase cheia.
      const bateria = getComponent(ctx.state, e.impressora, 'bateria')!;
      const recarga = getComponent(ctx.state, e.impressora, 'recarga')!;
      if (bateria.en < BATERIA_DA_EXPEDICAO * bateria.max) {
        if (recarga.estado === 'nenhuma') {
          comandar(ctx, q.nacao, 'recarregar', { ids: [e.impressora] });
        }
        renovar();
        return;
      }
      if (recarga.estado !== 'nenhuma') return;
      const livre = transportesDoMar(ctx, q, porto, true)[0];
      if (livre === undefined) {
        manter(ctx, q, porto, 'boat_transport', 1);
        return;
      }
      if (reunidos(ctx, [e.impressora], margem) === 0) return;
      e.transporte = livre;
      comandar(ctx, q.nacao, 'embarcar', { ids: [e.impressora], transporte: livre });
      e.fase = 'embarcar';
      renovar();
      return;
    }
    case 'embarcar': {
      if (e.transporte === null || !isAlive(ctx.state, e.transporte)) return fim();
      if (!getComponent(ctx.state, e.impressora, 'embarcado')) return;
      const [x, y, z] = e.alvo;
      comandar(ctx, q.nacao, 'desembarcar', { id: e.transporte, x, y, z });
      e.fase = 'navegar';
      renovar();
      return;
    }
    case 'navegar': {
      if (getComponent(ctx.state, e.impressora, 'embarcado')) return;
      // Na ilha: para onde desceu e começa a obra.
      comandar(ctx, q.nacao, 'parar', { ids: [e.impressora] });
      e.fase = 'construir';
      renovar();
      return;
    }
    case 'construir': {
      // Na ilha: primeiro a Usina Solar, depois o Armazém, e o cabo entre os dois.
      const naIlha = (tipo: string) =>
        doTipo(ctx, q, tipo, false).filter((id) => distanciaM(ctx, pos(ctx, id), e!.alvo) < 60);
      const solares = naIlha('solar_plant');
      const armazens = naIlha('storage');
      const itens = getComponent(ctx.state, e.impressora, 'producer')!.fila;
      // Obra de fora da ilha (ficou na base) não se alcança: sai da fila.
      const deFora = itens.some(
        (item) =>
          item.obra === null ||
          !isAlive(ctx.state, item.obra) ||
          distanciaM(ctx, pos(ctx, item.obra), e!.alvo) > 60,
      );
      if (deFora) {
        liberarFila(ctx, q, e.impressora);
        return;
      }
      const fila = itens.length;
      // Obra em andamento: o prazo acompanha o progresso.
      if (fila > 0) {
        renovar();
        return;
      }
      const erguer = (tipo: 'solar_plant' | 'storage') => {
        const d = procurarLocal(
          ctx,
          q.nacao,
          tipo,
          e!.alvo,
          null,
          [10, 14, 18, 22, 26],
          null,
          e!.alvo,
        );
        if (!d) return fim();
        comandar(ctx, q.nacao, 'posicionar_estrutura', {
          id: e!.impressora,
          tipo,
          x: d[0],
          y: d[1],
          z: d[2],
        });
        renovar();
      };
      if (solares.length === 0) return erguer('solar_plant');
      if (armazens.length === 0) return erguer('storage');
      const [solar, armazem] = [solares[0]!, armazens[0]!];
      if (getComponent(ctx.state, solar, 'obra') || getComponent(ctx.state, armazem, 'obra'))
        return;
      comandar(ctx, q.nacao, 'ligar_cabo', { de: armazem, para: solar });
      return fim();
    }
  }
}

export function decidirNaval(ctx: SystemContext, q: Quadro): void {
  if (!ctx.mundo?.mapa.mar) return;
  const porto = decidirPorto(ctx, q);
  if (porto !== null) {
    manter(ctx, q, porto, 'boat_artillery', param('ia_barcos_artilharia'));
    manter(ctx, q, porto, 'boat_antenna', param('ia_barcos_antena'));
    usarEmbarcacoes(ctx, q, porto);
  }
  ondaPorMar(ctx, q, porto);
  expansaoPorMar(ctx, q, porto);
}
