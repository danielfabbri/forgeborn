/**
 * Validação obrigatória do mapa gerado (CEN-11) e geração com recuo para a próxima seed.
 *
 * "Rotas distintas" entre zonas vizinhas: acha-se a rota mais curta, bloqueia-se um corredor de
 * `larguraCorredor_m` em volta dela fora dos platôs (o que tranca também a rampa usada) e exige-se
 * que ainda exista rota. Na prática, as duas rotas saem por rampas diferentes. No planeta todas
 * as zonas de pouso são vizinhas (CEN-07), então todos os pares são verificados.
 */
import type { CenariosId } from '../data';
import { celulasNoRaio, componenteConectado, noComponente, temFolga } from './conectividade';
import { arco, centroDaCelula } from './esfera';
import { celulaDe, derivarGrades, type GradeNavegacao, type GradesDoMapa } from './grids';
import { type DistribuicaoDeJazidas, distribuirJazidas } from './jazidas';
import { GERADOR_LUA, gerarMapaLunar, type MapaLunar, type Simetria } from './lunar';
import { dados } from '../data';

function cenarioOuFalha(cenario: CenariosId) {
  const c = dados.cenarios.find((x) => x.id === cenario);
  if (!c) throw new Error(`Cenário desconhecido: ${cenario}`);
  return c;
}

/** CEN-16 (D-79): o raio do planeta é o do cenário. */
export function raioDoCenario(cenario: CenariosId): number {
  return cenarioOuFalha(cenario).raio_m;
}

/**
 * Prévia do Free Battle (FB-02): só o relevo e as zonas de um preset (seed já validada, CEN-12),
 * com um vértice a cada `texel` metros; sem grades nem jazidas.
 */
export function gerarPrevia(
  seed: number,
  zonas: Simetria,
  cenario: CenariosId,
  texel = 4,
): MapaLunar {
  const c = cenarioOuFalha(cenario);
  return gerarMapaLunar(
    seed,
    raioDoCenario(cenario),
    zonas,
    c.mult_cratera,
    c.mult_relevo,
    temLiquido(cenario),
    texel,
  );
}

/** CEN-04 (D-90): cenários com líquido na superfície (evento `lagos_metano`). */
export const temLiquido = (cenario: CenariosId): boolean =>
  dados.cenarios.find((c) => c.id === cenario)?.evento === 'lagos_metano';

export type MotivoInvalido =
  | 'zonas_desconectadas'
  | 'rotas_insuficientes'
  | 'jazida_inalcancavel'
  | 'jazida_perto_de_paredao'
  | 'distribuicao_impossivel';

export interface ProblemaDeMapa {
  motivo: MotivoInvalido;
  detalhe: string;
}

export const VALIDACAO = {
  folgaPenhasco_m: 6, // CEN-11
  larguraCorredor_m: 12,
  raioLivrePlato_m: GERADOR_LUA.raioPlato + GERADOR_LUA.folgaTopo + GERADOR_LUA.larguraPenhasco,
  maxTentativas: 50,
} as const;

/** Rota mais curta (vizinhas de lado) entre duas células, como lista de índices; null se não há. */
function rotaMaisCurta(
  nav: GradeNavegacao,
  bloqueado: Uint8Array,
  origem: number,
  destino: number,
): number[] | null {
  const total = nav.esfera.celulas;
  const anterior = new Int32Array(total).fill(-1);
  const fila = new Int32Array(total);
  let inicio = 0;
  let fim = 0;
  anterior[origem] = origem;
  fila[fim++] = origem;
  const vizinhos = nav.esfera.vizinhos;
  while (inicio < fim) {
    const atual = fila[inicio++]!;
    if (atual === destino) break;
    for (let d = 0; d < 4; d++) {
      const v = vizinhos[atual * 8 + d]!;
      if (v < 0 || anterior[v] !== -1 || bloqueado[v] === 1) continue;
      // D-90: o líquido conta como rota (de barco).
      if (nav.passavel[v] !== 1 && nav.liquido?.[v] !== 1) continue;
      anterior[v] = atual;
      fila[fim++] = v;
    }
  }
  if (anterior[destino] === -1) return null;
  const rota: number[] = [];
  for (let c = destino; c !== origem; c = anterior[c]!) rota.push(c);
  rota.push(origem);
  return rota.reverse();
}

/** Há ao menos duas rotas distintas entre as zonas de pouso a e b? */
function temDuasRotas(mapa: MapaLunar, nav: GradeNavegacao, a: number, b: number): boolean {
  const zonaA = mapa.zonasDePouso[a]!;
  const zonaB = mapa.zonasDePouso[b]!;
  const total = nav.esfera.celulas;
  const origem = celulaDe(nav, zonaA.d);
  const destino = celulaDe(nav, zonaB.d);
  const primeira = rotaMaisCurta(nav, new Uint8Array(total), origem, destino);
  if (!primeira) return false;

  const bloqueado = new Uint8Array(total);
  const noPlato = (c: number) => {
    const p = centroDaCelula(nav.esfera, c);
    return (
      mapa.raio_m * arco(p, zonaA.d) < VALIDACAO.raioLivrePlato_m ||
      mapa.raio_m * arco(p, zonaB.d) < VALIDACAO.raioLivrePlato_m
    );
  };
  for (const celula of primeira) {
    for (const v of celulasNoRaio(
      nav,
      centroDaCelula(nav.esfera, celula),
      VALIDACAO.larguraCorredor_m,
    )) {
      if (!noPlato(v)) bloqueado[v] = 1;
    }
  }
  return rotaMaisCurta(nav, bloqueado, origem, destino) !== null;
}

/** CEN-11: devolve os problemas do mapa; lista vazia = mapa válido. */
export function validarMapa(
  mapa: MapaLunar,
  grades: GradesDoMapa,
  distribuicao: DistribuicaoDeJazidas,
): ProblemaDeMapa[] {
  const nav = grades.navegacao;
  const problemas: ProblemaDeMapa[] = [];
  // D-90: o mar liga (de barco) as zonas e as jazidas das ilhas.
  const componente = componenteConectado(nav, celulaDe(nav, mapa.zonasDePouso[0]!.d), true);

  mapa.zonasDePouso.forEach((zona, k) => {
    if (!noComponente(nav, componente, zona.d)) {
      problemas.push({
        motivo: 'zonas_desconectadas',
        detalhe: `zona ${k} sem caminho até a zona 0`,
      });
    }
  });
  if (problemas.length === 0) {
    const n = mapa.zonasDePouso.length;
    for (let a = 0; a < n; a++) {
      for (let b = a + 1; b < n; b++) {
        if (!temDuasRotas(mapa, nav, a, b)) {
          problemas.push({
            motivo: 'rotas_insuficientes',
            detalhe: `zonas ${a} e ${b} com uma rota só`,
          });
        }
      }
    }
  }
  distribuicao.jazidas.forEach((jazida, k) => {
    const [x, y, z] = jazida.d.map((v) => (v * mapa.raio_m).toFixed(1));
    const onde = `jazida ${k} (${jazida.recurso}, ${jazida.zona}) em (${x}, ${y}, ${z})`;
    if (!noComponente(nav, componente, jazida.d)) {
      problemas.push({ motivo: 'jazida_inalcancavel', detalhe: onde });
    }
    if (!temFolga(nav, jazida.d, VALIDACAO.folgaPenhasco_m)) {
      problemas.push({ motivo: 'jazida_perto_de_paredao', detalhe: onde });
    }
  });
  return problemas;
}

export interface MapaPronto {
  seed: number;
  mapa: MapaLunar;
  grades: GradesDoMapa;
  jazidas: DistribuicaoDeJazidas;
  /** Seeds recusadas antes desta, com os motivos. */
  rejeitadas: Array<{ seed: number; problemas: ProblemaDeMapa[] }>;
}

/**
 * Gera e valida um mapa; seed inválida passa para a próxima (CEN-11). `validar` é o validador
 * do CEN-11; os testes trocam para exercitar o recuo.
 */
export function gerarMapaValido(
  seed: number,
  zonas: Simetria,
  cenario: CenariosId,
  validar: typeof validarMapa = validarMapa,
): MapaPronto {
  const rejeitadas: MapaPronto['rejeitadas'] = [];
  const c = cenarioOuFalha(cenario);
  for (let tentativa = 0; tentativa < VALIDACAO.maxTentativas; tentativa++) {
    const atual = seed + tentativa;
    // CEN-09 (D-98): mult_cratera/mult_relevo do cenário (plano na Terra, quase sem crateras em
    // Vênus); CEN-04: Titã tem mares de metano.
    const mapa = gerarMapaLunar(
      atual,
      c.raio_m,
      zonas,
      c.mult_cratera,
      c.mult_relevo,
      temLiquido(cenario),
    );
    const grades = derivarGrades(mapa);
    let jazidas: DistribuicaoDeJazidas;
    try {
      jazidas = distribuirJazidas(mapa, grades, cenario);
    } catch (erro) {
      const detalhe = erro instanceof Error ? erro.message : String(erro);
      rejeitadas.push({ seed: atual, problemas: [{ motivo: 'distribuicao_impossivel', detalhe }] });
      continue;
    }
    const problemas = validar(mapa, grades, jazidas);
    if (problemas.length === 0) return { seed: atual, mapa, grades, jazidas, rejeitadas };
    rejeitadas.push({ seed: atual, problemas });
  }
  throw new Error(`Nenhum mapa válido em ${VALIDACAO.maxTentativas} seeds a partir de ${seed}`);
}
