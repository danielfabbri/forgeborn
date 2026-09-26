import { describe, expect, it } from 'vitest';
import {
  desbloqueada,
  estrelas,
  liberadosNa,
  missoes,
  registrar,
  type SlotDeCampanha,
} from '../../src/game/campanha';
import { dados } from '../../src/sim';

describe('T-130/T-133 — CAM-01 a CAM-04, CAM-08, D-73: campanha', () => {
  it('CAM-02: liberação cumulativa, com os itens que acompanham quem os fabrica', () => {
    const m00 = liberadosNa('m00');
    expect(m00).toEqual(expect.arrayContaining(['hover_explorer', 'printer', 'wall', 'gate']));
    expect(m00).not.toContain('hover_opq');
    // A Missão 1 não libera nada novo: acumula a 0.
    expect(new Set(liberadosNa('m01'))).toEqual(new Set(m00));
    const m02 = liberadosNa('m02');
    expect(m02).toEqual(expect.arrayContaining([...m00, 'hover_opq', 'aa_battery', 'mag_tower']));
    expect(liberadosNa('m05')).toEqual(
      expect.arrayContaining(['satellite_uplink', 'satellite', 'missile_silo', 'missile_short']),
    );
    expect(liberadosNa('m03')).toEqual(expect.arrayContaining(['hover_minelayer', 'mine']));
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
    // Missões de versões futuras (v1.x) ficam fechadas mesmo com a anterior concluída.
    const m03 = missoes().find((m) => m.id === 'm03')!;
    slot = registrar(slot, 'm02', { estrelas: 1, melhor_s: 1 });
    expect(desbloqueada(slot, m03.id)).toBe(false);
  });
});
