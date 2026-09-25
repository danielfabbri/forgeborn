import { Points, Scene } from 'three';
import { describe, expect, it } from 'vitest';
import { Particulas } from '../../src/render/particulas';

const vivas = (cena: Scene) =>
  cena.children
    .filter((o): o is Points => o instanceof Points)
    .reduce(
      (s, p) => s + Array.from(p.geometry.getAttribute('aVida').array).filter((v) => v > 0).length,
      0,
    );

const emissao = {
  origem: [0, 100, 0] as [number, number, number],
  cima: [0, 1, 0] as [number, number, number],
  n: 40,
  velocidade: [1, 2] as [number, number],
  espalhamento: 1,
  vida_s: [0.5, 0.5] as [number, number],
  cor: [1, 1, 1] as [number, number, number],
  tamanho: 0.3,
};

describe('T-123 — ART-07, TEC-19: partículas', () => {
  it('TEC-19: a quantidade segue o fator de partículas do preset', () => {
    let fator = 1;
    const cena = new Scene();
    const p = new Particulas(cena, () => fator);
    p.emitir(emissao, 'faisca');
    expect(vivas(cena)).toBe(40);
    fator = 0.25;
    p.emitir(emissao, 'poeira');
    expect(vivas(cena)).toBe(50);
  });

  it('ART-07: as partículas somem ao fim da vida', () => {
    const cena = new Scene();
    const p = new Particulas(cena, () => 1);
    p.emitir(emissao, 'faisca');
    p.atualizar(0.3);
    expect(vivas(cena)).toBe(40);
    p.atualizar(0.3);
    expect(vivas(cena)).toBe(0);
  });
});
