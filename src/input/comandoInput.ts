/**
 * Seleção (CTL-04 – CTL-06) e ordens básicas (CTL-07 parcial, atalhos M/S/H/P de §12.4).
 * Toda ordem vira um Comando serializável na simulação (TEC-07); aqui só se lê o estado.
 */
import { type PerspectiveCamera, Vector3 } from 'three';
import {
  type Caixa,
  combinar,
  type CorpoNaTela,
  corpoNoPonto,
  Grupos,
  mesmoTipoNaTela,
  selecionarCaixa,
  ToqueDuplo,
} from '../game/selecao';
import { centrarEm, type EstadoCameraRts } from '../render/cameraRts';
import { pontoNoTerreno } from '../render/picking';
import type { CorpoDesenhado } from '../render/unidades';
import { type EntityId, getComponent, isAlive, type NacaoId, type Sim } from '../sim';
import { normalizar, type Vec3 } from '../sim/map/esfera';
import type { Heightmap } from '../sim/map/heightmap';

/** Distância (px) a partir da qual o arrasto vira caixa de seleção. */
const LIMIAR_ARRASTO_PX = 6;

type Modo = 'normal' | 'mover' | 'patrulhar';

export interface EntradaComandos {
  readonly selecao: readonly EntityId[];
  /** Corpos selecionados desenhados no quadro atual (para os anéis). */
  selecionadosDesenhados(): CorpoDesenhado[];
  dispose(): void;
}

export interface OpcoesEntradaComandos {
  viewport: HTMLElement;
  camadaUi: HTMLElement;
  camera: PerspectiveCamera;
  estadoCamera: EstadoCameraRts;
  mapa: Heightmap;
  sim: Sim;
  jogador: NacaoId;
  corpos: () => readonly CorpoDesenhado[];
  aoMudarSelecao?: (ids: readonly EntityId[]) => void;
}

export function ligarEntradaComandos(o: OpcoesEntradaComandos): EntradaComandos {
  const { viewport, sim, jogador } = o;
  let selecao: EntityId[] = [];
  let modo: Modo = 'normal';
  let inicio: { x: number; y: number } | null = null;
  let arrastando = false;
  const grupos = new Grupos();
  const cliqueDuplo = new ToqueDuplo();
  const teclaDupla = new ToqueDuplo();

  const caixaDiv = document.createElement('div');
  caixaDiv.className = 'caixa-selecao';
  caixaDiv.hidden = true;
  o.camadaUi.appendChild(caixaDiv);

  const definirSelecao = (ids: EntityId[]) => {
    selecao = ids;
    o.aoMudarSelecao?.(selecao);
  };
  const definirModo = (novo: Modo) => {
    modo = novo;
    viewport.style.cursor = novo === 'normal' ? '' : 'crosshair';
  };

  const v = new Vector3();
  const naTela = (): CorpoNaTela[] => {
    const r = viewport.getBoundingClientRect();
    const escala = r.height / (2 * Math.tan((o.camera.fov * Math.PI) / 360));
    return o.corpos().map((c) => {
      // Centro do corpo: meia altura acima da base, pela vertical local.
      v.set(
        c.x + (c.cima[0] * c.altura) / 2,
        c.y + (c.cima[1] * c.altura) / 2,
        c.z + (c.cima[2] * c.altura) / 2,
      );
      const distancia = o.camera.position.distanceTo(v);
      // Atrás do planeta não conta: a câmera precisa estar acima do plano tangente do corpo.
      const doLadoVisivel =
        (o.camera.position.x - c.x) * c.cima[0] +
          (o.camera.position.y - c.y) * c.cima[1] +
          (o.camera.position.z - c.z) * c.cima[2] >
        0;
      v.project(o.camera);
      const visivel =
        doLadoVisivel && v.z > -1 && v.z < 1 && Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1;
      return {
        id: c.id,
        tipo: c.tipo,
        nacao: c.nacao,
        movel: c.movel,
        sx: r.left + ((v.x + 1) / 2) * r.width,
        sy: r.top + ((1 - v.y) / 2) * r.height,
        sr: (c.raio * escala) / Math.max(distancia, 1),
        naTela: visivel,
      };
    });
  };

  const enviar = (tipo: string, dados: Record<string, unknown>) => {
    sim.enqueue({ tick: sim.state.tick, nacao: jogador, tipo, dados: dados as never });
  };
  const minhas = (componente: 'unit' | 'producer') =>
    selecao.filter(
      (id) =>
        isAlive(sim.state, id) &&
        getComponent(sim.state, id, 'owner')?.nacao === jogador &&
        getComponent(sim.state, id, componente) !== undefined,
    );

  /** CTL-07 (parcial): terreno → mover; com só produtores selecionados → ponto de encontro. */
  const ordemNoPonto = (px: number, py: number, tipo: 'mover' | 'patrulhar') => {
    const ponto = pontoNoTerreno(o.camera, viewport, px, py, o.mapa);
    if (!ponto) return;
    // O comando leva a direção do ponto (a simulação normaliza).
    const [x, y, z] = ponto;
    const unidades = minhas('unit');
    if (unidades.length > 0) {
      enviar(tipo, { ids: unidades, x, y, z });
      return;
    }
    const produtores = minhas('producer');
    if (produtores.length > 0 && tipo === 'mover') {
      enviar('ponto_de_encontro', { ids: produtores, x, y, z });
    }
  };

  const mostrarCaixa = (c: Caixa) => {
    const r = o.camadaUi.getBoundingClientRect();
    caixaDiv.hidden = false;
    caixaDiv.style.left = `${Math.min(c.x0, c.x1) - r.left}px`;
    caixaDiv.style.top = `${Math.min(c.y0, c.y1) - r.top}px`;
    caixaDiv.style.width = `${Math.abs(c.x1 - c.x0)}px`;
    caixaDiv.style.height = `${Math.abs(c.y1 - c.y0)}px`;
  };

  const apertou = (e: PointerEvent) => {
    if (e.button !== 0) return;
    inicio = { x: e.clientX, y: e.clientY };
    arrastando = false;
  };
  const moveu = (e: PointerEvent) => {
    if (!inicio) return;
    if (!arrastando && Math.hypot(e.clientX - inicio.x, e.clientY - inicio.y) > LIMIAR_ARRASTO_PX) {
      arrastando = modo === 'normal';
    }
    if (arrastando) mostrarCaixa({ x0: inicio.x, y0: inicio.y, x1: e.clientX, y1: e.clientY });
  };
  const soltou = (e: PointerEvent) => {
    if (e.button === 2) {
      if (modo !== 'normal') definirModo('normal');
      else ordemNoPonto(e.clientX, e.clientY, 'mover');
      return;
    }
    if (e.button !== 0 || !inicio) return;
    const origem = inicio;
    inicio = null;
    caixaDiv.hidden = true;
    if (modo !== 'normal') {
      ordemNoPonto(e.clientX, e.clientY, modo);
      definirModo('normal');
      return;
    }
    const corpos = naTela();
    if (arrastando) {
      arrastando = false;
      const caixa = { x0: origem.x, y0: origem.y, x1: e.clientX, y1: e.clientY };
      definirSelecao(combinar(selecao, selecionarCaixa(corpos, caixa, jogador), e.shiftKey, false));
      return;
    }
    const alvo = corpoNoPonto(corpos, e.clientX, e.clientY);
    if (!alvo) {
      if (!e.shiftKey) definirSelecao([]);
      return;
    }
    const duplo = cliqueDuplo.tocar(`c${alvo.id}`, performance.now());
    if (duplo || e.ctrlKey) {
      definirSelecao(combinar(selecao, mesmoTipoNaTela(corpos, alvo), e.shiftKey, false));
    } else {
      definirSelecao(combinar(selecao, [alvo.id], e.shiftKey, true));
    }
  };
  const menu = (e: Event) => e.preventDefault();

  const centralizar = (ids: EntityId[]) => {
    const pontos = ids
      .map((id) => getComponent(sim.state, id, 'position'))
      .filter((p) => p !== undefined);
    if (pontos.length === 0) return;
    const soma = pontos.reduce<Vec3>((s, p) => [s[0] + p.x, s[1] + p.y, s[2] + p.z], [0, 0, 0]);
    centrarEm(o.estadoCamera, normalizar(soma));
  };

  const tecla = (e: KeyboardEvent) => {
    if (e.repeat) return;
    const digito = /^Digit([1-9])$/.exec(e.code);
    if (digito) {
      const n = Number(digito[1]);
      e.preventDefault();
      if (e.ctrlKey) {
        grupos.definir(n, selecao);
        return;
      }
      const ids = grupos.obter(n, (id) => isAlive(sim.state, id));
      definirSelecao(ids);
      if (teclaDupla.tocar(`g${n}`, performance.now())) centralizar(ids);
      return;
    }
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    switch (e.code) {
      case 'KeyS':
        enviar('parar', { ids: minhas('unit') });
        break;
      case 'KeyH':
        enviar('manter_posicao', { ids: minhas('unit') });
        break;
      case 'KeyM':
        if (minhas('unit').length > 0) definirModo('mover');
        break;
      case 'KeyP':
        if (minhas('unit').length > 0) definirModo('patrulhar');
        break;
      case 'Escape':
        definirModo('normal');
        break;
      default:
        return;
    }
    e.preventDefault();
  };

  viewport.addEventListener('pointerdown', apertou);
  window.addEventListener('pointermove', moveu);
  window.addEventListener('pointerup', soltou);
  viewport.addEventListener('contextmenu', menu);
  window.addEventListener('keydown', tecla);

  return {
    get selecao() {
      return selecao;
    },
    selecionadosDesenhados() {
      const vivos = selecao.filter((id) => isAlive(sim.state, id));
      if (vivos.length !== selecao.length) definirSelecao(vivos);
      const porId = new Map(o.corpos().map((c) => [c.id, c]));
      return vivos.map((id) => porId.get(id)).filter((c) => c !== undefined);
    },
    dispose() {
      viewport.removeEventListener('pointerdown', apertou);
      window.removeEventListener('pointermove', moveu);
      window.removeEventListener('pointerup', soltou);
      viewport.removeEventListener('contextmenu', menu);
      window.removeEventListener('keydown', tecla);
      caixaDiv.remove();
    },
  };
}
