/**
 * Distribuição das jazidas (ECO-07, ECO-08, CEN-10) no planeta: quantidades de `dados:jazidas` ×
 * perfil do cenário, nas distâncias do SPEC (arcos, CEN-14).
 *
 * Simetria (CEN-06): as jazidas da zona de pouso 0 (inicial e expansão) são replicadas pelas
 * rotações do grupo. Nos pontos médios (contestados e centrais), cada órbita é resolvida uma vez.
 * Se o ponto é fixado por uma meia-volta τ do grupo (que troca as duas zonas vizinhas), o conjunto
 * dele precisa ser invariante por τ: jazidas do mesmo recurso vão em pares (p, τ·p), e um
 * recurso com número ímpar de jazidas ganha mais uma, dividindo a quantidade (ECO-08).
 */
import { nextFloat, seedRng } from '../core/rng';
import { type CenariosId, dados, type JazidasRow, param, type RecursosId } from '../data';
import { componenteConectado, noComponente, temFolga } from './conectividade';
import {
  aplicarRotacao,
  arco,
  avancar,
  diferenca,
  girar,
  normalizar,
  produtoEscalar,
  produtoVetorial,
  rotacoesDeSimetria,
  tangente,
  type Vec3,
} from './esfera';
import { celulaDe, type GradesDoMapa } from './grids';
import { alturaCratera, GERADOR_LUA, type MapaLunar, type PontoMedio, rumoSemRampa } from './lunar';
import { emLiquido } from './lagos';
import { emPedra } from './pedras';

export type ZonaDeJazida = 'inicial' | 'expansao' | 'contestada' | 'central' | 'espalhada';

export interface Jazida {
  recurso: RecursosId;
  quantidade: number;
  d: Vec3;
  zona: ZonaDeJazida;
  /** Zona de pouso dona (inicial, expansão), as duas vizinhas (contestada, central) ou nenhuma
   * (espalhada, ECO-30). */
  zonasDePouso: number[];
}

export interface CentroDeZona {
  d: Vec3;
  zonasDePouso: number[];
}

export interface DistribuicaoDeJazidas {
  jazidas: Jazida[];
  expansoes: CentroDeZona[];
  contestadas: CentroDeZona[];
  centrais: CentroDeZona[];
}

/** Números da distribuição (GOV-04: parâmetros do gerador). */
export const DISTRIBUICAO = {
  folgaPenhasco_m: 6, // CEN-11
  /** Aberturas (±graus em volta do fundo) tentadas para as vagas das iniciais. */
  arcosIniciais_graus: [70, 90, 110, 50],
  /** Desvios angulares (graus) tentados em volta da vaga de cada jazida inicial. */
  ajustesIniciais_graus: [
    0,
    ...Array.from({ length: 30 }, (_, k) => (k % 2 ? -1 : 1) * 6 * Math.ceil((k + 1) / 2)),
  ],
  /** Folga lateral (m) entre uma jazida inicial e o eixo de uma rampa (não fica no caminho). */
  folgaRampa_m: 6,
  /** ECO-30: tentativas de sorteio por jazida espalhada e folga (m) dos pontos médios. */
  tentativasEspalhada: 80,
  folgaPontoMedio_m: 60,
  distanciasExpansao_m: [112, 106, 118],
  passoAngularExpansao_graus: 7.5,
  distanciaEntreExpansoes_m: 80,
  raiosDoGrupo_m: [14, 18, 22, 26, 30, 34, 38, 42],
  deslocamentosMedio_m: [0, 10, -10, 20, -20, 30, -30, 40, -40],
  desviosLateraisMedio_m: [0, 12, -12, 24, -24],
  passoAngularGrupo_graus: 15,
} as const;

const D = DISTRIBUICAO;
const RAD = Math.PI / 180;

function linhasDaZona(zona: ZonaDeJazida): JazidasRow[] {
  return dados.jazidas.filter((linha) => linha.zona === zona);
}

/** Lista de recursos, uma entrada por jazida, na ordem da tabela. */
function expandir(linhas: JazidasRow[]): JazidasRow[] {
  return linhas.flatMap((linha) => Array.from({ length: linha.jazidas }, () => linha));
}

function iguais(a: Vec3, b: Vec3): boolean {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}

interface Colocada {
  linha: JazidasRow;
  d: Vec3;
  /** Fração da quantidade da linha (ECO-08: pares espelhados de um recurso ímpar). */
  fracao?: number;
}

export function distribuirJazidas(
  mapa: MapaLunar,
  grades: GradesDoMapa,
  cenario: CenariosId,
): DistribuicaoDeJazidas {
  const perfil = dados.cenarios.find((c) => c.id === cenario);
  if (!perfil) throw new Error(`Cenário desconhecido: ${cenario}`);
  const quantidade = (linha: JazidasRow) =>
    Math.round(
      linha.quantidade_u * (perfil[`perfil_${linha.recurso}` as keyof typeof perfil] as number),
    );
  // CEN-19/D-99: em Ceres, o Lítio não nasce pela distribuição normal — só nos veios de sal,
  // dentro da maior cratera do mapa. CEN-21/D-108: em Europa, o Titânio só na falha mais
  // profunda (mais abaixo, nos dois casos).
  const linhasDaZonaDoCenario = (zona: ZonaDeJazida): JazidasRow[] =>
    linhasDaZona(zona).filter(
      (linha) =>
        (cenario !== 'ceres' || linha.recurso !== 'li') &&
        (cenario !== 'europa' || linha.recurso !== 'ti'),
    );

  const R = mapa.raio_m;
  // ECO-07 (D-89): distância mínima entre duas jazidas quaisquer.
  const espacamento = param('jazida_espacamento_min_m');
  const grupo = rotacoesDeSimetria(mapa.simetria);
  const nav = grades.navegacao;
  const zonas = mapa.zonasDePouso;
  const zona0 = zonas[0]!;
  // CEN-11 (D-90): alcançável por terra ou pelo mar (a ilha se alcança de barco).
  const alcancavel = componenteConectado(nav, celulaDe(nav, zona0.d), true);
  const foraDosPlatos =
    GERADOR_LUA.raioPlato + GERADOR_LUA.folgaTopo + GERADOR_LUA.larguraPenhasco + D.folgaPenhasco_m;
  const distancia = (a: Vec3, b: Vec3) => R * arco(a, b);
  /** Ponto a `metros` de c, no rumo tangente `rumo` girado de `graus`. */
  const em = (c: Vec3, rumo: Vec3, graus: number, metros: number): Vec3 =>
    avancar(c, normalizar(girar(rumo, c, graus * RAD)), metros / R).p;

  /** Todas as posições já ocupadas (com as réplicas), para o espaçamento. */
  const ocupadas: Vec3[] = [];

  /**
   * Posição válida: folga de penhascos (CEN-11), alcançável por solo a partir da zona 0,
   * espaçada das outras jazidas e fora dos platôs (exceto as iniciais).
   */
  const valida = (p: Vec3, extras: Vec3[] = [], noPlato = false) =>
    temFolga(nav, p, D.folgaPenhasco_m) &&
    noComponente(nav, alcancavel, p) &&
    [...ocupadas, ...extras].every((q) => distancia(p, q) >= espacamento) &&
    (noPlato || zonas.every((zona) => distancia(p, zona.d) >= foraDosPlatos)) &&
    // CEN-04 e CEN-17: nenhuma jazida dentro (nem colada) de um lago de metano ou de uma pedra.
    !emLiquido(mapa, p, param('distancia_min_jazida_m')) &&
    !emPedra(mapa, p, param('distancia_min_jazida_m'));

  /** Coloca um grupo de jazidas em volta de c; devolve as posições ou null. */
  const agrupar = (
    c: Vec3,
    linhas: JazidasRow[],
    regra: (p: Vec3, linha: JazidasRow) => boolean,
  ): Vec3[] | null => {
    const posicoes: Vec3[] = [];
    const passos = Math.round(360 / D.passoAngularGrupo_graus);
    const ref = tangente(c, [0, 1, 0]) ?? tangente(c, [1, 0, 0])!;
    for (const [indice, linha] of linhas.entries()) {
      let achou: Vec3 | null = null;
      const inicio = (indice * 360) / linhas.length;
      busca: for (const raio of D.raiosDoGrupo_m) {
        for (let p = 0; p < passos; p++) {
          const q = em(c, ref, inicio + p * D.passoAngularGrupo_graus, raio);
          if (regra(q, linha) && valida(q, posicoes)) {
            achou = q;
            break busca;
          }
        }
      }
      if (!achou) return null;
      posicoes.push(achou);
    }
    return posicoes;
  };

  const jazidas: Jazida[] = [];
  const registrar = (
    colocadas: Colocada[],
    zona: ZonaDeJazida,
    zonasDePouso: (sigma: Vec3, k: number) => number[],
    rotacoes: Vec3[],
  ) => {
    rotacoes.forEach((sigma, k) => {
      for (const { linha, d, fracao } of colocadas) {
        const q = aplicarRotacao(sigma, d);
        jazidas.push({
          recurso: linha.recurso as RecursosId,
          quantidade: Math.round(quantidade(linha) * (fracao ?? 1)),
          d: q,
          zona,
          zonasDePouso: zonasDePouso(sigma, k),
        });
        ocupadas.push(q);
      }
    });
  };
  /** Índice da zona de pouso para onde σ leva a zona k. */
  const zonaRotacionada = (sigma: Vec3, k: number) => {
    const alvo = aplicarRotacao(sigma, zonas[k]!.d);
    return zonas.findIndex((z) => arco(z.d, alvo) < 1e-9);
  };

  // Inicial: arco no fundo do platô, no maior vão entre as rampas.
  const fundo = rumoSemRampa(zona0);
  const iniciais = expandir(linhasDaZonaDoCenario('inicial'));
  /** A jazida inicial em p não fica no eixo de uma rampa da zona 0. */
  const foraDasRampas = (p: Vec3) => {
    const rumo = tangente(zona0.d, p);
    if (!rumo) return false;
    const d = distancia(zona0.d, p);
    return zona0.rampas.every((u) => {
      const cos = produtoEscalar(rumo, u);
      const lateral = d * Math.sqrt(Math.max(0, 1 - cos * cos));
      return cos <= 0 || lateral >= D.folgaRampa_m;
    });
  };
  /**
   * Uma tentativa de colocar as iniciais: vagas num arco de ±`arco` graus em volta do fundo,
   * cada jazida na primeira posição válida (ângulo perto da vaga, distância na ordem dada).
   */
  const tentarIniciais = (arcoGraus: number, deFora: boolean): Colocada[] | null => {
    const vagas = iniciais.map((_, k) =>
      iniciais.length === 1 ? 0 : -arcoGraus + (2 * arcoGraus * k) / (iniciais.length - 1),
    );
    // Distribui de fora para dentro: 1ª vaga, última, 2ª, penúltima...
    const ordemDasVagas = vagas.map((_, k) =>
      k % 2 === 0 ? k / 2 : vagas.length - 1 - (k - 1) / 2,
    );
    const colocadas: Colocada[] = [];
    for (const [k, linha] of iniciais.entries()) {
      const angulo = vagas[ordemDasVagas[k]!]!;
      const min = linha.dist_min_m ?? 0;
      const max = linha.dist_max_m ?? min;
      const passos = Array.from({ length: Math.floor((max - min) / 1.25) + 1 }, (_, j) => j * 1.25);
      // Um fio para dentro das bordas: o arco medido de volta não passa da faixa.
      const distancias = passos
        .map((j) => (deFora ? max - j : (min + max) / 2 + ((j % 2.5 ? -1 : 1) * j) / 2))
        .filter((d) => d >= min + 0.01 && d <= max - 0.01);
      let achou: Vec3 | null = null;
      busca: for (const ajuste of D.ajustesIniciais_graus) {
        for (const d of distancias) {
          const p = em(zona0.d, fundo, angulo + ajuste, d);
          if (
            foraDasRampas(p) &&
            valida(
              p,
              colocadas.map((c) => c.d),
              true,
            )
          ) {
            achou = p;
            break busca;
          }
        }
      }
      if (!achou) return null;
      colocadas.push({ linha, d: achou });
    }
    return colocadas;
  };
  let zona0Iniciais: Colocada[] | null = null;
  for (const arcoGraus of D.arcosIniciais_graus) {
    for (const deFora of [false, true]) {
      zona0Iniciais ??= tentarIniciais(arcoGraus, deFora);
    }
  }
  if (!zona0Iniciais) throw new Error(`Seed ${mapa.seed}: jazidas iniciais sem lugar`);
  registrar(zona0Iniciais, 'inicial', (sigma) => [zonaRotacionada(sigma, 0)], grupo);

  /** Resolve os pontos médios de uma lista (contestados ou centrais), órbita por órbita. */
  const resolverPontosMedios = (
    pontos: PontoMedio[],
    linhasPorPonto: JazidasRow[],
    zona: ZonaDeJazida,
  ): CentroDeZona[] => {
    const centros: CentroDeZona[] = pontos.map((m) => ({ d: m.d, zonasDePouso: m.zonasDePouso }));
    const resolvido = pontos.map(() => false);
    pontos.forEach((m, indice) => {
      if (resolvido[indice]) return;
      const [za, zb] = m.zonasDePouso;
      const longeDasVizinhas = (p: Vec3, linha: JazidasRow) =>
        [za, zb].every((k) => distancia(p, zonas[k]!.d) >= (linha.dist_min_m ?? 0));
      const estabilizador = grupo.filter((sigma) => iguais(aplicarRotacao(sigma, m.d), m.d));
      // Rumos em m: ao longo do arco bissetor (mantém a distância às duas zonas) e lateral.
      const normalBissetor = normalizar(diferenca(zonas[za]!.d, zonas[zb]!.d));
      const aoLongo = normalizar(produtoVetorial(normalBissetor, m.d));
      const lateral = normalizar(produtoVetorial(m.d, aoLongo));

      let colocadas: Colocada[] | null = null;
      let centro = m.d;
      if (estabilizador.length === 1) {
        // Sem simetria própria: grupo livre em volta do ponto, deslocado se preciso.
        busca: for (const desvio of D.desviosLateraisMedio_m) {
          for (const deslocamento of D.deslocamentosMedio_m) {
            let c = avancar(m.d, aoLongo, deslocamento / R).p;
            if (desvio !== 0) c = avancar(c, tangente(c, lateral) ?? lateral, desvio / R).p;
            const posicoes = agrupar(c, linhasPorPonto, longeDasVizinhas);
            if (posicoes) {
              colocadas = linhasPorPonto.map((linha, k) => ({ linha, d: posicoes[k]! }));
              centro = c;
              break busca;
            }
          }
        }
      } else {
        // Fixado por τ: pares espelhados (p, τ·p) do mesmo recurso. ECO-08: recurso com número
        // ímpar de jazidas ganha mais uma, e a quantidade se divide igualmente entre elas.
        const tau = estabilizador.find((s) => !iguais(s, [1, 1, 1]))!;
        const porRecurso = new Map<string, JazidasRow[]>();
        for (const linha of linhasPorPonto) {
          porRecurso.set(linha.recurso, [...(porRecurso.get(linha.recurso) ?? []), linha]);
        }
        const pares: Array<{ linha: JazidasRow; fracao: number }> = [];
        for (const lista of porRecurso.values()) {
          const total = lista.length % 2 === 0 ? lista.length : lista.length + 1;
          for (let k = 0; k < total / 2; k++) {
            pares.push({ linha: lista[0]!, fracao: lista.length / total });
          }
        }
        const tentativa: Colocada[] = [];
        const extras = () => tentativa.map((c) => c.d);
        let ok = true;
        // Pares: em volta do ponto, com a imagem por τ também válida.
        const passos = Math.round(360 / D.passoAngularGrupo_graus);
        // Cada par fica a 2·raio de si mesmo; com os pares em hexágono, o lado é o raio: começa
        // no espaçamento para caberem todos.
        const raiosDosPares = D.raiosDoGrupo_m.filter((r) => r >= espacamento);
        for (const [indice, { linha, fracao }] of pares.entries()) {
          if (!ok) break;
          let achou = false;
          busca: for (const raio of raiosDosPares) {
            for (let s = 0; s < passos; s++) {
              const p = em(
                m.d,
                lateral,
                (indice * 360) / pares.length + s * D.passoAngularGrupo_graus,
                raio,
              );
              const q = aplicarRotacao(tau, p);
              if (distancia(p, q) < espacamento) continue;
              if (!longeDasVizinhas(p, linha) || !valida(p, extras())) continue;
              if (!valida(q, [...extras(), p])) continue;
              tentativa.push({ linha, d: p, fracao }, { linha, d: q, fracao });
              achou = true;
              break busca;
            }
          }
          if (!achou) ok = false;
        }
        if (ok) colocadas = tentativa;
      }
      if (!colocadas) throw new Error(`Seed ${mapa.seed}: zona ${zona} sem lugar`);

      // Replica para os outros pontos da órbita (uma rotação por ponto).
      const rotacoes: Vec3[] = [];
      pontos.forEach((outro, k) => {
        const sigma = grupo.find((s) => iguais(aplicarRotacao(s, m.d), outro.d));
        if (!sigma || resolvido[k]) return;
        resolvido[k] = true;
        rotacoes.push(sigma);
        centros[k] = { d: aplicarRotacao(sigma, centro), zonasDePouso: outro.zonasDePouso };
      });
      registrar(
        colocadas,
        zona,
        (sigma) => {
          const destino = aplicarRotacao(sigma, m.d);
          return pontos.find((p) => iguais(p.d, destino))!.zonasDePouso;
        },
        rotacoes,
      );
    });
    return centros;
  };

  const contestadas = resolverPontosMedios(
    mapa.contestados,
    expandir(linhasDaZonaDoCenario('contestada')),
    'contestada',
  );
  // ECO-08: as jazidas `por_mapa` da zona central se dividem igualmente entre os pontos centrais.
  const porPontoCentral = linhasDaZonaDoCenario('central').flatMap((linha) => {
    const cada = linha.jazidas / mapa.centrais.length;
    if (!Number.isInteger(cada)) {
      throw new Error(`jazidas centrais de ${linha.recurso} não se dividem entre os pontos`);
    }
    return Array.from({ length: cada }, () => linha);
  });
  const centrais = resolverPontosMedios(mapa.centrais, porPontoCentral, 'central');

  // Expansão: a posição a 90–130 m mais afastada dos pontos médios e das outras expansões.
  const linhasExpansao = expandir(linhasDaZonaDoCenario('expansao'));
  const naFaixaDaZona0 = (p: Vec3, linha: JazidasRow) => {
    const d = distancia(p, zona0.d);
    return d >= (linha.dist_min_m ?? 0) && d <= (linha.dist_max_m ?? Infinity);
  };
  const pontosMedios = [...contestadas, ...centrais].map((c) => c.d);
  let melhor: { c: Vec3; nota: number; posicoes: Vec3[] } | null = null;
  const passosAngulares = Math.round(360 / D.passoAngularExpansao_graus);
  for (let s = 0; s < passosAngulares; s++) {
    for (const d of D.distanciasExpansao_m) {
      const c = em(zona0.d, fundo, s * D.passoAngularExpansao_graus, d);
      const copias = grupo.slice(1).map((sigma) => aplicarRotacao(sigma, c));
      const nota = Math.min(
        ...pontosMedios.map((m) => distancia(c, m)),
        ...copias.map((q) => distancia(c, q) - D.distanciaEntreExpansoes_m),
      );
      if (melhor && nota <= melhor.nota) continue;
      const posicoes = agrupar(c, linhasExpansao, naFaixaDaZona0);
      if (!posicoes) continue;
      // As réplicas também precisam de espaço entre si e para o resto.
      const replicas = grupo
        .slice(1)
        .flatMap((sigma) => posicoes.map((p) => aplicarRotacao(sigma, p)));
      if (
        !replicas.every((q) =>
          [...ocupadas, ...posicoes].every((o) => distancia(q, o) >= espacamento),
        )
      )
        continue;
      melhor = { c, nota, posicoes };
    }
  }
  if (!melhor) throw new Error(`Seed ${mapa.seed}: expansão sem lugar`);
  const expansao = melhor;
  registrar(
    linhasExpansao.map((linha, k) => ({ linha, d: expansao.posicoes[k]! })),
    'expansao',
    (sigma) => [zonaRotacionada(sigma, 0)],
    grupo,
  );
  const expansoes: CentroDeZona[] = grupo.map((sigma) => ({
    d: aplicarRotacao(sigma, expansao.c),
    zonasDePouso: [zonaRotacionada(sigma, 0)],
  }));

  // ECO-30 (D-89): jazidas espalhadas pelo planeta, sorteadas pela seed e replicadas pela simetria.
  const espalhadas = expandir(linhasDaZonaDoCenario('espalhada'));
  if (espalhadas.length > 0) {
    const rng = seedRng((mapa.seed ^ 0x6a2d) >>> 0);
    const sortear = (): Vec3 => {
      const z = 2 * nextFloat(rng) - 1;
      const fi = 2 * Math.PI * nextFloat(rng);
      const r = Math.sqrt(Math.max(0, 1 - z * z));
      return [r * Math.cos(fi), r * Math.sin(fi), z];
    };
    const area = 4 * Math.PI * R * R;
    const porSetor = Math.round(
      (param('jazidas_espalhadas_por_10k_m2') * area) / 10000 / mapa.simetria,
    );
    for (let c = 0; c < porSetor; c++) {
      const linha = espalhadas[c % espalhadas.length]!;
      for (let t = 0; t < D.tentativasEspalhada; t++) {
        const p = sortear();
        if (zonas.some((z) => distancia(p, z.d) < (linha.dist_min_m ?? 0))) continue;
        if (pontosMedios.some((m) => distancia(p, m) < D.folgaPontoMedio_m)) continue;
        if (!valida(p)) continue;
        const replicas = grupo.slice(1).map((sigma) => aplicarRotacao(sigma, p));
        if (!replicas.every((q, k) => valida(q, [p, ...replicas.slice(0, k)]))) continue;
        registrar([{ linha, d: p }], 'espalhada', () => [], grupo);
        break;
      }
    }
  }

  // CEN-19/D-99: em Ceres, o Lítio só existe nos veios de sal da maior cratera do mapa (e das
  // réplicas simétricas dela, uma por zona de pouso).
  if (cenario === 'ceres') {
    const n = mapa.simetria;
    let melhorBloco = 0;
    let melhorRaio = -1;
    for (let i = 0; i < mapa.crateras.length; i += n) {
      const raio = mapa.crateras[i]!.raio;
      if (raio > melhorRaio) {
        melhorRaio = raio;
        melhorBloco = i;
      }
    }
    if (melhorRaio < 0)
      throw new Error(`Seed ${mapa.seed}: Ceres sem cratera para os veios de sal`);
    const porCratera = Math.max(1, Math.round(param('ceres_sal_jazidas_por_cratera')));
    const quantidadeSal = Math.round(param('ceres_sal_quantidade_u'));
    for (let k = 0; k < n; k++) {
      const cratera = mapa.crateras[melhorBloco + k]!;
      // Bem dentro da bacia (longe da borda/brechas): metade do raio da cratera, no máximo.
      const raioMax = cratera.raio * 0.55;
      const colocadasNaCratera: Vec3[] = [];
      for (let j = 0; j < porCratera; j++) {
        let achou: Vec3 | null = null;
        busca: for (let raioM = espacamento / 2; raioM <= raioMax; raioM += 6) {
          for (let ang = (j * 360) / porCratera; ang < (j * 360) / porCratera + 360; ang += 20) {
            const p = em(cratera.d, cratera.ref, ang, raioM);
            if (alturaCratera(cratera, p, R) > -cratera.profundidade * 0.4) continue;
            if (!valida(p, colocadasNaCratera)) continue;
            achou = p;
            break busca;
          }
        }
        if (!achou) throw new Error(`Seed ${mapa.seed}: veios de sal sem lugar na cratera`);
        colocadasNaCratera.push(achou);
      }
      for (const d of colocadasNaCratera) {
        jazidas.push({
          recurso: 'li',
          quantidade: quantidadeSal,
          d,
          zona: 'espalhada',
          zonasDePouso: [],
        });
        ocupadas.push(d);
      }
    }
  }

  // CEN-21/D-108: em Europa, o Titânio não existe pela distribuição normal — só na falha mais
  // profunda do mapa (a placa mais distante de toda zona de pouso, com as réplicas simétricas
  // dela, uma por zona de pouso): a recompensa de atravessar a rede de placas tectônicas.
  if (cenario === 'europa' && mapa.placas.length > 0) {
    const n = mapa.simetria;
    const maisPertoDeQual = (p: Vec3): number => {
      let melhor = 0;
      let menorArco = Infinity;
      mapa.placas.forEach((placa, i) => {
        const d = arco(placa.d, p);
        if (d < menorArco) {
          menorArco = d;
          melhor = i;
        }
      });
      return melhor;
    };
    let melhorBloco = 0;
    let melhorDistancia = -1;
    for (let i = 0; i < mapa.placas.length; i += n) {
      const d = Math.min(...zonas.map((z) => distancia(mapa.placas[i]!.d, z.d)));
      if (d > melhorDistancia) {
        melhorDistancia = d;
        melhorBloco = i;
      }
    }
    if (melhorDistancia < 0) {
      throw new Error(`Seed ${mapa.seed}: Europa sem placa pra falha profunda`);
    }
    const porPlaca = Math.max(1, Math.round(param('europa_falhas_jazidas_por_placa')));
    const quantidadeTi = Math.round(param('europa_falhas_quantidade_u'));
    for (let k = 0; k < n; k++) {
      const indice = melhorBloco + k;
      const placa = mapa.placas[indice]!;
      const ref = tangente(placa.d, [0, 1, 0]) ?? tangente(placa.d, [1, 0, 0])!;
      const colocadasNaPlaca: Vec3[] = [];
      for (let j = 0; j < porPlaca; j++) {
        let achou: Vec3 | null = null;
        busca: for (let raioM = espacamento / 2; raioM <= 100; raioM += 6) {
          for (let ang = (j * 360) / porPlaca; ang < (j * 360) / porPlaca + 360; ang += 20) {
            const p = em(placa.d, ref, ang, raioM);
            // Bem dentro da célula (não perto da fronteira/ponte com a vizinha).
            if (maisPertoDeQual(p) !== indice) continue;
            if (!valida(p, colocadasNaPlaca)) continue;
            achou = p;
            break busca;
          }
        }
        if (!achou) throw new Error(`Seed ${mapa.seed}: falha profunda sem lugar na placa`);
        colocadasNaPlaca.push(achou);
      }
      for (const d of colocadasNaPlaca) {
        jazidas.push({
          recurso: 'ti',
          quantidade: quantidadeTi,
          d,
          zona: 'espalhada',
          zonasDePouso: [],
        });
        ocupadas.push(d);
      }
    }
  }

  return { jazidas, expansoes, contestadas, centrais };
}
