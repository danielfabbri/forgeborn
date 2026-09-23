import { describe, expect, it } from 'vitest';
import {
  aplicarPan,
  aplicarZoom,
  atualizarCamera,
  CAMERA_RTS,
  centrarEm,
  criarEstadoCamera,
  inclinacao,
  poseDaCamera,
  rotacionar,
  voltarAoNorte,
} from '../../src/render/cameraRts';

const graus = (rad: number) => (rad * 180) / Math.PI;

describe('CTL-01: zoom e inclinação', () => {
  it('o zoom fica entre 15 m e 120 m de altura', () => {
    const estado = criarEstadoCamera(0, 0, 200);
    aplicarZoom(estado, -100);
    expect(estado.alturaAlvo).toBe(15);
    aplicarZoom(estado, 100);
    expect(estado.alturaAlvo).toBe(120);
  });

  it('a inclinação é 55° no alto e cai suavemente até ~35° perto do solo', () => {
    expect(graus(inclinacao(120))).toBeCloseTo(55, 6);
    expect(graus(inclinacao(50))).toBeCloseTo(55, 6);
    expect(graus(inclinacao(15))).toBeCloseTo(35, 6);
    let anterior = graus(inclinacao(15));
    for (let h = 16; h <= 50; h++) {
      const atual = graus(inclinacao(h));
      expect(atual).toBeGreaterThanOrEqual(anterior);
      expect(atual - anterior).toBeLessThan(1.5);
      anterior = atual;
    }
  });

  it('a altura persegue o alvo de forma suave', () => {
    const estado = criarEstadoCamera(0, 0, 200);
    aplicarZoom(estado, -10);
    atualizarCamera(estado, 1 / 60);
    expect(estado.altura).toBeLessThan(CAMERA_RTS.alturaInicial_m);
    expect(estado.altura).toBeGreaterThan(estado.alturaAlvo);
    for (let i = 0; i < 120; i++) atualizarCamera(estado, 1 / 60);
    expect(estado.altura).toBeCloseTo(estado.alturaAlvo, 3);
  });

  it('a câmera fica atrás e acima do foco, na inclinação da altura atual', () => {
    const estado = criarEstadoCamera(10, 20, 200);
    const { olho, alvo } = poseDaCamera(estado, 5);
    expect(alvo).toEqual([10, 5, 20]);
    expect(olho[1]).toBeCloseTo(5 + estado.altura, 9);
    const horizontal = Math.hypot(olho[0] - alvo[0], olho[2] - alvo[2]);
    expect(graus(Math.atan2(olho[1] - alvo[1], horizontal))).toBeCloseTo(55, 6);
    // Olhando para o norte (−z), a câmera fica ao sul do foco.
    expect(olho[2]).toBeGreaterThan(alvo[2]);
  });
});

describe('CTL-02: pan, rotação e Home', () => {
  it('o pan é relativo à tela e proporcional à altura', () => {
    const estado = criarEstadoCamera(0, 0, 500);
    aplicarPan(estado, 1, 0, 1);
    expect(estado.focoX).toBeCloseTo(0, 9);
    expect(estado.focoZ).toBeCloseTo(-CAMERA_RTS.panPorAltura * estado.altura, 9);

    const girada = criarEstadoCamera(0, 0, 500);
    rotacionar(girada, Math.PI / 2 / CAMERA_RTS.rotacaoPorPixel_rad);
    aplicarPan(girada, 1, 0, 1);
    expect(girada.focoX).toBeCloseTo(CAMERA_RTS.panPorAltura * girada.altura, 6);
    expect(girada.focoZ).toBeCloseTo(0, 6);
  });

  it('Home volta a olhar para o norte', () => {
    const estado = criarEstadoCamera(0, 0, 200);
    rotacionar(estado, 300);
    expect(estado.yaw).not.toBe(0);
    voltarAoNorte(estado);
    expect(estado.yaw).toBe(0);
  });

  it('o foco nunca sai do mapa', () => {
    const estado = criarEstadoCamera(0, 0, 240);
    for (let i = 0; i < 1000; i++) aplicarPan(estado, 1, -1, 0.1);
    expect(estado.focoX).toBe(-240);
    expect(estado.focoZ).toBe(-240);
    centrarEm(estado, 999, 999);
    expect([estado.focoX, estado.focoZ]).toEqual([240, 240]);
  });
});
