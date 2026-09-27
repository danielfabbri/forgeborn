import { describe, expect, it } from 'vitest';
import { interpretarMacete } from '../../src/game/macetes';

describe('T-136 — TEC-27: texto dos macetes', () => {
  it('TEC-27: "mais" + recurso, sem importar maiúsculas, acentos e espaços', () => {
    expect(interpretarMacete('maiscobre')).toEqual({ tipo: 'recurso', recurso: 'cu' });
    expect(interpretarMacete('maislitio')?.recurso).toBe('li');
    expect(interpretarMacete('Mais Lítio')?.recurso).toBe('li');
    expect(interpretarMacete('maisferro')?.recurso).toBe('fe');
    expect(interpretarMacete('maissilicio')?.recurso).toBe('si');
    expect(interpretarMacete('maistitanio')?.recurso).toBe('ti');
    expect(interpretarMacete('maisuranio')?.recurso).toBe('u');
    expect(interpretarMacete('maisouro')).toBeNull();
    expect(interpretarMacete('')).toBeNull();
  });
});
