# 水草四融合：工程核查与交付

## 修改前核查

分支 `main`，HEAD `3caea4d`（第一次提交）。存在大量前序未提交代码、素材和截图，以及既有 `public/assets/references/yanrong-concept.png` 删除状态，均未重置、清理或覆盖。使用独立临时 Git 索引生成安全检查点 `refs/checkpoints/water-grass-fusions-20261019-020631`；备份包：`D:/projects/MonsterBonk-Mobile-backups/water-grass-fusions-20261019-020631/before-fusions.bundle`。未移动工作分支或原索引。

| 前置能力 | 修改前实际状态 | 本轮处理 |
| --- | --- | --- |
| P1 爆裂火种 | 已有配方、卡牌、爆炸与两枚子火种、图集和回归测试 | 保留，扩展配方解析支持同物种多条配方同时生效 |
| P1.5 八方向动画 | 三物种已有图集审查、相机投影方向、逐帧播放、静态回退；三兽焰绒开关刚修复 | 直接复用，水草可在开发入口单独成为主控 |
| P2 三幻兽正式选择 | 未实现，融合入口固定焰绒；三兽兼容有水草基础弹 | 不建设选择界面，只提供单兽开发参数 |
| P2 水泡减速／叶刃穿透 | 未实现，旧水草弹均为首次命中消失 | 仅为独立融合验证加入最小基础逻辑，不改变历史模式 |
| 卡牌与融合结构 | Progression 旧八卡、P1 额外命中分裂；fusion.ts 只有爆裂火种 | 水、草各有独立开发卡池；新增范围扩大、连锁弹射，保留随机三选一 |
| 战斗／资源 | Combat 统一 damageEnemy、击杀与掉经验；24 投射物、48 敌人、48 效果池 | 原池与统一结算保持；有限跳转、去重命中、最多一代派生 |
| 视觉 | CombatView 实例化弹体、拖尾、环与粒子，FirePixelView 为焰绒图集 | 水草用既有程序化显示，禁用其火焰图集显示，无新增 AI 图片 |

读取 `docs/GDD.md`、`plan-v5.0.md`、`src/combat.ts`、`src/combat-view.ts`、`src/progression.ts`、`src/fusion.ts`、`src/game.ts`、`src/ui.ts` 和既有融合／动画测试后实施。根计划中“未来四配方本轮不实现”为前一轮 P0/P1 限制，本轮按用户新要求只新增这四条；没有扩展灼热贯穿弹等其他配方。

## 可测试开发入口

- 泡泡螈：<http://localhost:5173/?fusionDev=paopaoyuan>
- 芽刺兽：<http://localhost:5173/?fusionDev=yacishou>

点击「单兽技能融合原型」开始。每局只有对应一只幻兽，一个移动摇杆，自动索敌与攻击；升级暂停并随机三选一。水系寻找「范围扩大」「连锁弹射」，草系寻找「命中分裂」「连锁弹射」。重开清空配方并保留本次开发物种。删除参数回到原有焰绒入口；参数不影响历史三兽模式。没有直接解锁融合或主动施法按钮。

详细规则与全部调试数值在当前 [GDD.md](GDD.md) 和 `src/fusion.ts`。本轮未提供水草技能图集，因此复用现有程序化水蓝／草绿弹体、扩散环与粒子，角色使用已有逐帧动画。

## 验证

新增模型测试覆盖四条配方、真实抽卡、减速到期、同 tick 穿透、实体弹射飞行、跳转上限、已命中去重、散射下一 tick 生效、子弹不递归、双配方共存、满池降级、暂停／死亡／重开、击杀经验去重与发射快照。新增浏览器测试从真实入口点击开始及随机三卡选择，检查单兽、对应动画图集、四融合、实际命中效果、暂停与重开，确认不显示焰绒火焰弹。

浏览器实际运行截图（自动化布置敌人并通过 Combat 更新命中；非 AI 图片）：

- `artifacts/elemental-paopaoyuan-844.png`、`artifacts/elemental-paopaoyuan-568.png`
- `artifacts/elemental-yacishou-844.png`、`artifacts/elemental-yacishou-568.png`

本机浏览器模拟两种横屏尺寸，未运行 Android/iPhone 真机性能验收。本轮最终结果：

- `npm run build`：通过。保留既有 Three.js 分包体积提示，无构建错误。
- `npm.cmd test -- --config=playwright.chrome.config.ts --reporter=list`：168 通过、0 失败、0 跳过，耗时 3.4 分钟。使用本机 Chrome；未执行 WebKit。
- 新增 11 项模型测试与 3 项浏览器测试；既有爆裂火种、三物种动画、三兽跟随、自动攻击、升级和历史模式回归均通过。
- Git 备份包经 `git bundle verify` 验证通过。测试覆盖生成的旧截图已还原至本轮检查点版本，保留本轮四张开发入口截图。


后续更新：用户已授权并完成主菜单幻兽选择，无需开发链接即可出战。上文“P2 未完成”为四融合实施前的核查记录；当前入口与验收见 [CREATURE-SELECTION.md](CREATURE-SELECTION.md)。
