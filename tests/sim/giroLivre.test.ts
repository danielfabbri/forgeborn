import { describe, expect, it } from 'vitest';
import { dados, getComponent, type Sim } from '../../src/sim';
import type { SystemContext } from '../../src/sim/core/pipeline';
import { normalizar, soma, type Vec3 } from '../../src/sim/map/esfera';
import { validarPosicionamento } from '../../src/sim/producao/obra';
import { criar, mundoComMar, mundoLiso, partida, ponto } from './mundo-teste';

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const leste = (x: number, z: number) => normalizar(sub(ponto(x + 1, z), ponto(x, z)));
const norte = (x: number, z: number) => normalizar(sub(ponto(x, z + 1), ponto(x, z)));
/** Rumo a 45° entre leste e norte no ponto local (x, z), para testar o giro livre (D-96). */
const diagonal45 = (x: number, z: number) => normalizar(soma(leste(x, z), norte(x, z)));

const ctxDe = (sim: Sim, mundo = mundoLiso()): SystemContext => ({
  state: sim.state,
  tick: sim.state.tick,
  dt: 1 / sim.tickHz,
  commands: [],
  mundo,
  emit: () => {},
});

describe('T-199 — PRD-10, UI-08, D-96: giro livre de qualquer estrutura ao posicionar', () => {
  it('D-96: qualquer estrutura guarda o rumo do giro, não só Muro e Portão (D-56)', () => {
    const sim = partida(mundoLiso());
    const [torre] = criar(sim, [{ estrutura: 'laser_tower', x: 0, z: 0, rumo: diagonal45(0, 0) }]);
    const rumo = getComponent(sim.state, torre!, 'structure')!.rumo;
    const esperado = diagonal45(0, 0);
    expect(rumo).toBeDefined();
    // A projeção tangente ao guardar o rumo (D-56/D-96) é aproximada (passo de 1e-3), não exata.
    expect(rumo![0]).toBeCloseTo(esperado[0], 2);
    expect(rumo![1]).toBeCloseTo(esperado[1], 2);
    expect(rumo![2]).toBeCloseTo(esperado[2], 2);
  });

  it('D-96: pegadas quadradas giradas se sobrepõem mesmo fora da caixa alinhada ao norte (SAT)', () => {
    const sim = partida(mundoLiso());
    // Armazém (pegada 8 m, meio 4 m) girado 45° na origem.
    criar(sim, [{ estrutura: 'storage', x: 0, z: 0, rumo: diagonal45(0, 0) }]);
    const ctx = ctxDe(sim);
    // A 8,5 m a leste: a caixa norte-alinhada antiga (limite 4+4=8 m) diria "livre" (8,5 > 8),
    // mas a pegada girada alcança 4*sqrt(2) ≈ 5,66 m para leste e a nova (sem giro) alcança 4 m
    // para oeste — os quadrados reais só param de se tocar a partir de ≈ 9,66 m, então a 8,5 m
    // eles se sobrepõem de verdade.
    expect(validarPosicionamento(ctx, 'storage', ponto(8.5, 0))).toBe('ocupado');
  });

  it('D-96: pegadas quadradas giradas NÃO se sobrepõem mesmo dentro da caixa alinhada ao norte (SAT)', () => {
    const sim = partida(mundoLiso());
    // Armazém sem giro (norte) na origem.
    criar(sim, [{ estrutura: 'storage', x: 0, z: 0 }]);
    const ctx = ctxDe(sim);
    // Candidato a 10,5 m na diagonal nordeste, também girado 45°: a caixa norte-alinhada antiga
    // (limite 8 m por eixo; projeção de 10,5 m a 45° é ≈ 7,42 m em cada eixo) diria "ocupado",
    // mas os quadrados reais só se tocam até ≈ 9,66 m nessa direção — a 10,5 m eles não se tocam.
    const off = 10.5 * Math.SQRT1_2;
    const d = ponto(off, off);
    expect(validarPosicionamento(ctx, 'storage', d, undefined, diagonal45(off, off))).toBeNull();
  });

  it('D-96: o Porto girado continua exigindo a pegada toda sobre o líquido (PRD-10, D-90)', () => {
    const mundo = mundoComMar();
    const sim = partida(mundo, ['bra', 'usa'], 'tita');
    const ctx = ctxDe(sim, mundo);
    const meio = dados.estruturas.find((e) => e.id === 'port')!.pegada_m / 2; // 5 m
    expect(meio).toBeCloseTo(5, 6);
    // A 28 m (mar de 20 a 60 m): mesmo girado 45°, a ponta mais ao sul do losango
    // (28 - 5*sqrt(2) ≈ 20,9 m) ainda está no mar.
    expect(
      validarPosicionamento(ctx, 'port', ponto(0, 28), undefined, diagonal45(0, 28)),
    ).toBeNull();
    // A 26 m, sem giro a pegada (21 a 31 m) fica toda no mar, mas girada 45° a ponta sul do
    // losango (26 - 5*sqrt(2) ≈ 18,9 m) cai em terra: o giro tem que ser respeitado na validação.
    expect(validarPosicionamento(ctx, 'port', ponto(0, 26))).toBeNull();
    expect(validarPosicionamento(ctx, 'port', ponto(0, 26), undefined, diagonal45(0, 26))).toBe(
      'terra',
    );
  });
});
