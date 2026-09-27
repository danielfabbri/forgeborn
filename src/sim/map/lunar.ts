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
import type { Lago } from './lagos';

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
  ruido: { amplitude: 2.4, oitavas: 4, frequencia: 1 / 80 },
  /** Folga entre obstáculos e o penhasco do platô ou o corredor de uma rampa. */
  folgaZona: 8,
  folgaCorredor: 6,
  /** Quanto o corredor protegido passa do fim da rampa. */
  saidaRampa: 20,
  /** Resolução do heightmap: ~1 m entre vértices (CEN-13). */
  texel_m: 1,
  /**
   * CEN-04: bacia do lago. O fundo desce `profundidade` abaixo da água no centro e chega à
   * margem (`margem` acima da água) exatamente no raio; fora dele o chão volta ao relevo natural
   * numa faixa de `transicao` × o raio.
   */
  lago: { profundidade: 3, margem: 0.15, transicao: 0.5, amostras: 24, tentativas: 200 },
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

/** §14.5: relevo quase plano, sem crateras nem sulcos (Terra — Campo de testes). */
const FATOR_RELEVO_PLANO = 0.3;

export function gerarMapaLunar(
  seed: number,
  raio: number,
  n: Simetria,
  plano = false,
  lagosPorSetor = 0,
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

  // Crateras (CEN-09).
  const crateras: Cratera[] = [];
  for (const classe of plano ? [] : G.classesCratera) {
    const quantidade = Math.floor((classe.densidade * area) / n / 10000 + nextFloat(rng));
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
  const quantidadeColinas = Math.floor((G.colinas.densidade * area) / n / 10000 + nextFloat(rng));
  for (let c = 0; c < quantidadeColinas; c++) {
    for (let tentativa = 0; tentativa < G.tentativas; tentativa++) {
      const sigma = entre(rng, G.colinas.sigma);
      const altura = entre(rng, G.colinas.altura);
      const p = direcaoSorteada(rng);
      if (!longeDosCentrais(p, sigma)) continue;
      if (!respeitaZonas(p, 2 * sigma)) continue;
      const h = plano ? altura * FATOR_RELEVO_PLANO : altura;
      for (const q of replicas(p)) colinas.push({ d: q, altura: h, sigma });
      break;
    }
  }

  // Sulcos (canais rasos e sinuosos), andando pela superfície com o rumo girando aos poucos.
  const sulcos: Sulco[] = [];
  const quantidadeSulcos = plano ? 0 : inteiroEntre(rng, G.sulcos.porSetor);
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
    let h = (ruido / Math.sqrt(n)) * G.ruido.amplitude * (plano ? FATOR_RELEVO_PLANO : 1);
    for (const c of f.colinas) {
      const d = R * arco(c.d, p);
      if (d < 3 * c.sigma) h += c.altura * Math.exp(-(d * d) / (c.sigma * c.sigma));
    }
    for (const c of f.crateras) h += alturaCratera(c, p, R);
    for (const s of f.sulcos) h += alturaSulco(s, p, R);
    return h;
  };
  /**
   * Feições que alcançam o círculo de centro `centro` e raio angular `raioAng`. O filtro só
   * descarta quem soma exatamente 0 ali, então a altura sai idêntica à da lista completa.
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

  // CEN-04: lagos de metano (Titã), sorteados por último para não mudar os outros cenários.
  const lagos: Lago[] = [];
  for (let c = 0; c < lagosPorSetor; c++) {
    for (let tentativa = 0; tentativa < G.lago.tentativas; tentativa++) {
      const raio = entre(rng, [param('lago_raio_min_m'), param('lago_raio_max_m')]);
      const p = direcaoSorteada(rng);
      if (zonasDePouso.some((z) => R * arco(z.d, p) < param('lago_folga_zona_m') + raio)) continue;
      if (!respeitaZonas(p, raio)) continue;
      if (!longeDosCentrais(p, raio)) continue;
      const copias = replicas(p);
      if (copias.slice(1).some((q) => R * arco(p, q) < 2.2 * raio)) continue;
      if (lagos.some((o) => R * arco(p, o.d) < 1.2 * (raio + o.raio))) continue;
      // O nível da água é a média do chão natural na borda do lago.
      const ref = rumoSorteado(rng, p);
      let soma = 0;
      for (let k = 0; k < G.lago.amostras; k++) {
        const rumo = normalizar(girar(ref, p, (k / G.lago.amostras) * TAU));
        soma += alturaSemLagos(avancar(p, rumo, raio / R).p);
      }
      const nivel = soma / G.lago.amostras;
      for (const q of copias) lagos.push({ d: q, raio, nivel });
      break;
    }
  }
  const alturaNatural = (p: Vec3, f: Feicoes = todas): number => {
    const h = alturaSemLagos(p, f);
    for (const l of lagos) {
      const d = R * arco(l.d, p);
      const fim = l.raio * (1 + G.lago.transicao);
      if (d >= fim) continue;
      const margem = l.nivel + G.lago.margem;
      if (d <= l.raio) {
        return margem - (G.lago.profundidade + G.lago.margem) * (1 - (d / l.raio) ** 2);
      }
      return margem + (h - margem) * smoothstep(l.raio, fim, d);
    }
    return h;
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
    lagos,
  };
}
