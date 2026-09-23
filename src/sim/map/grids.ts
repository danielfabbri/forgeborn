/**
 * Grades derivadas do heightmap (TEC-13): navegação, construção e névoa, cada uma uma
 * cubo-esfera (CEN-14) com área média de célula igual ao tamanho nominal.
 */
import { param } from '../data';
import {
  celulaDaDirecao,
  celulasPorAresta,
  centroDaCelula as centroNaEsfera,
  type CuboEsfera,
  cuboEsfera,
  direcaoDaFace,
  rotacoesDeSimetria,
  type Simetria,
  tanDaDivisao,
  type Vec3,
} from './esfera';
import {
  direcaoDoVertice,
  type Heightmap,
  inclinacaoEm,
  indiceDoVertice,
  verticeRotacionado,
} from './heightmap';

export interface Grade {
  /** Tamanho nominal da célula (m). */
  celula_m: number;
  raio_m: number;
  esfera: CuboEsfera;
}

export interface GradeNavegacao extends Grade {
  /** 1 = transponível por hovers (MOV-01). */
  passavel: Uint8Array;
}

export interface GradeConstrucao extends Grade {
  /** 1 = inclinação permite construir (PRD-10). */
  construivel: Uint8Array;
}

export interface GradesDoMapa {
  navegacao: GradeNavegacao;
  construcao: GradeConstrucao;
  nevoa: Grade;
}

function criarGrade(raio_m: number, celula: number): Grade {
  return { celula_m: celula, raio_m, esfera: cuboEsfera(celulasPorAresta(raio_m, celula)) };
}

/** Célula que contém a direção d. */
export function celulaDe(grade: Grade, d: Vec3): number {
  return celulaDaDirecao(grade.esfera.n, d);
}

export function centroDaCelula(grade: Grade, indice: number): Vec3 {
  return centroNaEsfera(grade.esfera, indice);
}

/**
 * Maior inclinação por célula: cada vértice do heightmap conta para as células a meio texel dele
 * nas 4 diagonais (um vértice na fronteira conta dos dois lados; nunca cai exatamente nela).
 */
function inclinacaoPorCelula(
  mapa: Heightmap,
  porVertice: Float32Array,
  grade: Grade,
): Float32Array {
  const res = mapa.resolucao;
  const n = grade.esfera.n;
  const maior = new Float32Array(grade.esfera.celulas);
  for (let face = 0; face < 6; face++) {
    for (let j = 0; j <= res; j++) {
      for (let i = 0; i <= res; i++) {
        const valor = porVertice[indiceDoVertice(res, face, i, j)]!;
        for (const [di, dj] of [
          [-1, -1],
          [1, -1],
          [-1, 1],
          [1, 1],
        ] as const) {
          const d = direcaoDaFace(
            face,
            tanDaDivisao(2 * i + di, 2 * res),
            tanDaDivisao(2 * j + dj, 2 * res),
          );
          const c = celulaDaDirecao(n, d);
          if (valor > maior[c]!) maior[c] = valor;
        }
      }
    }
  }
  return maior;
}

/**
 * Inclinação (graus) em cada vértice do heightmap. Com simetria (CEN-06), só um vértice de cada
 * órbita é calculado e copiado, para as grades saírem exatamente simétricas.
 */
function inclinacoesDosVertices(mapa: Heightmap, rotacoes: Vec3[]): Float32Array {
  const res = mapa.resolucao;
  const saida = new Float32Array(mapa.alturas.length);
  for (let face = 0; face < 6; face++) {
    for (let j = 0; j <= res; j++) {
      for (let i = 0; i <= res; i++) {
        const v = indiceDoVertice(res, face, i, j);
        const orbita = rotacoes.map((sigma) => verticeRotacionado(res, v, sigma));
        if (orbita.some((w) => w < v)) continue;
        const valor = inclinacaoEm(mapa, direcaoDoVertice(res, face, i, j));
        for (const w of orbita) saida[w] = valor;
      }
    }
  }
  return saida;
}

export function derivarGrades(mapa: Heightmap & { simetria?: Simetria }): GradesDoMapa {
  const rotacoes = mapa.simetria ? rotacoesDeSimetria(mapa.simetria) : [[1, 1, 1] as Vec3];
  const porVertice = inclinacoesDosVertices(mapa, rotacoes);
  const limiteHover = param('inclinacao_max_hover_graus');
  const limiteConstrucao = param('inclinacao_max_construcao_graus');

  const nav = criarGrade(mapa.raio_m, param('celula_navegacao_m'));
  const inclinacaoNav = inclinacaoPorCelula(mapa, porVertice, nav);
  const passavel = new Uint8Array(nav.esfera.celulas);
  for (let c = 0; c < passavel.length; c++) passavel[c] = inclinacaoNav[c]! <= limiteHover ? 1 : 0;

  const obra = criarGrade(mapa.raio_m, param('celula_construcao_m'));
  const inclinacaoObra = inclinacaoPorCelula(mapa, porVertice, obra);
  const construivel = new Uint8Array(obra.esfera.celulas);
  for (let c = 0; c < construivel.length; c++) {
    construivel[c] = inclinacaoObra[c]! <= limiteConstrucao ? 1 : 0;
  }

  return {
    navegacao: { ...nav, passavel },
    construcao: { ...obra, construivel },
    nevoa: criarGrade(mapa.raio_m, param('celula_nevoa_m')),
  };
}

export function ehPassavel(grade: GradeNavegacao, indice: number): boolean {
  return grade.passavel[indice] === 1;
}

export function ehConstruivel(grade: GradeConstrucao, indice: number): boolean {
  return grade.construivel[indice] === 1;
}
