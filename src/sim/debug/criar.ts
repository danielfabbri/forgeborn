/**
 * Comando de depuração que cria corpos em posições dadas. Serve aos testes e à cena de
 * demonstração até existir o início de partida (T-056); a IA e o jogador não o usam.
 */
import { getComponent } from '../core/entities';
import type { CommandHandler } from '../core/pipeline';
import type { NacaoId } from '../core/types';
import { dados, type EstruturasId, type MoveisId } from '../data';
import { normalizar, type Vec3 } from '../map/esfera';
import { criarEstrutura, criarMina, criarUnidade } from '../units/criar';

export const DEBUG_CRIAR_COMMAND = 'debug_criar';
/** Aplica à nação que envia o estoque inicial de um modo (REG-05), para a cena de demonstração. */
export const DEBUG_ESTOQUE_COMMAND = 'debug_estoque';
/** Testes: zera o HP de um corpo (o sistema de morte o destrói no mesmo tick). */
export const DEBUG_DESTRUIR_COMMAND = 'debug_destruir';

/** `d` é a direção do ponto na superfície (normalizada aqui). */
export type Criacao =
  | {
      unidade: MoveisId;
      nacao?: NacaoId;
      d: Vec3;
      /** CMB-13: já nasce com esta postura (testes). */
      postura?: 'agressiva' | 'defensiva' | 'manter' | 'passiva';
    }
  | { estrutura: EstruturasId; nacao?: NacaoId; d: Vec3 }
  | { mina: true; nacao?: NacaoId; d: Vec3 };

export const debugCriarHandlers: Record<string, CommandHandler> = {
  [DEBUG_DESTRUIR_COMMAND]: (ctx, comando) => {
    const id = (comando.dados as { id?: unknown } | null)?.id;
    if (typeof id !== 'number') return;
    const vida = getComponent(ctx.state, id, 'vida');
    if (vida) vida.hp = 0;
  },
  [DEBUG_CRIAR_COMMAND]: (ctx, comando) => {
    for (const c of comando.dados as unknown as Criacao[]) {
      const nacao = c.nacao ?? comando.nacao;
      const d = normalizar(c.d);
      if ('unidade' in c) {
        const id = criarUnidade(ctx, nacao, c.unidade, d);
        const arma = id !== null ? getComponent(ctx.state, id, 'arma') : undefined;
        if (arma && c.postura) arma.postura = c.postura;
      } else if ('estrutura' in c) criarEstrutura(ctx, nacao, c.estrutura, d);
      else criarMina(ctx, nacao, d);
    }
  },
  [DEBUG_ESTOQUE_COMMAND]: (ctx, comando) => {
    const modo = (comando.dados as { modo?: unknown } | null)?.modo;
    const linha = dados.estoque_inicial.find((e) => e.modo === modo);
    const estoque = ctx.state.estoques[comando.nacao];
    if (!linha || !estoque) return;
    for (const r of dados.recursos) estoque[r.id] = linha[r.id];
  },
};
