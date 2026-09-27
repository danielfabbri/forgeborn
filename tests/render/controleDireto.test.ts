import { describe, expect, it } from 'vitest';
import { alvoNoRaio, poseDireta, rumoEmGraus } from '../../src/input/controleDireto';
import { naBussola } from '../../src/ui/ControleDireto';

const corpo = { x: 100, y: 0, z: 0, cima: [1, 0, 0] as [number, number, number], altura: 2 };
const NORTE: [number, number, number] = [0, 1, 0];
const dist = (a: number[], b: number[]) => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);

describe('T-110 — CTL-15: câmeras do controle direto', () => {
  it('CTL-15: 1ª pessoa no sensor da unidade, olhando para a mira', () => {
    const pose = poseDireta(corpo, NORTE, 0, '1p');
    expect(pose.olho[0]).toBeGreaterThan(100);
    expect(pose.olho[0]).toBeLessThanOrEqual(102);
    expect(pose.alvo[1] - pose.olho[1]).toBeGreaterThan(0);
  });

  it('CTL-15: 3ª pessoa ~3 m acima e ~7 m atrás', () => {
    const pose = poseDireta(corpo, NORTE, 0, '3p');
    const foco = [100 + 2 * 0.6, 0, 0];
    expect(pose.olho[0] - foco[0]!).toBeCloseTo(3, 5);
    expect(pose.olho[1]).toBeCloseTo(-7, 5);
    expect(dist(pose.olho, foco)).toBeCloseTo(Math.hypot(3, 7), 5);
  });

  it('D-43: a órbita do botão do meio gira a câmera da 3ª pessoa em volta da unidade', () => {
    const atras = poseDireta(corpo, NORTE, 0, '3p');
    const lado = poseDireta(corpo, NORTE, 0, '3p', { rumo: Math.PI / 2, inclinacao: 0 });
    expect(Math.abs(lado.olho[2])).toBeCloseTo(7, 5);
    expect(dist(atras.olho, lado.olho)).toBeGreaterThan(5);
  });
});

describe('T-112/T-113 — CTL-11, CTL-14: mira e bússola', () => {
  it('CTL-11: o alvo sob a mira é o corpo mais perto atravessado pelo raio, sem o próprio', () => {
    const corpos = [
      { id: 1, x: 0, y: 10, z: 0, cima: [1, 0, 0] as [number, number, number], raio: 1, altura: 1 },
      { id: 2, x: 0, y: 20, z: 0, cima: [1, 0, 0] as [number, number, number], raio: 1, altura: 1 },
      { id: 3, x: 0, y: 5, z: 5, cima: [1, 0, 0] as [number, number, number], raio: 1, altura: 1 },
    ];
    expect(alvoNoRaio([0, 0, 0], NORTE, corpos, null)).toBe(1);
    expect(alvoNoRaio([0, 0, 0], NORTE, corpos, 1)).toBe(2);
    expect(alvoNoRaio([0, 0, 0], [0, -1, 0], corpos, null)).toBeNull();
  });

  it('CTL-14: rumo em graus a partir do norte e a faixa da bússola', () => {
    const cima: [number, number, number] = [1, 0, 0];
    expect(rumoEmGraus(cima, NORTE, NORTE)).toBeCloseTo(0, 5);
    // O leste é norte × cima (como no minimapa).
    expect(rumoEmGraus(cima, [0, 0, -1], NORTE)).toBeCloseTo(90, 5);
    expect(naBussola(0, 0)).toBe(0.5);
    expect(naBussola(45, 0)).toBeCloseTo(0.75, 5);
    expect(naBussola(350, 0)).toBeCloseTo(0.5 - 10 / 180, 5);
    expect(naBussola(180, 0)).toBeNull();
  });
});
