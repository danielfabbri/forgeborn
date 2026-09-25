/**
 * UI-11: no modo daltônico, o emblema geométrico da nação (`emblema` de `dados:nacoes`) aparece
 * sobre a tarja de cada corpo, deitado no topo do modelo, na cor da paleta. Um lote instanciado
 * por forma (quatro chamadas de desenho).
 */
import {
  Color,
  DoubleSide,
  DynamicDrawUsage,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  type Scene,
  Shape,
  ShapeGeometry,
  Vector3,
} from 'three';
import { contornoDe, corDaNacao, type Emblema, emblemaDe } from '../game/paleta';
import { norteEm } from '../sim/map/esfera';
import type { CorpoDesenhado } from './unidades';

const FORMAS: readonly Emblema[] = ['estrela', 'circulo', 'triangulo', 'losango'];
const CAPACIDADE = 512;

export class EmblemasRender {
  private readonly lotes = new Map<Emblema, InstancedMesh>();
  private readonly matriz = new Matrix4();
  private readonly frente = new Vector3();
  private readonly cima = new Vector3();
  private readonly lado = new Vector3();
  private readonly cor = new Color();

  constructor(scene: Scene) {
    for (const forma of FORMAS) {
      const contorno = contornoDe(forma);
      const shape = new Shape();
      contorno.forEach(([x, y], k) => (k === 0 ? shape.moveTo(x, y) : shape.lineTo(x, y)));
      // Deitado no plano xz (a vertical local do modelo é +y).
      const geometria = new ShapeGeometry(shape).rotateX(-Math.PI / 2);
      const malha = new InstancedMesh(
        geometria,
        new MeshBasicMaterial({ side: DoubleSide, toneMapped: false }),
        CAPACIDADE,
      );
      malha.instanceMatrix.setUsage(DynamicDrawUsage);
      malha.frustumCulled = false;
      malha.count = 0;
      scene.add(malha);
      this.lotes.set(forma, malha);
    }
  }

  /** `ligado`: só no modo daltônico. */
  sync(corpos: readonly CorpoDesenhado[], ligado: boolean): void {
    const usados = new Map<Emblema, number>();
    if (ligado) {
      for (const c of corpos) {
        if (!c.nacao || c.tipo === 'mine') continue;
        const forma = emblemaDe(c.nacao);
        const lote = this.lotes.get(forma)!;
        const k = usados.get(forma) ?? 0;
        if (k >= CAPACIDADE) continue;
        this.cima.set(...c.cima);
        this.frente.set(...norteEm(c.cima));
        this.lado.crossVectors(this.frente, this.cima);
        const escala = Math.min(1.1, Math.max(0.35, c.raio * 0.45));
        this.matriz
          .makeBasis(this.frente, this.cima, this.lado)
          .scale(new Vector3(escala, 1, escala));
        const alto = c.altura + 0.15;
        this.matriz.setPosition(
          c.x + c.cima[0] * alto,
          c.y + c.cima[1] * alto,
          c.z + c.cima[2] * alto,
        );
        lote.setMatrixAt(k, this.matriz);
        lote.setColorAt(k, this.cor.set(corDaNacao(c.nacao)));
        usados.set(forma, k + 1);
      }
    }
    for (const [forma, lote] of this.lotes) {
      lote.count = usados.get(forma) ?? 0;
      lote.instanceMatrix.needsUpdate = true;
      if (lote.instanceColor) lote.instanceColor.needsUpdate = true;
    }
  }
}
