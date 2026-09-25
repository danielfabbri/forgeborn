/**
 * Partículas (ART-07): faíscas, poeira de regolito, rastros e fumaça num único Points (uma
 * chamada de desenho), com vida, velocidade, cor e tamanho por partícula. A quantidade segue o
 * fator de partículas do preset gráfico (TEC-19). Sem ar na Lua: sem arrasto; a gravidade é
 * fraca e puxa para o centro do planeta.
 */
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  DynamicDrawUsage,
  NormalBlending,
  Points,
  type Scene,
  ShaderMaterial,
} from 'three';

export interface Emissao {
  /** Ponto de origem (mundo). */
  origem: [number, number, number];
  /** Vertical local (unitária) no ponto: a direção preferida do jato. */
  cima: [number, number, number];
  n: number;
  /** Velocidade (m/s) mínima e máxima. */
  velocidade: [number, number];
  /** 0 = só para cima; 1 = em todas as direções. */
  espalhamento: number;
  vida_s: [number, number];
  cor: [number, number, number];
  tamanho: number;
  /** Gravidade (m/s²) para o centro do planeta. */
  gravidade?: number;
}

const vertexShader = /* glsl */ `
  attribute float aVida;
  attribute float aTamanho;
  attribute vec3 aCor;
  varying float vVida;
  varying vec3 vCor;
  void main() {
    vVida = aVida;
    vCor = aCor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aTamanho * 300.0 / max(-mv.z, 0.1);
    gl_Position = projectionMatrix * mv;
  }
`;
const fragmentShader = /* glsl */ `
  varying float vVida;
  varying vec3 vCor;
  void main() {
    if (vVida <= 0.0) discard;
    vec2 c = gl_PointCoord - 0.5;
    float r = length(c);
    if (r > 0.5) discard;
    float alfa = (1.0 - r * 2.0) * clamp(vVida, 0.0, 1.0);
    gl_FragColor = vec4(vCor, alfa);
  }
`;

/** Um conjunto de partículas com um tipo de mistura (faíscas somam luz; poeira cobre). */
class Lote {
  readonly pontos: Points;
  private readonly pos: Float32Array;
  private readonly vel: Float32Array;
  private readonly vida: Float32Array;
  private readonly vidaMax: Float32Array;
  private readonly gravidade: Float32Array;
  private readonly cor: Float32Array;
  private readonly tamanho: Float32Array;
  private proxima = 0;

  constructor(
    scene: Scene,
    private readonly capacidade: number,
    aditiva: boolean,
  ) {
    this.pos = new Float32Array(capacidade * 3);
    this.vel = new Float32Array(capacidade * 3);
    this.vida = new Float32Array(capacidade);
    this.vidaMax = new Float32Array(capacidade).fill(1);
    this.gravidade = new Float32Array(capacidade);
    this.cor = new Float32Array(capacidade * 3);
    this.tamanho = new Float32Array(capacidade);
    const g = new BufferGeometry();
    const attr = (a: Float32Array, n: number) =>
      new BufferAttribute(a, n).setUsage(DynamicDrawUsage);
    g.setAttribute('position', attr(this.pos, 3));
    g.setAttribute('aVida', attr(this.vida, 1));
    g.setAttribute('aCor', attr(this.cor, 3));
    g.setAttribute('aTamanho', attr(this.tamanho, 1));
    this.pontos = new Points(
      g,
      new ShaderMaterial({
        vertexShader,
        fragmentShader,
        transparent: true,
        depthWrite: false,
        blending: aditiva ? AdditiveBlending : NormalBlending,
      }),
    );
    this.pontos.frustumCulled = false;
    scene.add(this.pontos);
  }

  emitir(e: Emissao, sorte: () => number): void {
    for (let k = 0; k < e.n; k++) {
      const i = this.proxima;
      this.proxima = (this.proxima + 1) % this.capacidade;
      // Direção: a vertical local mais um espalhamento aleatório.
      let dx = (sorte() * 2 - 1) * e.espalhamento;
      let dy = (sorte() * 2 - 1) * e.espalhamento;
      let dz = (sorte() * 2 - 1) * e.espalhamento;
      dx += e.cima[0];
      dy += e.cima[1];
      dz += e.cima[2];
      const m = Math.hypot(dx, dy, dz) || 1;
      const v = e.velocidade[0] + sorte() * (e.velocidade[1] - e.velocidade[0]);
      this.pos.set(e.origem, i * 3);
      this.vel.set([(dx / m) * v, (dy / m) * v, (dz / m) * v], i * 3);
      const vida = e.vida_s[0] + sorte() * (e.vida_s[1] - e.vida_s[0]);
      this.vida[i] = 1;
      this.vidaMax[i] = vida;
      this.gravidade[i] = e.gravidade ?? 0;
      this.cor.set(e.cor, i * 3);
      this.tamanho[i] = e.tamanho * (0.6 + sorte() * 0.8);
    }
  }

  atualizar(dt: number): void {
    for (let i = 0; i < this.capacidade; i++) {
      if (this.vida[i]! <= 0) continue;
      this.vida[i]! -= dt / this.vidaMax[i]!;
      const k = i * 3;
      const g = this.gravidade[i]!;
      if (g > 0) {
        const r = Math.hypot(this.pos[k]!, this.pos[k + 1]!, this.pos[k + 2]!) || 1;
        this.vel[k]! -= (this.pos[k]! / r) * g * dt;
        this.vel[k + 1]! -= (this.pos[k + 1]! / r) * g * dt;
        this.vel[k + 2]! -= (this.pos[k + 2]! / r) * g * dt;
      }
      this.pos[k]! += this.vel[k]! * dt;
      this.pos[k + 1]! += this.vel[k + 1]! * dt;
      this.pos[k + 2]! += this.vel[k + 2]! * dt;
    }
    const g = this.pontos.geometry;
    for (const nome of ['position', 'aVida', 'aCor', 'aTamanho']) {
      (g.getAttribute(nome) as BufferAttribute).needsUpdate = true;
    }
  }
}

/** Capacidade base (partículas por lote) no fator 1: apresentação. */
const CAPACIDADE_BASE = 3000;
/** Gravidade da Lua (m/s²) para a poeira e os detritos. */
export const GRAVIDADE_LUA = 1.62;

export class Particulas {
  private readonly faiscas: Lote;
  private readonly poeira: Lote;
  // Apresentação: o sorteio das partículas não é da simulação.
  private readonly sorte = Math.random;

  constructor(
    scene: Scene,
    private readonly fator: () => number,
  ) {
    this.faiscas = new Lote(scene, CAPACIDADE_BASE * 2, true);
    this.poeira = new Lote(scene, CAPACIDADE_BASE * 2, false);
  }

  /** Emite, com a quantidade ajustada pelo fator do preset (TEC-19). */
  emitir(e: Emissao, tipo: 'faisca' | 'poeira'): void {
    const n = Math.round(e.n * this.fator());
    if (n <= 0) return;
    (tipo === 'faisca' ? this.faiscas : this.poeira).emitir({ ...e, n }, this.sorte);
  }

  atualizar(dt: number): void {
    this.faiscas.atualizar(dt);
    this.poeira.atualizar(dt);
  }
}
