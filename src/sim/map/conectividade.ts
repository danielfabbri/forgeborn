import type { Vec3 } from './esfera';
import { celulaDe, celulasNoRaioDa, type GradeNavegacao } from './grids';

/**
 * Células transponíveis alcançáveis a partir de `inicio`, andando só entre vizinhas de lado
 * (critério conservador: se liga assim, liga para qualquer pathfinding). Com `comMar`, o líquido
 * também liga (CEN-11).
 */
export function componenteConectado(
  nav: GradeNavegacao,
  inicio: number,
  /** CEN-11 (D-90): conta o líquido como caminho (travessia de barco). */
  comMar = false,
): Uint8Array {
  const total = nav.esfera.celulas;
  const marcado = new Uint8Array(total);
  const liquido = comMar ? nav.liquido : undefined;
  const anda = (c: number) => nav.passavel[c] === 1 || liquido?.[c] === 1;
  if (!anda(inicio)) return marcado;
  const fila = new Int32Array(total);
  let cabeca = 0;
  let fim = 0;
  marcado[inicio] = 1;
  fila[fim++] = inicio;
  const vizinhos = nav.esfera.vizinhos;
  while (cabeca < fim) {
    const atual = fila[cabeca++]!;
    for (let d = 0; d < 4; d++) {
      const v = vizinhos[atual * 8 + d]!;
      if (v < 0 || marcado[v] === 1 || !anda(v)) continue;
      marcado[v] = 1;
      fila[fim++] = v;
    }
  }
  return marcado;
}

/** A direção d está numa célula do componente? */
export function noComponente(nav: GradeNavegacao, componente: Uint8Array, d: Vec3): boolean {
  return componente[celulaDe(nav, d)] === 1;
}

/**
 * Células cujo centro está a até `raio_m` (arco) de d, por busca em largura a partir da célula
 * de d (as vizinhas de fora do raio não são expandidas).
 */
export function celulasNoRaio(nav: GradeNavegacao, d: Vec3, raio_m: number): number[] {
  return celulasNoRaioDa(nav, d, raio_m);
}

/** Todas as células cujo centro está a até `raio_m` de d são transponíveis? */
export function temFolga(nav: GradeNavegacao, d: Vec3, raio_m: number): boolean {
  return celulasNoRaio(nav, d, raio_m).every((c) => nav.passavel[c] === 1);
}
