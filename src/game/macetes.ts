/**
 * TEC-27 (D-76): lê o texto digitado no campo de macetes. "mais" + o nome do recurso de
 * `dados:recursos` sem acento; maiúsculas, acentos e espaços não importam.
 */
import { dados } from '../sim';
import type { RecursosId } from '../sim/data';

export type Macete = { tipo: 'recurso'; recurso: RecursosId };

function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, '');
}

export function interpretarMacete(texto: string): Macete | null {
  const t = normalizar(texto);
  for (const r of dados.recursos) {
    if (t === `mais${normalizar(r.nome)}`) return { tipo: 'recurso', recurso: r.id };
  }
  return null;
}
