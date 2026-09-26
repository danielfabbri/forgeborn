/**
 * Base da IA (IA-01, IA-02): dificuldade (§13.2), personalidade (§13.3), percepção pela própria
 * névoa e o canal de Comandos — a IA só age enfileirando os mesmos Comandos do jogador para o
 * próximo tick (TEC-07).
 */
import type { Ponto } from '../core/components';
import { entitiesWith, getComponent } from '../core/entities';
import type { SystemContext } from '../core/pipeline';
import type { EstadoDaIa, SimState } from '../core/state';
import type { EntityId, JsonValue, NacaoId } from '../core/types';
import {
  type CustosId,
  dados,
  type DificuldadeParametro,
  type PersonalidadesRow,
  type RecursosId,
} from '../data';
import { custoDe } from '../producao/custos';
import { direcaoDe, distanciaM } from '../units/superficie';
import { estadoEm, VISIVEL, visivelPara } from '../visao/nevoa';

export type Nivel = EstadoDaIa['nivel'];

export function niveis(): Nivel[] {
  const linha = dados.dificuldade[0]!;
  return Object.keys(linha).filter((k) => k !== 'parametro') as Nivel[];
}

/** Valor da dificuldade (§13.2). */
export function dificuldade(nivel: Nivel, parametro: DificuldadeParametro): number {
  return dados.dificuldade.find((l) => l.parametro === parametro)![nivel];
}

/** Bônus de coleta ou impressão da nação (0 se não é IA). */
export function bonusDaNacao(
  state: SimState,
  nacao: NacaoId,
  parametro: 'bonus_coleta_pct' | 'bonus_impressao_pct',
): number {
  const ia = state.ias[nacao];
  return ia ? dificuldade(ia.nivel, parametro) / 100 : 0;
}

export function personalidade(nacao: NacaoId): PersonalidadesRow | undefined {
  return dados.personalidades.find((p) => p.nacao === nacao);
}

/** A personalidade tem o traço (texto de §13.3)? */
export function temTraco(nacao: NacaoId, traco: string): boolean {
  return personalidade(nacao)?.tracos.toLowerCase().includes(traco.toLowerCase()) ?? false;
}

/** Enfileira um Comando da IA para o próximo tick (TEC-07). */
export function comandar(
  ctx: SystemContext,
  nacao: NacaoId,
  tipo: string,
  dadosDoComando: Record<string, unknown>,
): void {
  const { state } = ctx;
  state.commandQueue.push({
    tick: ctx.tick + 1,
    nacao,
    tipo,
    dados: JSON.parse(JSON.stringify(dadosDoComando)) as JsonValue,
    seq: state.nextCommandSeq++,
  });
}

const RECURSOS: RecursosId[] = dados.recursos.map((r) => r.id);

export function podePagar(state: SimState, nacao: NacaoId, item: CustosId): boolean {
  const custo = custoDe(item);
  const estoque = state.estoques[nacao]!;
  return RECURSOS.every((r) => estoque[r] >= custo[r]);
}

/** Tier do item (§8.1): T2 exige Ti; T3 exige U. */
export function tierDe(item: CustosId): number {
  const custo = custoDe(item);
  return custo.u > 0 ? 3 : custo.ti > 0 ? 2 : 1;
}

/** IA-06: o item cabe nos tiers da dificuldade? */
export function tierPermitido(nivel: Nivel, item: CustosId): boolean {
  return tierDe(item) <= dificuldade(nivel, 'tiers_permitidos');
}

/** IA-06 (D-66): tier das unidades de combate (composição militar). */
export function tierMilitar(nivel: Nivel, item: CustosId): boolean {
  return tierDe(item) <= dificuldade(nivel, 'tiers_militares');
}

export function tipoDe(state: SimState, id: EntityId): string | null {
  return (
    getComponent(state, id, 'unit')?.tipo ?? getComponent(state, id, 'structure')?.tipo ?? null
  );
}

/** Corpos próprios da nação (IDs em ordem). */
export function proprios(state: SimState, nacao: NacaoId): EntityId[] {
  return entitiesWith(state, 'owner').filter(
    (id) => getComponent(state, id, 'owner')!.nacao === nacao,
  );
}

export function dosTipos(state: SimState, nacao: NacaoId, ...tipos: string[]): EntityId[] {
  return proprios(state, nacao).filter((id) => {
    const tipo = tipoDe(state, id);
    return tipo !== null && tipos.includes(tipo) && !getComponent(state, id, 'obra');
  });
}

/** VR de uma lista de corpos (`dados:custos`). */
export function vrDe(state: SimState, ids: readonly EntityId[]): number {
  return ids.reduce((s, id) => {
    const tipo = tipoDe(state, id);
    return s + (dados.custos.find((c) => c.id === tipo)?.vr ?? 0);
  }, 0);
}

/**
 * IA-02: inimigos que a nação vê agora (pela própria névoa). Minas e corpos em
 * autodestruição ficam de fora.
 */
export function inimigosVisiveis(ctx: SystemContext, nacao: NacaoId): EntityId[] {
  const { state } = ctx;
  return entitiesWith(state, 'owner', 'position', 'vida').filter((id) => {
    const dono = getComponent(state, id, 'owner')!.nacao;
    if (dono === nacao || state.placar[dono]?.eliminada) return false;
    if (getComponent(state, id, 'mine')) return false;
    return visivelPara(ctx, nacao, id);
  });
}

/**
 * Memória de estruturas inimigas vistas (fantasmas, VIS-04): atualiza com o que está visível e
 * esquece o que, visto de novo, não está mais lá.
 */
export function atualizarMemoria(ctx: SystemContext, nacao: NacaoId): void {
  const { state } = ctx;
  const ia = state.ias[nacao]!;
  const visiveis = inimigosVisiveis(ctx, nacao).filter((id) =>
    getComponent(state, id, 'structure'),
  );
  const vistos = new Set(visiveis);
  for (const id of visiveis) {
    const tipo = tipoDe(state, id)!;
    const d = direcaoDe(getComponent(state, id, 'position')!);
    ia.conhecidas[id] = { nacao: getComponent(state, id, 'owner')!.nacao, tipo, d, tick: ctx.tick };
  }
  for (const [chave, memoria] of Object.entries(ia.conhecidas)) {
    const id = Number(chave);
    if (vistos.has(id)) continue;
    // O lugar está visível e a estrutura não aparece: já não existe.
    const lugarVisivel = !state.entities.includes(id) || !visivelPara(ctx, nacao, id);
    if (lugarVisivel && pontoVisivel(ctx, nacao, memoria.d)) delete ia.conhecidas[id];
    if (state.placar[memoria.nacao]?.eliminada) delete ia.conhecidas[id];
  }
}

function pontoVisivel(ctx: SystemContext, nacao: NacaoId, d: Ponto): boolean {
  return estadoEm(ctx, nacao, d) === VISIVEL;
}

/** A Nave (ou outra estrutura) própria mais importante: o centro da base. */
export function centroDaBase(state: SimState, nacao: NacaoId): Ponto | null {
  const nave = dosTipos(state, nacao, 'ship')[0];
  const referencia = nave ?? dosTipos(state, nacao, 'printer')[0] ?? proprios(state, nacao)[0];
  return referencia !== undefined ? direcaoDe(getComponent(state, referencia, 'position')!) : null;
}

export function maisProximo<T>(
  ctx: SystemContext,
  de: Ponto,
  itens: readonly T[],
  ponto: (item: T) => Ponto,
): T | null {
  let melhor: T | null = null;
  let menor = Infinity;
  for (const item of itens) {
    const distancia = distanciaM(ctx, de, ponto(item));
    if (distancia < menor) {
      menor = distancia;
      melhor = item;
    }
  }
  return melhor;
}
