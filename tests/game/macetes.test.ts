import { describe, expect, it } from 'vitest';
import { interpretarMacete } from '../../src/game/macetes';

describe('T-136 — TEC-27: texto dos macetes', () => {
  it('TEC-27: "mais" + recurso, sem importar maiúsculas, acentos e espaços', () => {
    expect(interpretarMacete('maiscobre')).toEqual({ tipo: 'recurso', recurso: 'cu' });
    expect((interpretarMacete('maislitio') as { recurso?: string } | null)?.recurso).toBe('li');
    expect((interpretarMacete('Mais Lítio') as { recurso?: string } | null)?.recurso).toBe('li');
    expect((interpretarMacete('maisferro') as { recurso?: string } | null)?.recurso).toBe('fe');
    expect((interpretarMacete('maissilicio') as { recurso?: string } | null)?.recurso).toBe('si');
    expect((interpretarMacete('maistitanio') as { recurso?: string } | null)?.recurso).toBe('ti');
    expect((interpretarMacete('maisuranio') as { recurso?: string } | null)?.recurso).toBe('u');
    expect(interpretarMacete('maisouro')).toBeNull();
    // D-83
    expect(interpretarMacete('Mais Tudo')).toEqual({ tipo: 'todos' });
    expect(interpretarMacete('')).toBeNull();
  });
});
