/**
 * Barras sobre os corpos (UI-07): HP (verde → amarelo → vermelho) e EN (ciano), de tamanho
 * constante na tela, num único InstancedMesh (fundo e preenchimento como instâncias).
 */
import {
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  PlaneGeometry,
  type Scene,
  ShaderMaterial,
} from 'three';
import type { Barras } from '../game/hud';
import { corDoHp } from '../game/hud';

/** Tamanho das barras em px (apresentação). */
const LARGURA_PX = 36;
const ALTURA_PX = 4;
const ESPACO_PX = 2;
/** Altura (m) acima do topo do modelo. */
const FOLGA_M = 0.9;
const COR_EN: [number, number, number] = [0.25, 0.85, 0.94];
const COR_FUNDO: [number, number, number] = [0.05, 0.08, 0.12];

export interface CorpoComBarras {
  x: number;
  y: number;
  z: number;
  cima: [number, number, number];
  altura: number;
  barras: Barras;
}

export class BarrasRender {
  private readonly material = new ShaderMaterial({
    uniforms: { uPixel: { value: 0.001 } },
    vertexShader: `
attribute float aFrac;
attribute float aLinha;
attribute vec3 aCor;
uniform float uPixel;
varying vec3 vCor;
void main() {
  vec4 centro = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  float px = -centro.z * uPixel;
  float x = ((position.x + 0.5) * aFrac - 0.5) * ${LARGURA_PX.toFixed(1)};
  float y = position.y * ${ALTURA_PX.toFixed(1)} - aLinha * ${(ALTURA_PX + ESPACO_PX).toFixed(1)};
  centro.xy += vec2(x, y) * px;
  vCor = aCor;
  gl_Position = projectionMatrix * centro;
}`,
    fragmentShader: `
varying vec3 vCor;
void main() { gl_FragColor = vec4(vCor, 0.92); }`,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  private malha: InstancedMesh;
  private frac: InstancedBufferAttribute;
  private linha: InstancedBufferAttribute;
  private cor: InstancedBufferAttribute;
  private readonly matriz = new Matrix4();

  constructor(private readonly scene: Scene) {
    [this.malha, this.frac, this.linha, this.cor] = this.criar(256);
  }

  private criar(
    capacidade: number,
  ): [InstancedMesh, InstancedBufferAttribute, InstancedBufferAttribute, InstancedBufferAttribute] {
    const geometria = new PlaneGeometry(1, 1);
    const frac = new InstancedBufferAttribute(new Float32Array(capacidade), 1);
    const linha = new InstancedBufferAttribute(new Float32Array(capacidade), 1);
    const cor = new InstancedBufferAttribute(new Float32Array(capacidade * 3), 3);
    for (const a of [frac, linha, cor]) a.setUsage(DynamicDrawUsage);
    geometria.setAttribute('aFrac', frac);
    geometria.setAttribute('aLinha', linha);
    geometria.setAttribute('aCor', cor);
    const malha = new InstancedMesh(geometria, this.material, capacidade);
    malha.instanceMatrix.setUsage(DynamicDrawUsage);
    malha.frustumCulled = false;
    malha.renderOrder = 10;
    malha.count = 0;
    this.scene.add(malha);
    return [malha, frac, linha, cor];
  }

  /** `pixel`: metros por pixel a 1 m da câmera (2·tan(fov/2) ÷ altura do viewport). */
  sync(corpos: readonly CorpoComBarras[], pixel: number): void {
    this.material.uniforms.uPixel!.value = pixel;
    const necessarias = corpos.reduce((s, c) => s + (c.barras.en !== null ? 4 : 2), 0);
    if (necessarias > this.malha.instanceMatrix.count) {
      let capacidade = this.malha.instanceMatrix.count;
      while (capacidade < necessarias) capacidade *= 2;
      this.scene.remove(this.malha);
      this.malha.geometry.dispose();
      this.malha.dispose();
      [this.malha, this.frac, this.linha, this.cor] = this.criar(capacidade);
    }
    let k = 0;
    const barra = (c: CorpoComBarras, linha: number, fracao: number, cor: number[]) => {
      const h = c.altura + FOLGA_M;
      this.matriz.makeTranslation(c.x + c.cima[0] * h, c.y + c.cima[1] * h, c.z + c.cima[2] * h);
      this.malha.setMatrixAt(k, this.matriz);
      this.frac.setX(k, fracao);
      this.linha.setX(k, linha);
      this.cor.setXYZ(k, cor[0]!, cor[1]!, cor[2]!);
      k++;
    };
    // Fundos antes dos preenchimentos: sem teste de profundidade, vale a ordem das instâncias.
    for (const c of corpos) {
      barra(c, 0, 1, COR_FUNDO);
      if (c.barras.en !== null) barra(c, 1, 1, COR_FUNDO);
    }
    for (const c of corpos) {
      barra(c, 0, c.barras.hp ?? 0, corDoHp(c.barras.hp ?? 0));
      if (c.barras.en !== null) barra(c, 1, c.barras.en, COR_EN);
    }
    this.malha.count = k;
    this.malha.instanceMatrix.needsUpdate = true;
    this.frac.needsUpdate = true;
    this.linha.needsUpdate = true;
    this.cor.needsUpdate = true;
  }
}
