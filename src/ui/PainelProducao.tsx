import { t, type TextKey } from '../i18n';
import { acoesDoPainel, avisoProducao, painelProducao } from './producao';

const nome = (item: string) => t(`item.${item}` as TextKey);

/** Painel de produção: fila do produtor, menus da Impressora e posicionamento (UI-08). */
export function PainelProducao() {
  const estado = painelProducao.value;
  const aviso = avisoProducao.value;
  const acoes = acoesDoPainel.atual;
  const mostrar = estado.produtor || estado.obra || estado.posicionando || estado.reparando;
  return (
    <>
      {aviso && (
        <div class="aviso-producao" data-testid="aviso-producao">
          {aviso.texto}
        </div>
      )}
      {mostrar && (
        <div class="painel-producao" data-testid="painel-producao">
          {estado.posicionando && (
            <div data-testid="posicionando">
              {t('producao.posicionando', { item: nome(estado.posicionando) })}
              {estado.motivo && (
                <div class="motivo" data-testid="motivo">
                  {t(`motivo.${estado.motivo}` as TextKey)}
                </div>
              )}
            </div>
          )}
          {estado.reparando && <div>{t('producao.reparar')}</div>}
          {estado.obra && (
            <div data-testid="obra">
              <strong>{nome(estado.obra.tipo)}</strong>
              <div>
                {estado.obra.instalada
                  ? t('producao.em_obra', { pct: Math.floor(estado.obra.progresso * 100) })
                  : t('producao.reservada')}
              </div>
              <button
                type="button"
                onClick={() => acoes?.cancelarObra(estado.obra!.id)}
                data-testid="cancelar-obra"
              >
                {t('producao.cancelar_obra')}
              </button>
            </div>
          )}
          {estado.produtor && !estado.posicionando && (
            <div>
              <strong>{nome(estado.produtor.tipo)}</strong>
              {estado.produtor.tipo === 'printer' && (
                <div class="abas">
                  <button
                    type="button"
                    class={estado.menu === 'unidades' ? 'ativa' : ''}
                    onClick={() => acoes?.abrirMenu('unidades')}
                  >
                    U {t('producao.menu_unidades')}
                  </button>
                  <button
                    type="button"
                    class={estado.menu === 'estruturas' ? 'ativa' : ''}
                    onClick={() => acoes?.abrirMenu('estruturas')}
                  >
                    B {t('producao.menu_estruturas')}
                  </button>
                </div>
              )}
              <div class="opcoes" data-testid="opcoes">
                {estado.opcoes.map((opcao) => (
                  <button
                    type="button"
                    key={opcao.item}
                    onClick={() => acoes?.escolher(opcao.item)}
                    data-item={opcao.item}
                  >
                    <kbd>{opcao.tecla}</kbd> {nome(opcao.item)}
                  </button>
                ))}
              </div>
              <div class="fila" data-testid="fila">
                {t('producao.fila')}:
                {estado.produtor.fila.length === 0 && <span> {t('producao.vazia')}</span>}
                {estado.produtor.fila.map((item, k) => (
                  <div class="item-fila" key={`${k}-${item.item}`}>
                    <span>{nome(item.item)}</span>
                    <span class="barra">
                      <span style={{ width: `${Math.floor(item.progresso * 100)}%` }} />
                    </span>
                    <button
                      type="button"
                      title={t('producao.cancelar')}
                      onClick={() => acoes?.cancelarItem(estado.produtor!.id, k)}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
