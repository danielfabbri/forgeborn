import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const raiz = fileURLToPath(new URL('../../', import.meta.url));

const pastas = [
  'src/sim',
  'src/render',
  'src/ui',
  'src/input',
  'src/audio',
  'src/game',
  'src/i18n',
  'src/assets',
  'tools',
  'tests/spec',
  'tests/sim',
  'tests/render',
  'tests/balance',
  'tests/e2e',
];

describe('TEC-03: estrutura de pastas', () => {
  it.each(pastas)('%s existe', (pasta) => {
    expect(existsSync(raiz + pasta)).toBe(true);
  });
});
