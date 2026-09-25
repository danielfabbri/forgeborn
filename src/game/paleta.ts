/**
 * Cores de nações e recursos (ART-04) e o modo daltônico (UI-11): paletas alternativas para
 * protanopia, deuteranopia e tritanopia, o emblema geométrico de cada nação e uma forma própria
 * para cada recurso. As paletas alternativas partem da paleta Okabe-Ito (apresentação).
 */
import { dados } from '../sim';
import { configuracoes } from './configuracoes';

export type Daltonismo = 'nenhum' | 'protanopia' | 'deuteranopia' | 'tritanopia';
export const MODOS_DALTONICOS: readonly Daltonismo[] = [
  'nenhum',
  'protanopia',
  'deuteranopia',
  'tritanopia',
];

/** Vermelho e verde se confundem (protanopia, deuteranopia): azul, laranja, branco, amarelo. */
const NACOES_VERMELHO_VERDE: Record<string, string> = {
  usa: '#0072B2',
  chn: '#E69F00',
  rus: '#F2F4F8',
  bra: '#F0E442',
};
/** Azul e amarelo se confundem (tritanopia): rosa, vermelhão, branco, verde-azulado. */
const NACOES_AZUL_AMARELO: Record<string, string> = {
  usa: '#CC79A7',
  chn: '#D55E00',
  rus: '#F2F4F8',
  bra: '#009E73',
};
const RECURSOS_VERMELHO_VERDE: Record<string, string> = {
  fe: '#D55E00',
  si: '#BBBBBB',
  cu: '#E69F00',
  li: '#CC79A7',
  ti: '#56B4E9',
  u: '#F0E442',
};
const RECURSOS_AZUL_AMARELO: Record<string, string> = {
  fe: '#D55E00',
  si: '#BBBBBB',
  cu: '#E69F00',
  li: '#CC79A7',
  ti: '#009E73',
  u: '#FFFFFF',
};

const PALETAS: Record<
  Exclude<Daltonismo, 'nenhum'>,
  { nacoes: Record<string, string>; recursos: Record<string, string> }
> = {
  protanopia: { nacoes: NACOES_VERMELHO_VERDE, recursos: RECURSOS_VERMELHO_VERDE },
  deuteranopia: { nacoes: NACOES_VERMELHO_VERDE, recursos: RECURSOS_VERMELHO_VERDE },
  tritanopia: { nacoes: NACOES_AZUL_AMARELO, recursos: RECURSOS_AZUL_AMARELO },
};

export function corDaNacaoNo(modo: Daltonismo, nacao: string | null | undefined): string {
  const base = dados.nacoes.find((n) => n.id === nacao)?.cor ?? '#888888';
  return modo === 'nenhum' ? base : (PALETAS[modo].nacoes[nacao ?? ''] ?? base);
}

export function corDoRecursoNo(modo: Daltonismo, recurso: string): string {
  const base = dados.recursos.find((r) => r.id === recurso)?.cor ?? '#888888';
  return modo === 'nenhum' ? base : (PALETAS[modo].recursos[recurso] ?? base);
}

/** A cor da nação no modo das Configurações. */
export const corDaNacao = (nacao: string | null | undefined): string =>
  corDaNacaoNo(configuracoes.value.daltonismo, nacao);
export const corDoRecurso = (recurso: string): string =>
  corDoRecursoNo(configuracoes.value.daltonismo, recurso);
export const modoDaltonico = (): boolean => configuracoes.value.daltonismo !== 'nenhum';

export type Emblema = 'estrela' | 'circulo' | 'triangulo' | 'losango';
/** `emblema` de `dados:nacoes`. */
export const emblemaDe = (nacao: string | null | undefined): Emblema =>
  (dados.nacoes.find((n) => n.id === nacao)?.emblema as Emblema | undefined) ?? 'circulo';

/** UI-11: forma própria de cada recurso nos ícones. */
export type FormaDeRecurso =
  'quadrado' | 'triangulo' | 'circulo' | 'losango' | 'hexagono' | 'estrela';
export const FORMA_DO_RECURSO: Record<string, FormaDeRecurso> = {
  fe: 'quadrado',
  si: 'triangulo',
  cu: 'circulo',
  li: 'losango',
  ti: 'hexagono',
  u: 'estrela',
};

/** Contorno (x, y em -1..1, y para cima) de uma forma, para canvas e geometria. */
export function contornoDe(forma: Emblema | FormaDeRecurso): Array<[number, number]> {
  const poligono = (n: number, giro: number, raio = 1) =>
    Array.from({ length: n }, (_, k): [number, number] => {
      const a = giro + (k / n) * Math.PI * 2;
      return [Math.cos(a) * raio, Math.sin(a) * raio];
    });
  switch (forma) {
    case 'estrela':
      return Array.from({ length: 10 }, (_, k): [number, number] => {
        const a = Math.PI / 2 + (k / 10) * Math.PI * 2;
        const r = k % 2 === 0 ? 1 : 0.42;
        return [Math.cos(a) * r, Math.sin(a) * r];
      });
    case 'circulo':
      return poligono(20, 0);
    case 'triangulo':
      return poligono(3, Math.PI / 2);
    case 'losango':
      return poligono(4, Math.PI / 2);
    case 'hexagono':
      return poligono(6, 0);
    case 'quadrado':
      return poligono(4, Math.PI / 4, Math.SQRT2 * 0.8);
  }
}

/** Polígono CSS (clip-path) de uma forma. */
export function clipPathDe(forma: Emblema | FormaDeRecurso): string {
  return `polygon(${contornoDe(forma)
    .map(([x, y]) => `${((x + 1) / 2) * 100}% ${((1 - y) / 2) * 100}%`)
    .join(', ')})`;
}
