/** `npm run spec:check`: valida o SPEC.md e os dados gerados (TEC-11). */
import { checkSpec, formatIssue } from './spec/check';
import { readGenerated, readSpec } from './spec/files';

const issues = checkSpec(readSpec(), readGenerated());

if (issues.length > 0) {
  for (const issue of issues) console.error(formatIssue(issue));
  console.error(`spec:check: ${issues.length} problema(s) encontrado(s).`);
  process.exit(1);
}
console.log('spec:check: SPEC e dados gerados consistentes.');
