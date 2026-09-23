/**
 * `npm run sim:match -- --seed N --ais normal,normal --max-min 40`
 * Roda uma partida headless (sem render nem DOM) e imprime o resumo em JSON (TEC-25).
 */
import { parseArgs } from 'node:util';
import { runMatch } from './sim/match';

try {
  const { values } = parseArgs({
    options: {
      seed: { type: 'string', default: '1' },
      ais: { type: 'string', default: 'normal,normal' },
      'max-min': { type: 'string', default: '40' },
    },
  });
  const seed = Number(values.seed);
  if (!Number.isSafeInteger(seed)) throw new Error(`Seed inválida: ${values.seed}`);
  const resultado = runMatch({
    seed,
    ias: values.ais.split(',').map((ia) => ia.trim()),
    maxMin: Number(values['max-min']),
  });
  console.log(JSON.stringify(resultado, null, 2));
} catch (erro) {
  console.error(`sim:match: ${erro instanceof Error ? erro.message : String(erro)}`);
  process.exit(2);
}
