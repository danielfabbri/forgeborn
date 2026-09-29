/**
 * Posicionamento de Muro e Portão (UNI-08, UNI-09, D-56): giro livre pelo arrasto e encaixe na
 * ponta livre de outro segmento próprio. Só leitura do estado; o comando leva centro e rumo.
 */
import { entitiesWith, getComponent, type EntityId, type SimState } from '../sim';
import { dados } from '../sim/data';
import {
  arco,
  avancar,
  norteEm,
  produtoEscalar,
  produtoVetorial,
  type Vec3,
} from '../sim/map/esfera';
import { ehSegmento, pontas, rumoDoSegmento } from '../sim/units/segmentos';
import { direcaoDe } from '../sim/units/superficie';

/** Apresentação: distância (m) do cursor à ponta livre para encaixar, e o que conta como ponta ocupada. */
export const DISTANCIA_DE_ENCAIXE_M = 2.5;
const PONTA_OCUPADA_M = 0.5;

export const meioComprimento = (tipo: string): number =>
  dados.estruturas.find((e) => e.id === tipo)!.pegada_m / 2;

export interface PontaLivre {
  ponta: Vec3;
  /** Direção para fora do segmento, na ponta. */
  saida: Vec3;
}

/** Pontas livres dos Muros e Portões da nação (prontos, em obra ou reservados). */
export function pontasLivres(state: SimState, nacao: string, R: number): PontaLivre[] {
  const todas: Array<{ id: EntityId; ponta: Vec3; saida: Vec3 }> = [];
  for (const id of entitiesWith(state, 'structure', 'owner', 'position')) {
    if (getComponent(state, id, 'owner')!.nacao !== nacao) continue;
    const tipo = getComponent(state, id, 'structure')!.tipo;
    if (!ehSegmento(tipo)) continue;
    const c = direcaoDe(getComponent(state, id, 'position')!);
    const rumo = rumoDoSegmento(state, id, c);
    const [a, b] = pontas(R, c, rumo, meioComprimento(tipo));
    todas.push({ id, ponta: a, saida: avancar(c, rumo, meioComprimento(tipo) / R).rumo });
    const volta: Vec3 = [-rumo[0], -rumo[1], -rumo[2]];
    todas.push({ id, ponta: b, saida: avancar(c, volta, meioComprimento(tipo) / R).rumo });
  }
  return todas
    .filter(
      (p) => !todas.some((q) => q.id !== p.id && arco(p.ponta, q.ponta) * R < PONTA_OCUPADA_M),
    )
    .map(({ ponta, saida }) => ({ ponta, saida }));
}

/** A ponta livre mais perto de `d`, até `DISTANCIA_DE_ENCAIXE_M`, ou null. */
export function encaixeEm(livres: readonly PontaLivre[], d: Vec3, R: number): PontaLivre | null {
  let melhor: PontaLivre | null = null;
  let menor = DISTANCIA_DE_ENCAIXE_M;
  for (const p of livres) {
    const dist = arco(p.ponta, d) * R;
    if (dist < menor) {
      menor = dist;
      melhor = p;
    }
  }
  return melhor;
}

/** Centro do segmento: no pivô (livre) ou meio comprimento além da ponta encaixada. */
export function centroDoSegmento(
  tipo: string,
  pivo: Vec3,
  rumo: Vec3,
  encaixado: boolean,
  R: number,
): { centro: Vec3; rumo: Vec3 } {
  if (!encaixado) return { centro: pivo, rumo };
  const passo = avancar(pivo, rumo, meioComprimento(tipo) / R);
  return { centro: passo.p, rumo: passo.rumo };
}

/** Ângulo (rad) do rumo a partir do norte local, para lembrar o giro entre posicionamentos. */
export function anguloDoRumo(d: Vec3, rumo: Vec3): number {
  const norte = norteEm(d);
  const leste = produtoVetorial(norte, d);
  return Math.atan2(produtoEscalar(rumo, leste), produtoEscalar(rumo, norte));
}

export function rumoDoAngulo(d: Vec3, angulo: number): Vec3 {
  const norte = norteEm(d);
  const leste = produtoVetorial(norte, d);
  return [
    norte[0] * Math.cos(angulo) + leste[0] * Math.sin(angulo),
    norte[1] * Math.cos(angulo) + leste[1] * Math.sin(angulo),
    norte[2] * Math.cos(angulo) + leste[2] * Math.sin(angulo),
  ];
}
