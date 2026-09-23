/**
 * Terreno renderizado a partir do heightmap (TEC-13, ART-08): chunks de 64 m com LOD,
 * saias nas bordas para esconder frestas entre níveis e normais tiradas do heightmap
 * (os chunks emendam sem costura de iluminação).
 */
import {
  BufferAttribute,
  BufferGeometry,
  Group,
  LOD,
  Mesh,
  MeshStandardMaterial,
  ShaderChunk,
  Vector2,
} from 'three';
import { alturaAmostra, type Heightmap } from '../sim/map/heightmap';
import { fbm } from '../sim/map/noise';
import { criarEntorno } from './entorno';
import { criarTexturasRegolito } from './regolith';

export const TAMANHO_CHUNK_M = 64;
/** Metros cobertos por uma repetição da textura de detalhe; a 2ª leitura usa ~1/3 disso. */
export const ESCALA_DETALHE_M = 32;

/** Distância (m) da câmera ao centro do chunk a partir da qual cada nível entra. */
export const NIVEIS_LOD = [
  { passo: 1, distancia: 0 },
  { passo: 2, distancia: 150 },
  { passo: 4, distancia: 300 },
  { passo: 8, distancia: 500 },
] as const;

export interface Terreno {
  objeto: Group;
  chunks: number;
  dispose(): void;
}

function inclinacao(mapa: Heightmap, i: number, j: number): [number, number] {
  return [
    (alturaAmostra(mapa, i + 1, j) - alturaAmostra(mapa, i - 1, j)) / 2,
    (alturaAmostra(mapa, i, j + 1) - alturaAmostra(mapa, i, j - 1)) / 2,
  ];
}

/** Albedo linear do regolito: cinza de mare com variação suave; paredões mais claros (material fresco). */
function albedo(mapa: Heightmap, i: number, j: number, gradiente: number): number {
  const variacao = 0.03 * fbm(i, j, 91, 3, 1 / 70) + 0.012 * fbm(i, j, 92, 2, 1 / 14);
  const fresco = Math.min(1, Math.max(0, (gradiente - 0.45) / 0.5));
  return (0.2 + variacao) * (1 + 0.45 * fresco);
}

function geometriaDoChunk(
  mapa: Heightmap,
  ci: number,
  cj: number,
  passo: number,
  escalaUv: number,
) {
  const n = TAMANHO_CHUNK_M / passo;
  const i0 = ci * TAMANHO_CHUNK_M;
  const j0 = cj * TAMANHO_CHUNK_M;
  const meio = mapa.lado_m / 2;
  const cx = i0 + TAMANHO_CHUNK_M / 2 - meio;
  const cz = j0 + TAMANHO_CHUNK_M / 2 - meio;
  const lado = n + 1;
  const totalGrade = lado * lado;
  const totalSaia = 4 * lado;
  const total = totalGrade + totalSaia;
  const pos = new Float32Array(total * 3);
  const nor = new Float32Array(total * 3);
  const cor = new Float32Array(total * 3);
  const uv = new Float32Array(total * 2);

  const escrever = (v: number, i: number, j: number, queda: number) => {
    const si = i0 + i * passo;
    const sj = j0 + j * passo;
    const [dx, dz] = inclinacao(mapa, si, sj);
    const len = Math.hypot(dx, 1, dz);
    pos[v * 3] = si - meio - cx;
    pos[v * 3 + 1] = alturaAmostra(mapa, si, sj) - queda;
    pos[v * 3 + 2] = sj - meio - cz;
    nor[v * 3] = -dx / len;
    nor[v * 3 + 1] = 1 / len;
    nor[v * 3 + 2] = -dz / len;
    const a = albedo(mapa, si, sj, Math.hypot(dx, dz)) / 0.9;
    cor[v * 3] = a;
    cor[v * 3 + 1] = a * 0.992;
    cor[v * 3 + 2] = a * 0.982;
    uv[v * 2] = (si - meio) / escalaUv;
    uv[v * 2 + 1] = (sj - meio) / escalaUv;
  };

  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) escrever(j * lado + i, i, j, 0);

  const indices: number[] = [];
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const a = j * lado + i;
      const b = a + 1;
      const c = a + lado;
      const d = c + 1;
      // Diagonal com menor diferença de altura: acompanha melhor encostas curvas (sem zigue-zague).
      const y = (v: number) => pos[v * 3 + 1]!;
      if (Math.abs(y(a) - y(d)) < Math.abs(y(b) - y(c))) indices.push(a, c, d, a, d, b);
      else indices.push(a, c, b, b, c, d);
    }
  }

  // Saias: cada borda ganha uma fileira de vértices rebaixados, com faces nos dois sentidos.
  const queda = passo * 2 + 2;
  const bordas: Array<(k: number) => [number, number]> = [
    (k) => [k, 0],
    (k) => [n, k],
    (k) => [n - k, n],
    (k) => [0, n - k],
  ];
  bordas.forEach((ponto, b) => {
    for (let k = 0; k <= n; k++) {
      const [i, j] = ponto(k);
      escrever(totalGrade + b * lado + k, i, j, queda);
    }
    for (let k = 0; k < n; k++) {
      const [i1, j1] = ponto(k);
      const [i2, j2] = ponto(k + 1);
      const topo1 = j1 * lado + i1;
      const topo2 = j2 * lado + i2;
      const base1 = totalGrade + b * lado + k;
      const base2 = base1 + 1;
      indices.push(topo1, base1, topo2, topo2, base1, base2);
      indices.push(topo1, topo2, base1, topo2, base2, base1);
    }
  });

  const geometria = new BufferGeometry();
  geometria.setAttribute('position', new BufferAttribute(pos, 3));
  geometria.setAttribute('normal', new BufferAttribute(nor, 3));
  geometria.setAttribute('color', new BufferAttribute(cor, 3));
  geometria.setAttribute('uv', new BufferAttribute(uv, 2));
  geometria.setIndex(indices);
  geometria.computeBoundingSphere();
  return { geometria, centro: [cx, cz] as const };
}

/**
 * Material do regolito. A textura de detalhe é lida em duas escalas (32 m e, girada, ~10 m) e
 * misturada, então um período quebra a repetição do outro; o detalhe fino (cor e normais) some
 * com a distância da câmera e mantém o regolito rico de perto.
 */
export function criarMaterialRegolito(): MeshStandardMaterial {
  const texturas = criarTexturasRegolito();
  const material = new MeshStandardMaterial({
    vertexColors: true,
    map: texturas.detalhe,
    normalMap: texturas.normais,
    normalScale: new Vector2(0.7, 0.7),
    roughness: 0.96,
    metalness: 0,
  });
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <map_fragment>',
        `float pertoDaCamera = 1.0 - smoothstep( 50.0, 170.0, length( vViewPosition ) );
        #ifdef USE_MAP
          vec4 detalheA = texture2D( map, vMapUv );
          vec2 uvB = mat2( 0.8, -0.6, 0.6, 0.8 ) * vMapUv * 3.1 + vec2( 0.37, 0.71 );
          vec4 detalheB = texture2D( map, uvB );
          diffuseColor *= mix( vec4( 0.9 ), mix( detalheA, detalheB, 0.5 ), max( pertoDaCamera, 0.45 ) );
        #endif`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        ShaderChunk.normal_fragment_maps.replace(
          'mapN.xy *= normalScale;',
          'mapN.xy *= normalScale * pertoDaCamera;',
        ),
      );
  };
  return material;
}

export function criarTerreno(mapa: Heightmap): Terreno {
  const material = criarMaterialRegolito();

  const objeto = new Group();
  objeto.name = 'terreno';
  const geometrias: BufferGeometry[] = [];
  const porLado = mapa.lado_m / TAMANHO_CHUNK_M;
  for (let cj = 0; cj < porLado; cj++) {
    for (let ci = 0; ci < porLado; ci++) {
      const lod = new LOD();
      for (const nivel of NIVEIS_LOD) {
        const { geometria, centro } = geometriaDoChunk(mapa, ci, cj, nivel.passo, ESCALA_DETALHE_M);
        geometrias.push(geometria);
        const malha = new Mesh(geometria, material);
        malha.castShadow = true;
        malha.receiveShadow = true;
        lod.addLevel(malha, nivel.distancia);
        lod.position.set(centro[0], 0, centro[1]);
      }
      objeto.add(lod);
    }
  }
  const entorno = criarEntorno(mapa, material);
  geometrias.push(entorno.geometry);
  objeto.add(entorno);

  return {
    objeto,
    chunks: porLado * porLado,
    dispose: () => {
      for (const g of geometrias) g.dispose();
      material.map?.dispose();
      material.normalMap?.dispose();
      material.dispose();
    },
  };
}
