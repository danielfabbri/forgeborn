/**
 * AUD-01 (D-47): trilhas musicais em arquivos, por contexto. A abertura toca
 * `trilha_abertura.mp3` (e segue na Seleção de Modo, que tem o mesmo fundo, FLX-03); os outros
 * menus tocam `trilha_menu.mp3`; a partida toca `trilha1.mp3`, `trilha2.mp3`… em ordem
 * embaralhada sem repetir a última, com transição cruzada de 4 s. Arquivo que falta é pulado.
 */
import { audio, quandoDesbloquear } from './contexto';

export type ContextoMusical = 'abertura' | 'menu' | 'partida';

/** AUD-01: transição cruzada entre trilhas (s). */
const TRANSICAO_S = 4;
/** Quantas trilhas numeradas procurar na pasta. */
const MAX_TRILHAS = 30;

const pasta = () => `${import.meta.env.BASE_URL}audio/trilhas/`;

/** O arquivo existe e é áudio? (O servidor de desenvolvimento devolve a página para 404.) */
async function existe(url: string): Promise<boolean> {
  try {
    const r = await fetch(url, { method: 'HEAD' });
    return r.ok && (r.headers.get('content-type') ?? '').startsWith('audio');
  } catch {
    return false;
  }
}

/** Sorteio da próxima trilha: embaralha sem repetir a última (apresentação, fora da sim). */
export function proximaTrilha(
  lista: readonly string[],
  ultima: string | null,
  sorte = Math.random,
): string | null {
  if (lista.length === 0) return null;
  const opcoes = lista.length > 1 ? lista.filter((t) => t !== ultima) : lista;
  return opcoes[Math.floor(sorte() * opcoes.length)] ?? null;
}

interface Tocando {
  el: HTMLAudioElement;
  ganho: GainNode;
  url: string;
}

export class TocadorDeTrilhas {
  private contexto: ContextoMusical | null = null;
  private atual: Tocando | null = null;
  private partida: string[] | null = null;
  private ultima: string | null = null;
  private pedido = 0;

  /** URL da trilha que está tocando, ou null. */
  get tocando(): string | null {
    return this.atual?.url ?? null;
  }

  /** Troca o contexto musical (a mesma chamada repetida não reinicia a trilha). */
  tocar(contexto: ContextoMusical): void {
    if (contexto === this.contexto) return;
    this.contexto = contexto;
    const pedido = ++this.pedido;
    quandoDesbloquear(() => void this.iniciar(contexto, pedido));
  }

  parar(): void {
    this.contexto = null;
    this.pedido++;
    this.sumir(this.atual);
    this.atual = null;
  }

  private async iniciar(contexto: ContextoMusical, pedido: number): Promise<void> {
    const url = await this.escolher(contexto);
    if (pedido !== this.pedido) return;
    if (!url) {
      this.sumir(this.atual);
      this.atual = null;
      return;
    }
    this.entrar(url, contexto !== 'partida');
  }

  private async escolher(contexto: ContextoMusical): Promise<string | null> {
    if (contexto !== 'partida') {
      const url = `${pasta()}trilha_${contexto}.mp3`;
      return (await existe(url)) ? url : null;
    }
    this.partida ??= await this.descobrir();
    const url = proximaTrilha(this.partida, this.ultima);
    this.ultima = url;
    return url;
  }

  /** As trilhas numeradas que existem na pasta (para no primeiro buraco). */
  private async descobrir(): Promise<string[]> {
    const lista: string[] = [];
    for (let k = 1; k <= MAX_TRILHAS; k++) {
      const url = `${pasta()}trilha${k}.mp3`;
      if (!(await existe(url))) break;
      lista.push(url);
    }
    return lista;
  }

  private entrar(url: string, emLoop: boolean): void {
    const a = audio();
    if (!a) return;
    const el = new Audio(url);
    el.crossOrigin = 'anonymous';
    el.loop = emLoop;
    const ganho = a.ctx.createGain();
    ganho.gain.value = 0;
    a.ctx.createMediaElementSource(el).connect(ganho);
    ganho.connect(a.canais.musica);
    const agora = a.ctx.currentTime;
    ganho.gain.setValueAtTime(0, agora);
    ganho.gain.linearRampToValueAtTime(1, agora + TRANSICAO_S);
    const anterior = this.atual;
    this.atual = { el, ganho, url };
    this.sumir(anterior);
    // Na partida, a próxima trilha entra 4 s antes do fim desta.
    if (!emLoop) {
      el.addEventListener('timeupdate', () => {
        if (this.atual?.el !== el || this.contexto !== 'partida') return;
        if (Number.isFinite(el.duration) && el.duration - el.currentTime <= TRANSICAO_S) {
          const pedido = ++this.pedido;
          void this.iniciar('partida', pedido);
        }
      });
      el.addEventListener('ended', () => {
        if (this.atual?.el === el && this.contexto === 'partida') {
          void this.iniciar('partida', ++this.pedido);
        }
      });
    }
    void el.play().catch(() => {
      // Sem gesto ainda nesta página: tenta de novo no próximo.
      const tentar = () => {
        void el.play().catch(() => {});
        window.removeEventListener('pointerdown', tentar);
        window.removeEventListener('keydown', tentar);
      };
      window.addEventListener('pointerdown', tentar);
      window.addEventListener('keydown', tentar);
    });
  }

  private sumir(t: Tocando | null): void {
    const a = audio();
    if (!t || !a) return;
    const agora = a.ctx.currentTime;
    t.ganho.gain.cancelScheduledValues(agora);
    t.ganho.gain.setValueAtTime(t.ganho.gain.value, agora);
    t.ganho.gain.linearRampToValueAtTime(0, agora + TRANSICAO_S);
    setTimeout(
      () => {
        t.el.pause();
        t.ganho.disconnect();
      },
      TRANSICAO_S * 1000 + 100,
    );
  }
}

export const trilhas = new TocadorDeTrilhas();

// Sonda para testes: a trilha que está tocando.
(globalThis as unknown as { __audio?: unknown }).__audio = {
  trilha: () => trilhas.tocando,
};
