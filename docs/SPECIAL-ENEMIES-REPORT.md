# 三种特殊敌人接入记录

日期：2026-10-20。实现基于 `ef5494a85c68ab39f23f7f470c961fce56ad9963`，当前改动未提交。

## 已实现

三张原始 PNG 从 `public/assets/pixel/enemies` 接入六种敌人的固定实例批次；原图保持不变。三个运行时 ID 保留用户指定的 `draft-*` 标识，规则集中于 `src/special-enemies.ts`。

| 敌人 | 正式挑战出现方式 | 行为与奖励 |
|---|---|---|
| 晶屑虫 | 第 1–6 波，首次 8 秒，之后每 12 秒尝试一组 | 5–8 只紧凑成组；基础 HP 8、半径 0.3；每累计 3 杀掉 1 XP、12 杀给 1 金币；不加专属特效 |
| 爆孢怪 | 第 2–6 波，首次 14 秒，之后每 18 秒尝试，最多 3 只存活 | 基础 HP 28；死后粉紫孢子结点、短烟雾与感叹号预警 0.7 秒，半径 2.5，对怪物 45 / 玩家 12 伤害；击杀 1 金币、2 XP |
| 携宝兽 | 第 2–6 波，22 秒起尝试，每波最多一只 | 基础 HP 65；停留 1.2 秒，随后远离玩家逃跑；最多活动 8 秒，或远离玩家 29 单位后离场；逃跑不奖励，击杀 12 金币、8 XP，显示金币散开和浮字 |

生命随原有波次倍率增长。新怪共享波次活跃上限、256 槽敌人池和安全生成检查；场地拥挤时普通补怪给等待中的特殊目标留出空位。爆炸池固定 16，每只存活爆孢怪预留一个未来槽；携宝兽奖励表现固定 8 槽。爆炸先记引爆标记再结算一次伤害，环境来源记作 `spore`，每只连锁死亡仍重新预警 0.7 秒。玩家无敌、障碍遮挡、出生保护、玩家死亡优先级沿用现有规则。

暂停和升级冻结计时；换波、重开、结算与 Boss 死亡清空特殊事件。历史模式不自动生成这三种新怪。

## 验证

- `npm run build`：通过。Vite 仍提示 Three.js 分块大于 500 kB。
- `npx playwright test tests/special-enemies.spec.ts tests/special-enemies-ui.spec.ts`：Chromium / WebKit 共 **32 项通过**，包括 1280×720 和 568×320 画面检查、暂停/重开和资源释放。
- Chromium 相关回归 **70 项通过**，命令如下；其中两项已确认的原有失败单独记录，未用跳过标记修改原测试。

```powershell
npx playwright test tests/special-enemies.spec.ts tests/special-enemies-ui.spec.ts tests/swarm.spec.ts tests/swarm-ui.spec.ts tests/run-flow.spec.ts tests/enemy-challenge.spec.ts tests/combat-model.spec.ts tests/enemy-pixel.spec.ts tests/enemy-motion-model.spec.ts tests/enemy-motion-ui.spec.ts --project=chromium --grep-invert 'a real area attack|24/48/120/200'
```

新增验收覆盖安全成组、低掉落、真实火花弹击杀、爆裂火种连锁晶屑虫、爆炸双向伤害、逐次预警、重复伤害去重、来源和池槽复用、逃跑、奖励、满场调度、升级暂停、Boss 同帧死亡与清理。既有像素测试的三批次/三纹理断言调整为六批次/六纹理，原三种怪的朝向、外观、缺图回退断言保留。既有对象池测试原本只尝试生成 100 只，却断言已填满 256 槽，已改为实际尝试超过池容量。

## 原有回归失败

以下两项在本次修改前的 `HEAD:src/combat.ts` 和 `HEAD:tests/swarm.spec.ts` 上另行复现，结果与修改后相同。未改动武器或旧怪潮玩法来迎合它们。

| 测试 | 已复现结果 |
|---|---|
| `tests/swarm.spec.ts` — `a real area attack clears multiple low-health swarm members in one burst` | 预期击杀 8，实际 7 |
| `tests/swarm.spec.ts` — `24/48/120/200 pooled enemies with all fusions preserve bounded resources` | 部分场景预期击杀大于 0，实际 0 |

复现时临时导出基线 Combat 与对应测试后运行上述两个名称；临时文件已移除。未进行全仓库测试或手机真机性能验收。

## 画面

桌面/手机各保存一组：`artifacts/special-enemies-roster-*.png`、`special-enemies-warning-*.png`、`special-enemies-reward-*.png`。晶屑虫只缩小显示；爆孢预警感叹号在拥挤时保持可见；携宝兽用金币标记和离场刻度表达追逐目标。

## 爆孢特效重做（1.4.1）

按用户反馈移除粉红色圆盘、平滑几何边圈和十二颗几何碎粒。预警改为现有火焰图集里的像素焦火边缘与中心蓄爆光团；爆炸按第 8/9/10 帧播放闪光、火团扩张和爆发，第 11 帧作为散开余烬，再用已有 Kenney `smoke_08.png` 留下短促烟尘。原始 PNG 未修改，贴地边缘采样校正图中已有透视；大爆发采用底部锚点，避免被地面裁断。

实现为 `src/spore-explosion-view.ts`，复用现有 `FlameAtlasBatch`，固定 128 火焰实例、48 烟尘实例和 16 个范围边缘；不增加战斗数据字段，不修改爆炸伤害、半径、0.7 秒延迟、连锁来源和掉落规则。每个连锁节点单独读取原有创建时间，重复渲染不推进动画。

追加截图：`artifacts/special-enemies-burst-1280.png` / `-568.png` 和 `special-enemies-chain-1280.png` / `-568.png`。UI 验收增加素材加载、真实爆发帧、烟尘、连锁爆发与下一节点预警同时显示，以及暂停/清理；回归原有火焰横扫素材表现，避免共享渲染工具受影响。

本轮 `npm run build` 通过；`npx playwright test tests/special-enemies.spec.ts tests/special-enemies-ui.spec.ts tests/flame-sweep-effects.spec.ts` 在 Chromium / WebKit 合计 **34 项通过**。

## 横扫与死亡预警辨识修复（1.4.3）

用户指出大的火焰围着角色，小的位于怪物死亡处。最小复现为一次真实横扫击杀一只爆孢怪：横扫仍在播放时，死亡预警同时显示同一图集的火环帧。`npx playwright test tests/spore-warning-clarity.spec.ts --project=chromium` 修改前失败，实际捕获 `SporeScorchedWarning` 与 `FlameSectorWave` 两层火环；单独隐藏前者后横扫仍显示，爆炸尚未触发，定位为预警共用火环素材造成的视觉混淆。

预警改为已有 Kenney `magic_02.png` 的粉紫孢子结点纹理和 `smoke_08.png` 的短烟雾，不再在预警阶段绘制任何火焰帧。爆炸的闪光/火团/余烬、0.7 秒延迟、半径、伤害、掉落和连锁规则均保留。原复现测试验证横扫击杀、未到引爆时间的死亡事件、可见的独立预警素材以及只剩一层横扫火环。

构建通过；`tests/spore-warning-clarity.spec.ts`、`tests/special-enemies.spec.ts`、`tests/special-enemies-ui.spec.ts`、`tests/flame-sweep-effects.spec.ts` 的 Chromium / WebKit 共 **36 项通过**。手机画面检查后提高孢子结点纹理的透明度与亮度，避免细线消失；再次运行两份相关浏览器测试，共 **4 项通过**。临时诊断代码已清除。

## 携宝兽发现与追踪（1.4.6）

携宝兽保持显示高度 2.4，在此基础上增加大金币和深底金边名牌。名牌最低显示高度 28 像素，关闭深度遮挡与场景雾，在怪群中仍可辨认。保留 8 格离场倒计时，最后 2 秒加快金币脉动。逃跑时留下 0.7 秒消散的金色星光尾迹，取样于真实移动位置；屏幕外目标显示金箭头及名牌，方向根据相机投影计算并适配横屏宽高比，左侧避开状态栏和摇杆。

实现为 `src/treasure-tracker-view.ts`，由 `SpecialEnemyView` 接入。固定 8 个标记槽、64 个星光实例，复用 `assets/particles/kenney-feedback.png` 点状星光，不在移动时创建 GPU 资源。不改生成、AI、金币奖励和逃跑时限；暂停/升级/重复渲染不追加轨迹，死亡、逃跑、波末与重开清除可见标记。

新增 `tests/treasure-tracking-ui.spec.ts` 验证手机/桌面怪群识别、名牌尺寸、真实移动尾迹、重复渲染冻结、四边及左侧对角方向标记、资源稳定和清理。截图：`artifacts/treasure-tracking-crowd-1280.png` / `-568.png`、`treasure-tracking-offscreen-1280.png` / `-568.png`。

`npm run build` 通过；`tests/treasure-tracking-ui.spec.ts`、`tests/special-enemies-ui.spec.ts`、`tests/special-enemies.spec.ts`、`tests/spore-warning-clarity.spec.ts` 在 Chromium / WebKit 合计 **36 项通过**。调整边缘标记避开左侧控件并关闭标牌雾效后，追踪专项双浏览器 **2 项再次通过**；已检查 1280×720 与 568×320 截图。

## 三种新敌人的移动图集（1.4.7）

参考岩甲的五方向图和规范化流程，将用户提供的三张 1280×256 五方向原图接入实际移动。原图与原始方向顺序保持不变，新增五张独立方向 PNG、同名方向元数据、README 和 `runtime.normalized.png`。图集规格与岩甲一致：五格 256×256，身体最高 200 像素，脚底固定 (128,240)，最近邻缩放，至少 16 像素透明留白；各朝向保留姿态比例，不拉伸。生成器扩展为六种敌人，使用 `python scripts/normalize-enemy-directions.py` 重现；`normalization.json` 保存原始来源 SHA256、单帧与原图一致性、透明边界和落脚点。

`src/enemy-directions.ts` 注册三条新方向图路径，复用现有 5 方向 + 左右镜像的 8 方向渲染。根据实际行走位移而非面向玩家切换，所以携宝兽逃跑时朝外，追击型晶屑虫/爆孢怪朝向玩家。静止保持上次朝向，受击不因外力倒着走，死亡沿用最后朝向并收缩消散。原有程序行走起伏、轻摆和压缩继续使用；本次未生成素材中不存在的逐帧步态。

显示大小仍为晶屑虫 1.15、爆孢怪 2.0、携宝兽 2.4，所有 AI、碰撞和奖励规则不改。方向图缺失时单独回退该敌人的原始静态 PNG；六种敌人仍是六个固定实例批次与六份纹理缓存，实例无独立纹理。

验证包括新敌人八个 GPU 方向各自不同、镜像映射、静止保持、真实追击/逃跑、受击亮度、死亡朝向和清理、三种图集分别失效回退，以及 844×390 / 568×320 方向排列。图集预览：`artifacts/enemy-direction-contact-sheet.png`；游戏内排列：`artifacts/new-enemy-directions-eight-844.png` / `-568.png`。

`npm run build` 通过。本轮 Chromium **31 项**、WebKit **31 项**，共 **62 项相关测试通过**，涵盖 `enemy-directions`、`enemy-motion-ui`、`enemy-motion-model`、`enemy-pixel`、`special-enemies-ui`、`treasure-tracking-ui`。来源 SHA256、30 个方向单帧内容、透明留白和落脚点审计均通过；旧三种敌人的规范化图集未发生变化。
