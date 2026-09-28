/**
 * IA-11 (D-81): avisada por outra nação (REG-26), a IA recolhe à base as unidades que estão no
 * domínio dela, antes do prazo. Ela usa o começo do prazo (o batedor olha a base alheia) e recua
 * com folga para sair. A Brutal fica; a onda de provocação (IA-12) também.
 */
import { entitiesWith, getComponent } from '../core/entities';
import type { SystemContext } from '../core/pipeline';
import type { EntityId } from '../core/types';
import { consultaDeDominio, emGuerra, prazoDoAviso } from '../relacoes/temperamento';
import { direcaoDe } from '../units/superficie';
import { comandar } from './base';
import type { Quadro } from './quadro';
import { param } from '../data';

/** Recua quando resta esta fração do prazo (o resto é para sair do domínio). */
const FRACAO_PARA_RECUAR = 0.7;

export function obedecerAvisos(ctx: SystemContext, q: Quadro): void {
  if (q.nivel === 'brutal') return;
  const { state } = ctx;
  const avisantes = state.nacoes.filter((n) => {
    const prazo = n !== q.nacao ? prazoDoAviso(state, n, q.nacao) : null;
    return prazo !== null && prazo <= param('ultimato_s') * FRACAO_PARA_RECUAR;
  });
  if (avisantes.length === 0) return;
  const onda = q.ia.onda;
  // IA-12: a onda que provoca o alvo não recua do domínio dele.
  const provoca = onda && !emGuerra(state, q.nacao, onda.alvo) ? onda : null;
  const donos = consultaDeDominio(ctx);
  const recolher: EntityId[] = [];
  for (const id of entitiesWith(state, 'unit', 'owner', 'position')) {
    if (getComponent(state, id, 'owner')!.nacao !== q.nacao) continue;
    const aqui = donos(direcaoDe(getComponent(state, id, 'position')!), q.nacao).filter((n) =>
      avisantes.includes(n),
    );
    if (aqui.length === 0) continue;
    if (provoca && aqui.every((n) => n === provoca.alvo) && provoca.membros.includes(id)) continue;
    recolher.push(id);
  }
  if (recolher.length === 0) return;
  comandar(ctx, q.nacao, 'mover', { ids: recolher, x: q.base[0], y: q.base[1], z: q.base[2] });
}
