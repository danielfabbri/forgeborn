import { describe, expect, it } from 'vitest';
import { dados, getComponent } from '../../src/sim';
import { estadoEm, VISIVEL } from '../../src/sim/visao/nevoa';
import { criar, mundoLiso, partida, ponto } from './mundo-teste';

const visaoDaAntena = () => dados.estruturas.find((e) => e.id === 'antenna')!.visao_m;
const contexto = (sim: ReturnType<typeof partida>) =>
  ({ state: sim.state, mundo: mundoLiso() }) as never;

describe('T-167 — UNI-14, ENE-03, D-83: Antena', () => {
  it('UNI-14: com energia, a Antena enxerga visao_m em volta (bem mais que a Torre)', () => {
    const sim = partida(mundoLiso());
    criar(sim, [{ estrutura: 'ship', x: 0, z: 0 }]);
    const [antena] = criar(sim, [{ estrutura: 'antenna', x: 0, z: 0.5 }]);
    expect(getComponent(sim.state, antena!, 'consumidor')?.demanda_en_s).toBe(
      dados.estruturas.find((e) => e.id === 'antenna')!.manutencao_en_s,
    );
    sim.run(10);
    const longe = ponto(0, visaoDaAntena() - 5);
    expect(estadoEm(contexto(sim), 'bra', longe)).toBe(VISIVEL);
    expect(visaoDaAntena()).toBeGreaterThan(
      dados.estruturas.find((e) => e.id === 'laser_tower')!.visao_m * 3,
    );
  });

  it('UNI-14: sem energia na rede, a Antena não enxerga', () => {
    const sim = partida(mundoLiso());
    const [antena] = criar(sim, [{ estrutura: 'antenna', x: 0, z: 0 }]);
    // Sem Nave nem usina: a rede não tem geração nem banco.
    sim.run(10);
    expect(getComponent(sim.state, antena!, 'consumidor')!.atendido).toBe(0);
    expect(estadoEm(contexto(sim), 'bra', ponto(0, 40))).not.toBe(VISIVEL);
  });
});
