/**
 * Início de partida (REG-04 a REG-08, FLX-09 em versão simples): cada nação pousa a Nave na sua
 * zona e o primeiro Hover de Exploração sai pela rampa. Estoque inicial pelo modo
 * (`dados:estoque_inicial`), banco cheio, e o hover começa a coletar sozinho pela Diretiva.
 *
 * REG-07: a área em volta da Nave começa explorada (`raio_explorado_inicial_m`).
 */
import type { CommandHandler, SystemContext } from '../core/pipeline';
import type { ModoNevoa } from '../core/state';
import type { NacaoId } from '../core/types';
import { dados, type EstoqueInicialModo } from '../data';
import { capacidadeDaRede } from '../energia/rede';
import { avancar, girar, normalizar, norteEm, type Vec3 } from '../map/esfera';
import { criarEstrutura, criarUnidade } from '../units/criar';
import { raioDoMundo } from '../units/superficie';
import { validarPosicionamento } from './obra';
import { getComponent } from '../core/entities';
import type { EstruturasId, MoveisId } from '../data';
import { explorar, raioExploradoInicial } from '../visao/nevoa';
import { nascer } from './fila';

export const INICIAR_PARTIDA_COMMAND = 'iniciar_partida';
/** CAM-06: monta um oponente sem Nave (posto avançado ou alvos de treino) em volta de um ponto. */
export const MONTAR_SEM_NAVE_COMMAND = 'montar_sem_nave';

/** CAM-06 (D-73): composição e postura de cada oponente sem Nave. */
const SEM_NAVE: Record<
  string,
  { estruturas: EstruturasId[]; unidades: MoveisId[]; postura: 'defensiva' | 'passiva' }
> = {
  posto_passivo: {
    estruturas: ['laser_tower', 'laser_tower', 'storage', 'solar_plant'],
    unidades: ['hover_ex1', 'hover_ex1', 'hover_ex1'],
    postura: 'defensiva',
  },
  alvos_treino: {
    estruturas: ['storage', 'solar_plant'],
    unidades: ['hover_ex1', 'hover_ex1', 'hover_ex1'],
    postura: 'passiva',
  },
};

/** Primeiro ponto válido para a estrutura em anéis em volta do centro (apresentação do posto). */
function lugarEmVolta(
  ctx: SystemContext,
  tipo: EstruturasId,
  centro: Vec3,
  k: number,
): Vec3 | null {
  const R = raioDoMundo(ctx);
  const norte = norteEm(centro);
  for (const raio of [0, 14, 20, 26, 32, 40]) {
    for (let passo = 0; passo < 12; passo++) {
      const a = ((k * 5 + passo) / 12) * Math.PI * 2;
      const d = raio === 0 ? centro : avancar(centro, girar(norte, centro, a), raio / R).p;
      if (!validarPosicionamento(ctx, tipo, d)) return d;
    }
  }
  return null;
}

export function montarSemNave(
  ctx: SystemContext,
  nacao: NacaoId,
  tipo: string,
  centro: Vec3,
): void {
  const plano = SEM_NAVE[tipo];
  const placar = ctx.state.placar[nacao];
  if (!plano || !placar) return;
  plano.estruturas.forEach((e, k) => {
    const d = lugarEmVolta(ctx, e, centro, k);
    if (d) criarEstrutura(ctx, nacao, e, d);
  });
  const R = raioDoMundo(ctx);
  const norte = norteEm(centro);
  plano.unidades.forEach((u, k) => {
    const d = avancar(
      centro,
      girar(norte, centro, (k / plano.unidades.length) * Math.PI * 2 + 0.5),
      9 / R,
    ).p;
    const id = criarUnidade(ctx, nacao, u, d);
    const arma = id !== null ? getComponent(ctx.state, id, 'arma') : undefined;
    if (arma) arma.postura = plano.postura;
  });
  placar.presente = true;
  if (!ctx.state.semForja.includes(nacao)) ctx.state.semForja.push(nacao);
}

export interface InicioDaNacao {
  nacao: NacaoId;
  /** Centro da zona de pouso (direção). */
  zona: Vec3;
}

export function iniciarPartida(
  ctx: SystemContext,
  modo: EstoqueInicialModo,
  inicios: InicioDaNacao[],
): void {
  const estoque = dados.estoque_inicial.find((linha) => linha.modo === modo);
  if (!estoque) return;
  for (const { nacao, zona } of inicios) {
    if (!ctx.state.estoques[nacao]) continue;
    const nave = criarEstrutura(ctx, nacao, 'ship', normalizar(zona));
    if (nave === null) continue;
    for (const r of dados.recursos) ctx.state.estoques[nacao]![r.id] = estoque[r.id];
    ctx.state.energia[nacao]!.banco = capacidadeDaRede(ctx.state, nacao);
    explorar(ctx, nacao, normalizar(zona), raioExploradoInicial());
    nascer(ctx, nave, 'hover_explorer', false);
  }
}

function ehModo(modo: unknown): modo is EstoqueInicialModo {
  return dados.estoque_inicial.some((linha) => linha.modo === modo);
}

const MODOS_DE_NEVOA: readonly ModoNevoa[] = ['normal', 'explorado', 'revelado'];

export const comandosDeInicio: Record<string, CommandHandler> = {
  /** CAM-06: no início da missão, monta o oponente sem Nave (a nação que envia). */
  [MONTAR_SEM_NAVE_COMMAND]: (ctx, comando) => {
    const d = (comando.dados ?? {}) as { tipo?: unknown; centro?: unknown };
    const c = d.centro;
    if (typeof d.tipo !== 'string' || !Array.isArray(c) || c.length !== 3) return;
    if (!c.every((v) => typeof v === 'number' && Number.isFinite(v))) return;
    montarSemNave(ctx, comando.nacao, d.tipo, normalizar(c as Vec3));
  },
  /**
   * Monta o início da partida para todas as nações listadas (enviado uma vez, no tick 0).
   * Opcionais do Free Battle (§16): `nevoa` (FB-01) e `tempoLimite_s` (REG-12).
   */
  [INICIAR_PARTIDA_COMMAND]: (ctx, comando) => {
    const d = (comando.dados ?? {}) as {
      modo?: unknown;
      nacoes?: unknown;
      nevoa?: unknown;
      tempoLimite_s?: unknown;
      liberados?: unknown;
    };
    if (!ehModo(d.modo) || !Array.isArray(d.nacoes)) return;
    // CAM-02: na campanha, só os itens liberados podem ser impressos ou posicionados.
    if (Array.isArray(d.liberados) && d.liberados.every((i) => typeof i === 'string')) {
      ctx.state.liberados = [...(d.liberados as string[])];
    }
    if (MODOS_DE_NEVOA.includes(d.nevoa as ModoNevoa)) ctx.state.modoNevoa = d.nevoa as ModoNevoa;
    if (typeof d.tempoLimite_s === 'number' && d.tempoLimite_s > 0) {
      ctx.state.tempoLimite_s = d.tempoLimite_s;
    }
    const inicios = d.nacoes.filter(
      (n): n is InicioDaNacao =>
        typeof n === 'object' &&
        n !== null &&
        typeof (n as InicioDaNacao).nacao === 'string' &&
        Array.isArray((n as InicioDaNacao).zona) &&
        (n as InicioDaNacao).zona.length === 3 &&
        (n as InicioDaNacao).zona.every((v) => typeof v === 'number' && Number.isFinite(v)),
    );
    iniciarPartida(ctx, d.modo, inicios);
  },
};
