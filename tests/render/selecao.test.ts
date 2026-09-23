import { describe, expect, it } from 'vitest';
import {
  combinar,
  type CorpoNaTela,
  corpoNoPonto,
  Grupos,
  JANELA_TOQUE_DUPLO_MS,
  mesmoTipoNaTela,
  selecionarCaixa,
  ToqueDuplo,
} from '../../src/game/selecao';

let proximo = 1;
function corpo(parcial: Partial<CorpoNaTela>): CorpoNaTela {
  return {
    id: proximo++,
    tipo: 'hover_ex1',
    nacao: 'bra',
    movel: true,
    sx: 0,
    sy: 0,
    sr: 12,
    naTela: true,
    ...parcial,
  };
}

describe('CTL-04: seleção', () => {
  it('clique pega o corpo sob o cursor; fora de qualquer corpo, nada', () => {
    const a = corpo({ sx: 100, sy: 100 });
    const b = corpo({ sx: 130, sy: 100 });
    expect(corpoNoPonto([a, b], 104, 98)?.id).toBe(a.id);
    expect(corpoNoPonto([a, b], 127, 101)?.id).toBe(b.id);
    expect(corpoNoPonto([a, b], 300, 300)).toBeNull();
  });

  it('clique ignora corpos fora da tela', () => {
    const escondido = corpo({ sx: 50, sy: 50, naTela: false });
    expect(corpoNoPonto([escondido], 50, 50)).toBeNull();
  });

  it('caixa prefere unidades móveis próprias a estruturas', () => {
    const unidade = corpo({ sx: 10, sy: 10 });
    const nave = corpo({ sx: 20, sy: 20, tipo: 'ship', movel: false });
    const inimigo = corpo({ sx: 15, sy: 15, nacao: 'usa' });
    const caixa = { x0: 0, y0: 0, x1: 50, y1: 50 };
    expect(selecionarCaixa([unidade, nave, inimigo], caixa, 'bra')).toEqual([unidade.id]);
  });

  it('caixa sem unidades móveis pega as estruturas próprias (sem minas)', () => {
    const nave = corpo({ sx: 20, sy: 20, tipo: 'ship', movel: false });
    const torre = corpo({ sx: 30, sy: 30, tipo: 'laser_tower', movel: false });
    const mina = corpo({ sx: 25, sy: 25, tipo: 'mine', movel: false });
    const caixa = { x0: 50, y0: 50, x1: 0, y1: 0 };
    expect(selecionarCaixa([nave, torre, mina], caixa, 'bra')).toEqual([nave.id, torre.id]);
  });

  it('Shift+clique adiciona e remove; Shift+caixa adiciona; sem Shift substitui', () => {
    expect(combinar([1, 2], [3], true, true)).toEqual([1, 2, 3]);
    expect(combinar([1, 2, 3], [2], true, true)).toEqual([1, 3]);
    expect(combinar([1, 2], [2, 4], true, false)).toEqual([1, 2, 4]);
    expect(combinar([1, 2], [5], false, true)).toEqual([5]);
  });

  it('duplo clique / Ctrl+clique pega todos do mesmo tipo e dono visíveis na tela', () => {
    const a = corpo({ tipo: 'hover_scout' });
    const b = corpo({ tipo: 'hover_scout' });
    const foraDaTela = corpo({ tipo: 'hover_scout', naTela: false });
    const outroTipo = corpo({ tipo: 'hover_ex1' });
    const inimigo = corpo({ tipo: 'hover_scout', nacao: 'usa' });
    expect(mesmoTipoNaTela([a, b, foraDaTela, outroTipo, inimigo], a)).toEqual([a.id, b.id]);
  });
});

describe('CTL-05: grupos', () => {
  it('Ctrl+n define, n seleciona; corpos destruídos saem do grupo', () => {
    const grupos = new Grupos();
    grupos.definir(3, [7, 5, 9]);
    expect(grupos.obter(3, () => true)).toEqual([5, 7, 9]);
    expect(grupos.obter(3, (id) => id !== 7)).toEqual([5, 9]);
    expect(grupos.obter(4, () => true)).toEqual([]);
  });

  it('toque duplo na mesma tecla, dentro da janela, centraliza', () => {
    const toque = new ToqueDuplo();
    expect(toque.tocar('3', 1000)).toBe(false);
    expect(toque.tocar('3', 1000 + JANELA_TOQUE_DUPLO_MS - 1)).toBe(true);
    // um terceiro toque recomeça a contagem
    expect(toque.tocar('3', 1000 + JANELA_TOQUE_DUPLO_MS)).toBe(false);
    expect(toque.tocar('4', 5000)).toBe(false);
    expect(toque.tocar('3', 5010)).toBe(false);
    expect(toque.tocar('3', 5000 + 2 * JANELA_TOQUE_DUPLO_MS)).toBe(false);
  });
});
