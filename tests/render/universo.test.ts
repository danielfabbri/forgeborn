import { describe, expect, it } from 'vitest';
import { CORPOS, estadoDoCorpo } from '../../src/render/cenaUniverso';
import { dados } from '../../src/sim';

describe('T-103 — FLX-04: Visão do Universo', () => {
  it('FLX-04: todos os corpos pedidos estão no mapa e cada cenário tem um corpo', () => {
    const ids = CORPOS.map((c) => c.id);
    for (const id of [
      'sol',
      'venus',
      'terra',
      'lua',
      'marte',
      'fobos',
      'ceres',
      'jupiter',
      'europa',
      'saturno',
      'tita',
    ]) {
      expect(ids).toContain(id);
    }
    const cenarios = CORPOS.flatMap((c) => c.cenarios);
    expect([...cenarios].sort()).toEqual(dados.cenarios.map((c) => c.id).sort());
  });

  it('FLX-04: o corpo mostra o melhor estado dos seus cenários', () => {
    const lua = CORPOS.find((c) => c.id === 'lua')!;
    expect(estadoDoCorpo(lua, (c) => (c === 'lua' ? 'disponivel' : 'bloqueado'))).toBe(
      'disponivel',
    );
    expect(estadoDoCorpo(lua, (c) => (c === 'lua' ? 'concluido' : 'bloqueado'))).toBe('concluido');
    expect(estadoDoCorpo(lua, () => 'bloqueado')).toBe('bloqueado');
    expect(
      estadoDoCorpo(
        CORPOS.find((c) => c.id === 'sol')!,
        () => 'disponivel',
      ),
    ).toBeNull();
  });
});
