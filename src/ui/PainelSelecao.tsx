import { t, type TextKey } from '../i18n';
import { acoesDaSelecao, canvasDoRetrato, painelSelecao, tooltip } from './hud';

const nome = (modelo: string) => t(`item.${modelo}` as TextKey);

function Barra({ fracao, classe }: { fracao: number; classe: string }) {
  return (
    <span class={`barra-sel ${classe}`}>
      <span style={{ width: `${Math.round(Math.max(0, Math.min(1, fracao)) * 100)}%` }} />
    </span>
  );
}

/** UI-03: painel de seleção (uma unidade, várias ou uma jazida, UI-13). */
export function PainelSelecao() {
  const sel = painelSelecao.value;
  if (sel.tipo === 'nenhum') return null;
  return (
    <div class="painel-selecao" data-testid="painel-selecao">
      {sel.tipo === 'corpo' && (
        <div class="corpo">
          <canvas
            class="retrato"
            width={96}
            height={96}
            ref={(el) => {
              if (canvasDoRetrato.peek() !== el) canvasDoRetrato.value = el;
            }}
          />
          <div class="dados">
            <strong data-testid="selecao-nome">{nome(sel.modelo)}</strong>
            <div data-testid="selecao-hp">
              {t('selecao.hp')} {Math.ceil(sel.hp)}/{sel.hpMax}
              <Barra fracao={sel.hp / sel.hpMax} classe="hp" />
            </div>
            {sel.en && (
              <div data-testid="selecao-en">
                {t('selecao.en')} {Math.floor(sel.en.atual)}/{sel.en.max}
                <Barra fracao={sel.en.atual / sel.en.max} classe="en" />
              </div>
            )}
            <div data-testid="selecao-estado">
              {t('selecao.estado')}: {t(sel.estado as TextKey)}
            </div>
            {sel.carga && (
              <div data-testid="selecao-carga">
                {t('selecao.carga')}: {Math.floor(sel.carga.atual)}/{sel.carga.max}
                {sel.carga.recurso && ` ${t(`recurso.${sel.carga.recurso}` as TextKey)}`}
              </div>
            )}
            {sel.postura && (
              <div data-testid="selecao-postura">
                {t('selecao.postura')}: {t(`postura.${sel.postura}` as TextKey)}
              </div>
            )}
            {sel.arma && (
              <div data-testid="selecao-arma">
                {t('selecao.arma')}:{' '}
                {t('selecao.arma_valor', { dano: sel.arma.dano, alcance: sel.arma.alcance })}
              </div>
            )}
          </div>
        </div>
      )}
      {sel.tipo === 'grupo' && (
        <div class="grupos" data-testid="selecao-grupos">
          {sel.grupos.map((g) => (
            <button
              type="button"
              key={g.modelo}
              class="grupo"
              onClick={() => acoesDaSelecao.filtrar?.(g.ids)}
            >
              <span>
                {t('selecao.grupo', { n: g.ids.length })} {nome(g.modelo)}
              </span>
              <span class="mini-barras">
                {g.hp.map((f, k) => (
                  <Barra key={k} fracao={f} classe="hp" />
                ))}
              </span>
            </button>
          ))}
        </div>
      )}
      {sel.tipo === 'jazida' && (
        <div class="jazida" data-testid="selecao-jazida">
          <strong>
            {t('jazida.titulo', { recurso: t(`recurso_nome.${sel.recurso}` as TextKey) })}
          </strong>
          <div>
            {t('jazida.restante')}: {Math.floor(sel.quantidade)}/{sel.inicial}
            <Barra fracao={sel.quantidade / sel.inicial} classe="jazida" />
          </div>
          <div>
            {t('jazida.hovers')}: {sel.hovers}
          </div>
        </div>
      )}
    </div>
  );
}

/** REG-11/REG-12: aviso de fim de partida (a tela completa vem com FLX-12). */
/** UI-09/UI-13: tooltip ao lado do cursor. */
export function Tooltip() {
  const dica = tooltip.value;
  if (!dica) return null;
  return (
    <div class="tooltip" data-testid="tooltip" style={{ left: dica.x + 14, top: dica.y + 14 }}>
      {dica.texto}
    </div>
  );
}
