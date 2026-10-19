# P3-A 水草四融合素材与战斗接入

日期：2026-10-19。依据 `E:/study/game/plan-v5.md` 与真实 `s.png`。

## 工程起点

修改前分支 main，工作区干净，HEAD `240ee5f0396fa24678bb8883025fbe0ead715e61`。已核实 P1 焰绒火花/命中分裂/爆裂火种、P1.5 八方向动画、三幻兽菜单选择、水泡减速、叶刃一次额外穿透均存在。水草四配方已存在，但使用程序化视觉，旧参数与新计划不一致，双配方曾叠加到同一枚主弹。本轮修正这些差异，没有复制战斗系统。

## 原图审查与切分

- 1774×887 RGBA，非等宽格子；透明不是黑色背景键控。
- alpha=0：764092 像素；0<alpha<24：319136 像素；alpha≥24：490310 像素。
- 原图 SHA256：`4d4f0fd5eb3f73e5da9e97dda903a68c99e790ba1079a8e348fba45baa0c18c4`。原文件未改动，项目内原样备份 `public/assets/pixel/skills/fusions/water-grass-original.png`。
- 只对派生文件清除 alpha<24 的低透明噪点和小于24像素的孤立连通域。这会舍弃部分很淡的光晕，不声称无损分层恢复。
- 根据实际边界分别标注各行非等宽区域，保留独立碎片；每技能共用一个缩放比例，居中于256×256，最小16像素安全边距。非逐帧放大至满格，因此阶段之间的相对大小保留。
- `effects.normalized.png` 为8列4行的运行图集。该规则网格是新生成的，不能套用于原图。独立规范化帧同时存于 `frames/`。
- 四个图标分别导出为128×128独立PNG，源区间 x≥1535，永不进入战斗图集。每帧源坐标、中心、缩放和拒绝区域见 `extraction.json`。

| 技能 | 提取阶段 | 实际播放 | 素材状态 |
| --- | --- | --- | --- |
| 深海泡影 | 8 | 飞行0/1/2循环；命中3/4/5/6/7单次 | 已接入 |
| 连环水爆 | 7 | 飞行0/1循环；命中2/5/6单次 | 已接入；3/4是完整弧线示意阶段，已提取但不当作局部命中动画 |
| 荆棘散射 | 7 | 飞行0并按弹体年龄旋转；命中1—6单次；子叶片复用飞行0 | 已接入；源图仅一枚独立完整飞行叶刃，旋转由程序实现，不虚构源动画帧 |
| 跳跃荆棘 | 2 | 飞行0/1循环；实际跳跃弧线由战斗时间与渲染生成 | 部分接入；命中继续程序化回退 |

跳跃荆棘不能可靠切分的具体区域（源图左闭右开坐标）：

1. `[430,674,1035,870]`：命中主体 x434—607 与后续弧线主体 x597—1030 交叠，存在连通像素，没有可信分界。
2. `[1035,674,1380,870]`：命中主体 x1043—1183 与下一弧线 x1175—1371 交叠。
3. `[1380,674,1525,870]`：仅余散落碎屑，不能据此补全被遮挡的命中动画。

需要美术补交跳跃荆棘各命中/弧线阶段的独立透明PNG，或保留间隙、明确原点的分层图；当前没有强行裁出残缺动画。

复现：在项目目录执行 `python scripts/normalize-fusion-assets.py`（Pillow、NumPy、SciPy）。输出24帧、4图标、图集、坐标报告，以及 `artifacts/fusion-extraction-contact-sheet.png` 逐帧预览。原始PNG随时可核对。

## 战斗规则与生命周期

- 深海：主伤D，半径1.8，其他目标D×45%，30%减速1.5秒；排除本次主目标，范围与直击都检查障碍。
- 水链：首伤D，后续每跳D×65%，最多三次额外跳跃，搜索3.2；每跳前等待0.10秒，再飞行0.12秒。每次半径0.7水爆D×20%；整条链的主伤和范围伤害共用去重记录。
- 散射：首次主命中后生成最多三枚子弹，D×35%，-30°/0°/+30°，最多3单位；主弹保留已有穿透，后续穿透不再分裂。子弹单次命中，不穿透、不递归、不连锁。
- 跳跃：首伤D，后续D×70%，最多三次额外跳跃，搜索3.5，约0.12秒每跳；替代普通穿透。每弹保存独立记录，目标失效安全重选，无合法目标立即结束。
- 同物种两配方按攻击轮次交替；多重发射的一轮共用配方，不提高攻击频率。重开重置顺序。
- 所有伤害、击杀、经验通过 `Combat.damageEnemy`；视图不改HP。
- `fusion.ts` 管战斗参数；`fusion-pixels.ts` 管帧数与FPS。初始直线飞行寿命、跳跃/延迟、命中视觉、减速时间彼此独立。飞行循环，命中单次，切换FPS不改变伤害或攻击频率。
- 复用 `FirePixelView` 的有限实例批次，水草独立图集，NearestFilter、无mipmap。弹体24、效果48、像素实例120上限；池满减少派生/绘制，不丢已发生的主伤，无命中时创建材质或纹理。
- 暂停冻结模拟与动画；死亡结束与重开清除弹体、伤害记录、跳跃目标、延迟、命中特效和绘制计数。重开复用已加载资源；销毁释放纹理、几何、材质，晚到加载回调不能重新附着。
- 缺图时回退已有程序化弹体、水环、碎屑；图标缺失保留SVG与文字。
- 焰绒火花、火种、爆炸与旧三兽入口继续保留。

## 验证与截图

首个深海泡影定向浏览器测试通过后，再验证其余三种素材。截图来自真实 Game/Combat/Three.js 渲染，使用确定的敌人位置和真实升级卡选择，便于比较；不是素材图或生成图，也不是手机真机测试。

每种技能有844×390与568×320两个横屏截图：`artifacts/fusion-deep-bubble-*.png`、`fusion-chain-bubble-*.png`、`fusion-thorn-scatter-*.png`、`fusion-jump-thorn-*.png`。

最终结果（源码停止修改后串行验证）：

| 命令 / 范围 | 真实结果 | 记录 |
| --- | --- | --- |
| `npm run build` | 通过，TypeScript与Vite均成功 | `artifacts/p3a-build.txt` |
| `npm test -- --reporter=list` 全量首轮 | 376通过、8失败、4跳过，耗时16.3分钟；不是全绿 | `artifacts/p3a-full-test-summary.txt` |
| `npm test -- --last-failed --reporter=list` | 7通过、1失败 | `artifacts/p3a-retest.txt` |
| 修复WebKit选兽Escape后再次 `--last-failed` | 1通过；首轮8个失败项至此均已通过复测 | `artifacts/p3a-menu-retest.txt` |
| 最终素材＋水草模型/UI＋敌人减速模型＋幻兽选择，在Chromium/WebKit串行运行 | **76通过、0失败、0跳过，2.2分钟** | `artifacts/p3a-final-focused.txt` |
| `git diff --check` | 通过 | 命令无错误输出 |

最终76项的完整命令：

```text
npm test -- tests/elemental-assets.spec.ts tests/elemental-fusion-model.spec.ts tests/elemental-fusion-ui.spec.ts tests/enemy-motion-model.spec.ts tests/creature-selection.spec.ts --reporter=list
```

首轮失败原因和处理：角度测试错误地做浮点精确比较，已改为误差比较；敌人减速测试还期待旧0.55倍速度，已按新计划更新为0.7。开发期间另开测试进程清理同一test-results目录，造成三个trace文件ENOENT；开发热更新也造成页面上下文失效。停止源码修改、串行复测后这些用例通过。另有WebKit选兽面板的真实Escape问题：触摸按钮不保证焦点留在面板，原监听只在面板内部；现在窗口级Escape会先关闭仍可见的选兽面板，保留原按钮和选择流程。其他暂停/键盘失败项复测已通过。没有把首轮失败隐去或声称重新跑过一次全绿全量。

四个全量跳过项都是WebKit不支持Chromium CDP原生多指触摸注入，原测试明确跳过；不是技能逻辑跳过。焰绒融合、八方向动画、三兽跟随和自动攻击在首轮的两浏览器主要回归用例均通过。

构建保留Three.js约639.90kB压缩前分包的非致命体积告警，没有擅自扩展成打包架构重构。产物 `dist/assets/pixel/skills/fusions/` 含24独立帧与图集，图集哈希与源一致。未做Android/iPhone物理设备或帧率/温升基准，不宣称手机性能达标。

截图（真实引擎的受控战斗场景，位置固定，技能伤害正常结算）：

| 技能 | 844×390 | 568×320 |
| --- | --- | --- |
| 深海泡影 | [截图](../artifacts/fusion-deep-bubble-844.png) | [截图](../artifacts/fusion-deep-bubble-568.png) |
| 连环水爆 | [截图](../artifacts/fusion-chain-bubble-844.png) | [截图](../artifacts/fusion-chain-bubble-568.png) |
| 荆棘散射 | [截图](../artifacts/fusion-thorn-scatter-844.png) | [截图](../artifacts/fusion-thorn-scatter-568.png) |
| 跳跃荆棘 | [截图](../artifacts/fusion-jump-thorn-844.png) | [截图](../artifacts/fusion-jump-thorn-568.png) |

[逐帧提取预览](../artifacts/fusion-extraction-contact-sheet.png)、[源图切分审查（红框为拒绝区域，黄框为独立图标）](../artifacts/fusion-source-audit.png)。

交付范围止于P3-A。四种战斗机制已实现并验证，跳跃荆棘的像素命中动画仍需美术修复；当前安全回退，不能把它表述为四套原始像素动画全部完成。
