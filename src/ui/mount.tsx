import { render } from 'preact';
import { App } from './App';

export function mountUi(root: HTMLElement): void {
  render(<App />, root);
}
