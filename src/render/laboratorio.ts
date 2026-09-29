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

/** Zona de pouso: centro e rumo das rampas (a cerca abre nelas). */
export interface ZonaDoLaboratorio {
  d: Vec3;
  rampas: readonly Vec3[];
}

/** Árvores: quantas tentativas e as folgas (m) de zonas, pistas e pontos médios. */
const TENTATIVAS_ARVORES = 700;
const FOLGA_ZONA_M = 80;
const FOLGA_PISTA_M = 9;
const FOLGA_PONTO_M = 38;
/** Abertura (rad, de cada lado) da cerca nas rampas. */
const ABERTURA_RAMPA_RAD = 0.2;

function distanciaAoArco(p: Vec3, a: Vec3, b: Vec3, raio: number): number {
  const n = new Vector3(...produtoVetorial(a, b)).normalize();
  const vp = new Vector3(...p);
  const dentro =
    new Vector3(...produtoVetorial(a, p)).dot(n) >= 0 &&
    new Vector3(...produtoVetorial(p, b)).dot(n) >= 0;
  if (!dentro) return Infinity;
  return Math.abs(Math.asin(Math.max(-1, Math.min(1, vp.dot(n))))) * raio;
}

export function criarLaboratorio(
  zonasDePouso: readonly ZonaDoLaboratorio[],
  raio: number,
  alturaEm: (d: Vec3) => number,
  evitar: { pontos: readonly Vec3[]; segmentos: ReadonlyArray<readonly [Vec3, Vec3]> },
): Group {
  const zonas = zonasDePouso.map((z) => z.d);
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
  for (const zona of zonasDePouso) {
    const z = zona.d;
    const norte = norteEm(z);
    for (let j = 0; j < POSTES_POR_CERCA; j++) {
      const a = (j / POSTES_POR_CERCA) * Math.PI * 2;
      const rumoDoPoste = girar(norte, z, a);
      // A cerca abre nas rampas (e nas pistas que saem delas).
      const naRampa = zona.rampas.some(
        (r) =>
          Math.acos(Math.max(-1, Math.min(1, new Vector3(...r).dot(new Vector3(...rumoDoPoste))))) <
          ABERTURA_RAMPA_RAD,
      );
      if (naRampa) continue;
      const passo = avancar(z, rumoDoPoste, RAIO_CERCA_M / raio);
      const r = raio + alturaEm(passo.p) - 0.1;
      // O painel fica entre este poste e o próximo, alinhado à tangente do anel.
      const tangenteAnel = girar(passo.rumo, passo.p, Math.PI / 2);
      postes.setMatrixAt(p, base(passo.p, passo.rumo, r));
      // `meio.rumo` já é a tangente do anel: o painel (comprido em x) segue a cerca.
      const meio = avancar(passo.p, tangenteAnel, volta / 2 / raio);
      const m = base(meio.p, meio.rumo, raio + alturaEm(meio.p) - 0.1);
      m.multiply(new Matrix4().makeScale(volta, 1, 1));
      paineis.setMatrixAt(p, m);
      p++;
    }
  }
  postes.count = p;
  paineis.count = p;
  postes.frustumCulled = false;
  paineis.frustumCulled = false;
  grupo.add(postes, paineis);

  // Árvores na grama, longe das zonas, das pistas e dos pontos médios (jazidas e alvos).
  let s = 7;
  const sorte = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const tronco = new CylinderGeometry(0.25, 0.35, 2.4, 6).translate(0, 1.2, 0);
  const copa = new ConeGeometry(2.1, 5.5, 8).translate(0, 5.2, 0);
  const troncos = new InstancedMesh(
    tronco,
    new MeshStandardMaterial({ color: '#5b4128', roughness: 0.9 }),
    TENTATIVAS_ARVORES,
  );
  const copas = new InstancedMesh(
    copa,
    new MeshStandardMaterial({ color: '#2f5a24', roughness: 0.85 }),
    TENTATIVAS_ARVORES,
  );
  let t = 0;
  for (let k = 0; k < TENTATIVAS_ARVORES; k++) {
    const z = 2 * sorte() - 1;
    const ang = sorte() * Math.PI * 2;
    const rr = Math.sqrt(1 - z * z);
    const d: Vec3 = [rr * Math.cos(ang), z, rr * Math.sin(ang)];
    const longe = (a: Vec3, m: number) =>
      Math.acos(Math.max(-1, Math.min(1, d[0] * a[0] + d[1] * a[1] + d[2] * a[2]))) * raio >= m;
    if (!zonas.every((zz) => longe(zz, FOLGA_ZONA_M))) continue;
    if (!evitar.pontos.every((pp) => longe(pp, FOLGA_PONTO_M))) continue;
    if (evitar.segmentos.some(([a, b]) => distanciaAoArco(d, a, b, raio) < FOLGA_PISTA_M)) continue;
    const escala = 0.7 + sorte() * 0.7;
    const m = base(d, norteEm(d), raio + alturaEm(d) - 0.2).multiply(
      new Matrix4().makeScale(escala, escala, escala),
    );
    troncos.setMatrixAt(t, m);
    copas.setMatrixAt(t, m);
    t++;
  }
  troncos.count = t;
  copas.count = t;
  for (const x of [troncos, copas]) {
    x.castShadow = true;
    x.receiveShadow = true;
    x.frustumCulled = false;
  }
  grupo.add(troncos, copas);

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
