/**
 * AUD-01 (D-47, D-74): trilhas musicais em arquivos de `src/audio/`, por contexto. A abertura toca
 * `entrance.mp3` (e segue na Seleção de Modo, que tem o mesmo fundo, FLX-03); os outros menus
 * tocam `map.mp3`; a partida toca todas as `soundtrack_*.mp3` da pasta em ordem embaralhada sem
 * repetir a última, com transição cruzada de 4 s. Uma trilha nova entra só por estar na pasta.
 */
import { audio, quandoDesbloquear } from './contexto';

export type ContextoMusical = 'abertura' | 'menu' | 'partida';

/** AUD-01: transição cruzada entre trilhas (s). */
const TRANSICAO_S = 4;

/** Os .mp3 da pasta (caminho → URL), montados pelo Vite no build. */
const ARQUIVOS = import.meta.glob<string>('./*.mp3', {
  query: '?url',
  import: 'default',
  eager: true,
});

export interface TrilhasDaPasta {
  abertura: string | null;
  menu: string | null;
  partida: string[];
}

/** D-74: separa os arquivos da pasta por contexto; as da partida em ordem de número. */
export function trilhasDaPasta(arquivos: Record<string, string>): TrilhasDaPasta {
  const nome = (caminho: string) => caminho.split('/').pop()!.toLowerCase();
  const achar = (n: string) => Object.entries(arquivos).find(([c]) => nome(c) === n)?.[1] ?? null;
  const numero = (c: string) => Number(/^soundtrack_(\d+)\.mp3$/.exec(nome(c))?.[1] ?? NaN);
  const partida = Object.keys(arquivos)
    .filter((c) => /^soundtrack_.+\.mp3$/.test(nome(c)))
    .sort((x, y) => (numero(x) || Infinity) - (numero(y) || Infinity) || x.localeCompare(y))
    .map((c) => arquivos[c]!);
  return { abertura: achar('entrance.mp3'), menu: achar('map.mp3'), partida };
}

export const TRILHAS = trilhasDaPasta(ARQUIVOS);

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
  private ultima: string | null = null;
  private pedido = 0;
  private readonly elementos = new Set<HTMLAudioElement>();

  /** Quantas trilhas estão soando agora (a atual e as que ainda somem). */
  get soando(): number {
    return [...this.elementos].filter((el) => !el.paused).length;
  }

  /** URL da trilha que está tocando, ou null. */
  get tocando(): string | null {
    return this.atual?.url ?? null;
  }

  /** Troca o contexto musical (a mesma chamada repetida não reinicia a trilha). */
  tocar(contexto: ContextoMusical): void {
    if (contexto === this.contexto) return;
    // D-75: da abertura para o mapa do Universo, corte seco (sem transição).
    const corte = this.contexto === 'abertura' && contexto === 'menu';
    this.contexto = contexto;
    const pedido = ++this.pedido;
    quandoDesbloquear(() => this.iniciar(contexto, pedido, corte));
  }

  parar(): void {
    this.contexto = null;
    this.pedido++;
    this.sumir(this.atual);
    this.atual = null;
  }

  private iniciar(contexto: ContextoMusical, pedido: number, corte = false): void {
    const url = this.escolher(contexto);
    if (pedido !== this.pedido) return;
    if (!url) {
      this.sumir(this.atual);
      this.atual = null;
      return;
    }
    this.entrar(url, contexto !== 'partida', corte);
  }

  private escolher(contexto: ContextoMusical): string | null {
    if (contexto === 'abertura') return TRILHAS.abertura;
    if (contexto === 'menu') return TRILHAS.menu;
    const url = proximaTrilha(TRILHAS.partida, this.ultima);
    this.ultima = url;
    return url;
  }

  private entrar(url: string, emLoop: boolean, corte = false): void {
    const a = audio();
    if (!a) return;
    const el = new Audio(url);
    this.elementos.add(el);
    el.addEventListener('pause', () => this.elementos.delete(el));
    el.crossOrigin = 'anonymous';
    el.loop = emLoop;
    const ganho = a.ctx.createGain();
    ganho.gain.value = 0;
    a.ctx.createMediaElementSource(el).connect(ganho);
    ganho.connect(a.canais.musica);
    const agora = a.ctx.currentTime;
    ganho.gain.setValueAtTime(corte ? 1 : 0, agora);
    if (!corte) ganho.gain.linearRampToValueAtTime(1, agora + TRANSICAO_S);
    const anterior = this.atual;
    this.atual = { el, ganho, url };
    if (corte) this.cortar(anterior);
    else this.sumir(anterior);
    // Na partida, a próxima trilha entra 4 s antes do fim desta.
    if (!emLoop) {
      el.addEventListener('timeupdate', () => {
        if (this.atual?.el !== el || this.contexto !== 'partida') return;
        if (Number.isFinite(el.duration) && el.duration - el.currentTime <= TRANSICAO_S) {
          const pedido = ++this.pedido;
          this.iniciar('partida', pedido);
        }
      });
      el.addEventListener('ended', () => {
        if (this.atual?.el === el && this.contexto === 'partida') {
          this.iniciar('partida', ++this.pedido);
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

  /** Para na hora, sem transição (D-75). */
  private cortar(t: Tocando | null): void {
    if (!t) return;
    t.el.pause();
    t.ganho.disconnect();
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
  soando: () => trilhas.soando,
};
