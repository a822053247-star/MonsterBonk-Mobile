# P31-A + P31-B 双武器融合交付

基线：`main`，提交 `0f22c74`。按用户要求在主分支工作，交付独立分支 `codex/weapon-pair-fusion-v1`；不自动合并。P31-B 的两条配方覆盖附件“只做首配方”的旧范围限制，JSON 原件按字节保存在本目录。

## 实现

- 独立类型 `WeaponPairId` 与数据表 `WEAPON_PAIR_RECIPES`；旧 `FusionId` 和 `src/fusion.ts` 无改动。
- `EquippedAttack.pairId/sources` 描述融合身份和来源；`attackId` 仅保留较早来源作为原战斗调度键，不能被当作还在独立攻击的基础武器。HUD、卡片、暂停和结算均优先显示融合身份。
- 两把当前装备基础武器各至少3级，等级 `min(5,A+B-3)`；自愿确认，保留较早槽位、其他武器对象/冷却/未完成弹组、技能、遗物、进化、经验、金币。释放槽位使用最小空位分配，消耗的来源不可重购。
- 默认伤害/间隔与技能映射见 [系统目录](GAME_SYSTEM_CATALOG.md#241-双武器融合p31-a--p31-bimplemented)。焚枝燃烧每0.4秒10%、1.2秒刷新；藤潮的连锁转换为半径25%增长，禁止跳跃。没有调整任何基础武器参数。
- 现有24弹/48特效池、派生6次/tick和24次/秒预算保留；不会新建渲染器或导入Gigapack。复制保留固有范围/控制，不能重复分裂或触发自身遗物；碎片一代即止。技能与伤害规则在发射时快照。
- 来源遗物使用真实来源标签/身份及现有伤害、击杀事件。范围爆炸只报告一次；荆棘遗嘱/泡泡孢子生成物保留单一元素触发身份，防止水草互相派生。死亡取消活动弹体和状态，构筑只用于结果显示，菜单和重开清理融合身份。

## 素材

用户提供的 `融合武器.png`（1672×941 RGBA）从左至右分别裁出蒸汽彗星、焚枝穿刺、藤潮囚泡，保存为256×256透明图标；未重画、未新造素材。路径：`public/assets/ui/upgrade/illustrations/weapon-pairs/{steam-comet,blazing-thorn,bramble-tide}.png`。

## 固定种子10秒伤害

种子31，120Hz，基础武器各3级、融合3级；无技能、遗物、进化。固定同一敌人位置、阻止移动和击退、生命100000，隔离几何覆盖与调度差异；单体在(5,0)，五目标为(5,0)、(5,±0.9)、(6,0)、(7,0)。这是固定靶总伤害比较，不是完整关卡胜率或手机性能测试。原槽位冷却倍率与派生预算保持不变。

| 融合 | 单体：融合前 → 后 | 五目标：融合前 → 后 |
|---|---:|---:|
| 蒸汽彗星 | 679.20 → 736.00（+8.4%） | 679.20 → 2060.80（+203.4%） |
| 焚枝穿刺 | 778.80 → 772.00（−0.9%） | 1243.44 → 2316.00（+86.3%） |
| 藤潮囚泡 | 558.72 → 640.00（+14.5%） | 1023.36 → 1664.00（+62.6%） |

原始数据：`artifacts/weapon-pair-fusion/damage-comparison.json`。蒸汽满足明显群体收益且单体不显著低于原双武器；未修改其他武器基线。

## 验证

- `npm run build`：通过（原Three大包体积提示保留）。
- `npm run content:check`：31件工厂遗物通过。
- 最终定向：**95/95通过，0跳过**。其中15项新模型/战斗测试、3项真实浏览器流程；其余77项覆盖旧五融合、三武器、触发遗物、前30件Gigapack遗物。
- 模型覆盖门槛/公式/槽位/保留第三武器、三配方真实命中/范围/减速/燃烧、技能属性/一代分裂/连锁、来源遗物/爆炸、池满降级、复制与快照、进化/经济保留、死亡/重开、固定种子比较。
- 浏览器覆盖普通奖励可选、配方取消/确认、防双确认、HUD/暂停/结算/菜单/重开。检查844×390、568×320；小屏三配方与返回按钮完整可见。截图位于同一 artifacts 目录。
- 初次模型回归发现升级候选耗尽时融合入口可挤掉最后普通奖励，已修复。现存 `trigger-relics` 数量断言仍写24，主分支已有44，已校正到44，其他断言保留。新测试的初始化方法名及边界距离夹具也已修正。原失败记录保存在 `initial-failures.txt`，未删除或跳过测试。
- 精确命令：

```text
node node_modules/@playwright/test/cli.js test tests/weapon-pair-fusion.spec.ts tests/weapon-pair-fusion-ui.spec.ts tests/fusion-model.spec.ts tests/elemental-fusion-model.spec.ts tests/trigger-relics.spec.ts tests/build-depth.spec.ts tests/gigapack-relics.spec.ts tests/gigapack-21-30.spec.ts --project=chromium --reporter=list
```

日志：`artifacts/weapon-pair-fusion/final-tests.txt`、`ui-tests.txt`、`build.txt`、`content-check.txt`。未运行全量Playwright或所有平衡模拟，CI未改，无新依赖。

## 未完成项

无本任务范围内未完成项。三条配方之外不增加其他配方；合并由用户决定。
