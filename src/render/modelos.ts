/**
 * Modelos procedurais refinados (D-45, ART-01 a ART-03, TEC-18) com as silhuetas das fichas
 * (§8.5). Cada tipo vira uma única geometria mesclada, para ser desenhada com instancing
 * (TEC-16). Hard-surface: caixas chanfradas, painéis e detalhes; o material é PBR por parte
 * e o desgaste nas bordas é do shader (criarMaterial, em unidades.ts).
 *
 * Convenções: frente em +x (heading 0 da simulação), origem no ponto de apoio (base do casco
 * para hovers, que já flutuam na altura da simulação; chão para estruturas e drones pousados).
 * Atributos: `color` (cor de vértice), `aEmis` (0 = sem brilho, 1 = cor da nação, tarja e
 * olho de ART-02; 2 = brilho fixo na própria cor do vértice), `aMat` (rugosidade, metal e
 * 1 nos painéis que recebem juntas) e `aDesgaste` (0..1, borda chanfrada que se desgasta).
 */
import {
  BoxGeometry,
  type BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Euler,
  Float32BufferAttribute,
  Matrix4,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { EstruturasId, MoveisId } from '../sim/data';

export type TipoDeModelo =
  MoveisId | EstruturasId | 'mine' | 'satellite' | 'missile_short' | 'missile_long';

export const EMIS_NENHUM = 0;
export const EMIS_NACAO = 1;
export const EMIS_FIXO = 2;

// Paleta de ART-02: base grafite escuro, painéis cinza-médio.
const GRAFITE = new Color('#2a2c30');
const PAINEL = new Color('#6a6e75');
const METAL = new Color('#9a9ea6');
const VIDRO = new Color('#1c2740');
const CIANO = new Color('#39e6ff');
const BRASA = new Color('#ff7a1f');

type Cor = Color | 'nacao' | { brilho: Color };

/** PBR por parte (apresentação): rugosidade, metal e se a superfície tem juntas de painel. */
function materialDe(cor: Cor): [number, number, number] {
  if (cor === GRAFITE) return [0.78, 0.35, 0];
  if (cor === PAINEL) return [0.55, 0.5, 1];
  if (cor === METAL) return [0.32, 0.85, 0];
  if (cor === VIDRO) return [0.08, 0.3, 0];
  return [0.4, 0.2, 0];
}

/** Borda chanfrada: a normal foge dos eixos (1 - maior componente absoluto). */
function desgasteDasBordas(geo: BufferGeometry): Float32Array {
  const normais = geo.getAttribute('normal');
  const saida = new Float32Array(normais.count);
  for (let i = 0; i < normais.count; i++) {
    const m = Math.max(
      Math.abs(normais.getX(i)),
      Math.abs(normais.getY(i)),
      Math.abs(normais.getZ(i)),
    );
    saida[i] = Math.min(1, Math.max(0, (1 - m) / 0.25));
  }
  return saida;
}

interface Pose {
  x?: number;
  y?: number;
  z?: number;
  rx?: number;
  ry?: number;
  rz?: number;
}

class Montagem {
  private readonly partes: BufferGeometry[] = [];

  add(geo: BufferGeometry, cor: Cor, pose: Pose = {}, chanfrada = false): this {
    // O desgaste sai das normais antes da pose (no espaço da própria peça).
    const desgaste = chanfrada
      ? desgasteDasBordas(geo)
      : new Float32Array(geo.getAttribute('position').count);
    const m = new Matrix4().compose(
      new Vector3(pose.x ?? 0, pose.y ?? 0, pose.z ?? 0),
      new Quaternion().setFromEuler(new Euler(pose.rx ?? 0, pose.ry ?? 0, pose.rz ?? 0)),
      new Vector3(1, 1, 1),
    );
    geo.applyMatrix4(m);
    const n = geo.getAttribute('position').count;
    const base = cor === 'nacao' ? new Color(1, 1, 1) : cor instanceof Color ? cor : cor.brilho;
    const emis = cor === 'nacao' ? EMIS_NACAO : cor instanceof Color ? EMIS_NENHUM : EMIS_FIXO;
    const cores = new Float32Array(n * 3);
    const emissivo = new Float32Array(n).fill(emis);
    for (let i = 0; i < n; i++) base.toArray(cores, i * 3);
    geo.setAttribute('color', new Float32BufferAttribute(cores, 3));
    geo.setAttribute('aEmis', new Float32BufferAttribute(emissivo, 1));
    const [rugosidade, metal, painel] = materialDe(cor);
    const mat = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) mat.set([rugosidade, metal, painel], i * 3);
    geo.setAttribute('aMat', new Float32BufferAttribute(mat, 3));
    geo.setAttribute(
      'aDesgaste',
      new Float32BufferAttribute(emis === EMIS_NENHUM ? desgaste : new Float32Array(n), 1),
    );
    geo.deleteAttribute('uv');
    this.partes.push(geo);
    return this;
  }

  /** Caixa chanfrada com a base em y (e não o centro); peças finas ficam retas. */
  caixa(sx: number, sy: number, sz: number, cor: Cor, pose: Pose = {}): this {
    const menor = Math.min(sx, sy, sz);
    const chanfro = Math.min(0.08, menor * 0.18);
    const geo =
      menor >= 0.12 ? new RoundedBoxGeometry(sx, sy, sz, 1, chanfro) : new BoxGeometry(sx, sy, sz);
    return this.add(geo, cor, { ...pose, y: (pose.y ?? 0) + sy / 2 }, menor >= 0.12);
  }

  /** Cilindro vertical com a base em y. */
  cilindro(r: number, h: number, cor: Cor, pose: Pose = {}, segmentos = 12, rTopo = r): this {
    return this.add(new CylinderGeometry(rTopo, r, h, segmentos), cor, {
      ...pose,
      y: (pose.y ?? 0) + h / 2,
    });
  }

  /** Cilindro deitado ao longo de x, centrado em (x, y, z). */
  tubo(r: number, comprimento: number, cor: Cor, pose: Pose = {}, segmentos = 10): this {
    return this.add(new CylinderGeometry(r, r, comprimento, segmentos), cor, {
      ...pose,
      rz: Math.PI / 2 + (pose.rz ?? 0),
    });
  }

  esfera(r: number, cor: Cor, pose: Pose = {}): this {
    return this.add(new SphereGeometry(r, 12, 8), cor, pose);
  }

  pronta(): BufferGeometry {
    // Peças chanfradas não são indexadas; o resto vira não indexado para mesclar junto.
    const geo = mergeGeometries(
      this.partes.map((p) => (p.index ? p.toNonIndexed() : p)),
      false,
    );
    if (!geo) throw new Error('modelos: falha ao mesclar as partes');
    geo.computeBoundingSphere();
    return geo;
  }
}

/** Brilho dos propulsores de sustentação dos hovers (apresentação). */
const SUSTENTACAO = new Color('#6fb8ff');

/**
 * Casco de hover (ART-02): saia escura com propulsores de sustentação acesos por baixo, casco
 * chanfrado com para-choque, frisos laterais, grelhas traseiras e a tarja da nação no dorso.
 */
function casco(m: Montagem, c: number, l: number, h: number, tarja = 0.3): Montagem {
  m.caixa(c * 0.92, 0.18, l * 0.92, GRAFITE, { y: -0.12 });
  for (const [sx, sz] of [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ] as const) {
    m.add(
      new CylinderGeometry(Math.min(c, l) * 0.14, Math.min(c, l) * 0.14, 0.04, 12),
      {
        brilho: SUSTENTACAO,
      },
      { x: sx * c * 0.3, z: sz * l * 0.28, y: -0.14 },
    );
  }
  m.caixa(c, h, l, PAINEL);
  m.caixa(0.14, h * 0.7, l * 0.84, GRAFITE, { x: c / 2, y: h * 0.1 });
  for (const z of [-1, 1])
    m.caixa(c * 0.78, 0.07, 0.05, METAL, { y: h * 0.45, z: z * (l / 2 + 0.02) });
  for (const z of [-0.18, 0, 0.18])
    m.caixa(0.05, h * 0.45, l * 0.12, GRAFITE, { x: -c / 2, y: h * 0.25, z: z * l });
  m.caixa(c * 0.7, 0.04, l * tarja, 'nacao', { y: h, x: -c * 0.05 });
  return m;
}

function olho(m: Montagem, x: number, y: number, z = 0, r = 0.16): Montagem {
  m.esfera(r * 1.35, GRAFITE, { x: x - r * 0.4, y, z });
  return m.esfera(r, 'nacao', { x, y, z });
}

function antena(m: Montagem, x: number, y: number, z: number, h: number): Montagem {
  m.cilindro(0.025, h, METAL, { x, y, z }, 6);
  return m.esfera(0.05, 'nacao', { x, y: y + h, z });
}

const CONSTRUTORES: Record<TipoDeModelo, () => BufferGeometry> = {
  // Hover compacto com braço de mineração e caçamba.
  hover_explorer: () => {
    const m = casco(new Montagem(), 1.5, 1.3, 0.55);
    // Cabine e caçamba traseira aberta.
    m.caixa(0.55, 0.32, 0.7, GRAFITE, { x: 0.15, y: 0.55 });
    m.caixa(0.5, 0.05, 0.9, METAL, { x: -0.45, y: 0.55 });
    for (const z of [-0.43, 0.43]) m.caixa(0.5, 0.3, 0.05, METAL, { x: -0.45, y: 0.55, z });
    m.caixa(0.05, 0.3, 0.9, METAL, { x: -0.7, y: 0.55 });
    // Braço de mineração com broca.
    m.caixa(0.6, 0.12, 0.14, METAL, { x: 0.72, y: 0.62, rz: -0.55 });
    m.caixa(0.35, 0.1, 0.12, GRAFITE, { x: 1.02, y: 0.34, rz: -1.2 });
    m.add(new ConeGeometry(0.1, 0.3, 8), METAL, { x: 1.12, y: 0.12, rz: Math.PI });
    antena(m, -0.2, 0.87, 0.25, 0.4);
    return olho(m, 0.44, 0.7).pronta();
  },
  // Pórtico alto sobre base hover, com cabeça de impressão num trilho; a linha brilha na cor da nação.
  printer: () => {
    const m = casco(new Montagem(), 3.2, 2.6, 0.6, 0.15);
    for (const z of [-1.1, 1.1]) {
      m.caixa(0.35, 2.4, 0.35, GRAFITE, { x: 0.2, y: 0.6, z });
      m.caixa(0.6, 0.2, 0.5, METAL, { x: 0.2, y: 0.6, z });
    }
    m.caixa(0.5, 0.35, 2.6, PAINEL, { x: 0.2, y: 3.0 });
    m.caixa(0.08, 0.08, 2.3, 'nacao', { x: 0.48, y: 3.1 });
    // Carro da cabeça de impressão e o bico.
    m.caixa(0.45, 0.6, 0.45, METAL, { x: 0.2, y: 2.4, z: 0.3 });
    m.add(new ConeGeometry(0.12, 0.35, 8), METAL, { x: 0.2, y: 2.25, z: 0.3, rz: Math.PI });
    // Bobinas de filamento e mesa de impressão.
    for (const z of [-0.6, 0.6])
      m.tubo(0.28, 0.35, GRAFITE, { x: -1.1, y: 0.95, z, rz: 0, ry: Math.PI / 2 });
    m.caixa(2.0, 0.08, 1.8, METAL, { x: 0.2, y: 0.6 });
    return olho(m, 1.62, 0.4).pronta();
  },
  // Baixo e ágil, com canhão laser duplo curto.
  hover_ex1: () => {
    const m = casco(new Montagem(), 2.4, 1.7, 0.45);
    // Blindagem lateral inclinada.
    for (const z of [-1, 1])
      m.caixa(1.9, 0.3, 0.12, GRAFITE, { y: 0.2, z: z * 0.88, rx: z * 0.35 });
    // A torre com canos duplos é peça à parte (TORRES, ART-12).
    antena(m, -0.8, 0.45, 0.5, 0.35);
    return olho(m, 1.22, 0.3).pronta();
  },
  // Largo e pesado, com lançador dorsal de tubos.
  hover_opq: () => {
    const m = casco(new Montagem(), 2.7, 2.7, 0.75, 0.2);
    for (const z of [-1, 1]) m.caixa(2.4, 0.45, 0.14, GRAFITE, { y: 0.1, z: z * 1.38 });
    // O lançador de 8 tubos gira sobre o dorso (TORRES, ART-12).
    m.cilindro(0.7, 0.12, METAL, { x: -0.1, y: 0.63 }, 12);
    return olho(m, 1.37, 0.5).pronta();
  },
  // Casco achatado com tambor giratório de minas na traseira.
  hover_minelayer: () => {
    const m = casco(new Montagem(), 2.4, 1.9, 0.35);
    m.add(new CylinderGeometry(0.55, 0.55, 1.5, 14), GRAFITE, {
      x: -0.85,
      y: 0.8,
      rx: Math.PI / 2,
    });
    for (const z of [-0.6, 0.6])
      m.add(new TorusGeometry(0.55, 0.05, 6, 16), METAL, { x: -0.85, y: 0.8, z });
    m.add(new TorusGeometry(0.55, 0.06, 6, 16), 'nacao', { x: -0.85, y: 0.8 });
    // Calha de lançamento e suportes do tambor.
    m.caixa(0.35, 0.08, 0.5, METAL, { x: -1.15, y: 0.15, rz: 0.5 });
    for (const z of [-0.8, 0.8]) m.caixa(0.35, 0.5, 0.1, PAINEL, { x: -0.85, y: 0.35, z });
    return olho(m, 1.22, 0.22).pronta();
  },
  // Chassi fino com mastro de sensores (que se estende em Sentinela).
  hover_scout: () => {
    const m = casco(new Montagem(), 2.0, 0.9, 0.35, 0.5);
    m.cilindro(0.1, 1.2, GRAFITE, { x: -0.3, y: 0.35 }, 8);
    m.cilindro(0.06, 1.5, METAL, { x: -0.3, y: 1.5 }, 8);
    m.add(new ConeGeometry(0.4, 0.3, 12), PAINEL, { x: -0.3, y: 3.0, rx: Math.PI });
    m.add(new TorusGeometry(0.4, 0.03, 4, 16), METAL, { x: -0.3, y: 2.86, rx: Math.PI / 2 });
    for (const z of [-0.35, 0.35]) antena(m, 0.5, 0.35, z, 0.3);
    return olho(m, -0.3, 3.2, 0, 0.22).pronta();
  },
  // Asa delta a jato com compartimento de bombas ventral.
  drone_bomber: () => {
    const m = new Montagem();
    m.add(new CylinderGeometry(1.5, 1.5, 0.16, 3), PAINEL, { y: 0.5, ry: 0 });
    m.caixa(1.8, 0.3, 0.4, GRAFITE, { x: -0.1, y: 0.55 });
    m.caixa(0.5, 0.18, 0.3, VIDRO, { x: 0.45, y: 0.78 });
    m.caixa(0.9, 0.35, 0.6, GRAFITE, { x: -0.1, y: 0.15 });
    m.caixa(0.7, 0.04, 0.5, METAL, { x: -0.1, y: 0.13 });
    m.caixa(1.2, 0.04, 0.12, 'nacao', { x: -0.3, y: 0.86 });
    // Luzes nas pontas das asas e o bocal do jato.
    for (const z of [-1.25, 1.25]) m.esfera(0.06, 'nacao', { x: -0.72, y: 0.52, z });
    m.tubo(0.16, 0.25, GRAFITE, { x: -0.95, y: 0.6 });
    m.tubo(0.12, 0.3, { brilho: BRASA }, { x: -1.05, y: 0.6 });
    return olho(m, 0.85, 0.62, 0, 0.13).pronta();
  },
  // Quadrirrotor carenado com canhão ventral.
  drone_laser: () => {
    const m = new Montagem();
    m.cilindro(0.5, 0.45, PAINEL, { y: 0.35 }, 12, 0.4);
    m.cilindro(0.3, 0.1, GRAFITE, { y: 0.8 }, 12);
    for (const a of [0.785, 2.356, 3.927, 5.498]) {
      const x = Math.cos(a) * 0.95;
      const z = Math.sin(a) * 0.95;
      m.caixa(0.9, 0.08, 0.1, GRAFITE, { x: x / 2, z: z / 2, y: 0.55, ry: -a });
      m.add(new TorusGeometry(0.38, 0.05, 6, 16), GRAFITE, { x, z, y: 0.6, rx: Math.PI / 2 });
      // Pás cruzadas do rotor.
      m.caixa(0.66, 0.015, 0.06, METAL, { x, z, y: 0.62, ry: a });
      m.caixa(0.66, 0.015, 0.06, METAL, { x, z, y: 0.62, ry: a + Math.PI / 2 });
    }
    m.tubo(0.07, 0.8, METAL, { x: 0.4, y: 0.22 });
    m.esfera(0.05, { brilho: BRASA }, { x: 0.8, y: 0.22 });
    m.add(new TorusGeometry(0.46, 0.04, 6, 16), 'nacao', { y: 0.8, rx: Math.PI / 2 });
    return olho(m, 0.45, 0.45, 0, 0.12).pronta();
  },
  // Caçamba grande com rampa lateral.
  mobile_silo: () => {
    const m = casco(new Montagem(), 3.6, 2.8, 0.5, 0.12);
    m.add(new CylinderGeometry(1.9, 1.3, 1.5, 4), GRAFITE, { y: 1.25, ry: Math.PI / 4 });
    m.add(new CylinderGeometry(1.95, 1.95, 0.12, 4), METAL, { y: 2.0, ry: Math.PI / 4 });
    m.caixa(2.6, 0.08, 0.9, METAL, { y: 0.35, z: 1.55, rx: 0.5 });
    for (const x of [-1.0, 1.0])
      m.tubo(0.08, 0.3, GRAFITE, { x, y: 0.45, z: 1.25, ry: Math.PI / 2 });
    m.caixa(0.1, 1.2, 0.1, METAL, { x: 1.1, y: 0.5, z: -1.0 });
    return olho(m, 1.82, 0.35).pronta();
  },
  // Módulos cilíndricos com brilho ciano.
  mobile_battery: () => {
    const m = casco(new Montagem(), 3.0, 2.4, 0.5, 0.15);
    for (const [x, z] of [
      [-0.7, -0.55],
      [-0.7, 0.55],
      [0.5, 0],
    ] as const) {
      m.cilindro(0.5, 1.4, GRAFITE, { x, z, y: 0.5 }, 14);
      m.cilindro(0.35, 0.15, METAL, { x, z, y: 1.9 }, 12);
      m.add(
        new TorusGeometry(0.5, 0.07, 6, 18),
        { brilho: CIANO },
        { x, z, y: 1.2, rx: Math.PI / 2 },
      );
      m.add(
        new TorusGeometry(0.5, 0.04, 6, 18),
        { brilho: CIANO },
        { x, z, y: 0.8, rx: Math.PI / 2 },
      );
    }
    // Emissor de transferência no topo do módulo da frente.
    m.add(new ConeGeometry(0.25, 0.3, 10), METAL, { x: 0.5, y: 2.2, rx: Math.PI });
    m.esfera(0.1, { brilho: CIANO }, { x: 0.5, y: 2.12 });
    return olho(m, 1.52, 0.3).pronta();
  },
  // Módulo de pouso de ~16 m com pernas, rampa frontal e antena de dobra.
  ship: () => {
    const m = new Montagem();
    m.cilindro(6.2, 4.5, PAINEL, { y: 2.2 }, 8, 5.2);
    m.cilindro(5.2, 1.6, GRAFITE, { y: 6.7 }, 8, 3.6);
    m.cilindro(3.6, 0.5, METAL, { y: 8.3 }, 8, 3.2);
    // Faixa de janelas e o anel da nação.
    m.add(new CylinderGeometry(5.62, 5.8, 0.5, 8, 1, true), VIDRO, { y: 5.6 });
    m.add(new TorusGeometry(6.0, 0.18, 6, 32), 'nacao', { y: 4.5, rx: Math.PI / 2 });
    // Tanques laterais.
    for (const a of [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2]) {
      m.cilindro(0.8, 2.6, GRAFITE, { x: Math.cos(a) * 5.6, z: Math.sin(a) * 5.6, y: 2.6 }, 10);
    }
    // Pernas com escoras e sapatas.
    for (let k = 0; k < 4; k++) {
      const a = Math.PI / 4 + (k * Math.PI) / 2;
      const [x, z] = [Math.cos(a) * 6.3, Math.sin(a) * 6.3];
      m.caixa(0.5, 3.2, 0.5, GRAFITE, { x, z, rz: 0, ry: -a });
      m.caixa(0.25, 2.4, 0.25, METAL, {
        x: Math.cos(a) * 5.5,
        z: Math.sin(a) * 5.5,
        y: 1.0,
        ry: -a,
        rz: 0.5,
      });
      m.cilindro(0.9, 0.2, METAL, { x: Math.cos(a) * 6.6, z: Math.sin(a) * 6.6 });
    }
    // Bocais de pouso por baixo, ainda mornos.
    for (const [x, z] of [
      [2.2, 0],
      [-2.2, 0],
      [0, 2.2],
      [0, -2.2],
    ] as const) {
      m.add(new ConeGeometry(0.9, 1.2, 12, 1, true), METAL, { x, z, y: 1.6 });
      m.cilindro(0.55, 0.05, { brilho: BRASA }, { x, z, y: 1.0 }, 12);
    }
    // A rampa frontal é uma peça à parte (geometriaDaRampa), para abrir no pouso (FLX-09).
    m.caixa(0.6, 2.2, 3.4, GRAFITE, { x: 5.3, y: 1.2 });
    // Antena de dobra.
    m.cilindro(0.18, 5.5, METAL, { x: -1.5, y: 8.3 });
    m.add(new ConeGeometry(1.6, 0.8, 16, 1, true), METAL, { x: -1.5, y: 13.6, rx: Math.PI });
    m.esfera(0.25, 'nacao', { x: -1.5, y: 13.8 });
    antena(m, 1.8, 8.8, 1.2, 1.6);
    return olho(m, 5.6, 5.4, 0, 0.5).pronta();
  },
  // Coluna esguia com lente giratória.
  laser_tower: () => {
    const m = new Montagem();
    m.cilindro(1.3, 0.6, GRAFITE, {}, 8);
    m.cilindro(1.0, 0.25, METAL, { y: 0.6 }, 8);
    m.cilindro(0.45, 6.0, PAINEL, { y: 0.6 }, 12, 0.3);
    for (const a of [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2]) {
      m.caixa(0.08, 2.0, 0.5, GRAFITE, {
        x: Math.cos(a) * 0.4,
        z: Math.sin(a) * 0.4,
        y: 0.8,
        ry: -a,
      });
    }
    // A cabeça com a lente gira no topo (TORRES, ART-12).
    m.add(new TorusGeometry(0.5, 0.08, 6, 14), 'nacao', { y: 3.2, rx: Math.PI / 2 });
    return m.pronta();
  },
  // Conjunto de silos hexagonais com doca.
  storage: () => {
    const m = new Montagem();
    m.caixa(8, 0.4, 8, GRAFITE);
    for (const [x, z, h] of [
      [-1.8, -1.8, 5.5],
      [-1.8, 1.8, 4.5],
      [1.6, -1.8, 5.0],
    ] as const) {
      m.cilindro(1.6, h, PAINEL, { x, z, y: 0.4 }, 6);
      m.cilindro(1.2, 0.5, METAL, { x, z, y: 0.4 + h }, 6, 0.6);
      m.add(new CylinderGeometry(1.65, 1.65, 0.3, 6), 'nacao', { x, z, y: 0.4 + h * 0.75 });
    }
    // Tubulação entre os silos e a doca.
    m.tubo(0.18, 3.4, METAL, { x: -0.1, y: 1.2, z: -1.8 });
    m.tubo(0.18, 3.6, METAL, { x: -1.8, y: 1.0, ry: Math.PI / 2 });
    m.caixa(3.2, 1.2, 3.0, METAL, { x: 2.1, z: 2.2, y: 0.4 });
    m.caixa(3.0, 0.1, 0.8, GRAFITE, { x: 2.1, z: 3.5, y: 0.4 });
    antena(m, 3.2, 1.6, 1.2, 1.2);
    return olho(m, 3.75, 1.3, 2.2, 0.25).pronta();
  },
  // Painéis que acompanham o sol.
  solar_plant: () => {
    const m = new Montagem();
    m.caixa(6, 0.3, 6, GRAFITE);
    m.cilindro(0.3, 2.2, METAL, { y: 0.3 });
    m.caixa(1.0, 0.4, 1.0, PAINEL, { y: 0.3 });
    m.caixa(5.4, 0.12, 4.2, VIDRO, { y: 2.3, rz: 0.55 });
    // Moldura e divisões das células.
    for (const x of [-2.7, -1.35, 0, 1.35, 2.7]) {
      m.caixa(0.05, 0.16, 4.2, METAL, {
        x: x * Math.cos(0.55),
        y: 2.3 + x * Math.sin(0.55),
        rz: 0.55,
      });
    }
    m.caixa(5.4, 0.05, 0.15, 'nacao', { y: 2.5, z: 2.0, rz: 0.55 });
    return olho(m, 2.4, 0.5, -2.6, 0.2).pronta();
  },
  // Reator compacto com aletas de dissipação incandescentes.
  nuclear_plant: () => {
    const m = new Montagem();
    m.caixa(8, 0.4, 8, GRAFITE);
    m.cilindro(2.4, 4.5, PAINEL, { y: 0.4 }, 16, 1.9);
    m.add(new SphereGeometry(1.9, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), METAL, { y: 4.9 });
    m.cilindro(0.4, 0.8, GRAFITE, { y: 6.6 }, 10);
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4;
      m.caixa(
        1.4,
        3.2,
        0.14,
        { brilho: BRASA },
        { x: Math.cos(a) * 2.9, z: Math.sin(a) * 2.9, y: 0.6, ry: -a },
      );
    }
    // Tubos de refrigeração até os cantos.
    for (const a of [Math.PI / 8, (5 * Math.PI) / 8, (9 * Math.PI) / 8, (13 * Math.PI) / 8]) {
      m.tubo(0.2, 1.6, METAL, { x: Math.cos(a) * 3.3, z: Math.sin(a) * 3.3, y: 0.7, ry: -a });
    }
    m.add(new TorusGeometry(2.3, 0.12, 6, 24), 'nacao', { y: 4.0, rx: Math.PI / 2 });
    return olho(m, 2.3, 2.2, 0, 0.3).pronta();
  },
  // Plataforma com trilho de lançamento.
  // T-128: plataforma com torre de lançamento vertical ao lado do berço central, de onde o
  // satélite sobe na vertical (o render o faz subir do centro da base).
  satellite_uplink: () => {
    const m = new Montagem();
    m.caixa(10, 0.6, 10, GRAFITE);
    m.caixa(9.5, 0.2, 9.5, PAINEL, { y: 0.6 });
    // Berço de lançamento no centro: anel, fosso de chamas e quatro garras.
    m.cilindro(2.0, 0.3, METAL, { y: 0.8 }, 24);
    m.cilindro(1.3, 0.32, GRAFITE, { y: 0.8 }, 24);
    m.cilindro(1.6, 0.05, 'nacao', { y: 1.12 }, 24);
    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 2 + Math.PI / 4;
      m.caixa(0.25, 1.6, 0.25, METAL, { x: Math.cos(a) * 1.5, y: 1.1, z: Math.sin(a) * 1.5 });
    }
    // Torre de serviço vertical (treliça de 4 pernas) com braço até o berço.
    const tx = -3.2;
    const tz = -3.2;
    const h = 10;
    for (const dx of [-0.7, 0.7])
      for (const dz of [-0.7, 0.7])
        m.cilindro(0.12, h, METAL, { x: tx + dx, y: 0.8, z: tz + dz }, 6);
    for (let y = 1.8; y < h; y += 1.6) {
      m.caixa(1.5, 0.1, 0.1, PAINEL, { x: tx, y, z: tz - 0.7 });
      m.caixa(1.5, 0.1, 0.1, PAINEL, { x: tx, y, z: tz + 0.7 });
      m.caixa(0.1, 0.1, 1.5, PAINEL, { x: tx - 0.7, y, z: tz });
      m.caixa(0.1, 0.1, 1.5, PAINEL, { x: tx + 0.7, y, z: tz });
    }
    m.caixa(1.9, 0.25, 1.9, GRAFITE, { x: tx, y: h + 0.8, z: tz });
    m.cilindro(0.2, 0.3, 'nacao', { x: tx, y: h + 1.05, z: tz }, 10);
    antena(m, tx + 0.6, h + 1.05, tz + 0.6, 1.4);
    // Braço de serviço que abraça a carga no berço.
    m.caixa(0.35, 0.35, 2.8, METAL, { x: tx + 1.45, y: 6.2, z: tz + 1.45, ry: Math.PI / 4 });
    m.caixa(0.1, 0.1, 2.6, 'nacao', { x: tx + 1.45, y: 6.6, z: tz + 1.45, ry: Math.PI / 4 });
    // Casa de controle.
    m.caixa(2.0, 1.4, 2.0, PAINEL, { x: 3.4, y: 0.8, z: 3.2 });
    m.caixa(1.6, 0.4, 0.05, VIDRO, { x: 3.4, y: 1.7, z: 2.2 });
    m.caixa(8.5, 0.06, 0.2, 'nacao', { y: 0.82, z: -4.5 });
    return olho(m, 4.9, 1.0, 3.8, 0.3).pronta();
  },
  // D-53/D-56: segmento de muro espacial de 6 m (comprimento em x), com pilares nas pontas
  // (as pontas coincidem com as do segmento vizinho encaixado).
  wall: () => {
    const m = new Montagem();
    m.caixa(5.4, 0.35, 1.5, GRAFITE);
    m.caixa(5.2, 2.4, 0.9, PAINEL, { y: 0.35 });
    m.caixa(5.0, 0.5, 1.1, GRAFITE, { y: 2.75 });
    for (const x of [-2.75, 2.75]) {
      m.cilindro(0.55, 3.5, METAL, { x }, 10);
      m.cilindro(0.3, 0.12, 'nacao', { x, y: 3.5 }, 10);
    }
    m.caixa(4.6, 0.08, 0.95, 'nacao', { y: 1.4 });
    for (const x of [-1.5, -0.5, 0.5, 1.5]) m.caixa(0.08, 1.6, 0.95, GRAFITE, { x, y: 0.6 });
    return olho(m, 0, 3.1, 0.45, 0.12).pronta();
  },
  // D-54: portão de 6 m: pilares e verga; as folhas são peças à parte (geometriaDaFolha).
  gate: () => {
    const m = new Montagem();
    m.caixa(5.9, 0.3, 1.6, GRAFITE);
    for (const x of [-2.75, 2.75]) {
      m.caixa(0.6, 3.8, 1.4, PAINEL, { x });
      m.caixa(0.7, 0.2, 1.5, METAL, { x, y: 3.8 });
      m.caixa(0.08, 3.0, 1.2, 'nacao', { x: x > 0 ? x - 0.34 : x + 0.34, y: 0.4 });
    }
    m.caixa(5.3, 0.45, 1.0, GRAFITE, { y: 3.5 });
    return olho(m, 0, 3.75, 0.5, 0.14).pronta();
  },
  // UNI-10: plataforma com tubo lançador inclinado sobre um berço giratório e paiol ao lado.
  missile_silo: () => {
    const m = new Montagem();
    m.caixa(8, 0.5, 8, GRAFITE);
    m.caixa(7.6, 0.2, 7.6, PAINEL, { y: 0.5 });
    m.cilindro(2.2, 0.6, METAL, { y: 0.7 }, 16);
    m.cilindro(1.6, 0.9, GRAFITE, { y: 1.3 }, 16);
    for (const z of [-1.1, 1.1]) m.caixa(1.6, 2.2, 0.35, PAINEL, { y: 2.2, z });
    // Tubo lançador inclinado para a frente (+x), com anel da nação na boca.
    m.add(new CylinderGeometry(0.75, 0.85, 6.5, 14), PAINEL, { x: 1.2, y: 4.3, rz: -0.9 });
    m.add(new CylinderGeometry(0.9, 0.9, 0.3, 14), 'nacao', { x: 3.7, y: 6.1, rz: -0.9 });
    m.add(new CylinderGeometry(0.6, 0.6, 0.05, 14), VIDRO, { x: 3.85, y: 6.2, rz: -0.9 });
    // Paiol de mísseis.
    m.caixa(2.4, 1.2, 2.2, PAINEL, { x: -2.6, y: 0.7, z: 2.4 });
    for (let k = 0; k < 3; k++)
      m.caixa(0.5, 0.12, 1.9, 'nacao', { x: -3.3 + k * 0.7, y: 1.9, z: 2.4 });
    m.caixa(7, 0.06, 0.2, 'nacao', { y: 0.72, z: -3.6 });
    return olho(m, -2.6, 2.0, 1.2, 0.2).pronta();
  },
  // UNI-12: torre curta com dois casulos de mísseis apontados para cima e radar.
  aa_battery: () => {
    const m = new Montagem();
    m.cilindro(1.9, 0.5, GRAFITE, {}, 10);
    m.cilindro(1.2, 1.4, PAINEL, { y: 0.5 }, 10);
    m.cilindro(1.0, 0.3, METAL, { y: 1.9 }, 12);
    // Os casulos de mísseis giram sobre o anel (TORRES, ART-12).
    m.cilindro(0.08, 1.2, METAL, { x: -0.7, y: 2.2 }, 6);
    m.add(new ConeGeometry(0.5, 0.25, 12, 1, true), METAL, { x: -0.7, y: 3.5, rx: Math.PI });
    return olho(m, -0.7, 3.4, 0, 0.12).pronta();
  },
  // UNI-13: coluna de bobinas com anéis na cor da nação.
  mag_tower: () => {
    const m = new Montagem();
    m.cilindro(2.2, 0.5, GRAFITE, {}, 12);
    m.cilindro(0.7, 6.5, PAINEL, { y: 0.5 }, 12, 0.5);
    for (let k = 0; k < 4; k++) {
      m.cilindro(1.3 - k * 0.15, 0.35, METAL, { y: 1.3 + k * 1.3 }, 16);
      m.cilindro(1.35 - k * 0.15, 0.08, 'nacao', { y: 1.72 + k * 1.3 }, 16);
    }
    m.esfera(0.7, VIDRO, { y: 7.3 });
    m.cilindro(0.9, 0.1, 'nacao', { y: 7.2 }, 16);
    return olho(m, 0, 7.3, 0, 0.3).pronta();
  },
  // UNI-14 (D-83): Antena — mastro treliçado alto, prato de sensor e luz de topo na cor da nação.
  antenna: () => {
    const m = new Montagem();
    m.caixa(2.8, 0.35, 2.8, GRAFITE);
    m.caixa(2.2, 0.15, 2.2, METAL, { y: 0.35 });
    const altura = 9;
    for (const [sx, sz] of [
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ] as const) {
      // Pernas que se inclinam para dentro até o topo.
      m.caixa(0.12, altura, 0.12, METAL, {
        x: sx * 0.55,
        z: sz * 0.55,
        y: 0.5,
        rx: -sz * 0.06,
        rz: sx * 0.06,
      });
    }
    // Travessas da treliça.
    for (let k = 1; k <= 4; k++) {
      const y = 0.5 + k * 1.9;
      const lado = 1.1 - k * 0.18;
      for (const r of [0, Math.PI / 2]) m.caixa(lado, 0.06, 0.06, GRAFITE, { y, ry: r });
    }
    // Prato do sensor, inclinado para o céu, e a faixa da nação.
    m.add(new ConeGeometry(1.1, 0.45, 20, 1, true), PAINEL, { y: 7.2, x: 0.5, rz: -2.4 });
    m.cilindro(0.18, 0.5, METAL, { y: 6.9, x: 0.35, rz: -0.8 }, 8);
    m.cilindro(0.5, 0.12, 'nacao', { y: 4.2 }, 12);
    m.cilindro(0.06, 1.6, METAL, { y: altura + 0.5 }, 6);
    return m.esfera(0.22, 'nacao', { y: altura + 2.1 }).pronta();
  },
  // UNI-15 (D-85): Central de Distribuição — poste baixo com a cabeça de junção, isoladores em
  // volta (de onde saem os cabos) e o anel da nação.
  // UNI-15 (D-86): caixa de junção baixa no chão, com os bornes dos cabos nos quatro lados.
  power_hub: () => {
    const m = new Montagem();
    m.caixa(2.7, 0.12, 2.7, GRAFITE);
    m.caixa(2.3, 0.55, 2.3, METAL, { y: 0.12 });
    // Tampa com aletas de ventilação e a faixa da nação.
    m.caixa(2.1, 0.1, 2.1, PAINEL, { y: 0.67 });
    for (let k = -2; k <= 2; k++) m.caixa(0.08, 0.06, 1.5, GRAFITE, { x: k * 0.3, y: 0.77 });
    m.caixa(2.34, 0.08, 2.34, 'nacao', { y: 0.45 });
    // Bornes: um por lado, rente ao chão, de onde os cabos saem.
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2;
      m.caixa(0.5, 0.3, 0.3, GRAFITE, {
        x: Math.cos(a) * 1.25,
        z: Math.sin(a) * 1.25,
        y: 0.12,
        ry: -a,
      });
    }
    return m.pronta();
  },
  // UNI-16 (D-90): Porto flutuante: plataforma sobre o líquido, cais com defensas, guindaste e
  // o berço de impressão das embarcações.
  port: () => {
    const m = new Montagem();
    m.caixa(9.6, 0.5, 9.6, GRAFITE, { y: -0.2 });
    m.caixa(9.0, 0.25, 9.0, METAL, { y: 0.3 });
    // Berço (doca aberta) numa das laterais.
    m.caixa(5.2, 0.12, 3.2, 'nacao', { x: 1.2, y: 0.56, z: -2.4 });
    for (const z of [-4.0, -0.8]) m.caixa(5.6, 0.7, 0.4, PAINEL, { x: 1.2, y: 0.55, z });
    // Defensas ao longo da borda.
    for (let k = -3; k <= 3; k++) m.tubo(0.22, 0.6, GRAFITE, { x: k * 1.3, y: 0.45, z: 4.75 }, 8);
    // Guindaste: torre, braço e cabo.
    m.caixa(0.9, 4.2, 0.9, METAL, { x: -3.2, y: 0.55, z: 2.6 });
    m.caixa(5.2, 0.35, 0.4, PAINEL, { x: -1.2, y: 4.6, z: 2.6 });
    m.cilindro(0.04, 2.4, METAL, { x: 1.1, y: 2.25, z: 2.6 }, 6);
    // Casa de controle com a faixa da nação.
    m.caixa(2.4, 1.6, 2.2, PAINEL, { x: -3.0, y: 0.55, z: -2.6 });
    m.caixa(2.44, 0.18, 2.24, 'nacao', { x: -3.0, y: 1.8, z: -2.6 });
    m.caixa(2.0, 0.4, 0.05, VIDRO, { x: -3.0, y: 1.35, z: -1.48 });
    return m.pronta();
  },
  // UNI-17: barcaça larga de fundo chato, com rampa de desembarque na proa e porão aberto.
  boat_transport: () => {
    const m = new Montagem();
    m.caixa(5.2, 0.8, 3.0, GRAFITE, { y: -0.4 });
    m.caixa(4.8, 0.35, 2.7, PAINEL, { y: 0.4 });
    // Proa inclinada (rampa).
    m.caixa(0.9, 0.12, 2.6, METAL, { x: 2.85, y: 0.35, rz: 0.55 });
    // Bordas do porão.
    for (const z of [-1, 1]) m.caixa(4.0, 0.45, 0.14, METAL, { x: -0.2, y: 0.75, z: z * 1.28 });
    // Casa de comando na popa.
    m.caixa(1.1, 0.9, 1.6, PAINEL, { x: -2.1, y: 0.75 });
    m.caixa(1.14, 0.12, 1.64, 'nacao', { x: -2.1, y: 1.65 });
    m.caixa(0.05, 0.3, 1.2, VIDRO, { x: -1.53, y: 1.3 });
    antena(m, -2.3, 1.77, 0.5, 0.6);
    return m.pronta();
  },
  // UNI-18: casco fino e rápido; a torre do laser é peça à parte (TORRES, ART-12).
  boat_artillery: () => {
    const m = new Montagem();
    m.caixa(4.0, 0.7, 1.8, GRAFITE, { y: -0.35 });
    m.add(new ConeGeometry(0.9, 1.2, 4), GRAFITE, {
      x: 2.55,
      y: 0.0,
      rz: -Math.PI / 2,
      rx: Math.PI / 4,
    });
    m.caixa(3.4, 0.3, 1.6, PAINEL, { y: 0.35 });
    m.caixa(1.0, 0.55, 1.1, PAINEL, { x: -1.1, y: 0.65 });
    m.caixa(1.04, 0.1, 1.14, 'nacao', { x: -1.1, y: 1.2 });
    m.cilindro(0.45, 0.2, METAL, { x: 0.6, y: 0.65 }, 12);
    antena(m, -1.4, 1.25, 0.3, 0.5);
    return olho(m, 1.9, 0.55).pronta();
  },
  // UNI-19: casco leve com mastro de radar e antena parabólica.
  boat_antenna: () => {
    const m = new Montagem();
    m.caixa(3.4, 0.6, 1.5, GRAFITE, { y: -0.3 });
    m.caixa(2.8, 0.28, 1.3, PAINEL, { y: 0.3 });
    m.caixa(0.9, 0.5, 1.0, PAINEL, { x: -0.8, y: 0.58 });
    m.cilindro(0.08, 2.4, METAL, { x: 0.2, y: 0.58 }, 8);
    m.caixa(1.4, 0.08, 0.2, 'nacao', { x: 0.2, y: 2.6 });
    m.add(new SphereGeometry(0.55, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), METAL, {
      x: 0.9,
      y: 1.6,
      rz: -Math.PI / 2.4,
    });
    m.esfera(0.12, 'nacao', { x: 0.2, y: 3.05 });
    return m.pronta();
  },
  // UNI-11: mísseis (fotos do cartão e o voo), deitados em +x.
  missile_short: () => {
    const m = new Montagem();
    m.add(new CylinderGeometry(0.18, 0.18, 1.6, 10), PAINEL, { rz: -Math.PI / 2 });
    m.add(new ConeGeometry(0.18, 0.5, 10), 'nacao', { x: 1.05, rz: -Math.PI / 2 });
    for (const a of [0, Math.PI / 2]) m.caixa(0.35, 0.03, 0.7, GRAFITE, { x: -0.65, rx: a });
    return m.pronta();
  },
  missile_long: () => {
    const m = new Montagem();
    m.add(new CylinderGeometry(0.28, 0.28, 3.0, 12), PAINEL, { rz: -Math.PI / 2 });
    m.add(new CylinderGeometry(0.3, 0.3, 0.2, 12), 'nacao', { x: 0.6, rz: -Math.PI / 2 });
    m.add(new ConeGeometry(0.28, 0.9, 12), METAL, { x: 1.95, rz: -Math.PI / 2 });
    for (const a of [0, Math.PI / 2]) m.caixa(0.6, 0.04, 1.1, GRAFITE, { x: -1.2, rx: a });
    return m.pronta();
  },
  // D-51: satélite em órbita, com painéis solares e antena.
  satellite: () => {
    const m = new Montagem();
    m.caixa(1.4, 1.0, 1.0, PAINEL);
    m.caixa(1.0, 0.12, 0.7, 'nacao', { y: 1.0 });
    for (const z of [-1, 1]) {
      m.caixa(0.1, 0.1, 0.9, METAL, { y: 0.45, z: z * 0.95 });
      m.caixa(1.3, 0.05, 2.2, VIDRO, { y: 0.45, z: z * 2.5 });
    }
    m.add(new ConeGeometry(0.45, 0.35, 12, 1, true), METAL, { x: 0.9, y: 0.5, rz: -Math.PI / 2 });
    return olho(m, 1.1, 0.5, 0, 0.12).pronta();
  },
  // Disco baixo com sensor na cor da nação.
  mine: () => {
    const m = new Montagem();
    m.cilindro(0.5, 0.2, GRAFITE, {}, 12, 0.4);
    for (let k = 0; k < 6; k++) {
      const a = (k * Math.PI) / 3;
      m.add(new ConeGeometry(0.05, 0.15, 5), METAL, {
        x: Math.cos(a) * 0.3,
        z: Math.sin(a) * 0.3,
        y: 0.25,
      });
    }
    return olho(m, 0, 0.22, 0, 0.12).pronta();
  },
};

/**
 * FLX-09: rampa frontal da Nave, com a dobradiça na origem e o comprimento em +x. Aberta, ela
 * desce até o chão (ANGULO_RAMPA_ABERTA); fechada, fica de pé contra o casco.
 */
export const DOBRADICA_DA_RAMPA: [number, number, number] = [5.28, 1.9, 0];
export const ANGULO_RAMPA_ABERTA = -0.42;
export const ANGULO_RAMPA_FECHADA = Math.PI / 2 - 0.08;

let rampa: BufferGeometry | null = null;
export function geometriaDaRampa(): BufferGeometry {
  if (!rampa) {
    const m = new Montagem();
    m.caixa(4.2, 0.25, 3.2, METAL, { x: 2.1, y: -0.25 });
    m.caixa(0.15, 0.4, 3.2, GRAFITE, { x: 4.15, y: -0.4 });
    for (const z of [-1.2, 0, 1.2]) m.caixa(3.6, 0.04, 0.12, 'nacao', { x: 2.0, y: 0.0, z });
    rampa = m.pronta();
  }
  return rampa;
}

/** D-54: folha do portão (metade do vão, 2,7 m); aberta, desce para dentro do chão. */
let folha: BufferGeometry | null = null;
export function geometriaDaFolha(): BufferGeometry {
  if (!folha) {
    const m = new Montagem();
    m.caixa(2.45, 3.1, 0.35, METAL, { x: 1.225 });
    for (const y of [0.8, 1.6, 2.4]) m.caixa(2.3, 0.06, 0.4, 'nacao', { x: 1.225, y });
    folha = m.pronta();
  }
  return folha;
}

export const TIPOS_DE_MODELO = Object.keys(CONSTRUTORES) as TipoDeModelo[];

/**
 * ART-12 (D-68): torres que giram para o alvo, montadas em volta do pivô (+x = frente, +y =
 * vertical). O corpo (CONSTRUTORES) não as inclui; o modelo inteiro soma as duas.
 */
const TORRES: Partial<
  Record<TipoDeModelo, { pivo: [number, number, number]; montar: () => Montagem }>
> = {
  hover_ex1: {
    pivo: [0.1, 0.45, 0],
    montar: () => {
      const m = new Montagem();
      m.caixa(0.9, 0.3, 0.9, GRAFITE);
      m.cilindro(0.3, 0.12, METAL, { y: 0.3 }, 10);
      for (const z of [-0.2, 0.2]) {
        m.tubo(0.08, 1.2, METAL, { x: 0.85, y: 0.17, z });
        m.tubo(0.12, 0.35, GRAFITE, { x: 0.5, y: 0.17, z });
        m.esfera(0.05, { brilho: BRASA }, { x: 1.46, y: 0.17, z });
      }
      return m;
    },
  },
  hover_opq: {
    pivo: [-0.1, 0.75, 0],
    montar: () => {
      const m = new Montagem();
      m.caixa(1.9, 0.18, 1.6, METAL);
      for (const y of [0.2, 0.6]) {
        for (const z of [-0.55, -0.18, 0.18, 0.55]) {
          m.tubo(0.17, 1.6, GRAFITE, { y, z });
          m.tubo(0.12, 0.05, { brilho: BRASA }, { x: 0.81, y, z });
        }
      }
      m.caixa(0.3, 0.5, 1.4, PAINEL, { x: -0.85, y: 0.15 });
      return m;
    },
  },
  // UNI-18: torre do laser da Embarcação de Artilharia, sobre o anel do convés.
  boat_artillery: {
    pivo: [0.6, 0.85, 0],
    montar: () => {
      const m = new Montagem();
      m.caixa(0.9, 0.35, 0.8, GRAFITE);
      m.tubo(0.1, 1.3, METAL, { x: 0.8, y: 0.2 });
      m.tubo(0.15, 0.35, GRAFITE, { x: 0.4, y: 0.2 });
      m.esfera(0.06, { brilho: BRASA }, { x: 1.46, y: 0.2 });
      return m;
    },
  },
  laser_tower: {
    pivo: [0, 6.4, 0],
    montar: () => {
      const m = new Montagem();
      m.caixa(1.3, 0.6, 0.8, GRAFITE);
      m.esfera(0.32, VIDRO, { x: 0.62, y: 0.3 });
      for (const z of [-0.45, 0.45]) m.caixa(0.6, 0.05, 0.15, METAL, { x: -0.3, y: 0.35, z });
      return olho(m, 0.7, 0.3, 0, 0.3);
    },
  },
  aa_battery: {
    pivo: [0, 2.2, 0],
    montar: () => {
      const m = new Montagem();
      m.cilindro(0.6, 0.2, METAL, {}, 10);
      for (const z of [-0.8, 0.8]) {
        m.caixa(1.1, 1.5, 0.7, PAINEL, { y: 0.1, z, rz: 0.5 });
        for (const [a, b] of [
          [-0.2, -0.15],
          [0.2, 0.15],
        ])
          m.add(new CylinderGeometry(0.14, 0.14, 0.1, 8), 'nacao', {
            x: 0.55 + a!,
            y: 1.1,
            z: z + b!,
            rz: 0.5,
          });
      }
      return m;
    },
  },
};

export const temTorre = (tipo: TipoDeModelo): boolean => TORRES[tipo] !== undefined;

/** Pivô da torre no corpo (m, espaço do modelo). */
export function pivoDaTorre(tipo: TipoDeModelo): [number, number, number] {
  return TORRES[tipo]?.pivo ?? [0, 0, 0];
}

const cacheTorre = new Map<TipoDeModelo, BufferGeometry>();
/** ART-12: a torre com o pivô na origem. */
export function geometriaDaTorre(tipo: TipoDeModelo): BufferGeometry {
  let geo = cacheTorre.get(tipo);
  if (!geo) {
    geo = TORRES[tipo]!.montar().pronta();
    cacheTorre.set(tipo, geo);
  }
  return geo;
}

const cacheCorpo = new Map<TipoDeModelo, BufferGeometry>();
/** O corpo sem a torre (igual ao modelo inteiro nos tipos sem torre). */
export function geometriaDoCorpo(tipo: TipoDeModelo): BufferGeometry {
  let geo = cacheCorpo.get(tipo);
  if (!geo) {
    geo = CONSTRUTORES[tipo]();
    cacheCorpo.set(tipo, geo);
  }
  return geo;
}

const cache = new Map<TipoDeModelo, BufferGeometry>();

/** Modelo inteiro (retrato, holograma, fantasmas): corpo mais torre no pivô. */
export function geometriaDoModelo(tipo: TipoDeModelo): BufferGeometry {
  let geo = cache.get(tipo);
  if (!geo) {
    const corpo = geometriaDoCorpo(tipo);
    if (temTorre(tipo)) {
      const torre = geometriaDaTorre(tipo)
        .clone()
        .translate(...pivoDaTorre(tipo));
      geo = mergeGeometries([corpo, torre], false)!;
      geo.computeBoundingSphere();
    } else {
      geo = corpo;
    }
    cache.set(tipo, geo);
  }
  return geo;
}
