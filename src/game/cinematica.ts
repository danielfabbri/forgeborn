/**
 * Cinemática de pouso (FLX-09): em `duracao_pouso_s`, a Nave do jogador desce, levanta poeira,
 * abre a rampa e o primeiro Hover de Exploração sai. Pula com Esc, Espaço ou clique. A
 * simulação fica parada durante a cinemática (o relógio da partida começa em 0:00 ao fim):
 * tudo aqui é só visual. As proporções da linha do tempo e da câmera são de apresentação.
 */
import type { Vec3 } from '../sim/map/esfera';
import { avancar, norteEm, produtoVetorial } from '../sim/map/esfera';

/** Frações da linha do tempo: descida, poeira do toque, rampa e saída do hover. */
const FIM_DA_DESCIDA = 0.55;
const INICIO_DA_RAMPA = 0.62;
const FIM_DA_RAMPA = 0.78;
/** Altura (m) de onde a Nave começa a descer e o raio/altura da câmera em volta dela. */
const ALTURA_INICIAL_M = 90;
const DISTANCIA_CAMERA_M = 42;
const ALTURA_CAMERA_M = 11;

export interface EstadoDaCinematica {
  /** Altura extra (m) da Nave sobre o chão. */
  alturaDaNave: number;
  /** 0 fechada, 1 aberta. */
  aberturaDaRampa: number;
  /** 0 dentro da Nave, 1 no lugar de saída. */
  saidaDoHover: number;
  /** A Nave está perto do chão (a poeira sobe). */
  poeira: boolean;
}

const suave = (t: number) => t * t * (3 - 2 * t);
const faixa = (f: number, a: number, b: number) => Math.min(1, Math.max(0, (f - a) / (b - a)));

/** O que a cinemática mostra na fração `f` (0..1) do tempo. */
export function estadoEm(f: number): EstadoDaCinematica {
  const descida = suave(faixa(f, 0, FIM_DA_DESCIDA));
  const alturaDaNave = ALTURA_INICIAL_M * (1 - descida) * (1 - descida);
  return {
    alturaDaNave,
    aberturaDaRampa: suave(faixa(f, INICIO_DA_RAMPA, FIM_DA_RAMPA)),
    saidaDoHover: suave(faixa(f, FIM_DA_RAMPA, 1)),
    poeira: alturaDaNave < 25 && f < INICIO_DA_RAMPA + 0.05,
  };
}

/** Câmera da cinemática: gira devagar em volta da zona de pouso, olhando a Nave. */
export function poseDaCinematica(
  zona: Vec3,
  raio: number,
  chao: number,
  f: number,
  alturaDaNave: number,
): { olho: Vec3; alvo: Vec3; cima: Vec3 } {
  const norte = norteEm(zona);
  const leste = produtoVetorial(norte, zona);
  const angulo = -0.9 + f * 0.8;
  const rumo: Vec3 = [
    norte[0] * Math.cos(angulo) + leste[0] * Math.sin(angulo),
    norte[1] * Math.cos(angulo) + leste[1] * Math.sin(angulo),
    norte[2] * Math.cos(angulo) + leste[2] * Math.sin(angulo),
  ];
  const d = avancar(zona, rumo, DISTANCIA_CAMERA_M / raio).p;
  // A câmera fica baixa e inclina para acompanhar a Nave que desce do céu.
  const rOlho = raio + chao + ALTURA_CAMERA_M;
  const rAlvo = raio + chao + 6 + alturaDaNave;
  return {
    olho: [d[0] * rOlho, d[1] * rOlho, d[2] * rOlho],
    alvo: [zona[0] * rAlvo, zona[1] * rAlvo, zona[2] * rAlvo],
    cima: d,
  };
}
