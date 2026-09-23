/** Anéis de seleção no chão sob os corpos selecionados (CTL-04), num único InstancedMesh. */
import {
  Color,
  DynamicDrawUsage,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  RingGeometry,
  type Scene,
} from 'three';
import type { CorpoDesenhado } from './unidades';

const COR_PROPRIA = new Color('#e6f2ff');
const COR_INIMIGA = new Color('#ff4a3d');

export class AneisDeSelecao {
  private malha: InstancedMesh;
  private readonly matriz = new Matrix4();

  constructor(
    private readonly scene: Scene,
    private readonly chao: (x: number, z: number) => number,
    capacidade = 64,
  ) {
    this.malha = this.criar(capacidade);
  }

  private criar(capacidade: number): InstancedMesh {
    const geometria = new RingGeometry(0.86, 1, 40);
    geometria.rotateX(-Math.PI / 2);
    const material = new MeshBasicMaterial({
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    const malha = new InstancedMesh(geometria, material, capacidade);
    malha.instanceMatrix.setUsage(DynamicDrawUsage);
    malha.frustumCulled = false;
    malha.renderOrder = 1;
    malha.count = 0;
    this.scene.add(malha);
    return malha;
  }

  sync(selecionados: CorpoDesenhado[], jogador: string): void {
    if (selecionados.length > this.malha.instanceMatrix.count) {
      this.scene.remove(this.malha);
      this.malha.geometry.dispose();
      this.malha.dispose();
      this.malha = this.criar(selecionados.length * 2);
    }
    selecionados.forEach((c, k) => {
      const escala = c.raio * 1.3;
      // No chão sob a unidade; sob um drone em voo, logo abaixo do casco.
      const y = Math.max(this.chao(c.x, c.z) + 0.15, c.y - 0.45);
      this.matriz.makeScale(escala, 1, escala).setPosition(c.x, y, c.z);
      this.malha.setMatrixAt(k, this.matriz);
      this.malha.setColorAt(k, c.nacao === jogador ? COR_PROPRIA : COR_INIMIGA);
    });
    this.malha.count = selecionados.length;
    this.malha.instanceMatrix.needsUpdate = true;
    if (this.malha.instanceColor) this.malha.instanceColor.needsUpdate = true;
  }
}
