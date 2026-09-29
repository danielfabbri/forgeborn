/**
 * Marcas de visão no mundo: sinais de radar da Sentinela (VIS-06: marcadores vermelhos
 * pulsantes, sem tipo) e o círculo de visão dos satélites no chão (VIS-08).
 */
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  InstancedMesh,
  LineBasicMaterial,
  LineLoop,
  Matrix4,
  MeshBasicMaterial,
  type Scene,
  SphereGeometry,
} from 'three';
import { avancar, girar, norteEm, type Vec3 } from '../sim/map/esfera';

const MAX_SINAIS = 128;
const SEGMENTOS = 64;
/** Pulso dos sinais (s por ciclo) e altura acima do chão (m): apresentação. */
const PULSO_S = 1.2;
const ELEVACAO_M = 1.2;

export class SinaisRender {
  private readonly sinais: InstancedMesh;
  private readonly matriz = new Matrix4();
  private readonly aneis: LineLoop[] = [];

  constructor(
    private readonly scene: Scene,
    private readonly raio: number,
    private readonly chao: (d: Vec3) => number,
  ) {
    this.sinais = new InstancedMesh(
      new SphereGeometry(0.9, 10, 8),
      new MeshBasicMaterial({
        color: new Color('#ff3b3b'),
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
      MAX_SINAIS,
    );
    this.sinais.frustumCulled = false;
    this.sinais.count = 0;
    scene.add(this.sinais);
  }

  sync(
    sinais: readonly Vec3[],
    satelites: ReadonlyArray<{ ponto: Vec3; raio: number }>,
    agora: number,
  ) {
    const escala = 0.7 + 0.3 * Math.sin((agora / 1000) * ((2 * Math.PI) / PULSO_S));
    let k = 0;
    for (const d of sinais) {
      if (k >= MAX_SINAIS) break;
      const r = this.raio + this.chao(d) + ELEVACAO_M;
      this.matriz.makeScale(escala, escala, escala);
      this.matriz.setPosition(d[0] * r, d[1] * r, d[2] * r);
      this.sinais.setMatrixAt(k++, this.matriz);
    }
    this.sinais.count = k;
    this.sinais.instanceMatrix.needsUpdate = true;

    while (this.aneis.length < satelites.length) {
      const geo = new BufferGeometry();
      geo.setAttribute(
        'position',
        new BufferAttribute(new Float32Array(SEGMENTOS * 3), 3).setUsage(DynamicDrawUsage),
      );
      const anel = new LineLoop(
        geo,
        new LineBasicMaterial({ color: '#7fd6ff', transparent: true, opacity: 0.6 }),
      );
      anel.frustumCulled = false;
      this.scene.add(anel);
      this.aneis.push(anel);
    }
    this.aneis.forEach((anel, i) => {
      const sat = satelites[i];
      anel.visible = sat !== undefined;
      if (!sat) return;
      const pos = anel.geometry.getAttribute('position') as BufferAttribute;
      const norte = norteEm(sat.ponto);
      for (let s = 0; s < SEGMENTOS; s++) {
        const rumo = girar(norte, sat.ponto, (s / SEGMENTOS) * Math.PI * 2);
        const p = avancar(sat.ponto, rumo, sat.raio / this.raio).p;
        const r = this.raio + this.chao(p) + 0.3;
        pos.setXYZ(s, p[0] * r, p[1] * r, p[2] * r);
      }
      pos.needsUpdate = true;
    });
  }
}
