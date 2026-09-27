/** TEC-27 (D-76): campo de macetes no centro da tela (Enter confirma, Esc fecha). */
import { useEffect, useRef } from 'preact/hooks';
import { t } from '../i18n';
import { acoesDoMacete, maceteAberto, maceteDesconhecido } from './hud';

export function CampoDeMacetes() {
  const aberto = maceteAberto.value;
  const campo = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (aberto) campo.current?.focus();
  }, [aberto]);
  if (!aberto) return null;
  return (
    <div class="campo-macetes" data-testid="macetes">
      <input
        ref={campo}
        type="text"
        data-testid="macetes-campo"
        placeholder={t('macete.dica')}
        autocomplete="off"
        spellcheck={false}
        // As teclas digitadas aqui não chegam aos atalhos do jogo.
        onKeyUp={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Escape') {
            maceteAberto.value = false;
          } else if (e.key === 'Enter') {
            e.preventDefault();
            const ok = acoesDoMacete.enviar(e.currentTarget.value);
            maceteDesconhecido.value = !ok;
            if (ok) maceteAberto.value = false;
          } else maceteDesconhecido.value = false;
        }}
      />
      {maceteDesconhecido.value && (
        <small data-testid="macetes-aviso" role="alert">
          {t('macete.desconhecido')}
        </small>
      )}
    </div>
  );
}
