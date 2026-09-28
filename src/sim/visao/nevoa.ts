/**
 * Névoa de guerra na simulação (VIS-01 a VIS-03): cada nação tem uma grade de células de
 * `celula_nevoa_m` com três estados — 0 escuro absoluto, 1 névoa (explorado), 2 visível. A
 * visão é circular (`visao_m`), sem bloqueio por relevo, compartilhada pela nação (CMB-17) e
 * atualizada a `nevoa_atualizacao_hz` (sistema `visao`). Sem mapa (testes), tudo é visível.
 */
import { entitiesWith, getComponent } from '../core/entities';
import type { SystemContext } from '../core/pipeline';
import type { SimState } from '../core/state';
import type { EntityId, NacaoId } from '../core/types';
import { param } from '../data';
import { arco, type Vec3 } from '../map/esfera';
import { celulaDe, centroDaCelula, type Grade } from '../map/grids';
import { statsEstrutura, statsMovel } from '../units/stats';
import { direcaoDe, distanciaM } from '../units/superficie';
import { satelitesAtivos, varredurasAtivas } from './satelite';
import { multVisao } from '../cenario/tempestade';

export const ESCURO = 0;
export const NEVOA = 1;
export const VISIVEL = 2;

/** Marcas de visita por grade (busca em largura sem Set). */
const marcas = new WeakMap<Grade, { visto: Int32Array; geracao: number }>();

/** Células cujo centro está a até `raio_m` de d (busca em largura pelos vizinhos). */
export function celulasNoRaio(grade: Grade, d: Vec3, raio_m: number, saida: number[]): void {
  const esfera = grade.esfera;
  let m = marcas.get(grade);
  if (!m) {
    m = { visto: new Int32Array(esfera.celulas), geracao: 0 };
    marcas.set(grade, m);
  }
  const geracao = ++m.geracao;
  const limite = raio_m / grade.raio_m;
  const expandir = limite + 1.2 * esfera.anguloNominal;
  const inicio = celulaDe(grade, d);
  saida.length = 0;
  const fila = [inicio];
  m.visto[inicio] = geracao;
  for (let k = 0; k < fila.length; k++) {
    const c = fila[k]!;
    const a = arco(d, centroDaCelula(grade, c));
    if (a <= limite) saida.push(c);
    if (a > expandir) continue;
    for (let v = 0; v < 8; v++) {
      const w = esfera.vizinhos[c * 8 + v]!;
      if (w < 0 || m.visto[w] === geracao) continue;
      m.visto[w] = geracao;
      fila.push(w);
    }
  }
}

function grade(ctx: SystemContext): Grade | null {
  return ctx.mundo?.grades.nevoa ?? null;
}

/** Estado inicial das células pelo modo de névoa (REG-07, FB-01). */
const INICIAL = { normal: ESCURO, explorado: NEVOA, revelado: VISIVEL } as const;

/** A grade da nação, criada na primeira vez: escura, em névoa ou visível (FB-01). */
function gradeDa(state: SimState, nacao: NacaoId, celulas: number): number[] {
  let g = state.nevoa[nacao];
  if (!g || g.length !== celulas) {
    g = new Array<number>(celulas).fill(INICIAL[state.modoNevoa ?? 'normal']);
    state.nevoa[nacao] = g;
  }
  return g;
}

/** Raio de visão do corpo (VIS-02, VIS-03); canteiros e reservas não enxergam. */
function visaoDe(state: SimState, id: EntityId): number {
  return visaoBase(state, id) * multVisao(state);
}

function visaoBase(state: SimState, id: EntityId): number {
  const unidade = getComponent(state, id, 'unit');
  if (unidade) {
    // UNI-03: em Sentinela, a visão é `sentinela_visao_m`.
    if (getComponent(state, id, 'sentinela')?.estado === 'ativo') return param('sentinela_visao_m');
    return statsMovel(unidade.tipo).visao_m;
  }
  const estrutura = getComponent(state, id, 'structure');
  if (estrutura && !getComponent(state, id, 'obra')) {
    const stats = statsEstrutura(estrutura.tipo);
    // UNI-14 (D-83): estrutura com manutenção, sem energia, não enxerga.
    if (stats.manutencao_en_s > 0 && (getComponent(state, id, 'consumidor')?.atendido ?? 1) <= 0)
      return 0;
    return stats.visao_m;
  }
  return 0;
}

const buffer: number[] = [];

/** Sistema `visao` (TEC-06): refaz o que cada nação vê agora. */
export function sistemaVisao(ctx: SystemContext): void {
  const g = grade(ctx);
  if (!g) return;
  const { state } = ctx;
  const n = g.esfera.celulas;
  // FB-01: revelado, tudo visível o tempo todo.
  if (state.modoNevoa === 'revelado') {
    for (const nacao of state.nacoes) gradeDa(state, nacao, n).fill(VISIVEL);
    return;
  }
  for (const nacao of state.nacoes) {
    const estados = gradeDa(state, nacao, n);
    for (let c = 0; c < n; c++) if (estados[c] === VISIVEL) estados[c] = NEVOA;
  }
  for (const id of entitiesWith(state, 'owner', 'position')) {
    const raio = visaoDe(state, id);
    if (raio <= 0) continue;
    const estados = gradeDa(state, getComponent(state, id, 'owner')!.nacao, n);
    celulasNoRaio(g, direcaoDe(getComponent(state, id, 'position')!), raio, buffer);
    for (const c of buffer) estados[c] = VISIVEL;
  }
  // VIS-08: visão persistente dos satélites e as Varreduras Orbitais.
  const circulos = [
    ...satelitesAtivos(ctx).map((s) => ({ ...s, raio: param('satelite_visao_m') })),
    ...varredurasAtivas(ctx).map((v) => ({ ...v, raio: param('varredura_raio_m') })),
  ];
  for (const { nacao, ponto, raio } of circulos) {
    const estados = gradeDa(state, nacao, n);
    celulasNoRaio(g, ponto, raio, buffer);
    for (const c of buffer) estados[c] = VISIVEL;
  }
}

/** REG-07: área explorada em volta de d (a varredura da descida). */
export function explorar(ctx: SystemContext, nacao: NacaoId, d: Vec3, raio_m: number): void {
  const g = grade(ctx);
  if (!g) return;
  const estados = gradeDa(ctx.state, nacao, g.esfera.celulas);
  celulasNoRaio(g, d, raio_m, buffer);
  for (const c of buffer) if (estados[c] === ESCURO) estados[c] = NEVOA;
}

/** Estado da névoa da nação no ponto d (VIS-01). Sem mapa, visível. */
export function estadoEm(ctx: SystemContext, nacao: NacaoId, d: Vec3): number {
  const g = grade(ctx);
  if (!g) return VISIVEL;
  const estados = ctx.state.nevoa[nacao];
  return estados?.[celulaDe(g, d)] ?? ESCURO;
}

export function explorado(ctx: SystemContext, nacao: NacaoId, d: Vec3): boolean {
  return estadoEm(ctx, nacao, d) !== ESCURO;
}

/**
 * O corpo está visível para a nação agora? Os próprios, sempre. Furtivos só revelados (VIS-05),
 * e a Sentinela também de perto (CMB-22).
 */
export function visivelPara(ctx: SystemContext, nacao: NacaoId, id: EntityId): boolean {
  if (getComponent(ctx.state, id, 'owner')?.nacao === nacao) return true;
  // CMB-28: hover recolhido não aparece para o inimigo.
  if (getComponent(ctx.state, id, 'abrigo')?.estado === 'dentro') return false;
  // D-51: o satélite inimigo aparece quando o ponto sob ele está visível.
  const satelite = getComponent(ctx.state, id, 'satelite');
  if (satelite)
    return satelite.estado === 'orbita' && estadoEm(ctx, nacao, satelite.ponto) === VISIVEL;
  const pos = getComponent(ctx.state, id, 'position');
  if (pos === undefined || estadoEm(ctx, nacao, direcaoDe(pos)) !== VISIVEL) return false;
  if (!furtivo(ctx.state, id)) return true;
  if (revelado(ctx, nacao, id)) return true;
  return getComponent(ctx.state, id, 'sentinela') !== undefined && pertoDaSentinela(ctx, nacao, id);
}

/** Raio da área explorada inicial (REG-07). */
export const raioExploradoInicial = (): number => param('raio_explorado_inicial_m');

/** Raio de detecção do corpo (VIS-05): `deteccao_m`, ou `sentinela_deteccao_m` em Sentinela. */
export function raioDeDeteccao(state: SimState, id: EntityId): number {
  const unidade = getComponent(state, id, 'unit');
  if (unidade) {
    if (getComponent(state, id, 'sentinela')?.estado === 'ativo')
      return param('sentinela_deteccao_m');
    return statsMovel(unidade.tipo).deteccao_m;
  }
  const estrutura = getComponent(state, id, 'structure');
  if (estrutura && !getComponent(state, id, 'obra'))
    return statsEstrutura(estrutura.tipo).deteccao_m;
  return 0;
}

/** Furtivo (CMB-19, CMB-22): mina plantada ou Hover de Observação em Sentinela. */
export function furtivo(state: SimState, id: EntityId): boolean {
  return (
    getComponent(state, id, 'mine') !== undefined ||
    getComponent(state, id, 'sentinela')?.estado === 'ativo'
  );
}

/** VIS-05: algum detector da nação a até o seu raio de detecção, com o ponto visível. */
export function revelado(ctx: SystemContext, nacao: NacaoId, id: EntityId): boolean {
  const { state } = ctx;
  const d = direcaoDe(getComponent(state, id, 'position')!);
  if (estadoEm(ctx, nacao, d) !== VISIVEL) return false;
  return entitiesWith(state, 'owner', 'position').some((det) => {
    if (getComponent(state, det, 'owner')!.nacao !== nacao) return false;
    const raio = raioDeDeteccao(state, det);
    return raio > 0 && distanciaM(ctx, d, direcaoDe(getComponent(state, det, 'position')!)) <= raio;
  });
}

/** CMB-22: a Sentinela aparece para quem chega a até `sentinela_camuflagem_m`. */
function pertoDaSentinela(ctx: SystemContext, nacao: NacaoId, id: EntityId): boolean {
  const { state } = ctx;
  const d = direcaoDe(getComponent(state, id, 'position')!);
  return entitiesWith(state, 'owner', 'position').some(
    (outro) =>
      getComponent(state, outro, 'owner')!.nacao === nacao &&
      distanciaM(ctx, d, direcaoDe(getComponent(state, outro, 'position')!)) <=
        param('sentinela_camuflagem_m'),
  );
}

/** Minas inimigas que a nação vê agora (CMB-20: viram alvo e obstáculo para a rota). */
export function minasReveladas(ctx: SystemContext, nacao: NacaoId): EntityId[] {
  return entitiesWith(ctx.state, 'mine', 'owner', 'position').filter(
    (id) => getComponent(ctx.state, id, 'owner')!.nacao !== nacao && revelado(ctx, nacao, id),
  );
}
