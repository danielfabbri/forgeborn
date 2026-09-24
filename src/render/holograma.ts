/**
 * Holograma de posicionamento (UI-08): a pegada da estrutura em verde (válido) ou vermelho
 * (inválido), com o raio de visão e o de alcance da arma desenhados rente ao chão.
 */
import {
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineLoop,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  type Scene,
  Vector3,
} from 'three';
import { dados, type EstruturasId } from '../sim/data';
import { avancar, girar, norteEm, produtoVetorial, type Vec3 } from '../sim/map/esfera';

const VERDE = new Color('#46e08a');
const VERMELHO = new Color('#ff4d4d');
const COR_VISAO = new Color('#9fd3ff');
const COR_ALCANCE = new Color('#ffb347');
/** Folga (m) acima do chão, para o holograma não brigar com o terreno. */
const ELEVACAO_M = 0.15;
const SEGMENTOS_ANEL = 96;

export class HologramaRender {
  private readonly grupo = new Group();
  private readonly materialPegada = new MeshBasicMaterial({
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
    side: DoubleSide,
  });
  private readonly materialBorda = new LineBasicMaterial({ transparent: true, opacity: 0.95 });
  private readonly pegada = new Mesh(new PlaneGeometry(1, 1), this.materialPegada);
  private readonly borda: LineLoop;
  private readonly visao: LineLoop;
  private readonly alcance: LineLoop;
  private readonly matriz = new Matrix4();

  constructor(
    scene: Scene,
    private readonly raio: number,
    private readonly chao: (d: Vec3) => number,
  ) {
    const quadrado = new BufferGeometry();
    quadrado.setAttribute(
      'position',
      new Float32BufferAttribute([-0.5, 0, -0.5, 0.5, 0, -0.5, 0.5, 0, 0.5, -0.5, 0, 0.5], 3),
    );
    this.borda = new LineLoop(quadrado, this.materialBorda);
    this.pegada.geometry.rotateX(-Math.PI / 2);
    this.pegada.renderOrder = 2;
    this.visao = anel(COR_VISAO);
    this.alcance = anel(COR_ALCANCE);
    const base = new Group();
    base.add(this.pegada, this.borda);
    base.matrixAutoUpdate = false;
    this.grupo.add(base, this.visao, this.alcance);
    this.grupo.visible = false;
    scene.add(this.grupo);
  }

  mostrar(tipo: EstruturasId, d: Vec3, valido: boolean): void {
    const estrutura = dados.estruturas.find((e) => e.id === tipo)!;
    const cor = valido ? VERDE : VERMELHO;
    this.materialPegada.color.copy(cor);
    this.materialBorda.color.copy(cor);

    // Base local: +x = norte (a pegada se alinha ao norte local, PRD-10), +y = vertical.
    const norte = norteEm(d);
    const lado = produtoVetorial(norte, d);
    const r = this.raio + this.chao(d) + ELEVACAO_M;
    this.matriz.makeBasis(new Vector3(...norte), new Vector3(...d), new Vector3(...lado));
    this.matriz.scale(new Vector3(estrutura.pegada_m, 1, estrutura.pegada_m));
    this.matriz.setPosition(d[0] * r, d[1] * r, d[2] * r);
    const base = this.grupo.children[0]!;
    base.matrix.copy(this.matriz);

    this.contornar(this.visao, d, estrutura.visao_m);
    const arma = estrutura.arma ? dados.armas.find((a) => a.id === estrutura.arma) : undefined;
    this.alcance.visible = arma !== undefined;
    if (arma) this.contornar(this.alcance, d, arma.alcance_m);
    this.grupo.visible = true;
  }

  esconder(): void {
    this.grupo.visible = false;
  }

  /** Anel de raio `metros` em volta de d, seguindo o relevo. */
  private contornar(linha: LineLoop, d: Vec3, metros: number): void {
    const pos = linha.geometry.getAttribute('position') as Float32BufferAttribute;
    const norte = norteEm(d);
    for (let k = 0; k < SEGMENTOS_ANEL; k++) {
      const rumo = girar(norte, d, (k / SEGMENTOS_ANEL) * Math.PI * 2);
      const p = avancar(d, rumo, metros / this.raio).p;
      const r = this.raio + this.chao(p) + ELEVACAO_M;
      pos.setXYZ(k, p[0] * r, p[1] * r, p[2] * r);
    }
    pos.needsUpdate = true;
    linha.geometry.computeBoundingSphere();
  }
}

function anel(cor: Color): LineLoop {
  const geometria = new BufferGeometry();
  geometria.setAttribute(
    'position',
    new Float32BufferAttribute(new Float32Array(SEGMENTOS_ANEL * 3), 3),
  );
  const linha = new LineLoop(
    geometria,
    new LineBasicMaterial({ color: cor, transparent: true, opacity: 0.7 }),
  );
  linha.frustumCulled = false;
  return linha;
}
