/**
 * Comando de depuração que cria corpos em posições dadas. Serve aos testes e à cena de
 * demonstração até existir o início de partida (T-056); a IA e o jogador não o usam.
 */
import { getComponent } from '../core/entities';
import type { CommandHandler } from '../core/pipeline';
import type { NacaoId } from '../core/types';
import { dados, type EstruturasId, type MoveisId } from '../data';
import { escalar, normalizar, soma, tangente, type Vec3 } from '../map/esfera';
import { criarEstrutura, criarMina, criarUnidade } from '../units/criar';
import { lancarSatelite } from '../visao/satelite';
import { entitiesWith } from '../core/entities';
import type { EntityId } from '../core/types';
import type { SystemContext } from '../core/pipeline';
import { arco } from '../map/esfera';
import { direcaoDe } from '../units/superficie';
import { ligarCabo, saidasDe, temSaidaLivre } from '../energia/cabos';

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
  | {
      estrutura: EstruturasId;
      nacao?: NacaoId;
      d: Vec3;
      /** Base de Lançamento já com o satélite impresso, subindo (cena e testes, D-55). */
      comSatelite?: boolean;
      /** D-56: rumo (tangente) de Muro e Portão. */
      rumo?: Vec3;
      /**
       * D-85: por padrão a estrutura de depuração já nasce ligada por cabo à estrutura mais
       * próxima da nação (uma rede só, como antes dos cabos); `semCabo` a deixa fora.
       */
      semCabo?: boolean;
    }
  | { mina: true; nacao?: NacaoId; d: Vec3 };

/**
 * D-85/D-87 (depuração): liga a estrutura à Nave ou Central mais próxima da nação com saída
 * livre (sem conferir alcance); sem nenhuma, à estrutura mais próxima com saída livre.
 */
function plugarNaMaisProxima(ctx: SystemContext, id: EntityId, nacao: NacaoId): void {
  const { state } = ctx;
  const d = direcaoDe(getComponent(state, id, 'position')!);
  if (!temSaidaLivre(state, id)) return;
  let melhor: EntityId | null = null;
  let menor = Infinity;
  for (const outra of entitiesWith(state, 'structure', 'owner', 'position')) {
    if (outra === id || getComponent(state, outra, 'owner')!.nacao !== nacao) continue;
    if (!temSaidaLivre(state, outra)) continue;
    // Nave e Central na frente: somam uma volta inteira à distância das outras.
    const dist =
      arco(d, direcaoDe(getComponent(state, outra, 'position')!)) +
      (saidasDe(state, outra) > 1 ? 0 : 2 * Math.PI);
    if (dist < menor) {
      menor = dist;
      melhor = outra;
    }
  }
  if (melhor !== null) ligarCabo(state, id, melhor);
}

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
        if (!dados.moveis.some((m) => m.id === c.unidade)) continue;
        const id = criarUnidade(ctx, nacao, c.unidade, d);
        const arma = id !== null ? getComponent(ctx.state, id, 'arma') : undefined;
        if (arma && c.postura) arma.postura = c.postura;
      } else if ('estrutura' in c) {
        // Tipo desconhecido é ignorado (a depuração não cria corpos inválidos).
        if (dados.estruturas.some((e) => e.id === c.estrutura)) {
          const rumo = c.rumo ? (tangente(d, soma(d, escalar(c.rumo, 1e-3))) ?? null) : null;
          const id = criarEstrutura(ctx, nacao, c.estrutura, d, rumo);
          if (id !== null && !c.semCabo) plugarNaMaisProxima(ctx, id, nacao);
          if (id !== null && c.comSatelite && c.estrutura === 'satellite_uplink') {
            lancarSatelite(ctx, id, nacao, d);
          }
        }
      } else criarMina(ctx, nacao, d);
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
