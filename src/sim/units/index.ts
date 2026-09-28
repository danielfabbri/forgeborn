import type { CommandHandler, GameSystemId, SystemFn } from '../core/pipeline';
import { comandosDoCombate, sistemaCombate, sistemaMorte, sistemaProjeteis } from '../combate';
import { comandosDaEconomia, sistemaEconomia } from '../economia';
import { comandosDaIa, sistemaIa } from '../ia';
import { sistemaVisao } from '../visao/nevoa';
import { comandosDaEnergia, sistemaEnergia } from '../energia';
import { comandosDaProducao, sistemaProducao } from '../producao';
import { sistemaMovimento } from './movimento';
import { sistemaTempestade } from '../cenario/tempestade';
import { comandosDeMovimento } from './ordens';
import { comandosDoTemperamento, sistemaTemperamento } from '../relacoes/temperamento';

export { criarEstrutura, criarMina, criarUnidade, dentroDoLimite, type Limite } from './criar';
export { sistemaMovimento, tracarRota } from './movimento';
export { comandosDeMovimento, formacao } from './ordens';

/** Sistemas de jogo já implementados, no encaixe da TEC-06. */
export const sistemasDoJogo: Partial<Record<GameSystemId, SystemFn>> = {
  ia: sistemaIa,
  producao: sistemaProducao,
  // CEN-03: a tempestade do tick é decidida antes da energia e da visão.
  energia: (ctx) => {
    sistemaTempestade(ctx);
    sistemaEnergia(ctx);
  },
  movimento: sistemaMovimento,
  economia: sistemaEconomia,
  combate: sistemaCombate,
  projeteis: sistemaProjeteis,
  // REG-24 a REG-28: o temperamento é conferido depois do combate e das mortes do tick.
  morte: (ctx) => {
    sistemaMorte(ctx);
    sistemaTemperamento(ctx);
  },
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
  ...comandosDoTemperamento,
};
