/**
 * AUD-03 (D-46): a voz da IA do jogador pela síntese de voz do navegador, em pt-BR, calma e
 * sempre com legenda (a legenda é o próprio alerta na pilha, UI-06). Sem voz pt-BR, só a
 * legenda. Fala uma por vez; um alerta mais urgente interrompe um menos urgente.
 */
import { configuracoes } from '../game/configuracoes';

const ORDEM = { baixa: 0, media: 1, alta: 2, critica: 3 } as const;
export type PrioridadeDaVoz = keyof typeof ORDEM;

/** Apresentação: fala um pouco mais lenta e grave (calma). */
const RITMO = 0.95;
const TOM = 0.9;

let vozPtBr: SpeechSynthesisVoice | null | undefined;
let falando: PrioridadeDaVoz | null = null;

function escolherVoz(): SpeechSynthesisVoice | null {
  if (vozPtBr !== undefined && vozPtBr !== null) return vozPtBr;
  if (typeof speechSynthesis === 'undefined') return null;
  const vozes = speechSynthesis.getVoices();
  vozPtBr =
    vozes.find((v) => v.lang === 'pt-BR') ??
    vozes.find((v) => v.lang.toLowerCase().startsWith('pt')) ??
    null;
  return vozPtBr;
}

/** Fala o texto, se houver voz pt-BR; devolve se falou. */
export function falar(texto: string, prioridade: PrioridadeDaVoz): boolean {
  const voz = escolherVoz();
  if (!voz) return false;
  if (falando !== null && speechSynthesis.speaking) {
    // Só um alerta mais urgente interrompe; os outros esperam a vez ou se perdem.
    if (ORDEM[prioridade] <= ORDEM[falando]) return false;
    speechSynthesis.cancel();
  }
  const { geral, voz: volumeVoz } = configuracoes.value.volumes;
  const fala = new SpeechSynthesisUtterance(texto);
  fala.voice = voz;
  fala.lang = voz.lang;
  fala.rate = RITMO;
  fala.pitch = TOM;
  fala.volume = (geral / 100) * (volumeVoz / 100);
  fala.onend = () => (falando = null);
  falando = prioridade;
  speechSynthesis.speak(fala);
  return true;
}

// As vozes chegam depois do carregamento em alguns navegadores.
if (typeof speechSynthesis !== 'undefined') {
  speechSynthesis.addEventListener?.('voiceschanged', () => {
    vozPtBr = undefined;
  });
}
