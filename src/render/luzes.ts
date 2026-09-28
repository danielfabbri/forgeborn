/**
 * ART-13 (D-86): luzes de sinalização piscando nas estruturas ligadas a uma rede com energia: a
 * do topo na cor da nação, as de canto brancas, em fases alternadas. Sem rede ou em obra, apagadas.
 * Só apresentação.
 */
import {
  AdditiveBlending,
  Color,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  type Scene,
  SphereGeometry,
} from 'three';

export interface EstruturaAcesa {
  id: number;
  x: number;
  y: number;
  z: number;
  cima: [number, number, number];
  altura: number;
  raio: number;
  cor: string;
}

const MAX_LUZES = 2048;
/** Período do pisca (ms) e fração do período acesa. */
const PERIODO_MS = 1400;
const ACESA = 0.35;
const BRANCO = new Color('#f4f7ff');

export class LuzesRender {
  private readonly malha: InstancedMesh;
  private readonly matriz = new Matrix4();
  private readonly cor = new Color();

  constructor(scene: Scene) {
    this.malha = new InstancedMesh(
      new SphereGeometry(0.3, 8, 6),
      new MeshBasicMaterial({
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
      MAX_LUZES,
    );
    // Cria o atributo de cor antes de compilar o material.
    this.malha.setColorAt(0, BRANCO);
    this.malha.count = 0;
    this.malha.frustumCulled = false;
    this.malha.renderOrder = 8;
    scene.add(this.malha);
  }

  sync(estruturas: readonly EstruturaAcesa[], agora: number): void {
    let n = 0;
    const acender = (x: number, y: number, z: number, cor: Color, escala: number) => {
      if (n >= MAX_LUZES) return;
      this.matriz.makeScale(escala, escala, escala).setPosition(x, y, z);
      this.malha.setMatrixAt(n, this.matriz);
      this.malha.setColorAt(n, cor);
      n++;
    };
    for (const e of estruturas) {
      // Fase própria por estrutura, para a base não piscar em uníssono.
      const fase = ((agora + e.id * 373) % PERIODO_MS) / PERIODO_MS;
      const [cx, cy, cz] = e.cima;
      if (fase < ACESA) {
        const h = e.altura + 0.2;
        acender(e.x + cx * h, e.y + cy * h, e.z + cz * h, this.cor.set(e.cor), 1.3);
      }
      // Cantos na meia fase oposta, alternando os pares.
      const canto = (fase + 0.5) % 1;
      if (canto >= ACESA) continue;
      // Base tangente ao chão.
      const ref: [number, number, number] = Math.abs(cy) < 0.9 ? [0, 1, 0] : [1, 0, 0];
      let ax = cy * ref[2] - cz * ref[1];
      let ay = cz * ref[0] - cx * ref[2];
      let az = cx * ref[1] - cy * ref[0];
      const l = Math.hypot(ax, ay, az) || 1;
      ax /= l;
      ay /= l;
      az /= l;
      const bx = cy * az - cz * ay;
      const by = cz * ax - cx * az;
      const bz = cx * ay - cy * ax;
      const r = e.raio * 0.72;
      const h = Math.max(0.4, e.altura * 0.45);
      const par = canto < ACESA / 2 ? 0 : 1;
      for (const [s, t] of par === 0
        ? [
            [1, 1],
            [-1, -1],
          ]
        : [
            [1, -1],
            [-1, 1],
          ]) {
        const u = (s! * r) / Math.SQRT2;
        const v = (t! * r) / Math.SQRT2;
        acender(
          e.x + ax * u + bx * v + cx * h,
          e.y + ay * u + by * v + cy * h,
          e.z + az * u + bz * v + cz * h,
          BRANCO,
          0.8,
        );
      }
    }
    this.malha.count = n;
    this.malha.instanceMatrix.needsUpdate = true;
    if (this.malha.instanceColor) this.malha.instanceColor.needsUpdate = true;
  }
}
