/**
 * Campanha (CAM-01, CAM-03, CAM-09, FLX-05, FLX-06, D-73): escolha de slot, Escolha de Nação,
 * missões na Visão do Universo e Briefing. Iniciar Pouso troca de página (FLX-14).
 */
import { signal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import {
  desbloqueada,
  jogavel,
  liberadosNa,
  missaoPorId,
  missoes,
  NUMERO_DE_SLOTS,
  lerSlots,
  salvarSlot,
  type SlotDeCampanha,
  totalDeEstrelas,
} from '../game/campanha';
import { irParaMissao } from '../game/navegacao';
import { clipPathDe, corDaNacao, emblemaDe } from '../game/paleta';
import { t, type TextKey } from '../i18n';
import type { CorpoCeleste, EstadoDoCenario } from '../render/cenaUniverso';
import { dados, type NacaoId } from '../sim';
import type { CenariosId, MissoesRow } from '../sim/data';

/** Slot em uso na campanha (índice) e os dados dele. */
export const slotAtual = signal<number | null>(null);
export const dadosDoSlot = signal<SlotDeCampanha | null>(null);
export const missaoEscolhida = signal<string | null>(null);
const slots = signal<Array<SlotDeCampanha | null> | null>(null);

const nomeDaNacao = (n: string) => t(`nacao.${n}` as TextKey);
const listaDe = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : v ? [String(v)] : []);

/** Missões jogáveis de um cenário. */
function missoesDo(cenario: CenariosId): MissoesRow[] {
  return missoes().filter((m) => m.cenario === cenario && jogavel(m));
}

/** FLX-04 (campanha): disponível com missão aberta e não concluída; concluído com todas feitas. */
export function estadoNaCampanha(cenario: CenariosId): EstadoDoCenario {
  const slot = dadosDoSlot.value;
  const lista = missoesDo(cenario);
  if (!slot || lista.length === 0) return 'bloqueado';
  if (lista.some((m) => desbloqueada(slot, m.id) && !slot.missoes[m.id])) return 'disponivel';
  if (lista.every((m) => slot.missoes[m.id])) return 'concluido';
  return lista.some((m) => desbloqueada(slot, m.id)) ? 'disponivel' : 'bloqueado';
}

/** CAM-03: estrelas do corpo (somando as missões dos seus cenários). */
export function estrelasDoCorpo(corpo: CorpoCeleste): { tem: number; max: number } | null {
  const slot = dadosDoSlot.value;
  const lista = corpo.cenarios.flatMap(missoesDo);
  if (!slot || lista.length === 0) return null;
  const tem = lista.reduce((s, m) => s + (slot.missoes[m.id]?.estrelas ?? 0), 0);
  return { tem, max: lista.length * 3 };
}

export async function carregarSlot(k: number): Promise<void> {
  const todos = await lerSlots();
  slots.value = todos;
  slotAtual.value = k;
  dadosDoSlot.value = todos[k] ?? null;
}

/** CAM-09: os 3 slots. */
export function Slots({
  aoEscolher,
  aoVoltar,
}: {
  aoEscolher: (novo: boolean) => void;
  aoVoltar: () => void;
}) {
  useEffect(() => {
    void lerSlots().then((s) => (slots.value = s));
  }, []);
  const lista = slots.value;
  return (
    <div class="painel-menu slots" data-testid="campanha-slots">
      <h2>{t('campanha.slots')}</h2>
      {lista === null && <p class="discreto">…</p>}
      {lista?.slice(0, NUMERO_DE_SLOTS).map((s, k) => (
        <div class="slot" key={k} data-testid={`slot-${k}`}>
          <strong>{t('campanha.slot', { n: k + 1 })}</strong>
          {s ? (
            <>
              <span style={{ color: corDaNacao(s.nacao) }}>
                {t('campanha.resumo', {
                  nacao: nomeDaNacao(s.nacao),
                  missoes: Object.keys(s.missoes).length,
                  estrelas: totalDeEstrelas(s),
                })}
              </span>
              <button
                class="primario"
                data-testid={`slot-${k}-continuar`}
                onClick={() => {
                  slotAtual.value = k;
                  dadosDoSlot.value = s;
                  aoEscolher(false);
                }}
              >
                {t('campanha.continuar')}
              </button>
              <button
                data-testid={`slot-${k}-apagar`}
                onClick={() => {
                  if (!confirm(t('campanha.apagar_confirma'))) return;
                  void salvarSlot(k, null).then(() => lerSlots().then((x) => (slots.value = x)));
                }}
              >
                {t('campanha.apagar')}
              </button>
            </>
          ) : (
            <>
              <span class="discreto">{t('campanha.vazio')}</span>
              <button
                class="primario"
                data-testid={`slot-${k}-novo`}
                onClick={() => {
                  slotAtual.value = k;
                  dadosDoSlot.value = null;
                  aoEscolher(true);
                }}
              >
                {t('campanha.novo')}
              </button>
            </>
          )}
        </div>
      ))}
      <button class="voltar" onClick={aoVoltar}>
        {t('menu.voltar')}
      </button>
    </div>
  );
}

/** FLX-05: quatro cartões com nome, IA, cor, emblema e uma frase. */
export function EscolhaDeNacao({
  aoEscolher,
  aoVoltar,
}: {
  aoEscolher: () => void;
  aoVoltar: () => void;
}) {
  return (
    <div class="painel-menu escolha-nacao" data-testid="escolha-nacao">
      <h2>{t('campanha.escolha_nacao')}</h2>
      <p class="discreto">{t('campanha.escolha_ajuda')}</p>
      <div class="cartoes-nacao">
        {dados.nacoes.map((n) => (
          <button
            key={n.id}
            class="cartao-nacao"
            data-testid={`nacao-${n.id}`}
            style={{ borderColor: n.cor }}
            onClick={() => {
              const k = slotAtual.value ?? 0;
              const novo: SlotDeCampanha = { nacao: n.id as NacaoId, missoes: {} };
              dadosDoSlot.value = novo;
              void salvarSlot(k, novo).then(aoEscolher);
            }}
          >
            <span
              class="emblema"
              style={{ background: n.cor, clipPath: clipPathDe(emblemaDe(n.id)) }}
            />
            <strong>{nomeDaNacao(n.id)}</strong>
            <small>{t('campanha.ia', { ia: n.ia })}</small>
            <em>{t(`nacao_frase.${n.id}` as TextKey)}</em>
          </button>
        ))}
      </div>
      <button class="voltar" onClick={aoVoltar}>
        {t('menu.voltar')}
      </button>
    </div>
  );
}

/** Missões de um corpo na Visão do Universo (campanha). */
export function MissoesDoCorpo({
  corpo,
  aoEscolher,
}: {
  corpo: CorpoCeleste;
  aoEscolher: () => void;
}) {
  const slot = dadosDoSlot.value;
  const lista = corpo.cenarios.flatMap(missoesDo);
  if (!slot || lista.length === 0) return <p class="discreto">{t('universo.sem_cenario')}</p>;
  return (
    <>
      {lista.map((m) => {
        const aberta = desbloqueada(slot, m.id);
        const feita = slot.missoes[m.id];
        return (
          <button
            key={m.id}
            class={`cenario ${feita ? 'concluido' : aberta ? 'disponivel' : 'bloqueado'}`}
            data-testid={`missao-${m.id}`}
            disabled={!aberta}
            onClick={() => {
              missaoEscolhida.value = m.id;
              aoEscolher();
            }}
          >
            {!aberta ? '🔒 ' : ''}
            {t('campanha.missao', { n: m.ordem })} · {t(`missao.${m.id}` as TextKey)}
            <small>
              {feita
                ? `${'★'.repeat(feita.estrelas)}${'☆'.repeat(3 - feita.estrelas)}`
                : t(aberta ? 'campanha.disponivel' : 'campanha.bloqueada')}
            </small>
          </button>
        );
      })}
    </>
  );
}

/** FLX-06: nome, cenário, modificadores, oponentes, objetivo, unidades liberadas e tempo-par. */
export function Briefing({ aoVoltar }: { aoVoltar: () => void }) {
  const m = missaoPorId(missaoEscolhida.value ?? '');
  const slot = dadosDoSlot.value;
  if (!m || !slot || slotAtual.value === null) return null;
  const cenario = dados.cenarios.find((c) => c.id === m.cenario)!;
  const modificadores = (
    ['fator_solar', 'mult_vel_hover', 'mult_giro_hover', 'mult_en_drone', 'mult_visao'] as const
  )
    .filter((k) => cenario[k] !== 1)
    .map((k) => t(`modificador.${k}` as TextKey, { v: String(cenario[k]).replace('.', ',') }));
  const anterior = missoes()
    .filter((x) => x.ordem < m.ordem)
    .at(-1);
  const antes = new Set(anterior ? liberadosNa(anterior.id) : []);
  const liberados = liberadosNa(m.id).filter((i) => dados.custos.some((c) => c.id === i));
  const outras = dados.nacoes.map((n) => n.id).filter((n) => n !== slot.nacao);
  const oponentes = listaDe(m.oponentes).map((tipo, k) =>
    t(`oponente.${tipo}` as TextKey, { nacao: nomeDaNacao(outras[k]!) }),
  );
  return (
    <div class="painel-menu briefing" data-testid="briefing">
      <h2>
        {t('briefing.titulo')} · {t('campanha.missao', { n: m.ordem })} ·{' '}
        {t(`missao.${m.id}` as TextKey)}
      </h2>
      <dl>
        <dt>{t('briefing.cenario')}</dt>
        <dd>{t(`cenario.${m.cenario}` as TextKey)}</dd>
        <dt>{t('briefing.modificadores')}</dt>
        <dd>
          {modificadores.length > 0 ? modificadores.join(' · ') : t('briefing.sem_modificadores')}
        </dd>
        <dt>{t('briefing.oponentes')}</dt>
        <dd data-testid="briefing-oponentes">{oponentes.join(' · ')}</dd>
        <dt>{t('briefing.objetivo')}</dt>
        <dd>{t(`objetivo.${m.id}` as TextKey)}</dd>
        <dt>{t('briefing.liberadas')}</dt>
        <dd data-testid="briefing-liberadas">
          {liberados.map((i) => (
            <span key={i} class={antes.has(i) ? 'item' : 'item novo'}>
              {t(`item.${i}` as TextKey)}
              {!antes.has(i) && anterior && <small> ({t('briefing.novas')})</small>}
            </span>
          ))}
        </dd>
        <dt>{t('briefing.tempo_par', { min: m.tempo_par_min })}</dt>
        <dd class="discreto">{t('briefing.estrelas')}</dd>
      </dl>
      <button
        class="primario"
        data-testid="briefing-iniciar"
        onClick={() => irParaMissao({ slot: slotAtual.value!, missao: m.id, nacao: slot.nacao })}
      >
        {t('briefing.iniciar')}
      </button>
      <button class="voltar" onClick={aoVoltar}>
        {t('menu.voltar')}
      </button>
    </div>
  );
}
