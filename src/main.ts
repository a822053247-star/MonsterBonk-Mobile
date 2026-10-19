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
  showError('无法显示场景，请更新浏览器并开启硬件加速。');
}
