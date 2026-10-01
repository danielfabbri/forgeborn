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
  /** §14.7/D-93: direção local de Saturno (com anéis) no céu, ou null se o cenário não o mostra. */
  direcaoSaturno: Vector3 | null;
  /** §14.6/§14.7/D-94: luas menores no céu (direção local, raio e cor de cada uma). */
  luasNoCeu: Array<{ direcao: Vector3; raio: number; cor: Color }>;
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
  /** §14.8/D-98: placas de basalto rachadas no lugar do regolito (Vênus). */
  placas: boolean;
  /** §14.5: grama no chão, com concreto só nas plataformas e pistas. */
  grama: boolean;
  /** §14.5: campos e montanhas ao fundo, até o horizonte. */
  panorama: boolean;
  /** Névoa de distância (cor do horizonte), ou null. */
  neblina: { perto: number; longe: number } | null;
  /** Altura máxima da câmera (m), ou null (a de CTL-16). */
  tetoCamera: number | null;
  /** Brilho do escuro da névoa de guerra: a silhueta do relevo nunca visto (VIS-01, D-80). */
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
   * D-95: céu noturno do lado do planeta sem Sol direto (cenários com atmosfera/cúpula), ou
   * null nos que não têm cúpula (Lua) ou ainda não ganharam noite (Terra — Campo de testes).
   */
  noite: { ceu: Color; horizonte: Color; estrelas: boolean } | null;
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

const frac = (x: number): number => x - Math.floor(x);

/** §14.9/D-100: cinturão de asteroides no céu de Ceres — `n` pedras pequenas e espalhadas. */
function cinturaoDeAsteroides(n: number): Array<{ direcao: Vector3; raio: number; cor: Color }> {
  const tons = [0xa89c88, 0x8f8270, 0xb0a48f, 0x9a8c78, 0xc2b6a0];
  return Array.from({ length: n }, (_, i) => ({
    // Perto do horizonte (o cinturão fica perto do plano da eclíptica, visto da superfície).
    direcao: direcao(5 + 45 * frac(i * 0.618034), 360 * frac(i * 0.414214) - 180),
    raio: 2.2 + frac(i * 0.732051) * 2.6,
    cor: new Color(tons[i % tons.length]!),
  }));
}

const LUA: Ambientacao = {
  ceu: null,
  horizonte: null,
  estrelas: true,
  terraNoCeu: true,
  direcaoSaturno: null,
  luasNoCeu: [],
  sol: direcao(24, -35),
  intensidadeSol: 3.4,
  // D-93/D-94: sol fixo revela um lado escuro de verdade; a ambiente garante que ele continue
  // jogável (nunca preto puro, ART-11) — o produto reportou D-93 escuro demais, então o valor
  // subiu bem mais que o ajuste inicial.
  ambiente: { cor: new Color(0x8899aa), intensidade: 2.5 },
  secundaria: { cor: new Color(0x7090ff), intensidade: 0.35 },
  tinta: [1, 1, 1],
  marcacoes: false,
  gelo: false,
  placas: false,
  grama: false,
  panorama: false,
  neblina: null,
  tetoCamera: null,
  escuroBrilho: 0.2,
  desvanecer: null,
  detalhe: 1,
  solNoCeu: null,
  // D-95: sem cúpula, o céu da Lua já é sempre o espaço preto estrelado — não muda com o Sol.
  noite: null,
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
    ambiente: { cor: new Color(0x7a88a0), intensidade: 2.2 },
    tinta: [0.92, 0.95, 1.0],
    gelo: true,
  },
  // §14.5: dia claro na Terra, céu azul, concreto com faixas.
  terra_lab: {
    ceu: new Color('#1f5fae'),
    horizonte: new Color('#7fb3e6'),
    estrelas: false,
    terraNoCeu: false,
    direcaoSaturno: null,
    luasNoCeu: [],
    sol: direcao(58, -30),
    intensidadeSol: 3.0,
    ambiente: { cor: new Color('#b7cde6'), intensidade: 0.4 },
    secundaria: { cor: new Color('#9cc4ff'), intensidade: 0.5 },
    tinta: [1.75, 1.72, 1.66],
    marcacoes: true,
    gelo: false,
    placas: false,
    grama: true,
    panorama: true,
    neblina: { perto: 140, longe: 700 },
    tetoCamera: 50,
    escuroBrilho: 0.3,
    desvanecer: { perto: 40, longe: 80, cor: new Color('#5f7d4a') },
    detalhe: 0,
    solNoCeu: null,
    // D-95: Campo de testes não ganha noite por enquanto (pedido do produto restringe a Marte
    // e Titã); a câmera também não costuma sair da área do tutorial.
    noite: null,
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
    direcaoSaturno: null,
    // §14.6/D-94: Fobos (mais perto e maior) e Deimos (menor e mais fraco), pequenos no céu.
    luasNoCeu: [
      { direcao: direcao(20, 60), raio: 6, cor: new Color(0x9a8f82) },
      { direcao: direcao(50, 95), raio: 3.5, cor: new Color(0x8a8378) },
    ],
    sol: direcao(34, -40),
    intensidadeSol: 2.4,
    // D-94: idem Lua — o lado escuro precisa ficar jogável.
    ambiente: { cor: new Color('#e0b08a'), intensidade: 1.8 },
    secundaria: { cor: new Color('#d69a6a'), intensidade: 0.3 },
    tinta: [1.9, 1.05, 0.66],
    neblina: { perto: 90, longe: 420 },
    escuroBrilho: 0.2,
    detalhe: 0.8,
    solNoCeu: { cor: new Color('#fff4e0'), halo: new Color('#8fb4e8') },
    // D-95: do lado sem Sol direto, o céu fica noturno — atmosfera fina, quase preto, com
    // estrelas (ao contrário de Titã, cuja neblina espessa as esconde mesmo de noite).
    noite: { ceu: new Color('#0a0503'), horizonte: new Color('#1c0f08'), estrelas: true },
    tempestade: { cor: new Color('#a8683e'), neblina: { perto: 30, longe: 170 }, luz: 0.55 },
    vento: 0.3,
  },
  // §14.7: céu laranja nebuloso, penumbra, gelo e sedimentos, névoa densa; o Sol só um brilho.
  tita: {
    ...LUA,
    ceu: new Color('#5e3517'),
    horizonte: new Color('#7e5028'),
    estrelas: false,
    terraNoCeu: false,
    // §14.7/D-93: Saturno, enorme, e três de suas outras luas, em direções fixas.
    direcaoSaturno: direcao(32, 130),
    luasNoCeu: [
      { direcao: direcao(18, 152), raio: 9, cor: new Color(0xcac2b4) },
      { direcao: direcao(48, 108), raio: 12, cor: new Color(0xcac2b4) },
      { direcao: direcao(8, 172), raio: 15, cor: new Color(0xcac2b4) },
    ],
    sol: direcao(42, -25),
    intensidadeSol: 1.1,
    ambiente: { cor: new Color('#e0a060'), intensidade: 0.5 },
    secundaria: { cor: new Color('#b8743a'), intensidade: 0.3 },
    tinta: [1.3, 1.15, 0.95],
    neblina: { perto: 90, longe: 420 },
    escuroBrilho: 0.2,
    detalhe: 0.6,
    solNoCeu: { cor: new Color('#e9b77a'), halo: new Color('#dfa05c') },
    // D-95: do lado sem Sol direto, a neblina espessa de Titã escurece bem mais, mas não some
    // — continua sem estrelas (a neblina as esconde de dia e de noite).
    noite: { ceu: new Color('#180d05'), horizonte: new Color('#2a180d'), estrelas: false },
    vento: 0.25,
  },
  // §14.8/D-98: céu amarelo opaco (como nas fotos da Venera), sol difuso, solo de basalto
  // rachado em placas, névoa mais densa que Marte e Titã; nuvens espessas o tempo todo, de dia
  // e de noite (sem estrelas nunca, D-98 estende D-95 sem mudar isso).
  venus: {
    ...LUA,
    ceu: new Color('#cbaa3a'),
    horizonte: new Color('#e9d268'),
    estrelas: false,
    terraNoCeu: false,
    direcaoSaturno: null,
    luasNoCeu: [],
    sol: direcao(38, -30),
    intensidadeSol: 1.3,
    ambiente: { cor: new Color('#cdb258'), intensidade: 2.0 },
    secundaria: { cor: new Color('#b2922e'), intensidade: 0.35 },
    tinta: [0.85, 0.76, 0.52],
    placas: true,
    neblina: { perto: 60, longe: 260 },
    escuroBrilho: 0.2,
    detalhe: 0.7,
    solNoCeu: { cor: new Color('#fff0ba'), halo: new Color('#e8c850') },
    // D-98: do lado sem Sol direto, fica escuro (mas não preto) — a neblina espessa de Vênus
    // esconde o espaço de dia e de noite, então, ao contrário de Marte, nunca aparecem estrelas.
    noite: { ceu: new Color('#1c1808'), horizonte: new Color('#2e2710'), estrelas: false },
    // CEN-18: chuva ácida (reaproveita o mesmo campo/pipeline da tempestade de poeira, CEN-03),
    // com névoa mais fechada e um tom esverdeado doentio, distinto do amarelo do dia comum.
    tempestade: { cor: new Color('#7a9c2a'), neblina: { perto: 25, longe: 140 }, luz: 0.5 },
    vento: 0.35,
  },
  // §14.9/D-99: atmosfera tênue demais pra espalhar luz — sem céu colorido, o Sol aparece num
  // céu preto estrelado mesmo "de dia" (como a Lua), mas o solo é bem mais escuro (regolito
  // carbonáceo) e o Sol, bem mais fraco (Ceres orbita quase 3× mais longe que a Lua).
  ceres: {
    ...LUA,
    terraNoCeu: false,
    // D-100: o cinturão de asteroides, visível no céu (~30 pedras pequenas e espalhadas).
    luasNoCeu: cinturaoDeAsteroides(30),
    sol: direcao(28, -40),
    intensidadeSol: 2.0,
    ambiente: { cor: new Color(0x8892a0), intensidade: 2.2 },
    // Sem corpo próximo e brilhante por perto (nem Terra, nem Saturno): a luz secundária é fraca.
    secundaria: { cor: new Color(0x6878a0), intensidade: 0.08 },
    tinta: [0.55, 0.52, 0.5],
    vento: 0,
  },
};

export function ambientacaoDe(cenario: CenariosId): Ambientacao {
  return AMBIENTACOES[cenario] ?? LUA;
}
