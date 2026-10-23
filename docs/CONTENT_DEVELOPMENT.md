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

## 局外栖地

局外栖地已作为纯 DOM/CSS 页面实现，与战斗模拟及 GPU 对象池隔离。主要接入点：

| 接入内容 | 当前入口 | 约束 |
|---|---|---|
| 数据与存档 | `src/sanctuary.ts`：`readSanctuary`、`upgradeSanctuary`、`recordSanctuaryRun` | `monsterbonk:sanctuary:v1` 独立于局内金币、战斗数值和无尽纪录；版本校验、异常回退与单局 ID 去重 |
| 栖地界面 | `src/sanctuary-ui.ts`、`src/sanctuary.css` | `sanctuaryMarkup` 创建三个区域；`renderSanctuary` 显示等级和花费；横屏低高度可滚动；无需另开 WebGL |
| 主菜单入口 | `src/ui.ts`、`src/game.ts::bindEvents` | `#open-sanctuary` / `#close-sanctuary` 仅在主菜单可操作，Escape 关闭，键盘焦点不泄漏 |
| 正式局结算 | `src/game.ts::start / endRun` | 每次开始生成唯一单局 ID；仅正式闯关与无尽挑战按已完成波次结算；旧编队、试炼不发奖 |
| 结算提示 | `src/ui.ts`、`src/sanctuary-ui.ts::renderSanctuaryReward` | 未获得时隐藏；奖励仅改变局外光屑，绝不改 `RunBuild`、武器槽、伤害、六波流程 |

当前初始赠送 3 光屑；三个区域各有 3 阶、花费依次为 3/5/7。首次超过该模式历史最高已完成波次，每新增一波额外获得 2 光屑（单局最多按 6 波计算）；完成至少两波时每两波提供 1 光屑基础回报（最多 3）。零完成波次不给奖励。跨模式最佳波次分别保存，单局 ID 最多缓存 32 条用于防重复；浏览器拒绝持久化时不显示虚假的获得或建设成功。该资源纯装饰，不等同于本局金币或真实货币。

验证：`npx playwright test tests/sanctuary.spec.ts --project=chromium`，横屏 UI 以及 WebKit 需加跑 `--project=webkit`；代码改动还须 `npm run build`。新增研究所、图鉴、跨设备云存档尚未实现。

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
