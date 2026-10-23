# 开发入口

本项目为 TypeScript + Vite + Three.js 移动端 2.5D 游戏。

## 每次任务

1. 查看 `git status --short`，保留已有改动。
2. 按下表定位文件，用符号搜索读取相关片段；详细步骤见 `docs/CONTENT_DEVELOPMENT.md` 对应章节。
3. 实现后运行与改动相关的验证，按实测结果报告；接入点变化时同步更新本导航和接入指南。

## 玩法边界

- 正式模式：单幻兽、单摇杆、自动攻击、最多三武器、升级与融合、六波挑战；第六波必须击败 Boss。
- 角色保持非人形身体比例；近战以自动元素横扫/弧光表现。新功能以本次需求为范围。
- 已实现行为以当前源码与测试为准。`docs/GAME_SYSTEM_CATALOG.md` 是机制索引，按任务读取相关条目；其中 `DESIGN_LOCKED` / `PROPOSED` / `OPEN` 不能直接视作已实现或本次开发范围。
- 正式规则和历史编队、犄角试炼等模式有兼容边界；调整共用逻辑时验证双方。
- 战斗模拟使用固定步长和秒数，暂停冻结、重开清空；延续对象池和共享 GPU 资源的方式。

## 按任务导航

| 任务 | 先读 | 涉及联动时再读 |
|---|---|---|
| 新敌人 | `src/combat.ts` 的 `EnemyKind`、`ENEMY_TYPES`、`spawn` 及相关更新分支 | `src/wave-director.ts`、`src/enemy-challenge.ts`、`src/special-enemies.ts`；素材入口见接入指南 |
| 新武器 | `src/fusion.ts` 的 `BaseAttackId`、`src/run-build.ts` 的 `ATTACKS` / `RunBuild` | `src/progression.ts`、`src/relics.ts`、`src/content/weapon-traits.ts`；接入指南列出奖励与显示入口 |
| 新遗物 | `src/content/relic-registry.ts`、一个同机制的 `src/content/relics/` 定义 | `src/content/content-types.ts`、`src/content/relic-effects.ts`；工厂说明见 `docs/relic-content-factory-v1.md` |
| 融合 | `src/weapon-pair-fusion.ts`、`src/run-build.ts`；技能触发融合另见 `src/fusion.ts` | `src/relics.ts`、`src/content/weapon-traits.ts`、`src/combat.ts` |
| 波次/出怪 | `src/wave-director.ts`、`src/enemy-challenge.ts`、`src/combat.ts` 的生成路径 | `src/run-flow.ts`、`src/spawn-layout.ts`；Boss 共用攻击循环；无尽跨轮成长另见 `src/balance.ts` |
| 特效 | `src/visuals/vfx-presets.ts`、`src/visuals/vfx-resolver.ts` | 对应 `*-view.ts`、`src/quality.ts`；携宝兽宝箱见 `src/treasure-canvas.ts`、`src/treasure-presentation.ts`、`src/treasure-dialog.ts`、`src/special-enemy-view.ts` |
| 无限地图/地形卡顿 | `src/world.ts`、`src/infinite-world.ts`；接入指南「无限地图地形生成」 | `src/infinite-terrain.ts`、`src/infinite-terrain-baker.ts`、`src/infinite-terrain.worker.ts` |
| 战斗碰撞/敌人拥挤卡顿 | `src/spatial-index.ts`、`src/combat.ts`、`src/navigation.ts`；接入指南「战斗空间索引」 | 地图障碍物变更通过 `World.revision` 使索引和导航缓存失效 |
| Boss 技能预览 | `src/boss-skills-preview.ts`、`boss-skills-preview.html` | 复用 `src/enemy-challenge.ts`、`src/combat-view.ts`；动画素材预览另见 `src/crownthorn-preview.ts` |
| 精英地震/躲避预览 | `src/elite-quake-view.ts`、`src/enemy-challenge.ts` | 演练专用调度在 `src/quake-drill.ts`；入口 `src/elite-quake-preview.ts`，说明见 `docs/ELITE-QUAKE.md` |
| 界面/流程 | `src/ui.ts`、`src/game.ts`、`src/run-flow.ts` 的相关调用 | `src/style.css`、`src/shop.ts`、`src/upgrade-art.ts` |

## 阅读与验证

- 搜索默认聚焦 `src/`、`tests/`、`scripts/`；历史报告、截图和生成目录在需要复现或查基线时读取。
- README 包含历史玩法说明；当前规则优先核对运行代码。数值从源码查找，导航不复制数值表。
- 测试选择、平衡脚本与需求模板见 `docs/CONTENT_DEVELOPMENT.md`。文档变更检查引用和差异；代码变更构建并运行相关测试，共享机制改动扩大回归。
- `npm run content:check` 当前检查遗物工厂，不能据其通过声称新敌人/武器已完整接入。
- 工具输出保留摘要与失败详情，完整日志按需落盘。最终说明改动、验证及未解决问题。
