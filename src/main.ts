import './styles.css';
import { createView } from './render/view';
import { mountUi } from './ui/mount';

const viewport = document.getElementById('viewport');
const uiRoot = document.getElementById('ui');
if (!viewport || !uiRoot) {
  throw new Error('index.html precisa dos elementos #viewport e #ui');
}

const view = createView(viewport);
mountUi(uiRoot);

const frame = (): void => {
  view.render();
  requestAnimationFrame(frame);
};
requestAnimationFrame(frame);
