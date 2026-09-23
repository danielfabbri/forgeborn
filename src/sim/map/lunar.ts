/**
 * Gerador de mapas lunares por seed (CEN-06 a CEN-09).
 *
 * Simetria exata: crateras, colinas e sulcos são sorteados num setor de 2π/N e replicados por
 * rotações exatas (90° ou 180°); o ruído é a média das N rotações. As alturas são calculadas só
 * no domínio fundamental e copiadas para os outros setores, então amostras simétricas são iguais.
 */
import { nextFloat, nextU32, type RngState, seedRng } from '../core/rng';
import { dados, type TamanhosMapaId } from '../data';
import { FAIXA_BORDA_M } from './grids';
import { codificarAltura, type Heightmap } from './heightmap';
import { fbm } from './noise';

export type Simetria = 2 | 4;

/** Números do gerador (GOV-04). Os que vêm do SPEC citam a regra. */
export const GERADOR_LUA = {
  distanciaZonaFracao: 0.36, // CEN-07
  raioPlato: 50, // CEN-08
  /** O topo plano vai um pouco além dos 50 m para a borda do platô também medir 0°. */
  folgaTopo: 2,
  alturaPlato: 6,
  larguraPenhasco: 5,
  larguraRampa: 16, // CEN-08: ≥ 12 m
  ombroRampa: 4,
  comprimentoRampa: 32,
  faixaBorda: FAIXA_BORDA_M, // CEN-09
  alturaBorda: 30,
  raioLivreCentro: 40,
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
} as const;

const G = GERADOR_LUA;
const TAU = Math.PI * 2;

export interface ZonaDePouso {
  x: number;
  z: number;
  /** Direção de cada rampa de saída, em radianos (0 = +x, π/2 = +z). */
  rampas: number[];
}

export interface Cratera {
  x: number;
  z: number;
  raio: number;
  profundidade: number;
  borda: number;
  /** Direções (rad) das brechas na borda. */
  brechas: number[];
  fase1: number;
  fase2: number;
}

interface Colina {
  x: number;
  z: number;
  altura: number;
  sigma: number;
}

interface Sulco {
  pontos: Array<[number, number]>;
  largura: number;
  profundidade: number;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface MapaLunar extends Heightmap {
  seed: number;
  tamanho: TamanhosMapaId;
  simetria: Simetria;
  zonasDePouso: ZonaDePouso[];
  /** Todas as crateras, já replicadas. */
  crateras: Cratera[];
}

/** Rotação exata de k passos de 2π/N em torno do centro do mapa. */
export function rotacionar(x: number, z: number, k: number, n: Simetria): [number, number] {
  const passos = ((k % n) + n) % n;
  if (n === 2) return passos === 0 ? [x, z] : [-x, -z];
  switch (passos) {
    case 0:
      return [x, z];
    case 1:
      return [-z, x];
    case 2:
      return [-x, -z];
    default:
      return [z, -x];
  }
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

function distanciaAoSegmento(
  px: number,
  pz: number,
  [ax, az]: [number, number],
  [bx, bz]: [number, number],
): number {
  const vx = bx - ax;
  const vz = bz - az;
  const t = clamp01(((px - ax) * vx + (pz - az) * vz) / (vx * vx + vz * vz));
  return Math.hypot(px - (ax + vx * t), pz - (az + vz * t));
}

/** Contribuição de uma cratera para a altura no ponto (x, z). */
export function alturaCratera(c: Cratera, x: number, z: number): number {
  const dx = x - c.x;
  const dz = z - c.z;
  const alcance = c.raio * 1.6 + 8;
  if (Math.abs(dx) > alcance || Math.abs(dz) > alcance) return 0;
  const d = Math.hypot(dx, dz);
  if (d > alcance) return 0;
  const theta = Math.atan2(dz, dx);
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

function alturaSulco(s: Sulco, x: number, z: number): number {
  if (x < s.minX || x > s.maxX || z < s.minZ || z > s.maxZ) return 0;
  let menor = Infinity;
  for (let k = 0; k < s.pontos.length - 1; k++) {
    menor = Math.min(menor, distanciaAoSegmento(x, z, s.pontos[k]!, s.pontos[k + 1]!));
  }
  if (menor >= s.largura) return 0;
  const q = 1 - (menor / s.largura) ** 2;
  return -s.profundidade * q * q;
}

export function gerarMapaLunar(seed: number, tamanho: TamanhosMapaId, n: Simetria): MapaLunar {
  const definicao = dados.tamanhos_mapa.find((t) => t.id === tamanho);
  if (!definicao) throw new Error(`Tamanho de mapa desconhecido: ${tamanho}`);
  const lado = definicao.lado_m;
  const meio = lado / 2;
  const passo = TAU / n;
  const rng = seedRng(seed);
  const seedRuido = nextU32(rng) | 0;

  // CEN-07: zonas de pouso a 36% do lado, em ângulos igualmente espaçados a partir de 45°.
  const rZona = G.distanciaZonaFracao * lado;
  const x0 = rZona * Math.cos(Math.PI / 4);
  const z0 = rZona * Math.sin(Math.PI / 4);
  const paraOCentro = Math.atan2(-z0, -x0);
  // CEN-08: 2 ou 3 rampas, voltadas para o interior do mapa.
  const rampas0 =
    inteiroEntre(rng, [2, 3]) === 2
      ? (() => {
          const d = (entre(rng, [25, 50]) * Math.PI) / 180;
          return [paraOCentro - d, paraOCentro + d];
        })()
      : (() => {
          const d = (entre(rng, [45, 65]) * Math.PI) / 180;
          return [paraOCentro - d, paraOCentro, paraOCentro + d];
        })();
  const zonasDePouso: ZonaDePouso[] = Array.from({ length: n }, (_, k) => {
    const [x, z] = rotacionar(x0, z0, k, n);
    return { x, z, rampas: rampas0.map((a) => a + k * passo) };
  });

  const areaSetor = (lado * lado) / n;
  const topo = G.raioPlato + G.folgaTopo;
  const noSetor = (x: number, z: number): boolean => {
    let a = Math.atan2(z, x);
    if (a < 0) a += TAU;
    return a < passo;
  };
  /** Ponto sorteado dentro do setor fundamental e do quadrado útil `[-limite, limite]²`. */
  const sortearNoSetor = (limite: number): [number, number] => {
    for (;;) {
      const x = entre(rng, [-limite, limite]);
      const z = entre(rng, [-limite, limite]);
      if (noSetor(x, z)) return [x, z];
    }
  };
  /** Um obstáculo de raio `raio` em (x, z) não encosta no penhasco nem nos corredores das rampas. */
  const respeitaZonas = (x: number, z: number, raio: number): boolean =>
    zonasDePouso.every((zona) => {
      if (Math.hypot(x - zona.x, z - zona.z) < topo + G.larguraPenhasco + G.folgaZona + raio) {
        return false;
      }
      const alcance = topo + G.comprimentoRampa + G.saidaRampa;
      const meiaLargura = G.larguraRampa / 2 + G.ombroRampa + G.folgaCorredor;
      return zona.rampas.every((a) => {
        const fim: [number, number] = [
          zona.x + Math.cos(a) * alcance,
          zona.z + Math.sin(a) * alcance,
        ];
        return distanciaAoSegmento(x, z, [zona.x, zona.z], fim) >= raio + meiaLargura;
      });
    });

  // Crateras (CEN-09).
  const crateras: Cratera[] = [];
  for (const classe of G.classesCratera) {
    const quantidade = Math.floor((classe.densidade * areaSetor) / 10000 + nextFloat(rng));
    for (let c = 0; c < quantidade; c++) {
      for (let tentativa = 0; tentativa < G.tentativas; tentativa++) {
        const raio = entre(rng, classe.raio);
        const [x, z] = sortearNoSetor(meio - G.faixaBorda - raio * 1.3);
        if (Math.hypot(x, z) < G.raioLivreCentro + raio) continue;
        // Alcance visível da borda: raio + duas larguras da queda externa.
        if (!respeitaZonas(x, z, raio + 2 * Math.min(0.3 * raio, 8))) continue;
        if (crateras.some((o) => Math.hypot(x - o.x, z - o.z) < 0.9 * (raio + o.raio))) continue;

        const profundidade = Math.min(Math.max(0.2 * raio, 2), 10);
        const borda = Math.min(Math.max(0.14 * raio, 1.2), G.crateraBordaMax);
        const brechas = Array.from({ length: inteiroEntre(rng, classe.brechas) }, () =>
          entre(rng, [0, TAU]),
        );
        const fase1 = entre(rng, [0, TAU]);
        const fase2 = entre(rng, [0, TAU]);
        for (let k = 0; k < n; k++) {
          const [rx, rz] = rotacionar(x, z, k, n);
          const beta = k * passo;
          crateras.push({
            x: rx,
            z: rz,
            raio,
            profundidade,
            borda,
            brechas: brechas.map((b) => b + beta),
            fase1: fase1 - 3 * beta,
            fase2: fase2 - 5 * beta,
          });
        }
        break;
      }
    }
  }

  // Colinas suaves.
  const colinas: Colina[] = [];
  const quantidadeColinas = Math.floor((G.colinas.densidade * areaSetor) / 10000 + nextFloat(rng));
  for (let c = 0; c < quantidadeColinas; c++) {
    for (let tentativa = 0; tentativa < G.tentativas; tentativa++) {
      const sigma = entre(rng, G.colinas.sigma);
      const altura = entre(rng, G.colinas.altura);
      const [x, z] = sortearNoSetor(meio - G.faixaBorda - sigma);
      if (Math.hypot(x, z) < 1.5 * sigma) continue;
      if (!respeitaZonas(x, z, 2 * sigma)) continue;
      for (let k = 0; k < n; k++) {
        const [rx, rz] = rotacionar(x, z, k, n);
        colinas.push({ x: rx, z: rz, altura, sigma });
      }
      break;
    }
  }

  // Sulcos (canais rasos e sinuosos).
  const sulcos: Sulco[] = [];
  const quantidadeSulcos = inteiroEntre(rng, G.sulcos.porSetor);
  for (let c = 0; c < quantidadeSulcos; c++) {
    for (let tentativa = 0; tentativa < 20; tentativa++) {
      const largura = entre(rng, G.sulcos.largura);
      const profundidade = entre(rng, G.sulcos.profundidade);
      const comprimento = entre(rng, G.sulcos.comprimento);
      const limite = meio - G.faixaBorda - largura;
      const ax = entre(rng, [-limite, limite]);
      const az = entre(rng, [-limite, limite]);
      const direcao = entre(rng, [0, TAU]);
      const curva = entre(rng, [-0.25, 0.25]) * comprimento;
      const bx = ax + Math.cos(direcao) * comprimento;
      const bz = az + Math.sin(direcao) * comprimento;
      const cx = (ax + bx) / 2 - Math.sin(direcao) * curva;
      const cz = (az + bz) / 2 + Math.cos(direcao) * curva;
      const pontos: Array<[number, number]> = [];
      for (let s = 0; s <= 16; s++) {
        const t = s / 16;
        pontos.push([
          (1 - t) * (1 - t) * ax + 2 * (1 - t) * t * cx + t * t * bx,
          (1 - t) * (1 - t) * az + 2 * (1 - t) * t * cz + t * t * bz,
        ]);
      }
      const valido =
        noSetor(ax, az) &&
        pontos.every(
          ([x, z]) =>
            Math.abs(x) <= limite &&
            Math.abs(z) <= limite &&
            Math.hypot(x, z) >= G.raioLivreCentro &&
            respeitaZonas(x, z, largura),
        );
      if (!valido) continue;
      for (let k = 0; k < n; k++) {
        const replicados = pontos.map(([x, z]) => rotacionar(x, z, k, n));
        const xs = replicados.map((p) => p[0]);
        const zs = replicados.map((p) => p[1]);
        sulcos.push({
          pontos: replicados,
          largura,
          profundidade,
          minX: Math.min(...xs) - largura,
          maxX: Math.max(...xs) + largura,
          minZ: Math.min(...zs) - largura,
          maxZ: Math.max(...zs) + largura,
        });
      }
      break;
    }
  }

  const alturaNatural = (x: number, z: number): number => {
    let ruido = 0;
    for (let k = 0; k < n; k++) {
      const [rx, rz] = rotacionar(x, z, k, n);
      ruido += fbm(rx, rz, seedRuido, G.ruido.oitavas, G.ruido.frequencia);
    }
    ruido /= n;
    let h = ruido * Math.sqrt(n) * G.ruido.amplitude;
    for (const c of colinas) {
      const d2 = (x - c.x) ** 2 + (z - c.z) ** 2;
      if (d2 < 9 * c.sigma * c.sigma) h += c.altura * Math.exp(-d2 / (c.sigma * c.sigma));
    }
    for (const c of crateras) h += alturaCratera(c, x, z);
    for (const s of sulcos) h += alturaSulco(s, x, z);
    // CEN-09: serras na faixa da borda.
    const e = meio - Math.max(Math.abs(x), Math.abs(z));
    if (e < G.faixaBorda) {
      const t = 1 - Math.max(e, 0) / G.faixaBorda;
      h += G.alturaBorda * t * t * (1 + 0.6 * ruido);
    }
    return h;
  };

  // CEN-08: platôs planos com penhascos, exceto nas rampas.
  const alcanceRampa = topo + Math.max(G.larguraPenhasco, G.comprimentoRampa) + G.larguraRampa;
  const aplicarPlatos = (x: number, z: number, natural: number): number => {
    let t = 1;
    for (const zona of zonasDePouso) {
      const dx = x - zona.x;
      const dz = z - zona.z;
      const d = Math.hypot(dx, dz);
      if (d > alcanceRampa) continue;
      if (d <= topo) return G.alturaPlato;
      const tPenhasco = smoothstep(topo, topo + G.larguraPenhasco, d);
      let tZona = tPenhasco;
      for (const angulo of zona.rampas) {
        const ux = Math.cos(angulo);
        const uz = Math.sin(angulo);
        const aoLongo = dx * ux + dz * uz;
        if (aoLongo <= 0) continue;
        const lateral = Math.abs(dx * uz - dz * ux);
        const s = 1 - smoothstep(G.larguraRampa / 2, G.larguraRampa / 2 + G.ombroRampa, lateral);
        if (s <= 0) continue;
        const tRampa = clamp01((aoLongo - topo) / G.comprimentoRampa);
        tZona = Math.min(tZona, tPenhasco + (tRampa - tPenhasco) * s);
      }
      t = Math.min(t, tZona);
    }
    return G.alturaPlato + (natural - G.alturaPlato) * t;
  };

  // Alturas: só o domínio fundamental é calculado; o resto é cópia por rotação.
  const resolucao = lado + 1;
  const alturas = new Uint16Array(resolucao * resolucao);
  const fundamental = (i: number, j: number): boolean =>
    (i === meio && j === meio) ||
    (n === 4 ? i > meio && j >= meio : j > meio || (j === meio && i > meio));
  for (let j = 0; j < resolucao; j++) {
    for (let i = 0; i < resolucao; i++) {
      if (!fundamental(i, j)) continue;
      const x = i - meio;
      const z = j - meio;
      const valor = codificarAltura(aplicarPlatos(x, z, alturaNatural(x, z)));
      let ii = i;
      let jj = j;
      for (let k = 0; k < n; k++) {
        alturas[jj * resolucao + ii] = valor;
        [ii, jj] = n === 4 ? [lado - jj, ii] : [lado - ii, lado - jj];
      }
    }
  }

  return { seed, tamanho, simetria: n, lado_m: lado, resolucao, alturas, zonasDePouso, crateras };
}
