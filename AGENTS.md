# 开发入口

本项目为 TypeScript + Vite + Three.js 移动端 2.5D 游戏。

## 每次任务

1. 查看 `git status --short`，保留已有改动。
2. 按下表定位文件，用符号搜索读取相关片段；详细步骤见 `docs/CONTENT_DEVELOPMENT.md` 对应章节。
3. 实现后运行与改动相关的验证，按实测结果报告；接入点变化时同步更新本导航和接入指南。

## 玩法边界

- 正式模式：单幻兽、单摇杆、自动攻击、升级与融合；闯关最多三武器、六波挑战，第六波必须击败 Boss；无尽武器槽按累计波次开放，规则入口为 `RunBuild.configureWeaponSlots`。
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
| 波次/出怪 | `src/wave-director.ts`、`src/enemy-challenge.ts`、`src/combat.ts` 的生成路径 | `src/run-flow.ts`、`src/spawn-layout.ts`、`src/endless-roster.ts`、`src/endless-encounters.ts`；无尽60秒波长、四类名单/残留、十二类解锁/组合与方向；危险蓄力错峰见 `Combat.beginEndlessWarning`；Boss 共用攻击循环；无尽跨轮成长另见 `src/balance.ts` |
| 音效/音乐 | `src/audio.ts`、`src/audio-samples.ts`（实录素材/音量整理）、`src/sound-design.ts`（合成回退） | 捕捉/死亡触发见 `src/game.ts`；宝箱时序见 `src/treasure-dialog.ts` / `src/treasure-canvas.ts`；素材及许可见接入指南「Boolean 实录音效」 |
| 特效 | `src/visuals/vfx-presets.ts`、`src/visuals/vfx-resolver.ts` | 对应 `*-view.ts`、`src/quality.ts`；携宝兽宝箱见 `src/treasure-canvas.ts`、`src/treasure-presentation.ts`、`src/treasure-dialog.ts`、`src/special-enemy-view.ts` |
| 无限地图/地形卡顿 | `src/world.ts`、`src/infinite-world.ts`；接入指南「无限地图地形生成」 | `src/infinite-terrain.ts`、`src/infinite-terrain-baker.ts`、`src/infinite-terrain.worker.ts`；遗迹随机布景/图集/碰撞尺寸见 `src/ruins-props.ts` |
| 无尽地区/选路 | `src/endless-regions.ts`、`RunFlow.chooseRegion`、`World.setRegion`；扩展计划「第2批交付规则」 | `src/region-migration.ts` 处理新地形落点；`src/game.ts` 地区选择/加载门禁；`src/new-feature-test.ts` 提供观察、实战和Boss后选路预设 |
| 战斗碰撞/敌人拥挤卡顿 | `src/spatial-index.ts`、`src/combat.ts`、`src/navigation.ts`；接入指南「战斗空间索引」 | 地图障碍物变更通过 `World.revision` 使索引和导航缓存失效 |
| Boss 技能预览 | `src/boss-skills-preview.ts`、`boss-skills-preview.html` | 复用 `src/enemy-challenge.ts`、`src/combat-view.ts`；Boss环形弹幕见 `src/boss-barrage.ts` / `src/boss-barrage-view.ts` 与 `docs/BOSS_BARRAGE.md`；无尽变体技能表见 `src/endless-boss.ts`，首通宝箱见 `RunFlow.resolveBoundary` / `Combat.grantTreasure`；动画素材预览另见 `src/crownthorn-preview.ts` |
| 精英地震/躲避预览 | `src/elite-quake-view.ts`、`src/enemy-challenge.ts` | 演练专用调度在 `src/quake-drill.ts`；入口 `src/elite-quake-preview.ts`，说明见 `docs/ELITE-QUAKE.md` |
| 角色死亡过渡 | `src/death-transition.ts`、`src/game.ts` 的 `endRun` / `dying` 呈现分支 | `src/party-view.ts`（主角适配）、`src/style.css`（压暗/结果淡入）、`src/audio.ts`（死亡收尾）；见接入指南「角色死亡过渡」 |
| 界面/流程 | `src/ui.ts`、`src/game.ts`、`src/run-flow.ts` 的相关调用 | `src/style.css`、`src/shop.ts`、`src/upgrade-art.ts` |
| 无尽扩展/新功能测试 | `docs/ENDLESS_EXPANSION_PLAN.md`、`src/new-feature-test.ts`、`src/game.ts` 的 `featureTestId` 分支 | 每完成一项，同次交付可直接体验的测试场景及手动步骤；当前阶段按用户要求不运行代码测试或构建，具体约定见计划 |
| 无尽探索事件/武器置换 | `src/endless-exploration.ts`、`src/weapon-exchange-dialog.ts`；`RunBuild.exchange`、`Progression.previewWeaponExchange`、`RunShop.exchange` | `src/game.ts` 接地图交互和暂停；`src/exploration-view.ts` 绘制；出现规则与手动体验见扩展计划「第1批交付规则」 |
| 玩家独立弹幕 | `src/area-attacks.ts`（金色星雨）、`src/colored-barrage.ts`（蓝/绿/紫/粉） | `src/barrage-view.ts`、`src/colored-barrage-view.ts`、`src/progression.ts`；参数、错峰和验证见 `docs/COLORED_BARRAGES.md` |
| 无尽元素祭坛 | `src/endless-altar.ts`（每轮第3波可选事件）、`src/altar-trial.ts`（共用奖励/躲避） | `src/game.ts`（战斗冻结/恢复）、`src/infinite-world.ts` / `src/world.ts`（临时清理占地）、`src/item-test-altar-view.ts`、`src/altar-layout.ts`（绘制/碰撞共用轮廓）、`src/altar-character-layer.ts`（角色前景）；见接入指南「无尽元素祭坛」 |
| 道具测试入口/靶场/祭坛 | `src/item-test-mode.ts`、`src/item-test-altar-view.ts`、`src/altar-trial.ts`（奖励筛选/躲避试炼）、`src/game.ts` 的 `item-test` 分支 | `src/altar-trial-projectile-view.ts`（Boss 风格立体晶弹）、`src/ui.ts`、`src/item-test.css`；选择、等级切换及隔离规则见 `docs/CONTENT_DEVELOPMENT.md`「道具测试模式」 |
| 卡片主体大小/简短文案 | `src/card-art.ts`、`src/card-copy.ts`、`src/upgrade-art.ts` | 离线素材生成与固定布局入口见 `docs/CARD_ART_MANAGEMENT.md`；原图保留，运行时共用规范化图片 |
| 无尽成长/经济 | `src/balance.ts` 的 `buildExperienceThreshold`、`cycleHealth`、`cycleFuelHealth`、`cycleBossFrequency`、`endlessShopPrice` | `Progression.endless` / `RunFlow.prepare`、`src/shop.ts`；区间收入与最近12店记录见 `RunFlow.inspect().economy`，静态预算见 `docs/ENDLESS_LONG_RUN_CALIBRATION.md` |

## 阅读与验证

- GitHub Pages发布：见`docs/PUBLISHING.md`；在线站点使用`gh-pages-iphone`分支，推送`main`本身不发布网页。用户明确要求上线可玩时可执行必要生产构建和定向发布验证；`npm run publish:pages`从已提交main构建/打包并正常推送发布分支。正式构建隐藏测试/旧版入口，最高2倍速。

- 搜索默认聚焦 `src/`、`tests/`、`scripts/`；历史报告、截图和生成目录在需要复现或查基线时读取。
- README 包含历史玩法说明；当前规则优先核对运行代码。数值从源码查找，导航不复制数值表。
- 测试选择、平衡脚本与需求模板见 `docs/CONTENT_DEVELOPMENT.md`。文档变更检查引用和差异；代码变更构建并运行相关测试，共享机制改动扩大回归。
- `npm run content:check` 当前检查遗物工厂，不能据其通过声称新敌人/武器已完整接入。
- 工具输出保留摘要与失败详情，完整日志按需落盘。最终说明改动、验证及未解决问题。


战斗捕捉/幻兽囚坊：`src/enemy-capture.ts`、`src/capture-hud.ts`、`src/capture-collection.ts`、`src/prison-view.ts`、`src/prison-scene.ts`；完整接入、规则和验证见 [CAPTURE_PRISON.md](docs/CAPTURE_PRISON.md)。可捕捉刷出概率与用户历史见 `src/capture-spawns.ts` / `src/capture-rules.ts`。正式闯关/无尽中抽中资格的个体40%血量转可捕捉并免伤（`Combat.isCaptureReady` / `src/capture-rules.ts`），可捕捉敌人不伤害角色，封印符无限，靠近E与点击封印；小游戏合格/优秀判定、不合格重试与加成见 `src/enemy-capture.ts`，界面见 `src/capture-hud.ts`；最终成功或失败均离场，成功永久收藏接局外劳作，囚坊同种入住数量受实际捕获数量限制；旧模式不启用。

宝箱特效独立预览：treasure-preview.html / src/treasure-preview.ts，复用正式 TreasureDialog，支持1–5件切换及重播。

可捕捉幻兽的放大与闪光：`src/capture-visuals.ts` 提供视觉缩放和慢速闪亮参数，`src/combat-view.ts` 接入身体、闪点和血条，`src/capture-hud.ts` 同步头顶标记高度。

永恒雪原：`src/snowfield-props.ts` 共用16种障碍物图集裁切、显示尺寸和碰撞半径；`src/infinite-terrain.ts`生成雪岸/冰原与连通留白；`src/infinite-world.ts`共用实例图集和遮挡淡化。测试入口 `region-snowfield` / `region-snowfield-combat`，正式无尽Boss后可选第三地区；实现记录及素材来源见 `docs/ETERNAL_SNOWFIELD_DESIGN.md` 末节。本批沿用不运行测试、类型检查或构建的约定。

正式无尽起始地区：`src/ui.ts` 的 `#endless-start-region` 与 `Game.start`，可直接选草甸/遗迹/雪原；测试预设不读取菜单选择。晶石遗迹新版古道/残坛几何在 `src/endless-regions.ts` 的 `ruinsRoad/ruinsCourtDistance`，地面绘制与障碍物留白共用；8种图集物件均为障碍，详见 `docs/CRYSTAL_RUINS_REDESIGN.md`。

熔岩火山：第四地区 `volcano`，正式起始地区/Boss后选路及 `region-volcano` / `region-volcano-combat` 均已接入。`scripts/import-volcano-atlas.ps1`按原RGBA分割22件并导出图集及`src/volcano-art.ts`；`src/volcano-props.ts`共用锚点、足迹和通路约束，双残柱两足迹；`infinite-terrain.ts`生成玄岩/灰烬与岩岛，`infinite-world.ts`按脚点摆放。素材校验不等同游戏验证，仍沿用当前不运行测试/构建的约定；交付见`docs/LAVA_VOLCANO_DESIGN.md`第8节。

遗迹/火山地面锯齿与配色：`infinite-terrain.ts`的`ruinsGroundColor`、`volcanoGroundColor`、`smoothRegionGround`；`infinite-world.ts::configureTexture`只对这两区地面启用线性/mipmap过滤，不修改角色或障碍图集。`putImageData`忽略Canvas变换，Worker路径需显式翻转像素行。火山已按新反馈改为大面积赤红熔焰地貌；详见火山设计第9节与接入指南。

遗迹清晰度后续修订：遗迹在`smoothRegionGround`启用逐纹素直接采样，窄AA道路与石缝细节；仅使用普通线性过滤，取消遗迹mipmap。火山保留格点插值/mipmap。以接入指南和遗迹重做记录的“清晰度二次修订”为准。

最新清晰度修订：火山也已切为逐纹素直接采样/普通线性过滤，取消其mipmap，收紧熔流与岩道柔边并增加岩壳颗粒。两区当前均不使用颜色格点插值/mipmap；上述“火山保留”是历史记录，详见接入指南及火山设计末节。

遗迹平整度最新修订：`ruinsRoadDistance`改为直路，`ruinsCourtDistance`改为方庭切比雪夫距离；取消道路/砖缝扭曲、圆环与不规则浮叠石片，采用直线错缝铺装。视觉和障碍留白共用该几何，历史曲折圆坛方案已覆盖。

遗迹当前矿场方向：`ruinsGroundColor`改为矿地、双轨枕木、装卸空地、车辙及矿脉，替代上述砖缝铺装。轨道按世界坐标绘制，仅地面装饰；保留直路/方形禁入区及原8物件碰撞，主地标更偏晶簇矿岩。地区名和ID不变，正式及观察/实战入口均沿用。

遗迹最新参考图方向：已以青灰方石、中央晶纹、对称残柱/晶簇/符文石替换矿场轨道。`ruinsGroundColor`管地面，`layoutSteps`按16单位象限归属布景；最多48候选/块，仍用原64实例容量。中央方形留白半边长4.8，主通路半宽4.2，原点半径8安全检查保持。参考图与说明见遗迹重做记录最新条目。

火山最新参考图方向：`volcanoGroundColor`改为暗红方石/熔缝/中央火晶，`layoutSteps`按16单位象限布置对称熔柱、符文石和火焰座，最多64候选/块，未扩大实例上限。`volcanoPassageDistance`现以32n石庭为中心、保留直路和中央方形禁入区。旧随机岩岛/大面积噪声熔原外观已覆盖，详见火山设计第9节最新条目。

火山最新氛围反馈：`volcanoCourtTheme`按绝对庭院坐标控制主题与镶嵌，只选一个角部布置最多1主景+1可选小配景，取消上述填满四角的陈列；部分庭院完全留白，普通主题不画中央火晶。目的为疏密和火山氛围，22素材不强求全部出现，详见火山设计最新反馈。
