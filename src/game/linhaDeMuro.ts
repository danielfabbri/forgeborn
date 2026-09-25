/**
 * UNI-08: Muro posicionado em linha arrastando o mouse. Os segmentos vão do ponto inicial ao
 * final, um a cada pegada medida na grade local (as pegadas quadradas se tocam sem se sobrepor,
 * também na diagonal), com a frente no eixo local dominante da linha.
 */
import { arco, avancar, norteEm, produtoVetorial, tangente, type Vec3 } from '../sim/map/esfera';

/** Folga (m) entre segmentos, contra o arredondamento na validação (apresentação). */
const FOLGA_M = 0.02;

export function segmentosDaLinha(
  de: Vec3,
  ate: Vec3,
  pegada: number,
  raio: number,
): { pontos: Vec3[]; frente: Vec3 } | null {
  const rumo = tangente(de, ate);
  if (!rumo) return null;
  const norte = norteEm(de);
  const leste = produtoVetorial(norte, de);
  const eixoN = rumo[0] * norte[0] + rumo[1] * norte[1] + rumo[2] * norte[2];
  const eixoL = rumo[0] * leste[0] + rumo[1] * leste[1] + rumo[2] * leste[2];
  const passo = pegada / Math.max(Math.abs(eixoN), Math.abs(eixoL)) + FOLGA_M;
  const total = arco(de, ate) * raio;
  const pontos: Vec3[] = [];
  for (let k = 0; k * passo <= total + 1e-6; k++)
    pontos.push(avancar(de, rumo, (k * passo) / raio).p);
  return { pontos, frente: Math.abs(eixoN) >= Math.abs(eixoL) ? norte : leste };
}
