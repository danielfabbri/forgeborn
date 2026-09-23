import { describe, expect, it } from 'vitest';
import { param } from '../../src/sim';
import {
  arco,
  avancar,
  celulaRotacionada,
  celulasPorAresta,
  normalizar,
  rotacoesDeSimetria,
  type Vec3,
} from '../../src/sim/map/esfera';
import {
  celulaDe,
  centroDaCelula,
  derivarGrades,
  ehConstruivel,
  ehPassavel,
} from '../../src/sim/map/grids';
import {
  codificarAltura,
  direcaoDoVertice,
  type Heightmap,
  indiceDoVertice,
} from '../../src/sim/map/heightmap';
import { GERADOR_LUA, gerarMapaLunar, rumoSemRampa } from '../../src/sim/map/lunar';

const RAIO = 200;
/**
 * Heightmap sintético numa esfera de 200 m: sobe para o norte (+y) em faixas de inclinação
 * conhecida, medidas pelo arco a partir do equador: plano | 10° | 20° | 40° | plano.
 */
function heightmapSintetico(): Heightmap {
  const resolucao = celulasPorAresta(RAIO, 1);
  const tg = (graus: number) => Math.tan((graus * Math.PI) / 180);
  const faixas: Array<[number, number]> = [
    [-16, 10],
    [0, 20],
    [16, 40],
    [32, 0],
  ];
  const altura = (s: number) => {
    let h = 0;
    for (let k = 0; k < faixas.length; k++) {
      const [inicio, graus] = faixas[k]!;
      const fim = faixas[k + 1]?.[0] ?? Infinity;
      if (s > inicio) h += tg(graus) * (Math.min(s, fim) - inicio);
    }
    return h;
  };
  const alturas = new Uint16Array(6 * (resolucao + 1) ** 2);
  for (let face = 0; face < 6; face++) {
    for (let j = 0; j <= resolucao; j++) {
      for (let i = 0; i <= resolucao; i++) {
        const d = direcaoDoVertice(resolucao, face, i, j);
        alturas[indiceDoVertice(resolucao, face, i, j)] = codificarAltura(
          altura(RAIO * Math.asin(d[1])),
        );
      }
    }
  }
  return { raio_m: RAIO, resolucao, alturas };
}

/** Ponto a `s` metros ao norte do equador, na longitude dada (graus a partir de +x rumo a +z). */
function noMeridiano(s: number, longitude: number): Vec3 {
  const lon = (longitude * Math.PI) / 180;
  const lat = s / RAIO;
  return [Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon)];
}

describe('TEC-13: grades derivadas do heightmap', () => {
  const grades = derivarGrades(heightmapSintetico());
  const nav = grades.navegacao;
  const obra = grades.construcao;

  it('usa as células do SPEC (área média = célula²)', () => {
    expect(nav.celula_m).toBe(param('celula_navegacao_m'));
    expect(obra.celula_m).toBe(param('celula_construcao_m'));
    expect(grades.nevoa.celula_m).toBe(param('celula_nevoa_m'));
    expect(nav.esfera.n).toBe(celulasPorAresta(RAIO, nav.celula_m));
    const area = (4 * Math.PI * RAIO * RAIO) / nav.esfera.celulas;
    expect(Math.sqrt(area)).toBeCloseTo(nav.celula_m, 1);
  });

  // Longitude 45°: o meridiano passa exatamente pela aresta entre as faces +x e +z.
  it.each([20, 45])(
    'MOV-01: acima de inclinacao_max_hover_graus é intransponível (longitude %i°)',
    (lon) => {
      const passavelEm = (s: number) => ehPassavel(nav, celulaDe(nav, noMeridiano(s, lon)));
      expect(param('inclinacao_max_hover_graus')).toBe(30);
      expect(passavelEm(-40)).toBe(true); // plano
      expect(passavelEm(-8)).toBe(true); // 10°
      expect(passavelEm(8)).toBe(true); // 20°
      expect(passavelEm(24)).toBe(false); // 40°
      expect(passavelEm(44)).toBe(true); // plano no alto
    },
  );

  it.each([20, 45])(
    'PRD-10: acima de inclinacao_max_construcao_graus não se constrói (longitude %i°)',
    (lon) => {
      const construivelEm = (s: number) => ehConstruivel(obra, celulaDe(obra, noMeridiano(s, lon)));
      expect(param('inclinacao_max_construcao_graus')).toBe(12);
      expect(construivelEm(-40)).toBe(true);
      expect(construivelEm(-8)).toBe(true);
      expect(construivelEm(8)).toBe(false);
      expect(construivelEm(24)).toBe(false);
      expect(construivelEm(44)).toBe(true);
    },
  );

  it('converte entre direção e célula: o centro da célula cai nela mesma', () => {
    for (const d of [noMeridiano(0, 0), noMeridiano(30, 45), normalizar([1, 1, 1])]) {
      const c = celulaDe(nav, d);
      expect(celulaDe(nav, centroDaCelula(nav, c))).toBe(c);
      expect(RAIO * arco(d, centroDaCelula(nav, c))).toBeLessThan(nav.celula_m * 1.1);
    }
  });
});

describe('TEC-13: grades de um mapa lunar gerado', () => {
  const mapa = gerarMapaLunar(7, 'm', 4);
  const { navegacao: nav, construcao: obra } = derivarGrades(mapa);
  const topo = GERADOR_LUA.raioPlato + GERADOR_LUA.folgaTopo;
  const em = (c: Vec3, rumo: Vec3, metros: number) => avancar(c, rumo, metros / mapa.raio_m).p;

  it('o platô é transponível e construível; o penhasco, não; a rampa é transponível', () => {
    for (const zona of mapa.zonasDePouso) {
      expect(ehPassavel(nav, celulaDe(nav, zona.d))).toBe(true);
      expect(ehConstruivel(obra, celulaDe(obra, em(zona.d, zona.rampas[0]!, 20)))).toBe(true);
      const penhasco = em(zona.d, rumoSemRampa(zona), topo + 2.5);
      expect(ehPassavel(nav, celulaDe(nav, penhasco))).toBe(false);
      for (const u of zona.rampas) {
        for (let d = topo; d <= topo + GERADOR_LUA.comprimentoRampa; d += 2) {
          expect(ehPassavel(nav, celulaDe(nav, em(zona.d, u, d)))).toBe(true);
        }
      }
    }
  });

  it('CEN-06: a grade de navegação é exatamente simétrica', () => {
    const n = nav.esfera.n;
    for (const sigma of rotacoesDeSimetria(4)) {
      for (let c = 0; c < nav.esfera.celulas; c++) {
        expect(nav.passavel[celulaRotacionada(n, c, sigma)]).toBe(nav.passavel[c]);
      }
    }
  });
});
