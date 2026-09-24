/**
 * `npm run balance:report`: recalcula a tabela informativa de §21.2 (tempos de abate de
 * referência) a partir dos dados gerados e a imprime em Markdown, pronta para o SPEC (T-068).
 */
import { tabelaMarkdown } from './balanco/tempos';

console.log('### 21.2 Tempos de abate de referência (informativo)\n');
console.log(tabelaMarkdown());
