import type { CommandHandler, GameSystemId, SystemFn } from '../core/pipeline';
import { comandosDaEconomia, sistemaEconomia } from '../economia';
import { sistemaMovimento } from './movimento';
import { comandosDeMovimento } from './ordens';

export { criarEstrutura, criarMina, criarUnidade, dentroDoLimite, type Limite } from './criar';
export { sistemaMovimento, tracarRota } from './movimento';
export { comandosDeMovimento, formacao } from './ordens';

/** Sistemas de jogo já implementados, no encaixe da TEC-06. */
export const sistemasDoJogo: Partial<Record<GameSystemId, SystemFn>> = {
  movimento: sistemaMovimento,
  economia: sistemaEconomia,
};

/** Tratadores de Comando já implementados. */
export const comandosDoJogo: Record<string, CommandHandler> = {
  ...comandosDeMovimento,
  ...comandosDaEconomia,
};
