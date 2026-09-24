/**
 * Início de partida (REG-04 a REG-08, FLX-09 em versão simples): cada nação pousa a Nave na sua
 * zona e o primeiro Hover de Exploração sai pela rampa. Estoque inicial pelo modo
 * (`dados:estoque_inicial`), banco cheio, e o hover começa a coletar sozinho pela Diretiva.
 *
 * A área explorada inicial (REG-07) entra com a névoa (T-070).
 */
import type { CommandHandler, SystemContext } from '../core/pipeline';
import type { NacaoId } from '../core/types';
import { dados, type EstoqueInicialModo } from '../data';
import { capacidadeDaRede } from '../energia/rede';
import { normalizar, type Vec3 } from '../map/esfera';
import { criarEstrutura } from '../units/criar';
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
    nascer(ctx, nave, 'hover_explorer', false);
  }
}

function ehModo(modo: unknown): modo is EstoqueInicialModo {
  return dados.estoque_inicial.some((linha) => linha.modo === modo);
}

export const comandosDeInicio: Record<string, CommandHandler> = {
  /** Monta o início da partida para todas as nações listadas (enviado uma vez, no tick 0). */
  [INICIAR_PARTIDA_COMMAND]: (ctx, comando) => {
    const d = (comando.dados ?? {}) as { modo?: unknown; nacoes?: unknown };
    if (!ehModo(d.modo) || !Array.isArray(d.nacoes)) return;
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
