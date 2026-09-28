import { describe, expect, it } from 'vitest';
import { PerspectiveCamera } from 'three';
import {
  baseDoGlobo,
  campoDaCamera,
  desprojetar,
  desprojetarMundi,
  longitudeDe,
  pintarGlobo,
  projetar,
  projetarMundi,
} from '../../src/render/minimapa';
import { normalizar, type Vec3 } from '../../src/sim/map/esfera';

const perto = (a: Vec3, b: Vec3) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i]!, 6));

describe('T-074 — VIS-09, CTL-03: minimapa', () => {
  it('CTL-03: o foco fica no centro do globo e o norte do planeta para cima', () => {
    const base = baseDoGlobo([1, 0, 0]);
    expect(projetar(base, [1, 0, 0])).toEqual({ x: 0, y: 0 });
    const norte = projetar(base, normalizar([1, 0.3, 0]))!;
    expect(norte.x).toBeCloseTo(0, 9);
    expect(norte.y).toBeGreaterThan(0);
  });

  it('CTL-03: o globo gira com o foco e o lado de trás não aparece', () => {
    const foco = normalizar([0.2, -0.4, 0.9]);
    const base = baseDoGlobo(foco);
    expect(projetar(base, foco)!.x).toBeCloseTo(0, 9);
    expect(projetar(base, [-foco[0], -foco[1], -foco[2]])).toBeNull();
  });

  it('CTL-03: clicar num ponto do disco dá a direção desenhada ali (ida e volta)', () => {
    const base = baseDoGlobo(normalizar([0.5, 0.5, -0.7]));
    const d = desprojetar(base, 0.3, -0.45)!;
    const p = projetar(base, d)!;
    expect(p.x).toBeCloseTo(0.3, 9);
    expect(p.y).toBeCloseTo(-0.45, 9);
    perto(desprojetar(base, 0, 0)!, base.foco);
    expect(desprojetar(base, 0.9, 0.9)).toBeNull();
  });

  it('VIS-09: o globo mostra os três estados da névoa da grade do jogador', () => {
    const n = 8;
    const base = baseDoGlobo([1, 0, 0]);
    const lado = 32;
    const estados = new Array<number>(6 * n * n).fill(0);
    const pixels = new Uint8ClampedArray(lado * lado * 4);
    const noCentro = () => [
      ...pixels.slice(((lado / 2) * lado + lado / 2) * 4, ((lado / 2) * lado + lado / 2) * 4 + 4),
    ];
    const brilhos = [0, 1, 2].map((e) => {
      estados.fill(e);
      pintarGlobo(pixels, lado, base, estados, n);
      return noCentro()[0]!;
    });
    expect(brilhos[0]).toBeLessThan(brilhos[1]!);
    expect(brilhos[1]).toBeLessThan(brilhos[2]!);
    // Fora do disco, transparente.
    expect(pixels[3]).toBe(0);
  });

  it('VIS-09: o campo da câmera cerca o ponto que ela olha; sem chão na borda, vai ao horizonte', () => {
    const raio = 500;
    const camera = new PerspectiveCamera(50, 16 / 9, 0.5, 6000);
    camera.position.set(raio + 80, 0, 0);
    camera.up.set(0, 1, 0);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    const base = baseDoGlobo([1, 0, 0]);
    const perto = campoDaCamera(camera, raio).map((d) => projetar(base, d)!);
    expect(Math.min(...perto.map((p) => p.x))).toBeLessThan(0);
    expect(Math.max(...perto.map((p) => p.x))).toBeGreaterThan(0);
    expect(Math.min(...perto.map((p) => p.y))).toBeLessThan(0);
    expect(Math.max(...perto.map((p) => p.y))).toBeGreaterThan(0);

    // De longe, o planeta inteiro cabe na tela: o campo é o horizonte, quase a borda do disco.
    camera.position.set(raio * 6, 0, 0);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    for (const d of campoDaCamera(camera, raio)) {
      const p = projetar(base, d)!;
      expect(Math.hypot(p.x, p.y)).toBeGreaterThan(0.95);
    }
  });
});

describe('T-168 — CTL-03, D-83: minimapa em mapa-múndi', () => {
  it('CTL-03: o foco fica no meio, o norte para cima e o leste à direita; ida e volta exatas', () => {
    const foco: Vec3 = normalizar([0.6, 0.3, -0.7]);
    const lon0 = longitudeDe(foco);
    const meio = projetarMundi(lon0, foco);
    expect(meio.x).toBeCloseTo(0, 9);
    expect(meio.y).toBeGreaterThan(0);
    const norte = normalizar([foco[0], foco[1] + 0.3, foco[2]]);
    expect(projetarMundi(lon0, norte).y).toBeGreaterThan(meio.y);
    // Leste a partir do foco (−z é o leste no equador de +x).
    const leste = desprojetarMundi(lon0, 0.1, meio.y);
    expect(projetarMundi(lon0, leste).x).toBeCloseTo(0.1, 9);
    for (const [x, y] of [
      [-0.9, 0.5],
      [0.3, -0.8],
      [0.99, 0],
    ]) {
      const p = projetarMundi(lon0, desprojetarMundi(lon0, x!, y!));
      expect(p.x).toBeCloseTo(x!, 9);
      expect(p.y).toBeCloseTo(y!, 9);
    }
  });

  it('CTL-03: o norte não depende do foco (o mapa só rola leste–oeste)', () => {
    const polo: Vec3 = [0, 1, 0];
    for (const lon0 of [0, 1, 2.5, -3]) expect(projetarMundi(lon0, polo).y).toBeCloseTo(1, 9);
  });
});
