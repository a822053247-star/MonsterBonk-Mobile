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
