import { describe, expect, it } from 'vitest';
import { proximaTrilha } from '../../src/audio/trilhas';

describe('T-126 — AUD-01, D-47: trilhas', () => {
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
