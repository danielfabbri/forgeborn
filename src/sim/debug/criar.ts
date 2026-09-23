/**
 * Comando de depuração que cria corpos em posições dadas. Serve aos testes e à cena de
 * demonstração até existir o início de partida (T-056); a IA e o jogador não o usam.
 */
import type { CommandHandler } from '../core/pipeline';
import type { NacaoId } from '../core/types';
import type { EstruturasId, MoveisId } from '../data';
import { normalizar, type Vec3 } from '../map/esfera';
import { criarEstrutura, criarMina, criarUnidade } from '../units/criar';

export const DEBUG_CRIAR_COMMAND = 'debug_criar';

/** `d` é a direção do ponto na superfície (normalizada aqui). */
export type Criacao =
  | { unidade: MoveisId; nacao?: NacaoId; d: Vec3 }
  | { estrutura: EstruturasId; nacao?: NacaoId; d: Vec3 }
  | { mina: true; nacao?: NacaoId; d: Vec3 };

export const debugCriarHandlers: Record<string, CommandHandler> = {
  [DEBUG_CRIAR_COMMAND]: (ctx, comando) => {
    for (const c of comando.dados as unknown as Criacao[]) {
      const nacao = c.nacao ?? comando.nacao;
      const d = normalizar(c.d);
      if ('unidade' in c) criarUnidade(ctx, nacao, c.unidade, d);
      else if ('estrutura' in c) criarEstrutura(ctx, nacao, c.estrutura, d);
      else criarMina(ctx, nacao, d);
    }
  },
};
