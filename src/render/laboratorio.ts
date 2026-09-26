/**
 * §14.5: cenário do Campo de testes na Terra: galpões, cercas e o prédio do laboratório em volta
 * das zonas de pouso. Só decoração (sem colisão); posições e medidas são de apresentação.
 */
import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Vector3,
} from 'three';
import { avancar, girar, norteEm, produtoVetorial, type Vec3 } from '../sim/map/esfera';

/** Distâncias (m) do centro da zona: cerca e anel de galpões. */
const RAIO_CERCA_M = 64;
const RAIO_GALPOES_M = 92;
const GALPOES_POR_ZONA = 5;
const POSTES_POR_CERCA = 72;

function base(d: Vec3, rumo: Vec3, r: number): Matrix4 {
  const cima = new Vector3(...d);
  const frente = new Vector3(...rumo);
  const lado = new Vector3(...produtoVetorial(rumo, d));
  return new Matrix4().makeBasis(frente, cima, lado).setPosition(d[0] * r, d[1] * r, d[2] * r);
}

export function criarLaboratorio(
  zonas: readonly Vec3[],
  raio: number,
  alturaEm: (d: Vec3) => number,
): Group {
  const grupo = new Group();
  grupo.name = 'laboratorio';
  const parede = new MeshStandardMaterial({ color: '#c9ccd1', roughness: 0.8 });
  const telhado = new MeshStandardMaterial({ color: '#6f7c8c', roughness: 0.6, metalness: 0.3 });
  const metal = new MeshStandardMaterial({ color: '#8a9099', roughness: 0.5, metalness: 0.6 });
  const tela = new MeshStandardMaterial({
    color: '#aab3bd',
    roughness: 0.6,
    metalness: 0.5,
    transparent: true,
    opacity: 0.45,
  });

  // Galpões: corpo e telhado em duas águas.
  const corpo = new BoxGeometry(16, 7, 11).translate(0, 3.5, 0);
  const cobertura = new ConeGeometry(9.8, 3.2, 4, 1).rotateY(Math.PI / 4).scale(1.15, 1, 0.8);
  cobertura.translate(0, 8.6, 0);
  const n = zonas.length * GALPOES_POR_ZONA;
  const galpoes = new InstancedMesh(corpo, parede, n);
  const telhados = new InstancedMesh(cobertura, telhado, n);
  let k = 0;
  zonas.forEach((z, iz) => {
    const norte = norteEm(z);
    for (let g = 0; g < GALPOES_POR_ZONA; g++) {
      const a = ((g + 0.5 + iz * 0.37) / GALPOES_POR_ZONA) * Math.PI * 2;
      const rumo = girar(norte, z, a);
      const passo = avancar(z, rumo, RAIO_GALPOES_M / raio);
      const m = base(passo.p, passo.rumo, raio + alturaEm(passo.p) - 0.3);
      galpoes.setMatrixAt(k, m);
      telhados.setMatrixAt(k, m);
      k++;
    }
  });
  for (const malha of [galpoes, telhados]) {
    malha.castShadow = true;
    malha.receiveShadow = true;
    malha.frustumCulled = false;
  }
  grupo.add(galpoes, telhados);

  // Cercas: postes com painéis de tela em volta de cada zona.
  const poste = new CylinderGeometry(0.09, 0.09, 2.4, 6).translate(0, 1.2, 0);
  const painel = new BoxGeometry(1, 2, 0.04).translate(0, 1.2, 0);
  const totalPostes = zonas.length * POSTES_POR_CERCA;
  const postes = new InstancedMesh(poste, metal, totalPostes);
  const paineis = new InstancedMesh(painel, tela, totalPostes);
  let p = 0;
  const volta = (2 * Math.PI * RAIO_CERCA_M) / POSTES_POR_CERCA;
  for (const z of zonas) {
    const norte = norteEm(z);
    for (let j = 0; j < POSTES_POR_CERCA; j++) {
      const a = (j / POSTES_POR_CERCA) * Math.PI * 2;
      const passo = avancar(z, girar(norte, z, a), RAIO_CERCA_M / raio);
      const r = raio + alturaEm(passo.p) - 0.1;
      // O painel fica entre este poste e o próximo, alinhado à tangente do anel.
      const tangenteAnel = girar(passo.rumo, passo.p, Math.PI / 2);
      postes.setMatrixAt(p, base(passo.p, passo.rumo, r));
      const meio = avancar(passo.p, tangenteAnel, volta / 2 / raio);
      const m = base(meio.p, meio.rumo, raio + alturaEm(meio.p) - 0.1);
      m.multiply(new Matrix4().makeRotationY(Math.PI / 2).scale(new Vector3(volta, 1, 1)));
      paineis.setMatrixAt(p, m);
      p++;
    }
  }
  postes.frustumCulled = false;
  paineis.frustumCulled = false;
  grupo.add(postes, paineis);

  // O prédio do laboratório, perto da primeira zona (a do jogador).
  const z0 = zonas[0];
  if (z0) {
    const rumo = girar(norteEm(z0), z0, Math.PI * 0.85);
    const passo = avancar(z0, rumo, (RAIO_GALPOES_M + 14) / raio);
    const m = base(passo.p, passo.rumo, raio + alturaEm(passo.p) - 0.3);
    const predio = new InstancedMesh(new BoxGeometry(26, 14, 18).translate(0, 7, 0), parede, 1);
    predio.setMatrixAt(0, m);
    const torre = new InstancedMesh(
      new CylinderGeometry(3, 3, 22, 16).translate(9, 11, 5),
      metal,
      1,
    );
    torre.setMatrixAt(0, m);
    for (const x of [predio, torre]) {
      x.castShadow = true;
      x.receiveShadow = true;
      x.frustumCulled = false;
    }
    grupo.add(predio, torre);
  }
  return grupo;
}
