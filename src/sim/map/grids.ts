/**
 * Grades derivadas do heightmap (TEC-13): navegação, construção e névoa.
 * A célula (ci, cj) cobre x ∈ [−lado/2 + ci·c, −lado/2 + (ci+1)·c), o mesmo para z.
 */
import { param } from '../data';
import { alturaAmostra, type Heightmap } from './heightmap';

/** CEN-09: faixa da borda do mapa que é sempre intransponível. */
export const FAIXA_BORDA_M = 16;

export interface Grade {
  celula_m: number;
  colunas: number;
  linhas: number;
  /** Metade do lado do mapa: o mundo vai de −meio_m a +meio_m. */
  meio_m: number;
}

export interface GradeNavegacao extends Grade {
  /** 1 = transponível por hovers (MOV-01). */
  passavel: Uint8Array;
}

export interface GradeConstrucao extends Grade {
  /** 1 = inclinação e posição permitem construir (PRD-10). */
  construivel: Uint8Array;
}

export interface GradesDoMapa {
  navegacao: GradeNavegacao;
  construcao: GradeConstrucao;
  nevoa: Grade;
}

function criarGrade(mapa: Heightmap, celula: number): Grade {
  const colunas = mapa.lado_m / celula;
  if (!Number.isInteger(colunas)) {
    throw new Error(`O lado do mapa (${mapa.lado_m} m) não é múltiplo da célula (${celula} m)`);
  }
  return { celula_m: celula, colunas, linhas: colunas, meio_m: mapa.lado_m / 2 };
}

/** Célula que contém o ponto (x, z), ou null fora do mapa. */
export function celulaDe(grade: Grade, x: number, z: number): [number, number] | null {
  const ci = Math.floor((x + grade.meio_m) / grade.celula_m);
  const cj = Math.floor((z + grade.meio_m) / grade.celula_m);
  if (ci < 0 || cj < 0 || ci >= grade.colunas || cj >= grade.linhas) return null;
  return [ci, cj];
}

export function centroDaCelula(grade: Grade, ci: number, cj: number): [number, number] {
  return [-grade.meio_m + (ci + 0.5) * grade.celula_m, -grade.meio_m + (cj + 0.5) * grade.celula_m];
}

/** Inclinação (graus) de cada amostra do heightmap, por diferenças centrais. */
function inclinacoes(mapa: Heightmap): Float32Array {
  const res = mapa.resolucao;
  const saida = new Float32Array(res * res);
  for (let j = 0; j < res; j++) {
    for (let i = 0; i < res; i++) {
      const dx = (alturaAmostra(mapa, i + 1, j) - alturaAmostra(mapa, i - 1, j)) / 2;
      const dz = (alturaAmostra(mapa, i, j + 1) - alturaAmostra(mapa, i, j - 1)) / 2;
      saida[j * res + i] = (Math.atan(Math.hypot(dx, dz)) * 180) / Math.PI;
    }
  }
  return saida;
}

/** Maior inclinação entre as amostras que cobrem a célula (bordas incluídas). */
function inclinacaoDaCelula(
  inclinacao: Float32Array,
  res: number,
  celula: number,
  ci: number,
  cj: number,
): number {
  let maior = 0;
  for (let j = cj * celula; j <= (cj + 1) * celula; j++) {
    for (let i = ci * celula; i <= (ci + 1) * celula; i++) {
      const valor = inclinacao[j * res + i]!;
      if (valor > maior) maior = valor;
    }
  }
  return maior;
}

function naFaixaDaBorda(grade: Grade, ci: number, cj: number): boolean {
  const [x, z] = centroDaCelula(grade, ci, cj);
  return grade.meio_m - Math.max(Math.abs(x), Math.abs(z)) < FAIXA_BORDA_M;
}

export function derivarGrades(mapa: Heightmap): GradesDoMapa {
  const inclinacao = inclinacoes(mapa);
  const limiteHover = param('inclinacao_max_hover_graus');
  const limiteConstrucao = param('inclinacao_max_construcao_graus');

  const nav = criarGrade(mapa, param('celula_navegacao_m'));
  const passavel = new Uint8Array(nav.colunas * nav.linhas);
  for (let cj = 0; cj < nav.linhas; cj++) {
    for (let ci = 0; ci < nav.colunas; ci++) {
      const ok =
        !naFaixaDaBorda(nav, ci, cj) &&
        inclinacaoDaCelula(inclinacao, mapa.resolucao, nav.celula_m, ci, cj) <= limiteHover;
      passavel[cj * nav.colunas + ci] = ok ? 1 : 0;
    }
  }

  const obra = criarGrade(mapa, param('celula_construcao_m'));
  const construivel = new Uint8Array(obra.colunas * obra.linhas);
  for (let cj = 0; cj < obra.linhas; cj++) {
    for (let ci = 0; ci < obra.colunas; ci++) {
      const ok =
        !naFaixaDaBorda(obra, ci, cj) &&
        inclinacaoDaCelula(inclinacao, mapa.resolucao, obra.celula_m, ci, cj) <= limiteConstrucao;
      construivel[cj * obra.colunas + ci] = ok ? 1 : 0;
    }
  }

  return {
    navegacao: { ...nav, passavel },
    construcao: { ...obra, construivel },
    nevoa: criarGrade(mapa, param('celula_nevoa_m')),
  };
}

export function ehPassavel(grade: GradeNavegacao, ci: number, cj: number): boolean {
  return grade.passavel[cj * grade.colunas + ci] === 1;
}

export function ehConstruivel(grade: GradeConstrucao, ci: number, cj: number): boolean {
  return grade.construivel[cj * grade.colunas + ci] === 1;
}
