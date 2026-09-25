/** Combate (§9): dano, armas, projéteis, minas, explosões, morte e fim de partida. */
import type { CommandHandler, SystemContext } from '../core/pipeline';
import { sistemaCombate as armas } from './armas';
import { comandosDeAbrigo, passoAbrigo } from './abrigo';
import { passoBrechas } from './brecha';
import { comandosDeCombate } from './comandos';
import { passoFuga } from './fuga';
import { passoMinas } from './minas';
import { comandosDePilotagem, passoPilotagem } from './pilotagem';
import { comandosDeMorte } from './morte';
import { comandosDeSatelite, passoSatelites } from '../visao/satelite';
import { comandosDeSentinela, passoSentinelas } from '../visao/sentinela';

export { alvoValido, armaDe, pontoPrevisto } from './armas';
export { aplicarDano, classeDe, danoContra, emCombate, fatorDeSplash } from './dano';
export { eliminar, pontuacao, sistemaMorte } from './morte';
export { sistemaProjeteis } from './projeteis';

/** Sistema `combate` (TEC-06). */
export function sistemaCombate(ctx: SystemContext): void {
  passoPilotagem(ctx);
  passoFuga(ctx);
  passoSentinelas(ctx);
  passoSatelites(ctx);
  passoAbrigo(ctx);
  passoBrechas(ctx);
  armas(ctx);
  passoMinas(ctx);
}

export const comandosDoCombate: Record<string, CommandHandler> = {
  ...comandosDeCombate,
  ...comandosDeMorte,
  ...comandosDeSentinela,
  ...comandosDeSatelite,
  ...comandosDePilotagem,
  ...comandosDeAbrigo,
};
