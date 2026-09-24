import type { CommandHandler, GameSystemId, SystemFn } from '../core/pipeline';
import { comandosDoCombate, sistemaCombate, sistemaMorte, sistemaProjeteis } from '../combate';
import { comandosDaEconomia, sistemaEconomia } from '../economia';
import { comandosDaIa, sistemaIa } from '../ia';
import { sistemaVisao } from '../visao/nevoa';
import { comandosDaEnergia, sistemaEnergia } from '../energia';
import { comandosDaProducao, sistemaProducao } from '../producao';
import { sistemaMovimento } from './movimento';
import { comandosDeMovimento } from './ordens';

export { criarEstrutura, criarMina, criarUnidade, dentroDoLimite, type Limite } from './criar';
export { sistemaMovimento, tracarRota } from './movimento';
export { comandosDeMovimento, formacao } from './ordens';

/** Sistemas de jogo já implementados, no encaixe da TEC-06. */
export const sistemasDoJogo: Partial<Record<GameSystemId, SystemFn>> = {
  ia: sistemaIa,
  producao: sistemaProducao,
  energia: sistemaEnergia,
  movimento: sistemaMovimento,
  economia: sistemaEconomia,
  combate: sistemaCombate,
  projeteis: sistemaProjeteis,
  morte: sistemaMorte,
  visao: sistemaVisao,
};

/** Tratadores de Comando já implementados. */
export const comandosDoJogo: Record<string, CommandHandler> = {
  ...comandosDeMovimento,
  ...comandosDaEconomia,
  ...comandosDaEnergia,
  ...comandosDaProducao,
  ...comandosDoCombate,
  ...comandosDaIa,
};
