import { useEffect } from 'preact/hooks';
import { t } from '../i18n';
import { debugStats, debugVisible } from './debugStats';

/** TEC-26: overlay de depuração, alternado com Ctrl+Shift+D. */
export function DebugOverlay() {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.shiftKey && event.code === 'KeyD') {
        event.preventDefault();
        debugVisible.value = !debugVisible.value;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  if (!debugVisible.value) return null;
  const stats = debugStats.value;
  return (
    <div class="debug-overlay" data-testid="debug-overlay">
      <strong>{t('debug.titulo')}</strong>
      <div>
        {t('debug.fps')}: <span data-testid="debug-fps">{stats.fps.toFixed(0)}</span>
      </div>
      <div>
        {t('debug.tick_ms')}: <span data-testid="debug-tick-ms">{stats.tickMs.toFixed(3)}</span>
      </div>
      <div>
        {t('debug.entidades')}: <span data-testid="debug-entidades">{stats.entidades}</span>
      </div>
      <div>
        {t('debug.tick')}: <span data-testid="debug-tick">{stats.tick}</span>
      </div>
      <div>
        {t('debug.draw_calls')}: <span data-testid="debug-draw-calls">{stats.drawCalls}</span>
      </div>
      <div>
        {t('debug.triangulos')}: <span data-testid="debug-triangulos">{stats.triangulos}</span>
      </div>
    </div>
  );
}
