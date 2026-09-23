import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GENERATED_DIR } from './generate';

export const RAIZ = fileURLToPath(new URL('../../', import.meta.url));
export const SPEC_PATH = join(RAIZ, 'SPEC.md');
export const GENERATED_PATH = join(RAIZ, GENERATED_DIR);

export function readSpec(): string {
  return readFileSync(SPEC_PATH, 'utf8');
}

/** Conteúdo atual de `src/sim/data/generated/`, com fins de linha normalizados para LF. */
export function readGenerated(): Map<string, string> {
  const files = new Map<string, string>();
  if (!existsSync(GENERATED_PATH)) return files;
  for (const name of readdirSync(GENERATED_PATH).sort()) {
    files.set(name, readFileSync(join(GENERATED_PATH, name), 'utf8').replace(/\r\n/g, '\n'));
  }
  return files;
}
