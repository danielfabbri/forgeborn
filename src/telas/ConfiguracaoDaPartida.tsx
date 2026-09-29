/**
 * Configuração da Partida do Free Battle (FLX-07, §16, FB-01 a FB-04): todas as opções com os
 * padrões, opções inválidas desabilitadas com explicação (FB-03), pré-visualização do mapa com
 * as zonas de pouso (FB-02) e as últimas opções lembradas (TEC-21).
 */
import { corDaNacao } from '../game/paleta';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { gravar, ler } from '../game/armazenamento';
import {
  type ConfigFreeBattle,
  configPadrao,
  DIFICULDADES,
  motivoDoPreset,
  NACOES,
  presetPadrao,
  presetsDe,
  validar,
  VELOCIDADES,
  valoresDe,
  zonasDaPartida,
} from '../game/freeBattle';
import { irParaPartida } from '../game/navegacao';
import { t, type TextKey } from '../i18n';
import { PreviaDoMapa } from '../render/previaMapa';
import type { CenariosId } from '../sim/data';
import type { PresetDeMapa } from '../sim/map/presets';
import type { MapaLunar } from '../sim/map/lunar';
import { gerarPrevia, raioDoCenario } from '../sim/map/validacao';

const CHAVE = 'free_battle';
const cache = new Map<string, MapaLunar>();

/** Última configuração salva, ajustada ao cenário escolhido e validada (FB-04). */
async function ultimaConfig(cenario: CenariosId): Promise<ConfigFreeBattle> {
  const salva = await ler<ConfigFreeBattle>(CHAVE);
  const padrao = { ...configPadrao(), cenario };
  if (!salva) return padrao;
  const c = { ...padrao, ...salva, cenario };
  return validar(c).length === 0 ? c : padrao;
}

const corDe = (nacao: string) => corDaNacao(nacao);

export function ConfiguracaoDaPartida({
  cenario,
  aoVoltar,
}: {
  cenario: CenariosId;
  aoVoltar: () => void;
}) {
  const [c, setC] = useState<ConfigFreeBattle>({ ...configPadrao(), cenario });
  const [escolher, setEscolher] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [mapa, setMapa] = useState<MapaLunar | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const previa = useRef<PreviaDoMapa | null>(null);

  useEffect(() => {
    void ultimaConfig(cenario).then((salva) => {
      setC(salva);
      setEscolher(salva.zonaPouso !== 'aleatoria');
    });
  }, [cenario]);

  const mudar = (m: Partial<ConfigFreeBattle>) => setC((antes) => ajustar({ ...antes, ...m }));

  // Pré-visualização: gera o mapa do preset (em cache); "aleatória" não tem prévia.
  const preset = presetsDe(c.cenario).find((p) => p.id === c.mapa);
  useEffect(() => {
    if (!preset) {
      setMapa(null);
      return;
    }
    const chave = `${preset.seed}|${preset.zonas}|${preset.cenario}`;
    const pronto = cache.get(chave);
    if (pronto) {
      setMapa(pronto);
      return;
    }
    setGerando(true);
    // Deixa a tela pintar o "gerando" antes do passo pesado.
    const espera = setTimeout(() => {
      const novo = gerarPrevia(preset.seed, preset.zonas, preset.cenario);
      cache.set(chave, novo);
      setMapa(novo);
      setGerando(false);
    }, 30);
    return () => clearTimeout(espera);
  }, [preset?.id]);

  useEffect(() => {
    if (!canvas.current) return;
    previa.current ??= new PreviaDoMapa(canvas.current, (zona) => {
      setEscolher(true);
      mudar({ zonaPouso: zona });
    });
    // Sonda E2E: posição de tela de cada zona da prévia.
    const sonda = (window as unknown as { __menus?: Record<string, unknown> }).__menus;
    if (sonda) sonda.zonaNaTela = (k: number) => previa.current?.pontoDaZona(k) ?? null;
  }, [canvas.current]);

  const nacaoDoJogador = c.nacaoJogador === 'aleatoria' ? null : c.nacaoJogador;
  useEffect(() => {
    if (!mapa || !previa.current) return;
    previa.current.mostrar({
      mapa,
      zonas: mapa.zonasDePouso.map((z) => z.d),
      escolhida: escolher && c.zonaPouso !== 'aleatoria' ? c.zonaPouso : null,
      corDoJogador: corDe(nacaoDoJogador ?? 'bra'),
    });
  }, [mapa, c.zonaPouso, escolher, nacaoDoJogador]);

  const problemas = validar(c);
  const semZona = escolher && c.zonaPouso === 'aleatoria';
  const pode = problemas.length === 0 && !semZona;
  const jogadores = c.oponentes.length + 1;

  const iniciar = () => {
    const final = { ...c, zonaPouso: escolher ? c.zonaPouso : ('aleatoria' as const) };
    void gravar(CHAVE, final).finally(() => irParaPartida(final));
  };

  // Nações que cada seletor pode escolher: não repete as fixas dos outros.
  const usadas = (exceto: number) =>
    new Set(
      [c.nacaoJogador, ...c.oponentes.map((o) => o.nacao)].filter(
        (n, k) => k !== exceto && n !== 'aleatoria',
      ),
    );
  const opcoesDeNacao = (indice: number) =>
    NACOES.map((n) => ({ n, livre: !usadas(indice).has(n) }));

  const nomeDaNacao = (n: string) => t(`nacao.${n}` as TextKey);

  return (
    <div class="painel-menu config-partida" data-testid="config-partida">
      <h2>
        {t('fb.titulo')} · {t(`cenario.${c.cenario}` as TextKey)}
      </h2>
      <div class="colunas">
        <div class="opcoes-fb">
          <Linha rotulo="fb.nacao_jogador">
            <select
              data-testid="fb-nacao"
              value={c.nacaoJogador}
              onChange={(e) => mudar({ nacaoJogador: e.currentTarget.value as never })}
            >
              <option value="aleatoria">{t('fb.aleatoria')}</option>
              {opcoesDeNacao(0).map(({ n, livre }) => (
                <option key={n} value={n} disabled={!livre}>
                  {nomeDaNacao(n)}
                </option>
              ))}
            </select>
          </Linha>
          <Linha rotulo="fb.num_oponentes">
            <div class="opcoes">
              {(valoresDe('num_oponentes') as number[]).map((n) => (
                <button
                  key={n}
                  data-testid={`fb-oponentes-${n}`}
                  class={c.oponentes.length === n ? 'ativa' : ''}
                  onClick={() =>
                    mudar({
                      oponentes: Array.from(
                        { length: n },
                        (_, k) =>
                          c.oponentes[k] ?? {
                            nacao: 'aleatoria',
                            dificuldade: configPadrao().oponentes[0]!.dificuldade,
                          },
                      ),
                    })
                  }
                >
                  {n}
                </button>
              ))}
            </div>
          </Linha>
          {c.oponentes.map((o, k) => (
            <Linha key={k} rotulo="fb.oponente" vars={{ n: k + 1 }}>
              <select
                data-testid={`fb-oponente-nacao-${k}`}
                value={o.nacao}
                onChange={(e) =>
                  mudar({
                    oponentes: c.oponentes.map((x, i) =>
                      i === k ? { ...x, nacao: e.currentTarget.value as never } : x,
                    ),
                  })
                }
              >
                <option value="aleatoria">{t('fb.aleatoria')}</option>
                {opcoesDeNacao(k + 1).map(({ n, livre }) => (
                  <option key={n} value={n} disabled={!livre}>
                    {nomeDaNacao(n)}
                  </option>
                ))}
              </select>
              <select
                data-testid={`fb-oponente-dificuldade-${k}`}
                value={o.dificuldade}
                onChange={(e) =>
                  mudar({
                    oponentes: c.oponentes.map((x, i) =>
                      i === k ? { ...x, dificuldade: e.currentTarget.value } : x,
                    ),
                  })
                }
              >
                {DIFICULDADES.map((d) => (
                  <option key={d} value={d}>
                    {t(`dificuldade.${d}` as TextKey)}
                  </option>
                ))}
              </select>
            </Linha>
          ))}
          <Linha rotulo="fb.tamanho">
            {/* CEN-16 (D-79): o tamanho é o do corpo celeste, sem escolha. */}
            <span data-testid="fb-raio">
              {t('fb.raio_do_corpo', { raio: raioDoCenario(c.cenario) })}
            </span>
          </Linha>
          <Linha rotulo="fb.mapa">
            <select
              data-testid="fb-mapa"
              value={c.mapa}
              onChange={(e) => mudar({ mapa: e.currentTarget.value })}
            >
              {presetsDe(c.cenario).map((p) => {
                const motivo = motivoDoPreset(p, jogadores);
                return (
                  <option
                    key={p.id}
                    value={p.id}
                    disabled={motivo !== null}
                    title={motivo ? explicarPreset(p, motivo) : ''}
                  >
                    {t(`mapa.${p.id}` as TextKey)}
                    {motivo ? ` (${explicarPreset(p, motivo)})` : ''}
                  </option>
                );
              })}
              <option value="aleatoria">{t('fb.aleatoria')}</option>
            </select>
          </Linha>
          <Linha rotulo="fb.zona_pouso">
            <div class="opcoes">
              <button
                class={!escolher ? 'ativa' : ''}
                onClick={() => {
                  setEscolher(false);
                  mudar({ zonaPouso: 'aleatoria' });
                }}
              >
                {t('fb.aleatoria')}
              </button>
              <button
                data-testid="fb-zona-escolher"
                class={escolher ? 'ativa' : ''}
                disabled={!preset}
                title={!preset ? t('fb.zona_sem_previa') : ''}
                onClick={() => setEscolher(true)}
              >
                {t('fb.escolher')}
              </button>
            </div>
          </Linha>
          <Escolha
            rotulo="fb.recursos"
            valores={valoresDe('recursos_iniciais') as string[]}
            atual={c.recursos}
            prefixo="fb.recursos."
            aoEscolher={(v) => mudar({ recursos: v as never })}
          />
          <Escolha
            rotulo="fb.nevoa"
            valores={valoresDe('nevoa') as string[]}
            atual={c.nevoa}
            prefixo="fb.nevoa."
            aoEscolher={(v) => mudar({ nevoa: v as never })}
          />
          <Escolha
            rotulo="fb.vitoria"
            valores={valoresDe('condicao_vitoria') as string[]}
            atual={c.vitoria}
            prefixo="fb.vitoria."
            aoEscolher={(v) => mudar({ vitoria: v as never })}
          />
          {c.vitoria === 'tempo_limite' && (
            <Linha rotulo="fb.tempo_limite">
              <select
                data-testid="fb-tempo"
                value={c.tempoLimiteMin}
                onChange={(e) => mudar({ tempoLimiteMin: Number(e.currentTarget.value) })}
              >
                {(valoresDe('tempo_limite_min') as number[]).map((m) => (
                  <option key={m} value={m}>
                    {t('fb.minutos', { n: m })}
                  </option>
                ))}
              </select>
            </Linha>
          )}
          <Linha rotulo="fb.velocidade">
            <div class="opcoes">
              {VELOCIDADES.map((v) => (
                <button
                  key={v}
                  class={c.velocidade === v ? 'ativa' : ''}
                  onClick={() => mudar({ velocidade: v })}
                >
                  {t('fb.vezes', { n: String(v).replace('.', ',') })}
                </button>
              ))}
            </div>
          </Linha>
        </div>
        <div class="previa">
          <canvas ref={canvas} class="previa-mapa" data-testid="previa-mapa" />
          <p class="discreto" data-testid="previa-legenda">
            {!preset
              ? t('fb.previa_aleatoria')
              : gerando
                ? t('fb.previa_gerando')
                : escolher
                  ? c.zonaPouso === 'aleatoria'
                    ? t('fb.previa_clique_zona')
                    : t('fb.previa_zona', { n: c.zonaPouso + 1 })
                  : t('fb.previa_zonas', { n: zonasDaPartida(c) })}
          </p>
        </div>
      </div>
      {!pode && (
        <p class="explicacao" data-testid="fb-problemas">
          {semZona
            ? t('fb.previa_clique_zona')
            : problemas.map((p) => t(p.motivo as TextKey)).join(' ')}
        </p>
      )}
      <div class="acoes">
        <button class="voltar" onClick={aoVoltar}>
          {t('menu.voltar')}
        </button>
        <button class="primario" data-testid="fb-iniciar" disabled={!pode} onClick={iniciar}>
          {t('fb.iniciar')}
        </button>
      </div>
    </div>
  );
}

/** Mantém a configuração coerente: mapa que comporta os jogadores (FB-03) e zona do mapa. */
function ajustar(c: ConfigFreeBattle): ConfigFreeBattle {
  const jogadores = c.oponentes.length + 1;
  const atual = presetsDe(c.cenario).find((p) => p.id === c.mapa);
  const mapa =
    c.mapa === 'aleatoria' || (atual && !motivoDoPreset(atual, jogadores))
      ? c.mapa
      : presetPadrao(c.cenario, jogadores);
  const zonas = zonasDaPartida({ mapa, oponentes: c.oponentes });
  const zonaPouso =
    c.zonaPouso === 'aleatoria' || c.zonaPouso < zonas ? c.zonaPouso : ('aleatoria' as const);
  // Uma nação fixa não pode repetir: a repetida volta a "aleatória".
  const vistas = new Set<string>(c.nacaoJogador === 'aleatoria' ? [] : [c.nacaoJogador]);
  const oponentes = c.oponentes.map((o) => {
    if (o.nacao === 'aleatoria') return o;
    if (vistas.has(o.nacao)) return { ...o, nacao: 'aleatoria' as const };
    vistas.add(o.nacao);
    return o;
  });
  return { ...c, mapa, zonaPouso, oponentes };
}

function explicarPreset(p: PresetDeMapa, motivo: string): string {
  return t(motivo as TextKey, {
    tamanho: t(`mapa.${p.id}` as TextKey),
    min: p.jogadores[0],
    max: p.jogadores[1],
  });
}

function Linha({
  rotulo,
  vars,
  children,
}: {
  rotulo: TextKey;
  vars?: Record<string, string | number>;
  children: preact.ComponentChildren;
}) {
  return (
    <div class="linha-fb">
      <span class="rotulo">{t(rotulo, vars)}</span>
      <div class="controle">{children}</div>
    </div>
  );
}

function Escolha({
  rotulo,
  valores,
  atual,
  prefixo,
  aoEscolher,
}: {
  rotulo: TextKey;
  valores: string[];
  atual: string;
  prefixo: string;
  aoEscolher: (v: string) => void;
}) {
  const memo = useMemo(() => valores, [valores.join('|')]);
  return (
    <Linha rotulo={rotulo}>
      <div class="opcoes">
        {memo.map((v) => (
          <button
            key={v}
            data-testid={`${prefixo}${v}`}
            class={atual === v ? 'ativa' : ''}
            onClick={() => aoEscolher(v)}
          >
            {t(`${prefixo}${v}` as TextKey)}
          </button>
        ))}
      </div>
    </Linha>
  );
}
