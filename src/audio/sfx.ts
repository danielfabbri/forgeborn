/**
 * AUD-02/AUD-04 (D-47): efeitos sonoros sintetizados em tempo real pela Web Audio API, sem
 * arquivos. Sem atmosfera na Lua, os sons do mundo são "percebidos": graves e abafados (filtro
 * passa-baixa), e mais internos ainda em 1ª pessoa. Todos os números aqui são de apresentação.
 */
import type { SinalDeOrdem } from '../render/sinalizadores';
import { audio } from './contexto';

export type Som =
  | 'laser'
  | 'missil'
  | 'torpedo'
  | 'bomba'
  | 'explosao_pequena'
  | 'explosao_grande'
  | 'impressao'
  | 'concluido'
  | 'morte'
  | 'clique'
  | 'passar'
  | 'erro'
  | 'confirmacao'
  | 'alerta_baixa'
  | 'alerta_alta'
  | 'alerta_critica'
  | `ordem_${SinalDeOrdem}`;

let ruido: AudioBuffer | null = null;

function bufferDeRuido(ctx: AudioContext): AudioBuffer {
  if (ruido) return ruido;
  ruido = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const dados = ruido.getChannelData(0);
  // Ruído branco para explosões e atrito; o sorteio é de apresentação (fora da simulação).
  for (let k = 0; k < dados.length; k++) dados[k] = Math.random() * 2 - 1;
  return ruido;
}

interface Saida {
  ctx: AudioContext;
  destino: AudioNode;
  t: number;
}

/** O canal de efeitos, com o abafamento do vácuo (AUD-02). */
function saida(volume: number, abafado: boolean, interface_ = false): Saida | null {
  const a = audio();
  if (!a || a.ctx.state !== 'running') return null;
  const ganho = a.ctx.createGain();
  ganho.gain.value = volume;
  let destino: AudioNode = ganho;
  if (abafado && !interface_) {
    const filtro = a.ctx.createBiquadFilter();
    filtro.type = 'lowpass';
    filtro.frequency.value = abafadoInterno ? 500 : 1400;
    filtro.connect(ganho);
    destino = filtro;
  }
  ganho.connect(a.canais.efeitos);
  return { ctx: a.ctx, destino, t: a.ctx.currentTime };
}

function tom(
  s: Saida,
  tipo: OscillatorType,
  de: number,
  para: number,
  duracao: number,
  pico = 0.5,
  atraso = 0,
): void {
  const o = s.ctx.createOscillator();
  const g = s.ctx.createGain();
  o.type = tipo;
  const t0 = s.t + atraso;
  o.frequency.setValueAtTime(de, t0);
  o.frequency.exponentialRampToValueAtTime(Math.max(para, 1), t0 + duracao);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(pico, t0 + Math.min(0.01, duracao / 4));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duracao);
  o.connect(g).connect(s.destino);
  o.start(t0);
  o.stop(t0 + duracao + 0.05);
}

let curvaDeSaturacao: Float32Array<ArrayBuffer> | null = null;

/** Saturação suave (tanh) para dar peso e aspereza às armas. */
function saturado(s: Saida, quanto = 3): Saida {
  if (!curvaDeSaturacao) {
    curvaDeSaturacao = new Float32Array(1024);
    for (let k = 0; k < 1024; k++) {
      const x = (k / 1023) * 2 - 1;
      curvaDeSaturacao[k] = Math.tanh(x * quanto) / Math.tanh(quanto);
    }
  }
  const ws = s.ctx.createWaveShaper();
  ws.curve = curvaDeSaturacao;
  ws.oversample = '2x';
  ws.connect(s.destino);
  return { ...s, destino: ws };
}

function chiado(s: Saida, duracao: number, freq: number, pico = 0.6, q = 0.7): void {
  const fonte = s.ctx.createBufferSource();
  fonte.buffer = bufferDeRuido(s.ctx);
  const filtro = s.ctx.createBiquadFilter();
  filtro.type = 'lowpass';
  filtro.frequency.setValueAtTime(freq, s.t);
  filtro.frequency.exponentialRampToValueAtTime(Math.max(freq / 8, 40), s.t + duracao);
  filtro.Q.value = q;
  const g = s.ctx.createGain();
  g.gain.setValueAtTime(pico, s.t);
  g.gain.exponentialRampToValueAtTime(0.0001, s.t + duracao);
  fonte.connect(filtro).connect(g).connect(s.destino);
  fonte.start(s.t);
  fonte.stop(s.t + duracao + 0.05);
}

/** AUD-02: em 1ª pessoa os sons ficam ainda mais internos. */
let abafadoInterno = false;
export function somInterno(ligado: boolean): void {
  abafadoInterno = ligado;
}

/** Sonda para testes: os últimos efeitos que soaram. */
const tocados: Som[] = [];
(globalThis as unknown as { __sfx?: unknown }).__sfx = { tocados: () => [...tocados] };

/** Toca um efeito; `volume` 0..1 já com a distância aplicada. */
export function tocarSom(som: Som, volume = 1): void {
  const interface_ =
    ['clique', 'passar', 'erro', 'confirmacao'].includes(som) ||
    som.startsWith('alerta') ||
    som.startsWith('ordem_');
  const s = saida(volume, true, interface_);
  if (!s) return;
  tocados.push(som);
  if (tocados.length > 20) tocados.shift();
  switch (som) {
    case 'laser': {
      // Estalo seco, dois dentes-de-serra desafinados caindo e um soco grave: tenso, sem "pew".
      const sujo = saturado(s, 4);
      chiado(s, 0.05, 7000, 0.3, 0.5);
      tom(sujo, 'sawtooth', 380, 70, 0.2, 0.18);
      tom(sujo, 'sawtooth', 391, 73, 0.22, 0.14);
      tom(s, 'sine', 95, 38, 0.18, 0.4);
      break;
    }
    case 'missil': {
      // UNI-10: ignição pesada e ronco longo do motor subindo.
      const sujo = saturado(s, 3.5);
      chiado(s, 1.4, 2200, 0.55, 1.5);
      tom(sujo, 'sawtooth', 40, 120, 1.2, 0.3);
      tom(s, 'sine', 55, 30, 0.5, 0.5);
      break;
    }
    case 'torpedo': {
      // Ignição rasgada e um ronco grave que cresce.
      const sujo = saturado(s, 3);
      chiado(s, 0.7, 1800, 0.4, 3);
      tom(sujo, 'sawtooth', 55, 90, 0.6, 0.22);
      tom(s, 'sine', 48, 70, 0.6, 0.3);
      break;
    }
    case 'bomba': {
      // Assobio grave descendo e o baque do lançamento.
      const sujo = saturado(s, 2.5);
      tom(sujo, 'triangle', 420, 110, 0.8, 0.16);
      tom(s, 'sine', 70, 32, 0.25, 0.45);
      chiado(s, 0.12, 900, 0.3);
      break;
    }
    case 'explosao_pequena':
      chiado(s, 0.5, 1800, 0.7);
      tom(s, 'sine', 90, 40, 0.4, 0.6);
      break;
    case 'explosao_grande':
      chiado(s, 1.6, 1200, 0.9);
      tom(s, 'sine', 70, 28, 1.2, 0.8);
      break;
    case 'impressao':
      for (let k = 0; k < 3; k++)
        tom(s, 'square', 520 + k * 90, 480 + k * 90, 0.05, 0.12, k * 0.07);
      break;
    case 'concluido':
      tom(s, 'triangle', 660, 660, 0.12, 0.25);
      tom(s, 'triangle', 990, 990, 0.18, 0.25, 0.1);
      break;
    case 'morte':
      chiado(s, 0.9, 900, 0.6);
      tom(s, 'sine', 120, 35, 0.8, 0.5);
      break;
    case 'clique':
      tom(s, 'square', 1600, 1500, 0.03, 0.08);
      break;
    case 'passar':
      // D-75: toque curto e suave ao passar o mouse sobre um botão.
      tom(s, 'sine', 2300, 2100, 0.03, 0.05);
      break;
    case 'erro':
      tom(s, 'square', 220, 200, 0.1, 0.15);
      tom(s, 'square', 180, 170, 0.12, 0.15, 0.12);
      break;
    case 'confirmacao':
      tom(s, 'sine', 700, 700, 0.07, 0.2);
      tom(s, 'sine', 1050, 1050, 0.1, 0.2, 0.07);
      break;
    case 'alerta_baixa':
      tom(s, 'sine', 880, 880, 0.18, 0.2);
      break;
    case 'alerta_alta':
      tom(s, 'sine', 880, 880, 0.14, 0.28);
      tom(s, 'sine', 660, 660, 0.2, 0.28, 0.16);
      break;
    case 'alerta_critica':
      for (let k = 0; k < 3; k++) tom(s, 'square', 980, 940, 0.1, 0.22, k * 0.14);
      break;
    // UI-14: cada ordem do clique direito tem um som curto próprio.
    case 'ordem_mover':
      tom(s, 'sine', 620, 820, 0.07, 0.16);
      tom(s, 'sine', 930, 930, 0.06, 0.12, 0.06);
      break;
    case 'ordem_atacar':
      tom(s, 'square', 330, 250, 0.06, 0.14);
      tom(s, 'square', 250, 180, 0.09, 0.14, 0.06);
      break;
    case 'ordem_coletar':
      tom(s, 'triangle', 520, 520, 0.05, 0.18);
      tom(s, 'triangle', 780, 780, 0.05, 0.18, 0.05);
      tom(s, 'triangle', 1040, 1040, 0.07, 0.14, 0.1);
      break;
    case 'ordem_descarregar':
      tom(s, 'triangle', 900, 500, 0.12, 0.18);
      break;
    case 'ordem_recarregar':
      tom(s, 'sawtooth', 300, 1200, 0.18, 0.1);
      tom(s, 'sine', 1200, 1200, 0.06, 0.12, 0.17);
      break;
    case 'ordem_construir':
      tom(s, 'square', 440, 440, 0.04, 0.12);
      tom(s, 'square', 440, 440, 0.04, 0.12, 0.08);
      break;
    case 'ordem_reciclar':
      tom(s, 'triangle', 700, 350, 0.1, 0.16);
      tom(s, 'triangle', 350, 700, 0.1, 0.12, 0.09);
      break;
    case 'ordem_patrulhar':
      tom(s, 'sine', 560, 560, 0.06, 0.14);
      tom(s, 'sine', 840, 840, 0.06, 0.14, 0.07);
      tom(s, 'sine', 560, 560, 0.06, 0.14, 0.14);
      break;
    case 'ordem_satelite':
      tom(s, 'sine', 1400, 1800, 0.2, 0.1);
      tom(s, 'sine', 2100, 2100, 0.15, 0.06, 0.08);
      break;
  }
}

/**
 * AUD-04: zumbido dos hovers e atrito da mineração, contínuos no canal de ambiente. A
 * intensidade (0..1) vem de quantos hovers se movem ou mineram perto do ponto da câmera.
 */
export class Ambiente {
  private zumbido: { osc: OscillatorNode; ganho: GainNode } | null = null;
  private atrito: { fonte: AudioBufferSourceNode; ganho: GainNode } | null = null;
  private vento: { ganho: GainNode; filtro: BiquadFilterNode } | null = null;

  private montar(): boolean {
    if (this.zumbido) return true;
    const a = audio();
    if (!a || a.ctx.state !== 'running') return false;
    const filtro = a.ctx.createBiquadFilter();
    filtro.type = 'lowpass';
    filtro.frequency.value = 320;
    const osc = a.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 58;
    const ganho = a.ctx.createGain();
    ganho.gain.value = 0;
    osc.connect(filtro).connect(ganho).connect(a.canais.ambiente);
    osc.start();
    this.zumbido = { osc, ganho };
    const fonte = a.ctx.createBufferSource();
    fonte.buffer = bufferDeRuido(a.ctx);
    fonte.loop = true;
    const banda = a.ctx.createBiquadFilter();
    banda.type = 'bandpass';
    banda.frequency.value = 700;
    banda.Q.value = 2;
    const ganhoAtrito = a.ctx.createGain();
    ganhoAtrito.gain.value = 0;
    fonte.connect(banda).connect(ganhoAtrito).connect(a.canais.ambiente);
    fonte.start();
    this.atrito = { fonte, ganho: ganhoAtrito };
    // AUD-02: vento, ruído grave com o filtro oscilando devagar (rajadas).
    const ar = a.ctx.createBufferSource();
    ar.buffer = bufferDeRuido(a.ctx);
    ar.loop = true;
    ar.playbackRate.value = 0.5;
    const filtroVento = a.ctx.createBiquadFilter();
    filtroVento.type = 'lowpass';
    filtroVento.frequency.value = 500;
    filtroVento.Q.value = 3;
    const rajada = a.ctx.createOscillator();
    rajada.frequency.value = 0.13;
    const amplitude = a.ctx.createGain();
    amplitude.gain.value = 260;
    rajada.connect(amplitude).connect(filtroVento.frequency);
    rajada.start();
    const ganhoVento = a.ctx.createGain();
    ganhoVento.gain.value = 0;
    ar.connect(filtroVento).connect(ganhoVento).connect(a.canais.ambiente);
    ar.start();
    this.vento = { ganho: ganhoVento, filtro: filtroVento };
    return true;
  }

  /** `vento` 0..1 (AUD-02): 0 no vácuo; sobe na tempestade. */
  atualizar(movimento: number, mineracao: number, vento = 0): void {
    if (!this.montar()) return;
    const a = audio()!;
    const t = a.ctx.currentTime;
    this.zumbido!.ganho.gain.setTargetAtTime(Math.min(1, movimento) * 0.25, t, 0.3);
    this.zumbido!.osc.frequency.setTargetAtTime(52 + Math.min(1, movimento) * 14, t, 0.5);
    this.atrito!.ganho.gain.setTargetAtTime(Math.min(1, mineracao) * 0.12, t, 0.3);
    this.vento!.ganho.gain.setTargetAtTime(Math.min(1, vento) * 0.5, t, 1.2);
    this.vento!.filtro.Q.setTargetAtTime(2 + vento * 3, t, 1.2);
  }

  parar(): void {
    this.atualizar(0, 0);
  }
}
