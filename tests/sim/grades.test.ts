import { describe, expect, it } from 'vitest';
import { param } from '../../src/sim';
import {
  celulaDe,
  centroDaCelula,
  derivarGrades,
  ehConstruivel,
  ehPassavel,
  FAIXA_BORDA_M,
} from '../../src/sim/map/grids';
import { codificarAltura, type Heightmap } from '../../src/sim/map/heightmap';
import { GERADOR_LUA, gerarMapaLunar } from '../../src/sim/map/lunar';

/**
 * Heightmap sintético de 128 m que sobe em x por faixas de inclinação conhecida:
 * plano | 10° | 20° | 40° | plano.
 */
function heightmapSintetico(): Heightmap {
  const lado = 128;
  const resolucao = lado + 1;
  const tg = (graus: number) => Math.tan((graus * Math.PI) / 180);
  const faixas: Array<[number, number]> = [
    [-16, 10],
    [0, 20],
    [16, 40],
    [32, 0],
  ];
  const altura = (x: number) => {
    let h = 0;
    for (let k = 0; k < faixas.length; k++) {
      const [inicio, graus] = faixas[k]!;
      const fim = faixas[k + 1]?.[0] ?? Infinity;
      if (x > inicio) h += tg(graus) * (Math.min(x, fim) - inicio);
    }
    return h;
  };
  const alturas = new Uint16Array(resolucao * resolucao);
  for (let j = 0; j < resolucao; j++) {
    for (let i = 0; i < resolucao; i++)
      alturas[j * resolucao + i] = codificarAltura(altura(i - 64));
  }
  return { lado_m: lado, resolucao, alturas };
}

describe('TEC-13: grades derivadas do heightmap', () => {
  const grades = derivarGrades(heightmapSintetico());
  const nav = grades.navegacao;
  const obra = grades.construcao;
  const passavelEm = (x: number, z: number) => ehPassavel(nav, ...celulaDe(nav, x, z)!);
  const construivelEm = (x: number, z: number) => ehConstruivel(obra, ...celulaDe(obra, x, z)!);

  it('usa as células do SPEC', () => {
    expect(nav.celula_m).toBe(param('celula_navegacao_m'));
    expect(obra.celula_m).toBe(param('celula_construcao_m'));
    expect(grades.nevoa.celula_m).toBe(param('celula_nevoa_m'));
    expect(nav.colunas).toBe(128 / nav.celula_m);
    expect(obra.colunas).toBe(128);
  });

  it('MOV-01: acima de inclinacao_max_hover_graus é intransponível', () => {
    expect(param('inclinacao_max_hover_graus')).toBe(30);
    expect(passavelEm(-40, 0)).toBe(true); // plano
    expect(passavelEm(-8, 0)).toBe(true); // 10°
    expect(passavelEm(8, 0)).toBe(true); // 20°
    expect(passavelEm(24, 0)).toBe(false); // 40°
    expect(passavelEm(40, 0)).toBe(true); // plano no alto
  });

  it('PRD-10: acima de inclinacao_max_construcao_graus não se constrói', () => {
    expect(param('inclinacao_max_construcao_graus')).toBe(12);
    expect(construivelEm(-40, 0)).toBe(true);
    expect(construivelEm(-8, 0)).toBe(true);
    expect(construivelEm(8, 0)).toBe(false);
    expect(construivelEm(24, 0)).toBe(false);
    expect(construivelEm(40, 0)).toBe(true);
  });

  it('CEN-09: a faixa de 16 m da borda é intransponível mesmo plana', () => {
    expect(passavelEm(-64 + FAIXA_BORDA_M - 1, 0)).toBe(false);
    expect(passavelEm(-64 + FAIXA_BORDA_M + 1, 0)).toBe(true);
    expect(passavelEm(-40, 63)).toBe(false);
    expect(construivelEm(-40, -63)).toBe(false);
  });

  it('converte entre mundo e célula', () => {
    expect(celulaDe(nav, -64, -64)).toEqual([0, 0]);
    expect(celulaDe(nav, 63.9, 63.9)).toEqual([nav.colunas - 1, nav.linhas - 1]);
    expect(celulaDe(nav, 64, 0)).toBeNull();
    expect(centroDaCelula(nav, 0, 0)).toEqual([-63, -63]);
  });
});

describe('TEC-13: grades de um mapa lunar gerado', () => {
  const mapa = gerarMapaLunar(7, 'm', 4);
  const { navegacao: nav, construcao: obra } = derivarGrades(mapa);
  const topo = GERADOR_LUA.raioPlato + GERADOR_LUA.folgaTopo;

  it('o platô é transponível e construível; o penhasco, não; a rampa é transponível', () => {
    for (const zona of mapa.zonasDePouso) {
      expect(ehPassavel(nav, ...celulaDe(nav, zona.x, zona.z)!)).toBe(true);
      expect(ehConstruivel(obra, ...celulaDe(obra, zona.x + 20, zona.z - 20)!)).toBe(true);

      const fora = Math.atan2(zona.z, zona.x);
      const penhasco = celulaDe(
        nav,
        zona.x + Math.cos(fora) * (topo + 2.5),
        zona.z + Math.sin(fora) * (topo + 2.5),
      )!;
      expect(ehPassavel(nav, ...penhasco)).toBe(false);

      for (const angulo of zona.rampas) {
        for (let d = topo; d <= topo + GERADOR_LUA.comprimentoRampa; d += 2) {
          const celula = celulaDe(
            nav,
            zona.x + Math.cos(angulo) * d,
            zona.z + Math.sin(angulo) * d,
          )!;
          expect(ehPassavel(nav, ...celula)).toBe(true);
        }
      }
    }
  });
});
