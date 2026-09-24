/**
 * Início de partida (REG-04 a REG-08, FLX-09 em versão simples): cada nação pousa a Nave na sua
 * zona e o primeiro Hover de Exploração sai pela rampa. Estoque inicial pelo modo
 * (`dados:estoque_inicial`), banco cheio, e o hover começa a coletar sozinho pela Diretiva.
 *
 * REG-07: a área em volta da Nave começa explorada (`raio_explorado_inicial_m`).
 */
import type { CommandHandler, SystemContext } from '../core/pipeline';
import type { ModoNevoa } from '../core/state';
import type { NacaoId } from '../core/types';
import { dados, type EstoqueInicialModo } from '../data';
import { capacidadeDaRede } from '../energia/rede';
import { normalizar, type Vec3 } from '../map/esfera';
import { criarEstrutura } from '../units/criar';
import { explorar, raioExploradoInicial } from '../visao/nevoa';
import { nascer } from './fila';

export const INICIAR_PARTIDA_COMMAND = 'iniciar_partida';

export interface InicioDaNacao {
  nacao: NacaoId;
  /** Centro da zona de pouso (direção). */
  zona: Vec3;
}

export function iniciarPartida(
  ctx: SystemContext,
  modo: EstoqueInicialModo,
  inicios: InicioDaNacao[],
): void {
  const estoque = dados.estoque_inicial.find((linha) => linha.modo === modo);
  if (!estoque) return;
  for (const { nacao, zona } of inicios) {
    if (!ctx.state.estoques[nacao]) continue;
    const nave = criarEstrutura(ctx, nacao, 'ship', normalizar(zona));
    if (nave === null) continue;
    for (const r of dados.recursos) ctx.state.estoques[nacao]![r.id] = estoque[r.id];
    ctx.state.energia[nacao]!.banco = capacidadeDaRede(ctx.state, nacao);
    explorar(ctx, nacao, normalizar(zona), raioExploradoInicial());
    nascer(ctx, nave, 'hover_explorer', false);
  }
}

function ehModo(modo: unknown): modo is EstoqueInicialModo {
  return dados.estoque_inicial.some((linha) => linha.modo === modo);
}

const MODOS_DE_NEVOA: readonly ModoNevoa[] = ['normal', 'explorado', 'revelado'];

export const comandosDeInicio: Record<string, CommandHandler> = {
  /**
   * Monta o início da partida para todas as nações listadas (enviado uma vez, no tick 0).
   * Opcionais do Free Battle (§16): `nevoa` (FB-01) e `tempoLimite_s` (REG-12).
   */
  [INICIAR_PARTIDA_COMMAND]: (ctx, comando) => {
    const d = (comando.dados ?? {}) as {
      modo?: unknown;
      nacoes?: unknown;
      nevoa?: unknown;
      tempoLimite_s?: unknown;
    };
    if (!ehModo(d.modo) || !Array.isArray(d.nacoes)) return;
    if (MODOS_DE_NEVOA.includes(d.nevoa as ModoNevoa)) ctx.state.modoNevoa = d.nevoa as ModoNevoa;
    if (typeof d.tempoLimite_s === 'number' && d.tempoLimite_s > 0) {
      ctx.state.tempoLimite_s = d.tempoLimite_s;
    }
    const inicios = d.nacoes.filter(
      (n): n is InicioDaNacao =>
        typeof n === 'object' &&
        n !== null &&
        typeof (n as InicioDaNacao).nacao === 'string' &&
        Array.isArray((n as InicioDaNacao).zona) &&
        (n as InicioDaNacao).zona.length === 3 &&
        (n as InicioDaNacao).zona.every((v) => typeof v === 'number' && Number.isFinite(v)),
    );
    iniciarPartida(ctx, d.modo, inicios);
  },
};
