/** Energia (§6): rede por nação, baterias, portas de recarga, usinas e Bateria Móvel. */
import type { CommandHandler, SystemContext } from '../core/pipeline';
import { capacidadeDaRede } from './rede';
import { passoRede } from './rede';
import { autoRecarga, comandosDeRecarga, passoRecarga } from './recarga';
import { comandosDeSuporte, passoSuporte } from './suporte';
import { comandosDasUsinas, passoUsinas } from './usinas';

export { emReserva, estadoDaBateria, gastar, porcentagem } from './bateria';
export { capacidadeDaRede, geracaoDaRede, leituraDaRede, type LeituraDaRede } from './rede';
export { iniciarRecarga } from './recarga';

export const DEBUG_ENCHER_BANCO_COMMAND = 'debug_encher_banco';

/** Sistema `energia` (TEC-06). */
export function sistemaEnergia(ctx: SystemContext): void {
  passoUsinas(ctx);
  passoSuporte(ctx);
  autoRecarga(ctx);
  passoRecarga(ctx);
  passoRede(ctx);
}

export const comandosDaEnergia: Record<string, CommandHandler> = {
  ...comandosDeRecarga,
  ...comandosDeSuporte,
  ...comandosDasUsinas,
  /** REG-06 (até a T-056): enche o banco da nação que envia. */
  [DEBUG_ENCHER_BANCO_COMMAND]: (ctx, comando) => {
    const rede = ctx.state.energia[comando.nacao];
    if (rede) rede.banco = capacidadeDaRede(ctx.state, comando.nacao);
  },
};
