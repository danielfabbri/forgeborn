/** Varredura de seeds para o aceite da T-012 (100 seeds, divididas em 4 arquivos que rodam em paralelo). */
import { expect, it } from 'vitest';
import { derivarGrades } from '../../src/sim/map/grids';
import { distribuirJazidas } from '../../src/sim/map/jazidas';
import { gerarMapaLunar, type Simetria } from '../../src/sim/map/lunar';
import { type MotivoInvalido, type ProblemaDeMapa, validarMapa } from '../../src/sim/map/validacao';
import { RAIOS_DE_TESTE } from './mundo-teste';

const MOTIVOS: MotivoInvalido[] = [
  'zonas_desconectadas',
  'rotas_insuficientes',
  'jazida_inalcancavel',
  'jazida_perto_de_paredao',
  'distribuicao_impossivel',
];

/** `tamanho`: um dos raios de teste, ou o raio (m) de um cenário real. */
export function testarSeeds(
  tamanho: 'p' | 'm' | 'g' | number,
  n: Simetria,
  seeds: number[],
  timeout = 120_000,
): void {
  const raio = typeof tamanho === 'number' ? tamanho : RAIOS_DE_TESTE[tamanho];
  const rotulo = typeof tamanho === 'number' ? `${tamanho} m ` : tamanho.toUpperCase();
  it(
    `CEN-11: ${seeds.length} seeds ${rotulo}${n} são válidas ou recusadas com motivo`,
    () => {
      let validas = 0;
      for (const seed of seeds) {
        const mapa = gerarMapaLunar(seed, raio, n);
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
    },
    timeout,
  );
}

export const SEEDS = Array.from({ length: 25 }, (_, k) => k + 1);
