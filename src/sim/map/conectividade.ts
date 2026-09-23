import { celulaDe, ehPassavel, type GradeNavegacao } from './grids';

/**
 * Células transponíveis alcançáveis a partir de (ci, cj), andando só entre vizinhas
 * de lado (critério conservador: se liga assim, liga para qualquer pathfinding).
 */
export function componenteConectado(nav: GradeNavegacao, ci: number, cj: number): Uint8Array {
  const { colunas, linhas } = nav;
  const marcado = new Uint8Array(colunas * linhas);
  if (!ehPassavel(nav, ci, cj)) return marcado;
  const fila = new Int32Array(colunas * linhas);
  let inicio = 0;
  let fim = 0;
  marcado[cj * colunas + ci] = 1;
  fila[fim++] = cj * colunas + ci;
  const visitar = (v: number) => {
    if (marcado[v] === 1 || nav.passavel[v] !== 1) return;
    marcado[v] = 1;
    fila[fim++] = v;
  };
  while (inicio < fim) {
    const indice = fila[inicio++]!;
    const x = indice % colunas;
    if (x + 1 < colunas) visitar(indice + 1);
    if (x > 0) visitar(indice - 1);
    if (indice + colunas < colunas * linhas) visitar(indice + colunas);
    if (indice >= colunas) visitar(indice - colunas);
  }
  return marcado;
}

/** O ponto (x, z) está numa célula do componente? */
export function noComponente(
  nav: GradeNavegacao,
  componente: Uint8Array,
  x: number,
  z: number,
): boolean {
  const celula = celulaDe(nav, x, z);
  return celula !== null && componente[celula[1] * nav.colunas + celula[0]] === 1;
}

/** Todas as células cujo centro está a até `raio` m de (x, z) são transponíveis? */
export function temFolga(nav: GradeNavegacao, x: number, z: number, raio: number): boolean {
  const celula = celulaDe(nav, x, z);
  if (!celula) return false;
  const alcance = Math.ceil(raio / nav.celula_m) + 1;
  for (let dj = -alcance; dj <= alcance; dj++) {
    for (let di = -alcance; di <= alcance; di++) {
      const ci = celula[0] + di;
      const cj = celula[1] + dj;
      const cx = -nav.meio_m + (ci + 0.5) * nav.celula_m;
      const cz = -nav.meio_m + (cj + 0.5) * nav.celula_m;
      if (Math.hypot(cx - x, cz - z) > raio) continue;
      if (ci < 0 || cj < 0 || ci >= nav.colunas || cj >= nav.linhas) return false;
      if (!ehPassavel(nav, ci, cj)) return false;
    }
  }
  return true;
}
