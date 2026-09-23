/** Economia (ECO-04 a ECO-26): jazidas, coleta, estoque, Diretiva de Coleta e Silo Móvel. */
import type { CommandHandler, SystemContext } from '../core/pipeline';
import { comandosDeColeta, passoColeta } from './coleta';
import { comandosDeDiretiva, distribuirOciosos } from './diretiva';
import { comandosDeJazidas } from './jazidas';
import { comandosDoSilo, passoSilos } from './silo';

export { designar } from './coleta';
export { jazidasElegiveis, ociosos, recursosSemJazida } from './diretiva';
export { emTransito, estoque, pontosDeEntrega } from './estoque';
export { criarJazida, raioDaJazida, SEMEAR_JAZIDAS_COMMAND } from './jazidas';
export { siloImovel } from './silo';

/** Sistema `economia` (TEC-06): silos, ciclo dos hovers e diretiva para os ociosos. */
export function sistemaEconomia(ctx: SystemContext): void {
  passoSilos(ctx);
  passoColeta(ctx);
  distribuirOciosos(ctx);
}

export const comandosDaEconomia: Record<string, CommandHandler> = {
  ...comandosDeJazidas,
  ...comandosDeColeta,
  ...comandosDeDiretiva,
  ...comandosDoSilo,
};
