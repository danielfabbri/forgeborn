/**
 * Pré-visualização do mapa na Configuração da Partida (FLX-07): o globo com o relevo e as
 * zonas de pouso numeradas. Arrastar gira; com "escolher" (FB-02), clicar numa zona a escolhe.
 */
import { normalizar, produtoEscalar, type Vec3 } from '../sim/map/esfera';
import { alturaEm, type Heightmap } from '../sim/map/heightmap';
import { baseDoGlobo, desprojetar, projetar, type BaseDoGlobo } from './minimapa';

export const LADO_PREVIA_PX = 240;
/** Raio (no disco unitário) em que um clique pega a zona. */
const RAIO_CLIQUE = 0.16;

/** Pinta o relevo: cinza pela altura, com luz de um lado para ler as crateras. */
export function pintarRelevo(
  pixels: Uint8ClampedArray,
  lado: number,
  base: BaseDoGlobo,
  mapa: Heightmap,
): void {
  const c = lado / 2;
  const r = c - 1;
  const passo = 2 / lado;
  const luz = normalizar([-0.5, 0.6, 0.62]);
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
      const h = alturaEm(mapa, d);
      const dx = desprojetar(base, Math.min(x + passo, 0.999), y);
      const dy = desprojetar(base, x, Math.min(y + passo, 0.999));
      const gx = dx ? alturaEm(mapa, dx) - h : 0;
      const gy = dy ? alturaEm(mapa, dy) - h : 0;
      // Normal aproximada no plano da tela (escala visual).
      const n = normalizar([-gx * 0.35, -gy * 0.35, 1]);
      const sombra = 0.55 + 0.45 * Math.max(0, produtoEscalar(n, luz));
      const borda = 0.6 + 0.4 * Math.sqrt(Math.max(0, 1 - x * x - y * y));
      const tom = Math.min(255, Math.max(0, 128 + h * 3)) * sombra * borda;
      pixels[k] = tom;
      pixels[k + 1] = tom;
      pixels[k + 2] = tom * 1.04;
      pixels[k + 3] = 255;
    }
  }
}

/** A zona de pouso sob o ponto do disco (x, y), ou null. */
export function zonaEm(
  base: BaseDoGlobo,
  zonas: readonly Vec3[],
  x: number,
  y: number,
): number | null {
  let melhor: number | null = null;
  let menor = RAIO_CLIQUE;
  zonas.forEach((d, k) => {
    const p = projetar(base, d);
    if (!p) return;
    const dist = Math.hypot(p.x - x, p.y - y);
    if (dist < menor) {
      menor = dist;
      melhor = k;
    }
  });
  return melhor;
}

/**
 * Direção de onde o globo mostra mais zonas de frente: testa as zonas, os pontos médios entre
 * pares e os antípodas, e fica com a que tem mais zonas bem visíveis (e a pior mais de frente).
 * Com 4 zonas em tetraedro, 3 aparecem; a quarta, girando.
 */
export function melhorVista(zonas: readonly Vec3[]): Vec3 {
  if (zonas.length === 0) return [1, 0, 0];
  const candidatos: Vec3[] = [];
  for (const z of zonas) candidatos.push(z, [-z[0], -z[1], -z[2]]);
  for (let a = 0; a < zonas.length; a++) {
    for (let b = a + 1; b < zonas.length; b++) {
      const m: Vec3 = [
        zonas[a]![0] + zonas[b]![0],
        zonas[a]![1] + zonas[b]![1],
        zonas[a]![2] + zonas[b]![2],
      ];
      if (Math.hypot(...m) > 1e-6) candidatos.push(normalizar(m));
    }
  }
  let melhor = candidatos[0]!;
  let nota = -Infinity;
  for (const c of candidatos) {
    const dots = zonas.map((z) => produtoEscalar(z, c));
    const vistas = dots.filter((d) => d > 0.25).length;
    const pior = Math.min(...dots.filter((d) => d > 0.25), 1);
    // Empate: a vista que inclui a zona 1.
    const n = vistas * 10 + (dots[0]! > 0.25 ? 5 : 0) + pior;
    if (n > nota) {
      nota = n;
      melhor = c;
    }
  }
  return melhor;
}

export interface ConteudoDaPrevia {
  mapa: Heightmap;
  zonas: readonly Vec3[];
  /** Zona escolhida pelo jogador (FB-02), ou null. */
  escolhida: number | null;
  corDoJogador: string;
}

export class PreviaDoMapa {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly imagem: ImageData;
  private base: BaseDoGlobo = baseDoGlobo([1, 0, 0]);
  private conteudo: ConteudoDaPrevia | null = null;
  private arrasto: { x: number; y: number; moveu: boolean } | null = null;
  private foco: Vec3 = [1, 0, 0];

  constructor(
    readonly canvas: HTMLCanvasElement,
    private readonly aoClicarZona: (zona: number) => void,
  ) {
    canvas.width = canvas.height = LADO_PREVIA_PX;
    this.ctx = canvas.getContext('2d')!;
    this.imagem = this.ctx.createImageData(LADO_PREVIA_PX, LADO_PREVIA_PX);
    canvas.addEventListener('pointerdown', (e) => {
      this.arrasto = { x: e.clientX, y: e.clientY, moveu: false };
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!this.arrasto) return;
      const dx = e.clientX - this.arrasto.x;
      const dy = e.clientY - this.arrasto.y;
      if (Math.hypot(dx, dy) < 3 && !this.arrasto.moveu) return;
      this.arrasto = { x: e.clientX, y: e.clientY, moveu: true };
      // Gira o globo: o foco anda ao contrário do arrasto.
      const escala = 2 / canvas.getBoundingClientRect().width;
      const novo = desprojetar(this.base, -dx * escala, dy * escala);
      if (novo) this.girarPara(novo);
    });
    canvas.addEventListener('pointerup', (e) => {
      const clique = this.arrasto && !this.arrasto.moveu;
      this.arrasto = null;
      if (!clique || !this.conteudo) return;
      const p = this.noDisco(e.clientX, e.clientY);
      const zona = zonaEm(this.base, this.conteudo.zonas, p.x, p.y);
      if (zona !== null) this.aoClicarZona(zona);
    });
  }

  private noDisco(clientX: number, clientY: number): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    const raio = LADO_PREVIA_PX / 2 - 1;
    return {
      x: (((clientX - r.left) / r.width) * LADO_PREVIA_PX - LADO_PREVIA_PX / 2) / raio,
      y: (LADO_PREVIA_PX / 2 - ((clientY - r.top) / r.height) * LADO_PREVIA_PX) / raio,
    };
  }

  /** Ponto de página de uma zona (para testes E2E), ou null do outro lado. */
  pontoDaZona(k: number): { x: number; y: number } | null {
    const d = this.conteudo?.zonas[k];
    const p = d ? projetar(this.base, d) : null;
    if (!p) return null;
    const r = this.canvas.getBoundingClientRect();
    const raio = LADO_PREVIA_PX / 2 - 1;
    return {
      x: r.left + ((LADO_PREVIA_PX / 2 + p.x * raio) / LADO_PREVIA_PX) * r.width,
      y: r.top + ((LADO_PREVIA_PX / 2 - p.y * raio) / LADO_PREVIA_PX) * r.height,
    };
  }

  private girarPara(foco: Vec3): void {
    this.foco = foco;
    this.base = baseDoGlobo(foco);
    this.repintar(true);
  }

  mostrar(conteudo: ConteudoDaPrevia): void {
    const mapaNovo = conteudo.mapa !== this.conteudo?.mapa;
    this.conteudo = conteudo;
    if (mapaNovo) {
      this.foco = melhorVista(conteudo.zonas);
      this.base = baseDoGlobo(this.foco);
    }
    this.repintar(true);
  }

  private repintar(relevo: boolean): void {
    const c = this.conteudo;
    if (!c) return;
    if (relevo) pintarRelevo(this.imagem.data, LADO_PREVIA_PX, this.base, c.mapa);
    const g = this.ctx;
    g.clearRect(0, 0, LADO_PREVIA_PX, LADO_PREVIA_PX);
    g.putImageData(this.imagem, 0, 0);
    const raio = LADO_PREVIA_PX / 2 - 1;
    g.font = 'bold 12px ui-monospace, Consolas, monospace';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    c.zonas.forEach((d, k) => {
      const p = projetar(this.base, d);
      if (!p) return;
      const x = LADO_PREVIA_PX / 2 + p.x * raio;
      const y = LADO_PREVIA_PX / 2 - p.y * raio;
      const escolhida = c.escolhida === k;
      g.beginPath();
      g.arc(x, y, escolhida ? 11 : 9, 0, Math.PI * 2);
      g.fillStyle = escolhida ? c.corDoJogador : 'rgba(10, 20, 35, 0.8)';
      g.fill();
      g.lineWidth = 2;
      g.strokeStyle = escolhida ? '#ffffff' : '#8fd0ff';
      g.stroke();
      g.fillStyle = '#ffffff';
      g.fillText(String(k + 1), x, y + 0.5);
    });
  }

  get focoAtual(): Vec3 {
    return this.foco;
  }
}
