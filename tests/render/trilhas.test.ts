import { describe, expect, it } from 'vitest';
import { proximaTrilha, trilhasDaPasta } from '../../src/audio/trilhas';

describe('T-126 — AUD-01, D-47, D-74: trilhas', () => {
  it('D-74: separa entrance, map e todas as soundtrack_* da pasta, em ordem de número', () => {
    const p = trilhasDaPasta({
      './soundtrack_10.mp3': 'u10',
      './entrance.mp3': 'ue',
      './soundtrack_2.mp3': 'u2',
      './map.mp3': 'um',
      './soundtrack_1.mp3': 'u1',
      './outro.mp3': 'x',
    });
    expect(p.abertura).toBe('ue');
    expect(p.menu).toBe('um');
    expect(p.partida).toEqual(['u1', 'u2', 'u10']);
    expect(trilhasDaPasta({})).toEqual({ abertura: null, menu: null, partida: [] });
  });

  it('AUD-01: as trilhas do produto estão na pasta', async () => {
    const { TRILHAS } = await import('../../src/audio/trilhas');
    expect(TRILHAS.abertura).toBeTruthy();
    expect(TRILHAS.menu).toBeTruthy();
    expect(TRILHAS.partida.length).toBeGreaterThanOrEqual(5);
  });

  it('AUD-01: a próxima trilha da partida é sorteada sem repetir a última', () => {
    const lista = ['t1', 't2', 't3'];
    for (let k = 0; k < 50; k++) {
      const sorte = () => k / 50;
      expect(proximaTrilha(lista, 't2', sorte)).not.toBe('t2');
    }
    expect(proximaTrilha(['só'], 'só')).toBe('só');
    expect(proximaTrilha([], null)).toBeNull();
  });
});
