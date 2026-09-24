/** Produção e construção (§7): filas, impressão, obras, assistência e reparo. */
import type { CommandHandler, SystemContext } from '../core/pipeline';
import { comandosDeFila, passoFilas } from './fila';
import { comandosDeInicio } from './inicio';
import { comandosDeObra, passoConstrucao } from './obra';
import { comandosDeTrabalho, passoReparo, passoTrabalhos } from './trabalho';

export { custoDe, produz } from './custos';
export { cabeNaFila, filaMaxima } from './fila';
export { INICIAR_PARTIDA_COMMAND, type InicioDaNacao, iniciarPartida } from './inicio';
export { type MotivoRecusa, validarPosicionamento } from './obra';

/** Sistema `producao` (TEC-06). */
export function sistemaProducao(ctx: SystemContext): void {
  passoFilas(ctx);
  passoTrabalhos(ctx);
  passoConstrucao(ctx);
  passoReparo(ctx);
}

export const comandosDaProducao: Record<string, CommandHandler> = {
  ...comandosDeFila,
  ...comandosDeObra,
  ...comandosDeTrabalho,
  ...comandosDeInicio,
};
