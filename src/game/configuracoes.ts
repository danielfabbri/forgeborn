/**
 * Configurações (FLX-13, D-36): preset gráfico (TEC-19), rolagem pelas bordas, barras de vida
 * (UI-07) e escala da interface (UI-12). Salvas localmente (TEC-21) e aplicadas na hora.
 */
import { signal } from '@preact/signals';
import { gravar, ler } from './armazenamento';

export type PresetGrafico = 'baixo' | 'medio' | 'alto' | 'ultra';

export interface Configuracoes {
  grafico: PresetGrafico;
  rolagemPelasBordas: boolean;
  barrasSempre: boolean;
  /** UI-12: escala da interface, em % (de ESCALA_MIN a ESCALA_MAX). */
  escalaInterface: number;
}

/** TEC-19: escala de resolução (limitada à densidade da tela) e lado do mapa de sombras. */
export const PRESETS_GRAFICOS: Record<PresetGrafico, { escala: number; sombra: number }> = {
  baixo: { escala: 0.75, sombra: 0 },
  medio: { escala: 1, sombra: 1024 },
  alto: { escala: 1.5, sombra: 2048 },
  ultra: { escala: 2, sombra: 4096 },
};
export const PRESETS: readonly PresetGrafico[] = ['baixo', 'medio', 'alto', 'ultra'];

export const ESCALA_MIN = 80;
export const ESCALA_MAX = 150;
export const ESCALA_PASSO = 10;

export const PADRAO: Configuracoes = {
  grafico: 'alto',
  rolagemPelasBordas: true,
  barrasSempre: false,
  escalaInterface: 100,
};

const CHAVE = 'configuracoes';

/** Normaliza o que veio do armazenamento (campos faltando ou fora da faixa viram o padrão). */
export function normalizar(bruto: unknown): Configuracoes {
  const c = { ...PADRAO, ...(typeof bruto === 'object' && bruto !== null ? bruto : {}) };
  return {
    grafico: PRESETS.includes(c.grafico) ? c.grafico : PADRAO.grafico,
    rolagemPelasBordas: typeof c.rolagemPelasBordas === 'boolean' ? c.rolagemPelasBordas : true,
    barrasSempre: typeof c.barrasSempre === 'boolean' ? c.barrasSempre : false,
    escalaInterface:
      typeof c.escalaInterface === 'number'
        ? Math.min(ESCALA_MAX, Math.max(ESCALA_MIN, Math.round(c.escalaInterface)))
        : PADRAO.escalaInterface,
  };
}

export const configuracoes = signal<Configuracoes>(PADRAO);

export async function carregarConfiguracoes(): Promise<Configuracoes> {
  configuracoes.value = normalizar(await ler(CHAVE));
  return configuracoes.value;
}

export function alterarConfiguracoes(mudanca: Partial<Configuracoes>): void {
  configuracoes.value = normalizar({ ...configuracoes.value, ...mudanca });
  void gravar(CHAVE, configuracoes.value);
}

/** UI-12: a escala da interface vale para a camada de UI inteira. */
export function aplicarEscalaDaInterface(raiz: HTMLElement, escala: number): void {
  raiz.style.setProperty('--escala-ui', String(escala / 100));
}
