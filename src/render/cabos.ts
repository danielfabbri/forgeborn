/**
 * Cabos da rede elétrica (ENE-27, D-85, D-87): fitas finas e pretas no chão entre as estruturas,
 * num traçado orgânico com pequenas curvas em S, sem brilho; e um marcador vermelho piscando sobre as estruturas do
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
} from 'three';
import { arco, normalizar, produtoVetorial, type Vec3 } from '../sim/map/esfera';

/** Largura da fita (m), altura acima do chão (m) e passo entre pontos (m). */
const LARGURA_M = 0.14;
const ELEVACAO_M = 0.1;
const PASSO_M = 0.8;
const MAX_MARCADORES = 64;

export interface CaboDesenhavel {
  a: Vec3;
  b: Vec3;
}

export interface MarcadorSemRede {
  x: number;
  y: number;
  z: number;
  cima: Vec3;
  altura: number;
}

export class CabosRender {
  private malha: Mesh<BufferGeometry, MeshBasicMaterial> | null = null;
  private chave = '';
  private readonly material = new MeshBasicMaterial({ color: '#0a0a0c', side: DoubleSide });

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
    const chave = cabos.map((c) => `${c.a.join(',')}|${c.b.join(',')}`).join(';');
    if (chave !== this.chave) {
      this.chave = chave;
      this.reconstruir(cabos);
    }
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
    const idx: number[] = [];
    for (const cabo of cabos) {
      const a = normalizar(cabo.a);
      const b = normalizar(cabo.b);
      const angulo = arco(a, b);
      const n = Math.max(2, Math.ceil((angulo * this.raio) / PASSO_M) + 1);
      const eixo = normalizar(produtoVetorial(a, b));
      // Forma fixa por cabo: fase e sentido tirados das pontas; curvas a cada ~12 m.
      const comprimento = angulo * this.raio;
      const semente = Math.abs(Math.sin((a[0] + b[1]) * 9127.1 + (a[2] - b[0]) * 3301.7)) * 1000;
      const ondas = Math.max(1, Math.round(comprimento / 12));
      const amplitude = Math.min(0.9, 0.05 * comprimento) * (semente % 2 < 1 ? 1 : -1);
      const fase = (semente % 1) * 0.6;
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
        // O lado da fita é perpendicular ao cabo, no plano do chão.
        const lado: Vec3 = normalizar(produtoVetorial(eixo, d));
        const lat = produtoVetorial(d, lado);
        // ENE-27 (D-87): o cabo serpenteia em S, preso nas pontas (envelope sin(πt)).
        const desvio = amplitude * Math.sin(Math.PI * t) * Math.sin(2 * Math.PI * ondas * t + fase);
        const p: Vec3 = normalizar([
          d[0] + (lat[0] * desvio) / this.raio,
          d[1] + (lat[1] * desvio) / this.raio,
          d[2] + (lat[2] * desvio) / this.raio,
        ]);
        const r = this.raio + this.alturaEm(p) + ELEVACAO_M;
        for (const s of [-1, 1]) {
          pos.push(
            p[0] * r + lat[0] * s * (LARGURA_M / 2),
            p[1] * r + lat[1] * s * (LARGURA_M / 2),
            p[2] * r + lat[2] * s * (LARGURA_M / 2),
          );
        }
        if (k > 0) {
          const i = base + k * 2;
          idx.push(i - 2, i - 1, i, i - 1, i + 1, i);
        }
      }
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
    geo.setIndex(idx);
    this.malha = new Mesh(geo, this.material);
    this.malha.frustumCulled = false;
    this.malha.renderOrder = 1;
    this.scene.add(this.malha);
  }
}
