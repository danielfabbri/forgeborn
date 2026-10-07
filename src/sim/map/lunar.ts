/**
 * Gerador de planetas lunares por seed (CEN-06 a CEN-09, CEN-14).
 *
 * Simetria exata: crateras, colinas e sulcos são sorteados uma vez e replicados pelas rotações
 * do grupo (CEN-06); o ruído é a soma das rotações. As alturas são calculadas só num vértice de
 * cada órbita do grupo e copiadas para os outros, então amostras simétricas são idênticas.
 *
 * Cada feição usa coordenadas locais no plano tangente ao seu centro: distância pelo arco
 * (CEN-14) e ângulo a partir de um rumo de referência que gira junto com a feição.
 */
import { nextFloat, nextU32, type RngState, seedRng } from '../core/rng';
import { param } from '../data';
import {
  aplicarRotacao,
  arco,
  avancar,
  celulasPorAresta,
  girar,
  normalizar,
  norteEm,
  produtoEscalar,
  produtoVetorial,
  rotacoesDeSimetria,
  type Simetria,
  TAU,
  tangente,
  type Vec3,
} from './esfera';
import {
  codificarAltura,
  direcaoDoVertice,
  type Heightmap,
  indiceDoVertice,
  verticeRotacionado,
} from './heightmap';
import { fbm3 } from './noise';
import type { Pedra } from './pedras';

export type { Simetria };

/** Números do gerador (GOV-04). Os que vêm do SPEC citam a regra. */
export const GERADOR_LUA = {
  raioPlato: 50, // CEN-08
  /** O topo plano vai um pouco além dos 50 m para a borda do platô também medir 0°. */
  folgaTopo: 2,
  alturaPlato: 6,
  larguraPenhasco: 5,
  larguraRampa: 16, // CEN-08: ≥ 12 m
  ombroRampa: 4,
  comprimentoRampa: 32,
  /** Jitter do rumo das rampas em torno da direção dos pontos médios. */
  desvioRampa_graus: 20,
  /** Pontos médios livres de feições: 40 m + a queda externa máxima de uma borda (16 m). */
  raioLivreCentro: 56,
  crateraBordaMax: 8, // CEN-09
  /**
   * CEN-09: raios entre 10 e 60 m. Densidade em crateras por 10.000 m².
   * Colocadas das maiores para as menores, para as pequenas preencherem os vãos.
   */
  classesCratera: [
    { raio: [35, 60], densidade: 0.08, brechas: [1, 2] },
    { raio: [20, 35], densidade: 0.3, brechas: [1, 2] },
    { raio: [10, 20], densidade: 0.8, brechas: [0, 0] },
  ],
  tentativas: 80,
  larguraBrecha: 14,
  ombroBrecha: 5,
  colinas: { densidade: 0.5, altura: [2, 6], sigma: [15, 40] },
  sulcos: { porSetor: [0, 1], comprimento: [60, 140], largura: [10, 14], profundidade: [1, 2] },
  /**
   * CEN-20 (D-108): placas tectônicas — o planeta inteiro dividido em células (diagrama de
   * Voronoi dos centros sorteados); a fronteira entre duas células vira uma fenda de verdade
   * (fundo estreito, paredes íngremes demais pra atravessar). `aberturaFrequencia`/`aberturaLimiar`
   * abrem vãos (pontes) ao longo da fronteira, por um ruído separado do relevo.
   */
  placas: {
    porSetor: [2, 3],
    meiaLargura: [2, 3],
    paredeLargura: [2, 3],
    profundidade: [14, 20],
    aberturaOitavas: 1,
    aberturaFrequencia: 1 / 120,
    aberturaLimiar: 0.12,
  },
  ruido: { amplitude: 2.4, oitavas: 4, frequencia: 1 / 80 },
  /** Folga entre obstáculos e o penhasco do platô ou o corredor de uma rampa. */
  folgaZona: 8,
  folgaCorredor: 6,
  /** Quanto o corredor protegido passa do fim da rampa. */
  saidaRampa: 20,
  /** Resolução do heightmap: ~1 m entre vértices (CEN-13). */
  texel_m: 1,
  /**
   * CEN-04 (D-90): mares. Um campo de ruído simétrico (`frequencia`, `oitavas`) define as bacias;
   * o limiar sai das `amostras` para cobrir `mar_cobertura_pct`. Na faixa `banda` (unidades do
   * campo) a costa desce até o líquido; o fundo fica `profundidade` abaixo do nível; a terra da
   * costa fica `margem` acima. `nivelQuantil`: o nível do líquido é esse quantil do relevo natural
   * (fundos de cratera abaixo dele viram lagos). `folgaCentro_m`: terra em volta dos pontos médios.
   */
  mar: {
    frequencia: 1 / 320,
    oitavas: 3,
    banda: 0.16,
    /** Ruído de detalhe (ilhas e recortes da costa). */
    ilhas: { frequencia: 1 / 90, peso: 0.45 },
    profundidade: 4,
    margem: 0.3,
    amostras: 6000,
    nivelQuantil: 0.02,
    folgaCentro_m: 70,
  },
  /** CEN-17: vão mínimo (m) entre pedras, para um hover passar, e tentativas por pedra. */
  pedra: { vao: 5, tentativas: 20 },
} as const;

const G = GERADOR_LUA;

export interface ZonaDePouso {
  /** Centro (direção unitária). */
  d: Vec3;
  /** Rumo tangente de cada rampa de saída. */
  rampas: Vec3[];
}

/** Ponto médio entre zonas de pouso (ECO-08): contestado ou central. */
export interface PontoMedio {
  d: Vec3;
  zonasDePouso: [number, number];
}

export interface Cratera {
  d: Vec3;
  /** Rumo de referência para os ângulos da borda. */
  ref: Vec3;
  raio: number;
  profundidade: number;
  borda: number;
  /** Ângulos (rad, a partir de `ref`) das brechas na borda. */
  brechas: number[];
  fase1: number;
  fase2: number;
}

interface Colina {
  d: Vec3;
  altura: number;
  sigma: number;
}

interface Sulco {
  /** Pontos da linha, já na superfície (m). */
  pontos: Vec3[];
  /** Centro e alcance angular, para descartar rápido. */
  centro: Vec3;
  cosAlcance: number;
  largura: number;
  profundidade: number;
}

/** CEN-20 (D-108): centro de uma placa tectônica — só a direção; a fronteira é implícita (a
 * fenda nasce onde duas placas ficam equidistantes, não num traçado próprio). */
export interface Placa {
  d: Vec3;
}

export interface MapaLunar extends Heightmap {
  seed: number;
  /** Raio do planeta (m): o `raio_m` do cenário (CEN-16). */
  raio: number;
  simetria: Simetria;
  zonasDePouso: ZonaDePouso[];
  contestados: PontoMedio[];
  centrais: PontoMedio[];
  /** Todas as crateras, já replicadas. */
  crateras: Cratera[];
  /** Centros das placas tectônicas, já replicados (D-108); a rede de fendas entre elas é
   * calculada por ponto, não guardada aqui (ver `alturaPlacas`). */
  placas: Placa[];
  /** Pontos fixos pra efeitos de jogo (gêiseres, D-106/D-108): no fundo da fenda, longe das
   * pontes/vãos. */
  pontosDeFenda: Vec3[];
}

/** CEN-07 e ECO-08: zonas de pouso e pontos médios de cada simetria. */
export function geometriaDasZonas(n: Simetria): {
  zonas: Vec3[];
  contestados: PontoMedio[];
  centrais: PontoMedio[];
} {
  if (n === 2) {
    return {
      zonas: [
        [0, 0, 1],
        [0, 0, -1],
      ],
      contestados: [
        { d: [0, 1, 0], zonasDePouso: [0, 1] },
        { d: [0, -1, 0], zonasDePouso: [0, 1] },
      ],
      centrais: [
        { d: [1, 0, 0], zonasDePouso: [0, 1] },
        { d: [-1, 0, 0], zonasDePouso: [0, 1] },
      ],
    };
  }
  const zona0 = normalizar([1, 1, 1]);
  const zonas = rotacoesDeSimetria(4).map((sigma) => aplicarRotacao(sigma, zona0));
  return {
    zonas,
    // Z0+Z1 = +x, Z2+Z3 = −x, Z0+Z3 = +z, Z1+Z2 = −z; os centrais são ±y (Z0+Z2 e Z1+Z3).
    contestados: [
      { d: [1, 0, 0], zonasDePouso: [0, 1] },
      { d: [-1, 0, 0], zonasDePouso: [2, 3] },
      { d: [0, 0, 1], zonasDePouso: [0, 3] },
      { d: [0, 0, -1], zonasDePouso: [1, 2] },
    ],
    centrais: [
      { d: [0, 1, 0], zonasDePouso: [0, 2] },
      { d: [0, -1, 0], zonasDePouso: [1, 3] },
    ],
  };
}

/** Rumo tangente do "fundo" do platô: o meio do maior vão entre as rampas. */
export function rumoSemRampa(zona: ZonaDePouso): Vec3 {
  const ref = zona.rampas[0]!;
  const e2 = produtoVetorial(zona.d, ref);
  const angulos = zona.rampas
    .map((u) => (Math.atan2(produtoEscalar(u, e2), produtoEscalar(u, ref)) + TAU) % TAU)
    .sort((a, b) => a - b);
  let meio = 0;
  let maiorVao = -1;
  angulos.forEach((a, k) => {
    const b = k + 1 < angulos.length ? angulos[k + 1]! : angulos[0]! + TAU;
    if (b - a > maiorVao) {
      maiorVao = b - a;
      meio = (a + b) / 2;
    }
  });
  return normalizar(girar(ref, zona.d, meio));
}

function clamp01(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

function smoothstep(a: number, b: number, x: number): number {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}

function diferencaAngular(a: number, b: number): number {
  let d = (a - b) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

function entre(rng: RngState, [a, b]: readonly [number, number]): number {
  return a + (b - a) * nextFloat(rng);
}

function inteiroEntre(rng: RngState, [a, b]: readonly [number, number]): number {
  return a + Math.floor(nextFloat(rng) * (b - a + 1));
}

/** Direção uniforme na esfera. */
function direcaoSorteada(rng: RngState): Vec3 {
  const z = 2 * nextFloat(rng) - 1;
  const phi = TAU * nextFloat(rng);
  const r = Math.sqrt(Math.max(0, 1 - z * z));
  return [r * Math.cos(phi), z, r * Math.sin(phi)];
}

/** Rumo tangente sorteado em d. */
function rumoSorteado(rng: RngState, d: Vec3): Vec3 {
  return normalizar(girar(norteEm(d), d, TAU * nextFloat(rng)));
}

/**
 * Coordenadas locais (m) de p no plano tangente ao centro c: x ao longo de `ref`, y ao longo de
 * c × ref, e a distância pelo arco.
 */
function local(c: Vec3, ref: Vec3, p: Vec3, raio: number): { x: number; y: number; d: number } {
  const d = raio * arco(c, p);
  const t = tangente(c, p);
  if (!t) return { x: 0, y: 0, d };
  const e2 = produtoVetorial(c, ref);
  return { x: d * produtoEscalar(t, ref), y: d * produtoEscalar(t, e2), d };
}

/** Contribuição de uma cratera para a altura na direção p. */
export function alturaCratera(c: Cratera, p: Vec3, raioPlaneta: number): number {
  const alcance = c.raio * 1.6 + 8;
  if (produtoEscalar(c.d, p) < Math.cos(Math.min(Math.PI, alcance / raioPlaneta))) return 0;
  const { x, y, d } = local(c.d, c.ref, p, raioPlaneta);
  if (d > alcance) return 0;
  const theta = Math.atan2(y, x);
  const raio =
    c.raio * (1 + 0.05 * Math.sin(3 * theta + c.fase1) + 0.03 * Math.sin(5 * theta + c.fase2));
  const rho = d / raio;
  const larguraExterna = Math.min(0.3 * raio, 8) / raio;
  const normal =
    rho < 1
      ? -c.profundidade + (c.profundidade + c.borda) * rho * rho * rho
      : c.borda * Math.exp(-(((rho - 1) / larguraExterna) ** 2));
  if (c.brechas.length === 0) return normal;

  const meiaLargura = G.larguraBrecha / 2 / raio;
  const ombro = G.ombroBrecha / raio;
  let g = 0;
  for (const brecha of c.brechas) {
    const delta = Math.abs(diferencaAngular(theta, brecha));
    g = Math.max(g, 1 - smoothstep(meiaLargura, meiaLargura + ombro, delta));
  }
  if (g <= 0) return normal;
  const perfilBrecha = rho < 1 ? -c.profundidade * (1 - rho) : 0;
  return normal + (perfilBrecha - normal) * g;
}

/** Distância (m) de P ao segmento AB, em 3D (a corda ≈ o arco para trechos curtos). */
function distanciaAoSegmento3(p: Vec3, a: Vec3, b: Vec3): number {
  const v: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const w: Vec3 = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
  const t = clamp01(produtoEscalar(w, v) / produtoEscalar(v, v));
  return Math.hypot(w[0] - v[0] * t, w[1] - v[1] * t, w[2] - v[2] * t);
}

function alturaSulco(s: Sulco, p: Vec3, raioPlaneta: number): number {
  if (produtoEscalar(s.centro, p) < s.cosAlcance) return 0;
  const P: Vec3 = [p[0] * raioPlaneta, p[1] * raioPlaneta, p[2] * raioPlaneta];
  let menor = Infinity;
  for (let k = 0; k < s.pontos.length - 1; k++) {
    menor = Math.min(menor, distanciaAoSegmento3(P, s.pontos[k]!, s.pontos[k + 1]!));
  }
  if (menor >= s.largura) return 0;
  const q = 1 - (menor / s.largura) ** 2;
  return -s.profundidade * q * q;
}

export interface OpcoesPlaca {
  /** Meia largura (m) do fundo plano, na profundidade máxima. */
  meiaLargura: number;
  /** Largura (m) da parede, do fundo até o nível do chão ao redor. */
  paredeLargura: number;
  profundidade: number;
}

/**
 * CEN-20 (D-108): distância (m) de p até a fronteira mais próxima entre placas tectônicas
 * (diagrama de Voronoi dos centros). Perto do centro mais próximo (`d1`) e bem longe do segundo
 * mais próximo (`d2`), p está fundo na célula, longe de qualquer fronteira. A fronteira (onde os
 * dois empatam) fica a uma distância local ≈ raio × (d2 − d1) / 2 do ponto (aproximação de plano
 * tangente, boa na escala de uma fenda). Barata (só arcos): é o que decide, por vértice, se vale a
 * pena chamar `alturaPlacas` (que amostra ruído, mais caro) — evita pagar o ruído longe de toda
 * fronteira, que é a vasta maioria da esfera.
 */
export function distanciaDaFronteira(placas: Placa[], p: Vec3, raioPlaneta: number): number {
  let d1 = Infinity;
  let d2 = Infinity;
  for (const placa of placas) {
    const d = arco(placa.d, p);
    if (d < d1) {
      d2 = d1;
      d1 = d;
    } else if (d < d2) {
      d2 = d;
    }
  }
  return (raioPlaneta * (d2 - d1)) / 2;
}

/**
 * Altura da fronteira a `distancia_m` dela (ver `distanciaDaFronteira`): fundo plano até
 * `meiaLargura`, parede reta até `meiaLargura + paredeLargura`, íngreme o bastante (profundidade
 * grande, parede estreita) pra passar de `inclinacao_max_hover_graus`. `fechamento` (0 a 1,
 * D-108) abre vãos: 0 fecha a fenda por completo (vira uma ponte).
 */
export function alturaPlacas(distancia_m: number, o: OpcoesPlaca, fechamento: number): number {
  if (fechamento <= 0) return 0;
  if (distancia_m >= o.meiaLargura + o.paredeLargura) return 0;
  const profundidade = o.profundidade * fechamento;
  if (distancia_m <= o.meiaLargura) return -profundidade;
  const t = (distancia_m - o.meiaLargura) / o.paredeLargura;
  return -profundidade * (1 - t);
}

export function gerarMapaLunar(
  seed: number,
  raio: number,
  n: Simetria,
  /** CEN-09 (D-98): multiplica a quantidade de crateras e sulcos do cenário (CEN-02). */
  multCratera = 1,
  /** CEN-09 (D-98): multiplica a altura das colinas e do ruído fino do cenário (CEN-02). */
  multRelevo = 1,
  /** CEN-09 (D-106): multiplica a quantidade de colinas do cenário (relevo mais acidentado). */
  multColinas = 1,
  /** CEN-09 (D-106): multiplica a quantidade de fendas do cenário; 0 (padrão) é sem fendas. */
  multFendas = 0,
  /** CEN-04 (D-90): o cenário tem líquido na superfície (mares). */
  comMar = false,
  /** Metros entre vértices: 1 no jogo (CEN-13); maior só para prévias. */
  texel: number = G.texel_m,
): MapaLunar {
  if (!(raio > 0)) throw new Error(`Raio de mapa inválido: ${raio}`);
  const R = raio;
  const grupo = rotacoesDeSimetria(n);
  const rng = seedRng(seed);
  const seedRuido = nextU32(rng) | 0;
  const geo = geometriaDasZonas(n);

  // CEN-08: 2 ou 3 rampas por zona, rumo aos pontos médios vizinhos, com um desvio sorteado.
  const zona0 = geo.zonas[0]!;
  const vizinhos0 = [...geo.contestados, ...geo.centrais].filter((m) => m.zonasDePouso.includes(0));
  const contestados0 = vizinhos0.filter((m) => geo.contestados.includes(m));
  const centrais0 = vizinhos0.filter((m) => geo.centrais.includes(m));
  const tres = inteiroEntre(rng, [2, 3]) === 3;
  const alvosRampa = tres
    ? [...contestados0.slice(0, 2), centrais0[Math.floor(nextFloat(rng) * centrais0.length)]!]
    : contestados0.slice(0, 2);
  const desvio = (entre(rng, [-1, 1]) * G.desvioRampa_graus * Math.PI) / 180;
  const rampas0 = alvosRampa.map((m) => normalizar(girar(tangente(zona0, m.d)!, zona0, desvio)));
  const zonasDePouso: ZonaDePouso[] = grupo.map((sigma) => ({
    d: aplicarRotacao(sigma, zona0),
    rampas: rampas0.map((r) => aplicarRotacao(sigma, r)),
  }));

  const area = 4 * Math.PI * R * R;
  const topo = G.raioPlato + G.folgaTopo;
  const alcanceCorredor = topo + G.comprimentoRampa + G.saidaRampa;
  const meiaLarguraCorredor = G.larguraRampa / 2 + G.ombroRampa + G.folgaCorredor;

  /** Um obstáculo de raio `raio` em p não encosta no penhasco nem nos corredores das rampas. */
  const respeitaZonas = (p: Vec3, raio: number): boolean =>
    zonasDePouso.every((zona) => {
      const distancia = R * arco(zona.d, p);
      if (distancia < topo + G.larguraPenhasco + G.folgaZona + raio) return false;
      if (distancia > alcanceCorredor + raio + meiaLarguraCorredor) return true;
      return zona.rampas.every((u) => {
        const { x, y } = local(zona.d, u, p, R);
        const aoSegmento =
          x < 0
            ? Math.hypot(x, y)
            : x > alcanceCorredor
              ? Math.hypot(x - alcanceCorredor, y)
              : Math.abs(y);
        return aoSegmento >= raio + meiaLarguraCorredor;
      });
    });
  // Pontos médios (contestados e centrais) ficam livres de feições, para caber as jazidas.
  const pontosMedios = [...geo.contestados, ...geo.centrais];
  const longeDosCentrais = (p: Vec3, raio: number): boolean =>
    pontosMedios.every((m) => R * arco(m.d, p) >= G.raioLivreCentro + raio);
  const replicas = (p: Vec3): Vec3[] => grupo.map((sigma) => aplicarRotacao(sigma, p));

  // Crateras (CEN-09). Sem crateras (`multCratera` 0), nem o sorteio da quantidade roda: mantém a
  // sequência do RNG (e as seeds curadas) idêntica à de antes do multiplicador existir.
  const crateras: Cratera[] = [];
  for (const classe of multCratera > 0 ? G.classesCratera : []) {
    const quantidade = Math.floor(
      (classe.densidade * multCratera * area) / n / 10000 + nextFloat(rng),
    );
    for (let c = 0; c < quantidade; c++) {
      for (let tentativa = 0; tentativa < G.tentativas; tentativa++) {
        const raio = entre(rng, classe.raio);
        const p = direcaoSorteada(rng);
        if (!longeDosCentrais(p, raio)) continue;
        // Alcance visível da borda: raio + duas larguras da queda externa.
        if (!respeitaZonas(p, raio + 2 * Math.min(0.3 * raio, 8))) continue;
        const copias = replicas(p);
        if (copias.slice(1).some((q) => R * arco(p, q) < 1.8 * raio)) continue;
        if (crateras.some((o) => R * arco(p, o.d) < 0.9 * (raio + o.raio))) continue;

        const profundidade = Math.min(Math.max(0.2 * raio, 2), 10);
        const borda = Math.min(Math.max(0.14 * raio, 1.2), G.crateraBordaMax);
        const brechas = Array.from({ length: inteiroEntre(rng, classe.brechas) }, () =>
          entre(rng, [0, TAU]),
        );
        const fase1 = entre(rng, [0, TAU]);
        const fase2 = entre(rng, [0, TAU]);
        const ref = rumoSorteado(rng, p);
        for (const sigma of grupo) {
          crateras.push({
            d: aplicarRotacao(sigma, p),
            ref: aplicarRotacao(sigma, ref),
            raio,
            profundidade,
            borda,
            brechas,
            fase1,
            fase2,
          });
        }
        break;
      }
    }
  }

  // Colinas suaves.
  const colinas: Colina[] = [];
  const quantidadeColinas = Math.floor(
    (G.colinas.densidade * multColinas * area) / n / 10000 + nextFloat(rng),
  );
  for (let c = 0; c < quantidadeColinas; c++) {
    for (let tentativa = 0; tentativa < G.tentativas; tentativa++) {
      const sigma = entre(rng, G.colinas.sigma);
      const altura = entre(rng, G.colinas.altura);
      const p = direcaoSorteada(rng);
      if (!longeDosCentrais(p, sigma)) continue;
      if (!respeitaZonas(p, 2 * sigma)) continue;
      const h = altura * multRelevo;
      for (const q of replicas(p)) colinas.push({ d: q, altura: h, sigma });
      break;
    }
  }

  // Sulcos (canais rasos e sinuosos), andando pela superfície com o rumo girando aos poucos.
  const sulcos: Sulco[] = [];
  const quantidadeSulcos =
    multCratera > 0 ? Math.round(inteiroEntre(rng, G.sulcos.porSetor) * multCratera) : 0;
  for (let c = 0; c < quantidadeSulcos; c++) {
    for (let tentativa = 0; tentativa < 20; tentativa++) {
      const largura = entre(rng, G.sulcos.largura);
      const profundidade = entre(rng, G.sulcos.profundidade);
      const comprimento = entre(rng, G.sulcos.comprimento);
      const curva = entre(rng, [-0.9, 0.9]);
      const inicio = direcaoSorteada(rng);
      let estado = { p: inicio, rumo: rumoSorteado(rng, inicio) };
      const pontos: Vec3[] = [estado.p];
      for (let s = 0; s < 16; s++) {
        estado = avancar(estado.p, estado.rumo, comprimento / 16 / R);
        estado.rumo = normalizar(girar(estado.rumo, estado.p, curva / 16));
        pontos.push(estado.p);
      }
      const valido = pontos.every((p) => longeDosCentrais(p, largura) && respeitaZonas(p, largura));
      if (!valido) continue;
      const meio = pontos[8]!;
      const alcance = comprimento / 2 + largura + 2;
      for (const sigma of grupo) {
        sulcos.push({
          pontos: pontos.map((p) => {
            const q = aplicarRotacao(sigma, p);
            return [q[0] * R, q[1] * R, q[2] * R] as Vec3;
          }),
          centro: aplicarRotacao(sigma, meio),
          cosAlcance: Math.cos(Math.min(Math.PI, alcance / R)),
          largura,
          profundidade,
        });
      }
      break;
    }
  }

  // Placas tectônicas (CEN-20, D-108): centros sorteados pelo planeta e replicados pela simetria;
  // a fenda nasce na fronteira entre duas placas vizinhas (diagrama de Voronoi, ver `alturaPlacas`
  // e `fechamentoEm` abaixo) — não um traçado próprio por placa. `multFendas` 0 (padrão) pula o
  // sorteio inteiro, mantendo a sequência do RNG igual a antes da feição existir.
  const placas: Placa[] = [];
  const opcoesPlacas = { meiaLargura: 0, paredeLargura: 0, profundidade: 0 };
  let seedAbertura = 0;
  let alcanceTotalPlacas = 0;
  if (multFendas > 0) {
    opcoesPlacas.meiaLargura = entre(rng, G.placas.meiaLargura);
    opcoesPlacas.paredeLargura = entre(rng, G.placas.paredeLargura);
    opcoesPlacas.profundidade = entre(rng, G.placas.profundidade);
    seedAbertura = nextU32(rng) | 0;
    alcanceTotalPlacas = opcoesPlacas.meiaLargura + opcoesPlacas.paredeLargura;
    // Separação mínima entre dois centros (rad): evita células degeneradas (fronteiras coladas).
    const separacaoMinima = 0.3;
    const quantidadePlacas = Math.round(inteiroEntre(rng, G.placas.porSetor) * multFendas);
    for (let c = 0; c < quantidadePlacas; c++) {
      for (let tentativa = 0; tentativa < 30; tentativa++) {
        const p = direcaoSorteada(rng);
        if (!longeDosCentrais(p, alcanceTotalPlacas)) continue;
        if (!respeitaZonas(p, alcanceTotalPlacas)) continue;
        if (placas.some((o) => arco(p, o.d) < separacaoMinima)) continue;
        const copias = replicas(p);
        if (copias.slice(1).some((q) => arco(p, q) < separacaoMinima)) continue;
        for (const q of copias) placas.push({ d: q });
        break;
      }
    }
  }
  /** O representante canônico da órbita de p (o maior em x, depois y, depois z): mesmo ponto para
   * p e qualquer g·p, então qualquer função dele sai simétrica sem achatar sua distribuição (ao
   * contrário de somar/tirar a média das rotações, que concentraria o ruído perto de 0). */
  const canonico = (p: Vec3): Vec3 => {
    let melhor = p;
    for (const sigma of grupo) {
      const q = aplicarRotacao(sigma, p);
      if (
        q[0] > melhor[0] ||
        (q[0] === melhor[0] && (q[1] > melhor[1] || (q[1] === melhor[1] && q[2] > melhor[2])))
      ) {
        melhor = q;
      }
    }
    return melhor;
  };
  /**
   * Quanto a fronteira de placas fica fechada em p (1 = fenda cheia, 0 = ponte/vão): um ruído à
   * parte do relevo (D-108), amostrado no representante canônico da órbita de p pra não quebrar
   * CEN-06. Sem isso a rede seria contínua e separaria o planeta em ilhas incomunicáveis.
   */
  const fechamentoEm = (p: Vec3): number => {
    if (placas.length === 0) return 1;
    const q = canonico(p);
    const valor = fbm3(
      q[0] * R,
      q[1] * R,
      q[2] * R,
      seedAbertura,
      G.placas.aberturaOitavas,
      G.placas.aberturaFrequencia,
    );
    return smoothstep(0, G.placas.aberturaLimiar, Math.abs(valor));
  };
  // Pontos fixos pro jogo (gêiseres, D-106/D-108): no fundo bem fechado de alguma fronteira, longe
  // das pontes e das zonas. A fronteira é uma curva (medida quase nula na esfera), então amostrar
  // a esfera toda à toa quase nunca acerta; em vez disso, testa pontos ao longo do caminho entre
  // cada par de placas prováveis de vizinhas (perto o bastante uma da outra).
  const pontosDeFenda: Vec3[] = [];
  if (placas.length > 1) {
    // A fronteira é uma curva (medida quase nula na esfera): amostrar direto por Fibonacci precisa
    // de bastante gente pra achar alguma, mas é barato (sem RNG, só arco/ruído) e roda uma vez só.
    const CANDIDATOS = 4000;
    for (let k = 0; k < CANDIDATOS && pontosDeFenda.length < 24; k++) {
      const z = 1 - (2 * k + 1) / CANDIDATOS;
      const r = Math.sqrt(Math.max(0, 1 - z * z));
      const phi = k * 2.399963229728653; // ângulo de ouro
      const p: Vec3 = [r * Math.cos(phi), z, r * Math.sin(phi)];
      if (!longeDosCentrais(p, alcanceTotalPlacas) || !respeitaZonas(p, alcanceTotalPlacas)) {
        continue;
      }
      const distancia = distanciaDaFronteira(placas, p, R);
      if (distancia >= alcanceTotalPlacas) continue;
      const fechamento = fechamentoEm(p);
      if (fechamento < 0.9) continue;
      const h = alturaPlacas(distancia, opcoesPlacas, fechamento);
      if (h > -opcoesPlacas.profundidade * 0.6) continue;
      if (pontosDeFenda.some((q) => R * arco(p, q) < 40)) continue;
      pontosDeFenda.push(p);
    }
  }

  /** As feições que podem alcançar um trecho do mapa (todas, ou as de um bloco de vértices). */
  interface Feicoes {
    colinas: Colina[];
    crateras: Cratera[];
    sulcos: Sulco[];
  }
  const todas: Feicoes = { colinas, crateras, sulcos };
  const alturaSemLagos = (p: Vec3, f: Feicoes = todas): number => {
    let ruido = 0;
    for (const sigma of grupo) {
      const q = aplicarRotacao(sigma, p);
      ruido += fbm3(q[0] * R, q[1] * R, q[2] * R, seedRuido, G.ruido.oitavas, G.ruido.frequencia);
    }
    let h = (ruido / Math.sqrt(n)) * G.ruido.amplitude * multRelevo;
    for (const c of f.colinas) {
      const d = R * arco(c.d, p);
      if (d < 3 * c.sigma) h += c.altura * Math.exp(-(d * d) / (c.sigma * c.sigma));
    }
    for (const c of f.crateras) h += alturaCratera(c, p, R);
    for (const s of f.sulcos) h += alturaSulco(s, p, R);
    if (placas.length > 0) {
      // A fronteira é rara (medida quase nula na esfera): só paga o ruído de `fechamentoEm`
      // (rotações + fbm3) nos vértices realmente perto de alguma — a distância é barata (só
      // arcos) e descarta a vasta maioria sem nunca chamar a parte cara.
      const distancia = distanciaDaFronteira(placas, p, R);
      if (distancia < alcanceTotalPlacas) {
        h += alturaPlacas(distancia, opcoesPlacas, fechamentoEm(p));
      }
    }
    return h;
  };
  /**
   * Feições que alcançam o círculo de centro `centro` e raio angular `raioAng`. O filtro só
   * descarta quem soma exatamente 0 ali, então a altura sai idêntica à da lista completa. As
   * placas ficam de fora: a fronteira de Voronoi precisa do centro mais perto em toda a esfera, e
   * a lista é pequena (poucas por setor) — sempre entram inteiras em `alturaSemLagos`.
   */
  const feicoesPerto = (centro: Vec3, raioAng: number): Feicoes => {
    const perto = (d: Vec3, alcanceAng: number) => arco(d, centro) <= alcanceAng + raioAng + 1e-9;
    return {
      colinas: colinas.filter((c) => perto(c.d, (3 * c.sigma) / R)),
      crateras: crateras.filter((c) => perto(c.d, Math.min(Math.PI, (c.raio * 1.6 + 8) / R))),
      sulcos: sulcos.filter((s) =>
        perto(s.centro, Math.acos(Math.max(-1, Math.min(1, s.cosAlcance)))),
      ),
    };
  };

  // CEN-04 (D-90): mares de formas orgânicas. O campo é a soma das rotações do grupo (simétrico),
  // empurrado para cima perto das zonas de pouso e dos pontos médios (terra firme).
  const seedMar = (Math.imul(seed | 0, 0x2c1b3c6d) ^ 0x5bd1e995) | 0;
  const folgaZona = param('mar_folga_zona_m');
  const campoMar = (p: Vec3): number => {
    let f = 0;
    for (const sigma of grupo) {
      const q = aplicarRotacao(sigma, p);
      f += fbm3(q[0] * R, q[1] * R, q[2] * R, seedMar, G.mar.oitavas, G.mar.frequencia);
      // Detalhe: recorta a costa e ergue ilhas dentro dos mares.
      f +=
        G.mar.ilhas.peso *
        fbm3(q[0] * R, q[1] * R, q[2] * R, seedMar ^ 0x1f, 2, G.mar.ilhas.frequencia);
    }
    f /= Math.sqrt(n);
    for (const zona of zonasDePouso) {
      const d = R * arco(zona.d, p);
      f += 3 * (1 - smoothstep(folgaZona, folgaZona + 40, d));
    }
    for (const m of pontosMedios) {
      const d = R * arco(m.d, p);
      f += 3 * (1 - smoothstep(G.mar.folgaCentro_m, G.mar.folgaCentro_m + 30, d));
    }
    return f;
  };
  /** Nível do líquido e limiar do campo, pelas amostras (espiral de Fibonacci, determinística). */
  let nivel = -Infinity;
  let limiar = -Infinity;
  if (comMar) {
    const amostras: Array<{ h: number; f: number }> = [];
    const N = G.mar.amostras;
    for (let k = 0; k < N; k++) {
      const y = 1 - (2 * (k + 0.5)) / N;
      const r = Math.sqrt(1 - y * y);
      const fi = k * Math.PI * (3 - Math.sqrt(5));
      const p: Vec3 = [r * Math.cos(fi), y, r * Math.sin(fi)];
      amostras.push({ h: alturaSemLagos(p), f: campoMar(p) });
    }
    const hs = amostras.map((a) => a.h).sort((a, b) => a - b);
    nivel = hs[Math.floor(G.mar.nivelQuantil * (N - 1))]!;
    // Limiar por bisseção: a fração coberta (mar ou lago natural) bate `mar_cobertura_pct`.
    const alvo = param('mar_cobertura_pct') / 100;
    const fs = amostras.map((a) => a.f);
    let lo = Math.min(...fs);
    let hi = Math.max(...fs);
    for (let it = 0; it < 40; it++) {
      const meio = (lo + hi) / 2;
      const coberta = amostras.filter((a) => a.f < meio || a.h < nivel).length / N;
      if (coberta < alvo) lo = meio;
      else hi = meio;
    }
    limiar = (lo + hi) / 2;
  }
  const alturaNatural = (p: Vec3, f: Feicoes = todas): number => {
    const h = alturaSemLagos(p, f);
    if (!comMar) return h;
    const s = (campoMar(p) - limiar) / G.mar.banda;
    let final = h;
    if (s < 0) {
      // Mar: o fundo desce até `profundidade` abaixo do nível.
      final = nivel - G.mar.margem - G.mar.profundidade * smoothstep(0, 2, -s);
    } else if (s < 1) {
      // Costa: do nível até o relevo natural.
      const terra = Math.max(h, nivel + G.mar.margem);
      final = nivel + G.mar.margem + (terra - nivel - G.mar.margem) * smoothstep(0, 1, s);
    }
    // Terra firme em volta das zonas de pouso (sem lagos de cratera ali).
    if (zonasDePouso.some((z) => R * arco(z.d, p) < folgaZona)) {
      final = Math.max(final, nivel + G.mar.margem);
    }
    return final;
  };

  // CEN-08: platôs planos (altura radial constante) com penhascos, exceto nas rampas.
  const alcanceRampa = topo + Math.max(G.larguraPenhasco, G.comprimentoRampa) + G.larguraRampa;
  const cosAlcanceRampa = Math.cos(alcanceRampa / R);
  const aplicarPlatos = (p: Vec3, natural: number): number => {
    let t = 1;
    for (const zona of zonasDePouso) {
      if (produtoEscalar(zona.d, p) < cosAlcanceRampa) continue;
      const d = R * arco(zona.d, p);
      if (d <= topo) return G.alturaPlato;
      const tPenhasco = smoothstep(topo, topo + G.larguraPenhasco, d);
      let tZona = tPenhasco;
      for (const u of zona.rampas) {
        const { x: aoLongo, y } = local(zona.d, u, p, R);
        if (aoLongo <= 0) continue;
        const lateral = Math.abs(y);
        const s = 1 - smoothstep(G.larguraRampa / 2, G.larguraRampa / 2 + G.ombroRampa, lateral);
        if (s <= 0) continue;
        const tRampa = clamp01((aoLongo - topo) / G.comprimentoRampa);
        tZona = Math.min(tZona, tPenhasco + (tRampa - tPenhasco) * s);
      }
      t = Math.min(t, tZona);
    }
    return G.alturaPlato + (natural - G.alturaPlato) * t;
  };

  // Alturas: só um vértice de cada órbita do grupo é calculado; os outros são cópias exatas.
  const resolucao = celulasPorAresta(R, texel);
  const alturas = new Uint16Array(6 * (resolucao + 1) * (resolucao + 1));
  // Em blocos de vértices: cada bloco só testa as feições que o alcançam (desempenho, D-79).
  /** CEN-04: o ponto p e um anel de raio `folga` (m) em volta estão em terra? */
  const emTerra = (p: Vec3, folga: number): boolean => {
    const acima = (q: Vec3) => aplicarPlatos(q, alturaNatural(q)) >= nivel + G.mar.margem;
    if (!acima(p)) return false;
    const norte = norteEm(p);
    for (let k = 0; k < 8; k++) {
      if (!acima(avancar(p, girar(norte, p, (k / 8) * TAU), folga / R).p)) return false;
    }
    return true;
  };

  function sortearPedras(): Pedra[] {
    const saida: Pedra[] = [];
    const quantidade = Math.round((param('pedras_por_10k_m2') * area) / 10000 / n);
    const faixa: [number, number] = [param('pedra_raio_min_m'), param('pedra_raio_max_m')];
    for (let c = 0; c < quantidade; c++) {
      for (let tentativa = 0; tentativa < G.pedra.tentativas; tentativa++) {
        const raio = entre(rng, faixa);
        const p = direcaoSorteada(rng);
        if (!respeitaZonas(p, raio)) continue;
        if (!longeDosCentrais(p, raio)) continue;
        // CEN-04: nenhuma pedra no líquido (nem encostada nele: confere um anel em volta).
        if (comMar && !emTerra(p, raio + 2)) continue;
        const copias = replicas(p);
        if (copias.slice(1).some((q) => R * arco(p, q) < 2 * raio + G.pedra.vao)) continue;
        if (saida.some((o) => R * arco(p, o.d) < raio + o.raio + G.pedra.vao)) continue;
        for (const q of copias) saida.push({ d: q, raio });
        break;
      }
    }
    return saida;
  }

  const BLOCO = 16;
  for (let face = 0; face < 6; face++) {
    for (let j0 = 0; j0 <= resolucao; j0 += BLOCO) {
      for (let i0 = 0; i0 <= resolucao; i0 += BLOCO) {
        const i1 = Math.min(resolucao, i0 + BLOCO - 1);
        const j1 = Math.min(resolucao, j0 + BLOCO - 1);
        const centro = direcaoDoVertice(resolucao, face, (i0 + i1) / 2, (j0 + j1) / 2);
        const raioAng =
          Math.max(
            ...[
              [i0, j0],
              [i1, j0],
              [i0, j1],
              [i1, j1],
            ].map(([i, j]) => arco(centro, direcaoDoVertice(resolucao, face, i!, j!))),
          ) * 1.05;
        const f = feicoesPerto(centro, raioAng);
        for (let j = j0; j <= j1; j++) {
          for (let i = i0; i <= i1; i++) {
            const v = indiceDoVertice(resolucao, face, i, j);
            const orbita = grupo.map((sigma) => verticeRotacionado(resolucao, v, sigma));
            if (orbita.some((w) => w < v)) continue;
            const p = direcaoDoVertice(resolucao, face, i, j);
            const valor = codificarAltura(aplicarPlatos(p, alturaNatural(p, f)));
            for (const w of orbita) alturas[w] = valor;
          }
        }
      }
    }
  }

  // CEN-17: pedras neutras, sorteadas depois do relevo para não mudar as alturas.
  const pedras = sortearPedras();

  return {
    seed,
    raio,
    simetria: n,
    raio_m: R,
    resolucao,
    alturas,
    zonasDePouso,
    contestados: geo.contestados,
    centrais: geo.centrais,
    crateras,
    placas,
    pontosDeFenda,
    ...(comMar ? { mar: { nivel } } : {}),
    pedras,
  };
}
