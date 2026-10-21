# 遗物内容工厂 V1

本阶段在 `feat/relic-content-factory-v1` 上开发，基于第一阶段提交 `65239ae`。没有修改六波时长、敌人数值、刷新规则、商店定价、稀有度抽取概率或蒸汽表现。

## 已接通的链路

`src/content/relics/tide-prism.ts` 是潮涌棱镜内容的唯一来源。注册表校验后生成现有 `RELICS` 与 `SkillId` 成员、奖励卡片文案、美术和商店候选。`Progression` 和 `RunShop` 继续处理抽取、选择、购买和唯一持有。原有 13 件遗物仍由原逻辑结算，没有迁移其触发式效果。

配置中的 `multiply` 是注册的数值处理器，只能操作四种已知倍率。目标和可选机制/元素标签、前置条件共同决定作用范围。处理器修改原有 `resolveAttackRules` 的本次攻击快照，实际冷却、射程、伤害与碰撞继续走 `Combat`，没有第二套结算管线。V1 范围目标为 `water-area`，只匹配已经拥有真实范围机制的水泡攻击。

潮涌棱镜需要已装备水泡弹且学会范围扩张，正式模式升级与第五波商店才会将其列为合法内容。获得后，深海泡影的真实半径从 1.8 变为 2.25，水泡弹间隔从基础 0.62 变为 0.682 秒（其他攻速与槽位系数照旧）。不会改变直接命中伤害，也不会为普通水泡凭空添加范围伤害。火花、飞叶与火焰横扫的规则不变。获得一次后现有等级上限和持有检查排除重复奖励；重开清空。

蓝色 `tidal-ring` 是已注册的命中特效配置，通过攻击快照绑定到真实水系命中事件。半径来自同一事件的实际范围，沿用 `ReactionView` 的 48 个实例槽与已有图集，无专属渲染类。低画质关闭其装饰粒子，保留蓝色波纹；图集失败仍能显示几何轮廓。

## 图标与卡片

整数像素 SVG 由符号、元素配色与装饰层确定性生成，无文字烘焙、网络生成服务或新依赖。当前提供棱镜/圆珠两种符号和水/火/草三套配色。生成图直接用于现有卡片及商店，保留原有羊皮纸、宝石、弧形中文标题、正负效果和等级展示。可选 `art.png` 使用相对于 `BASE_URL` 的 `assets/...png` 路径，加载失败退回同配置的生成图标。`content:check` 同时输出可用静态 SVG 到 `public/assets/generated/relics/`。

## 新增下一件同类遗物

1. 在 `src/content/relics/` 新增一个符合 `RelicDefinition` 的配置文件，声明 ID、名称、前置条件、正负倍率、图标配置、已有 VFX 和奖励开关。正负效果说明由倍率与目标自动生成，不需要重复填数值文案。
2. 在 `src/content/relic-registry.ts` 导入并添加到 `DEFINITIONS`。由该数组推导 `FactoryRelicId → RelicId → SkillId → SkillRanks`，无需再编辑 ID 联合类型。
3. 运行 `npm run content:check`、构建与内容测试。若使用专属 PNG，将实际文件放到 `public/assets/` 并在配置中引用；否则无需新增素材。

不需要修改 `ui.ts`、商店模板、`UPGRADE_ART` 手工映射、战斗分支或 Three.js 渲染类。测试中的 `test-water-orb` 仅通过配置完成注册、文案/图标生成和伤害/射程处理器调用，没有进入正式注册表或玩家卡池。新的机制处理器、目标类型或特殊稀有度不属于“同类遗物”，应另行实现与测试，不能用任意代码绕过校验。

## 校验与复现

- `npm run content:check`：检查重复/保留 ID、武器/技能/标签引用、倍率与正负方向、处理器与目标、命中 VFX、图标/PNG 路径及资源、卡片元数据和正式模式限制。失败输出具体 ID 与原因并非零退出。
- `npm run content:check -- --file path/to/content.json`：用同一校验器检查外部 JSON 数组；非法内容不会生成图标。
- `npx playwright test tests/content-factory.spec.ts tests/content-factory-ui.spec.ts`：合成配置、非法配置/命令、边界碰撞、冷却、前置条件、唯一持有、旧模式隔离、真实升级与第五波商店、图标加载与回退、手机横屏、暂停/恢复/重开、满池与预警。

真实界面测试使用 `Game`、原有 UI 事件、实际 `Progression` 抽取、第五波边界与 `RunShop` 购买、实际弹体飞行和碰撞。为复现而固定 RNG、摆放敌人和推进时间；不会注入伪造奖励卡片、替换候选池或合成游戏画面。第五波截图通过确定性推进边界获得，不代表人工打完整五波。

截图在 `artifacts/content-factory/`：`upgrade-*`、`shop-*`、`build-*`、`flight-*`、`impact-*`、`expanded-*`；568×320 为省电画质，844×390 为高画质。商店与构筑面板按现有滚动布局滚入目标商品/遗物后截图。`runtime-*.json` 记录实际半径、绑定、命中、可见像素和重开状态，`budgets-warnings.json` 记录满池及攻击预警保留像素。所有 PNG 来自实际 WebGL/DOM 渲染。

## 基线与回归记录

修改前构建成功，49 项相关 Chromium 测试通过。独立源码快照的全量测试：1011 通过、28 失败、9 个原有条件跳过，见 `artifacts/content-baseline-full-tests.txt`。第一阶段记录的全量失败为 31 项，后续串行复验为 27 项；本阶段使用新测得的 28 项名单逐项对照，不以第一阶段旧统计代替当前基线。

武器平衡结果与基线 SHA256 完全相同：`4CF3FAEB912F02BA803DDADEE463928B53AEFE5361F6430BB110F74F9D2B9530`。独立波次模拟 36 场中 35 场完全相同；水系 focused 第 5 波先选择 chain、area 后，新增合法奖励改变后续抽取，从 shockwave 变为 movement，因此该场结果发生变化（击杀 92 → 91，结尾生命 42 → 36）。该场未获得潮涌棱镜，是奖励候选列表变化产生的构筑差异；未改动基础战斗数值。完整结果分别在 `content-baseline-waves.json` 与 `content-waves.json`，不将脚本通过等同于玩家胜率不变。

最终全量及 campaign 对照结果见 `artifacts/content-validation.md`。

Campaign 45 场中 33 场逐字段相同，12 场因合法候选和后续构筑改变而不同。脚本结果为基线 14 won / 31 lost，本次 12 won / 32 lost / 1 fighting，不能据此声称玩家胜率不变。独立控制复验使用本次战斗代码，仅在模拟中于洗牌前排除新工厂奖励：36 场波次以及全部 12 场变化的 campaign 均精确恢复基线（`artifacts/content-legacy-catalogue-control.json`）。这将差异定位到了内容候选变化；正式模式仍保留新增遗物，没有为使平衡结果相同而屏蔽正式内容。
