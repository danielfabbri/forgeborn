import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const raiz = fileURLToPath(new URL('../../', import.meta.url));
const fixtures = join(raiz, 'tests/fixtures/fronteira-sim');
const eslint = new ESLint({ cwd: raiz });

/** Lint do conteúdo de uma fixture como se ela estivesse no caminho indicado. */
async function regrasVioladas(fixture: string, caminhoVirtual: string): Promise<string[]> {
  const codigo = readFileSync(join(fixtures, fixture), 'utf8');
  const [resultado] = await eslint.lintText(codigo, { filePath: join(raiz, caminhoVirtual) });
  return (resultado?.messages ?? []).map((m) => m.ruleId ?? m.message);
}

describe('TEC-03/TEC-05: fronteira da simulação', () => {
  it.each([
    ['importa-three.ts', 'no-restricted-imports'],
    ['importa-preact.ts', 'no-restricted-imports'],
    ['importa-render.ts', 'no-restricted-imports'],
    ['importa-node.ts', 'no-restricted-imports'],
    ['usa-dom.ts', 'no-restricted-globals'],
    ['usa-performance.ts', 'no-restricted-globals'],
    ['usa-math-random.ts', 'no-restricted-properties'],
    ['usa-date-now.ts', 'no-restricted-properties'],
    ['usa-new-date.ts', 'no-restricted-syntax'],
  ])('%s em src/sim falha com %s', async (fixture, regra) => {
    expect(await regrasVioladas(fixture, 'src/sim/fixture.ts')).toContain(regra);
  });

  it('as mesmas importações são permitidas fora de src/sim', async () => {
    expect(await regrasVioladas('importa-three.ts', 'src/render/fixture.ts')).toEqual([]);
  });

  it('o código real de src/sim passa no lint', async () => {
    const resultados = await eslint.lintFiles(['src/sim']);
    const erros = resultados.flatMap((r) => r.messages.map((m) => `${r.filePath}: ${m.message}`));
    expect(erros).toEqual([]);
  });
});
