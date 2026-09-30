/**
 * Produção e composição da IA (IA-01, IA-03, IA-06, §13.3): a Impressora imprime a categoria
 * militar mais abaixo do peso da personalidade (em % do VR militar). Pesos de tiers bloqueados
 * vão, proporcionalmente, para os permitidos. Com `adapta_composicao`, o exército inimigo
 * observado desloca peso para os contras.
 */
import { getComponent } from '../core/entities';
import type { SystemContext } from '../core/pipeline';
import { type CustosId, dados } from '../data';
import { custoDe } from '../producao/custos';
import {
  comandar,
  dificuldade,
  liberadoPara,
  personalidade,
  podePagar,
  tierMilitar,
  tipoDe,
  vrDe,
} from './base';
import { arsenalComVaga, construir, hangarComVaga, impressoraComVaga } from './economia';
import type { Quadro } from './quadro';

/** Categorias de §13.3 e o item de cada uma. */
export const CATEGORIAS = {
  ex1: 'hover_ex1',
  opq: 'hover_opq',
  siege: 'siege_tank',
  minas: 'hover_minelayer',
  obs: 'hover_scout',
  bomb: 'drone_bomber',
  dlaser: 'drone_laser',
  kamikaze: 'drone_kamikaze',
  torres: 'laser_tower',
} as const satisfies Record<string, CustosId>;

export type Categoria = keyof typeof CATEGORIAS;
const LISTA = Object.keys(CATEGORIAS) as Categoria[];

/** IA-15 (D-91): categorias que o Hangar fabrica, não a Impressora. */
const DO_HANGAR = new Set<Categoria>(['bomb', 'dlaser', 'kamikaze']);

/** IA-16 (D-92): categorias que a Fábrica de Artilharia fabrica, não a Impressora. */
const DO_ARSENAL = new Set<Categoria>(['ex1', 'opq', 'siege']);

/** IA-03: quem cada ameaça observada favorece. */
const CONTRAS: Record<string, Categoria[]> = {
  drone_laser: ['ex1', 'torres'],
  drone_bomber: ['ex1', 'torres'],
  drone_kamikaze: ['ex1', 'torres'],
  hover_ex1: ['opq'],
  hover_opq: ['dlaser', 'bomb', 'kamikaze'],
  siege_tank: ['opq', 'torres'],
  laser_tower: ['opq', 'bomb', 'kamikaze', 'siege'],
};

/** Dá para juntar o custo do item: cada recurso em falta tem de onde vir. */
function temFonte(q: Quadro, estoque: Record<string, number> | null, item: CustosId): boolean {
  if (!estoque) return true;
  const custo = custoDe(item);
  return dados.recursos.every((r) => custo[r.id] <= (estoque[r.id] ?? 0) || q.acessiveis.has(r.id));
}

/** Pesos da personalidade, redistribuídos pelos tiers e adaptados ao observado (IA-03). */
export function pesos(
  q: Quadro,
  estoque: Record<string, number> | null = null,
): Record<Categoria, number> {
  const base = personalidade(q.nacao);
  const resultado = Object.fromEntries(LISTA.map((c) => [c, base ? base[c] : 0])) as Record<
    Categoria,
    number
  >;
  const total = LISTA.reduce((s, c) => s + resultado[c], 0);
  // IA-06: pesos de tiers bloqueados redistribuídos proporcionalmente entre os permitidos. Do
  // mesmo jeito, a categoria que depende de um recurso sem fonte (nem estoque, nem jazida
  // elegível) espera, e o peso dela vai para as outras.
  const bloqueadas = LISTA.filter(
    (c) =>
      !tierMilitar(q.nivel, CATEGORIAS[c]) ||
      !liberadoPara(q, CATEGORIAS[c]) ||
      !temFonte(q, estoque, CATEGORIAS[c]),
  );
  const bloqueado = bloqueadas.reduce((s, c) => s + resultado[c], 0);
  for (const c of bloqueadas) resultado[c] = 0;
  const livre = total - bloqueado;
  if (livre > 0) for (const c of LISTA) resultado[c] += (resultado[c] / livre) * bloqueado;
  // IA-03: cada ameaça desloca para os contras uma parte do peso proporcional à fração dela.
  if (dificuldade(q.nivel, 'adapta_composicao') === 1) {
    const observado = q.ia.observado;
    const vrObservado = Object.values(observado).reduce((s, v) => s + v, 0);
    if (vrObservado > 0) {
      for (const [tipo, vr] of Object.entries(observado)) {
        const contras = (CONTRAS[tipo] ?? []).filter((c) => !bloqueadas.includes(c));
        if (contras.length === 0) continue;
        const parte = (total * vr) / vrObservado;
        for (const c of contras) resultado[c] += parte / contras.length;
      }
    }
  }
  return resultado;
}

/** VR por categoria do que a nação tem e do que está na fila. */
function vrAtual(ctx: SystemContext, q: Quadro): Record<Categoria, number> {
  const atual = Object.fromEntries(LISTA.map((c) => [c, 0])) as Record<Categoria, number>;
  const porItem = new Map(LISTA.map((c) => [CATEGORIAS[c] as string, c]));
  for (const id of ctx.state.entities) {
    if (getComponent(ctx.state, id, 'owner')?.nacao !== q.nacao) continue;
    const categoria = porItem.get(tipoDe(ctx.state, id) ?? '');
    if (categoria) atual[categoria] += custoDe(CATEGORIAS[categoria]).vr;
  }
  for (const [item, n] of Object.entries(q.naFila)) {
    const categoria = porItem.get(item);
    if (categoria) atual[categoria] += n * custoDe(CATEGORIAS[categoria]).vr;
  }
  return atual;
}

/** Categorias da mais para a menos atrasada em relação ao peso. */
export function prioridades(ctx: SystemContext, q: Quadro): Categoria[] {
  const w = pesos(q, ctx.state.estoques[q.nacao]!);
  const soma = LISTA.reduce((s, c) => s + w[c], 0);
  if (soma <= 0) return [];
  const atual = vrAtual(ctx, q);
  const total = LISTA.reduce((s, c) => s + atual[c], 0);
  const deficit = (c: Categoria) => (w[c] / soma) * (total + custoDe(CATEGORIAS[c]).vr) - atual[c];
  return LISTA.filter((c) => w[c] > 0 && deficit(c) > 0).sort(
    (a, b) => deficit(b) - deficit(a) || LISTA.indexOf(a) - LISTA.indexOf(b),
  );
}

/**
 * Uma ordem de produção militar por decisão: a categoria abaixo do peso mais atrasada que dá
 * para pagar. Em racionamento (ENE-04), a energia vai primeiro para as usinas.
 */
export function decidirProducao(ctx: SystemContext, q: Quadro): void {
  if (ctx.state.energia[q.nacao]!.racionamento) return;
  // IA-06 (D-66): teto de VR do exército (as filas contam).
  const teto = dificuldade(q.nivel, 'vr_exercito_max');
  if (teto > 0) {
    const naFila = LISTA.reduce(
      (s, c) => s + (q.naFila[CATEGORIAS[c]] ?? 0) * custoDe(CATEGORIAS[c]).vr,
      0,
    );
    if (vrDe(ctx.state, q.exercito) + naFila >= teto) return;
  }
  for (const categoria of prioridades(ctx, q)) {
    const item = CATEGORIAS[categoria];
    if (!podePagar(ctx.state, q.nacao, item)) continue;
    if (categoria === 'torres') {
      if (construir(ctx, q, 'laser_tower')) return;
      continue;
    }
    // IA-15 (D-91): os drones saem do Hangar, não da Impressora. Sem Hangar com vaga, essa
    // categoria espera a próxima decisão sem travar as demais.
    if (DO_HANGAR.has(categoria)) {
      const hangar = hangarComVaga(ctx, q);
      if (hangar === null) continue;
      comandar(ctx, q.nacao, 'imprimir', { ids: [hangar], item });
      q.naFila[item] = (q.naFila[item] ?? 0) + 1;
      return;
    }
    // IA-16 (D-92): EX1, OPQ e o Tanque de Cerco saem da Fábrica de Artilharia, não da
    // Impressora. Sem Fábrica com vaga, essa categoria espera a próxima decisão sem travar as
    // demais.
    if (DO_ARSENAL.has(categoria)) {
      const arsenal = arsenalComVaga(ctx, q);
      if (arsenal === null) continue;
      comandar(ctx, q.nacao, 'imprimir', { ids: [arsenal], item });
      q.naFila[item] = (q.naFila[item] ?? 0) + 1;
      return;
    }
    const impressora = impressoraComVaga(ctx, q);
    if (impressora === null) return;
    comandar(ctx, q.nacao, 'imprimir', { ids: [impressora], item });
    q.naFila[item] = (q.naFila[item] ?? 0) + 1;
    return;
  }
}

/** IA-03: guarda o VR do exército inimigo visto agora (o último avistamento de cada tipo). */
export function observar(ctx: SystemContext, q: Quadro): void {
  const agora: Record<string, number> = {};
  for (const id of q.inimigos) {
    if (!getComponent(ctx.state, id, 'unit') && !getComponent(ctx.state, id, 'structure')) continue;
    const tipo = tipoDe(ctx.state, id)!;
    if (!CONTRAS[tipo]) continue;
    agora[tipo] = (agora[tipo] ?? 0) + (dados.custos.find((c) => c.id === tipo)?.vr ?? 0);
  }
  for (const [tipo, vr] of Object.entries(agora)) q.ia.observado[tipo] = vr;
}
