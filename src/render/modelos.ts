/**
 * Modelos placeholder procedurais (TEC-18) com as silhuetas das fichas (§8.5, ART-03).
 * Cada tipo vira uma única geometria mesclada, para ser desenhada com instancing (TEC-16).
 *
 * Convenções: frente em +x (heading 0 da simulação), origem no ponto de apoio (base do casco
 * para hovers, que já flutuam na altura da simulação; chão para estruturas e drones pousados).
 * Atributos: `color` (cor de vértice) e `aEmis` (0 = sem brilho, 1 = cor da nação, tarja e
 * olho de ART-02; 2 = brilho fixo na própria cor do vértice).
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
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { EstruturasId, MoveisId } from '../sim/data';

export type TipoDeModelo = MoveisId | EstruturasId | 'mine';

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

  add(geo: BufferGeometry, cor: Cor, pose: Pose = {}): this {
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
    geo.deleteAttribute('uv');
    this.partes.push(geo);
    return this;
  }

  /** Caixa com a base em y (e não o centro). */
  caixa(sx: number, sy: number, sz: number, cor: Cor, pose: Pose = {}): this {
    return this.add(new BoxGeometry(sx, sy, sz), cor, { ...pose, y: (pose.y ?? 0) + sy / 2 });
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
    const geo = mergeGeometries(this.partes, false);
    if (!geo) throw new Error('modelos: falha ao mesclar as partes');
    geo.computeBoundingSphere();
    return geo;
  }
}

/** Casco de hover: saia escura, casco e a tarja da nação no dorso (ART-02). */
function casco(m: Montagem, c: number, l: number, h: number, tarja = 0.3): Montagem {
  m.caixa(c * 0.92, 0.18, l * 0.92, GRAFITE, { y: -0.12 });
  m.caixa(c, h, l, PAINEL);
  m.caixa(c * 0.7, 0.04, l * tarja, 'nacao', { y: h, x: -c * 0.05 });
  return m;
}

function olho(m: Montagem, x: number, y: number, z = 0, r = 0.16): Montagem {
  return m.esfera(r, 'nacao', { x, y, z });
}

const CONSTRUTORES: Record<TipoDeModelo, () => BufferGeometry> = {
  // Hover compacto com braço de mineração e caçamba.
  hover_explorer: () => {
    const m = casco(new Montagem(), 1.5, 1.3, 0.55);
    m.caixa(0.6, 0.35, 0.8, GRAFITE, { x: -0.3, y: 0.55 });
    m.caixa(0.7, 0.14, 0.14, METAL, { x: 0.8, y: 0.55, rz: -0.6 });
    m.caixa(0.4, 0.35, 0.8, METAL, { x: 1.1, y: 0.05 });
    return olho(m, 0.76, 0.35).pronta();
  },
  // Pórtico alto sobre base hover; a linha de impressão brilha na cor da nação.
  printer: () => {
    const m = casco(new Montagem(), 3.2, 2.6, 0.6, 0.15);
    for (const z of [-1.1, 1.1]) m.caixa(0.35, 2.4, 0.35, GRAFITE, { x: 0.2, y: 0.6, z });
    m.caixa(0.5, 0.35, 2.6, PAINEL, { x: 0.2, y: 3.0 });
    m.caixa(0.08, 0.08, 2.3, 'nacao', { x: 0.48, y: 3.1 });
    m.caixa(0.45, 0.6, 0.45, METAL, { x: 0.2, y: 2.4, z: 0.3 });
    return olho(m, 1.62, 0.4).pronta();
  },
  // Baixo e ágil, com canhão laser duplo curto.
  hover_ex1: () => {
    const m = casco(new Montagem(), 2.4, 1.7, 0.45);
    m.caixa(0.9, 0.3, 0.9, GRAFITE, { x: 0.1, y: 0.45 });
    for (const z of [-0.2, 0.2]) m.tubo(0.08, 1.2, METAL, { x: 0.95, y: 0.62, z });
    return olho(m, 1.22, 0.3).pronta();
  },
  // Largo e pesado, com lançador dorsal de tubos.
  hover_opq: () => {
    const m = casco(new Montagem(), 2.7, 2.7, 0.75, 0.2);
    for (const y of [0.95, 1.35]) {
      for (const z of [-0.55, -0.18, 0.18, 0.55]) m.tubo(0.17, 1.6, GRAFITE, { x: -0.1, y, z });
    }
    return olho(m, 1.37, 0.5).pronta();
  },
  // Casco achatado com tambor giratório de minas na traseira.
  hover_minelayer: () => {
    const m = casco(new Montagem(), 2.4, 1.9, 0.35);
    m.add(new CylinderGeometry(0.55, 0.55, 1.5, 12), GRAFITE, {
      x: -0.85,
      y: 0.8,
      rx: Math.PI / 2,
    });
    m.add(new TorusGeometry(0.55, 0.06, 6, 16), 'nacao', { x: -0.85, y: 0.8 });
    return olho(m, 1.22, 0.22).pronta();
  },
  // Chassi fino com mastro de sensores.
  hover_scout: () => {
    const m = casco(new Montagem(), 2.0, 0.9, 0.35, 0.5);
    m.cilindro(0.07, 2.6, METAL, { x: -0.3, y: 0.35 });
    m.add(new ConeGeometry(0.4, 0.3, 10), PAINEL, { x: -0.3, y: 3.0, rx: Math.PI });
    return olho(m, -0.3, 3.2, 0, 0.22).pronta();
  },
  // Asa delta a jato com compartimento de bombas ventral.
  drone_bomber: () => {
    const m = new Montagem();
    m.add(new CylinderGeometry(1.5, 1.5, 0.16, 3), PAINEL, { y: 0.5, ry: 0 });
    m.caixa(1.8, 0.3, 0.4, GRAFITE, { x: -0.1, y: 0.55 });
    m.caixa(0.9, 0.35, 0.6, GRAFITE, { x: -0.1, y: 0.15 });
    m.caixa(1.2, 0.04, 0.12, 'nacao', { x: -0.3, y: 0.86 });
    m.tubo(0.12, 0.3, { brilho: BRASA }, { x: -1.0, y: 0.6 });
    return olho(m, 0.85, 0.62, 0, 0.13).pronta();
  },
  // Quadrirrotor carenado com canhão ventral.
  drone_laser: () => {
    const m = new Montagem();
    m.cilindro(0.5, 0.45, PAINEL, { y: 0.35 }, 10, 0.4);
    for (const a of [0.785, 2.356, 3.927, 5.498]) {
      const x = Math.cos(a) * 0.95;
      const z = Math.sin(a) * 0.95;
      m.caixa(0.9, 0.08, 0.1, GRAFITE, { x: x / 2, z: z / 2, y: 0.55, ry: -a });
      m.add(new TorusGeometry(0.38, 0.05, 6, 14), GRAFITE, { x, z, y: 0.6, rx: Math.PI / 2 });
    }
    m.tubo(0.07, 0.8, METAL, { x: 0.4, y: 0.22 });
    m.add(new TorusGeometry(0.46, 0.04, 6, 16), 'nacao', { y: 0.8, rx: Math.PI / 2 });
    return olho(m, 0.45, 0.45, 0, 0.12).pronta();
  },
  // Caçamba grande com rampa lateral.
  mobile_silo: () => {
    const m = casco(new Montagem(), 3.6, 2.8, 0.5, 0.12);
    m.add(new CylinderGeometry(1.9, 1.3, 1.5, 4), GRAFITE, { y: 1.25, ry: Math.PI / 4 });
    m.caixa(2.6, 0.08, 0.9, METAL, { y: 0.35, z: 1.55, rx: 0.5 });
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
      m.cilindro(0.5, 1.4, GRAFITE, { x, z, y: 0.5 });
      m.add(
        new TorusGeometry(0.5, 0.07, 6, 16),
        { brilho: CIANO },
        {
          x,
          z,
          y: 1.2,
          rx: Math.PI / 2,
        },
      );
    }
    return olho(m, 1.52, 0.3).pronta();
  },
  // Módulo de pouso de ~16 m com pernas, rampa frontal e antena de dobra.
  ship: () => {
    const m = new Montagem();
    m.cilindro(6.2, 4.5, PAINEL, { y: 2.2 }, 8, 5.2);
    m.cilindro(5.2, 1.6, GRAFITE, { y: 6.7 }, 8, 3.6);
    m.add(new TorusGeometry(6.0, 0.18, 6, 32), 'nacao', { y: 4.5, rx: Math.PI / 2 });
    for (let k = 0; k < 4; k++) {
      const a = Math.PI / 4 + (k * Math.PI) / 2;
      const [x, z] = [Math.cos(a) * 6.3, Math.sin(a) * 6.3];
      m.caixa(0.5, 3.2, 0.5, GRAFITE, { x, z, rz: 0, ry: -a });
      m.cilindro(0.9, 0.2, METAL, { x: Math.cos(a) * 6.6, z: Math.sin(a) * 6.6 });
    }
    m.caixa(4.2, 0.25, 3.2, METAL, { x: 7.2, y: 1.0, rz: 0.42 });
    m.cilindro(0.18, 5.5, METAL, { x: -1.5, y: 8.3 });
    m.add(new ConeGeometry(1.6, 0.8, 16, 1, true), METAL, { x: -1.5, y: 13.6, rx: Math.PI });
    return olho(m, 5.6, 5.4, 0, 0.5).pronta();
  },
  // Coluna esguia com lente giratória.
  laser_tower: () => {
    const m = new Montagem();
    m.cilindro(1.3, 0.6, GRAFITE, {}, 8);
    m.cilindro(0.45, 6.0, PAINEL, { y: 0.6 }, 10, 0.3);
    m.caixa(1.3, 0.6, 0.8, GRAFITE, { y: 6.4 });
    m.add(new TorusGeometry(0.5, 0.08, 6, 14), 'nacao', { y: 3.2, rx: Math.PI / 2 });
    return olho(m, 0.7, 6.7, 0, 0.3).pronta();
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
      m.add(new CylinderGeometry(1.65, 1.65, 0.3, 6), 'nacao', { x, z, y: 0.4 + h * 0.75 });
    }
    m.caixa(3.2, 1.2, 3.0, METAL, { x: 2.1, z: 2.2, y: 0.4 });
    return olho(m, 3.75, 1.3, 2.2, 0.25).pronta();
  },
  // Painéis que acompanham o sol.
  solar_plant: () => {
    const m = new Montagem();
    m.caixa(6, 0.3, 6, GRAFITE);
    m.cilindro(0.3, 2.2, METAL, { y: 0.3 });
    m.caixa(5.4, 0.12, 4.2, VIDRO, { y: 2.3, rz: 0.55 });
    m.caixa(5.4, 0.05, 0.15, 'nacao', { y: 2.5, z: 2.0, rz: 0.55 });
    return olho(m, 2.4, 0.5, -2.6, 0.2).pronta();
  },
  // Reator compacto com aletas de dissipação incandescentes.
  nuclear_plant: () => {
    const m = new Montagem();
    m.caixa(8, 0.4, 8, GRAFITE);
    m.cilindro(2.4, 4.5, PAINEL, { y: 0.4 }, 16, 1.9);
    m.add(new SphereGeometry(1.9, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), METAL, { y: 4.9 });
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4;
      m.caixa(
        1.4,
        3.2,
        0.14,
        { brilho: BRASA },
        {
          x: Math.cos(a) * 2.9,
          z: Math.sin(a) * 2.9,
          y: 0.6,
          ry: -a,
        },
      );
    }
    m.add(new TorusGeometry(2.3, 0.12, 6, 24), 'nacao', { y: 4.0, rx: Math.PI / 2 });
    return olho(m, 2.3, 2.2, 0, 0.3).pronta();
  },
  // Plataforma com trilho de lançamento.
  satellite_uplink: () => {
    const m = new Montagem();
    m.caixa(10, 0.6, 10, GRAFITE);
    m.caixa(9.5, 0.2, 9.5, PAINEL, { y: 0.6 });
    m.caixa(9.0, 0.35, 0.9, METAL, { x: 0.5, y: 3.2, rz: 0.6 });
    for (const x of [-2.0, 1.2]) m.caixa(0.5, x < 0 ? 1.4 : 3.4, 0.5, GRAFITE, { x, y: 0.8 });
    m.caixa(1.2, 0.8, 0.8, METAL, { x: 3.0, y: 5.6, rz: 0.6 });
    m.caixa(8.5, 0.06, 0.2, 'nacao', { y: 0.82, z: -4.5 });
    return olho(m, 4.9, 1.0, 3.8, 0.3).pronta();
  },
  // Disco baixo com sensor na cor da nação.
  mine: () => {
    const m = new Montagem();
    m.cilindro(0.5, 0.2, GRAFITE, {}, 10, 0.4);
    return olho(m, 0, 0.22, 0, 0.12).pronta();
  },
};

export const TIPOS_DE_MODELO = Object.keys(CONSTRUTORES) as TipoDeModelo[];

const cache = new Map<TipoDeModelo, BufferGeometry>();

export function geometriaDoModelo(tipo: TipoDeModelo): BufferGeometry {
  let geo = cache.get(tipo);
  if (!geo) {
    geo = CONSTRUTORES[tipo]();
    cache.set(tipo, geo);
  }
  return geo;
}
