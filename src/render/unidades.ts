/**
 * Desenho de unidades, estruturas e minas com instancing: um InstancedMesh por tipo, com a
 * cor da nação como atributo de instância (TEC-16) acendendo a tarja e o olho (ART-02).
 */
import {
  type BufferGeometry,
  Color,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  type Scene,
  Vector3,
} from 'three';
import { dados, type EntityId, entitiesWith, getComponent, type SimState } from '../sim';
import type { PositionHistory, Vec3 } from './interpolation';
import { geometriaDoModelo, type TipoDeModelo } from './modelos';

/** Corpo desenhado neste quadro, na posição interpolada; usado também pela seleção. */
export interface CorpoDesenhado {
  id: EntityId;
  tipo: TipoDeModelo;
  nacao: string | null;
  movel: boolean;
  x: number;
  y: number;
  z: number;
  /** Raio para seleção e anel (m). */
  raio: number;
  /** Altura aproximada do modelo (m), para o centro de clique. */
  altura: number;
}

const CAPACIDADE_INICIAL = 32;
const INTENSIDADE_EMISSIVA = 1.8;

function criarMaterial(): MeshStandardMaterial {
  const material = new MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.75,
    metalness: 0.3,
  });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute float aEmis;
attribute vec3 aCorNacao;
varying float vEmis;
varying vec3 vCorNacao;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vEmis = aEmis;
vCorNacao = aCorNacao;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying float vEmis;
varying vec3 vCorNacao;`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
if (vEmis > 0.5) {
  vec3 brilho = vEmis > 1.5 ? vColor.rgb : vCorNacao;
  diffuseColor.rgb = brilho * 0.35;
  totalEmissiveRadiance += brilho * ${INTENSIDADE_EMISSIVA.toFixed(2)};
}`,
      );
  };
  return material;
}

class Lote {
  malha: InstancedMesh;
  cores: InstancedBufferAttribute;
  usados = 0;

  constructor(
    private readonly scene: Scene,
    private readonly geometriaBase: BufferGeometry,
    private readonly material: MeshStandardMaterial,
    capacidade: number,
  ) {
    [this.malha, this.cores] = this.criar(capacidade);
  }

  private criar(capacidade: number): [InstancedMesh, InstancedBufferAttribute] {
    // Cada lote tem a sua cópia rasa da geometria, para carregar o atributo de instância.
    const geometria = this.geometriaBase.clone();
    const cores = new InstancedBufferAttribute(new Float32Array(capacidade * 3), 3);
    cores.setUsage(DynamicDrawUsage);
    geometria.setAttribute('aCorNacao', cores);
    const malha = new InstancedMesh(geometria, this.material, capacidade);
    malha.instanceMatrix.setUsage(DynamicDrawUsage);
    malha.castShadow = true;
    malha.receiveShadow = true;
    // As instâncias se espalham pelo mapa; a esfera da geometria base não serve para culling.
    malha.frustumCulled = false;
    malha.count = 0;
    this.scene.add(malha);
    return [malha, cores];
  }

  garantir(n: number): void {
    if (n <= this.malha.instanceMatrix.count) return;
    let capacidade = this.malha.instanceMatrix.count;
    while (capacidade < n) capacidade *= 2;
    this.scene.remove(this.malha);
    this.malha.geometry.dispose();
    this.malha.dispose();
    [this.malha, this.cores] = this.criar(capacidade);
  }
}

export class UnidadesRender {
  private readonly material = criarMaterial();
  private readonly lotes = new Map<TipoDeModelo, Lote>();
  private readonly corDaNacao = new Map<string, Color>();
  private readonly scratch: Vec3 = { x: 0, y: 0, z: 0 };
  private readonly matriz = new Matrix4();
  private readonly quat = new Quaternion();
  private readonly eixoY = new Vector3(0, 1, 0);
  private readonly pos = new Vector3();
  private readonly escala = new Vector3(1, 1, 1);
  /** Corpos desenhados no último quadro, em ordem de ID. */
  readonly corpos: CorpoDesenhado[] = [];
  private readonly porId = new Map<EntityId, CorpoDesenhado>();

  constructor(private readonly scene: Scene) {}

  sync(state: SimState, history: PositionHistory, alpha: number): void {
    this.corpos.length = 0;
    this.porId.clear();
    const porTipo = new Map<TipoDeModelo, Array<{ corpo: CorpoDesenhado; heading: number }>>();
    for (const id of entitiesWith(state, 'position')) {
      const unidade = getComponent(state, id, 'unit');
      const estrutura = getComponent(state, id, 'structure');
      const mina = getComponent(state, id, 'mine');
      const tipo: TipoDeModelo | null = unidade
        ? unidade.tipo
        : estrutura
          ? estrutura.tipo
          : mina
            ? 'mine'
            : null;
      if (!tipo) continue;
      const p = history.interpolate(id, getComponent(state, id, 'position')!, alpha, this.scratch);
      const loc = getComponent(state, id, 'locomotion');
      const heading = loc ? history.interpolateHeading(id, loc.heading, alpha) : 0;
      const corpo: CorpoDesenhado = {
        id,
        tipo,
        nacao: getComponent(state, id, 'owner')?.nacao ?? null,
        movel: unidade !== undefined,
        x: p.x,
        y: p.y,
        z: p.z,
        raio: raioDe(tipo),
        altura: alturaDe(tipo),
      };
      this.corpos.push(corpo);
      this.porId.set(id, corpo);
      let lista = porTipo.get(tipo);
      if (!lista) porTipo.set(tipo, (lista = []));
      lista.push({ corpo, heading });
    }

    for (const lote of this.lotes.values()) lote.usados = 0;
    for (const [tipo, lista] of porTipo) {
      const lote = this.lote(tipo);
      lote.garantir(lista.length);
      lista.forEach(({ corpo, heading }, k) => {
        // Heading 0 aponta para +x; em three, girar θ em y leva +x para (cos θ, −sin θ).
        this.quat.setFromAxisAngle(this.eixoY, -heading);
        this.pos.set(corpo.x, corpo.y, corpo.z);
        this.matriz.compose(this.pos, this.quat, this.escala);
        lote.malha.setMatrixAt(k, this.matriz);
        this.cor(corpo.nacao).toArray(lote.cores.array, k * 3);
      });
      lote.usados = lista.length;
    }
    for (const lote of this.lotes.values()) {
      lote.malha.count = lote.usados;
      lote.malha.instanceMatrix.needsUpdate = true;
      lote.cores.needsUpdate = true;
    }
  }

  get(id: EntityId): CorpoDesenhado | undefined {
    return this.porId.get(id);
  }

  private lote(tipo: TipoDeModelo): Lote {
    let lote = this.lotes.get(tipo);
    if (!lote) {
      lote = new Lote(this.scene, geometriaDoModelo(tipo), this.material, CAPACIDADE_INICIAL);
      this.lotes.set(tipo, lote);
    }
    return lote;
  }

  private cor(nacao: string | null): Color {
    const chave = nacao ?? '';
    let cor = this.corDaNacao.get(chave);
    if (!cor) {
      const hex = dados.nacoes.find((n) => n.id === nacao)?.cor ?? '#888888';
      cor = new Color(hex);
      this.corDaNacao.set(chave, cor);
    }
    return cor;
  }
}

/** Raio de seleção: o de colisão para móveis; metade da pegada para estruturas. */
export function raioDe(tipo: TipoDeModelo): number {
  if (tipo === 'mine') return 0.6;
  const movel = dados.moveis.find((m) => m.id === tipo);
  if (movel) return movel.raio_m;
  const estrutura = dados.estruturas.find((e) => e.id === tipo)!;
  return estrutura.pegada_m / 2;
}

export function alturaDe(tipo: TipoDeModelo): number {
  const geo = geometriaDoModelo(tipo);
  if (!geo.boundingBox) geo.computeBoundingBox();
  return geo.boundingBox!.max.y;
}
