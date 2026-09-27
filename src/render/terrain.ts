/**
 * Terreno do planeta (TEC-13, ART-08): tiles de ~52 m em cada face da cubo-esfera, com LOD,
 * saias radiais para esconder frestas entre níveis e normais tiradas do heightmap (os tiles e as
 * faces emendam sem costura de iluminação). O detalhe do regolito é triplanar (em coordenadas
 * do mundo), porque coordenadas UV numa esfera teriam costura.
 */
import { type Ambientacao, ambientacaoDe } from './ambientacao';
import { GLSL_NEVOA, type NevoaRender } from './nevoa';
import {
  BufferAttribute,
  Color,
  BufferGeometry,
  Group,
  LOD,
  Mesh,
  MeshStandardMaterial,
  type Texture,
  Vector3,
} from 'three';
import { normalizar, produtoVetorial, tangente, type Vec3 } from '../sim/map/esfera';
import { alturaEm, direcaoDoVertice, type Heightmap, indiceDoVertice } from '../sim/map/heightmap';
import { fbm3 } from '../sim/map/noise';
import { criarTexturasRegolito } from './regolith';

/** Tamanho aproximado de um tile (m). */
export const TAMANHO_TILE_M = 52;
/**
 * TEC-16: no máximo tantos tiles por aresta de face; nos corpos grandes (D-79) o tile cresce em
 * vez de multiplicar os draw calls.
 */
export const MAX_TILES_POR_ARESTA = 5;
/** Metros cobertos por uma repetição da textura de detalhe; a 2ª leitura usa ~1/3 disso. */
export const ESCALA_DETALHE_M = 32;

/** Distância (m) da câmera ao centro do tile a partir da qual cada nível entra. */
export const NIVEIS_LOD = [
  { passo: 1, distancia: 0 },
  { passo: 2, distancia: 110 },
  { passo: 4, distancia: 220 },
  { passo: 8, distancia: 380 },
] as const;

export interface Terreno {
  objeto: Group;
  tiles: number;
  /** TEC-19: distâncias de LOD multiplicadas pelo fator do preset gráfico. */
  aplicarLod(fator: number): void;
  /** §14.5: o ponto focal da câmera (o chão longe dele se funde ao fundo). */
  focar(d: Vec3): void;
  dispose(): void;
}

/** Normal do terreno na direção d, por diferenças de altura em duas direções tangentes. */
function normalDoTerreno(mapa: Heightmap, d: Vec3): Vec3 {
  const e1 = tangente(d, Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])!;
  const e2 = normalizar(produtoVetorial(d, e1));
  const passo = 0.5;
  const ang = passo / mapa.raio_m;
  const h = (e: Vec3, s: number) =>
    alturaEm(
      mapa,
      normalizar([d[0] + e[0] * s * ang, d[1] + e[1] * s * ang, d[2] + e[2] * s * ang]),
    );
  const g1 = (h(e1, 1) - h(e1, -1)) / (2 * passo);
  const g2 = (h(e2, 1) - h(e2, -1)) / (2 * passo);
  return normalizar([
    d[0] - e1[0] * g1 - e2[0] * g2,
    d[1] - e1[1] * g1 - e2[1] * g2,
    d[2] - e1[2] * g1 - e2[2] * g2,
  ]);
}

/** Variação suave do tom do regolito (ondas de 14 m para cima). */
function variacaoDoAlbedo(p: Vec3): number {
  return (
    0.03 * fbm3(p[0], p[1], p[2], 91, 3, 1 / 70) + 0.012 * fbm3(p[0], p[1], p[2], 92, 2, 1 / 14)
  );
}

/** Albedo linear do regolito: cinza de mare com variação suave; paredões mais claros. */
function albedo(variacao: number, gradiente: number): number {
  const fresco = Math.min(1, Math.max(0, (gradiente - 0.45) / 0.5));
  return (0.2 + variacao) * (1 + 0.45 * fresco);
}

/** Índices de vértice ao longo de [a, b] com o passo dado, sempre incluindo b. */
function indicesDoTrecho(a: number, b: number, passo: number): number[] {
  const saida: number[] = [];
  for (let k = a; k < b; k += passo) saida.push(k);
  saida.push(b);
  return saida;
}

/** Normal e albedo de cada vértice do heightmap, calculados uma vez para todos os níveis. */
interface Atributos {
  normais: Float32Array;
  albedos: Float32Array;
}

function atributosDosVertices(mapa: Heightmap): Atributos {
  const res = mapa.resolucao;
  const total = 6 * (res + 1) * (res + 1);
  const normais = new Float32Array(total * 3);
  const albedos = new Float32Array(total);
  const R = mapa.raio_m;
  // A variação do tom tem ondas de 14 m ou mais: é calculada a cada 2 vértices e interpolada
  // (desempenho nos corpos grandes, D-79).
  const lado = res + 1;
  const grossa = new Float32Array(lado * lado);
  const variacaoEm = (face: number, i: number, j: number): number => {
    const d = direcaoDoVertice(res, face, i, j);
    return variacaoDoAlbedo([d[0] * R, d[1] * R, d[2] * R]);
  };
  for (let face = 0; face < 6; face++) {
    for (let j = 0; j <= res; j += 2) {
      for (let i = 0; i <= res; i += 2) grossa[j * lado + i] = variacaoEm(face, i, j);
      if (res % 2 === 1) grossa[j * lado + res] = variacaoEm(face, res, j);
    }
    if (res % 2 === 1) {
      for (let i = 0; i <= res; i += 2) grossa[res * lado + i] = variacaoEm(face, i, res);
      grossa[res * lado + res] = variacaoEm(face, res, res);
    }
    const par = (k: number) => (k % 2 === 0 || k === res ? [k, k] : [k - 1, k + 1]);
    for (let j = 0; j <= res; j++) {
      const [j0, j1] = par(j);
      for (let i = 0; i <= res; i++) {
        const [i0, i1] = par(i);
        const variacao =
          (grossa[j0! * lado + i0!]! +
            grossa[j0! * lado + i1!]! +
            grossa[j1! * lado + i0!]! +
            grossa[j1! * lado + i1!]!) /
          4;
        const v = indiceDoVertice(res, face, i, j);
        const d = direcaoDoVertice(res, face, i, j);
        const n = normalDoTerreno(mapa, d);
        normais.set(n, v * 3);
        const cos = n[0] * d[0] + n[1] * d[1] + n[2] * d[2];
        const gradiente = Math.sqrt(Math.max(0, 1 - cos * cos)) / Math.max(cos, 0.05);
        albedos[v] = albedo(variacao, gradiente) / 0.9;
      }
    }
  }
  return { normais, albedos };
}

function geometriaDoTile(
  mapa: Heightmap,
  atributos: Atributos,
  face: number,
  [i0, i1]: [number, number],
  [j0, j1]: [number, number],
  passo: number,
  centro: Vec3,
) {
  const res = mapa.resolucao;
  const is = indicesDoTrecho(i0, i1, passo);
  const js = indicesDoTrecho(j0, j1, passo);
  const ni = is.length;
  const nj = js.length;
  const totalGrade = ni * nj;
  const bordas = 2 * ni + 2 * nj;
  const total = totalGrade + bordas;
  const pos = new Float32Array(total * 3);
  const nor = new Float32Array(total * 3);
  const cor = new Float32Array(total * 3);
  const R = mapa.raio_m;

  const escrever = (v: number, i: number, j: number, queda: number) => {
    const d = direcaoDoVertice(res, face, i, j);
    const r = R + alturaEm(mapa, d) - queda;
    pos[v * 3] = d[0] * r - centro[0];
    pos[v * 3 + 1] = d[1] * r - centro[1];
    pos[v * 3 + 2] = d[2] * r - centro[2];
    const indice = indiceDoVertice(res, face, i, j);
    nor[v * 3] = atributos.normais[indice * 3]!;
    nor[v * 3 + 1] = atributos.normais[indice * 3 + 1]!;
    nor[v * 3 + 2] = atributos.normais[indice * 3 + 2]!;
    const a = atributos.albedos[indice]!;
    cor[v * 3] = a;
    cor[v * 3 + 1] = a * 0.992;
    cor[v * 3 + 2] = a * 0.982;
  };

  for (let b = 0; b < nj; b++) for (let a = 0; a < ni; a++) escrever(b * ni + a, is[a]!, js[b]!, 0);

  const indices: number[] = [];
  const raioDe = (v: number) =>
    Math.hypot(pos[v * 3]! + centro[0], pos[v * 3 + 1]! + centro[1], pos[v * 3 + 2]! + centro[2]);
  for (let b = 0; b < nj - 1; b++) {
    for (let a = 0; a < ni - 1; a++) {
      const v00 = b * ni + a;
      const v10 = v00 + 1;
      const v01 = v00 + ni;
      const v11 = v01 + 1;
      // Diagonal com menor diferença de altura: acompanha melhor encostas curvas.
      const tri =
        Math.abs(raioDe(v00) - raioDe(v11)) < Math.abs(raioDe(v10) - raioDe(v01))
          ? [v00, v11, v01, v00, v10, v11]
          : [v00, v10, v01, v10, v11, v01];
      // Nas faces de sinal negativo a base (i, j) é invertida: troca a ordem para a frente
      // do triângulo ficar para fora do planeta.
      if (face & 1) for (let t = 0; t < 6; t += 3) indices.push(tri[t]!, tri[t + 2]!, tri[t + 1]!);
      else indices.push(...tri);
    }
  }

  // Saias: cada borda ganha uma fileira de vértices rebaixados (radialmente), com faces nos dois
  // sentidos, para esconder frestas entre tiles de níveis diferentes.
  const queda = passo * 2 + 2;
  const contorno: Array<[number, number]> = [
    ...is.map((_, a) => [a, 0] as [number, number]),
    ...js.map((_, b) => [ni - 1, b] as [number, number]),
    ...is.map((_, a) => [ni - 1 - a, nj - 1] as [number, number]),
    ...js.map((_, b) => [0, nj - 1 - b] as [number, number]),
  ];
  contorno.forEach(([a, b], k) => escrever(totalGrade + k, is[a]!, js[b]!, queda));
  const lados = [ni, nj, ni, nj];
  let inicio = 0;
  for (const tamanho of lados) {
    for (let k = inicio; k < inicio + tamanho - 1; k++) {
      const [a1, b1] = contorno[k]!;
      const [a2, b2] = contorno[k + 1]!;
      const topo1 = b1 * ni + a1;
      const topo2 = b2 * ni + a2;
      const base1 = totalGrade + k;
      const base2 = base1 + 1;
      indices.push(topo1, base1, topo2, topo2, base1, base2);
      indices.push(topo1, topo2, base1, topo2, base2, base1);
    }
    inicio += tamanho;
  }

  const geometria = new BufferGeometry();
  geometria.setAttribute('position', new BufferAttribute(pos, 3));
  geometria.setAttribute('normal', new BufferAttribute(nor, 3));
  geometria.setAttribute('color', new BufferAttribute(cor, 3));
  geometria.setIndex(indices);
  geometria.computeBoundingSphere();
  return geometria;
}

/**
 * Material do regolito. A textura de detalhe é lida em projeção triplanar, em duas escalas
 * (32 m e, girada, ~10 m) e misturada; o detalhe fino (cor e normais) some com a distância da
 * câmera e mantém o regolito rico de perto.
 */
/** §14.5: plataformas de concreto (centros das zonas) e pistas (arcos) no chão de grama. */
export interface Pistas {
  zonas: readonly Vec3[];
  segmentos: ReadonlyArray<readonly [Vec3, Vec3]>;
}
const MAX_ZONAS = 4;
const MAX_SEGMENTOS = 12;
/** Apresentação: raio da plataforma de concreto e largura das pistas (m). */
const RAIO_PLATAFORMA_M = 58;
const LARGURA_PISTA_M = 9;

/** §14.5: ponto focal atual (direção), para o chão longe se fundir ao fundo. */
const focoDoTerreno = { value: new Vector3(0, 1, 0) };

export function criarMaterialRegolito(
  nevoa: NevoaRender | null = null,
  ambientacao: Ambientacao = ambientacaoDe('lua'),
  raio = 0,
  pistas: Pistas | null = null,
): MeshStandardMaterial & { texturas: Texture[] } {
  const texturas = criarTexturasRegolito();
  const material = new MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.96,
    metalness: 0,
  }) as MeshStandardMaterial & { texturas: Texture[] };
  material.texturas = [texturas.detalhe, texturas.normais];
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uDetalhe = { value: texturas.detalhe };
    shader.uniforms.uNormais = { value: texturas.normais };
    shader.uniforms.uEscala = { value: 1 / ESCALA_DETALHE_M };
    // VIS-01/TEC-17: névoa do jogador amostrada no terreno.
    shader.uniforms.uNevoa = { value: nevoa?.textura ?? null };
    shader.uniforms.uNevoaN = { value: nevoa?.n ?? 1 };
    shader.uniforms.uNevoaAtiva = { value: nevoa ? 1 : 0 };
    shader.uniforms.uEscuroBrilho = { value: ambientacao.escuroBrilho };
    shader.uniforms.uDetalheForca = { value: ambientacao.detalhe };
    shader.uniforms.uFoco = focoDoTerreno;
    shader.uniforms.uDesvanecer = {
      value: ambientacao.desvanecer
        ? new Vector3(ambientacao.desvanecer.perto, ambientacao.desvanecer.longe, 1)
        : new Vector3(0, 1, 0),
    };
    shader.uniforms.uCorLonge = {
      value: ambientacao.desvanecer?.cor.clone() ?? new Color(0, 0, 0),
    };
    // §18.2: tom do chão, marcações do Campo de testes e gelo de Shackleton.
    shader.uniforms.uTinta = { value: new Vector3(...ambientacao.tinta) };
    shader.uniforms.uMarcacoes = { value: ambientacao.marcacoes ? 1 : 0 };
    shader.uniforms.uGelo = { value: ambientacao.gelo ? 1 : 0 };
    shader.uniforms.uRaio = { value: raio };
    const zonas = (pistas?.zonas ?? []).slice(0, MAX_ZONAS);
    const segmentos = (pistas?.segmentos ?? []).slice(0, MAX_SEGMENTOS);
    const preencher = (lista: readonly Vec3[], n: number) =>
      Array.from({ length: n }, (_, k) => new Vector3(...(lista[k] ?? [0, 1, 0])));
    shader.uniforms.uGrama = { value: ambientacao.grama ? 1 : 0 };
    shader.uniforms.uZonas = { value: preencher(zonas, MAX_ZONAS) };
    shader.uniforms.uNZonas = { value: zonas.length };
    shader.uniforms.uSegA = {
      value: preencher(
        segmentos.map((s) => s[0]),
        MAX_SEGMENTOS,
      ),
    };
    shader.uniforms.uSegB = {
      value: preencher(
        segmentos.map((s) => s[1]),
        MAX_SEGMENTOS,
      ),
    };
    shader.uniforms.uNSeg = { value: segmentos.length };
    shader.uniforms.uRaioPlat = { value: RAIO_PLATAFORMA_M };
    shader.uniforms.uLargura = { value: LARGURA_PISTA_M };
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vPosMundo;
varying vec3 vNormalMundo;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vPosMundo = (modelMatrix * vec4(transformed, 1.0)).xyz;
vNormalMundo = normalize(mat3(modelMatrix) * objectNormal);`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform sampler2D uDetalhe;
uniform sampler2D uNormais;
uniform float uEscala;
uniform vec3 uTinta;
uniform float uMarcacoes;
uniform float uGelo;
uniform float uRaio;
uniform float uGrama;
uniform float uDetalheForca;
uniform vec3 uFoco;
uniform vec3 uDesvanecer;
uniform vec3 uCorLonge;
uniform vec3 uZonas[${MAX_ZONAS}];
uniform int uNZonas;
uniform vec3 uSegA[${MAX_SEGMENTOS}];
uniform vec3 uSegB[${MAX_SEGMENTOS}];
uniform int uNSeg;
uniform float uRaioPlat;
uniform float uLargura;
varying vec3 vPosMundo;

/** §14.5: 1 no concreto (plataformas e pistas), 0 na grama. */
float mascaraConcreto(vec3 pos) {
  vec3 p = normalize(pos);
  float c = 0.0;
  for (int i = 0; i < ${MAX_ZONAS}; i++) {
    if (i >= uNZonas) break;
    float d = acos(clamp(dot(p, uZonas[i]), -1.0, 1.0)) * uRaio;
    c = max(c, 1.0 - smoothstep(uRaioPlat - 1.5, uRaioPlat + 1.5, d));
  }
  for (int i = 0; i < ${MAX_SEGMENTOS}; i++) {
    if (i >= uNSeg) break;
    vec3 a = uSegA[i];
    vec3 b = uSegB[i];
    vec3 n = normalize(cross(a, b));
    if (dot(cross(a, p), n) < 0.0 || dot(cross(p, b), n) < 0.0) continue;
    float lateral = abs(asin(clamp(dot(p, n), -1.0, 1.0))) * uRaio;
    c = max(c, 1.0 - smoothstep(uLargura * 0.5 - 0.4, uLargura * 0.5 + 0.4, lateral));
  }
  return c;
}
varying vec3 vNormalMundo;
${GLSL_NEVOA}

vec3 pesosTriplanar(vec3 n) {
  vec3 w = pow(abs(n), vec3(4.0));
  return w / (w.x + w.y + w.z);
}

vec3 triplanarCor(sampler2D tex, vec3 p, vec3 w) {
  return texture2D(tex, p.zy).rgb * w.x + texture2D(tex, p.xz).rgb * w.y + texture2D(tex, p.xy).rgb * w.z;
}`,
      )
      .replace(
        '#include <map_fragment>',
        `float pertoDaCamera = 1.0 - smoothstep(50.0, 170.0, length(vViewPosition));
vec3 nGeo = normalize(vNormalMundo);
vec3 wTri = pesosTriplanar(nGeo);
vec3 pA = vPosMundo * uEscala;
vec3 pB = vPosMundo * uEscala * 3.1 + vec3(0.37, 0.71, 0.13);
vec3 detalhe = mix(triplanarCor(uDetalhe, pA, wTri), triplanarCor(uDetalhe, pB, wTri), 0.5);
diffuseColor.rgb *= mix(vec3(0.9), detalhe, max(pertoDaCamera, 0.45) * uDetalheForca);
diffuseColor.rgb *= uTinta;
if (uMarcacoes > 0.5) {
  // Placas de concreto com juntas escuras e faixas amarelas de sinalização.
  vec3 q = vPosMundo / 6.0;
  vec3 g = abs(fract(q) - 0.5);
  float junta = step(0.485, max(max(g.x, g.y), g.z));
  diffuseColor.rgb *= 1.0 - junta * 0.35;
  vec3 f = abs(fract(vPosMundo / 36.0) - 0.5);
  float faixa = step(0.49, max(max(f.x, f.y), f.z));
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.95, 0.78, 0.18), faixa * 0.85);
}
if (uGrama > 0.5) {
  // §14.5: grama com manchas de terra; o concreto (com as marcações) só nas plataformas e pistas.
  float c = mascaraConcreto(vPosMundo);
  float manchas = detalhe.g;
  vec3 grama = mix(vec3(0.13, 0.25, 0.07), vec3(0.27, 0.42, 0.13), smoothstep(0.35, 0.95, detalhe.r));
  grama = mix(grama, vec3(0.30, 0.24, 0.15), smoothstep(0.82, 0.98, manchas) * 0.6);
  diffuseColor.rgb = mix(grama, diffuseColor.rgb, c);
}
if (uGelo > 0.5) {
  float alt = length(vPosMundo) - uRaio;
  float gelo = 1.0 - smoothstep(-4.0, 0.5, alt);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.78, 0.86, 0.95), gelo * 0.55);
}`,
      )
      .replace(
        '#include <opaque_fragment>',
        `#include <opaque_fragment>
gl_FragColor.rgb = aplicarNevoa(gl_FragColor.rgb, vPosMundo);
if (uDesvanecer.z > 0.5) {
  // §14.5: longe do ponto focal o chão vira a cor dos campos ao fundo (sem borda de planeta).
  float dist = acos(clamp(dot(normalize(vPosMundo), uFoco), -1.0, 1.0)) * uRaio;
  gl_FragColor.rgb = mix(gl_FragColor.rgb, uCorLonge, smoothstep(uDesvanecer.x, uDesvanecer.y, dist));
}`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `{
  // Normais triplanares (mistura "whiteout"), no espaço do mundo, levadas ao da câmera.
  vec3 tx = texture2D(uNormais, pA.zy).xyz * 2.0 - 1.0;
  vec3 ty = texture2D(uNormais, pA.xz).xyz * 2.0 - 1.0;
  vec3 tz = texture2D(uNormais, pA.xy).xyz * 2.0 - 1.0;
  tx = vec3(tx.xy + nGeo.zy, abs(tx.z) * nGeo.x);
  ty = vec3(ty.xy + nGeo.xz, abs(ty.z) * nGeo.y);
  tz = vec3(tz.xy + nGeo.xy, abs(tz.z) * nGeo.z);
  vec3 nMundo = normalize(tx.zyx * wTri.x + ty.xzy * wTri.y + tz.xyz * wTri.z);
  vec3 nVista = normalize((viewMatrix * vec4(nMundo, 0.0)).xyz);
  normal = normalize(mix(normal, nVista, 0.7 * pertoDaCamera * min(uDetalheForca, 1.0)));
}`,
      );
  };
  return material;
}

/** Divisão de [0, res] em `partes` trechos inteiros. */
function trechos(res: number, partes: number): Array<[number, number]> {
  return Array.from(
    { length: partes },
    (_, k) =>
      [Math.round((k * res) / partes), Math.round(((k + 1) * res) / partes)] as [number, number],
  );
}

export function criarTerreno(
  mapa: Heightmap,
  nevoa: NevoaRender | null = null,
  ambientacao: Ambientacao = ambientacaoDe('lua'),
  pistas: Pistas | null = null,
): Terreno {
  const material = criarMaterialRegolito(nevoa, ambientacao, mapa.raio_m, pistas);
  const objeto = new Group();
  objeto.name = 'terreno';
  const geometrias: BufferGeometry[] = [];
  const atributos = atributosDosVertices(mapa);
  const res = mapa.resolucao;
  const partes = Math.max(1, Math.min(MAX_TILES_POR_ARESTA, Math.round(res / TAMANHO_TILE_M)));
  let tiles = 0;
  // As distâncias de LOD valem para o tile nominal; um tile maior troca de nível mais longe, para a
  // borda perto da câmera não perder detalhe.
  const escalaLod = Math.max(1, res / partes / TAMANHO_TILE_M);
  for (let face = 0; face < 6; face++) {
    for (const ti of trechos(res, partes)) {
      for (const tj of trechos(res, partes)) {
        const meio = direcaoDoVertice(
          res,
          face,
          Math.round((ti[0] + ti[1]) / 2),
          Math.round((tj[0] + tj[1]) / 2),
        );
        const r = mapa.raio_m + alturaEm(mapa, meio);
        const centro: Vec3 = [meio[0] * r, meio[1] * r, meio[2] * r];
        const lod = new LOD();
        lod.position.set(...centro);
        for (const nivel of NIVEIS_LOD) {
          const geometria = geometriaDoTile(mapa, atributos, face, ti, tj, nivel.passo, centro);
          geometrias.push(geometria);
          const malha = new Mesh(geometria, material);
          malha.castShadow = true;
          malha.receiveShadow = true;
          lod.addLevel(malha, nivel.distancia * escalaLod);
        }
        objeto.add(lod);
        tiles++;
      }
    }
  }
  return {
    objeto,
    tiles,
    focar: (d) => focoDoTerreno.value.set(...d),
    aplicarLod: (fator) => {
      objeto.traverse((o) => {
        if (!(o instanceof LOD)) return;
        o.levels.forEach((nivel, k) => {
          nivel.distance = (NIVEIS_LOD[k]?.distancia ?? nivel.distance) * escalaLod * fator;
        });
      });
    },
    dispose: () => {
      for (const g of geometrias) g.dispose();
      for (const t of material.texturas) t.dispose();
      material.dispose();
    },
  };
}
