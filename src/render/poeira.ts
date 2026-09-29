/**
 * §14.6/CEN-03: poeira da tempestade de Marte: partículas numa caixa em volta do ponto focal,
 * levadas pelo vento; a opacidade segue a força da tempestade. Só apresentação.
 */
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  type Color,
  Points,
  PointsMaterial,
  Quaternion,
  Vector3,
} from 'three';
import type { Vec3 } from '../sim/map/esfera';

const QUANTIDADE = 3200;
/** Meia largura e altura (m) da caixa de poeira em volta do foco. */
const MEIA_CAIXA_M = 70;
const ALTURA_M = 45;
/** Velocidade do vento (m/s) na apresentação. */
const VENTO_M_S = 22;

/** Grão redondo e macio (sem o quadrado do ponto). */
function grao(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d')!;
  const r = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 32, 32);
  return new CanvasTexture(c);
}

export class Poeira {
  readonly objeto: Points<BufferGeometry, PointsMaterial>;
  private readonly posicoes: Float32Array;
  private readonly giro = new Quaternion();
  private readonly acima = new Vector3(0, 1, 0);

  constructor(cor: Color) {
    this.posicoes = new Float32Array(QUANTIDADE * 3);
    let s = 91;
    const sorte = () => {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 4294967296;
    };
    for (let k = 0; k < QUANTIDADE; k++) {
      this.posicoes[k * 3] = (sorte() * 2 - 1) * MEIA_CAIXA_M;
      this.posicoes[k * 3 + 1] = sorte() * ALTURA_M;
      this.posicoes[k * 3 + 2] = (sorte() * 2 - 1) * MEIA_CAIXA_M;
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(this.posicoes, 3));
    this.objeto = new Points(
      geo,
      new PointsMaterial({
        color: cor.clone().multiplyScalar(1.4),
        size: 0.55,
        map: grao(),
        alphaTest: 0.01,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: AdditiveBlending,
        fog: false,
      }),
    );
    this.objeto.frustumCulled = false;
    this.objeto.visible = false;
    this.objeto.renderOrder = 5;
  }

  /** `forca` 0..1; `foco` (direção) e `pontoFocal` (mundo) orientam a caixa. */
  atualizar(forca: number, foco: Vec3, pontoFocal: Vector3, dt: number): void {
    this.objeto.visible = forca > 0.01;
    if (!this.objeto.visible) return;
    this.objeto.material.opacity = 0.6 * forca;
    this.objeto.position.copy(pontoFocal);
    this.objeto.quaternion.copy(this.giro.setFromUnitVectors(this.acima, new Vector3(...foco)));
    const p = this.posicoes;
    const passo = VENTO_M_S * dt;
    for (let k = 0; k < QUANTIDADE; k++) {
      let x = p[k * 3]! + passo * (0.7 + (k % 7) * 0.08);
      let y = p[k * 3 + 1]! - passo * 0.05;
      if (x > MEIA_CAIXA_M) x -= 2 * MEIA_CAIXA_M;
      if (y < 0) y += ALTURA_M;
      p[k * 3] = x;
      p[k * 3 + 1] = y;
    }
    this.objeto.geometry.attributes.position!.needsUpdate = true;
  }
}
