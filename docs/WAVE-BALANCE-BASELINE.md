# 六波战斗数据基线（P0 / step 1）

本工具基于正式六波 `Combat.update` + `RunFlow.update`，60Hz 固定模拟；只新增诊断计数，不改变伤害、武器等级、刷怪时间、怪物生命、经验掉落和 Boss 战规则。

## 执行命令

```powershell
npm ci
npm run balance:waves
npm run balance:waves -- --full --seed 42
npm run balance:waves -- --seconds 24 --output artifacts/wave-balance-24s.json
npx playwright test tests/run-balance.spec.ts --project=chromium
```

默认每波独立观察 **35 秒**，输出 `artifacts/wave-balance-results.json` 与控制台表格；加 `--full` 则尽量完成整波，但真实死亡或 Boss 胜利会提前停止。结果是确定性模型数据，**不是实测玩家通关率、真机帧率或连续整局的统计**。

覆盖三名初始角色（焰绒、泡泡螈、芽刺兽）、两套声明式构筑（`focused` 伤害主武器 / `survival` 生存范围）、六波，共36种场景。每波从**满血及两种模拟升级预算**开始独立初始化：已完成的前置波次每波预设两次可用升级。测试期间通过真实经验球收集触发的升级走正常三选一流程，不跳过升级机制；不执行波间商店购买。移动采用固定半径6、角速度0.43的圆形路线，不包含反应式躲避或拾宝追逐。不同构筑在同角色、同波次使用相同怪物/流程初始随机种子。输出保留起始赠予与战斗中的选择列表，可核查每次升级。

## 字段定义

| 字段 | 含义 |
|---|---|
| `kills` | Combat真实击杀总数 |
| `damageEvents` | 实际成功扣血的受击次数（无敌帧期间不计） |
| `xp`, `xpPerMinute` | 实际已经收取或通过波次结算的经验；每分钟速率按真实已观察的秒数计算 |
| `weaponShots`, `firedProjectiles` | 各武器的真实发射计数，及本局全部投射物发射计数（含派生弹） |
| `projectileBlockedAttempts` | 有目标且冷却完毕的武器，因共享弹池剩余名额不足而未能开始一次攻击的**尝试 tick 数**，不是损失弹数 |
| `treasureSpawnsObserved`, `treasureEscapes`, `treasureEscapeRate` | 已观察到的不同携宝兽ID，实际逃走数，及两者之比；没有生成携宝兽时比例为 `null`，不能当成0% |
| `sporeExplosionKills`, `sporeChainKills` | 爆孢来源造成的所有真实死亡；其中被爆孢爆炸杀死的另一只爆孢怪单独计为连锁击杀 |
| `activePeak`, `dangerousPeak` | 实际最大同时存活敌人和危险敌人数量 |
| `observedSeconds`, `scheduledSeconds`, `phase`, `truncated` | 实际采样时长、官方整波时长、运行结果；死亡不能伪装成存活到波末 |

不将永久死亡后的秒数计入每分钟经验。由于缺少真实输入操作、地形与追宝策略，数据主要用于比较同样受控条件下的武器、波次与成长趋势。需要评估真实难度时，未来应加入连续整局回放、走位策略变体、真实地图和手机现场体验。

## 验证范围

`tests/run-balance.spec.ts` 检查全矩阵覆盖、重复运行完全一致、异常输入拒绝、受伤计数遵守无敌帧、弹体池满时计数、爆孢真实连锁击杀。原有 `npm run balance:weapons` 继续可用，不改变旧工具。

生成的JSON是运行结果而非源码，不应仅凭本文件声称本地/CI已跑过测试。合并后的数据需在对应开发环境实际运行命令后产生。
