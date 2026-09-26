/**
 * Ambientação por cenário (§18.2, §14.5): céu, Sol, luz ambiente e o tom do chão. Tudo aqui é
 * de apresentação: a simulação não depende desses valores.
 */
import { Color, Vector3 } from 'three';
import type { CenariosId } from '../sim/data';

export interface Ambientacao {
  /** Cor de fundo (céu); null = espaço preto com estrelas. */
  ceu: Color | null;
  /** Cor do horizonte (degradê do céu), quando há céu. */
  horizonte: Color | null;
  estrelas: boolean;
  /** A Terra escura no céu (ART-11). */
  terraNoCeu: boolean;
  /** Sol no referencial local (x = leste, y = cima, z = sul). */
  sol: Vector3;
  intensidadeSol: number;
  ambiente: { cor: Color; intensidade: number };
  /** Luz secundária (Terra ou céu), cor e intensidade. */
  secundaria: { cor: Color; intensidade: number };
  /** Multiplicador da cor do chão. */
  tinta: [number, number, number];
  /** Faixas e marcações pintadas no chão (Campo de testes). */
  marcacoes: boolean;
  /** Gelo nas baixadas sombreadas (Shackleton). */
  gelo: boolean;
}

function direcao(elevacaoGraus: number, azimuteGraus: number): Vector3 {
  const el = (elevacaoGraus * Math.PI) / 180;
  const az = (azimuteGraus * Math.PI) / 180;
  return new Vector3(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az));
}

const LUA: Ambientacao = {
  ceu: null,
  horizonte: null,
  estrelas: true,
  terraNoCeu: true,
  sol: direcao(24, -35),
  intensidadeSol: 3.4,
  ambiente: { cor: new Color(0x8899aa), intensidade: 0.12 },
  secundaria: { cor: new Color(0x7090ff), intensidade: 0.35 },
  tinta: [1, 1, 1],
  marcacoes: false,
  gelo: false,
};

const AMBIENTACOES: Partial<Record<CenariosId, Ambientacao>> = {
  lua: LUA,
  // §18.2: sol rente ao horizonte, luz baixa, sombras eternas e gelo nas baixadas.
  lua_shackleton: {
    ...LUA,
    sol: direcao(11, -60),
    intensidadeSol: 3.0,
    ambiente: { cor: new Color(0x7a88a0), intensidade: 0.16 },
    tinta: [0.92, 0.95, 1.0],
    gelo: true,
  },
  // §14.5: dia claro na Terra, céu azul, concreto com faixas.
  terra_lab: {
    ceu: new Color('#1f5fae'),
    horizonte: new Color('#7fb3e6'),
    estrelas: false,
    terraNoCeu: false,
    sol: direcao(58, -30),
    intensidadeSol: 3.0,
    ambiente: { cor: new Color('#b7cde6'), intensidade: 0.4 },
    secundaria: { cor: new Color('#9cc4ff'), intensidade: 0.5 },
    tinta: [1.75, 1.72, 1.66],
    marcacoes: true,
    gelo: false,
  },
};

export function ambientacaoDe(cenario: CenariosId): Ambientacao {
  return AMBIENTACOES[cenario] ?? LUA;
}
