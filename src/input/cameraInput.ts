/**
 * Entrada da câmera RTS (CTL-02): setas e bordas da tela fazem pan, a roda faz zoom,
 * o botão do meio arrastado gira em torno do foco e Home volta ao norte.
 */
import {
  aplicarPan,
  aplicarZoom,
  atualizarCamera,
  CAMERA_RTS,
  type EstadoCameraRts,
  rotacionar,
  voltarAoNorte,
} from '../render/cameraRts';

export interface EntradaCamera {
  /** Aplica o pan pendente e suaviza o zoom; chame a cada quadro. */
  atualizar(dt: number): void;
  dispose(): void;
}

export interface OpcoesEntradaCamera {
  /** CTL-02: a rolagem pelas bordas é desligável. */
  rolagemPelasBordas: () => boolean;
  /** Controle direto (CTL-08): a câmera RTS não recebe entrada. */
  bloqueado?: () => boolean;
}

export function ligarEntradaCamera(
  alvo: HTMLElement,
  estado: EstadoCameraRts,
  opcoes: OpcoesEntradaCamera,
): EntradaCamera {
  const setas = new Set<string>();
  // A rolagem pelas bordas só vale depois que o mouse entrou de fato na janela.
  let mouse: { x: number; y: number } | null = null;
  let girando = false;

  const teclaDesce = (evento: KeyboardEvent) => {
    if (evento.key.startsWith('Arrow')) {
      setas.add(evento.key);
      evento.preventDefault();
    } else if (evento.key === 'Home') {
      voltarAoNorte(estado);
      evento.preventDefault();
    }
  };
  const teclaSobe = (evento: KeyboardEvent) => setas.delete(evento.key);
  const perdeuFoco = () => {
    setas.clear();
    mouse = null;
    girando = false;
  };
  const moveu = (evento: MouseEvent) => {
    mouse = { x: evento.clientX, y: evento.clientY };
    if (girando) rotacionar(estado, evento.movementX);
  };
  const saiu = () => {
    mouse = null;
  };
  const apertou = (evento: MouseEvent) => {
    if (evento.button === 1) {
      girando = true;
      evento.preventDefault();
    }
  };
  const soltou = (evento: MouseEvent) => {
    if (evento.button === 1) girando = false;
  };
  const roda = (evento: WheelEvent) => {
    evento.preventDefault();
    if (opcoes.bloqueado?.()) return;
    aplicarZoom(estado, Math.sign(evento.deltaY));
  };

  window.addEventListener('keydown', teclaDesce);
  window.addEventListener('keyup', teclaSobe);
  window.addEventListener('blur', perdeuFoco);
  window.addEventListener('mousemove', moveu);
  document.documentElement.addEventListener('mouseleave', saiu);
  alvo.addEventListener('mousedown', apertou);
  window.addEventListener('mouseup', soltou);
  alvo.addEventListener('wheel', roda, { passive: false });

  return {
    atualizar(dt: number) {
      if (opcoes.bloqueado?.()) {
        atualizarCamera(estado, dt);
        return;
      }
      let frente = (setas.has('ArrowUp') ? 1 : 0) - (setas.has('ArrowDown') ? 1 : 0);
      let lado = (setas.has('ArrowRight') ? 1 : 0) - (setas.has('ArrowLeft') ? 1 : 0);
      if (mouse && opcoes.rolagemPelasBordas()) {
        const borda = CAMERA_RTS.bordaTela_px;
        if (mouse.x <= borda) lado -= 1;
        if (mouse.x >= window.innerWidth - 1 - borda) lado += 1;
        if (mouse.y <= borda) frente += 1;
        if (mouse.y >= window.innerHeight - 1 - borda) frente -= 1;
      }
      aplicarPan(estado, Math.sign(frente), Math.sign(lado), dt);
      atualizarCamera(estado, dt);
    },
    dispose() {
      window.removeEventListener('keydown', teclaDesce);
      window.removeEventListener('keyup', teclaSobe);
      window.removeEventListener('blur', perdeuFoco);
      window.removeEventListener('mousemove', moveu);
      document.documentElement.removeEventListener('mouseleave', saiu);
      alvo.removeEventListener('mousedown', apertou);
      window.removeEventListener('mouseup', soltou);
      alvo.removeEventListener('wheel', roda);
    },
  };
}
