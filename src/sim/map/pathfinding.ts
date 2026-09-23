/**
 * Pathfinding na grade de navegação da cubo-esfera (MOV-05, TEC-14): A* para unidades isoladas
 * e campo de fluxo (Dijkstra) para grupos. 8 vizinhas atravessando as arestas do cubo (7 nos
 * vértices), sem cortar quinas; custo inteiro pelo arco entre centros (~10 reto, ~14 diagonal).
 * `bloqueado` marca células ocupadas por obstáculos rígidos (estruturas e jazidas).
 */
import {
  arco,
  celulaDaDirecao,
  centroDaCelula,
  interpolarArco,
  LADOS_DA_DIAGONAL,
  type Vec3,
} from './esfera';
import type { GradeNavegacao } from './grids';

const INFINITO = 0x3fffffff;
/** Heurística do A*: fração do custo mínimo por arco, para continuar admissível com o arredondamento. */
const FATOR_HEURISTICA = 0.93;

export interface Navegavel {
  nav: GradeNavegacao;
  bloqueado: Uint8Array | null;
}

export function livre(g: Navegavel, indice: number): boolean {
  return g.nav.passavel[indice] === 1 && (g.bloqueado === null || g.bloqueado[indice] !== 1);
}

/** Passo da célula na direção d (0..7), ou −1 se não existe, está bloqueado ou corta quina. */
function vizinho(g: Navegavel, indice: number, d: number): number {
  const vizinhos = g.nav.esfera.vizinhos;
  const v = vizinhos[indice * 8 + d]!;
  if (v < 0 || !livre(g, v)) return -1;
  if (d >= 4) {
    const [l1, l2] = LADOS_DA_DIAGONAL[d - 4]!;
    const a = vizinhos[indice * 8 + l1]!;
    const b = vizinhos[indice * 8 + l2]!;
    if (a < 0 || b < 0 || !livre(g, a) || !livre(g, b)) return -1;
  }
  return v;
}

export function centroDoIndice(nav: GradeNavegacao, indice: number): Vec3 {
  return centroDaCelula(nav.esfera, indice);
}

export function celulaDoPonto(nav: GradeNavegacao, d: Vec3): number {
  return celulaDaDirecao(nav.esfera.n, d);
}

// Buffers reaproveitados entre buscas (a simulação é de uma thread só).
let tamanho = 0;
let custoG = new Int32Array(0);
let anterior = new Int32Array(0);
let fechado = new Uint8Array(0);
let heapNo = new Int32Array(0);
let heapF = new Int32Array(0);
let marca = new Int32Array(0);
let rodada = 0;

function garantirBuffers(n: number): void {
  if (n === tamanho) return;
  tamanho = n;
  custoG = new Int32Array(n);
  anterior = new Int32Array(n);
  fechado = new Uint8Array(n);
  heapNo = new Int32Array(n * 8);
  heapF = new Int32Array(n * 8);
  marca = new Int32Array(n);
  rodada = 0;
}

/**
 * Célula livre mais próxima de d (pelo arco), procurando até `raioCelulas` passos de vizinhança;
 * −1 se não há.
 */
export function celulaLivreProxima(g: Navegavel, d: Vec3, raioCelulas = 24): number {
  const { nav } = g;
  const inicio = celulaDoPonto(nav, d);
  if (livre(g, inicio)) return inicio;
  garantirBuffers(nav.esfera.celulas);
  rodada++;
  let camada = [inicio];
  marca[inicio] = rodada;
  let melhor = -1;
  let melhorArco = Infinity;
  let achouEm = -1;
  for (let passo = 0; passo < raioCelulas && camada.length > 0; passo++) {
    const proxima: number[] = [];
    for (const c of camada) {
      for (let k = 0; k < 8; k++) {
        const v = nav.esfera.vizinhos[c * 8 + k]!;
        if (v < 0 || marca[v] === rodada) continue;
        marca[v] = rodada;
        proxima.push(v);
        if (!livre(g, v)) continue;
        const a = arco(d, centroDaCelula(nav.esfera, v));
        if (a < melhorArco) {
          melhorArco = a;
          melhor = v;
        }
      }
    }
    // Achou: olha mais uma camada, que ainda pode ter uma mais perto (camadas não são círculos).
    if (melhor >= 0 && achouEm < 0) achouEm = passo;
    else if (achouEm >= 0) break;
    camada = proxima;
  }
  return melhor;
}

/**
 * Há linha de visada livre entre a e b pelo grande círculo? Amostra a cada terço de célula e,
 * quando a amostra passa para uma célula diagonal, exige as duas vizinhas de lado livres.
 */
export function linhaLivre(g: Navegavel, a: Vec3, b: Vec3): boolean {
  const { nav } = g;
  const passo = nav.esfera.anguloNominal / 3;
  const total = arco(a, b);
  const amostras = Math.max(1, Math.ceil(total / passo));
  let anteriorCelula = celulaDoPonto(nav, a);
  if (!livre(g, anteriorCelula)) return false;
  for (let k = 1; k <= amostras; k++) {
    const c = celulaDoPonto(nav, interpolarArco(a, b, k / amostras));
    if (c === anteriorCelula) continue;
    if (!livre(g, c)) return false;
    const base = anteriorCelula * 8;
    let direcao = -1;
    for (let d = 0; d < 8; d++) {
      if (nav.esfera.vizinhos[base + d] === c) {
        direcao = d;
        break;
      }
    }
    // Pulou uma célula (não vizinha) ou cortou uma quina: sem visada.
    if (direcao < 0 || (direcao >= 4 && vizinho(g, anteriorCelula, direcao) < 0)) return false;
    anteriorCelula = c;
  }
  return true;
}

/**
 * A* de `origem` a `destino` (direções). Devolve os pontos de passagem já suavizados, terminando
 * no destino (ou no centro da célula livre mais próxima dele); null se não há caminho.
 */
export function aEstrela(g: Navegavel, origem: Vec3, destino: Vec3): Vec3[] | null {
  const { nav } = g;
  const esfera = nav.esfera;
  const inicio = celulaLivreProxima(g, origem);
  const fim = celulaLivreProxima(g, destino);
  if (inicio < 0 || fim < 0) return null;
  garantirBuffers(esfera.celulas);
  custoG.fill(INFINITO);
  fechado.fill(0);
  const alvo = centroDaCelula(esfera, fim);
  const escala = (10 * FATOR_HEURISTICA) / esfera.anguloNominal;
  const c = esfera.centros;
  const h = (i: number) => {
    const x = c[3 * i]! * alvo[0] + c[3 * i + 1]! * alvo[1] + c[3 * i + 2]! * alvo[2];
    return Math.floor(Math.acos(x > 1 ? 1 : x < -1 ? -1 : x) * escala);
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
      const custo = custoG[atual]! + esfera.custos[atual * 8 + d]!;
      if (custo < custoG[v]!) {
        custoG[v] = custo;
        anterior[v] = atual;
        empurrar(v, custo + h(v));
      }
    }
  }
  if (!achou) return null;

  const celulas: number[] = [];
  for (let k = fim; k !== inicio; k = anterior[k]!) celulas.push(k);
  celulas.reverse();
  const pontos = celulas.map((k) => centroDaCelula(esfera, k));
  const destinoFinal = fim === celulaDoPonto(nav, destino) ? destino : alvo;
  if (pontos.length > 0) pontos[pontos.length - 1] = destinoFinal;
  else pontos.push(destinoFinal);
  return suavizar(g, origem, pontos);
}

/** Puxa o fio: pula pontos intermediários enquanto houver linha de visada. */
function suavizar(g: Navegavel, origem: Vec3, pontos: Vec3[]): Vec3[] {
  const saida: Vec3[] = [];
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

// Fila de baldes do campo de fluxo (Dial), reaproveitada entre chamadas: BALDES pilhas de até n
// itens num único buffer. Cada célula entra no máximo uma vez por balde vivo, então n basta.
const BALDES = 32;
let filaBuf = new Int32Array(0);
const topos = new Int32Array(BALDES);

/** Campo de fluxo: custo de cada célula até o destino; −1 onde não alcança. */
export function campoDeFluxo(g: Navegavel, destino: Vec3): Int32Array {
  const { nav } = g;
  const esfera = nav.esfera;
  const n = esfera.celulas;
  const dist = new Int32Array(n).fill(-1);
  const fim = celulaLivreProxima(g, destino);
  if (fim < 0) return dist;
  if (filaBuf.length !== n * BALDES) filaBuf = new Int32Array(n * BALDES);
  const fila = filaBuf;
  const vizinhos = esfera.vizinhos;
  const custos = esfera.custos;
  const passavel = nav.passavel;
  const bloqueado = g.bloqueado;
  topos.fill(0);
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
      const o = atual * 8;
      for (let d = 0; d < 8; d++) {
        const v = vizinhos[o + d]!;
        if (v < 0 || passavel[v] !== 1 || (bloqueado !== null && bloqueado[v] === 1)) continue;
        if (d >= 4) {
          const l = LADOS_DA_DIAGONAL[d - 4]!;
          const a = vizinhos[o + l[0]]!;
          const c = vizinhos[o + l[1]]!;
          if (a < 0 || c < 0 || passavel[a] !== 1 || passavel[c] !== 1) continue;
          if (bloqueado !== null && (bloqueado[a] === 1 || bloqueado[c] === 1)) continue;
        }
        const custo = custoAtual + custos[o + d]!;
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

/** Próximo passo pelo campo de fluxo a partir de d: centro da vizinha mais barata, ou null. */
export function passoDoFluxo(g: Navegavel, campo: Int32Array, d: Vec3): Vec3 | null {
  const aqui = celulaDoPonto(g.nav, d);
  let melhor = -1;
  let melhorCusto = campo[aqui]! >= 0 ? campo[aqui]! : INFINITO;
  for (let k = 0; k < 8; k++) {
    const v = vizinho(g, aqui, k);
    if (v < 0 || campo[v]! < 0) continue;
    if (campo[v]! < melhorCusto) {
      melhorCusto = campo[v]!;
      melhor = v;
    }
  }
  return melhor < 0 ? null : centroDaCelula(g.nav.esfera, melhor);
}
