import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { param } from '../../src/sim';
import { niveisDeIa, runMatch } from '../../tools/sim/match';

const raiz = fileURLToPath(new URL('../../', import.meta.url));

describe('TEC-25: runner headless', () => {
  it('roda a duração pedida em ticks de tick_hz, de forma determinística', () => {
    const a = runMatch({ seed: 3, ias: ['normal', 'facil'], maxMin: 1 });
    const b = runMatch({ seed: 3, ias: ['normal', 'facil'], maxMin: 1 });
    expect(a.ticks).toBe(60 * param('tick_hz'));
    expect(a.minutos_simulados).toBe(1);
    expect(a.nacoes).toEqual(['usa', 'chn']);
    expect(a.hash).toBe(b.hash);
    expect(a.tick_medio_ms).toBeGreaterThanOrEqual(0);
  });

  it('aceita os níveis de IA de dados:dificuldade e recusa os demais', () => {
    expect(niveisDeIa()).toEqual(['facil', 'normal', 'dificil', 'brutal']);
    expect(() => runMatch({ seed: 1, ias: ['normal', 'impossivel'], maxMin: 1 })).toThrow(
      /impossivel/,
    );
  });

  it('REG-01: exige de 2 a 4 nações', () => {
    expect(() => runMatch({ seed: 1, ias: ['normal'], maxMin: 1 })).toThrow(/REG-01/);
    expect(() => runMatch({ seed: 1, ias: Array(5).fill('normal'), maxMin: 1 })).toThrow(/REG-01/);
  });

  it('a CLI roda em Node sem DOM e termina com código 0', () => {
    const saida = spawnSync(
      process.execPath,
      [
        '--import',
        'tsx',
        'tools/sim-match.ts',
        '--seed',
        '5',
        '--ais',
        'normal,brutal',
        '--max-min',
        '1',
      ],
      { cwd: raiz, encoding: 'utf8' },
    );
    expect(saida.stderr).toBe('');
    expect(saida.status).toBe(0);
    const resumo = JSON.parse(saida.stdout) as { ticks: number; hash: string; ias: string[] };
    expect(resumo.ticks).toBe(60 * param('tick_hz'));
    expect(resumo.ias).toEqual(['normal', 'brutal']);
    expect(resumo.hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it('a CLI sai com código 2 e mensagem clara quando os argumentos são inválidos', () => {
    const saida = spawnSync(
      process.execPath,
      ['--import', 'tsx', 'tools/sim-match.ts', '--ais', 'normal'],
      { cwd: raiz, encoding: 'utf8' },
    );
    expect(saida.status).toBe(2);
    expect(saida.stderr).toMatch(/sim:match: .*REG-01/);
  });
});
