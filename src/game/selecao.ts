/**
 * Seleção e grupos (CTL-04 – CTL-06). Lógica pura sobre corpos já projetados na tela;
 * a entrada de mouse e teclado fica em src/input/comandoInput.ts.
 */
import type { EntityId } from '../sim';

export interface CorpoNaTela {
  id: EntityId;
  tipo: string;
  nacao: string | null;
  movel: boolean;
  /** Centro na tela (px). */
  sx: number;
  sy: number;
  /** Raio na tela (px). */
  sr: number;
  /** Está dentro da tela e à frente da câmera. */
  naTela: boolean;
}

export interface Caixa {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Raio mínimo de clique, para unidades pequenas vistas de longe. */
const RAIO_MIN_CLIQUE_PX = 10;

/** Corpo sob o ponto clicado: o de centro mais próximo, relativo ao raio. */
export function corpoNoPonto(corpos: CorpoNaTela[], x: number, y: number): CorpoNaTela | null {
  let melhor: CorpoNaTela | null = null;
  let melhorNota = Infinity;
  for (const c of corpos) {
    if (!c.naTela) continue;
    const raio = Math.max(c.sr, RAIO_MIN_CLIQUE_PX);
    const d = Math.hypot(c.sx - x, c.sy - y);
    if (d > raio) continue;
    const nota = d / raio;
    if (nota < melhorNota) {
      melhorNota = nota;
      melhor = c;
    }
  }
  return melhor;
}

/** CTL-04: a caixa pega só as unidades móveis próprias, se houver; senão, as estruturas. */
export function selecionarCaixa(corpos: CorpoNaTela[], caixa: Caixa, nacao: string): EntityId[] {
  const x0 = Math.min(caixa.x0, caixa.x1);
  const x1 = Math.max(caixa.x0, caixa.x1);
  const y0 = Math.min(caixa.y0, caixa.y1);
  const y1 = Math.max(caixa.y0, caixa.y1);
  const dentro = corpos.filter(
    (c) => c.naTela && c.nacao === nacao && c.sx >= x0 && c.sx <= x1 && c.sy >= y0 && c.sy <= y1,
  );
  const moveis = dentro.filter((c) => c.movel);
  const escolhidos = moveis.length > 0 ? moveis : dentro.filter((c) => c.tipo !== 'mine');
  return ordenados(escolhidos.map((c) => c.id));
}

/** CTL-04: duplo clique ou Ctrl+clique pega todos do mesmo tipo e dono visíveis na tela. */
export function mesmoTipoNaTela(corpos: CorpoNaTela[], referencia: CorpoNaTela): EntityId[] {
  return ordenados(
    corpos
      .filter((c) => c.naTela && c.tipo === referencia.tipo && c.nacao === referencia.nacao)
      .map((c) => c.id),
  );
}

/**
 * Combina a seleção nova com a atual. Sem Shift, substitui. Com Shift: um clique alterna o
 * corpo (adiciona ou remove); caixa e mesmo tipo adicionam.
 */
export function combinar(
  atual: EntityId[],
  novos: EntityId[],
  shift: boolean,
  alternar: boolean,
): EntityId[] {
  if (!shift) return ordenados(novos);
  const conjunto = new Set(atual);
  if (alternar && novos.length === 1) {
    const id = novos[0]!;
    if (conjunto.has(id)) conjunto.delete(id);
    else conjunto.add(id);
  } else {
    for (const id of novos) conjunto.add(id);
  }
  return ordenados([...conjunto]);
}

function ordenados(ids: EntityId[]): EntityId[] {
  return [...new Set(ids)].sort((a, b) => a - b);
}

/** CTL-05: grupos 1..9. Corpos destruídos saem do grupo ao consultar. */
export class Grupos {
  private readonly grupos = new Map<number, EntityId[]>();

  definir(numero: number, ids: EntityId[]): void {
    this.grupos.set(numero, ordenados(ids));
  }

  obter(numero: number, vivo: (id: EntityId) => boolean): EntityId[] {
    const ids = (this.grupos.get(numero) ?? []).filter(vivo);
    this.grupos.set(numero, ids);
    return ids;
  }
}

/** Janela de toque duplo (ms): a mesma tecla duas vezes dentro dela conta como toque duplo. */
export const JANELA_TOQUE_DUPLO_MS = 350;

/** Detecta toque duplo na mesma tecla (CTL-05: centralizar no grupo). */
export class ToqueDuplo {
  private ultimaChave: string | null = null;
  private ultimoMs = -Infinity;

  tocar(chave: string, agoraMs: number): boolean {
    const duplo = chave === this.ultimaChave && agoraMs - this.ultimoMs <= JANELA_TOQUE_DUPLO_MS;
    this.ultimaChave = duplo ? null : chave;
    this.ultimoMs = agoraMs;
    return duplo;
  }
}
