import { describe, expect, it } from 'vitest';
import {
  desbloqueada,
  estrelas,
  liberadosNa,
  missoes,
  registrar,
  resolverMissao,
  type SlotDeCampanha,
} from '../../src/game/campanha';
import { dados } from '../../src/sim';

describe('T-130/T-133 — CAM-01 a CAM-04, CAM-08, D-73: campanha', () => {
  it('CAM-02: liberação cumulativa, com os itens que acompanham quem os fabrica', () => {
    const m00 = liberadosNa('m00');
    expect(m00).toEqual(expect.arrayContaining(['hover_explorer', 'printer', 'wall', 'gate']));
    // D-92: a Missão 0 libera a Fábrica de Artilharia no lugar do EX1 direto (deriva o EX1).
    expect(m00).toEqual(expect.arrayContaining(['arsenal', 'hover_ex1']));
    expect(m00).not.toContain('hover_opq');
    expect(m00).not.toContain('siege_tank');
    // A Missão 1 acumula a 0 e libera a Antena (D-83).
    expect(new Set(liberadosNa('m01'))).toEqual(new Set([...m00, 'antenna']));
    const m02 = liberadosNa('m02');
    expect(m02).toEqual(
      expect.arrayContaining([...m00, 'hover_opq', 'siege_tank', 'aa_battery', 'mag_tower']),
    );
    expect(liberadosNa('m05')).toEqual(
      expect.arrayContaining(['satellite_uplink', 'satellite', 'missile_silo', 'missile_short']),
    );
    expect(liberadosNa('m03')).toEqual(expect.arrayContaining(['hover_minelayer', 'mine']));
    // D-91: a Missão 4 (Fobos) libera o Hangar, que traz os 3 drones consigo (CAM-02).
    expect(liberadosNa('m03')).not.toEqual(
      expect.arrayContaining(['hangar', 'drone_bomber', 'drone_laser', 'drone_kamikaze']),
    );
    expect(liberadosNa('m04')).toEqual(
      expect.arrayContaining(['hangar', 'drone_bomber', 'drone_laser', 'drone_kamikaze']),
    );
  });

  it('CAM-03: estrelas pelo tempo-par e pelo HP mínimo da Nave', () => {
    const par = dados.missoes.find((m) => m.id === 'm01')!.tempo_par_min;
    expect(estrelas(par * 60 + 1, par, 100)).toBe(1);
    expect(estrelas(par * 60, par, 49)).toBe(2);
    expect(estrelas(par * 60 - 10, par, 50)).toBe(3);
  });

  it('CAM-01/CAM-08: desbloqueio em ordem e melhor resultado guardado', () => {
    let slot: SlotDeCampanha = { nacao: 'bra', missoes: {} };
    const [m0, m1, m2] = missoes();
    expect(desbloqueada(slot, m0!.id)).toBe(true);
    expect(desbloqueada(slot, m1!.id)).toBe(false);
    slot = registrar(slot, m0!.id, { estrelas: 2, melhor_s: 900 });
    expect(desbloqueada(slot, m1!.id)).toBe(true);
    expect(desbloqueada(slot, m2!.id)).toBe(false);
    slot = registrar(slot, m0!.id, { estrelas: 1, melhor_s: 700 });
    expect(slot.missoes[m0!.id]).toEqual({ estrelas: 2, melhor_s: 700 });
    // D-77: a Missão 3 (Marte) abre depois da 2; as de versões futuras (v1.x) seguem fechadas.
    slot = registrar(slot, 'm01', { estrelas: 1, melhor_s: 1 });
    expect(desbloqueada(slot, 'm03')).toBe(false);
    slot = registrar(slot, 'm02', { estrelas: 1, melhor_s: 1 });
    expect(desbloqueada(slot, 'm03')).toBe(true);
    slot = registrar(slot, 'm03', { estrelas: 1, melhor_s: 1 });
    expect(desbloqueada(slot, 'm04')).toBe(false);
  });

  it('D-77: a Missão 3 é em Valles Marineris (Marte), contra duas IAs Normais com Nave', () => {
    const pm = resolverMissao('m03', 'bra', 0)!;
    expect(pm.resolvida.mapa).toMatchObject({ cenario: 'marte', zonas: 4 });
    expect(pm.semNave).toEqual([]);
    expect(Object.values(pm.resolvida.ias)).toEqual(['normal', 'normal']);
    expect(pm.resolvida.nacoes).toHaveLength(3);
    expect(new Set(pm.resolvida.zonas).size).toBe(3);
    // CAM-02: a Missão 3 libera a Usina Nuclear e o Hover de Plantio (com as minas).
    expect(liberadosNa('m03')).toEqual(
      expect.arrayContaining(['nuclear_plant', 'hover_minelayer', 'mine']),
    );
  });
});
