/**
 * Pathfinding na grade de navegação (MOV-05, TEC-14): A* para unidades isoladas e campo de
 * fluxo (Dijkstra) para grupos. 8 direções, sem cortar quinas; custos 10 (reto) e 14 (diagonal).
 * `bloqueado` marca células ocupadas por obstáculos rígidos (estruturas e jazidas).
 */
import type { Ponto } from '../core/components';
import { celulaDe, centroDaCelula, type GradeNavegacao } from './grids';

const DX = [1, -1, 0, 0, 1, 1, -1, -1];
const DZ = [0, 0, 1, -1, 1, -1, 1, -1];
const CUSTO = [10, 10, 10, 10, 14, 14, 14, 14];
const INFINITO = 0x3fffffff;

export interface Navegavel {
  nav: GradeNavegacao;
  bloqueado: Uint8Array | null;
}

export function livre(g: Navegavel, indice: number): boolean {
  return g.nav.passavel[indice] === 1 && (g.bloqueado === null || g.bloqueado[indice] !== 1);
}

/** Passo de `indice` na direção d, ou −1 se sai da grade, está bloqueado ou corta quina. */
function vizinho(g: Navegavel, indice: number, d: number): number {
  const { colunas, linhas } = g.nav;
  const x = indice % colunas;
  const z = (indice - x) / colunas;
  const nx = x + DX[d]!;
  const nz = z + DZ[d]!;
  if (nx < 0 || nz < 0 || nx >= colunas || nz >= linhas) return -1;
  const v = nz * colunas + nx;
  if (!livre(g, v)) return -1;
  if (d >= 4 && (!livre(g, z * colunas + nx) || !livre(g, nz * colunas + x))) return -1;
  return v;
}

/** Célula livre mais próxima (busca em anéis), ou −1. */
export function celulaLivreProxima(g: Navegavel, x: number, z: number, raioCelulas = 24): number {
  const { colunas, linhas, meio_m, celula_m } = g.nav;
  const ci = Math.min(colunas - 1, Math.max(0, Math.floor((x + meio_m) / celula_m)));
  const cj = Math.min(linhas - 1, Math.max(0, Math.floor((z + meio_m) / celula_m)));
  for (let r = 0; r <= raioCelulas; r++) {
    let melhor = -1;
    let melhorD = Infinity;
    for (let dj = -r; dj <= r; dj++) {
      for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        const i = ci + di;
        const j = cj + dj;
        if (i < 0 || j < 0 || i >= colunas || j >= linhas) continue;
        const v = j * colunas + i;
        if (!livre(g, v)) continue;
        const [cx, cz] = centroDaCelula(g.nav, i, j);
        const d = (cx - x) ** 2 + (cz - z) ** 2;
        if (d < melhorD) {
          melhorD = d;
          melhor = v;
        }
      }
    }
    if (melhor >= 0) return melhor;
  }
  return -1;
}

export function centroDoIndice(nav: GradeNavegacao, indice: number): Ponto {
  const x = indice % nav.colunas;
  return centroDaCelula(nav, x, (indice - x) / nav.colunas);
}

/**
 * Há linha de visada livre entre dois pontos? Percorre exatamente as células cruzadas pelo
 * segmento (supercover); ao passar bem na quina, exige as duas vizinhas livres.
 */
export function linhaLivre(g: Navegavel, a: Ponto, b: Ponto): boolean {
  const { colunas, linhas, meio_m, celula_m } = g.nav;
  const ax = (a[0] + meio_m) / celula_m;
  const az = (a[1] + meio_m) / celula_m;
  const bx = (b[0] + meio_m) / celula_m;
  const bz = (b[1] + meio_m) / celula_m;
  let x = Math.floor(ax);
  let z = Math.floor(az);
  const fimX = Math.floor(bx);
  const fimZ = Math.floor(bz);
  const dentroLivre = (i: number, j: number) =>
    i >= 0 && j >= 0 && i < colunas && j < linhas && livre(g, j * colunas + i);
  if (!dentroLivre(x, z) || !dentroLivre(fimX, fimZ)) return false;
  const dx = bx - ax;
  const dz = bz - az;
  const passoX = dx > 0 ? 1 : -1;
  const passoZ = dz > 0 ? 1 : -1;
  const deltaX = dx === 0 ? Infinity : Math.abs(1 / dx);
  const deltaZ = dz === 0 ? Infinity : Math.abs(1 / dz);
  let proxX = dx === 0 ? Infinity : (dx > 0 ? x + 1 - ax : ax - x) * deltaX;
  let proxZ = dz === 0 ? Infinity : (dz > 0 ? z + 1 - az : az - z) * deltaZ;
  const EPS = 1e-9;
  while (x !== fimX || z !== fimZ) {
    if (Math.abs(proxX - proxZ) < EPS) {
      if (!dentroLivre(x + passoX, z) || !dentroLivre(x, z + passoZ)) return false;
      x += passoX;
      z += passoZ;
      proxX += deltaX;
      proxZ += deltaZ;
    } else if (proxX < proxZ) {
      x += passoX;
      proxX += deltaX;
    } else {
      z += passoZ;
      proxZ += deltaZ;
    }
    if (proxX > 1 + EPS && proxZ > 1 + EPS && (x !== fimX || z !== fimZ)) {
      // arredondamento: o segmento acabou; confere a célula final
      return dentroLivre(fimX, fimZ) && dentroLivre(x, z);
    }
    if (!dentroLivre(x, z)) return false;
  }
  return true;
}

// Buffers reaproveitados entre buscas (a simulação é de uma thread só).
let tamanho = 0;
let custoG = new Int32Array(0);
let anterior = new Int32Array(0);
let fechado = new Uint8Array(0);
let heapNo = new Int32Array(0);
let heapF = new Int32Array(0);

function garantirBuffers(n: number): void {
  if (n === tamanho) return;
  tamanho = n;
  custoG = new Int32Array(n);
  anterior = new Int32Array(n);
  fechado = new Uint8Array(n);
  heapNo = new Int32Array(n * 2);
  heapF = new Int32Array(n * 2);
}

/**
 * A* de `origem` a `destino` (mundo). Devolve os pontos de passagem já suavizados, terminando
 * no destino (ou na célula livre mais próxima dele); null se não há caminho.
 */
export function aEstrela(g: Navegavel, origem: Ponto, destino: Ponto): Ponto[] | null {
  const { nav } = g;
  const inicio = celulaLivreProxima(g, origem[0], origem[1]);
  const fim = celulaLivreProxima(g, destino[0], destino[1]);
  if (inicio < 0 || fim < 0) return null;
  const n = nav.colunas * nav.linhas;
  garantirBuffers(n);
  custoG.fill(INFINITO);
  fechado.fill(0);
  const fx = fim % nav.colunas;
  const fz = (fim - fx) / nav.colunas;
  const h = (i: number) => {
    const x = i % nav.colunas;
    const dx = Math.abs(x - fx);
    const dz = Math.abs((i - x) / nav.colunas - fz);
    return 10 * Math.max(dx, dz) + 4 * Math.min(dx, dz);
  };

  let tamHeap = 0;
  const empurrar = (no: number, f: number) => {
    let i = tamHeap++;
    while (i > 0) {
      const pai = (i - 1) >> 1;
      if (heapF[pai]! <= f) break;
      heapNo[i] = heapNo[pai]!;
      heapF[i] = heapF[pai]!;
      i = pai;
    }
    heapNo[i] = no;
    heapF[i] = f;
  };
  const tirar = (): number => {
    const topo = heapNo[0]!;
    const ultimoNo = heapNo[--tamHeap]!;
    const ultimoF = heapF[tamHeap]!;
    let i = 0;
    for (;;) {
      let filho = 2 * i + 1;
      if (filho >= tamHeap) break;
      if (filho + 1 < tamHeap && heapF[filho + 1]! < heapF[filho]!) filho++;
      if (heapF[filho]! >= ultimoF) break;
      heapNo[i] = heapNo[filho]!;
      heapF[i] = heapF[filho]!;
      i = filho;
    }
    heapNo[i] = ultimoNo;
    heapF[i] = ultimoF;
    return topo;
  };

  custoG[inicio] = 0;
  anterior[inicio] = inicio;
  empurrar(inicio, h(inicio));
  let achou = false;
  while (tamHeap > 0) {
    const atual = tirar();
    if (fechado[atual] === 1) continue;
    if (atual === fim) {
      achou = true;
      break;
    }
    fechado[atual] = 1;
    for (let d = 0; d < 8; d++) {
      const v = vizinho(g, atual, d);
      if (v < 0 || fechado[v] === 1) continue;
      const custo = custoG[atual]! + CUSTO[d]!;
      if (custo < custoG[v]!) {
        custoG[v] = custo;
        anterior[v] = atual;
        empurrar(v, custo + h(v));
      }
    }
  }
  if (!achou) return null;

  const celulas: number[] = [];
  for (let c = fim; c !== inicio; c = anterior[c]!) celulas.push(c);
  celulas.reverse();
  const pontos = celulas.map((c) => centroDoIndice(nav, c));
  const destinoFinal: Ponto =
    fim === celulaLivreProxima(g, destino[0], destino[1], 0) ? destino : centroDoIndice(nav, fim);
  if (pontos.length > 0) pontos[pontos.length - 1] = destinoFinal;
  else pontos.push(destinoFinal);
  return suavizar(g, origem, pontos);
}

/** Puxa o fio: pula pontos intermediários enquanto houver linha de visada. */
function suavizar(g: Navegavel, origem: Ponto, pontos: Ponto[]): Ponto[] {
  const saida: Ponto[] = [];
  let de = origem;
  let i = 0;
  while (i < pontos.length) {
    let j = i;
    while (j + 1 < pontos.length && linhaLivre(g, de, pontos[j + 1]!)) j++;
    saida.push(pontos[j]!);
    de = pontos[j]!;
    i = j + 1;
  }
  return saida;
}

/** Células livres da grade (passável e não bloqueada), 1 = livre. */
let livresBuf = new Uint8Array(0);
function mapaDeLivres(g: Navegavel): Uint8Array {
  const { passavel } = g.nav;
  if (g.bloqueado === null) return passavel;
  if (livresBuf.length !== passavel.length) livresBuf = new Uint8Array(passavel.length);
  const b = g.bloqueado;
  for (let i = 0; i < passavel.length; i++) livresBuf[i] = passavel[i] === 1 && b[i] !== 1 ? 1 : 0;
  return livresBuf;
}

// Fila de baldes do campo de fluxo, reaproveitada entre chamadas: BALDES pilhas de até n itens
// num único buffer (a pilha b ocupa [b·n, (b+1)·n)). Cada célula entra no máximo uma vez por
// balde vivo, então n basta.
const BALDES = 15;
let filaBuf = new Int32Array(0);
const topos = new Int32Array(BALDES);

/** Campo de fluxo: custo (10/14 por passo) de cada célula até o destino; −1 onde não alcança. */
export function campoDeFluxo(g: Navegavel, destino: Ponto): Int32Array {
  const { colunas, linhas } = g.nav;
  const n = colunas * linhas;
  const dist = new Int32Array(n).fill(-1);
  const fim = celulaLivreProxima(g, destino[0], destino[1]);
  if (fim < 0) return dist;
  const ok = mapaDeLivres(g);
  // Borda da grade tratada como bloqueada: nenhuma célula da borda expande, e nenhuma
  // vizinha fora da grade é visitada. (A faixa de borda do mapa já é intransponível.)
  if (filaBuf.length !== n * BALDES) filaBuf = new Int32Array(n * BALDES);
  const fila = filaBuf;
  topos.fill(0);
  const desloc = new Int32Array(8);
  for (let d = 0; d < 8; d++) desloc[d] = DZ[d]! * colunas + DX[d]!;
  dist[fim] = 0;
  fila[0] = fim;
  topos[0] = 1;
  let pendentes = 1;
  for (let custoAtual = 0; pendentes > 0; custoAtual++) {
    const b = custoAtual % BALDES;
    const base = b * n;
    while (topos[b]! > 0) {
      const atual = fila[base + --topos[b]!]!;
      pendentes--;
      if (dist[atual] !== custoAtual) continue;
      const x = atual % colunas;
      const z = (atual - x) / colunas;
      if (x === 0 || z === 0 || x === colunas - 1 || z === linhas - 1) continue;
      for (let d = 0; d < 8; d++) {
        const v = atual + desloc[d]!;
        if (ok[v] !== 1) continue;
        if (d >= 4 && (ok[atual + DX[d]!] !== 1 || ok[atual + DZ[d]! * colunas] !== 1)) continue;
        const custo = custoAtual + (d < 4 ? 10 : 14);
        const dv = dist[v]!;
        if (dv === -1 || custo < dv) {
          dist[v] = custo;
          const bv = custo % BALDES;
          fila[bv * n + topos[bv]!++] = v;
          pendentes++;
        }
      }
    }
  }
  return dist;
}

/** Próximo passo pelo campo de fluxo a partir de (x, z): centro da vizinha mais barata, ou null. */
export function passoDoFluxo(g: Navegavel, campo: Int32Array, x: number, z: number): Ponto | null {
  const celula = celulaDe(g.nav, x, z);
  if (!celula) return null;
  const aqui = celula[1] * g.nav.colunas + celula[0];
  let melhor = -1;
  let melhorCusto = campo[aqui]! >= 0 ? campo[aqui]! : INFINITO;
  for (let d = 0; d < 8; d++) {
    const v = vizinho(g, aqui, d);
    if (v < 0 || campo[v]! < 0) continue;
    if (campo[v]! < melhorCusto) {
      melhorCusto = campo[v]!;
      melhor = v;
    }
  }
  return melhor < 0 ? null : centroDoIndice(g.nav, melhor);
}
