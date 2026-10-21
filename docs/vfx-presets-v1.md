# VFX Presets V1

## 入口与边界

`src/visuals/vfx-presets.ts` 定义 projectile / impact / area 三种声明式配置和六个默认预设。
`src/visuals/vfx-resolver.ts` 在注册时校验、复制并冻结配置，按攻击 ID / 战斗效果 kind 绑定。每帧只查 Map，不复制配置。
正式战斗使用 `CombatView.vfx`；旧模式不解析这些配置。未绑定的武器/效果继续使用原渲染路径，已有融合专用动画优先保留。

弹体与爆炸继续使用 `FirePixelView` 的 fire / elemental 两张共享图集；拖尾和命中继续使用容量 48 的 `ParticleFeedbackView`。
蒸汽继续使用 `ReactionView` 的共享烟雾图集。额外一个容量 `COMBAT_LIMITS.effects` 的实例环批次承载可选冲击环、范围轮廓及烟雾加载失败回退。
没有每颗弹体创建材质、没有新战斗时钟、没有视觉随机数、没有修改 Combat 的伤害/碰撞/反应触发逻辑。

## 新增配置并分配到现有内容

```ts
import type { ProjectileVfx, AreaVfx } from '../src/visuals/vfx-presets';

const iceShot = {
  id: 'ice-shot', type: 'projectile', color: '#bbddff', scale: 1.2,
  trail: { color: '#eeeeff', length: 1.1, opacity: .4 },
  low: { animated: false, trail: false },
} satisfies ProjectileVfx;

combatView.vfx.register(iceShot);
combatView.vfx.bindProjectile('bubble', iceShot.id);

const steam = {
  id: 'soft-steam', type: 'area', color: '#fff4dc', secondaryColor: '#cceeff',
  outline: 'ring', radiusScale: 1, duration: 'event', fade: .5,
  rotationSpeed: .8, pulseSpeed: 3, low: { mist: false },
} satisfies AreaVfx;
combatView.vfx.register(steam);
combatView.vfx.bindArea('steam', steam.id);
```

命中/爆炸用 `bindImpact('water' | 'hit' | 'burst' | ..., presetId)`。绑定对象是效果 kind，V1 不按每个伤害来源区分同一种 hit。
默认绑定是实例本地配置，切换武器无需新建渲染类；若同一 CombatView 中途重新绑定，在途弹体与存活效果也会采用新样式。
运行重开时视觉批次清空并复用，内容绑定保留；不同内容包应在新开局前统一应用绑定。

静态内容包可直接在 `VFX_PRESETS` 增加配置并在 resolver 构造器中绑定；动态内容包可以在初始化时调用上面的方法。
注册重复 ID、未知 ID、类别不匹配、无效颜色、NaN/Infinity、越界参数或图集帧会抛错，内容工厂必须在进入战斗前完成验证。

运行时导入使用 `tryBind`，错误不会中断战斗，会保留上一个有效绑定：

```ts
const result = combatView.vfx.tryBind({ type: 'projectile', attack: 'bubble' }, iceShot);
if (!result.ok) console.warn(result.error); // 保留原来的水泡弹视觉
```

`register` / `bind*` 仍是严格的作者校验接口；`tryBind` 是带错误结果的运行时边界。它不创建额外渲染类，也不会将测试内容加入卡池。

## 参数含义

- 颜色使用 `#RRGGBB`。图集颜色是乘法 tint；程序化弹体、粒子与环使用实例颜色。
- projectile.scale 是视觉倍数，不改变碰撞半径。trail.length 是世界单位，受已飞行距离约束；opacity 是实例 alpha。
- animation 仅选择已有 fire（4×4）或 elemental（8×4）共享图集，row/frames/fps 指定动画。childRow 可指定子弹行，否则使用 row。
- impact.radiusScale 乘现有视觉尺寸；duration 是最大视觉秒数，并被 CombatEffect.duration 截断。ring / particles 可独立开关，low 决定低画质是否动画和粒子。
- impact.height 控制视觉闪光高度；area.height / rise 控制雾团起点与上升高度，均不改变任何战斗数据。
- area.radiusScale 乘已有事件半径；outline 可选 ring / none。duration 必须是 event，不能创建独立持续区域。fade 控制峰值透明度，rotationSpeed/pulseSpeed 使用弧度/游戏秒。
- 低画质来自现有 AdaptiveQuality.particles。装饰预算保持原有上限：拖尾 24/12、命中 6/3、蒸汽烟雾总实例数 48。关闭烟雾或加载失败时使用低透明度轮廓。
- 无贴图时弹体、拖尾、命中与爆炸回退为现有程序化批次。范围轮廓位于地面、低 alpha、保留深度测试，不覆盖敌人预警逻辑。
- 已有融合图集继续优先驱动专属动画；普通武器使用新 animation。低画质关闭动画时回退为现有程序化表现。

## 验收与复现

`tests/vfx-presets.spec.ts` 覆盖解析、非法配置、重复 ID、错误绑定、不可变快照与时长截断。
`tests/vfx-presets-ui.spec.ts` 加载真正的 Game / CombatView / 正式战斗 UI，通过实际弹体碰撞触发火、水命中，以及潮湿后火系命中的真实蒸汽规则。
测试页面仅控制确定性的开局、输入、时间与截图，不另建特效渲染器。断言实际 GPU 像素变化、批次数量、资源稳定、画质回退、暂停恢复、重开清理、旧模式隔离和贴图失败回退。

`tests/vfx-live-entry.spec.ts` 直接访问发布入口 `/` 并点击正式开始按钮，不替换 HTML、不注入战斗对象，等待自然敌人和自动武器命中；火/水分别在 Chromium、WebKit 通过。

```sh
npm run build
npm test -- --workers=4
npx playwright test tests/vfx-presets.spec.ts tests/vfx-presets-ui.spec.ts tests/particle-feedback.spec.ts
npm run balance:weapons
npm run balance:waves
```

截图：`artifacts/vfx-spark-combat.png`、`artifacts/vfx-bubble-combat.png`、`artifacts/vfx-steam-combat.png`。
首页自然战斗截图：`artifacts/vfx-spark-live.png`、`artifacts/vfx-bubble-live.png`；运行时新增预设截图：`artifacts/vfx-custom-combat.png`。
基线和最终日志使用 `artifacts/vfx-*` 前缀；数值 JSON 的修改前后哈希完全一致。
完整套件里的既有失败与最终结果见 `artifacts/vfx-validation.md`。不得把这些失败隐藏为跳过或修改断言。

## 下一阶段：自动武器与遗物内容工厂

内容模板只生成配置和绑定清单，例如 `{attackId, projectilePresetId}`、`{effectKind, impactPresetId, areaPresetId}`。
工厂在构建/导入时通过 `validateVfxPreset` 和 resolver 注册/绑定完成校验，随后复用真实 CombatView 的浏览器验收，不生成专属 Three.js 类。
武器/遗物规则仍通过现有 Combat 产生事件；范围视觉只消费已存在的事件半径和生命周期。
需要让多个武器的同一种 hit 使用不同样式时，下一阶段可给 CombatEffect 添加纯视觉来源 ID，再扩展 resolver 的绑定键；无需改变伤害机制。
新增图集必须先加入共享资源清单、审计容量与加载失败回退，再开放给生成器。V1 不接受任意 URL，以免生成内容隐式创建无限材质/图集批次。

## 生命周期补充验收

`tests/vfx-lifecycle.spec.ts` 与 `tests/vfx-timeline-harness.ts` 在 120 Hz 固定步长、种子 20261021 下调用正式 Game.step。
每组在同一局 00:03 后前进，不倒带、不注入命中特效或潮湿状态。火花弹、水泡弹、已有爆裂分裂升级与蒸汽各自保留发射→飞行→真实碰撞→展开→到期的原始帧及完整 JSON。
蒸汽必须先有真实水命中，再有火命中和已装备沸腾核心；缺失核心、缺失水命中的负对照均不会产生蒸汽。

```sh
npx playwright test tests/vfx-lifecycle.spec.ts tests/vfx-presets.spec.ts
node scripts/vfx-lifecycle-report.mjs
```

逐帧慢放报告：`artifacts/vfx-lifecycle/index.html`，原始证据：同目录 JSON 和 PNG。报告使用原图切换，不合成或插值。
覆盖 844×390 高画质和 568×320 省电画质，并验证精英圆环、Boss 冲锋和扇形预警与爆炸/蒸汽重叠时的像素贡献。
这轮视觉参数调整：火/水弹体显示比例、命中高度、现有水系图集动画、蒸汽雾团高度/亮度/轮廓；没有修改真实半径、碰撞、伤害或攻击频率。
