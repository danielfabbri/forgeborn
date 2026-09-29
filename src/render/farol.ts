/**
 * CAM-07: farol do ponto marcado do tutorial: coluna de luz alta e anel no chão, visíveis de
 * longe. Medidas de apresentação.
 */
import {
  AdditiveBlending,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
  Quaternion,
  Vector3,
} from 'three';
import type { Vec3 } from '../sim/map/esfera';

const ALTURA_M = 45;

export function criarFarol(d: Vec3, raioDoChao: number): Group & { pulsar(agora: number): void } {
  const grupo = new Group() as Group & { pulsar(agora: number): void };
  const luz = new MeshBasicMaterial({
    color: '#ffd27a',
    transparent: true,
    opacity: 0.35,
    blending: AdditiveBlending,
    depthWrite: false,
  });
  const coluna = new Mesh(new CylinderGeometry(1.2, 2.2, ALTURA_M, 20, 1, true), luz);
  coluna.position.y = ALTURA_M / 2;
  const anel = new Mesh(
    new RingGeometry(9, 12, 48).rotateX(-Math.PI / 2),
    new MeshBasicMaterial({
      color: '#ffd27a',
      transparent: true,
      opacity: 0.6,
      blending: AdditiveBlending,
      depthWrite: false,
      side: 2,
    }),
  );
  anel.position.y = 0.4;
  grupo.add(coluna, anel);
  const cima = new Vector3(...d);
  grupo.quaternion.copy(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), cima));
  grupo.position.copy(cima.multiplyScalar(raioDoChao));
  grupo.pulsar = (agora) => {
    luz.opacity = 0.25 + 0.15 * Math.sin(agora / 250);
  };
  return grupo;
}
