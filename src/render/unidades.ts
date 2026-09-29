/**
 * Desenho de unidades, estruturas e minas com instancing: um InstancedMesh por tipo, com a
 * cor da nação como atributo de instância (TEC-16) acendendo a tarja e o olho (ART-02).
 * Estrutura em obra (ART-06, versão simples): o modelo cresce de baixo para cima com o
 * progresso, dentro do holograma em wireframe da estrutura final.
 */
import { configuracoes } from '../game/configuracoes';
import { corDaNacao } from '../game/paleta';
import {
  type BufferGeometry,
  Color,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedMesh,
  type Material,
  Matrix4,
  MeshBasicMaterial,
  MeshStandardMaterial,
  type Scene,
  Vector3,
} from 'three';
import {
  dados,
  type EntityId,
  entitiesWith,
  getComponent,
  param,
  type SimEvent,
  type SimState,
} from '../sim';
import type { PositionHistory, Vec3 } from './interpolation';
import { norteEm } from '../sim/map/esfera';
import type { Fantasma } from './fantasmas';
import {
  ANGULO_RAMPA_ABERTA,
  ANGULO_RAMPA_FECHADA,
  DOBRADICA_DA_RAMPA,
  geometriaDaFolha,
  geometriaDaTorre,
  geometriaDoCorpo,
  pivoDaTorre,
  temTorre,
  geometriaDaRampa,
  geometriaDoModelo,
  type TipoDeModelo,
} from './modelos';

/** Corpo desenhado neste quadro, na posição interpolada; usado também pela seleção. */
export interface CorpoDesenhado {
  id: EntityId;
  tipo: TipoDeModelo;
  nacao: string | null;
  movel: boolean;
  x: number;
  y: number;
  z: number;
  /** Vertical local (unitária). */
  cima: [number, number, number];
  /** Raio para seleção e anel (m). */
  raio: number;
  /** Altura aproximada do modelo (m), para o centro de clique. */
  altura: number;
}

const CAPACIDADE_INICIAL = 32;
const INTENSIDADE_EMISSIVA = 1.8;
/** ART-06 (apresentação): duração da impressão de uma unidade na tela e a faixa da linha. */
const IMPRESSAO_MS = 1200;
const FAIXA_DA_LINHA_M = 0.07;
/** D-51 (apresentação): altura do satélite sobre o chão e a suavização por quadro. */
const ALTURA_DA_ORBITA_M = 38;
const SUAVIZACAO_DO_SATELITE = 0.2;
/** ART-12 (apresentação): velocidade de giro das torres. */
const VELOCIDADE_DA_TORRE_RAD_S = 4;
/** ENE-24 (apresentação): brilho da Bateria Móvel ligada e desligada. */
const BRILHO_LIGADA = 2.2;
const BRILHO_DESLIGADA = 0.12;
/** UNI-09 (apresentação): altura da soleira e da folha do Portão. */
const ALTURA_DA_SOLEIRA_M = 0.3;
const ALTURA_DA_FOLHA_M = 3.3;
const TEMPO_DE_LANCAMENTO_S = () => param('tempo_lancamento_satelite_s');

export function criarMaterial(): MeshStandardMaterial {
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
attribute float aCorte;
attribute vec3 aMat;
attribute float aDesgaste;
varying float vEmis;
varying vec3 vCorNacao;
varying float vCorte;
varying float vYLocal;
varying vec3 vMat;
varying float vDesgaste;
varying vec3 vPosLocal;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vEmis = aEmis;
vCorNacao = aCorNacao;
vCorte = aCorte;
vYLocal = position.y;
vMat = aMat;
vDesgaste = aDesgaste;
vPosLocal = position;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying float vEmis;
varying vec3 vCorNacao;
varying float vCorte;
varying float vYLocal;
varying vec3 vMat;
varying float vDesgaste;
varying vec3 vPosLocal;
// Ruído de valor 3D barato para o desgaste (D-45).
float ruido3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n = dot(i, vec3(1.0, 57.0, 113.0));
  vec4 a = fract(sin(vec4(n, n + 1.0, n + 57.0, n + 58.0)) * 43758.5453);
  vec4 b = fract(sin(vec4(n + 113.0, n + 114.0, n + 170.0, n + 171.0)) * 43758.5453);
  vec4 c = mix(a, b, f.z);
  vec2 d = mix(c.xy, c.zw, f.y);
  return mix(d.x, d.y, f.x);
}`,
      )
      // ART-02/D-45: PBR por parte, juntas de painel e desgaste nas bordas chanfradas.
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
float desgaste = 0.0;
if (vEmis < 0.5 && vMat.x > 0.0) {
  roughnessFactor = vMat.x;
  desgaste = vDesgaste * smoothstep(0.35, 0.6, ruido3(vPosLocal * 4.0));
  roughnessFactor = mix(roughnessFactor, 0.3, desgaste);
}`,
      )
      .replace(
        '#include <metalnessmap_fragment>',
        `#include <metalnessmap_fragment>
if (vEmis < 0.5 && vMat.x > 0.0) {
  metalnessFactor = mix(vMat.y, 0.95, desgaste);
  // Metal exposto nas bordas gastas.
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.62, 0.63, 0.66), desgaste * 0.8);
  // Juntas de painel: linhas finas a cada 0,6 m nas superfícies pintadas.
  if (vMat.z > 0.5) {
    vec3 g = abs(fract(vPosLocal / 0.6) - 0.5);
    float junta = 1.0 - smoothstep(0.0, 0.025, 0.5 - max(max(g.x, g.y), g.z));
    diffuseColor.rgb *= 1.0 - junta * 0.35;
  }
}`,
      )
      // ART-06: plano de corte da impressão (aCorte > 0; 0 = peça inteira).
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
if (vCorte > 0.0 && vYLocal > vCorte) discard;`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
if (vCorte > 0.0 && vCorte - vYLocal < ${FAIXA_DA_LINHA_M.toFixed(2)}) {
  totalEmissiveRadiance += mix(vCorNacao, vec3(1.0, 0.85, 0.6), 0.5) * 1.4;
}
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
  cortes!: InstancedBufferAttribute;
  usados = 0;

  constructor(
    private readonly scene: Scene,
    private readonly geometriaBase: BufferGeometry,
    private readonly material: Material,
    capacidade: number,
    private readonly sombras = true,
  ) {
    [this.malha, this.cores] = this.criar(capacidade);
  }

  private criar(capacidade: number): [InstancedMesh, InstancedBufferAttribute] {
    // Cada lote tem a sua cópia rasa da geometria, para carregar o atributo de instância.
    const geometria = this.geometriaBase.clone();
    const cores = new InstancedBufferAttribute(new Float32Array(capacidade * 3), 3);
    cores.setUsage(DynamicDrawUsage);
    geometria.setAttribute('aCorNacao', cores);
    // ART-06: altura do corte da impressão por instância (0 = inteira).
    this.cortes = new InstancedBufferAttribute(new Float32Array(capacidade), 1);
    this.cortes.setUsage(DynamicDrawUsage);
    geometria.setAttribute('aCorte', this.cortes);
    const malha = new InstancedMesh(geometria, this.material, capacidade);
    malha.instanceMatrix.setUsage(DynamicDrawUsage);
    malha.castShadow = this.sombras;
    malha.receiveShadow = this.sombras;
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
  private readonly materialHolograma = new MeshBasicMaterial({
    color: '#7fd6ff',
    wireframe: true,
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
  });
  private readonly lotes = new Map<TipoDeModelo, Lote>();
  private readonly hologramas = new Map<TipoDeModelo, Lote>();
  /** ART-06: unidades impressas e quando a impressão começou na tela (ms). */
  private readonly impressoes = new Map<EntityId, number>();
  /** Onde está a linha de impressão de cada peça em impressão neste quadro (mundo). */
  readonly linhasDeImpressao: Array<{
    x: number;
    y: number;
    z: number;
    cima: [number, number, number];
    raio: number;
  }> = [];
  /** FLX-09: abertura da rampa de cada Nave (0 fechada, 1 aberta; sem entrada, aberta). */
  readonly aberturaDaRampa = new Map<EntityId, number>();
  /** FLX-09: deslocamento só visual (mundo) de um corpo, para a cinemática de pouso. */
  readonly deslocamentoVisual = new Map<EntityId, [number, number, number]>();
  private loteDaRampa: Lote | null = null;
  private loteDaFolha: Lote | null = null;
  /** ART-12: torres por tipo e o giro atual (rad) de cada corpo. */
  private readonly lotesDeTorre = new Map<TipoDeModelo, Lote>();
  private readonly giroDaTorre = new Map<EntityId, number>();
  private ultimoGiro = performance.now();
  /** ENE-24 (D-59): fator do brilho na cor da nação (Bateria Móvel ligada ou desligada). */
  private readonly brilho = new Map<EntityId, number>();
  private readonly corBrilho = new Color();
  /** D-51: posição suavizada de cada satélite desenhado. */
  private readonly posicaoDosSatelites = new Map<EntityId, [number, number, number]>();
  /** Corpo que não é desenhado (o pilotado em 1ª pessoa). */
  oculto: EntityId | null = null;
  /** VIS-04: fantasmas em cinza translúcido. */
  private readonly materialFantasma = new MeshStandardMaterial({
    color: '#8a8f99',
    transparent: true,
    opacity: 0.45,
    depthWrite: false,
    roughness: 0.9,
  });
  private readonly fantasmas = new Map<TipoDeModelo, Lote>();
  private readonly corDaNacao = new Map<string, Color>();
  private readonly scratch: Vec3 = { x: 0, y: 0, z: 0 };
  private readonly scratchRumo: Vec3 = { x: 0, y: 0, z: 0 };
  private readonly matriz = new Matrix4();
  private readonly frente = new Vector3();
  private readonly cima = new Vector3();
  private readonly lado = new Vector3();
  /** Corpos desenhados no último quadro, em ordem de ID. */
  readonly corpos: CorpoDesenhado[] = [];
  private readonly porId = new Map<EntityId, CorpoDesenhado>();

  /**
   * `jogador`: minas de outras nações não são desenhadas (CMB-19; a detecção chega com a
   * T-065).
   */
  constructor(
    private readonly scene: Scene,
    private readonly jogador: string | null = null,
  ) {}

  /**
   * `visivel`: corpos que o jogador vê agora (VIS-01; os outros não são desenhados nem
   * selecionáveis). `fantasmas`: estruturas inimigas lembradas (VIS-04).
   */
  sync(
    state: SimState,
    history: PositionHistory,
    alpha: number,
    visivel: ((id: EntityId) => boolean) | null = null,
    fantasmas: readonly Fantasma[] = [],
  ): void {
    this.corpos.length = 0;
    this.linhasDeImpressao.length = 0;
    this.brilho.clear();
    this.porId.clear();
    type Desenho = { corpo: CorpoDesenhado; frente: Vec3 | null; corte: number };
    const porTipo = new Map<TipoDeModelo, Desenho[]>();
    const emObra = new Map<TipoDeModelo, Desenho[]>();
    const lembrados = new Map<TipoDeModelo, Desenho[]>();
    for (const f of fantasmas) {
      const r = Math.hypot(f.x, f.y, f.z) || 1;
      const tipo = f.tipo as TipoDeModelo;
      const corpo: CorpoDesenhado = {
        id: f.id,
        tipo,
        nacao: f.nacao,
        movel: false,
        x: f.x,
        y: f.y,
        z: f.z,
        cima: [f.x / r, f.y / r, f.z / r],
        raio: raioDe(tipo),
        altura: alturaDe(tipo),
      };
      let lista = lembrados.get(tipo);
      if (!lista) lembrados.set(tipo, (lista = []));
      lista.push({ corpo, frente: null, corte: 0 });
    }
    for (const id of entitiesWith(state, 'position')) {
      if (visivel && !visivel(id)) continue;
      const unidade = getComponent(state, id, 'unit');
      const estrutura = getComponent(state, id, 'structure');
      const mina = getComponent(state, id, 'mine');
      if (
        mina &&
        !visivel &&
        this.jogador &&
        getComponent(state, id, 'owner')?.nacao !== this.jogador
      )
        continue;
      const tipo: TipoDeModelo | null = unidade
        ? unidade.tipo
        : estrutura
          ? estrutura.tipo
          : mina
            ? 'mine'
            : null;
      if (!tipo) continue;
      // CMB-28: hover recolhido está dentro do abrigo.
      if (getComponent(state, id, 'abrigo')?.estado === 'dentro') continue;
      // UNI-20: a unidade embarcada não aparece (vai no Transporte).
      if (getComponent(state, id, 'embarcado')) continue;
      const p = history.interpolate(id, getComponent(state, id, 'position')!, alpha, this.scratch);
      const loc = getComponent(state, id, 'locomotion');
      // UNI-08: segmento de muro em linha guarda a própria frente.
      const frente = loc
        ? { ...history.interpolateRumo(id, loc.rumo, alpha, this.scratchRumo) }
        : estrutura?.rumo
          ? { x: estrutura.rumo[0], y: estrutura.rumo[1], z: estrutura.rumo[2] }
          : null;
      const deslocamento = this.deslocamentoVisual.get(id);
      if (deslocamento) {
        p.x += deslocamento[0];
        p.y += deslocamento[1];
        p.z += deslocamento[2];
      }
      const r = Math.hypot(p.x, p.y, p.z) || 1;
      const corpo: CorpoDesenhado = {
        id,
        tipo,
        nacao: getComponent(state, id, 'owner')?.nacao ?? null,
        movel: unidade !== undefined,
        x: p.x,
        y: p.y,
        z: p.z,
        cima: [p.x / r, p.y / r, p.z / r],
        raio: raioDe(tipo),
        altura: alturaDe(tipo),
      };
      this.corpos.push(corpo);
      this.porId.set(id, corpo);
      const obra = getComponent(state, id, 'obra');
      if (obra) {
        let holos = emObra.get(tipo);
        if (!holos) emObra.set(tipo, (holos = []));
        holos.push({ corpo, frente, corte: 0 });
        // Só reservada: só o holograma.
        if (!obra.instalada) continue;
      }
      // CTL-15: na 1ª pessoa o corpo pilotado não se desenha (a câmera está dentro dele).
      if (id === this.oculto) continue;
      let lista = porTipo.get(tipo);
      if (!lista) porTipo.set(tipo, (lista = []));
      // ART-06: canteiro e unidade recém-impressa surgem de baixo para cima.
      const inicio = this.impressoes.get(id);
      const fracao = obra
        ? obra.progresso
        : inicio !== undefined
          ? Math.min(1, (performance.now() - inicio) / IMPRESSAO_MS)
          : 1;
      if (inicio !== undefined && fracao >= 1) this.impressoes.delete(id);
      const corte = fracao < 1 ? Math.max(0.02, fracao * corpo.altura) + 0.001 : 0;
      if (corte > 0) {
        this.linhasDeImpressao.push({
          x: corpo.x + corpo.cima[0] * corte,
          y: corpo.y + corpo.cima[1] * corte,
          z: corpo.z + corpo.cima[2] * corte,
          cima: corpo.cima,
          raio: corpo.raio,
        });
      }
      // ENE-24 (D-71): a Bateria Móvel brilha (pulsando) enquanto transfere energia.
      const suporte = getComponent(state, id, 'suporte');
      if (suporte) {
        this.brilho.set(
          id,
          suporte.alvos.length > 0
            ? BRILHO_LIGADA + 0.4 * Math.sin(performance.now() / 300)
            : BRILHO_DESLIGADA * 6,
        );
      }
      lista.push({ corpo, frente, corte });
    }

    this.satelites(state, visivel, porTipo);

    this.preencher(this.lotes, porTipo, (tipo) => this.lote(tipo));
    this.desenharRampas(porTipo.get('ship') ?? []);
    this.desenharTorres(state, porTipo);
    this.desenharFolhas(state, porTipo.get('gate') ?? []);
    this.preencher(this.hologramas, emObra, (tipo) => this.holograma(tipo));
    this.preencher(this.fantasmas, lembrados, (tipo) => this.fantasma(tipo));
  }

  private preencher(
    lotes: Map<TipoDeModelo, Lote>,
    porTipo: Map<
      TipoDeModelo,
      Array<{ corpo: CorpoDesenhado; frente: Vec3 | null; corte: number }>
    >,
    obter: (tipo: TipoDeModelo) => Lote,
  ): void {
    for (const lote of lotes.values()) lote.usados = 0;
    for (const [tipo, lista] of porTipo) {
      const lote = obter(tipo);
      lote.garantir(lista.length);
      lista.forEach(({ corpo, frente, corte }, k) => {
        // Base do modelo: +x = frente (rumo, ou o norte local para estruturas e minas, PRD-10),
        // +y = vertical local, +z = x × y.
        this.cima.set(...corpo.cima);
        const norte = norteEm(corpo.cima);
        if (frente) this.frente.set(frente.x, frente.y, frente.z);
        else this.frente.set(...norte);
        // Garante a frente tangente (a interpolação pode tirá-la um pouco do plano).
        this.frente.addScaledVector(this.cima, -this.frente.dot(this.cima)).normalize();
        this.lado.crossVectors(this.frente, this.cima);
        this.matriz.makeBasis(this.frente, this.cima, this.lado);
        this.matriz.setPosition(corpo.x, corpo.y, corpo.z);
        lote.malha.setMatrixAt(k, this.matriz);
        const brilho = this.brilho.get(corpo.id);
        const cor = this.cor(corpo.nacao);
        if (brilho === undefined) cor.toArray(lote.cores.array, k * 3);
        else
          this.corBrilho
            .copy(cor)
            .multiplyScalar(brilho)
            .toArray(lote.cores.array, k * 3);
        lote.cortes.array[k] = corte;
      });
      lote.usados = lista.length;
    }
    for (const lote of lotes.values()) {
      lote.malha.count = lote.usados;
      lote.malha.instanceMatrix.needsUpdate = true;
      lote.cores.needsUpdate = true;
      lote.cortes.needsUpdate = true;
    }
  }

  /**
   * D-51: satélites no céu, a `ALTURA_DA_ORBITA_M` sobre o ponto de visão (subindo da base
   * durante o lançamento). A posição segue o ponto da simulação suavizada por quadro.
   */
  private satelites(
    state: SimState,
    visivel: ((id: EntityId) => boolean) | null,
    porTipo: Map<
      TipoDeModelo,
      Array<{ corpo: CorpoDesenhado; frente: Vec3 | null; corte: number }>
    >,
  ): void {
    const vivos = new Set<EntityId>();
    for (const id of entitiesWith(state, 'satelite', 'owner')) {
      if (visivel && !visivel(id)) continue;
      const s = getComponent(state, id, 'satelite')!;
      const base = getComponent(state, s.base, 'position');
      if (!base) continue;
      const chao = Math.hypot(base.x, base.y, base.z);
      const subida =
        s.estado === 'lancando' ? 1 - s.timer_s / Math.max(1e-6, TEMPO_DE_LANCAMENTO_S()) : 1;
      const r = chao + ALTURA_DA_ORBITA_M * subida;
      const alvo: [number, number, number] = [s.ponto[0] * r, s.ponto[1] * r, s.ponto[2] * r];
      const antes = this.posicaoDosSatelites.get(id);
      const p: [number, number, number] = antes
        ? [
            antes[0] + (alvo[0] - antes[0]) * SUAVIZACAO_DO_SATELITE,
            antes[1] + (alvo[1] - antes[1]) * SUAVIZACAO_DO_SATELITE,
            antes[2] + (alvo[2] - antes[2]) * SUAVIZACAO_DO_SATELITE,
          ]
        : alvo;
      this.posicaoDosSatelites.set(id, p);
      vivos.add(id);
      const m = Math.hypot(...p) || 1;
      const corpo: CorpoDesenhado = {
        id,
        tipo: 'satellite',
        nacao: getComponent(state, id, 'owner')!.nacao,
        movel: false,
        x: p[0],
        y: p[1],
        z: p[2],
        cima: [p[0] / m, p[1] / m, p[2] / m],
        raio: raioDe('satellite'),
        altura: alturaDe('satellite'),
      };
      this.corpos.push(corpo);
      this.porId.set(id, corpo);
      let lista = porTipo.get('satellite');
      if (!lista) porTipo.set('satellite', (lista = []));
      lista.push({ corpo, frente: null, corte: 0 });
    }
    for (const id of this.posicaoDosSatelites.keys()) {
      if (!vivos.has(id)) this.posicaoDosSatelites.delete(id);
    }
  }

  /** FLX-09: a rampa de cada Nave, girada na dobradiça pela abertura. */
  private desenharRampas(
    naves: ReadonlyArray<{ corpo: CorpoDesenhado; frente: Vec3 | null }>,
  ): void {
    this.loteDaRampa ??= new Lote(this.scene, geometriaDaRampa(), this.material, 8);
    const lote = this.loteDaRampa;
    lote.garantir(Math.max(1, naves.length));
    const giro = new Matrix4();
    const dobradica = new Matrix4().makeTranslation(...DOBRADICA_DA_RAMPA);
    naves.forEach(({ corpo }, k) => {
      this.cima.set(...corpo.cima);
      this.frente.set(...norteEm(corpo.cima));
      this.frente.addScaledVector(this.cima, -this.frente.dot(this.cima)).normalize();
      this.lado.crossVectors(this.frente, this.cima);
      this.matriz.makeBasis(this.frente, this.cima, this.lado);
      this.matriz.setPosition(corpo.x, corpo.y, corpo.z);
      const a = this.aberturaDaRampa.get(corpo.id) ?? 1;
      giro.makeRotationZ(ANGULO_RAMPA_FECHADA + (ANGULO_RAMPA_ABERTA - ANGULO_RAMPA_FECHADA) * a);
      this.matriz.multiply(dobradica).multiply(giro);
      lote.malha.setMatrixAt(k, this.matriz);
      this.cor(corpo.nacao).toArray(lote.cores.array, k * 3);
      lote.cortes.array[k] = 0;
    });
    lote.malha.count = naves.length;
    lote.malha.instanceMatrix.needsUpdate = true;
    lote.cores.needsUpdate = true;
    lote.cortes.needsUpdate = true;
  }

  /**
   * ART-12 (D-68): a torre de cada corpo armado gira (só no eixo vertical local) para o alvo da
   * arma; sem alvo, volta para a frente do corpo. O giro é suavizado por quadro.
   */
  private desenharTorres(
    state: SimState,
    porTipo: Map<
      TipoDeModelo,
      Array<{ corpo: CorpoDesenhado; frente: Vec3 | null; corte: number }>
    >,
  ): void {
    const agora = performance.now();
    const dt = Math.min(0.1, (agora - this.ultimoGiro) / 1000);
    this.ultimoGiro = agora;
    const vivos = new Set<EntityId>();
    for (const lote of this.lotesDeTorre.values()) lote.usados = 0;
    const peca = new Matrix4();
    for (const [tipo, lista] of porTipo) {
      if (!temTorre(tipo)) continue;
      let lote = this.lotesDeTorre.get(tipo);
      if (!lote) {
        lote = new Lote(this.scene, geometriaDaTorre(tipo), this.material, CAPACIDADE_INICIAL);
        this.lotesDeTorre.set(tipo, lote);
      }
      lote.garantir(lista.length);
      const pivo = pivoDaTorre(tipo);
      lista.forEach(({ corpo, frente, corte }) => {
        vivos.add(corpo.id);
        this.cima.set(...corpo.cima);
        if (frente) this.frente.set(frente.x, frente.y, frente.z);
        else this.frente.set(...norteEm(corpo.cima));
        this.frente.addScaledVector(this.cima, -this.frente.dot(this.cima)).normalize();
        this.lado.crossVectors(this.frente, this.cima);
        // Ângulo desejado: o alvo no plano local (+x = frente, +z = lado).
        const alvo =
          getComponent(state, corpo.id, 'arma')?.alvo ??
          getComponent(state, corpo.id, 'antiaerea')?.alvo ??
          null;
        const pos =
          alvo !== null && alvo !== undefined ? getComponent(state, alvo, 'position') : undefined;
        let desejado = 0;
        if (pos) {
          const vx = pos.x - corpo.x;
          const vy = pos.y - corpo.y;
          const vz = pos.z - corpo.z;
          const x = vx * this.frente.x + vy * this.frente.y + vz * this.frente.z;
          const z = vx * this.lado.x + vy * this.lado.y + vz * this.lado.z;
          if (x * x + z * z > 1e-6) desejado = Math.atan2(-z, x);
        }
        const atual = this.giroDaTorre.get(corpo.id) ?? desejado;
        let delta = desejado - atual;
        delta = Math.atan2(Math.sin(delta), Math.cos(delta));
        const passo = VELOCIDADE_DA_TORRE_RAD_S * dt;
        const giro = atual + Math.max(-passo, Math.min(passo, delta));
        this.giroDaTorre.set(corpo.id, giro);
        this.matriz.makeBasis(this.frente, this.cima, this.lado);
        this.matriz.setPosition(corpo.x, corpo.y, corpo.z);
        peca.makeRotationY(giro).setPosition(pivo[0], pivo[1], pivo[2]);
        this.matriz.multiply(peca);
        const k = lote!.usados++;
        lote!.malha.setMatrixAt(k, this.matriz);
        this.cor(corpo.nacao).toArray(lote!.cores.array, k * 3);
        // ART-06: o corte da impressão vale a partir do pivô da torre.
        lote!.cortes.array[k] = corte > 0 ? Math.max(0.001, corte - pivo[1]) : 0;
      });
    }
    for (const lote of this.lotesDeTorre.values()) {
      lote.malha.count = lote.usados;
      lote.malha.instanceMatrix.needsUpdate = true;
      lote.cores.needsUpdate = true;
      lote.cortes.needsUpdate = true;
    }
    for (const id of this.giroDaTorre.keys()) if (!vivos.has(id)) this.giroDaTorre.delete(id);
  }

  /** UNI-09: as duas folhas de cada Portão descem para dentro do chão com a abertura. */
  private desenharFolhas(
    state: SimState,
    portoes: ReadonlyArray<{ corpo: CorpoDesenhado; frente: Vec3 | null; corte: number }>,
  ): void {
    this.loteDaFolha ??= new Lote(this.scene, geometriaDaFolha(), this.material, 8);
    const lote = this.loteDaFolha;
    const prontos = portoes.filter(({ corpo }) => !getComponent(state, corpo.id, 'obra'));
    lote.garantir(Math.max(1, prontos.length * 2));
    const peca = new Matrix4();
    let k = 0;
    for (const { corpo, frente } of prontos) {
      const abertura = getComponent(state, corpo.id, 'portao')?.abertura ?? 0;
      this.cima.set(...corpo.cima);
      // D-56: as folhas seguem o rumo do portão.
      if (frente) this.frente.set(frente.x, frente.y, frente.z);
      else this.frente.set(...norteEm(corpo.cima));
      this.frente.addScaledVector(this.cima, -this.frente.dot(this.cima)).normalize();
      this.lado.crossVectors(this.frente, this.cima);
      const y = ALTURA_DA_SOLEIRA_M - ALTURA_DA_FOLHA_M * abertura;
      for (const lado of [-1, 1]) {
        this.matriz.makeBasis(this.frente, this.cima, this.lado);
        this.matriz.setPosition(corpo.x, corpo.y, corpo.z);
        // A folha vai da dobradiça (x = 0) até 2,45 m; a direita é a esquerda girada.
        peca.makeRotationY(lado > 0 ? Math.PI : 0).setPosition(lado * 2.45, y, 0);
        this.matriz.multiply(peca);
        lote.malha.setMatrixAt(k, this.matriz);
        this.cor(corpo.nacao).toArray(lote.cores.array, k * 3);
        lote.cortes.array[k] = 0;
        k++;
      }
    }
    lote.malha.count = k;
    lote.malha.instanceMatrix.needsUpdate = true;
    lote.cores.needsUpdate = true;
    lote.cortes.needsUpdate = true;
  }

  /** ART-06: as unidades impressas neste tick começam a animação de impressão. */
  registrar(eventos: readonly SimEvent[]): void {
    for (const e of eventos) {
      if (e.tipo !== 'impresso') continue;
      this.impressoes.set((e.dados as { id: EntityId }).id, performance.now());
    }
  }

  get(id: EntityId): CorpoDesenhado | undefined {
    return this.porId.get(id);
  }

  private fantasma(tipo: TipoDeModelo): Lote {
    let lote = this.fantasmas.get(tipo);
    if (!lote) {
      lote = new Lote(this.scene, geometriaDoModelo(tipo), this.materialFantasma, 8, false);
      this.fantasmas.set(tipo, lote);
    }
    return lote;
  }

  private holograma(tipo: TipoDeModelo): Lote {
    let lote = this.hologramas.get(tipo);
    if (!lote) {
      lote = new Lote(
        this.scene,
        geometriaDoModelo(tipo),
        this.materialHolograma,
        CAPACIDADE_INICIAL,
        false,
      );
      this.hologramas.set(tipo, lote);
    }
    return lote;
  }

  private lote(tipo: TipoDeModelo): Lote {
    let lote = this.lotes.get(tipo);
    if (!lote) {
      // ART-12: nos tipos com torre, o lote é só o corpo; a torre gira à parte.
      lote = new Lote(this.scene, geometriaDoCorpo(tipo), this.material, CAPACIDADE_INICIAL);
      this.lotes.set(tipo, lote);
    }
    return lote;
  }

  /** ART-04/UI-11: a cor da nação na paleta das Configurações (o cache segue o modo). */
  private cor(nacao: string | null): Color {
    const chave = `${configuracoes.value.daltonismo}|${nacao ?? ''}`;
    let cor = this.corDaNacao.get(chave);
    if (!cor) {
      cor = new Color(corDaNacao(nacao));
      this.corDaNacao.set(chave, cor);
    }
    return cor;
  }
}

/** Raio de seleção: o de colisão para móveis; metade da pegada para estruturas. */
export function raioDe(tipo: TipoDeModelo): number {
  if (tipo === 'mine') return 0.6;
  if (tipo === 'satellite') return 3;
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
