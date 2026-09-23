import { arco, centroDaCelula, type Vec3 } from './esfera';
import { celulaDe, type GradeNavegacao } from './grids';

/**
 * Células transponíveis alcançáveis a partir de `inicio`, andando só entre vizinhas de lado
 * (critério conservador: se liga assim, liga para qualquer pathfinding).
 */
export function componenteConectado(nav: GradeNavegacao, inicio: number): Uint8Array {
  const total = nav.esfera.celulas;
  const marcado = new Uint8Array(total);
  if (nav.passavel[inicio] !== 1) return marcado;
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
      if (v < 0 || marcado[v] === 1 || nav.passavel[v] !== 1) continue;
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
  const esfera = nav.esfera;
  const limite = raio_m / nav.raio_m;
  // Um pouco de folga para expandir células cujo centro fica logo além do raio.
  const expandir = limite + 1.2 * esfera.anguloNominal;
  const inicio = celulaDe(nav, d);
  const vistos = new Set<number>([inicio]);
  const fila = [inicio];
  const dentro: number[] = [];
  for (let k = 0; k < fila.length; k++) {
    const c = fila[k]!;
    const a = arco(d, centroDaCelula(esfera, c));
    if (a <= limite) dentro.push(c);
    if (a > expandir) continue;
    for (let v = 0; v < 8; v++) {
      const w = esfera.vizinhos[c * 8 + v]!;
      if (w < 0 || vistos.has(w)) continue;
      vistos.add(w);
      fila.push(w);
    }
  }
  return dentro;
}

/** Todas as células cujo centro está a até `raio_m` de d são transponíveis? */
export function temFolga(nav: GradeNavegacao, d: Vec3, raio_m: number): boolean {
  return celulasNoRaio(nav, d, raio_m).every((c) => nav.passavel[c] === 1);
}
