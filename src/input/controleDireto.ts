/**
 * Controle direto (CTL-08 a CTL-11, CTL-15) no cliente: entrar e sair, câmeras de 1ª e 3ª
 * pessoa, mira pelo mouse (Pointer Lock), WASD, Shift, cliques e o alvo sob a mira. Toda ação
 * vira comando da simulação (`assumir_controle`, `pilotar`, `habilidade`, `soltar_controle`).
 */
import { type PerspectiveCamera, Ray, Vector3 } from 'three';
import { type EntityId, getComponent, type NacaoId, type Sim } from '../sim';
import {
  normalizar,
  produtoEscalar,
  produtoVetorial,
  tangente,
  girar,
  type Vec3,
} from '../sim/map/esfera';
import type { Heightmap } from '../sim/map/heightmap';
import type { CorpoDesenhado } from '../render/unidades';
import type { JazidaDesenhada } from '../render/jazidas';
import { pontoNoTerreno } from '../render/picking';

export type ModoDireto = '1p' | '3p';

/** CTL-15 (apresentação): FOV da 1ª pessoa, e a 3ª pessoa ~3 m acima e ~7 m atrás. */
export const FOV_1P = 75;
const ACIMA_3P_M = 3;
const ATRAS_3P_M = 7;
/** Sensibilidade do mouse (rad/px) e limite da inclinação da mira: apresentação. */
const SENSIBILIDADE = 0.0025;
const INCLINACAO_MAX = 1.1;
/** Intervalo mínimo entre comandos `pilotar` (ms): o tick da simulação (20 Hz). */
const INTERVALO_MS = 50;

export interface PoseDireta {
  olho: Vec3;
  alvo: Vec3;
  cima: Vec3;
}

const soma = (a: Vec3, b: Vec3, k = 1): Vec3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];

/** Direção do olhar: a mira (tangente) inclinada para cima ou para baixo. */
export function direcaoDoOlhar(cima: Vec3, mira: Vec3, inclinacao: number): Vec3 {
  return normalizar(soma(soma([0, 0, 0], mira, Math.cos(inclinacao)), cima, Math.sin(inclinacao)));
}

/**
 * CTL-15: pose da câmera. 1ª pessoa no sensor (perto do topo do modelo); 3ª pessoa ~3 m acima e
 * ~7 m atrás, com a órbita do botão do meio somada ao rumo (D-43).
 */
export function poseDireta(
  corpo: { x: number; y: number; z: number; cima: Vec3; altura: number },
  mira: Vec3,
  inclinacao: number,
  modo: ModoDireto,
  orbita: { rumo: number; inclinacao: number } = { rumo: 0, inclinacao: 0 },
): PoseDireta {
  const centro: Vec3 = [corpo.x, corpo.y, corpo.z];
  const cima = corpo.cima;
  if (modo === '1p') {
    const olho = soma(centro, cima, corpo.altura * 0.85);
    return { olho, alvo: soma(olho, direcaoDoOlhar(cima, mira, inclinacao), 10), cima };
  }
  const rumo = normalizar(girar(mira, cima, orbita.rumo));
  const olhar = direcaoDoOlhar(cima, rumo, inclinacao + orbita.inclinacao);
  const foco = soma(centro, cima, corpo.altura * 0.6);
  const olho = soma(soma(foco, olhar, -ATRAS_3P_M), cima, ACIMA_3P_M);
  return { olho, alvo: soma(foco, olhar, 6), cima };
}

/** Corpo ou jazida atravessado pelo raio (o mais perto), ignorando `exceto`. */
export function alvoNoRaio(
  origem: Vec3,
  direcao: Vec3,
  corpos: ReadonlyArray<{
    id: EntityId;
    x: number;
    y: number;
    z: number;
    cima: Vec3;
    raio: number;
    altura: number;
  }>,
  exceto: EntityId | null,
): EntityId | null {
  const ray = new Ray(new Vector3(...origem), new Vector3(...direcao));
  const centro = new Vector3();
  let melhor: EntityId | null = null;
  let menor = Infinity;
  for (const c of corpos) {
    if (c.id === exceto) continue;
    centro.set(
      c.x + c.cima[0] * c.altura * 0.5,
      c.y + c.cima[1] * c.altura * 0.5,
      c.z + c.cima[2] * c.altura * 0.5,
    );
    const raio = Math.max(c.raio, c.altura * 0.5);
    if (ray.distanceSqToPoint(centro) > raio * raio) continue;
    const t = centro.clone().sub(ray.origin).dot(ray.direction);
    if (t > 0 && t < menor) {
      menor = t;
      melhor = c.id;
    }
  }
  return melhor;
}

export interface EntradaDireta {
  frente: number;
  lateral: number;
  impulso: boolean;
  gatilho: boolean;
}

export interface OpcoesDoControleDireto {
  viewport: HTMLElement;
  camera: PerspectiveCamera;
  sim: Sim;
  jogador: NacaoId;
  mapa: Heightmap;
  corpo: (id: EntityId) => CorpoDesenhado | undefined;
  corpos: () => readonly CorpoDesenhado[];
  jazidas: () => readonly JazidaDesenhada[];
  /** Saiu do controle direto (Esc ou unidade perdida): a câmera RTS volta sobre este ponto. */
  aoSair: (onde: Vec3, perdida: boolean) => void;
}

export interface ControleDireto {
  readonly ativo: EntityId | null;
  readonly modo: ModoDireto;
  /** Corpo ou jazida sob a mira. */
  readonly alvo: EntityId | null;
  readonly entrada: EntradaDireta;
  /** Mira atual (tangente) e inclinação: para a bússola do HUD. */
  readonly mira: Vec3;
  entrar(id: EntityId): void;
  sair(): void;
  /** Por quadro: pose da câmera, alvo sob a mira e comando `pilotar` quando algo muda. */
  atualizar(agora: number): PoseDireta | null;
}

export function ligarControleDireto(o: OpcoesDoControleDireto): ControleDireto {
  let ativo: EntityId | null = null;
  let modo: ModoDireto = '1p';
  let mira: Vec3 = [0, 1, 0];
  let inclinacao = 0;
  const orbita = { rumo: 0, inclinacao: 0 };
  let orbitando = false;
  let alvo: EntityId | null = null;
  let ultimoEnvio = 0;
  let enviado = '';
  let ultimaPosicao: Vec3 | null = null;
  let ultimaMiraEnviada: Vec3 = [0, 0, 0];
  const teclas = new Set<string>();
  const entrada: EntradaDireta = { frente: 0, lateral: 0, impulso: false, gatilho: false };

  const enviar = (tipo: string, dados: Record<string, unknown>) =>
    o.sim.enqueue({ tick: o.sim.state.tick, nacao: o.jogador, tipo, dados: dados as never });

  const lerTeclas = () => {
    entrada.frente = (teclas.has('KeyW') ? 1 : 0) - (teclas.has('KeyS') ? 1 : 0);
    entrada.lateral = (teclas.has('KeyD') ? 1 : 0) - (teclas.has('KeyA') ? 1 : 0);
    entrada.impulso = teclas.has('ShiftLeft') || teclas.has('ShiftRight');
  };

  const sair = (perdida = false) => {
    if (ativo === null) return;
    const id = ativo;
    ativo = null;
    teclas.clear();
    entrada.frente = entrada.lateral = 0;
    entrada.gatilho = entrada.impulso = false;
    if (!perdida) enviar('soltar_controle', { id });
    if (document.pointerLockElement) document.exitPointerLock();
    o.aoSair(ultimaPosicao ?? [1, 0, 0], perdida);
  };

  const tecla = (e: KeyboardEvent) => {
    if (ativo === null) return;
    if (e.code === 'Escape') {
      e.preventDefault();
      e.stopImmediatePropagation();
      sair();
      return;
    }
    if (e.code === 'KeyV' && !e.repeat) {
      modo = modo === '1p' ? '3p' : '1p';
    }
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight'].includes(e.code)) {
      teclas.add(e.code);
      lerTeclas();
    }
    // As teclas do RTS não valem no controle direto.
    if (e.code !== 'Pause') {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  };
  const soltarTecla = (e: KeyboardEvent) => {
    if (!teclas.delete(e.code)) return;
    lerTeclas();
  };
  const moveu = (e: MouseEvent) => {
    if (ativo === null) return;
    const corpo = o.corpo(ativo);
    if (!corpo) return;
    if (orbitando) {
      orbita.rumo -= e.movementX * SENSIBILIDADE;
      orbita.inclinacao = Math.max(
        -0.9,
        Math.min(0.6, orbita.inclinacao - e.movementY * SENSIBILIDADE),
      );
      return;
    }
    mira = normalizar(girar(mira, corpo.cima, -e.movementX * SENSIBILIDADE));
    inclinacao = Math.max(
      -INCLINACAO_MAX,
      Math.min(INCLINACAO_MAX, inclinacao - e.movementY * SENSIBILIDADE),
    );
  };
  const apertou = (e: MouseEvent) => {
    if (ativo === null) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (!document.pointerLockElement) void o.viewport.requestPointerLock?.()?.catch?.(() => {});
    if (e.button === 0) entrada.gatilho = true;
    else if (e.button === 2) enviar('habilidade', { id: ativo });
    // D-43: o botão do meio orbita a câmera da 3ª pessoa.
    else if (e.button === 1 && modo === '3p') orbitando = true;
  };
  const soltou = (e: MouseEvent) => {
    if (e.button === 0) entrada.gatilho = false;
    if (e.button === 1) {
      orbitando = false;
      orbita.rumo = 0;
      orbita.inclinacao = 0;
    }
  };
  const semMenu = (e: Event) => {
    if (ativo !== null) e.preventDefault();
  };
  const travaMudou = () => {
    // Esc com o Pointer Lock ativo: o navegador solta a trava sem entregar a tecla.
    if (ativo !== null && !document.pointerLockElement && travaFoiPedida) sair();
    travaFoiPedida = document.pointerLockElement !== null;
  };
  let travaFoiPedida = false;

  window.addEventListener('keydown', tecla, { capture: true });
  window.addEventListener('keyup', soltarTecla);
  window.addEventListener('mousemove', moveu);
  window.addEventListener('mousedown', apertou, { capture: true });
  window.addEventListener('mouseup', soltou);
  window.addEventListener('contextmenu', semMenu);
  document.addEventListener('pointerlockchange', travaMudou);

  return {
    get ativo() {
      return ativo;
    },
    get modo() {
      return modo;
    },
    get alvo() {
      return alvo;
    },
    get entrada() {
      return entrada;
    },
    get mira() {
      return mira;
    },
    entrar(id) {
      const corpo = o.corpo(id);
      if (!corpo) return;
      ativo = id;
      modo = '1p';
      inclinacao = 0;
      orbita.rumo = orbita.inclinacao = 0;
      const frente = getComponent(o.sim.state, id, 'locomotion')?.rumo;
      mira = (frente && tangente(corpo.cima, frente)) ??
        tangente(corpo.cima, [0, 1, 0]) ?? [1, 0, 0];
      enviado = '';
      enviar('assumir_controle', { id });
      travaFoiPedida = false;
      void o.viewport.requestPointerLock?.()?.catch?.(() => {});
    },
    sair: () => sair(),
    atualizar(agora) {
      if (ativo === null) return null;
      const corpo = o.corpo(ativo);
      if (!corpo) {
        // CTL-13: a unidade foi destruída.
        if (!o.sim.state.entities.includes(ativo)) sair(true);
        return null;
      }
      ultimaPosicao = normalizar([corpo.x, corpo.y, corpo.z]);
      // A mira acompanha o chão sob a unidade.
      mira = tangente(corpo.cima, mira) ?? mira;
      const pose = poseDireta(corpo, mira, inclinacao, modo, orbita);

      // Alvo sob a mira: o raio da câmera pelo centro da tela.
      const olho = pose.olho;
      const direcao = normalizar([
        pose.alvo[0] - olho[0],
        pose.alvo[1] - olho[1],
        pose.alvo[2] - olho[2],
      ]);
      const candidatos = [...o.corpos(), ...o.jazidas()];
      alvo = alvoNoRaio(olho, direcao, candidatos, ativo);
      const r = o.viewport.getBoundingClientRect();
      const ponto = pontoNoTerreno(
        o.camera,
        o.viewport,
        r.left + r.width / 2,
        r.top + r.height / 2,
        o.mapa,
      );

      const dados = {
        id: ativo,
        frente: entrada.frente,
        lateral: entrada.lateral,
        impulso: entrada.impulso,
        gatilho: entrada.gatilho,
        rumo: mira,
        alvo,
        ponto,
      };
      const chave = `${entrada.frente}|${entrada.lateral}|${entrada.impulso}|${entrada.gatilho}|${alvo}`;
      const girou = enviado === '' || produtoEscalar(mira, ultimaMiraEnviada) < 0.99995;
      if ((chave !== enviado || girou) && agora - ultimoEnvio >= INTERVALO_MS) {
        enviar('pilotar', dados);
        enviado = chave;
        ultimaMiraEnviada = mira;
        ultimoEnvio = agora;
      }
      return pose;
    },
  };
}

/** Rumo da mira em graus a partir do norte do planeta (bússola do HUD, CTL-14). */
export function rumoEmGraus(cima: Vec3, mira: Vec3, norte: Vec3): number {
  const leste = produtoVetorial(norte, cima);
  const graus =
    (Math.atan2(produtoEscalar(mira, leste), produtoEscalar(mira, norte)) * 180) / Math.PI;
  return (graus + 360) % 360;
}
