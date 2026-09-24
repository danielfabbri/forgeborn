/**
 * Hover de Plantio de Minas (UNI-01, UNI-02, REG-18): fabrica minas sozinho até o carregador
 * (`magazine_minas`), com a receita e o tempo da linha `mine` de `dados:custos`, pagando ao
 * começar (PRD-04) e gastando `en_impressao` da bateria (PRD-06). Planta cada mina em
 * `tempo_plantar_mina_s`; o Campo minado planta em linha, espaçadas
 * `campo_minado_espacamento_m`, na direção indicada.
 */
import { entitiesWith, getComponent } from '../core/entities';
import type { SystemContext } from '../core/pipeline';
import type { NacaoId } from '../core/types';
import { param } from '../data';
import { irPara } from '../economia/coleta';
import { emReserva, gastar } from '../energia/bateria';
import { avancar, norteEm, tangente, type Vec3 } from '../map/esfera';
import { custoDe, pagar } from '../producao/custos';
import { pararNoLugar } from '../producao/alcance';
import { criarMina } from '../units/criar';
import { direcaoDe, distanciaM, raioDoMundo } from '../units/superficie';

/** Chegou ao ponto de plantio (m). */
const CHEGADA_PLANTIO_M = 0.6;

/** Sem recursos, a fabricação espera em silêncio (sem AL-06 a cada tick). */
function podePagar(ctx: SystemContext, nacao: NacaoId): boolean {
  const custo = custoDe('mine');
  const estoque = ctx.state.estoques[nacao]!;
  return (['fe', 'si', 'cu', 'li', 'ti', 'u'] as const).every((r) => estoque[r] >= custo[r]);
}

export function passoMinas(ctx: SystemContext): void {
  const { state, dt } = ctx;
  const custo = custoDe('mine');
  for (const id of entitiesWith(state, 'lancaMinas', 'owner')) {
    const lanca = getComponent(state, id, 'lancaMinas')!;
    const nacao = getComponent(state, id, 'owner')!.nacao;
    const ordem = getComponent(state, id, 'order')!;

    // UNI-01: fabricação automática (desligável nas Diretivas).
    const cabe = lanca.carregador + (lanca.fabricando !== null ? 1 : 0) < param('magazine_minas');
    if (lanca.fabricando === null && cabe && state.chaves[nacao]!.fabricarMinas) {
      if (podePagar(ctx, nacao) && pagar(ctx, nacao, 'mine')) lanca.fabricando = 0;
    }
    if (lanca.fabricando !== null && !emReserva(ctx, id)) {
      const pago = gastar(ctx, id, (custo.en_impressao / custo.tempo_s) * dt);
      lanca.fabricando += (pago * dt) / custo.tempo_s;
      if (lanca.fabricando >= 1 - 1e-9) {
        lanca.fabricando = null;
        lanca.carregador++;
      }
    }

    // UNI-02: plantio. Outra ordem do jogador cancela os plantios pendentes.
    if (lanca.plantios.length === 0) continue;
    if (ordem.tipo !== 'tarefa' || lanca.carregador === 0) {
      lanca.plantios = [];
      lanca.plantio_s = 0;
      continue;
    }
    const alvo = lanca.plantios[0]!;
    const d = direcaoDe(getComponent(state, id, 'position')!);
    const loc = getComponent(state, id, 'locomotion')!;
    if (distanciaM(ctx, d, alvo) > CHEGADA_PLANTIO_M) {
      if (!loc.destino) irPara(ctx, id, alvo);
      continue;
    }
    if (loc.destino) pararNoLugar(ctx, id);
    lanca.plantio_s += dt;
    if (lanca.plantio_s < param('tempo_plantar_mina_s') - 1e-9) continue;
    lanca.plantio_s = 0;
    lanca.plantios.shift();
    // REG-18: além do limite, a mina não é plantada (criarMina emite AL-11).
    if (criarMina(ctx, nacao, alvo) === null) {
      lanca.plantios = [];
      continue;
    }
    lanca.carregador--;
    if (lanca.plantios.length === 0 || lanca.carregador === 0) {
      lanca.plantios = [];
      ordem.tipo = 'nenhuma';
    }
  }
}

/** UNI-02: pontos do Campo minado, do ponto indicado para a frente, na direção da unidade a ele. */
export function pontosDoCampo(ctx: SystemContext, de: Vec3, ponto: Vec3, n: number): Vec3[] {
  const rumo = tangente(ponto, de);
  const frente = rumo ? ([-rumo[0], -rumo[1], -rumo[2]] as Vec3) : norteEm(ponto);
  const passo = param('campo_minado_espacamento_m') / raioDoMundo(ctx);
  return Array.from({ length: n }, (_, k) => avancar(ponto, frente, k * passo).p);
}
