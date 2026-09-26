/** CAM-05/CAM-07: painel do tutorial da Missão 0 (texto do passo e Pular tutorial). */
import { t, type TextKey } from '../i18n';
import { acoesDoTutorial, tutorialNaTela } from './hud';

export function PainelDoTutorial() {
  const estado = tutorialNaTela.value;
  if (!estado) return null;
  const concluido = estado.passo > estado.total;
  return (
    <div class="painel-tutorial" data-testid="tutorial" data-passo={estado.passo}>
      <strong>
        {concluido
          ? t('tutorial.concluido')
          : t('tutorial.titulo', { n: estado.passo, total: estado.total })}
      </strong>
      {!concluido && <p>{t(`tutorial.passo${estado.passo}` as TextKey)}</p>}
      {estado.passo === 6 && (
        <button
          type="button"
          data-testid="tutorial-ir-ao-ponto"
          onClick={() => acoesDoTutorial.irAoPonto()}
        >
          {t('tutorial.ir_ao_ponto')}
        </button>
      )}
      <button type="button" data-testid="tutorial-pular" onClick={() => acoesDoTutorial.pular()}>
        {t('tutorial.pular')}
      </button>
    </div>
  );
}
