/**
 * Câmera RTS (CTL-01, CTL-02): estado e matemática puros, sem DOM nem Three.js.
 * O foco é o ponto do chão para onde a câmera olha; a altura é medida acima do chão do foco.
 * Norte é −z (topo do minimapa); yaw 0 olha para o norte.
 */

/** Números de apresentação da câmera (GOV-04). */
export const CAMERA_RTS = {
  alturaMin_m: 15, // CTL-01
  alturaMax_m: 120, // CTL-01
  alturaInicial_m: 75,
  inclinacaoLonge_graus: 55, // CTL-01
  inclinacaoPerto_graus: 35, // CTL-01
  /** Faixa de altura em que a inclinação passa de 35° para 55°. */
  transicaoInclinacao_m: [15, 50] as const,
  /** Velocidade do pan em múltiplos da altura por segundo (mesma velocidade na tela em qualquer zoom). */
  panPorAltura: 1.3,
  fatorZoom: 1.12,
  suavizacaoZoom: 10,
  rotacaoPorPixel_rad: 0.006,
  bordaTela_px: 12,
} as const;

const C = CAMERA_RTS;

export interface EstadoCameraRts {
  focoX: number;
  focoZ: number;
  altura: number;
  alturaAlvo: number;
  yaw: number;
  /** Metade do lado da área em que o foco pode ficar. */
  limite: number;
}

export function criarEstadoCamera(focoX: number, focoZ: number, limite: number): EstadoCameraRts {
  const estado = {
    focoX,
    focoZ,
    altura: C.alturaInicial_m,
    alturaAlvo: C.alturaInicial_m,
    yaw: 0,
    limite,
  };
  limitarFoco(estado);
  return estado;
}

function suave(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** CTL-01: inclinação (rad) abaixo do horizonte para a altura dada. */
export function inclinacao(altura: number): number {
  const [perto, longe] = C.transicaoInclinacao_m;
  const graus =
    C.inclinacaoPerto_graus +
    (C.inclinacaoLonge_graus - C.inclinacaoPerto_graus) * suave(perto, longe, altura);
  return (graus * Math.PI) / 180;
}

/** Vetores horizontais de frente e de direita da câmera. */
export function eixos(yaw: number): { frente: [number, number]; direita: [number, number] } {
  return {
    frente: [Math.sin(yaw), -Math.cos(yaw)],
    direita: [Math.cos(yaw), Math.sin(yaw)],
  };
}

export function limitarFoco(estado: EstadoCameraRts): void {
  estado.focoX = Math.min(Math.max(estado.focoX, -estado.limite), estado.limite);
  estado.focoZ = Math.min(Math.max(estado.focoZ, -estado.limite), estado.limite);
}

/** Pan relativo à tela: `frente` e `lado` em −1..1 (setas ou bordas). */
export function aplicarPan(
  estado: EstadoCameraRts,
  frente: number,
  lado: number,
  dt: number,
): void {
  if (frente === 0 && lado === 0) return;
  const { frente: f, direita: d } = eixos(estado.yaw);
  const distancia = C.panPorAltura * estado.altura * dt;
  const norma = Math.hypot(frente, lado);
  estado.focoX += ((f[0] * frente + d[0] * lado) / norma) * distancia;
  estado.focoZ += ((f[1] * frente + d[1] * lado) / norma) * distancia;
  limitarFoco(estado);
}

/** Roda do mouse: passos positivos afastam, negativos aproximam (CTL-01). */
export function aplicarZoom(estado: EstadoCameraRts, passos: number): void {
  const alvo = estado.alturaAlvo * C.fatorZoom ** passos;
  estado.alturaAlvo = Math.min(Math.max(alvo, C.alturaMin_m), C.alturaMax_m);
}

export function rotacionar(estado: EstadoCameraRts, dxPixels: number): void {
  estado.yaw += dxPixels * C.rotacaoPorPixel_rad;
}

/** CTL-02: Home volta a olhar para o norte. */
export function voltarAoNorte(estado: EstadoCameraRts): void {
  estado.yaw = 0;
}

/** CTL-03: centraliza o foco num ponto (usado pelo minimapa). */
export function centrarEm(estado: EstadoCameraRts, x: number, z: number): void {
  estado.focoX = x;
  estado.focoZ = z;
  limitarFoco(estado);
}

/** Aproxima a altura da altura-alvo de forma suave, independente do FPS. */
export function atualizarCamera(estado: EstadoCameraRts, dt: number): void {
  const t = 1 - Math.exp(-C.suavizacaoZoom * dt);
  estado.altura += (estado.alturaAlvo - estado.altura) * t;
}

/** Posição da câmera e ponto observado, dado o chão sob o foco. */
export function poseDaCamera(
  estado: EstadoCameraRts,
  chaoNoFoco: number,
): { olho: [number, number, number]; alvo: [number, number, number] } {
  const recuo = estado.altura / Math.tan(inclinacao(estado.altura));
  const { frente } = eixos(estado.yaw);
  return {
    olho: [
      estado.focoX - frente[0] * recuo,
      chaoNoFoco + estado.altura,
      estado.focoZ - frente[1] * recuo,
    ],
    alvo: [estado.focoX, chaoNoFoco, estado.focoZ],
  };
}
