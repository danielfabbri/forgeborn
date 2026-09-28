/**
 * Cabos da rede elétrica (ENE-27, D-85, D-86): fitas finas e pretas no chão entre as estruturas,
 * com pulsos verde-claros correndo por elas enquanto a rede tem energia; e um marcador vermelho piscando sobre as estruturas do
 * jogador que precisam de energia e estão sem rede (ENE-29). Só apresentação.
 */
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  OctahedronGeometry,
  type Scene,
  ShaderMaterial,
} from 'three';
import { arco, normalizar, produtoVetorial, type Vec3 } from '../sim/map/esfera';

/** Largura da fita (m), altura acima do chão (m) e passo entre pontos (m). */
const LARGURA_M = 0.14;
const ELEVACAO_M = 0.1;
const PASSO_M = 1.5;
const MAX_MARCADORES = 64;

export interface CaboDesenhavel {
  a: Vec3;
  b: Vec3;
  /** A rede do cabo tem energia (o brilho corre por ele)? */
  ligado: boolean;
}

export interface MarcadorSemRede {
  x: number;
  y: number;
  z: number;
  cima: Vec3;
  altura: number;
}

export class CabosRender {
  private malha: Mesh<BufferGeometry, ShaderMaterial> | null = null;
  private chave = '';
  private readonly material = new ShaderMaterial({
    uniforms: { uTempo: { value: 0 } },
    vertexShader: `attribute float aLigado; attribute float aAo;
      varying float vLigado; varying float vAo;
      void main() {
        vLigado = aLigado; vAo = aAo;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `uniform float uTempo; varying float vLigado; varying float vAo;
      void main() {
        // Cabo preto; com energia, pulsos verde-claros correm por ele.
        float pulso = pow(max(sin(vAo * 0.35 - uTempo * 6.0), 0.0), 10.0) * vLigado;
        vec3 cor = mix(vec3(0.015, 0.016, 0.018), vec3(0.55, 1.0, 0.6), pulso);
        gl_FragColor = vec4(cor, 1.0);
      }`,
    side: DoubleSide,
  });
  private readonly marcadores: InstancedMesh;
  private readonly matriz = new Matrix4();

  constructor(
    private readonly scene: Scene,
    private readonly raio: number,
    private readonly alturaEm: (d: Vec3) => number,
  ) {
    this.marcadores = new InstancedMesh(
      new OctahedronGeometry(0.45),
      new MeshBasicMaterial({ color: new Color('#ff4a3d'), transparent: true, opacity: 0.9 }),
      MAX_MARCADORES,
    );
    this.marcadores.count = 0;
    this.marcadores.frustumCulled = false;
    this.marcadores.renderOrder = 9;
    scene.add(this.marcadores);
  }

  /** Refaz as fitas só quando a lista de cabos muda. */
  sync(cabos: readonly CaboDesenhavel[], semRede: readonly MarcadorSemRede[], agora: number): void {
    const chave = cabos.map((c) => `${c.a.join(',')}|${c.b.join(',')}|${c.ligado}`).join(';');
    if (chave !== this.chave) {
      this.chave = chave;
      this.reconstruir(cabos);
    }
    this.material.uniforms.uTempo!.value = agora / 1000;
    // ENE-29: marcadores de sem rede, piscando.
    const aceso = Math.sin(agora / 180) > -0.2;
    const n = aceso ? Math.min(semRede.length, MAX_MARCADORES) : 0;
    for (let k = 0; k < n; k++) {
      const m = semRede[k]!;
      const h = m.altura + 1.4;
      this.matriz.makeTranslation(m.x + m.cima[0] * h, m.y + m.cima[1] * h, m.z + m.cima[2] * h);
      this.marcadores.setMatrixAt(k, this.matriz);
    }
    this.marcadores.count = n;
    this.marcadores.instanceMatrix.needsUpdate = true;
  }

  private reconstruir(cabos: readonly CaboDesenhavel[]): void {
    if (this.malha) {
      this.scene.remove(this.malha);
      this.malha.geometry.dispose();
      this.malha = null;
    }
    if (cabos.length === 0) return;
    const pos: number[] = [];
    const ligado: number[] = [];
    const ao: number[] = [];
    const idx: number[] = [];
    for (const cabo of cabos) {
      const a = normalizar(cabo.a);
      const b = normalizar(cabo.b);
      const angulo = arco(a, b);
      const n = Math.max(2, Math.ceil((angulo * this.raio) / PASSO_M) + 1);
      const eixo = normalizar(produtoVetorial(a, b));
      const base = pos.length / 3;
      for (let k = 0; k < n; k++) {
        const t = k / (n - 1);
        // Ponto no arco de grande círculo (slerp).
        const s0 = Math.sin((1 - t) * angulo) / Math.sin(angulo || 1e-9);
        const s1 = Math.sin(t * angulo) / Math.sin(angulo || 1e-9);
        const d =
          angulo < 1e-9
            ? a
            : normalizar([a[0] * s0 + b[0] * s1, a[1] * s0 + b[1] * s1, a[2] * s0 + b[2] * s1]);
        const r = this.raio + this.alturaEm(d) + ELEVACAO_M;
        // O lado da fita é perpendicular ao cabo, no plano do chão.
        const lado: Vec3 = normalizar(produtoVetorial(eixo, d));
        const lat = produtoVetorial(d, lado);
        for (const s of [-1, 1]) {
          pos.push(
            d[0] * r + lat[0] * s * (LARGURA_M / 2),
            d[1] * r + lat[1] * s * (LARGURA_M / 2),
            d[2] * r + lat[2] * s * (LARGURA_M / 2),
          );
          ligado.push(cabo.ligado ? 1 : 0);
          ao.push(t * angulo * this.raio);
        }
        if (k > 0) {
          const i = base + k * 2;
          idx.push(i - 2, i - 1, i, i - 1, i + 1, i);
        }
      }
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
    geo.setAttribute('aLigado', new BufferAttribute(new Float32Array(ligado), 1));
    geo.setAttribute('aAo', new BufferAttribute(new Float32Array(ao), 1));
    geo.setIndex(idx);
    this.malha = new Mesh(geo, this.material);
    this.malha.frustumCulled = false;
    this.malha.renderOrder = 1;
    this.scene.add(this.malha);
  }
}
