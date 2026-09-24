/**
 * FLX-01 (splash e carregamento inicial) e FLX-08 (carregamento da partida): logo e barra de
 * progresso em DOM puro, para aparecer antes dos módulos pesados (Three.js, simulação).
 */
import { t, type TextKey } from '../i18n';

/** FLX-08: dicas e trechos de lore sorteados no carregamento da partida. */
export const DICAS: readonly TextKey[] = [
  'dica.1',
  'dica.2',
  'dica.3',
  'dica.4',
  'dica.5',
  'dica.6',
  'dica.7',
  'dica.8',
];

let raiz: HTMLDivElement | null = null;
let barra: HTMLDivElement | null = null;
let etapa: HTMLDivElement | null = null;

/** Mostra a tela; `dica` só no carregamento da partida (FLX-08). */
export function mostrarCarregamento(tipo: 'splash' | 'partida'): void {
  esconderCarregamento();
  raiz = document.createElement('div');
  raiz.className = `carregamento ${tipo}`;
  raiz.dataset.testid = 'carregamento';
  const logo = document.createElement('div');
  logo.className = 'logo';
  logo.textContent = t('jogo.nome');
  const trilho = document.createElement('div');
  trilho.className = 'trilho';
  barra = document.createElement('div');
  barra.className = 'barra';
  trilho.appendChild(barra);
  etapa = document.createElement('div');
  etapa.className = 'etapa';
  raiz.append(logo, trilho, etapa);
  if (tipo === 'partida') {
    const dica = document.createElement('p');
    dica.className = 'dica';
    dica.dataset.testid = 'dica';
    // Apresentação: o sorteio da dica não é da simulação.
    dica.textContent = t(DICAS[Math.floor(Math.random() * DICAS.length)]!);
    raiz.appendChild(dica);
  }
  document.body.appendChild(raiz);
  progresso(0);
}

export function progresso(fracao: number, texto?: TextKey): void {
  if (barra) barra.style.width = `${Math.round(Math.min(1, Math.max(0, fracao)) * 100)}%`;
  if (etapa && texto) etapa.textContent = t(texto);
}

export function esconderCarregamento(): void {
  raiz?.remove();
  raiz = barra = etapa = null;
}

/** Espera o navegador pintar (a barra aparece antes de um passo que trava a thread). */
export const pintar = (): Promise<void> =>
  new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
