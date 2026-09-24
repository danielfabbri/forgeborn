/**
 * TEC-22: o contexto de áudio (Web Audio API) só é criado ou retomado depois de um gesto do
 * usuário. A primeira tecla ou clique da Tela de Abertura (FLX-02) o desbloqueia.
 */
let contexto: AudioContext | null = null;

export function desbloquearAudio(): AudioContext | null {
  try {
    const Construtor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Construtor) return null;
    contexto ??= new Construtor();
    if (contexto.state === 'suspended') void contexto.resume();
    return contexto;
  } catch {
    return null;
  }
}

/** Estado do áudio: null antes do primeiro gesto. */
export const estadoDoAudio = (): AudioContextState | null => contexto?.state ?? null;
