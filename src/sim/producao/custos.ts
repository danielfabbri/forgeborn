/**
 * Custos e pagamento (PRD-01, PRD-04, PRD-05): matriz de produção, pagamento por inteiro ao
 * enfileirar ou posicionar, AL-06 com o que falta e reembolso ao cancelar.
 */
import type { SystemContext } from '../core/pipeline';
import type { EntityId, NacaoId } from '../core/types';
import { getComponent } from '../core/entities';
import { type CustosId, type CustosRow, dados, param, type RecursosId } from '../data';

const custos = new Map(dados.custos.map((linha) => [linha.id, linha]));
const RECURSOS = dados.recursos.map((r) => r.id);

export function custoDe(item: CustosId): CustosRow {
  const linha = custos.get(item);
  if (!linha) throw new Error(`Item desconhecido: ${item}`);
  return linha;
}

export function ehItem(item: unknown): item is CustosId {
  return typeof item === 'string' && custos.has(item as CustosId);
}

/** Tipo do produtor (`ship` ou `printer`), ou null. */
export function tipoDoProdutor(ctx: SystemContext, id: EntityId): string | null {
  if (!getComponent(ctx.state, id, 'producer')) return null;
  return (
    getComponent(ctx.state, id, 'structure')?.tipo ??
    getComponent(ctx.state, id, 'unit')?.tipo ??
    null
  );
}

/** PRD-01: o produtor pode fazer o item? */
export function produz(tipoProdutor: string, item: CustosId): boolean {
  return custoDe(item).produzido_por.includes(tipoProdutor);
}

/** PRD-04: paga o item por inteiro; sem recursos, recusa e emite AL-06 com o que falta. */
export function pagar(
  ctx: SystemContext,
  nacao: NacaoId,
  item: CustosId,
): Partial<Record<RecursosId, number>> | null {
  const estoque = ctx.state.estoques[nacao]!;
  const custo = custoDe(item);
  const faltam: Partial<Record<RecursosId, number>> = {};
  for (const r of RECURSOS) {
    if (estoque[r] < custo[r] - 1e-9) faltam[r] = custo[r] - estoque[r];
  }
  if (Object.keys(faltam).length > 0) {
    ctx.emit('alerta', { id: 'AL-06', nacao, faltam });
    return null;
  }
  const pago: Partial<Record<RecursosId, number>> = {};
  for (const r of RECURSOS) {
    if (custo[r] <= 0) continue;
    estoque[r] -= custo[r];
    pago[r] = custo[r];
  }
  return pago;
}

/** PRD-05: devolve `reembolso_cancelamento_pct`% do que foi pago. */
export function reembolsar(
  ctx: SystemContext,
  nacao: NacaoId,
  pago: Partial<Record<RecursosId, number>>,
): void {
  const estoque = ctx.state.estoques[nacao]!;
  const pct = param('reembolso_cancelamento_pct') / 100;
  for (const r of RECURSOS) estoque[r] += (pago[r] ?? 0) * pct;
}
