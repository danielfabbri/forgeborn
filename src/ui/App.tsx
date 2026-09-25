import { BarraSuperior } from './BarraSuperior';
import { DebugOverlay } from './DebugOverlay';
import { PainelProducao } from './PainelProducao';
import { PainelSelecao, Tooltip } from './PainelSelecao';
import { FimDePartida, MenuDePausa } from './TelasDaPartida';
import { HudControleDireto } from './ControleDireto';
import { PilhaDeAlertas } from './Alertas';
import { BotoesDeParados } from './Parados';

export function App() {
  return (
    <>
      <BarraSuperior />
      <PainelSelecao />
      <PainelProducao />
      <Tooltip />
      <PilhaDeAlertas />
      <BotoesDeParados />
      <HudControleDireto />
      <MenuDePausa />
      <FimDePartida />
      <DebugOverlay />
    </>
  );
}
