import { describe, expect, it } from 'vitest';
import {
  alturaMaxima,
  aplicarPan,
  aplicarZoom,
  atualizarCamera,
  CAMERA_RTS,
  centrarEm,
  criarEstadoCamera,
  inclinacao,
  poseDaCamera,
  rotacionar,
  rumoDaCamera,
  voltarAoNorte,
} from '../../src/render/cameraRts';
import {
  arco,
  diferenca,
  normalizar,
  norteEm,
  produtoEscalar,
  type Vec3,
} from '../../src/sim/map/esfera';

const RAIO = 144;
const graus = (rad: number) => (rad * 180) / Math.PI;
const naSuperficie = (d: Vec3): Vec3 => normalizar(d);

describe('CTL-01/CTL-16: zoom e inclinação', () => {
  it('o zoom vai de 15 m até a visão planetária (3,5 × raio do centro)', () => {
    const estado = criarEstadoCamera([1, 0, 0], RAIO);
    aplicarZoom(estado, -100);
    expect(estado.alturaAlvo).toBe(15);
    aplicarZoom(estado, 100);
    expect(estado.alturaAlvo).toBe(alturaMaxima(estado));
    expect(RAIO + estado.alturaAlvo).toBeCloseTo(3.5 * RAIO, 9);
  });

  it('a inclinação é 55° até 120 m, cai até ~35° perto do solo e vai a 90° na visão planetária', () => {
    expect(graus(inclinacao(120, RAIO))).toBeCloseTo(55, 6);
    expect(graus(inclinacao(50, RAIO))).toBeCloseTo(55, 6);
    expect(graus(inclinacao(15, RAIO))).toBeCloseTo(35, 6);
    expect(graus(inclinacao(alturaMaxima({ raio: RAIO }), RAIO))).toBeCloseTo(90, 6);
    let anterior = graus(inclinacao(15, RAIO));
    for (let h = 16; h <= alturaMaxima({ raio: RAIO }); h++) {
      const atual = graus(inclinacao(h, RAIO));
      expect(atual).toBeGreaterThanOrEqual(anterior - 1e-9);
      expect(atual - anterior).toBeLessThan(1.5);
      anterior = atual;
    }
  });

  it('a altura persegue o alvo de forma suave', () => {
    const estado = criarEstadoCamera([1, 0, 0], RAIO);
    aplicarZoom(estado, -10);
    atualizarCamera(estado, 1 / 60);
    expect(estado.altura).toBeLessThan(CAMERA_RTS.alturaInicial_m);
    expect(estado.altura).toBeGreaterThan(estado.alturaAlvo);
    for (let i = 0; i < 120; i++) atualizarCamera(estado, 1 / 60);
    expect(estado.altura).toBeCloseTo(estado.alturaAlvo, 3);
  });

  it('a câmera fica atrás e acima do foco, na inclinação da altura atual (vertical local)', () => {
    const foco = naSuperficie([1, 0.3, -0.2]);
    const estado = criarEstadoCamera(foco, RAIO);
    const { olho, alvo, cima } = poseDaCamera(estado, 5);
    expect(arco(normalizar(alvo), foco)).toBeLessThan(1e-12);
    expect(Math.hypot(...alvo)).toBeCloseTo(RAIO + 5, 9);
    const v = diferenca(olho, alvo);
    const vertical = produtoEscalar(v, foco);
    expect(vertical).toBeCloseTo(estado.altura, 9);
    const horizontal = Math.hypot(...diferenca(v, foco.map((c) => c * vertical) as Vec3));
    expect(graus(Math.atan2(vertical, horizontal))).toBeCloseTo(55, 6);
    // Olhando para o norte, a câmera fica ao sul do foco.
    expect(produtoEscalar(v, norteEm(foco))).toBeLessThan(0);
    // "Cima" da tela é perpendicular à linha de visada.
    expect(produtoEscalar(cima, normalizar(v))).toBeCloseTo(0, 9);
  });
});

describe('CTL-02: pan, rotação e Home no planeta', () => {
  it('o pan é relativo à tela e proporcional à altura (pelo arco)', () => {
    const estado = criarEstadoCamera([1, 0, 0], RAIO);
    const antes = estado.foco;
    aplicarPan(estado, 1, 0, 1);
    expect(RAIO * arco(antes, estado.foco)).toBeCloseTo(CAMERA_RTS.panPorAltura * estado.altura, 6);
    // Andou para o norte (a frente inicial).
    expect(estado.foco[1]).toBeGreaterThan(0);

    const girada = criarEstadoCamera([1, 0, 0], RAIO);
    rotacionar(girada, Math.PI / 2 / CAMERA_RTS.rotacaoPorPixel_rad);
    aplicarPan(girada, 1, 0, 1);
    expect(Math.abs(girada.foco[1])).toBeLessThan(1e-9);
  });

  it('dá a volta no planeta sem a câmera girar sozinha', () => {
    const estado = criarEstadoCamera([1, 0, 0], RAIO);
    rotacionar(estado, 123);
    const rumoInicial = estado.frente;
    const volta = 2 * Math.PI * RAIO;
    const passo = CAMERA_RTS.panPorAltura * estado.altura * 0.01;
    for (let k = 0; k < Math.round(volta / passo); k++) aplicarPan(estado, 1, 0, 0.01);
    expect(RAIO * arco(estado.foco, [1, 0, 0])).toBeLessThan(passo);
    expect(arco(estado.frente, rumoInicial)).toBeLessThan(0.02);
  });

  it('Home volta a olhar para o norte', () => {
    const estado = criarEstadoCamera(naSuperficie([0.2, 0.5, 1]), RAIO);
    rotacionar(estado, 300);
    expect(Math.abs(rumoDaCamera(estado))).toBeGreaterThan(0.1);
    voltarAoNorte(estado);
    expect(rumoDaCamera(estado)).toBeCloseTo(0, 9);
  });

  it('CTL-03: centrar leva o foco ao ponto e mantém a frente tangente', () => {
    const estado = criarEstadoCamera([1, 0, 0], RAIO);
    centrarEm(estado, [0, 0, -3]);
    expect(estado.foco).toEqual([0, 0, -1]);
    expect(produtoEscalar(estado.frente, estado.foco)).toBeCloseTo(0, 12);
  });
});
