/** Comandos de combate (CMB-13 a CMB-15, UNI-02, UI-02, CTL-07, §12.4). */
import { getComponent, isAlive } from '../core/entities';
import type { CommandHandler, SystemContext } from '../core/pipeline';
import type { EntityId } from '../core/types';
import { param } from '../data';
import { irPara } from '../economia/coleta';
import { daNacao, moverComo, moverPara } from '../units/ordens';
import { direcaoDe, direcaoDoComando } from '../units/superficie';
import { pontosDoCampo } from './minas';
import { emLiquido } from '../map/lagos';

type Postura = 'agressiva' | 'defensiva' | 'manter' | 'passiva';
const POSTURAS: Postura[] = ['agressiva', 'defensiva', 'manter', 'passiva'];

function limparEngajamento(ctx: SystemContext, id: EntityId): void {
  const arma = getComponent(ctx.state, id, 'arma');
  if (!arma) return;
  arma.alvoDireto = null;
  arma.origem = null;
  arma.retomar = null;
  arma.perseguindo = null;
}

function dados(comando: { dados: unknown }) {
  return (comando.dados ?? {}) as {
    ids?: unknown;
    alvo?: unknown;
    postura?: unknown;
    livre?: unknown;
    chave?: unknown;
    ligada?: unknown;
    x?: unknown;
    y?: unknown;
    z?: unknown;
  };
}

export const comandosDeCombate: Record<string, CommandHandler> = {
  /** CMB-15 (clique direito num inimigo): ataque direto; quem não tem arma vai até lá. */
  atacar: (ctx, comando) => {
    const d = dados(comando);
    const alvo = d.alvo;
    if (typeof alvo !== 'number' || !isAlive(ctx.state, alvo)) return;
    if (getComponent(ctx.state, alvo, 'owner')?.nacao === comando.nacao) return;
    const ids = daNacao(ctx, comando.nacao, d.ids, 'unit');
    const semArma: EntityId[] = [];
    for (const id of ids) {
      const arma = getComponent(ctx.state, id, 'arma');
      if (!arma) {
        semArma.push(id);
        continue;
      }
      limparEngajamento(ctx, id);
      arma.alvoDireto = alvo;
      const ordem = getComponent(ctx.state, id, 'order')!;
      ordem.tipo = 'atacar';
      ordem.patrulha = null;
    }
    if (semArma.length > 0) {
      moverPara(ctx, semArma, direcaoDe(getComponent(ctx.state, alvo, 'position')!));
    }
  },
  /** CMB-14 (A + clique): ataque-movimento. */
  atacar_mover: (ctx, comando) => {
    const d = dados(comando);
    const alvo = direcaoDoComando(d);
    if (!alvo) return;
    const ids = daNacao(ctx, comando.nacao, d.ids, 'unit');
    for (const id of ids) limparEngajamento(ctx, id);
    moverComo(ctx, ids, alvo, 'atacar_mover', d.livre === true);
  },
  /** D-32 (M): mover sem disparar. */
  mover_ignorando: (ctx, comando) => {
    const d = dados(comando);
    const alvo = direcaoDoComando(d);
    if (!alvo) return;
    const ids = daNacao(ctx, comando.nacao, d.ids, 'unit');
    for (const id of ids) limparEngajamento(ctx, id);
    moverComo(ctx, ids, alvo, 'mover_ignorando', d.livre === true);
  },
  /** CMB-13 (X): alterna Agressiva → Defensiva → Manter posição → Passiva. */
  alternar_postura: (ctx, comando) => {
    for (const id of daNacao(ctx, comando.nacao, dados(comando).ids, 'unit')) {
      const arma = getComponent(ctx.state, id, 'arma');
      if (!arma?.postura) continue;
      arma.postura = POSTURAS[(POSTURAS.indexOf(arma.postura) + 1) % POSTURAS.length]!;
      limparEngajamento(ctx, id);
    }
  },
  /** CMB-13: define a postura. */
  postura: (ctx, comando) => {
    const d = dados(comando);
    if (!POSTURAS.includes(d.postura as Postura)) return;
    for (const id of daNacao(ctx, comando.nacao, d.ids, 'unit')) {
      const arma = getComponent(ctx.state, id, 'arma');
      if (!arma?.postura) continue;
      arma.postura = d.postura as Postura;
      limparEngajamento(ctx, id);
    }
  },
  /** UNI-02 (T): plantar uma mina no ponto. */
  plantar_mina: (ctx, comando) => {
    const d = dados(comando);
    const ponto = direcaoDoComando(d);
    // CEN-04: mina não vai para um lago de metano.
    if (!ponto || (ctx.mundo && emLiquido(ctx.mundo.mapa, ponto))) return;
    for (const id of daNacao(ctx, comando.nacao, d.ids, 'unit')) {
      const lanca = getComponent(ctx.state, id, 'lancaMinas');
      if (!lanca || lanca.carregador === 0) continue;
      lanca.plantios = [ponto];
      lanca.plantio_s = 0;
      irPara(ctx, id, ponto);
    }
  },
  /** UNI-02 (G): Campo minado — até `magazine_minas` minas em linha, na direção indicada. */
  campo_minado: (ctx, comando) => {
    const d = dados(comando);
    const ponto = direcaoDoComando(d);
    if (!ponto) return;
    for (const id of daNacao(ctx, comando.nacao, d.ids, 'unit')) {
      const lanca = getComponent(ctx.state, id, 'lancaMinas');
      if (!lanca || lanca.carregador === 0) continue;
      const de = direcaoDe(getComponent(ctx.state, id, 'position')!);
      const n = Math.min(lanca.carregador, param('magazine_minas'));
      lanca.plantios = pontosDoCampo(ctx, de, ponto, n).filter(
        (p) => !ctx.mundo || !emLiquido(ctx.mundo.mapa, p),
      );
      if (lanca.plantios.length === 0) continue;
      lanca.plantio_s = 0;
      irPara(ctx, id, lanca.plantios[0]!);
    }
  },
  /** UI-02: chaves globais das Diretivas (fuga de hovers, fabricação de minas). */
  chave_diretiva: (ctx, comando) => {
    const d = dados(comando);
    const chaves = ctx.state.chaves[comando.nacao];
    if (!chaves || typeof d.ligada !== 'boolean') return;
    if (d.chave === 'fuga' || d.chave === 'fabricarMinas') chaves[d.chave] = d.ligada;
  },
};
