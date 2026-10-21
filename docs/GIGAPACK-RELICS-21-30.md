# 第21–30件 Gigapack 遗物交付记录

分支：`codex/gigapack-relics-21-30`。基于已存在的前20件有效代码提交 `b059aa9`；前20件 PR #17 尚未合入 main，因此本PR以 `codex/gigapack-relics-11-20` 为基线，只展示本批新增。

唯一新增内容规格：随附 JSON 原件 `monsterbonk_gigapack_relics_21_30_spec.json`，未修改其内容。路径中的 `effects/` 沿用已确认的真实素材根映射。

## 两批实现

21–25（余震熔晶、逆潮波纹、蓄能膛室、苍蓝守印、疾风共振）完成后构建通过。26–30（无瑕光轮、炽焰卫星、棱光星雨、赤痕回响、星辉磁环）完成后构建通过。两批共用一个功能分支。

- 余震接入真实主火系爆炸事件，记录实际范围命中数、原爆心和共享根链标记。
- 推波复用现有遮挡及位移，不造成伤害或改变攻击意图、预警计时；Boss免疫。
- 蓄能复用主弹体和伤害账本，覆盖普通火花、水泡弹射及穿透路径，不重复命中同一敌人。
- 统一受伤顺序：原有有效性/无敌校验 → 虚空收纳匣全额抵消 → 苍蓝守印减伤 → 实际掉血事件 → 原有心瓣治疗。完整抵消不会消耗守印或重置无伤计时。
- 疾风共振复用正式攻击冷却时钟；主范围爆炸计入主攻击，派生和DOT不计入。
- 卫星复用伴星的角速度、扫掠碰撞函数和命中半径（JSON未另定这三项），持续、轨道半径、每目标节流和伤害完全按JSON；同一时刻最多一枚。
- 星雨复用已有派生弹发射、索敌和弹池；增加共享施放ID及永久单次触发标记，要求不同主弹与不同敌人同时满足。
- 赤痕回响复用原有攻击快照/复制队列，不记录复制为主施放；新派生伤害显式 suppressRelics，禁止反向驱动其他遗物或DOT。
- 经验磁吸只标记已有宝珠，按距离选最多12颗，不生成经验，不改宝珠面值。
- 仍使用24弹、48特效，6次/tick与24次/秒派生预算；未为每件遗物新建引擎或渲染类。六波、Boss数值、旧模式和原遗物数值未改。

## 未来双武器融合兼容边界

`weapon-traits.ts` 为当前四种武器声明 fire/water/grass、projectile/melee、真实 explosion 能力。新遗物的资格与触发使用能力标签；攻击快照携带实际武器标签、基础伤害和施放来源。

`RunBuild.registerFusionCapabilities` 提供未来融合接入点：继承双亲标签和来源，并要求融合适配器显式声明保留原始身份事件及主命中、施放、投射物、爆炸、击杀、受伤、冲刺、升级和金币事件。`assertFusionPreservesRelics` 在遗物、父武器能力或事件丢失时抛错，禁止静默接受。当前没有新增武器融合算法；未来实现必须通过该边界并实际交付原始来源事件，才能维持前20件按原武器ID触发的行为。继承元数据本身不伪装成融合实现。

## 实际新增素材

下列均相对根目录 `public/assets/pixel/effects/Super Pixel Effects Gigapack (Free Version)/`；每张 PNG 对应同目录 `spritesheet.txt`，读取实际矩形、按 PNG 尺寸校验，15 FPS来自随包 guide.txt。保留前批11张绑定，只增加本批10张绑定；只预热已装备遗物。

| 遗物 | 真实Spritesheet |
|---|---|
| 余震熔晶 | `spritesheet/Explosions/epic_explosion_001/epic_explosion_001_small_orange/spritesheet.png` |
| 逆潮波纹 | `spritesheet/Magic Bursts/directional_bubble_burst_001/directional_bubble_burst_001_small_green/spritesheet.png` |
| 蓄能膛室 | `spritesheet/Sci-fi/scifi_charge_up_001/scifi_charge_up_001_small_yellow/spritesheet.png` |
| 苍蓝守印 | `spritesheet/Fantasy Spells/spell_defense_up_001/spell_defense_up_001_small_blue/spritesheet.png` |
| 疾风共振 | `spritesheet/Fantasy Spells/spell_haste_001/spell_haste_001_small_green/spritesheet.png` |
| 无瑕光轮 | `spritesheet/Magic Bursts/round_light_burst_001/round_light_burst_001_small_yellow/spritesheet.png` |
| 炽焰卫星 | `spritesheet/Fire/fire_looping_004B/fire_looping_004B_small_orange/spritesheet.png` |
| 棱光星雨 | `spritesheet/Magic Bursts/round_sparkle_burst_002/round_sparkle_burst_002_small_green/spritesheet.png` |
| 赤痕回响 | `spritesheet/Splatters/burst_splatter_001/burst_splatter_001_small_red/spritesheet.png` |
| 星辉磁环 | `spritesheet/Fantasy Spells/status_sparkling_001/status_sparkling_001_small_yellow/spritesheet.png` |

`透明背景奇幻魔法图标精灵图.png` 从左到右对应21–30，裁为十张独立256×256透明PNG；可见主体外近透明杂点不影响边界。沿用原卡片模板、商店和图标回退；没有重做UI。

图标复现：`python scripts/crop-gigapack-icons.py <用户原图路径> docs/monsterbonk_gigapack_relics_21_30_spec.json`。图集元数据复现：`node scripts/import-gigapack.mjs`。随包许可允许游戏内分发且要求署名，沿用已有设置页的 Will Tice / unTied Games 署名；不修改或另行分发原始素材包。

## 验证

- `npm run build`：通过；保留原有Three分块大小提示。
- `npm run content:check`：通过，31件工厂遗物。
- **46/46定向测试通过（16.0秒）**：本批10件参数化机制 + 真实素材矩形 + 融合兼容 + 两种真实穿透 + 派生隔离/饱和预算及重复目标时间窗口共16项；1次本批浏览器流程；前10件11项、11–20件13项、前批浏览器1项、VFX4项。
- 完整命令：`npx playwright test tests/gigapack-21-30.spec.ts tests/gigapack-21-30-smoke.spec.ts tests/behavior-relics.spec.ts tests/gigapack-relics.spec.ts tests/gigapack-smoke.spec.ts tests/vfx-presets.spec.ts --config=playwright.chrome.config.ts --reporter=list`。
- 复跑曾遇到旧测试覆盖固定PNG的Windows `UNKNOWN: open` I/O错误；保留最近一次失败日志 `tests-screenshot-io-failure.txt`。两个既有浏览器测试仅将截图路径改为 `testInfo.outputPath`，所有机制/商店/图标断言保持原样；最终完整所选46项通过。
- 未使用grep排除、test.skip或删除测试。未执行全量Playwright或所有平衡模拟；CI未改。
- 新浏览器流程实际触发余震爆炸、旋转卫星、三枚索敌星屑及12颗已有经验宝珠的磁吸；检查资源加载、控制台、真实帧缓冲像素、暂停与重开清理。
- 日志与四张真实截图：`artifacts/gigapack-21-30/`。测试可能更新既有截图输出，这些旧输出不纳入本次PR。

保留用户工作区原有旧 `public/assets/effects` 删除记录及上一轮颜色审查产物，不纳入本次提交。
