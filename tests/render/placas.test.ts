import { DataTexture, RepeatWrapping } from 'three';
import { describe, expect, it } from 'vitest';
import { criarTexturasPlacas } from '../../src/render/placas';
import { TAM } from '../../src/render/regolith';

describe('§14.8, D-98: placas de basalto rachadas (solo de Vênus)', () => {
  it('as texturas de albedo e normais têm o tamanho e o ladrilho do regolito', () => {
    const { detalhe, normais } = criarTexturasPlacas();
    for (const tex of [detalhe, normais] as DataTexture[]) {
      expect(tex.image.width).toBe(TAM);
      expect(tex.image.height).toBe(TAM);
      expect(tex.wrapS).toBe(RepeatWrapping);
      expect(tex.wrapT).toBe(RepeatWrapping);
    }
  });

  it('tem fendas escuras entre placas mais claras (bastante contraste no albedo)', () => {
    const { detalhe } = criarTexturasPlacas() as { detalhe: DataTexture };
    const dados = detalhe.image.data as Uint8Array;
    let min = 255;
    let max = 0;
    for (let i = 0; i < dados.length; i += 4) {
      min = Math.min(min, dados[i]!);
      max = Math.max(max, dados[i]!);
    }
    // As fendas (bem mais escuras) e o miolo das placas (mais claro) convivem na mesma textura.
    expect(max - min).toBeGreaterThan(80);
  });

  it('é periódica (sem emenda): a costura entre a última e a primeira coluna não destoa', () => {
    const { detalhe } = criarTexturasPlacas() as { detalhe: DataTexture };
    const dados = detalhe.image.data as Uint8Array;
    const px = (i: number, j: number) => dados[(j * TAM + i) * 4]!;
    const diferenca = (a: number, b: number, j: number) => Math.abs(px(a, j) - px(b, j));
    let somaCostura = 0;
    let somaInterna = 0;
    for (let j = 0; j < TAM; j++) {
      somaCostura += diferenca(TAM - 1, 0, j);
      somaInterna += diferenca(TAM / 2 - 1, TAM / 2, j);
    }
    // A diferença média na emenda (última coluna → primeira) não é maior que numa junta qualquer
    // no meio da textura: não há uma linha de corte visível ao repetir o ladrilho.
    expect(somaCostura / TAM).toBeLessThan((somaInterna / TAM) * 3 + 5);
  });
});
