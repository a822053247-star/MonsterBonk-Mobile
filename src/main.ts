import './style.css';
import { createUI } from './ui';
import { Game, showError } from './game';

createUI(document.getElementById('app')!);
document.getElementById('retry')!.addEventListener('click', () => window.location.reload());

try {
  const game = new Game();
  if (import.meta.env.DEV) {
    Object.defineProperty(window, '__monsterbonk', { configurable: true, value: { inspect: () => game.inspect() } });
  }
  import.meta.hot?.dispose(() => {
    game.dispose();
    Reflect.deleteProperty(window, '__monsterbonk');
  });
} catch (error) {
  console.error('MonsterBonk initialization failed:', error);
  showError('无法创建 3D 场景。请使用支持 WebGL 2 的新版 Chrome 或 Safari，并确认浏览器的硬件加速已开启。');
}
