/** Energia (§6): rede por nação, baterias, portas de recarga, usinas e Bateria Móvel. */
import type { CommandHandler, SystemContext } from '../core/pipeline';
import { comandosDeCabos, encherBancos } from './cabos';
import { passoRede } from './rede';
import { autoRecarga, comandosDeRecarga, passoRecarga } from './recarga';
import { comandosDeSuporte, passoSuporte } from './suporte';
import { comandosDasUsinas, passoUsinas } from './usinas';

export { emReserva, estadoDaBateria, gastar, porcentagem } from './bateria';
export {
  capacidadeDaRede,
  geracaoDaRede,
  leituraDaRede,
  leituraDaRedeDe,
  redesIsoladas,
  type LeituraDaRede,
} from './rede';
export {
  caboAlcanca,
  cabosDe,
  encherBancos,
  precisaDeEnergia,
  redeDe,
  redePrincipal,
} from './cabos';
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
  ...comandosDeCabos,
  /** REG-06 (até a T-056): enche o banco da nação que envia. */
  [DEBUG_ENCHER_BANCO_COMMAND]: (ctx, comando) => {
    if (ctx.state.energia[comando.nacao]) encherBancos(ctx.state, comando.nacao);
  },
};
