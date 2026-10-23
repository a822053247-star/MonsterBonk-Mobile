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

闯关与无尽第6波共用 `CAMPAIGN_BOSS`；无尽第12波起用 `src/endless-boss.ts` 的变体技能表，仍走 `EnemyChallenge` 的同一状态机、伤害及死亡路径。无尽生命成长由跨轮倍率控制。`EnemyChallenge.beginWave` 的模式标记仍区分精英地震路径。冲锋模拟与预警共用 `dashDuration` / `dashSpeed`，预警宽度使用实体实际碰撞半径。

无尽第三批（2026-10-23）：`endlessBossDefinition` 在第12/18/24波分别选择熔果暴君/晶甲重炮王/霜绒巨兽，之后依次轮换，不连续重复；第30波起偏移技能表起点。模型复用对应普通怪五向图，显示与碰撞均放大2倍，保留Boss rank独立类别、6000基础生命及现有跨段倍率、接触/冲锋24伤害、敌弹12伤害；普通怪远程/冲锋逻辑按rank排除，不叠加到Boss上。暴君滚冲与扇形弹交替，半血双滚冲；重炮王连续重新锁向炮击，半血扩大弹数并交替偏转扇面；霜绒滑冲后震地，半血追加错时侧向震地。每次主动作都有独立预警和1.5秒恢复；第60秒加时仍强制半血技能表。震地预警1.3秒、半径与既有精英地震一致、20伤害且仅影响一次，复用 `EliteQuakeView` 与 `hitPlayer`，不新增冰面或控制。Boss死亡/清场/重开重置预警、落点与特效，GPU实例在视图生命周期释放。`inspect().boss` 提供名称与原型，HUD和开场公告跟随实际Boss。

首通宝箱：`RunFlow.resolveBoundary` 等第6波Boss死亡演出及所有边界升级选择处理完，再执行一次波次奖励/清场，然后调用 `Combat.grantTreasure`。3/4/5件概率25%/50%/25%，只在该局第6波发放一次，不增加携宝捕获数/刷新券或免费满血。逐件重查 `canGrant`，首件优先已装备武器或已有等级技能、其次通用构筑支持；优先不同ID，无未用ID时允许合法重复强化，无合法奖励则每件12金币。普通携宝宝箱也复用该授予函数，保留原数量分布、不重复规则和金币/经验结算。首通奖励标记 `source:'first-boss'`；现有 `TreasureDialog` / `treasure-canvas` 负责全屏金光、音效、图标与显式继续，`RunFlow.updateRest` 同时阻止未关闭宝箱推进。事件在清场之后创建，防止被清场吞掉；倒计时、战斗模拟冻结，动画沿用界面时间及现有暂停/竖屏约束。第三批按用户要求未运行测试，生产构建单独检查。

无尽出怪第一批：`src/endless-roster.ts` 定义四类入场名单与存活种类约束，`RunFlow.prepareRoster` 每波只抽选一次；草团、晶屑、携宝兽各占一类，精英/Boss用rank独立计数。所有生成路径最终经过 `Combat.spawn`，`spawnRank` 必须在入口传入rank，不能先生成普通岩甲再绕过类别检查。名单外残留保留血量、状态和攻击，不再补刷；其存活期间占用四类名额，新名单种类等待空位，不清怪、不积压补发。整波固定新刷名单最多四类，跨波交接时旧种类可以自然退出，因此交接波累计见过的种类可能多于四类，但同屏永不新增第五类。`inspect().director.roster` 可读取本波名单。

无尽波长由 `ENDLESS_WAVE_SECONDS=60` 定义；`ENDLESS_WAVE_DIRECTOR` 压缩首段阶段终点和晶屑/爆孢/携宝资格时间，精英出场时间同样压缩，最终释放段至少10秒。`stagesFor` 单独定义第7波后的普通波压力/释放节奏；释放窗口提前量仍为实际6秒，Boss满60秒进入原有加时，Boss支援保留原节奏。普通闯关导演与时长不变。后续新增刷新入口必须继续经过统一生成检查。

无尽第二批：`src/endless-encounters.ts` 的 `ENDLESS_ENEMY_UNLOCKS` 按累计波次开放十二类敌人：1夜影蝠，3熔果/孢子浮囊，4沙甲/绯花，5月露，7雷铃，8霜绒/毒菇，9晶甲重炮，10镜晶，11深海灯灵。解锁表示进入候选，不保证当波出现。`EndlessEncounterDeck` 使用前排/远程/辅助/追击配方，优先完整组合、较少入选的类型，并避免有替代时连续重复；配方轮转后按剩余类型名额截取，精英/Boss与携宝仍占名额。携宝默认只在六波段的第2/5波保留，携宝诱饵可增加其余波的名单预留；晶屑狂潮在非Boss波将燃料由草团替换为晶屑，不额外占类。爆孢仅在段内第3/5波入选，其他词条不能突破解锁/名单或停止供给的释放窗口。

方向：前六波相邻两路；7–12波相邻/集中；13波后集中/双翼/交替且不连续重复。每波入口基准方向固定，双翼成员间隔1.75秒，其余0.65秒；背景补充使用独立时钟，避免等待侧翼时停止经验供给。受阻成员跳过，`spawnPerimeterPosition` 在无尽仅在锁定扇区内找安全位置，不绕到另一侧。第7波起普通压力段6秒请求，第13波起4.5秒，旗帜短强压5/4秒；不再额外乘跨段护卫频率，无无限加速。现有类别/总人口/敌弹/特效池上限不变。

危险错峰：`Combat.beginEndlessWarning` 仅在无尽名单启用时限制新冲锋/远程蓄力，使用模拟时钟，普通新预警至少错开0.45秒；冲锋蓄力/执行最多2个，晶甲重炮蓄力与冲锋互斥，重炮起手后1.3秒不新增预警。精英地震、Boss主要蓄力/冲锋/弹幕与未爆孢子期间不启动这些新蓄力，已开始的动作正常完成。重开及清场重置错峰时钟；冻结/暂停沿用原模拟，不添加伤害、控制标签或新素材。`inspect().director` 增加 `composition` / `approach`；波次开场提示显示入场方式。第二批按用户要求未运行测试，生产构建单独检查。

平衡数值入口：`src/balance.ts` 管理正式构筑射程/范围上限、弹体尺寸、槽位间隔、经验和跨轮生命公式；武器基础值在 `ATTACKS`，成长由各武器 stats 函数提供。`upgradePreview` 的第三参数用于选择正式/历史属性预览，界面传入当前构筑模式。

无尽第四批（2026-10-23）：`RunFlow.prepare` 明确设置 `Progression.endless`，`reset` 清除；正式构筑的无尽升级需求为原6/4L加 `0.08*max(L-25,0)^2` 后向上取整，闯关/历史保留原曲线。沿用逐级扣经验、动态等级上限、已购等级扣除与宝箱授予路径，不提高经验掉落或增加无限属性。

`cycleHealth` 保留前两次跨段的0.16/0.28增量，此后危险怪/精英用0.32、Boss用0.60的对数项 `ln(1+max(n-2,0)/2)` 缓升。`cycleFuelHealth` 取危险怪倍率且最高1.8；草团在 `spawnSwarm` 覆盖基础血量后应用一次，晶屑在普通 `spawn`/独立群生和 `enemyMaxHp` 均取燃料倍率，不再叠加危险怪倍率。Boss/精英仍用各自基础血量，普通危险怪仍保留原波内倍率。此次生命/经济调整未同步提高伤害、普通移速、池容量或Boss预警频率；后续Boss技能成长见下方环形弹幕入口。非有限深度退回0，极深合法深度限制为安全整数，公式结果有限。

`RunShop` 第五个可选参数传入无尽段索引（首店为0，`undefined` 保留闯关原价），购买、治疗和刷新共用 `endlessShopPrice`，UI直接显示实际扣款价。普通基准105起，前两次跨段各加18，再用28的对数项缓升；普通商品按原价/25限0.9–1.2，遗物1.4、进化1.5、治疗0.7；付费刷新为原递增价乘3Q/105，统一上取整到5金币，免费刷新仍为0。固定波奖、击杀收入、携宝、点金秘典、Boss60金币和跨段存币保留，不根据钱包或玩家伤害改价。

长局校准见 [ENDLESS_LONG_RUN_CALIBRATION.md](ENDLESS_LONG_RUN_CALIBRATION.md)，覆盖第6至600波的曲线锚点与请求积分收入预算；没有执行战斗模拟或代码测试，2–4件是正常收入目标而非已验证结论或硬购买上限。`RunShop.purchases/spent/refreshSpent` 只在成功操作累计，`RunFlow.inspect().economy` 保留最近12次离店时的波次、区间新收入、进出金币、购买和刷新花费；重开通过新建RunFlow清空，记录不参与定价，便于后续区分攒钱和当期购买力。生产构建单独检查。

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

战斗底部构筑栏已按用户要求移除（2026-10-23）：`src/ui.ts` 不再创建 `fusion-status`，`Game.updateHUD` 不再生成底部武器/融合图标、名称、等级及冷却摘要；构筑信息继续由暂停页和结算页展示，战斗属性与技能效果不变。

闯关续接无尽（2026-10-23）：`RunFlow.canContinueEndless` 仅允许已完成六波并击败最终Boss的闯关胜利记录续接；`continueEndless` 切换同一个RunFlow到无尽并通过原推进路径进入第7波，复用Combat/Progression/RunBuild，不重新授予首通宝箱。`Game.endRun` 为可续接胜利保留遗物累计状态，胜利页 `endless-continue-prompt` 提供进入无尽、再次挑战和返回菜单。`Game.continueEndless` 切换无限地图、将角色放到原点，保留武器/融合/遗物/强化、等级/经验、钱包、剩余生命和累计战绩；地图就绪前沿用加载门禁。失败、历史模式和无尽结算不显示续接选项。再次挑战仍走完整reset；续接后再次挑战从无尽第1波开始。按用户既有要求不运行测试，截图使用通关状态预览。

商店卡图由 `src/shop-art.ts` 解析本次实际商品。`RunFlow.resolveBoundary` 在波末经验选择和奖励结算完成后一次性创建商店，`Game.syncRunPhase` 利用3.5秒休息期调用 `preloadShopArt` 提前请求并解码本次商品图片；进入商店和刷新后复用相同预加载入口，不加载全卡池、不增加开局阻塞。`bindUpgradeArt` 对商店多图要求全部图片就绪才隐藏占位图，工厂遗物缺图沿用生成图标，其余商品缺图回退到自身类别图标。购买和刷新仍只允许在shop阶段执行；下一波清空商店引用。此次按用户要求不运行测试，未实测设备加载耗时。

2026-10-23开场等待减负：原流程点击开始后才请求当前幻兽本体/动画，且开场等待全部18类敌人方向图集（当前合计约4.14MiB）。现由 `Game.syncCreatureSelection` 在菜单预加载所选幻兽及头像，`PartyView.preloadLeader` 复用同一个PixelSpriteRenderer；头像使用eager/high请求。`CombatView.preloadStartup` 在菜单预载基础敌人、火焰及融合图集。`EnemyPixelView.startupKinds` 仅等待草团、疾芽、岩甲、晶屑、夜影蝠五类基础资源；后续敌人由 `ready(kind)` 按需启动，无尽新波名单在渲染开始时提前请求且不加入开局阻塞。资源缓存、失败占位与重开复用沿用已有路径，没有修改敌人的出场、伤害或模拟时钟。15秒回退仍只是异常等待上限，不是强制倒计时。此次未运行测试/网络性能实测，构建检查不能证明用户设备的新加载秒数。

`Game.sceneLoading` 统一管理地图等待和本局开场素材等待。像素模式通过角色、敌人视图的 `startupSettled`，以及 HUD 头像和基础弹体的加载状态放行；等待期间暂停逻辑步、计时和输入。角色检查包括已启用的动画图集，敌人检查包括已请求的基础敌人图集。正常等待素材完成再开始；2026-10-23补充开场素材15秒超时回退，避免图片请求一直pending时永久卡住。超时仅结束美术等待，沿用视图已有占位/静态回退，请求仍可稍后完成；地图及碰撞就绪条件始终保持硬等待。`CombatView.startupWaiting` / `Game.startupWaiting` 区分角色、敌人、火焰、融合及头像等待，遮罩副标题显示具体类别；`Game.inspect().loading` 提供地图、开场、回退和等待项。新开局与返回菜单重置计时/回退标记。此次静态排查确认了无限等待路径和既有`[hidden]`样式，不代表复现了用户设备的具体阻塞资源；按用户此前要求未运行测试，生产构建通过。

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

## 携宝兽宝箱奖励

死亡结算在 `Combat.damageEnemy`，数量概率与生命周期在 `src/special-enemies.ts`。每件奖励重查 `Progression.canGrant`，经 `Combat.grantUpgrade` 应用；过滤融合选择、重复 ID、工厂商店禁用遗物和专精徽章下的新武器。无候选时发金币补给，保留原金币/经验和刷新券。`src/treasure-canvas.ts` 由用户提供的 astral-relics-reference-rebuild 改编，删除独立页面、示例道具、音频和 RAF；实际奖励标题驱动光柱。`SpecialEnemyView` 固定池管理半分辨率画布纹理，模拟年龄驱动动画，暂停冻结，清场隐藏，dispose 释放。验证：`tests/treasure-chest*.spec.ts` 与特殊敌人、成长测试。

宝箱现由 `src/treasure-dialog.ts` 在屏幕中央呈现，`Game.step/frame` 在弹窗活动期间冻结战斗与波次；点击开启后播放 Canvas 演出，结果保留到点击继续。场景视图只保留金币散开/浮字，关闭弹窗消费表现事件。重开及 dispose 清理弹窗与 RAF，后台/竖屏停止演出计时。手机横屏使用宽面板，奖励以实际图标在宝箱上方揭晓，停轮后显示对应名称。Canvas 按可用宽高响应式绘制，开启时使用放射光束、彩色光柱、冲击环、金币及道具粒子喷涌和有界震动；结果图标保留到继续。实际场景截图及暂停/继续验证：`node scripts/capture-treasure-gameplay.mjs`（本地 Vite 5175）。

满屏金光由 `TreasureDialog` 的 CSS 光幕提供，Canvas 的 `glow()` 输出与开箱/最终爆发同步的强度；光幕覆盖整个视口且位于面板后方，结果时降至微光，关闭/重开清零。

宝箱演出参数与合成音效样本：`src/treasure-presentation.ts`，1–5档分别设置滚动、停轮间隔、最终爆发时长和视觉预算。Canvas 发出 open/tick/reveal/finish 事件，由 `GameAudio.playTreasure` 复用主游戏的音量、静音、后台暂停、8声音上限和缓存；关闭/重开停止宝箱声音。`TreasureDialog` 先用0.75秒聚光淡入，战斗冻结后显示可点击开箱按钮。窗口失焦会隐藏宝箱以露出暂停菜单，恢复后继续演出。携宝生命仅在正式 spawn 分支叠加 `treasureHealthMultiplier`，保留原波次/无尽倍率。验证：`tests/treasure-presentation.spec.ts` 和实际游戏截图脚本（包含声音播放计数）。

角色死亡音效：统一由 `Game.endRun` 在真实生命耗尽且失败时调用 `GameAudio.playDeath`，每次结算只触发一次；通关和 Boss 超时不播放死亡声。`src/sound-design.ts` 的 death 样本为0.72秒下坠音。结算关闭战斗/BGM后允许该声音收尾，播放版本号取消失焦、静音、重开或销毁后的待播声音；结束后暂停 AudioContext。回归入口：`tests/death-audio.spec.ts`。


## 孢子浮囊射手（已实现）

2026-10-23素材修正：按用户新原图的五个独立轮廓重新裁剪，修复侧面喷口截断及右后/背面混入邻帧碎片。复用 `scripts/recrop-crystal-crawler.py --species spore-floater`；原图、裁剪记录与布局说明位于 `public/assets/pixel/enemies/direction/spore-floater/`，同步替换方向图集与基础正面单图。各方向统一缩放、最大宽224/高200、底部落点(128,240)，朝向映射、显示尺寸配置与战斗逻辑不变。本次只核对裁剪预览，未运行代码测试。

`spore-floater` 为远程普通敌人：48生命、1.1速度、0.55碰撞半径、6接触伤害、4经验；沿用普通死亡奖励和无尽生命倍率。从第三波及第五波压力护卫加入，同时最多2只。4单位内后退，7单位内缓行，9单位内无遮挡时锁定方向蓄力0.7秒，发射速度5、寿命2秒的直线弹，冷却2.8秒。复用 EnemyChallenge 的16槽敌弹池、12伤害与墙体/玩家扫掠结算，池满跳过本次发射。五方向素材来自用户参考图，复用方向图集、受击/死亡显示；漂浮仅影响显示。历史出怪列表保持原样。验证入口：tests/spore-floater.spec.ts。

孢子浮囊射手的攻击辨识：`EncounterView` 用固定实例池显示喷口蓄力/发射闪光、橙红敌弹细圈和绿色短尾迹；低画质保留细圈和一段尾迹。`CombatView` 复用锁定方向/冷却显示短暂后仰，取消该远程敌人的通用近战圆圈。所有动画取模拟状态，暂停冻结，清场清零，dispose 释放共享实例资源；不改变伤害、碰撞和 Boss 紫弹。验证：`tests/spore-floater-firing-ui.spec.ts`。


## 晶甲重炮（已实现）

2026-10-23素材修正：按用户新原图重新裁剪五方向，修复侧面/右后方越格截断与邻帧污染。原图、边界记录和布局说明位于 `public/assets/pixel/enemies/direction/crystal-crawler/`；重建入口 `scripts/recrop-crystal-crawler.py`，同时更新方向图集与基础正面单图。统一比例、最大宽224/高200、落点(128,240)，不修改战斗属性、碰撞或显示尺寸配置。本次仅检查裁剪预览，未运行代码测试。

`crystal-crawler`：远程重型普通敌人，180生命、0.65速度、0.8碰撞半径、12接触伤害、8经验；贴地滑行，行走起伏为0，无迈腿动画。第四波压力护卫开始出现，第五/第六波也加入，单种最多1只；历史出怪列表不增加。生命沿用无尽成长和普通死亡结算，没有额外减伤标签。

`src/ranged-enemies.ts::rangedEnemyRule` 统一浮囊射手和晶甲重炮的远程参数；重炮3单位内后退、7.5单位内停驻、10单位内无遮挡锁向蓄力1.1秒，发射速度4、寿命2.5秒、冷却3.6秒。复用16槽敌弹池和12伤害结算，池满跳过，晶弹青蓝色，复用橙红细圈、尾迹、蓄力闪光和后仰。素材直接导入用户五方向参考图，沿用图集布局、加载回退、暂停与清场显示路径。验证复用 `tests/spore-floater.spec.ts`、`tests/spore-floater-ui.spec.ts`。


## 绯花漂游术士（已实现）

2026-10-23素材修正：使用用户新原图按五个独立轮廓重新裁剪，清除右前/右侧帧混入的邻帧花瓣与水晶。复用 `scripts/recrop-crystal-crawler.py --species scarlet-flower`；原图、布局与裁剪记录保存于 `public/assets/pixel/enemies/direction/scarlet-flower/`，同步更新方向图集和基础正面图。统一比例，最大宽224/高200、底部落点(128,240)。保持原朝向映射、显示尺寸配置、碰撞与战斗逻辑。本次只核对素材预览，未运行代码测试。

`scarlet-flower`：非人形漂浮花核，直接导入用户五方向花瓣/能量环素材；基础生命70、速度0.95、半径0.55、接触伤害6、经验5，生命沿用波次/无尽成长。第三波24秒后的压力阶段及第四、第五波加入，同时最多2只，历史出怪列表不变。`rangedEnemyRule` 复用远程行为：4.5单位内后退、7单位内缓行、9单位内无遮挡锁向蓄力0.9秒；粉色法术弹速度4.6、寿命2秒、冷却3.1秒，沿用敌弹池的12伤害、橙红细圈、尾迹、闪光与后仰；无额外状态或新标签。复用出生保护、普通死亡奖励、暂停、重开和资源释放路径。验证复用 tests/spore-floater.spec.ts 与 tests/spore-floater-ui.spec.ts。

绯花术士脚下仅显示一个粉色实例环（CombatView.flowerRings），不叠加通用阴影、恢复圈或选中圈；出生预警保持原规则。预览将她与其他敌人错开摆放。定向回归及射击图：tests/scarlet-flower-capture.spec.ts。


## 月露软壳兽（已实现）

`moondew-shell`：辅助普通敌人，基础生命100、速度0.6、半径0.65、接触伤害0、经验6，沿用波次/无尽生命成长和普通死亡奖励。第四、第五波压力护卫加入，同时最多1只，历史出怪列表不变。`MOONDEW_SHELL` 位于 special-enemies.ts；每4秒治疗3单位内最多3只受伤普通友军各6%最大生命，不超过生命上限，不治疗自身/同类/精英/Boss/出生保护目标/隔墙目标。Combat 复用空间候选、生命值和 collect 特效池；池满仅省略视觉。冻结/暂停不推进治疗，specialTime 复用时重置。五方向素材直接导入用户参考图，贴地滑移加轻微伸缩，无逐帧走路动画，不加攻击预警。验证复用 tests/spore-floater.spec.ts 和 tests/spore-floater-ui.spec.ts 的 moondew 用例。


## 熔果冲撞兽（已实现）

`molten-fruit`：近战滚动冲锋普通敌人，基础生命80、速度1.8、半径0.65、伤害12、经验5，沿用波次/无尽生命成长。第二波55秒后及第四、第五波压力护卫加入，同时最多2只；历史出怪列表不变。`MOLTEN_POUNCE` 复用 updatePounce：6单位内无遮挡预测锁向，蓄力0.75秒，速度10冲锋0.6秒，恢复1.2秒、冷却2.4秒，沿用障碍物移动和玩家扫掠命中/受击保护，不附加燃烧。CombatView 的方向箭头使用相同速度/时长，静态五向素材通过弹跳伸缩和冲锋翻滚表现运动；滚动距离沿用已重置的 grassRollDistance，冻结不转动。素材为用户参考图导入，复用受击、死亡和对象池。验证：tests/spore-floater.spec.ts、tests/spore-floater-ui.spec.ts 的 molten 用例。


## 敌人测试模式

主菜单「敌人测试」进入 `enemy-test` 模式，沿用单幻兽、自动攻击、三武器构筑、升级和暂停/重开。`src/enemy-test-mode.ts` 的独立名单仅包含孢子浮囊射手、晶甲重炮、绯花漂游术士、月露软壳兽、熔果冲撞兽、霜绒兽、夜影蝠、雷铃兽、毒菇幽灵、沙甲团兽、镜晶灵、深海灯灵；首次逻辑步各尝试生成1只，之后每4秒按种类上限各补1只（依次2/1/2/1/2/1/3/2/2/2/1/2，共12类、总上限21），失败等下一轮，不追补爆发。调用安全出生位置与现有出生预警。关闭 Combat 自动刷怪，不创建 RunFlow，因此无旧怪、携宝兽、精英、Boss或波次调度；固定第一波属性、无通关倒计时，顶部显示模式名称及累计时间。暂停和升级不推进调度；重开新建调度器，返回菜单清除引用。正式/历史模式入口保持原调度。按用户要求，本次未运行测试或构建。


## 夜影蝠（已实现）

2026-10-23素材修正：按用户新原图重新裁剪五方向，消除原图透明留白对主体大小和落点的影响，完整保留耳尖、翼尖及深色身体。复用 `scripts/recrop-crystal-crawler.py --species nightshade-bat`，以透明度处理杂点，不按RGB黑色去背；原图、裁剪记录与布局说明位于 `public/assets/pixel/enemies/direction/nightshade-bat/`。同步更新图集和基础正面单图，统一比例、最大宽224/高200、底部落点(128,240)，保留此前1.5倍显示尺寸配置，战斗属性和碰撞不变。本次只核对素材预览，未运行代码测试。

`nightshade-bat`：近战接触型滑翔普通敌人，基础生命36、速度2.1、半径0.42、接触伤害6、经验3；沿用波次/无尽成长、出生保护、碰撞/障碍导航、普通死亡奖励和对象池重置。第二至第五波压力护卫加入，同类最多3只；历史出怪列表不变，夜影蝠已加入敌人测试名单。Combat 复用连续追逐和平滑转向，近身伤害使用原结算，不新增冲锋、弹体或穿墙机制。CombatView 以模拟年龄驱动小幅悬浮与倾斜，冻结停姿，方向由实际移动驱动；五方向静态图直接导入用户素材，无拍翼动画。只去除连通黑色底色，保留深色身体细节。按用户此前要求，本次未运行测试或构建。


## 霜绒兽（已实现）

2026-10-23素材修正：按用户新原图重新裁剪五方向，去除透明留白及邻帧碎片，保留完整冰角、绒毛和底部冰晶。复用 `scripts/recrop-crystal-crawler.py --species frost-fluff`；原图、边界记录和布局说明位于 `public/assets/pixel/enemies/direction/frost-fluff/`，同步更新方向图集与基础正面单图。统一比例、最大宽224/高200、底部落点(128,240)；此前1.5倍显示尺寸配置与Boss额外缩放不变，共用图集的霜绒巨兽同步使用修正素材。碰撞及战斗逻辑保持原样。本次只核对裁剪预览，未运行代码测试。

`frost-fluff`：圆胖非人形近战重型雪兽，用户五方向静态图直接导入，贴地滑行、不使用行走/拍翼/翻滚帧。基础生命150、速度0.85、半径0.75、接触伤害14、经验7；沿用波次/无尽成长、出生保护、普通死亡和池槽重置。第三波24秒后的压力阶段及第四、第五波加入，同类最多1只，历史出怪列表不变，霜绒兽已加入敌人测试名单。`FROST_GLIDE` 复用 updatePounce：4.8单位内无遮挡锁向，蓄力1秒，速度7滑冲0.5秒，恢复1.4秒、冷却3.2秒；正式模式恢复时停驻。CombatView 预警共用同一滑冲参数，轻微蓄力压缩，身体不旋转，底部冰霜使用原图，无额外冰面/减速。复用障碍导航、碰撞扫掠、伤害结算与暂停冻结。依用户要求，本次未运行测试或构建。

绯花术士朝向修正：CombatView 在移动/后退时按模拟目标朝向 enemy.facing 取五向图，蓄力与发射后仰期间保持 aimX/aimZ；冻结时传零方向以保留已有朝向。避免在移动方向和施法方向间反复翻面，沿用 screenFacing 的扇区滞回。仅改变该敌人的显示，位移、锁定和弹体方向不变，无新增池状态。本次按用户此前要求未运行测试或构建。


## 雷铃兽（已实现）

`thunder-bell`：电系外观的悬浮远程普通敌人，基础生命60、速度1.15、半径0.5、接触伤害6、经验4，沿用波次/无尽成长与普通死亡结算。第三至第五波压力护卫加入，同类最多2只，历史出怪列表不变，已加入敌人测试名单。rangedEnemyRule 复用远程行为：3.5单位内后退、6单位内缓行、8单位内无遮挡锁向蓄力0.65秒；黄色弹体速度6、寿命2秒、冷却2.5秒，沿用16槽敌弹池及12伤害，不额外麻痹/连锁。脚下仅一个黄色 thunderRings，不叠加阴影、恢复或选中圈；保持目标朝向，施法及后仰锁定方向，冻结保留朝向。素材原图第2/3张朝左，导入时镜像，右后图不镜像；详见 assets/pixel/enemies/direction/thunder-bell/README.md。方向、受击、死亡、重开与GPU清理沿用现有路径；低空漂浮无腿部帧。本次未运行测试或构建。


## 毒菇幽灵（已实现）

`toxic-shroom`：紫色菌盖软体远程普通敌人，基础生命55、速度1、半径0.55、接触伤害6、经验4，沿用波次/无尽生命成长与普通死亡奖励。第三波24秒后的压力阶段及第四、第五波加入，同类最多2只；历史出怪列表不变，已加入敌人测试名单。rangedEnemyRule 复用远程逻辑：4单位内后退、6.5单位内缓行、9单位内无遮挡蓄力0.85秒；紫色孢子弹速度4.5、寿命2秒、冷却3秒，沿用16槽敌弹池、12伤害、敌弹警示边与浅紫尾迹，不新增中毒叠层/毒池/死亡爆炸。低空轻飘不使用迈腿帧，五方向图按正面/右前/右侧/右后/背面导入；平时目标朝向、施法锁向、冻结保留朝向，避免移动方向与瞄准方向交替翻面。加载、受击、清场及释放复用既有路径。本次未运行测试或构建。


## 沙甲团兽（已实现）

`sand-shell`：低重心地面重型普通敌人，基础生命160、速度0.7、半径0.8、接触伤害12、经验7；沿用波次/无尽生命成长，击杀金币2。第三、第四、第五波压力护卫加入，同类最多2只；历史出怪列表不变，已加入敌人测试名单。复用岩甲 ROCK_MARCH 的慢转向、持续贴地前压、实际接触半径和较低击退强度，不新增减伤标签、弹体、冲锋或震地；现有避障、控制减速、伤害/死亡/出生保护和槽位重置保持通用路径。五方向素材按正面/右前/右侧/右后/背面直接导入，无迈腿帧、无跳跃起伏，仅轻微重心倾斜；渲染使用现有材质、受击与资源释放。按用户此前要求，本次未运行测试或构建。


## 镜晶灵（已实现）

`mirror-wisp`：银灰镜晶悬浮远程普通敌人，基础生命90、速度1.05、半径0.5、接触伤害6、经验5；沿用波次/无尽生命成长与普通死亡奖励。第四、第五、第六波压力护卫加入，同类最多1只，历史出怪列表不变，已加入敌人测试名单。rangedEnemyRule 复用远程行为：4单位内后退、7单位内缓行、9.5单位内无遮挡锁向蓄力1秒；复用 crystal 敌弹外观及16槽池，速度4.2、寿命2.5秒、冷却3.3秒、伤害12，保留敌弹警示边与淡蓝尾迹。无反伤/折射/免疫机制。五方向素材按正面/右前/右侧/右后/背面导入，悬浮微倾，无脚步动画；晶片随整体朝向呈现跟随轮廓。平时目标朝向，施法/后仰锁向，冻结保留朝向，重开/清场及GPU释放复用现有路径。本次未运行测试或构建。


## 深海灯灵（已实现）

`abyss-lantern`：深蓝海洋灵体远程普通敌人，基础生命65、速度1、半径0.52、接触伤害6、经验5，沿用波次/无尽成长及普通死亡奖励。第三波24秒后的压力阶段及第四、第五波加入，同类最多2只，历史出怪列表不变，已加入敌人测试名单。rangedEnemyRule 复用远程逻辑：4单位内后退、7单位内缓行、9单位内无遮挡锁向蓄力0.9秒；复用 crystal 冷蓝敌弹及16槽池，速度4、寿命2.5秒、冷却3.2秒、伤害12，保留敌弹警示边和浅蓝尾迹，无额外控制状态。五方向素材按正面/右前/右侧/右后/背面导入，触须/灯珠沿用静态原图，模拟年龄驱动漂浮摇曳，不使用脚步帧。移动面向目标、施法/后仰锁向、冻结保留朝向；清场重开与GPU释放沿用既有路径。本次未运行测试或构建。


战斗捕捉/幻兽囚坊：`src/enemy-capture.ts`、`src/capture-hud.ts`、`src/capture-collection.ts`、`src/prison-view.ts`、`src/prison-scene.ts`；完整接入、规则和验证见 [CAPTURE_PRISON.md](CAPTURE_PRISON.md)。可捕捉刷出概率与用户历史见 `src/capture-spawns.ts` / `src/capture-rules.ts`。正式闯关/无尽中抽中资格的个体40%血量转可捕捉并免伤（`Combat.isCaptureReady` / `src/capture-rules.ts`），可捕捉敌人不伤害角色，封印符无限，靠近E与点击封印；小游戏合格/优秀判定、不合格重试与加成见 `src/enemy-capture.ts`，界面见 `src/capture-hud.ts`；最终成功或失败均离场，成功永久收藏接局外劳作，囚坊同种入住数量受实际捕获数量限制；旧模式不启用。


四位Boss环形弹幕（荆冠兽王、熔果暴君、晶甲重炮王、霜绒巨兽）：`src/boss-barrage.ts`、`src/boss-barrage-view.ts`，接入 `EnemyChallenge` / `EncounterView`；行为、预览与截图见 [BOSS_BARRAGE.md](BOSS_BARRAGE.md)。

无尽Boss技能成长：真实出生路径在 `EnemyChallenge.spawnBoss` 锁定现有接触伤害倍率及 `balance.ts` 的 `cycleBossFrequency`；扇形/环形/地震共用Boss伤害倍率，发射与恢复节奏缓升，预警时长固定。危险怪蓄力与护卫入场在整段环形弹幕期间错峰。公式、波次对应与范围见 [BOSS_BARRAGE.md](BOSS_BARRAGE.md)「无尽实战成长」。

无尽三位Boss各有三种弹幕，`endless-boss.ts:barragePatterns` 轮换、攻击表穿插三次弹幕段；新增四向焰流/熔核星爆、十字重炮/棱镜聚焦、六角飞雪/错位雪幕。模型与预警共用 `boss-barrage.ts` / `boss-barrage-view.ts`，详细发射与资源规则见 [BOSS_BARRAGE.md](BOSS_BARRAGE.md)「三位变体追加六种技能」。

无尽通用遗物与服务：`src/content/relics/endless-passives.ts` 注册六项低开销被动，`endlessOnly` 控制无尽候选、`art.png` 绑定用户原图裁切的卡片图标，服务图标由 `ShopItem.illustration` 指定；`src/shop.ts` 提供固定补给与契约服务，`Combat.vitalContracts` 保存本局限次。效果、价格与结算边界见 [ENDLESS_PASSIVES.md](ENDLESS_PASSIVES.md)。

宝箱演出调整（2026-10-24）：携宝兽死亡使用 `Combat.areaDeaths` 保留1.2秒淡出，`TreasureDialog.presentingDeath` / `advanceDeath` 与 `Game.frame` 配合，在冻结战斗时仅推进对应死亡特效并重绘场景，结束后再开始弹窗淡入；`SpecialEnemyView` 在死亡阶段隐藏奖励浮字。首通Boss宝箱不追加携宝死亡等待。1–5件均扩大面板和滚动图标，采用连续滚动后减速停靠；3–5件使用更宽亮红/金/紫光柱。透明Canvas横向越过边框，外层光晕允许溢出，按钮保留在最上层。验证：`tests/treasure-dialog-sequence.spec.ts` 覆盖死亡先后、战斗冻结、重开清理、桌面/手机横屏五档滚动和显式继续；既有宝箱/音效用例继续回归。

卡片图标与文案统一：新增/替换卡图后按 [CARD_ART_MANAGEMENT.md](CARD_ART_MANAGEMENT.md) 生成透明主体规范化WebP；`card-art.ts` 统一实际加载地址，`card-copy.ts` 生成短文案，图片大小不随说明长度变化。原数值与详细规则仍来自原内容定义。

宝箱专用预览：访问 /treasure-preview.html，入口 src/treasure-preview.ts，复用 TreasureDialog 和实际奖励图标，默认自动播放五件，顶部切换1–5件及重播。使用独立临时 Combat，不写入存档；仅预览允许竖屏播放，正式游戏保留横屏门禁。

宝箱随机滚动图鉴：Progression 的 TREASURE_ROLL_SKILLS 提供全部内容卡片身份，TreasureDialog 排除隐藏/无图项后传给 createTreasureCanvas；每箱从完整图鉴随机取最多28张滚动图，轨道共享图片，每条轨道末项锁定真实奖励。动画使用独立视觉随机，不调用 Combat.random、不重新授奖。实际掉落继续由 Combat.grantTreasure 逐件校验资格，不能因滚动画面绕过三槽、满级、前置或模式限制。验证 tests/treasure-roulette.spec.ts。
