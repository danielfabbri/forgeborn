/**
 * Comando de depuração que cria corpos em posições dadas. Serve aos testes e à cena de
 * demonstração até existir o início de partida (T-056); a IA e o jogador não o usam.
 */
import type { CommandHandler } from '../core/pipeline';
import type { NacaoId } from '../core/types';
import type { EstruturasId, MoveisId } from '../data';
import { criarEstrutura, criarMina, criarUnidade } from '../units/criar';

export const DEBUG_CRIAR_COMMAND = 'debug_criar';

export type Criacao =
  | { unidade: MoveisId; nacao?: NacaoId; x: number; z: number }
  | { estrutura: EstruturasId; nacao?: NacaoId; x: number; z: number }
  | { mina: true; nacao?: NacaoId; x: number; z: number };

export const debugCriarHandlers: Record<string, CommandHandler> = {
  [DEBUG_CRIAR_COMMAND]: (ctx, comando) => {
    for (const c of comando.dados as unknown as Criacao[]) {
      const nacao = c.nacao ?? comando.nacao;
      if ('unidade' in c) criarUnidade(ctx, nacao, c.unidade, c.x, c.z);
      else if ('estrutura' in c) criarEstrutura(ctx, nacao, c.estrutura, c.x, c.z);
      else criarMina(ctx, nacao, c.x, c.z);
    }
  },
};
