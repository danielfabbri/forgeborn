/**
 * Configurações (FLX-13, D-36): Gráficos, Jogo, Controles e Acessibilidade. A mesma tela abre
 * da Seleção de Modo e do Menu de Pausa; cada mudança vale na hora e fica salva (TEC-21).
 */
import { useState } from 'preact/hooks';
import {
  alterarConfiguracoes,
  configuracoes,
  ESCALA_MAX,
  ESCALA_MIN,
  ESCALA_PASSO,
  PRESETS,
} from '../game/configuracoes';
import { t, type TextKey } from '../i18n';
import { dados } from '../sim';

type Aba = 'graficos' | 'jogo' | 'controles' | 'acessibilidade';
const ABAS: readonly Aba[] = ['graficos', 'jogo', 'controles', 'acessibilidade'];

/** §12.4: todos os atalhos, com os do controle direto (M11). */
const ATALHOS = dados.atalhos;

export function Configuracoes({ aoVoltar }: { aoVoltar: () => void }) {
  const [aba, setAba] = useState<Aba>('graficos');
  const c = configuracoes.value;
  return (
    <div class="painel-menu configuracoes" data-testid="configuracoes">
      <h2>{t('config.titulo')}</h2>
      <div class="abas" role="tablist">
        {ABAS.map((a) => (
          <button
            key={a}
            role="tab"
            class={a === aba ? 'ativa' : ''}
            aria-selected={a === aba}
            onClick={() => setAba(a)}
          >
            {t(`config.aba.${a}` as TextKey)}
          </button>
        ))}
      </div>
      <div class="conteudo-aba">
        {aba === 'graficos' && (
          <label class="campo">
            <span>{t('config.preset')}</span>
            <div class="opcoes">
              {PRESETS.map((p) => (
                <button
                  key={p}
                  class={p === c.grafico ? 'ativa' : ''}
                  data-testid={`preset-${p}`}
                  onClick={() => alterarConfiguracoes({ grafico: p })}
                >
                  {t(`config.preset.${p}` as TextKey)}
                </button>
              ))}
            </div>
          </label>
        )}
        {aba === 'jogo' && (
          <>
            <label class="campo">
              <input
                type="checkbox"
                checked={c.rolagemPelasBordas}
                onChange={(e) =>
                  alterarConfiguracoes({ rolagemPelasBordas: e.currentTarget.checked })
                }
              />
              <span>{t('config.rolagem')}</span>
            </label>
            <label class="campo">
              <input
                type="checkbox"
                checked={c.barrasSempre}
                onChange={(e) => alterarConfiguracoes({ barrasSempre: e.currentTarget.checked })}
              />
              <span>{t('config.barras')}</span>
            </label>
          </>
        )}
        {aba === 'controles' && (
          <table class="atalhos">
            <tbody>
              {ATALHOS.map((a) => (
                <tr key={`${a.contexto}|${a.tecla}`}>
                  <td class="contexto">{t(`atalho.contexto.${a.contexto}` as TextKey)}</td>
                  <td class="tecla">
                    <kbd>{a.tecla}</kbd>
                  </td>
                  <td>{a.acao}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {aba === 'acessibilidade' && (
          <label class="campo">
            <span>{t('config.escala', { valor: c.escalaInterface })}</span>
            <input
              type="range"
              data-testid="escala-interface"
              min={ESCALA_MIN}
              max={ESCALA_MAX}
              step={ESCALA_PASSO}
              value={c.escalaInterface}
              onInput={(e) =>
                alterarConfiguracoes({ escalaInterface: Number(e.currentTarget.value) })
              }
            />
          </label>
        )}
      </div>
      <button class="voltar" onClick={aoVoltar}>
        {t('menu.voltar')}
      </button>
    </div>
  );
}
