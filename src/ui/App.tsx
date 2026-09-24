import { BarraSuperior } from './BarraSuperior';
import { DebugOverlay } from './DebugOverlay';
import { PainelProducao } from './PainelProducao';
import { PainelSelecao, Tooltip } from './PainelSelecao';
import { FimDePartida, MenuDePausa } from './TelasDaPartida';
import { HudControleDireto } from './ControleDireto';

export function App() {
  return (
    <>
      <BarraSuperior />
      <PainelSelecao />
      <PainelProducao />
      <Tooltip />
      <HudControleDireto />
      <MenuDePausa />
      <FimDePartida />
      <DebugOverlay />
    </>
  );
}
