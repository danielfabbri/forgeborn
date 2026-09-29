/**
 * Câmera RTS no planeta (CTL-01, CTL-02, CTL-16): estado e matemática puros, sem DOM nem
 * Three.js. O foco é a direção do ponto da superfície para onde a câmera olha; a altura é medida
 * acima do chão do foco; `frente` é o rumo tangente para onde a câmera olha, transportado junto
 * com o foco no pan (a câmera não gira sozinha). Norte: CEN-15.
 */
import {
  arco,
  girar,
  normalizar,
  norteEm,
  produtoVetorial,
  tangente,
  type Vec3,
} from '../sim/map/esfera';

/** Números de apresentação da câmera (GOV-04). */
export const CAMERA_RTS = {
  alturaMin_m: 15, // CTL-01
  alturaMaxRts_m: 120, // CTL-01
  /** CTL-16: a visão planetária vai até 3,5 × raio a partir do centro. */
  distanciaPlanetaria_raios: 3.5,
  alturaInicial_m: 75,
  inclinacaoLonge_graus: 55, // CTL-01
  inclinacaoPerto_graus: 35, // CTL-01
  inclinacaoPlanetaria_graus: 90, // CTL-16
  /** Faixa de altura em que a inclinação passa de 35° para 55°. */
  transicaoInclinacao_m: [15, 50] as const,
  /** Velocidade do pan em múltiplos da altura por segundo (mesma velocidade na tela em qualquer zoom). */
  panPorAltura: 1.3,
  /** Acima desta altura o pan não acelera mais (na visão planetária ele gira o globo). */
  alturaMaxPan_m: 120,
  fatorZoom: 1.12,
  suavizacaoZoom: 10,
  rotacaoPorPixel_rad: 0.006,
  bordaTela_px: 12,
} as const;

const C = CAMERA_RTS;

export interface EstadoCameraRts {
  /** Direção unitária do ponto focal. */
  foco: Vec3;
  /** Rumo tangente em `foco` para onde a câmera olha. */
  frente: Vec3;
  altura: number;
  alturaAlvo: number;
  /** Raio do planeta (m). */
  raio: number;
  /** §14.5: altura máxima do cenário (a Terra não mostra a curvatura). */
  teto?: number;
}

export function criarEstadoCamera(foco: Vec3, raio: number): EstadoCameraRts {
  const d = normalizar(foco);
  return {
    foco: d,
    frente: norteEm(d),
    altura: C.alturaInicial_m,
    alturaAlvo: C.alturaInicial_m,
    raio,
  };
}

/** CTL-16: altura máxima do zoom (visão planetária); §14.5: na Terra, um teto menor. */
export function alturaMaxima(estado: { raio: number; teto?: number }): number {
  return Math.min((C.distanciaPlanetaria_raios - 1) * estado.raio, estado.teto ?? Infinity);
}

function suave(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** CTL-16: quanto a câmera já está na visão planetária (0 na visão RTS, 1 no fim do zoom). */
export function fatorPlanetario(estado: { altura: number; raio: number; teto?: number }): number {
  const max = alturaMaxima(estado);
  if (max <= C.alturaMaxRts_m) return 0;
  return suave(C.alturaMaxRts_m, max, estado.altura);
}

/** CTL-01/CTL-16: inclinação (rad) abaixo do horizonte para a altura dada. */
export function inclinacao(altura: number, raio = Infinity): number {
  const [perto, longe] = C.transicaoInclinacao_m;
  let graus =
    C.inclinacaoPerto_graus +
    (C.inclinacaoLonge_graus - C.inclinacaoPerto_graus) * suave(perto, longe, altura);
  if (Number.isFinite(raio)) {
    const planetaria = suave(C.alturaMaxRts_m, alturaMaxima({ raio }), altura);
    graus += (C.inclinacaoPlanetaria_graus - graus) * planetaria;
  }
  return (graus * Math.PI) / 180;
}

/** Vetor tangente à direita da câmera. */
export function direita(estado: EstadoCameraRts): Vec3 {
  return normalizar(produtoVetorial(estado.frente, estado.foco));
}

/** Anda `metros` a partir do foco no rumo tangente `rumo`, levando a frente junto. */
function andar(estado: EstadoCameraRts, rumo: Vec3, metros: number): void {
  const angulo = metros / estado.raio;
  if (angulo === 0) return;
  const eixo = normalizar(produtoVetorial(estado.foco, rumo));
  estado.foco = normalizar(girar(estado.foco, eixo, angulo));
  estado.frente = tangente(estado.foco, girar(estado.frente, eixo, angulo)) ?? norteEm(estado.foco);
}

/** Pan relativo à tela: `frente` e `lado` em −1..1 (setas ou bordas). */
export function aplicarPan(
  estado: EstadoCameraRts,
  frente: number,
  lado: number,
  dt: number,
): void {
  if (frente === 0 && lado === 0) return;
  const d = direita(estado);
  const rumo = normalizar([
    estado.frente[0] * frente + d[0] * lado,
    estado.frente[1] * frente + d[1] * lado,
    estado.frente[2] * frente + d[2] * lado,
  ]);
  andar(estado, rumo, C.panPorAltura * Math.min(estado.altura, C.alturaMaxPan_m) * dt);
}

/** Roda do mouse: passos positivos afastam, negativos aproximam (CTL-01, CTL-16). */
export function aplicarZoom(estado: EstadoCameraRts, passos: number): void {
  const alvo = estado.alturaAlvo * C.fatorZoom ** passos;
  estado.alturaAlvo = Math.min(Math.max(alvo, C.alturaMin_m), alturaMaxima(estado));
}

export function rotacionar(estado: EstadoCameraRts, dxPixels: number): void {
  estado.frente = normalizar(girar(estado.frente, estado.foco, -dxPixels * C.rotacaoPorPixel_rad));
}

/** CTL-02: Home volta a olhar para o norte (CEN-15). */
export function voltarAoNorte(estado: EstadoCameraRts): void {
  estado.frente = norteEm(estado.foco, estado.frente);
}

/** Ângulo (rad) da frente em relação ao norte local; 0 = olhando para o norte. */
export function rumoDaCamera(estado: EstadoCameraRts): number {
  const norte = norteEm(estado.foco, estado.frente);
  const leste = normalizar(produtoVetorial(norte, estado.foco));
  return Math.atan2(
    estado.frente[0] * leste[0] + estado.frente[1] * leste[1] + estado.frente[2] * leste[2],
    estado.frente[0] * norte[0] + estado.frente[1] * norte[1] + estado.frente[2] * norte[2],
  );
}

/** CTL-03: centraliza o foco numa direção (minimapa, grupos); a frente é transportada. */
export function centrarEm(estado: EstadoCameraRts, d: Vec3): void {
  const alvo = normalizar(d);
  const eixo = produtoVetorial(estado.foco, alvo);
  const frente =
    Math.hypot(...eixo) < 1e-12
      ? estado.frente
      : girar(estado.frente, normalizar(eixo), arco(estado.foco, alvo));
  estado.foco = alvo;
  estado.frente = tangente(alvo, frente) ?? norteEm(alvo);
}

/** Aproxima a altura da altura-alvo de forma suave, independente do FPS. */
export function atualizarCamera(estado: EstadoCameraRts, dt: number): void {
  const t = 1 - Math.exp(-C.suavizacaoZoom * dt);
  estado.altura += (estado.alturaAlvo - estado.altura) * t;
}

/**
 * Posição da câmera, ponto observado e vetor "cima" da tela, dado o chão sob o foco. O olho
 * fica atrás do foco (contra a frente) e acima dele, na inclinação da altura atual.
 */
export function poseDaCamera(
  estado: EstadoCameraRts,
  chaoNoFoco: number,
): { olho: Vec3; alvo: Vec3; cima: Vec3 } {
  const { foco, frente, altura, raio } = estado;
  const angulo = inclinacao(altura, raio);
  const recuo = angulo >= Math.PI / 2 - 1e-9 ? 0 : altura / Math.tan(angulo);
  const r = raio + chaoNoFoco;
  const alvo: Vec3 = [foco[0] * r, foco[1] * r, foco[2] * r];
  const olho: Vec3 = [
    alvo[0] + foco[0] * altura - frente[0] * recuo,
    alvo[1] + foco[1] * altura - frente[1] * recuo,
    alvo[2] + foco[2] * altura - frente[2] * recuo,
  ];
  // "Cima" da tela: perpendicular à linha de visada, inclinado para a frente.
  const cima = normalizar([
    foco[0] * Math.cos(angulo) + frente[0] * Math.sin(angulo),
    foco[1] * Math.cos(angulo) + frente[1] * Math.sin(angulo),
    foco[2] * Math.cos(angulo) + frente[2] * Math.sin(angulo),
  ]);
  return { olho, alvo, cima };
}
