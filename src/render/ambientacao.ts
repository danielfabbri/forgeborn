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
  /** §14.5: grama no chão, com concreto só nas plataformas e pistas. */
  grama: boolean;
  /** §14.5: campos e montanhas ao fundo, até o horizonte. */
  panorama: boolean;
  /** Névoa de distância (cor do horizonte), ou null. */
  neblina: { perto: number; longe: number } | null;
  /** Altura máxima da câmera (m), ou null (a de CTL-16). */
  tetoCamera: number | null;
  /** Brilho do escuro da névoa de guerra (0 = preto). */
  escuroBrilho: number;
  /**
   * §14.5: o chão longe do ponto focal se funde à cor dos campos ao fundo (esconde a borda do
   * planeta pequeno): distâncias (m) de início e fim e a cor.
   */
  desvanecer: { perto: number; longe: number; cor: Color } | null;
  /** Intensidade do detalhe de regolito (microcrateras) no chão. */
  detalhe: number;
  /** §14.6: disco do Sol no céu, com halo (o "pôr do sol azul" de Marte), ou null. */
  solNoCeu: { cor: Color; halo: Color } | null;
  /**
   * §14.6/CEN-03: como fica o ar na tempestade de poeira (cor da poeira, névoa densa e quanto
   * da luz direta passa), ou null se o cenário não tem tempestade.
   */
  tempestade: { cor: Color; neblina: { perto: number; longe: number }; luz: number } | null;
  /** AUD-02: força do vento de fundo (0 = sem atmosfera). */
  vento: number;
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
  grama: false,
  panorama: false,
  neblina: null,
  tetoCamera: null,
  escuroBrilho: 0,
  desvanecer: null,
  detalhe: 1,
  solNoCeu: null,
  tempestade: null,
  vento: 0,
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
    grama: true,
    panorama: true,
    neblina: { perto: 140, longe: 700 },
    tetoCamera: 50,
    escuroBrilho: 0.3,
    desvanecer: { perto: 40, longe: 80, cor: new Color('#5f7d4a') },
    detalhe: 0,
    solNoCeu: null,
    tempestade: null,
    vento: 0,
  },
  // §14.6: céu caramelo, Sol menor com halo azulado, solo ferrugem, luz quente e difusa.
  marte: {
    ...LUA,
    ceu: new Color('#a8704a'),
    horizonte: new Color('#d4a377'),
    estrelas: false,
    terraNoCeu: false,
    sol: direcao(34, -40),
    intensidadeSol: 2.4,
    ambiente: { cor: new Color('#e0b08a'), intensidade: 0.34 },
    secundaria: { cor: new Color('#d69a6a'), intensidade: 0.3 },
    tinta: [1.9, 1.05, 0.66],
    neblina: { perto: 90, longe: 420 },
    escuroBrilho: 0.12,
    detalhe: 0.8,
    solNoCeu: { cor: new Color('#fff4e0'), halo: new Color('#8fb4e8') },
    tempestade: { cor: new Color('#a8683e'), neblina: { perto: 30, longe: 170 }, luz: 0.55 },
    vento: 0.3,
  },
};

export function ambientacaoDe(cenario: CenariosId): Ambientacao {
  return AMBIENTACOES[cenario] ?? LUA;
}
