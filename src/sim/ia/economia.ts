/**
 * Economia e Energia da IA (IA-01, IA-07, §13.2): meta de hovers, Impressoras, expansões com
 * Armazém e usinas antes do déficit (`ia_margem_energia_pct`).
 */
import { entitiesWith, getComponent } from '../core/entities';
import type { SystemContext } from '../core/pipeline';
import type { EntityId } from '../core/types';
import { type CustosId, dados, type EstruturasId, param, type RecursosId } from '../data';
import { jazidasElegiveis } from '../economia/diretiva';
import { pontosDeEntrega } from '../economia/estoque';
import { leituraDaRede } from '../energia/rede';
import { custoDe } from '../producao/custos';
import { direcaoDe, distanciaM } from '../units/superficie';
import { explorado } from '../visao/nevoa';
import { comandar, dificuldade, podePagar, temTraco, tierPermitido } from './base';
import { procurarLocal } from './local';
import { metaDeHovers, type Quadro } from './quadro';

const RECURSOS: RecursosId[] = dados.recursos.map((r) => r.id);

function filaDe(ctx: SystemContext, id: EntityId): number {
  return getComponent(ctx.state, id, 'producer')!.fila.length;
}

/** Impressora com vaga na fila (a de fila mais curta). */
export function impressoraComVaga(ctx: SystemContext, q: Quadro): EntityId | null {
  const livres = q.impressoras
    .filter((id) => filaDe(ctx, id) < param('ia_fila_por_produtor'))
    .sort((a, b) => filaDe(ctx, a) - filaDe(ctx, b) || a - b);
  return livres[0] ?? null;
}

/** Estruturas do tipo da nação (prontas ou em obra). */
export function contarEstruturas(ctx: SystemContext, q: Quadro, tipo: EstruturasId): number {
  const existentes = entitiesWith(ctx.state, 'structure', 'owner').filter(
    (id) =>
      getComponent(ctx.state, id, 'owner')!.nacao === q.nacao &&
      getComponent(ctx.state, id, 'structure')!.tipo === tipo,
  ).length;
  return existentes;
}

/** Manda uma Impressora posicionar a estrutura perto de `centro`. */
export function construir(
  ctx: SystemContext,
  q: Quadro,
  tipo: EstruturasId,
  centro = q.base,
  aneis?: readonly number[],
): boolean {
  if (
    !tierPermitido(q.nivel, tipo as CustosId) ||
    !podePagar(ctx.state, q.nacao, tipo as CustosId)
  ) {
    return false;
  }
  const impressora = impressoraComVaga(ctx, q);
  if (impressora === null) return false;
  const d = procurarLocal(ctx, q.nacao, tipo, centro, q.ia.onda?.ponto ?? null, aneis);
  if (!d) return false;
  comandar(ctx, q.nacao, 'posicionar_estrutura', {
    id: impressora,
    tipo,
    x: d[0],
    y: d[1],
    z: d[2],
  });
  q.naFila[tipo] = (q.naFila[tipo] ?? 0) + 1;
  return true;
}

function imprimir(ctx: SystemContext, q: Quadro, produtor: EntityId, item: CustosId): boolean {
  if (!podePagar(ctx.state, q.nacao, item)) return false;
  comandar(ctx, q.nacao, 'imprimir', { ids: [produtor], item });
  q.naFila[item] = (q.naFila[item] ?? 0) + 1;
  return true;
}

/** Nave: Impressoras até `ia_impressoras_alvo` (depois de 2 hovers) e hovers até a meta. */
function decidirNave(ctx: SystemContext, q: Quadro): void {
  const meta = metaDeHovers(q);
  for (const nave of q.naves) {
    if (filaDe(ctx, nave) >= param('ia_fila_por_produtor')) continue;
    const impressoras = q.impressoras.length + (q.naFila['printer'] ?? 0);
    const hovers = q.hovers.length + (q.naFila['hover_explorer'] ?? 0);
    if (impressoras < param('ia_impressoras_alvo') && q.hovers.length >= 2) {
      if (imprimir(ctx, q, nave, 'printer')) continue;
    }
    if (hovers < meta) imprimir(ctx, q, nave, 'hover_explorer');
  }
}

/** Energia: geração ≥ consumo médio × (1 + `ia_margem_energia_pct`%), com uma usina por vez. */
function decidirEnergia(ctx: SystemContext, q: Quadro): void {
  const leitura = leituraDaRede(ctx.state, q.nacao);
  const alvo = leitura.consumo * (1 + param('ia_margem_energia_pct') / 100);
  const emObra = entitiesWith(ctx.state, 'obra', 'structure', 'owner').some((id) => {
    if (getComponent(ctx.state, id, 'owner')!.nacao !== q.nacao) return false;
    const tipo = getComponent(ctx.state, id, 'structure')!.tipo;
    return tipo === 'solar_plant' || tipo === 'nuclear_plant';
  });
  if (emObra || (q.naFila['solar_plant'] ?? 0) + (q.naFila['nuclear_plant'] ?? 0) > 0) return;
  // "Nuclear cedo" (§13.3): a primeira usina já é nuclear, se o tier e o Urânio deixarem.
  const nuclearCedo = temTraco(q.nacao, 'nuclear cedo');
  const primeiraNuclear = nuclearCedo && contarEstruturas(ctx, q, 'nuclear_plant') === 0;
  // Com o banco vazio o consumo medido encosta na geração: o vermelho (ENE-22) pega o déficit.
  const deficit = leitura.geracao < alvo || leitura.indicador === 'vermelho';
  if (!deficit && !primeiraNuclear) return;
  const u = ctx.state.estoques[q.nacao]!.u;
  const temUranio = u >= custoDe('nuclear_plant').u + param('nuclear_consumo_u');
  if (temUranio && tierPermitido(q.nivel, 'nuclear_plant') && construir(ctx, q, 'nuclear_plant'))
    return;
  if (deficit) construir(ctx, q, 'solar_plant');
}

/**
 * Expansão (IA-07): Armazém junto à jazida explorada mais próxima que esteja a mais de
 * `ia_distancia_expansao_m` dos depósitos, até `expansoes_max`.
 */
function decidirExpansao(ctx: SystemContext, q: Quadro, extras: CustosId[]): void {
  const expansoes = contarEstruturas(ctx, q, 'storage') + (q.naFila['storage'] ?? 0);
  if (expansoes >= dificuldade(q.nivel, 'expansoes_max')) return;
  // IA-08: um recurso que as próximas compras pedem e que não tem jazida elegível (fora do
  // alcance dos depósitos) puxa a expansão para uma jazida dele, sem esperar a meta de hovers.
  const estoque = ctx.state.estoques[q.nacao]!;
  const falta = extras
    .flatMap((item) => RECURSOS.filter((r) => custoDe(item)[r] > estoque[r]))
    .find((r) => !q.acessiveis.has(r));
  const pct = param(
    temTraco(q.nacao, 'expande cedo') ? 'ia_expansao_cedo_pct' : 'ia_expansao_hovers_pct',
  );
  if (!falta && q.hovers.length < (metaDeHovers(q) * pct) / 100) return;
  const entregas = pontosDeEntrega(ctx, q.nacao);
  const candidatas = entitiesWith(ctx.state, 'jazida', 'position')
    .filter((id) => !falta || getComponent(ctx.state, id, 'jazida')!.recurso === falta)
    .map((id) => direcaoDe(getComponent(ctx.state, id, 'position')!))
    .filter((d) => explorado(ctx, q.nacao, d))
    .filter((d) =>
      entregas.every((e) => distanciaM(ctx, d, e.d) > param('ia_distancia_expansao_m')),
    )
    .sort((a, b) => distanciaM(ctx, a, q.base) - distanciaM(ctx, b, q.base));
  const alvo = candidatas[0];
  if (alvo) construir(ctx, q, 'storage', alvo, [10, 13, 16, 20]);
}

/** O que a IA quer comprar em seguida (para saber que recurso falta). */
function proximasCompras(q: Quadro): CustosId[] {
  const compras: CustosId[] = [];
  if (q.hovers.length < metaDeHovers(q)) compras.push('hover_explorer');
  if (q.impressoras.length < param('ia_impressoras_alvo')) compras.push('printer');
  return compras;
}

/**
 * Diretiva de coleta da IA (IA-01): se falta um recurso para as próximas compras e nenhum hover
 * o minera, um hover do recurso com mais hovers passa para a jazida elegível mais próxima dele
 * (o mesmo Comando de coletar do jogador). Um remanejamento por decisão.
 */
function remanejarColeta(ctx: SystemContext, q: Quadro, extras: CustosId[]): void {
  const { state } = ctx;
  const estoque = state.estoques[q.nacao]!;
  const compras = [...proximasCompras(q), ...extras];
  const porRecurso = new Map<RecursosId, EntityId[]>();
  for (const h of q.hovers) {
    const r = getComponent(state, h, 'coleta')!.recurso;
    if (!r) continue;
    porRecurso.set(r, [...(porRecurso.get(r) ?? []), h]);
  }
  const elegiveis = jazidasElegiveis(ctx, q.nacao);
  for (const item of compras) {
    const custo = custoDe(item);
    const falta = RECURSOS.find(
      (r) => custo[r] > estoque[r] && (porRecurso.get(r)?.length ?? 0) === 0,
    );
    if (!falta) continue;
    const jazidas = elegiveis.filter((j) => getComponent(state, j, 'jazida')!.recurso === falta);
    if (jazidas.length === 0) continue;
    const doador = [...porRecurso.entries()]
      .filter(([r]) => custo[r] <= estoque[r])
      .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))[0];
    if (!doador || doador[1].length === 0) continue;
    const hover = doador[1][doador[1].length - 1]!;
    const dh = direcaoDe(getComponent(state, hover, 'position')!);
    const jazida = jazidas.sort(
      (a, b) =>
        distanciaM(ctx, dh, direcaoDe(getComponent(state, a, 'position')!)) -
          distanciaM(ctx, dh, direcaoDe(getComponent(state, b, 'position')!)) || a - b,
    )[0]!;
    comandar(ctx, q.nacao, 'coletar', { ids: [hover], jazida });
    return;
  }
}

export function decidirEconomia(ctx: SystemContext, q: Quadro, extras: CustosId[] = []): void {
  remanejarColeta(ctx, q, extras);
  decidirNave(ctx, q);
  decidirEnergia(ctx, q);
  decidirExpansao(ctx, q, extras);
}
