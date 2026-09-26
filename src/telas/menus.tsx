/**
 * Menus (§3): Tela de Abertura (FLX-02), Seleção de Modo (FLX-03), Configurações (FLX-13),
 * Créditos, Visão do Universo (FLX-04) e Configuração da Partida (FLX-07). O fundo 3D fica em
 * #viewport; a interface, em #ui. Iniciar a partida troca de página (FLX-14).
 */
import { effect, signal } from '@preact/signals';
import { render } from 'preact';
import { useEffect } from 'preact/hooks';
import { desbloquearAudio, estadoDoAudio } from '../audio/contexto';
import { trilhas } from '../audio/trilhas';
import { aplicarEscalaDaInterface, configuracoes } from '../game/configuracoes';
import { t, type TextKey } from '../i18n';
import { CenaAbertura } from '../render/cenaAbertura';
import { CenaUniverso, CORPOS, type EstadoDoCenario } from '../render/cenaUniverso';
import type { CenariosId } from '../sim/data';
import { Configuracoes } from '../ui/Configuracoes';
import { CENARIOS_IMPLEMENTADOS } from '../game/freeBattle';
import { ConfiguracaoDaPartida } from './ConfiguracaoDaPartida';
import { corDaNacao } from '../game/paleta';
import {
  Briefing,
  carregarSlot,
  dadosDoSlot,
  EscolhaDeNacao,
  estadoNaCampanha,
  estrelasDoCorpo,
  MissoesDoCorpo,
  Slots,
} from './Campanha';

export type Tela =
  | 'abertura'
  | 'modo'
  | 'configuracoes'
  | 'creditos'
  | 'universo'
  | 'free_battle'
  | 'slots'
  | 'nacao'
  | 'briefing';

/** FLX-04: a Visão do Universo serve ao Free Battle ou à Campanha (CAM-01). */
export const modoDoUniverso = signal<'free' | 'campanha'>('free');

export const tela = signal<Tela>('abertura');
/** Corpo selecionado na Visão do Universo e o cenário escolhido para o Free Battle. */
const corpoSelecionado = signal<string | null>(null);
export const cenarioEscolhido = signal<CenariosId>('lua');

/** Free Battle: disponível se o cenário tem mapa; na campanha, pelo progresso do slot. */
export const estadoDoCenario = (c: CenariosId): EstadoDoCenario =>
  modoDoUniverso.value === 'campanha'
    ? estadoNaCampanha(c)
    : CENARIOS_IMPLEMENTADOS.includes(c)
      ? 'disponivel'
      : 'bloqueado';

type Fundo = 'abertura' | 'universo' | 'universo_campanha';
let fundo: { tipo: Fundo; cena: { dispose(): void } } | null = null;
let universo: CenaUniverso | null = null;

function trocarFundo(viewport: HTMLElement, tipo: Fundo): void {
  if (fundo?.tipo === tipo) return;
  fundo?.cena.dispose();
  universo = null;
  if (tipo === 'abertura') {
    fundo = { tipo, cena: new CenaAbertura(viewport) };
  } else {
    const campanha = tipo === 'universo_campanha';
    universo = new CenaUniverso(
      viewport,
      {
        estadoDe: estadoDoCenario,
        corDoJogador: campanha ? corDaNacao(dadosDoSlot.value?.nacao) : '#1FBF5B',
        aoSelecionar: (id) => (corpoSelecionado.value = id),
        estrelasDe: campanha ? estrelasDoCorpo : undefined,
      },
      (id) => t(`corpo.${id}` as TextKey),
    );
    fundo = { tipo, cena: universo };
  }
}

function Abertura() {
  useEffect(() => {
    // FLX-02/TEC-22: a primeira tecla ou clique desbloqueia o áudio e segue para o menu.
    const seguir = () => {
      desbloquearAudio();
      tela.value = 'modo';
    };
    window.addEventListener('keydown', seguir, { once: true });
    window.addEventListener('pointerdown', seguir, { once: true });
    return () => {
      window.removeEventListener('keydown', seguir);
      window.removeEventListener('pointerdown', seguir);
    };
  }, []);
  return (
    <div class="abertura" data-testid="abertura">
      <h1>{t('jogo.titulo')}</h1>
      <p class="piscando">{t('abertura.pressione')}</p>
    </div>
  );
}

function SelecaoDeModo() {
  return (
    <div class="painel-menu modo" data-testid="selecao-de-modo">
      <h1>{t('jogo.nome')}</h1>
      <button
        data-testid="modo-free-battle"
        onClick={() => {
          modoDoUniverso.value = 'free';
          tela.value = 'universo';
        }}
      >
        {t('modo.free_battle')}
      </button>
      <button data-testid="modo-campanha" onClick={() => (tela.value = 'slots')}>
        {t('modo.campanha')}
      </button>
      <button data-testid="modo-configuracoes" onClick={() => (tela.value = 'configuracoes')}>
        {t('modo.configuracoes')}
      </button>
      <button data-testid="modo-creditos" onClick={() => (tela.value = 'creditos')}>
        {t('modo.creditos')}
      </button>
    </div>
  );
}

function Creditos() {
  return (
    <div class="painel-menu creditos" data-testid="creditos">
      <h2>{t('modo.creditos')}</h2>
      <p>{t('creditos.texto')}</p>
      <p class="discreto">{t('creditos.tecnologia')}</p>
      <button class="voltar" onClick={() => (tela.value = 'modo')}>
        {t('menu.voltar')}
      </button>
    </div>
  );
}

function Universo() {
  const id = corpoSelecionado.value;
  const corpo = CORPOS.find((c) => c.id === id);
  return (
    <>
      <div class="universo-topo">
        <h2>{t('universo.titulo')}</h2>
        <p class="discreto">{t('universo.ajuda')}</p>
      </div>
      <div class="painel-menu universo-painel" data-testid="universo-painel">
        {!corpo && <p>{t('universo.escolha')}</p>}
        {corpo && (
          <>
            <h3>{t(`corpo.${corpo.id}` as TextKey)}</h3>
            {modoDoUniverso.value === 'campanha' && (
              <MissoesDoCorpo corpo={corpo} aoEscolher={() => (tela.value = 'briefing')} />
            )}
            {modoDoUniverso.value === 'free' && corpo.cenarios.length === 0 && (
              <p class="discreto">{t('universo.sem_cenario')}</p>
            )}
            {(modoDoUniverso.value === 'free' ? corpo.cenarios : []).map((c) => {
              const estado = estadoDoCenario(c);
              return (
                <button
                  key={c}
                  class={`cenario ${estado}`}
                  data-testid={`cenario-${c}`}
                  data-estado={estado}
                  disabled={estado === 'bloqueado'}
                  onClick={() => {
                    cenarioEscolhido.value = c;
                    tela.value = 'free_battle';
                  }}
                >
                  {estado === 'bloqueado' ? '🔒 ' : ''}
                  {t(`cenario.${c}` as TextKey)}
                  <small>{t(`universo.estado.${estado}` as TextKey)}</small>
                </button>
              );
            })}
          </>
        )}
        <button
          class="voltar"
          onClick={() => (tela.value = modoDoUniverso.value === 'campanha' ? 'slots' : 'modo')}
        >
          {t('menu.voltar')}
        </button>
      </div>
    </>
  );
}

function Menus({ viewport }: { viewport: HTMLElement }) {
  const atual = tela.value;
  useEffect(() => {
    const noUniverso = atual === 'universo' || atual === 'free_battle' || atual === 'briefing';
    trocarFundo(
      viewport,
      !noUniverso
        ? 'abertura'
        : modoDoUniverso.value === 'campanha'
          ? 'universo_campanha'
          : 'universo',
    );
    // AUD-01: a abertura (e a Seleção de Modo, no mesmo fundo) tem a sua trilha; o resto, a do menu.
    trilhas.tocar(atual === 'abertura' || atual === 'modo' ? 'abertura' : 'menu');
  }, [atual]);
  return (
    <div class="menus">
      {atual === 'abertura' && <Abertura />}
      {atual === 'modo' && <SelecaoDeModo />}
      {atual === 'configuracoes' && <Configuracoes aoVoltar={() => (tela.value = 'modo')} />}
      {atual === 'creditos' && <Creditos />}
      {atual === 'universo' && <Universo />}
      {atual === 'slots' && (
        <Slots
          aoEscolher={(novo) => {
            modoDoUniverso.value = 'campanha';
            tela.value = novo ? 'nacao' : 'universo';
          }}
          aoVoltar={() => (tela.value = 'modo')}
        />
      )}
      {atual === 'nacao' && (
        <EscolhaDeNacao
          aoEscolher={() => (tela.value = 'universo')}
          aoVoltar={() => (tela.value = 'slots')}
        />
      )}
      {atual === 'briefing' && <Briefing aoVoltar={() => (tela.value = 'universo')} />}
      {atual === 'free_battle' && (
        <ConfiguracaoDaPartida
          cenario={cenarioEscolhido.value}
          aoVoltar={() => (tela.value = 'universo')}
        />
      )}
    </div>
  );
}

export function iniciarMenus(inicial: Tela): void {
  const viewport = document.getElementById('viewport');
  const ui = document.getElementById('ui');
  if (!viewport || !ui) throw new Error('index.html precisa dos elementos #viewport e #ui');
  tela.value = inicial;
  // CAM-08: `?menu=campanha&slot=k` volta à Visão do Universo da campanha no slot.
  const parametros = new URLSearchParams(location.search);
  const slot = Number(parametros.get('slot'));
  if (parametros.get('menu') === 'campanha' && Number.isInteger(slot)) {
    void carregarSlot(slot).then(() => {
      modoDoUniverso.value = 'campanha';
      tela.value = dadosDoSlot.value ? 'universo' : 'slots';
    });
  }
  // UI-12: a escala da interface muda na hora (o efeito roda junto com a mudança).
  effect(() =>
    aplicarEscalaDaInterface(document.documentElement, configuracoes.value.escalaInterface),
  );
  render(<Menus viewport={viewport} />, ui);
  // Sonda para os testes E2E dos menus.
  (window as unknown as { __menus: unknown }).__menus = {
    tela: () => tela.value,
    audio: () => estadoDoAudio(),
    corpoNaTela: (id: string) => universo?.pontoDe(id) ?? null,
  };
}
