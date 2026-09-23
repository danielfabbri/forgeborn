/** Varredura de seeds para o aceite da T-012 (100 seeds, divididas em 4 arquivos que rodam em paralelo). */
import { expect, it } from 'vitest';
import { derivarGrades } from '../../src/sim/map/grids';
import { distribuirJazidas } from '../../src/sim/map/jazidas';
import { gerarMapaLunar, type Simetria } from '../../src/sim/map/lunar';
import { type MotivoInvalido, type ProblemaDeMapa, validarMapa } from '../../src/sim/map/validacao';

const MOTIVOS: MotivoInvalido[] = [
  'zonas_desconectadas',
  'rotas_insuficientes',
  'jazida_inalcancavel',
  'jazida_perto_de_paredao',
  'distribuicao_impossivel',
];

export function testarSeeds(tamanho: 'p' | 'm' | 'g', n: Simetria, seeds: number[]): void {
  it(`CEN-11: ${seeds.length} seeds ${tamanho.toUpperCase()}${n} são válidas ou recusadas com motivo`, () => {
    let validas = 0;
    for (const seed of seeds) {
      const mapa = gerarMapaLunar(seed, tamanho, n);
      const grades = derivarGrades(mapa);
      let problemas: ProblemaDeMapa[];
      try {
        problemas = validarMapa(mapa, grades, distribuirJazidas(mapa, grades, 'lua'));
      } catch (erro) {
        problemas = [{ motivo: 'distribuicao_impossivel', detalhe: String(erro) }];
      }
      if (problemas.length === 0) validas++;
      for (const problema of problemas) {
        expect(MOTIVOS).toContain(problema.motivo);
        expect(problema.detalhe.length).toBeGreaterThan(0);
      }
    }
    expect(validas / seeds.length).toBeGreaterThanOrEqual(0.9);
  }, 120_000);
}

export const SEEDS = Array.from({ length: 25 }, (_, k) => k + 1);
