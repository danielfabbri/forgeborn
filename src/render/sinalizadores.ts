/**
 * Sinalizadores do clique direito (UI-14): cada ordem deixa no ponto uma marca com forma e cor
 * próprias, que cresce e some em `DURACAO_MS`. Formas, cores e tempos são de apresentação.
 */
import {
  AdditiveBlending,
  BufferGeometry,
  Float32BufferAttribute,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  type Scene,
  Vector3,
} from 'three';
import { norteEm, produtoVetorial, type Vec3 } from '../sim/map/esfera';

export type SinalDeOrdem =
  | 'mover'
  | 'atacar'
  | 'coletar'
  | 'descarregar'
  | 'recarregar'
  | 'construir'
  | 'reciclar'
  | 'patrulhar'
  | 'satelite';

const DURACAO_MS = 900;
const ELEVACAO_M = 0.4;
/** Tamanho (m) da marca no fim da animação. */
const TAMANHO_M = 2.6;

type Traco = Array<[number, number]>;

/** Polígono regular de `n` lados (raio 1), com giro inicial `a0`. */
function poligono(n: number, a0 = 0, r = 1): Traco[] {
  const pts: Traco = [];
  for (let k = 0; k <= n; k++) {
    const a = a0 + (k / n) * Math.PI * 2;
    pts.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return [pts];
}

/** Forma de cada sinal no plano local (x = norte, y = leste), em linhas. */
const FORMAS: Record<SinalDeOrdem, { cor: string; tracos: Traco[] }> = {
  // Mover: círculo com quatro setas para dentro.
  mover: {
    cor: '#5dff9a',
    tracos: [
      ...poligono(24),
      ...[0, 1, 2, 3].map((k): Traco => {
        const a = (k * Math.PI) / 2;
        const c = Math.cos(a);
        const s = Math.sin(a);
        return [
          [c * 1.5 - s * 0.3, s * 1.5 + c * 0.3],
          [c * 1.1, s * 1.1],
          [c * 1.5 + s * 0.3, s * 1.5 - c * 0.3],
        ];
      }),
    ],
  },
  // Atacar: mira vermelha (círculo e X).
  atacar: {
    cor: '#ff4040',
    tracos: [
      ...poligono(24, 0, 0.9),
      [
        [-1.3, -1.3],
        [1.3, 1.3],
      ],
      [
        [-1.3, 1.3],
        [1.3, -1.3],
      ],
    ],
  },
  // Coletar: losango âmbar com um ponto no meio.
  coletar: { cor: '#ffc24a', tracos: [...poligono(4, 0, 1.2), ...poligono(4, 0, 0.35)] },
  // Descarregar: quadrado azul com seta para baixo.
  descarregar: {
    cor: '#4aa8ff',
    tracos: [
      ...poligono(4, Math.PI / 4, 1.2),
      [
        [0.6, 0],
        [-0.6, 0],
      ],
      [
        [-0.2, -0.4],
        [-0.6, 0],
        [-0.2, 0.4],
      ],
    ],
  },
  // Recarregar: raio ciano dentro de um círculo.
  recarregar: {
    cor: '#3ff0ff',
    tracos: [
      ...poligono(20, 0, 1.2),
      [
        [0.8, -0.2],
        [0.05, 0.35],
        [0, -0.3],
        [-0.8, 0.2],
      ],
    ],
  },
  // Construir ou reparar: hexágono amarelo com uma cruz.
  construir: {
    cor: '#ffe14a',
    tracos: [
      ...poligono(6, 0, 1.2),
      [
        [0.5, 0],
        [-0.5, 0],
      ],
      [
        [0, 0.5],
        [0, -0.5],
      ],
    ],
  },
  // Reciclar: triângulo roxo duplo.
  reciclar: {
    cor: '#c77dff',
    tracos: [...poligono(3, 0, 1.2), ...poligono(3, Math.PI, 0.6)],
  },
  // Patrulhar: dois arcos opostos com pontas.
  patrulhar: {
    cor: '#7fb8ff',
    tracos: [
      Array.from({ length: 10 }, (_, k): [number, number] => {
        const a = 0.2 + (k / 9) * (Math.PI - 0.4);
        return [Math.cos(a), Math.sin(a)];
      }),
      Array.from({ length: 10 }, (_, k): [number, number] => {
        const a = Math.PI + 0.2 + (k / 9) * (Math.PI - 0.4);
        return [Math.cos(a), Math.sin(a)];
      }),
      [
        [-1.25, 0.1],
        [-0.95, 0.2],
        [-0.8, -0.1],
      ],
      [
        [1.25, -0.1],
        [0.95, -0.2],
        [0.8, 0.1],
      ],
    ],
  },
  // Satélite: dois anéis brancos e uma estrela de quatro pontas.
  satelite: {
    cor: '#e8f4ff',
    tracos: [
      ...poligono(28, 0, 1.3),
      ...poligono(28, 0, 0.9),
      [
        [0, 0.5],
        [0, -0.5],
      ],
      [
        [0.5, 0],
        [-0.5, 0],
      ],
    ],
  },
};

function geometriaDe(tracos: Traco[]): BufferGeometry {
  const v: number[] = [];
  for (const t of tracos) {
    for (let k = 0; k + 1 < t.length; k++) {
      // Plano local: x = frente (norte), z = lado; y = vertical.
      v.push(t[k]![0], 0, t[k]![1], t[k + 1]![0], 0, t[k + 1]![1]);
    }
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(v, 3));
  return geo;
}

interface Ativo {
  tipo: SinalDeOrdem;
  linhas: LineSegments;
  inicio: number;
}

export class SinalizadoresRender {
  private readonly geometrias = new Map<SinalDeOrdem, BufferGeometry>();
  private readonly ativos: Ativo[] = [];
  private readonly matriz = new Matrix4();
  private readonly frente = new Vector3();
  private readonly cima = new Vector3();
  private readonly lado = new Vector3();

  constructor(
    private readonly scene: Scene,
    private readonly raio: number,
    private readonly chao: (d: Vec3) => number,
  ) {}

  /** Mostra o sinal `tipo` no ponto `d` (direção). */
  mostrar(tipo: SinalDeOrdem, d: Vec3, agora: number): void {
    let geo = this.geometrias.get(tipo);
    if (!geo) this.geometrias.set(tipo, (geo = geometriaDe(FORMAS[tipo].tracos)));
    const linhas = new LineSegments(
      geo,
      new LineBasicMaterial({
        color: FORMAS[tipo].cor,
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
        depthTest: false,
      }),
    );
    linhas.renderOrder = 10;
    linhas.matrixAutoUpdate = false;
    linhas.frustumCulled = false;
    const r = this.raio + this.chao(d) + ELEVACAO_M;
    const norte = norteEm(d);
    this.cima.set(...d);
    this.frente.set(...norte);
    this.lado.set(...produtoVetorial(norte, d));
    this.matriz.makeBasis(this.frente, this.cima, this.lado);
    this.matriz.setPosition(d[0] * r, d[1] * r, d[2] * r);
    linhas.userData.base = this.matriz.clone();
    this.scene.add(linhas);
    this.ativos.push({ tipo, linhas, inicio: agora });
  }

  /** Tipos dos sinais na tela (para a sonda dos testes). */
  get tipos(): SinalDeOrdem[] {
    return this.ativos.map((a) => a.tipo);
  }

  sync(agora: number): void {
    for (let i = this.ativos.length - 1; i >= 0; i--) {
      const a = this.ativos[i]!;
      const f = (agora - a.inicio) / DURACAO_MS;
      if (f >= 1) {
        this.scene.remove(a.linhas);
        (a.linhas.material as LineBasicMaterial).dispose();
        this.ativos.splice(i, 1);
        continue;
      }
      // Surge grande e se fecha no ponto, apagando no fim.
      const escala = TAMANHO_M * (1.6 - 0.6 * Math.min(1, f * 3));
      a.linhas.matrix
        .copy(a.linhas.userData.base as Matrix4)
        .multiply(this.matriz.makeScale(escala, 1, escala));
      (a.linhas.material as LineBasicMaterial).opacity = f < 0.7 ? 1 : 1 - (f - 0.7) / 0.3;
      a.linhas.matrixWorldNeedsUpdate = true;
    }
  }
}
