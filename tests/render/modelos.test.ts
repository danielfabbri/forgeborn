import { Box3 } from 'three';
import { describe, expect, it } from 'vitest';
import { EMIS_NACAO, geometriaDoModelo, TIPOS_DE_MODELO } from '../../src/render/modelos';
import { dados } from '../../src/sim';

describe('ART-02/ART-03/TEC-18: modelos placeholder', () => {
  it('há modelo para as 13 unidades móveis, as 14 estruturas, a mina, o satélite e os mísseis', () => {
    const esperados = [...dados.moveis.map((m) => m.id), ...dados.estruturas.map((e) => e.id)];
    expect(esperados).toHaveLength(27);
    for (const id of esperados) expect(TIPOS_DE_MODELO).toContain(id);
    expect(TIPOS_DE_MODELO).toContain('mine');
    // D-51: o satélite em órbita é um corpo desenhado.
    expect(TIPOS_DE_MODELO).toContain('satellite');
    expect(TIPOS_DE_MODELO).toContain('missile_short');
    expect(TIPOS_DE_MODELO).toContain('missile_long');
  });

  it.each(TIPOS_DE_MODELO)('ART-02: %s tem tarja e olho na cor da nação', (tipo) => {
    const geo = geometriaDoModelo(tipo);
    const emis = geo.getAttribute('aEmis');
    let nacao = 0;
    for (let i = 0; i < emis.count; i++) if (emis.getX(i) === EMIS_NACAO) nacao++;
    expect(nacao).toBeGreaterThan(0);
    expect(geo.getAttribute('color').count).toBe(geo.getAttribute('position').count);
  });

  it('ART-03: silhuetas distintas (contorno e altura diferentes entre tipos)', () => {
    const assinaturas = TIPOS_DE_MODELO.map((tipo) => {
      const caixa = new Box3().setFromBufferAttribute(
        geometriaDoModelo(tipo).getAttribute('position') as never,
      );
      const s = caixa.getSize(caixa.min.clone());
      return `${s.x.toFixed(1)}×${s.y.toFixed(1)}×${s.z.toFixed(1)}`;
    });
    expect(new Set(assinaturas).size).toBe(TIPOS_DE_MODELO.length);
  });

  it('estruturas cabem na pegada; móveis ficam perto do raio de colisão', () => {
    for (const e of dados.estruturas) {
      const caixa = new Box3().setFromBufferAttribute(
        geometriaDoModelo(e.id).getAttribute('position') as never,
      );
      // folga para rampa e pernas da Nave
      expect(Math.max(-caixa.min.x, caixa.max.x, -caixa.min.z, caixa.max.z)).toBeLessThanOrEqual(
        e.pegada_m / 2 + 1.5,
      );
    }
    for (const m of dados.moveis) {
      const caixa = new Box3().setFromBufferAttribute(
        geometriaDoModelo(m.id).getAttribute('position') as never,
      );
      const meiaLargura = Math.max(caixa.max.x, -caixa.min.x, caixa.max.z, -caixa.min.z);
      expect(meiaLargura).toBeLessThanOrEqual(m.raio_m * 1.35);
    }
  });
});
