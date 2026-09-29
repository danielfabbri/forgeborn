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
import { dados, type EstruturasId, param } from '../sim/data';
import { geometriaDoModelo } from './modelos';
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
  /** Silhueta em wireframe do modelo, girada como a estrutura ficará. */
  private readonly materialSilhueta = new MeshBasicMaterial({
    wireframe: true,
    transparent: true,
    opacity: 0.45,
    depthWrite: false,
  });
  private readonly silhueta = new Mesh(new BufferGeometry(), this.materialSilhueta);
  private tipoDaSilhueta: EstruturasId | null = null;

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
    this.silhueta.matrixAutoUpdate = false;
    this.silhueta.frustumCulled = false;
    this.grupo.add(base, this.visao, this.alcance, this.silhueta);
    this.grupo.visible = false;
    scene.add(this.grupo);
  }

  /** `rumo`: frente de Muro e Portão (D-56); as demais seguem o norte local. */
  mostrar(tipo: EstruturasId, d: Vec3, valido: boolean, rumo: Vec3 | null = null): void {
    const estrutura = dados.estruturas.find((e) => e.id === tipo)!;
    const cor = valido ? VERDE : VERMELHO;
    this.materialPegada.color.copy(cor);
    this.materialBorda.color.copy(cor);
    this.materialSilhueta.color.copy(cor);

    // Base local: +x = norte (a pegada se alinha ao norte local, PRD-10) ou o rumo do segmento
    // (D-56), +y = vertical.
    const frente = rumo ?? norteEm(d);
    const lado = produtoVetorial(frente, d);
    const r = this.raio + this.chao(d) + ELEVACAO_M;
    this.matriz.makeBasis(new Vector3(...frente), new Vector3(...d), new Vector3(...lado));
    this.matriz.setPosition(d[0] * r, d[1] * r, d[2] * r);
    this.silhueta.matrix.copy(this.matriz);
    if (this.tipoDaSilhueta !== tipo) {
      this.silhueta.geometry = geometriaDoModelo(tipo);
      this.tipoDaSilhueta = tipo;
    }
    const largura = rumo ? param('muro_espessura_m') : estrutura.pegada_m;
    this.matriz.scale(new Vector3(estrutura.pegada_m, 1, largura));
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
