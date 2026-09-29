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

const terras = new WeakMap<GradeNavegacao, Int32Array>();
const aguas = new WeakMap<GradeNavegacao, Int32Array>();

/** Rótulos dos componentes (vizinhas de lado) das células com `marca[c] === 1`. */
function rotular(nav: GradeNavegacao, marca: Uint8Array): Int32Array {
  const total = nav.esfera.celulas;
  const rotulo = new Int32Array(total).fill(-1);
  const fila = new Int32Array(total);
  const vizinhos = nav.esfera.vizinhos;
  let proximo = 0;
  for (let c = 0; c < total; c++) {
    if (rotulo[c] !== -1 || marca[c] !== 1) continue;
    let cabeca = 0;
    let fim = 0;
    rotulo[c] = proximo;
    fila[fim++] = c;
    while (cabeca < fim) {
      const atual = fila[cabeca++]!;
      for (let d = 0; d < 4; d++) {
        const v = vizinhos[atual * 8 + d]!;
        if (v < 0 || rotulo[v] !== -1 || marca[v] !== 1) continue;
        rotulo[v] = proximo;
        fila[fim++] = v;
      }
    }
    proximo++;
  }
  return rotulo;
}

/** IA-14 (D-90): rótulo do corpo de líquido (mar ou lago) de cada célula (−1 fora dele). */
export function rotulosDeAgua(nav: GradeNavegacao): Int32Array {
  const pronto = aguas.get(nav);
  if (pronto) return pronto;
  const rotulo = rotular(nav, nav.liquido ?? new Uint8Array(nav.esfera.celulas));
  aguas.set(nav, rotulo);
  return rotulo;
}

/**
 * IA-14 (D-90): rótulo da "terra" de cada célula: células transitáveis ligadas por terra têm o
 * mesmo rótulo (−1 fora da terra). Só o relevo e o líquido (sem obstáculos), calculado uma vez.
 */
export function rotulosDeTerra(nav: GradeNavegacao): Int32Array {
  const pronto = terras.get(nav);
  if (pronto) return pronto;
  const rotulo = rotular(nav, nav.passavel);
  terras.set(nav, rotulo);
  return rotulo;
}

/** IA-14: a e b estão na mesma terra (há caminho de solo entre elas, sem o mar)? */
export function mesmaTerra(nav: GradeNavegacao, a: Vec3, b: Vec3): boolean {
  const rotulo = rotulosDeTerra(nav);
  const ra = rotulo[celulaDe(nav, a)]!;
  return ra >= 0 && ra === rotulo[celulaDe(nav, b)];
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
