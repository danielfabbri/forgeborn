/**
 * CTL-11: marcador do impacto previsto da bomba no controle direto (anel no chão).
 */
import { DoubleSide, Mesh, MeshBasicMaterial, RingGeometry, type Scene, Vector3 } from 'three';
import type { Vec3 } from '../sim/map/esfera';

export class MarcadorDeImpacto {
  private readonly malha: Mesh;

  constructor(scene: Scene, raio: number) {
    this.malha = new Mesh(
      new RingGeometry(raio * 0.8, raio, 32),
      new MeshBasicMaterial({
        color: '#ff8a3d',
        transparent: true,
        opacity: 0.8,
        side: DoubleSide,
        depthWrite: false,
      }),
    );
    this.malha.visible = false;
    scene.add(this.malha);
  }

  /** Mostra o anel em `ponto` (mundo), deitado no chão de vertical `cima`; null esconde. */
  mostrar(ponto: Vec3 | null, cima: Vec3 | null): void {
    this.malha.visible = ponto !== null && cima !== null;
    if (!ponto || !cima) return;
    this.malha.position.set(
      ponto[0] + cima[0] * 0.2,
      ponto[1] + cima[1] * 0.2,
      ponto[2] + cima[2] * 0.2,
    );
    this.malha.lookAt(new Vector3(...ponto).add(new Vector3(...cima)));
  }
}
