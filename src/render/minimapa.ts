/**
 * Minimapa (VIS-09, UI-05, CTL-03, D-83): um mapa-múndi do corpo (projeção equiretangular), com o
 * norte sempre para cima, que só rola entre leste e oeste para acompanhar o ponto focal. (As
 * funções do globo abaixo servem à prévia do Free Battle.) Pinta os três estados da névoa a partir da mesma grade da
 * textura do terreno (TEC-17) e, por cima, unidades visíveis, fantasmas, sinais de radar,
 * círculos de satélite e o campo da câmera. Clique move a câmera; clique direito dá ordem.
 */
import { contornoDe, type Emblema } from '../game/paleta';
import { type PerspectiveCamera, Raycaster, Vector2 } from 'three';
import {
  avancar,
  celulaDaDirecao,
  girar,
  normalizar,
  norteEm,
  produtoEscalar,
  produtoVetorial,
  type Vec3,
} from '../sim/map/esfera';

/** Orientação do globo: o foco no centro, o norte para cima e o leste à direita. */
export interface BaseDoGlobo {
  foco: Vec3;
  norte: Vec3;
  leste: Vec3;
}

export function baseDoGlobo(foco: Vec3, frente: Vec3 | null = null): BaseDoGlobo {
  const f = normalizar(foco);
  const norte = norteEm(f, frente);
  return { foco: f, norte, leste: produtoVetorial(norte, f) };
}

/** Direção → coordenadas no disco unitário (y para cima), ou null se estiver do outro lado. */
export function projetar(base: BaseDoGlobo, d: Vec3): { x: number; y: number } | null {
  const u = normalizar(d);
  if (produtoEscalar(u, base.foco) < 0) return null;
  return { x: produtoEscalar(u, base.leste), y: produtoEscalar(u, base.norte) };
}

/** Coordenadas no disco unitário → direção no globo, ou null fora do disco. */
export function desprojetar(base: BaseDoGlobo, x: number, y: number): Vec3 | null {
  const r2 = x * x + y * y;
  if (r2 > 1) return null;
  const z = Math.sqrt(1 - r2);
  return normalizar([
    base.leste[0] * x + base.norte[0] * y + base.foco[0] * z,
    base.leste[1] * x + base.norte[1] * y + base.foco[1] * z,
    base.leste[2] * x + base.norte[2] * y + base.foco[2] * z,
  ]);
}

/** Cores dos três estados (VIS-01): escuro, névoa, visível. */
const CORES_DA_NEVOA: ReadonlyArray<readonly [number, number, number]> = [
  [16, 17, 22],
  [62, 64, 72],
  [128, 130, 126],
];

/**
 * Pinta o globo num buffer RGBA de lado × lado: cada pixel do disco lê o estado da célula da
 * sua direção (`estados` na ordem de `celulaDaDirecao`; sem grade, tudo visível).
 */
export function pintarGlobo(
  pixels: Uint8ClampedArray,
  lado: number,
  base: BaseDoGlobo,
  estados: readonly number[] | undefined,
  n: number,
): void {
  const c = lado / 2;
  const r = c - 1;
  for (let py = 0; py < lado; py++) {
    for (let px = 0; px < lado; px++) {
      const k = (py * lado + px) * 4;
      const x = (px + 0.5 - c) / r;
      const y = (c - py - 0.5) / r;
      const d = desprojetar(base, x, y);
      if (!d) {
        pixels[k + 3] = 0;
        continue;
      }
      const estado = estados ? (estados[celulaDaDirecao(n, d)] ?? 0) : 2;
      const cor = CORES_DA_NEVOA[estado] ?? CORES_DA_NEVOA[0]!;
      // Sombreamento da borda do disco, para ler como globo.
      const luz = 0.55 + 0.45 * Math.sqrt(Math.max(0, 1 - x * x - y * y));
      pixels[k] = cor[0] * luz;
      pixels[k + 1] = cor[1] * luz;
      pixels[k + 2] = cor[2] * luz;
      pixels[k + 3] = 255;
    }
  }
}

/** Longitude (rad) da direção: 0 em +x, crescendo para o leste (−z), como `norteEm`. */
export function longitudeDe(d: Vec3): number {
  return Math.atan2(-d[2], d[0]);
}

/** CTL-03: direção → mapa-múndi em [−1, 1]² (x leste, y norte), com a longitude `lon0` no meio. */
export function projetarMundi(lon0: number, d: Vec3): { x: number; y: number } {
  const u = normalizar(d);
  const lat = Math.asin(Math.max(-1, Math.min(1, u[1])));
  let lon = longitudeDe(u) - lon0;
  lon -= Math.round(lon / (2 * Math.PI)) * 2 * Math.PI;
  return { x: lon / Math.PI, y: lat / (Math.PI / 2) };
}

/** CTL-03: ponto do mapa-múndi em [−1, 1]² → direção. */
export function desprojetarMundi(lon0: number, x: number, y: number): Vec3 {
  const lat = Math.max(-1, Math.min(1, y)) * (Math.PI / 2);
  const lon = x * Math.PI + lon0;
  return [Math.cos(lat) * Math.cos(lon), Math.sin(lat), -Math.cos(lat) * Math.sin(lon)];
}

/** Pinta o mapa-múndi (largura × altura) com os três estados da névoa (sem grade: visível). */
export function pintarMundi(
  pixels: Uint8ClampedArray,
  largura: number,
  altura: number,
  lon0: number,
  estados: readonly number[] | undefined,
  n: number,
): void {
  for (let py = 0; py < altura; py++) {
    const y = 1 - ((py + 0.5) / altura) * 2;
    // Sombra suave perto dos polos, para ler a curvatura.
    const luz = 0.7 + 0.3 * Math.cos((y * Math.PI) / 2);
    for (let px = 0; px < largura; px++) {
      const k = (py * largura + px) * 4;
      const d = desprojetarMundi(lon0, ((px + 0.5) / largura) * 2 - 1, y);
      const estado = estados ? (estados[celulaDaDirecao(n, d)] ?? 0) : 2;
      const cor = CORES_DA_NEVOA[estado] ?? CORES_DA_NEVOA[0]!;
      pixels[k] = cor[0] * luz;
      pixels[k + 1] = cor[1] * luz;
      pixels[k + 2] = cor[2] * luz;
      pixels[k + 3] = 255;
    }
  }
}

const raio = new Raycaster();
const ndc = new Vector2();

/**
 * Campo da câmera no globo: as bordas da tela projetadas na esfera, em ordem. O raio que não
 * toca o planeta usa o ponto do planeta mais próximo dele (o horizonte visto da câmera).
 */
export function campoDaCamera(camera: PerspectiveCamera, raioM: number, porLado = 8): Vec3[] {
  const bordas: Array<[number, number]> = [];
  for (let k = 0; k < porLado; k++) bordas.push([-1 + (2 * k) / porLado, 1]);
  for (let k = 0; k < porLado; k++) bordas.push([1, 1 - (2 * k) / porLado]);
  for (let k = 0; k < porLado; k++) bordas.push([1 - (2 * k) / porLado, -1]);
  for (let k = 0; k < porLado; k++) bordas.push([-1, -1 + (2 * k) / porLado]);
  return bordas.map(([x, y]) => {
    raio.setFromCamera(ndc.set(x, y), camera);
    const { origin: o, direction: d } = raio.ray;
    const b = o.x * d.x + o.y * d.y + o.z * d.z;
    const c = o.x * o.x + o.y * o.y + o.z * o.z - raioM * raioM;
    const delta = b * b - c;
    if (delta >= 0) {
      const t = -b - Math.sqrt(delta);
      return normalizar([o.x + d.x * t, o.y + d.y * t, o.z + d.z * t]);
    }
    // Horizonte no plano do raio e do centro: acos(raio / distância) a partir do ponto
    // sob a câmera, para o lado do raio.
    const distancia = Math.hypot(o.x, o.y, o.z);
    const sob: Vec3 = [o.x / distancia, o.y / distancia, o.z / distancia];
    const ao = produtoEscalar([d.x, d.y, d.z], sob);
    const lado = normalizar([d.x - ao * sob[0], d.y - ao * sob[1], d.z - ao * sob[2]]);
    const alfa = Math.acos(Math.min(1, raioM / distancia));
    return normalizar([
      sob[0] * Math.cos(alfa) + lado[0] * Math.sin(alfa),
      sob[1] * Math.cos(alfa) + lado[1] * Math.sin(alfa),
      sob[2] * Math.cos(alfa) + lado[2] * Math.sin(alfa),
    ]);
  });
}

export interface MarcaDeCorpo {
  d: Vec3;
  cor: string;
  estrutura: boolean;
  /** UI-11: no modo daltônico, o emblema da nação vira a forma do marcador. */
  forma?: Emblema | null;
}

export interface ConteudoDoMinimapa {
  foco: Vec3;
  frente: Vec3 | null;
  estados: readonly number[] | undefined;
  /** Muda quando a grade da névoa é relida (o globo só é repintado quando precisa). */
  versaoNevoa: number;
  corpos: readonly MarcaDeCorpo[];
  fantasmas: readonly Vec3[];
  sinais: readonly Vec3[];
  /** Satélites: centro e raio angular (rad) da visão. */
  satelites: ReadonlyArray<{ ponto: Vec3; angulo: number }>;
  /** UI-17 (D-81): domínio conhecido das outras nações: centro, cor e raio angular (rad). */
  dominios?: ReadonlyArray<{ d: Vec3; cor: string; angulo: number }>;
  /** CAM-07: pontos marcados (o do passo 6 do tutorial), em amarelo pulsante. */
  marcadores?: readonly Vec3[];
  /** Pontos do chão nas bordas da tela, em ordem (o campo da câmera). */
  campo: readonly Vec3[];
  agora: number;
}

export interface AcoesDoMinimapa {
  centrar(d: Vec3): void;
  ordenar(d: Vec3): void;
}

/** CTL-03: tamanho do mapa-múndi (2:1). */
const LARGURA_MUNDI_PX = 240;
const ALTURA_MUNDI_PX = 120;
const SEGMENTOS_DO_ANEL = 48;

export class Minimapa {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly imagem: ImageData;
  /** CTL-03: longitude no meio do mapa (a do ponto focal, arredondada ao pixel). */
  private lon0 = 0;
  private foco: Vec3 = [1, 0, 0];
  /** Arrasto em curso: x inicial (px da página) e a longitude do foco no começo. */
  private arrasto: { x0: number; lon: number; lat: number; moveu: boolean } | null = null;
  private pintado: { lon0: number; versao: number } | null = null;

  constructor(
    camada: HTMLElement,
    private readonly n: number,
    private readonly acoes: AcoesDoMinimapa,
  ) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = LARGURA_MUNDI_PX;
    this.canvas.height = ALTURA_MUNDI_PX;
    this.canvas.className = 'minimapa';
    this.canvas.dataset.testid = 'minimapa';
    this.ctx = this.canvas.getContext('2d')!;
    this.imagem = this.ctx.createImageData(LARGURA_MUNDI_PX, ALTURA_MUNDI_PX);
    camada.appendChild(this.canvas);

    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    this.canvas.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.button === 0) {
        const f = normalizar(this.foco);
        this.arrasto = {
          x0: e.clientX,
          lon: longitudeDe(f),
          lat: Math.asin(Math.max(-1, Math.min(1, f[1]))),
          moveu: false,
        };
      } else if (e.button === 2) {
        const d = this.direcaoDoEvento(e);
        if (d) this.acoes.ordenar(d);
      }
    });
    // CTL-03: arrastar rola o mapa (e a câmera) só entre leste e oeste.
    this.canvas.addEventListener('mousemove', (e) => {
      const a = this.arrasto;
      if (!a) return;
      const dx = e.clientX - a.x0;
      if (!a.moveu && Math.abs(dx) < 3) return;
      a.moveu = true;
      const largura = this.canvas.getBoundingClientRect().width || LARGURA_MUNDI_PX;
      const lon = a.lon - (dx / largura) * 2 * Math.PI;
      const cl = Math.cos(a.lat);
      this.acoes.centrar([cl * Math.cos(lon), Math.sin(a.lat), -cl * Math.sin(lon)]);
    });
    window.addEventListener('mouseup', (e) => {
      const a = this.arrasto;
      this.arrasto = null;
      // Clique sem arrastar: a câmera vai ao ponto.
      if (a && !a.moveu && e.button === 0) {
        const d = this.direcaoDoEvento(e);
        if (d) this.acoes.centrar(d);
      }
    });
  }

  /** Direção sob o ponto do evento (px da página), ou null fora do mapa. */
  direcaoEm(clientX: number, clientY: number): Vec3 | null {
    const r = this.canvas.getBoundingClientRect();
    const x = ((clientX - r.left) / r.width) * 2 - 1;
    const y = 1 - ((clientY - r.top) / r.height) * 2;
    if (Math.abs(x) > 1 || Math.abs(y) > 1) return null;
    return desprojetarMundi(this.lon0, x, y);
  }

  /** Ponto de página de uma direção (para testes E2E). */
  pontoDe(d: Vec3): { x: number; y: number } | null {
    const p = projetarMundi(this.lon0, d);
    const r = this.canvas.getBoundingClientRect();
    return { x: r.left + ((p.x + 1) / 2) * r.width, y: r.top + ((1 - p.y) / 2) * r.height };
  }

  private direcaoDoEvento(e: MouseEvent): Vec3 | null {
    return this.direcaoEm(e.clientX, e.clientY);
  }

  desenhar(c: ConteudoDoMinimapa): void {
    this.foco = c.foco;
    // Repinta só quando a longitude anda um pixel ou a névoa muda.
    const passo = (2 * Math.PI) / LARGURA_MUNDI_PX;
    this.lon0 = Math.round(longitudeDe(normalizar(c.foco)) / passo) * passo;
    const p0 = this.pintado;
    if (!p0 || p0.versao !== c.versaoNevoa || p0.lon0 !== this.lon0) {
      pintarMundi(
        this.imagem.data,
        LARGURA_MUNDI_PX,
        ALTURA_MUNDI_PX,
        this.lon0,
        c.estados,
        this.n,
      );
      this.pintado = { lon0: this.lon0, versao: c.versaoNevoa };
    }
    const g = this.ctx;
    g.clearRect(0, 0, LARGURA_MUNDI_PX, ALTURA_MUNDI_PX);
    g.putImageData(this.imagem, 0, 0);

    const tela = (d: Vec3): { x: number; y: number } | null => {
      const p = projetarMundi(this.lon0, d);
      return { x: ((p.x + 1) / 2) * LARGURA_MUNDI_PX, y: ((1 - p.y) / 2) * ALTURA_MUNDI_PX };
    };
    /** Linha por pontos, quebrada onde cruza a borda leste–oeste do mapa. */
    const linha = (pontos: ReadonlyArray<{ x: number; y: number } | null>) => {
      g.beginPath();
      let ultimo: { x: number; y: number } | null = null;
      for (const p of pontos) {
        if (!p) {
          ultimo = null;
          continue;
        }
        if (ultimo && Math.abs(p.x - ultimo.x) < LARGURA_MUNDI_PX / 2) g.lineTo(p.x, p.y);
        else g.moveTo(p.x, p.y);
        ultimo = p;
      }
      g.stroke();
    };

    // Círculos de satélite.
    g.strokeStyle = 'rgba(127, 214, 255, 0.8)';
    g.lineWidth = 1;
    const anel = (centro: Vec3, angulo: number) => {
      const norte = norteEm(centro);
      return Array.from({ length: SEGMENTOS_DO_ANEL + 1 }, (_, k) =>
        tela(
          avancar(centro, girar(norte, centro, (k / SEGMENTOS_DO_ANEL) * Math.PI * 2), angulo).p,
        ),
      );
    };
    for (const s of c.satelites) linha(anel(s.ponto, s.angulo));

    // UI-17: domínios das outras nações, anéis tracejados na cor delas.
    g.setLineDash([3, 3]);
    g.lineWidth = 1;
    for (const dom of c.dominios ?? []) {
      g.strokeStyle = dom.cor;
      g.globalAlpha = 0.7;
      linha(anel(dom.d, dom.angulo));
    }
    g.globalAlpha = 1;
    g.setLineDash([]);

    // CAM-07: ponto marcado (estrela amarela pulsante).
    for (const m of c.marcadores ?? []) {
      const p = tela(m);
      if (!p) continue;
      const pulso = 5 + 2 * Math.sin(c.agora / 200);
      g.fillStyle = '#ffd27a';
      g.strokeStyle = '#1a1206';
      g.lineWidth = 1.5;
      g.beginPath();
      for (let k = 0; k < 10; k++) {
        const r = k % 2 === 0 ? pulso : pulso * 0.45;
        const a = -Math.PI / 2 + (k * Math.PI) / 5;
        if (k === 0) g.moveTo(p.x + r * Math.cos(a), p.y + r * Math.sin(a));
        else g.lineTo(p.x + r * Math.cos(a), p.y + r * Math.sin(a));
      }
      g.closePath();
      g.fill();
      g.stroke();
    }

    // Fantasmas: quadrados cinza.
    g.fillStyle = 'rgba(160, 165, 175, 0.75)';
    for (const d of c.fantasmas) {
      const p = tela(d);
      if (p) g.fillRect(p.x - 2, p.y - 2, 4, 4);
    }

    // Corpos visíveis: estruturas maiores que unidades.
    for (const corpo of c.corpos) {
      const p = tela(corpo.d);
      if (!p) continue;
      g.fillStyle = corpo.cor;
      const t = corpo.estrutura ? 4 : 2.5;
      if (corpo.forma) {
        // Forma do emblema, um pouco maior para ser lida.
        const r = t * 0.9;
        g.beginPath();
        contornoDe(corpo.forma).forEach(([x, y], k) =>
          k === 0 ? g.moveTo(p.x + x * r, p.y - y * r) : g.lineTo(p.x + x * r, p.y - y * r),
        );
        g.closePath();
        g.fill();
      } else {
        g.fillRect(p.x - t / 2, p.y - t / 2, t, t);
      }
    }

    // Sinais de radar: vermelhos, pulsantes (VIS-06).
    const pulso = 2 + Math.sin((c.agora / 1000) * Math.PI * 2) * 0.8;
    g.fillStyle = '#ff3b3b';
    for (const d of c.sinais) {
      const p = tela(d);
      if (!p) continue;
      g.beginPath();
      g.arc(p.x, p.y, pulso, 0, Math.PI * 2);
      g.fill();
    }

    // Campo da câmera.
    const campo = c.campo.map(tela);
    if (campo.length >= 3) {
      g.strokeStyle = 'rgba(255, 255, 255, 0.85)';
      linha([...campo, campo[0]!]);
    }
  }
}
