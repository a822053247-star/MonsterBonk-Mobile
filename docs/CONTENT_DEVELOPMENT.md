# 内容开发接入指南

用途：新增敌人、武器、遗物时按对应章节定位和验收。本文描述当前接入方式，注册表统一化仍是后续优化方向。

## 使用顺序

1. 明确内容 ID、参考对象、行为差异、获得/出场方式和验收条件。
2. 读取对应章节及源码符号，列出本次实际涉及的接入点。表格是核对清单，按适用范围修改。
3. 优先复用现有机制；全新行为明确触发顺序、伤害来源、递归/次数上限和池满策略。
4. 完成相关测试及必要的真实界面验证，更新系统总档案对应条目。接入路径改变时同步本文。

## 新敌人

| 接入内容 | 当前入口 / 搜索符号 | 需要核对的事项 |
|---|---|---|
| 身份和属性 | `src/combat.ts`：`EnemyKind`、`ENEMY_TYPES` | ID、碰撞半径、血量、伤害、经验；正式模式在 `spawn` 等路径有覆盖值 |
| 行为与状态 | `src/combat.ts`：`Enemy`、`spawn`、更新/死亡/重置路径 | 复用已有追逐/冲刺/死亡机制；新增状态在槽位复用时初始化和清理 |
| 独立机制参数 | `src/special-enemies.ts`、`src/grass-blob.ts` | 同类机制优先参考；Boss/精英另查 `src/enemy-challenge.ts` |
| 正式出场 | `src/wave-director.ts`：`DirectorEscort`、`WAVE_DIRECTOR`；`src/combat.ts` 生成路径 | 区分背景、护卫、独立事件；检查种类上限及总存活上限 |
| 基础素材与缓存 | `src/pixel-sprite.ts`：`PIXEL_ENEMY_ASSETS`、`PixelAssetId`、`PixelTextureCache` | 素材键通常为 `enemy-${kind}`，路径相对像素资源根目录 |
| 方向图集 | `src/enemy-directions.ts`：`ENEMY_DIRECTION_ASSETS`、布局和帧映射 | 仅新增/更换方向图时处理；沿用真实图集布局 |
| 行走与显示 | `src/enemy-motion.ts`：`ENEMY_MOTION`；`src/enemy-pixel-view.ts`：`ENEMY_PIXEL_HEIGHTS` | 显示尺寸和碰撞尺寸分别核对；朝向、受击、死亡表现 |
| 场景显示 | `src/combat-view.ts`；特殊表现另查 `src/special-enemy-view.ts` | 可见性、加载失败、低画质和资源释放 |

验收覆盖本次新增行为，并核对：出生预警期间的受击规则、接触伤害、死亡奖励只结算一次、暂停冻结、重开和槽位复用无残留。涉及范围技能时检查预警与实际命中范围一致；涉及出怪时检查上限。

Boss 闯关/无尽共用 `CAMPAIGN_BOSS` 的弹幕、冲锋与攻击循环；无尽生命成长由跨轮倍率控制。`EnemyChallenge.beginWave` 的模式标记仍区分精英地震路径。冲锋模拟与预警共用 `EnemyChallenge.dashDuration`，调整距离时保持两者一致。

平衡数值入口：`src/balance.ts` 管理正式构筑射程/范围上限、弹体尺寸、槽位间隔、经验和跨轮生命公式；武器基础值在 `ATTACKS`，成长由各武器 stats 函数提供。`upgradePreview` 的第三参数用于选择正式/历史属性预览，界面传入当前构筑模式。

实际 Boss 技能预览入口为 `boss-skills-preview.html`（`src/boss-skills-preview.ts`），直接复用闯关 Combat 与显示，可选完整循环/单技能、普通/狂暴、慢放/暂停/逐帧。固定目标无敌且不自动攻击，仅用于观察；`crownthorn-preview.html` 仍是纯素材动作预览。预览验证见 `tests/boss-skills-preview.spec.ts`。

## 新武器

| 接入内容 | 当前入口 / 搜索符号 | 需要核对的事项 |
|---|---|---|
| 身份与基础数值 | `src/fusion.ts`：`BaseAttackId`；`src/run-build.ts`：`ATTACKS` | 当前 ID 联合类型仍需维护；确认弹体或近战范围机制 |
| 装备与成长 | `src/run-build.ts`：`RunBuild`；`src/relics.ts`：`WEAPON_DAMAGE_PER_LEVEL`、`resolveAttackRules` | 三槽、等级上限、槽位冷却系数、实际攻击快照；部分成长映射也在 `RunBuild.rules` |
| 能力与遗物兼容 | `src/content/weapon-traits.ts`：`TAGS`、`weaponCapabilities`；`src/content/relic-registry.ts`：`createRelicRegistry` | 元素/弹体/近战等标签、来源继承；注册表默认武器引用列表仍为手工维护 |
| 升级候选 | `src/progression.ts`：`SkillId`、`WEAPON_CARDS`、技能定义和候选过滤；`src/content/content-types.ts`：`CONTENT_SKILLS` | 获得、升级、满级、满槽、被融合消耗后的过滤；文案符合实际成长 |
| 商店和卡片 | `src/shop.ts`、`src/upgrade-art.ts` | 现有候选生成是否覆盖新卡；价格、图标路径及缺图回退 |
| 攻击结算 | `src/combat.ts`：攻击调度、弹体更新、命中及重置；近战参考 `src/flame-sweep.ts` | 实际碰撞、一次攻击次数、伤害来源、池满策略 |
| 攻击显示 | `src/combat-view.ts`、对应 `*-view.ts`、`src/visuals/` | 特效与真实范围同步；低画质和共享资源 |
| 融合（需求涉及时） | `src/fusion.ts`、`src/weapon-pair-fusion.ts`、`src/run-build.ts` | 区分技能触发融合与双武器融合；核对来源、能力标签和遗物触发继承 |
| 起始武器（需求涉及时） | `src/party.ts`：`CREATURES`；`src/game.ts` 的开局路径 | 只有改变幻兽起始配置时才修改 |

验收覆盖获得→装备→升级→实际伤害/冷却→暂停→重开。检查满三槽和满级过滤；涉及融合/遗物时验证真实结算。新增武器会扩大奖励候选池，即使旧武器数值不变，也可能改变固定种子的后续构筑。

## 新遗物

同机制内容参考 `src/content/relics/` 中的定义，在 `src/content/relic-registry.ts` 注册。字段与处理器范围见 `src/content/content-types.ts`；详细工厂流程见 [遗物内容工厂](relic-content-factory-v1.md)。新行为需扩展对应战斗处理器，配置校验通过不代表行为已完成。

## 无限地图地形生成

`src/world.ts` 管理地图选择与加载状态；`src/infinite-world.ts` 管理当前 3×3 区块、移动方向预生成、队列优先级和 GPU 资源复用。资源就绪与区块就绪分开：仅启用无限地图后启动任务，当前可见区域（带出怪边距）及玩家附近 29 单位的区域就绪后即可继续战斗，其余外围区块在后台补齐。常见视口从原点进入时只需先生成中心 1 块；超宽视口按实际覆盖区域等待。

`src/infinite-terrain.ts` 是地形采样、装饰布局和绘制的共享实现，不依赖 DOM 或 Three.js 运行时代码。`src/infinite-terrain.worker.ts` 使用 OffscreenCanvas 绘制并转移 ImageBitmap；`src/infinite-terrain-baker.ts` 管理单任务 Worker，以及能力缺失、启动失败、任务报错或超时时的主线程切片回退。回退按采样行/装饰项让出执行权，每帧一次切片，以 3ms 为软预算。

保持每个动画帧最多挂载一个区块；`Game` 通过 `createWorld` 的纹理准备回调，在挂载时调用 `renderer.initTexture` 分散地面纹理上传。主循环中的 `world.update` 只调整需求和队列，并传入相机实际覆盖范围。地形任务与场景图集加载并行，挂载才需要图集就绪。提前准备移动方向约 24 单位外的邻域，可见/活动区域优先于外围区块，外围区块优先于前方预生成。快速转向时允许当前任务完成，过期结果释放位图；切换模式、换种子或销毁才取消任务。替换区块就绪后才回收一个已离开邻域的旧区块，常规视口最多保留 9 个挂载槽；超宽视口按所需区域扩展。替换或销毁地面纹理时释放它持有的图像。Worker 位图已翻转 Y，主线程 Canvas 回退保留纹理的默认翻转，修改绘制时保持这两个路径一致。

`Game.step` 和帧循环仅在当前可见/活动区域未就绪时暂停战斗与移动结算，并保留最近一次完整画面。全屏加载仅用于进入本局前；运行中的罕见等待使用 `.world-loading.streaming` 小提示，地图组保持可见，后台补齐外围区块不触发全屏遮挡。异步结果挂载通过回调更新 `World.revision` 与共享障碍物数组，恢复后的战斗使用新版本碰撞/导航数据。

## 战斗空间索引

`src/spatial-index.ts` 提供以世界坐标分桶的宽阶段查询。敌人索引保存对象池槽位，查询结果按槽位排序；大半径目标通过范围扩展参与候选，不依赖固定九宫格。桶、列和查询数组复用；跨越大量空格的大范围查询回退为一次线性扫描。精确圆形/线段检测和命中排序由调用者保留。

`Combat.update` 用 `try/finally` 限定动态索引有效期，在步开始和敌人移动阶段开始时同步位置。出生、精英/Boss 半径赋值、移动、击退和边界修正更新对应槽位；查询过滤当前 active 状态。外部预览在逻辑步之外直接安排位置后，下一次查询会重新建立索引。涉及同一步内的新位移入口时，通过 `moveEnemy` 更新，或显式同步槽位。

已接入敌人避让、移动障碍物滑动、寻敌、子弹扫掠、追踪子弹、连锁选敌，以及爆裂火种、水泡扩散和双武器融合溅射。范围伤害使用可嵌套的候选缓冲池，避免死亡连锁覆写外层查询。其他技能独立模块仍可按相同方式逐步接入，不能据此声称所有敌人遍历都已移除。

战斗和 `GroundNavigation` 共用静态 `ObstacleIndex`，地图障碍物引用或数量变化会重建，同数量的内容变更须通过 `World.revision` / `navigation.invalidate` 通知。导航缓存格子间的双向通行连接，玩家换目标格时复用，地图变化或导航窗口平移时清空。无限地图仅调整前方预生成计划时不增加碰撞版本，避免触发无用导航重建。

## 开局素材就绪

`Game.sceneLoading` 统一管理地图等待和本局开场素材等待。像素模式通过角色、敌人视图的 `startupSettled`，以及 HUD 头像和基础弹体的加载状态放行；等待期间暂停逻辑步、计时和输入。角色检查包括已启用的动画图集，敌人检查包括已请求的基础敌人图集，避免战斗已开始后再从占位外观切到正式素材。

素材成功或明确失败后结束等待，失败沿用既有备用显示。开场完成后不再用素材状态暂停战斗，后续地图流式等待仍由 `World.loading` 控制。新增开局必需素材时接入视图就绪条件，不以固定延时或 `ready` 的占位捷径代替真实加载状态。

## 按改动选择验证

以下为已有测试入口，按本次涉及的行为选择并补充有效用例；文件名不表示其已覆盖未来新增内容。Playwright 默认运行 Chromium 和 WebKit，首次定向排查可使用下列 Chromium 命令；共享逻辑和兼容性改动扩大到相关双浏览器测试。

| 改动范围 | 优先验证入口 |
|---|---|
| 敌人基础战斗 | `npx playwright test tests/combat-model.spec.ts tests/special-enemies.spec.ts --project=chromium` |
| 出怪/波次 | `npx playwright test tests/wave-director.spec.ts tests/perimeter-spawning.spec.ts tests/enemy-challenge.spec.ts --project=chromium` |
| 敌人显示 | `npx playwright test tests/enemy-directions.spec.ts tests/enemy-motion-model.spec.ts tests/special-enemies-ui.spec.ts --project=chromium` |
| 武器/卡池/遗物 | `npx playwright test tests/three-weapon.spec.ts tests/progression.spec.ts tests/content-factory.spec.ts --project=chromium` |
| 武器界面 | `npx playwright test tests/three-weapon-ui.spec.ts tests/content-factory-ui.spec.ts --project=chromium` |
| 双武器融合 | `npx playwright test tests/weapon-pair-fusion.spec.ts tests/weapon-pair-fusion-ui.spec.ts --project=chromium` |
| 遗物工厂配置 | `npm run content:check`（会写入生成图标；当前仅检查遗物） |
| TypeScript / 生产构建 | `npm run build`（代码变更后执行） |
| 武器伤害/成长 | `npm run balance:weapons` |
| 出怪压力/波次 | `npm run balance:waves` |
| 奖励池/整局构筑 | `npm run balance:campaign` |

平衡脚本输出是模拟结果，判断变化需对照基线；不能直接推断真实玩家胜率。现有历史报告的失败数和耗时不代表当前状态，遇到失败先在同环境复验，记录是否与本次改动有关。

界面或美术变更使用实际运行画面核对手机横屏、低画质、缺图回退及攻击预警。复现时固定随机源、敌人位置和装备等级，优先参考现有 UI 测试的 Game/Combat 驱动方式。文档变更仅检查引用与差异，不触发游戏全量测试。

## 需求模板

```text
类型 / ID / 名称：
参考内容：复用哪个现有敌人、武器或遗物
行为差异：触发条件、效果、作用对象、叠加与次数上限
数值：明确新值，其余注明沿用参考内容或允许实现者确定
出场 / 获取：波次、数量限制，或升级/商店/起始配置
成长 / 联动：武器等级、融合、遗物兼容；无则注明
素材：已落库路径，或先复用的素材/程序化表现
验收：可观察结果，以及暂停、重开和上限行为
```

## 后续架构优化（尚未实现）

下次新增同类内容时，按实际重复点提取敌人定义、武器定义与复用行为。先迁移一个已有内容并保持行为，再接入新内容；以减少重复映射为目标，沿用现有战斗结算与对象池。是否扩大迁移范围按任务决定，避免仅为整理文件引入全量重构。
