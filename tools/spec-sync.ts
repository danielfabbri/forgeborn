/** `npm run spec:sync`: gera src/sim/data/generated/ a partir do SPEC.md (TEC-11). */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { GENERATED_PATH, readGenerated, readSpec } from './spec/files';
import { GENERATED_DIR, generateFiles } from './spec/generate';
import { parseSpec, SpecError } from './spec/parser';

try {
  const spec = parseSpec(readSpec());
  const files = generateFiles(spec);
  const current = readGenerated();

  mkdirSync(GENERATED_PATH, { recursive: true });
  let changed = 0;
  for (const name of current.keys()) {
    if (!files.has(name)) {
      rmSync(join(GENERATED_PATH, name));
      changed++;
    }
  }
  for (const [name, content] of files) {
    if (current.get(name) !== content) {
      writeFileSync(join(GENERATED_PATH, name), content);
      changed++;
    }
  }
  console.log(
    `spec:sync: SPEC v${spec.version ?? '?'} → ${files.size} arquivos em ${GENERATED_DIR} (${changed} alterados).`,
  );
} catch (error) {
  if (error instanceof SpecError) {
    console.error(`SPEC.md${error.line ? `:${error.line}` : ''}: ${error.message}`);
    process.exit(1);
  }
  throw error;
}
