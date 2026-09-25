/**
 * TEC-22: o contexto de áudio (Web Audio API) só é criado ou retomado depois de um gesto do
 * usuário. A primeira tecla ou clique da página (na Tela de Abertura, FLX-02, ou na partida,
 * que abre numa página nova, FLX-14) o desbloqueia.
 *
 * AUD-05: os canais de mixagem (geral, música, efeitos, voz, ambiente) são nós de ganho; o
 * volume de cada um vem das Configurações.
 */
import type { CanalDeAudio } from '../game/configuracoes';

let contexto: AudioContext | null = null;
let canais: Record<CanalDeAudio, GainNode> | null = null;
const aoDesbloquear: Array<() => void> = [];

function criarCanais(ctx: AudioContext): Record<CanalDeAudio, GainNode> {
  const geral = ctx.createGain();
  geral.connect(ctx.destination);
  const canal = () => {
    const g = ctx.createGain();
    g.connect(geral);
    return g;
  };
  return { geral, musica: canal(), efeitos: canal(), voz: canal(), ambiente: canal() };
}

export function desbloquearAudio(): AudioContext | null {
  try {
    const Construtor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Construtor) return null;
    const novo = contexto === null;
    contexto ??= new Construtor();
    canais ??= criarCanais(contexto);
    if (contexto.state === 'suspended') void contexto.resume();
    if (novo) for (const f of aoDesbloquear.splice(0)) f();
    return contexto;
  } catch {
    return null;
  }
}

/** Contexto e canais, se o áudio já foi desbloqueado. */
export function audio(): { ctx: AudioContext; canais: Record<CanalDeAudio, GainNode> } | null {
  return contexto && canais ? { ctx: contexto, canais } : null;
}

/** Roda `f` quando o áudio for desbloqueado (na hora, se já foi). */
export function quandoDesbloquear(f: () => void): void {
  if (contexto) f();
  else aoDesbloquear.push(f);
}

/** AUD-05: aplica os volumes (0 a 100) aos canais. */
export function aplicarVolumes(volumes: Record<CanalDeAudio, number>): void {
  const a = audio();
  if (!a) return;
  for (const [canal, v] of Object.entries(volumes) as Array<[CanalDeAudio, number]>) {
    a.canais[canal].gain.setTargetAtTime(v / 100, a.ctx.currentTime, 0.05);
  }
}

/** Desbloqueia no primeiro gesto da página. */
export function desbloquearNoPrimeiroGesto(): void {
  const gesto = () => {
    desbloquearAudio();
    window.removeEventListener('keydown', gesto, true);
    window.removeEventListener('pointerdown', gesto, true);
  };
  window.addEventListener('keydown', gesto, true);
  window.addEventListener('pointerdown', gesto, true);
}

/** Estado do áudio: null antes do primeiro gesto. */
export const estadoDoAudio = (): AudioContextState | null => contexto?.state ?? null;
