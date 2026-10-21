# VFX Presets V1 验收记录

日期：2026-10-21。分支：`feat/vfx-presets-v1`。原始提交：`d71efa5`。

## 修改前

- 工作区初始无未提交修改；已创建指定独立分支。
- 已阅读 Combat / CombatView / ParticleFeedback / FirePixelView / ReactionView / CombatClarity / FusionPixels / Quality / UpgradeArt / RunBuild / package.json。
- `npm run build` 成功，存在原有 Three.js 大包提示。
- 相关 Chromium 基线：18/18 通过（粒子、清晰度模型、触发遗物）。
- 武器与波次平衡脚本均成功，保存 JSON 与日志。
- 初次并行测试发生共享 trace 输出目录冲突；隔离输出目录重跑 18/18 通过。初次完整测试未跑完，保留日志，不作为完整通过依据。

## 本次功能验收

- `npm run build` 成功。
- 最终相关测试：48/48 通过（Chromium + WebKit），包含新增 12 项和原有相关 36 项。
- 首页自然战斗：4/4 通过（两种武器 × 两种浏览器）。没有替换首页、注入战斗对象或强制命中。
- 新预设可直接注册并分配给现有 spark/bubble/steam；测试检查实际图集帧、实例颜色、矩阵尺寸、拖尾 alpha、自定义冲击环与范围轮廓。
- 正式 Game/CombatView 中由真实弹体碰撞生成命中，由真实水命中 + 火命中 + 沸腾核心生成蒸汽，未手工注入新伤害区域。
- 屏幕像素差异 > 10；同一帧反复渲染 80 次不改变战斗数据，GPU 几何体/纹理数不增长。
- 暂停冻结、恢复后事件到期、重开清理、旧模式反馈隔离、画质 battery/auto/high、图集加载失败回退均通过。
- 火/水/蒸汽截图已保存并人工查看。属于正式战斗渲染器的确定性场景；不是另建的展示渲染器。
- 移动端实机 GPU 帧率未测试；桌面 Chromium/WebKit 软件 WebGL 验证不代表实机性能结论。

## 数值对照

武器 JSON SHA-256（修改前后相同）：
`4CF3FAEB912F02BA803DDADEE463928B53AEFE5361F6430BB110F74F9D2B9530`

波次 JSON SHA-256（修改前后相同）：
`EBE33E71392BCB5EFD9F74BAE88FCFDAFD72286FEDEE2378C6702BC51713D2EF`

未修改 `src/combat.ts`、伤害、碰撞、随机数、波次时长或经济系统。

## 完整测试与原分支对照

`npm test -- --workers=4` 完整运行 1030 项：990 通过、31 失败、9 项为原测试已有条件跳过。
没有新增跳过、删除原测试或放宽断言。完整日志：`vfx-final-tests.txt`。

`npm test -- --last-failed --workers=1 --reporter=list` 串行复跑这 31 项：4 通过、27 失败。
复跑恢复的四项：伙伴贴图回退、Chromium 大量传送、遗物演示预览、WebKit 首页自动战斗。
日志：`vfx-failed-rerun-tests.txt`。完整套件没有全绿，不能据此宣称项目所有现有测试通过。

全量运行开始后补充的实际画质预设测试和首页自然战斗测试已单独执行，包含在上面的 48 + 4 项通过记录中。

使用独立端口 5174、原 HEAD 的四个已修改渲染源文件、其余相同源码与资源做对照，原分支已复现以下失败：

- combat-clarity-ui：断言最大尺寸 1.551，原分支与本次均为 2.79999995。
- creature-animation-ui：静态/动态动画启动后世界状态不同。
- elemental-fusion-ui：旧开发入口 DOM/角色预期、旧 damage 断言，以及不存在的 burstRings 字段。
- fusion-ui：旧卡片 DOM 与不存在的 burstRings 字段。
- game 首个菜单测试。
- hud-art：要求触控宽度至少 48，原分支与本次实际为 44。
- infinite-world-ui：大量传送测试超时；random-world-ui：暂停地图按钮超出 320px 高度（326.59375）。
- upgrades：旧生命值 DOM 与满级 DOM 已不存在。

详见 `vfx-old-source-tests.txt`、`vfx-old-source-more-tests.txt`、`vfx-old-source-pressure-tests.txt` 与 `vfx-old-source-upgrade-tests.txt`。
原源码差分验证使用 Chromium，已复现剩余失败涉及的所有用例类型；没有再运行一遍完整的原源码 WebKit 套件。
本次没有修改原测试断言、跳过旧测试或改动这些无关功能。

## 留存与清理

正式截图、配置示例和日志均保留。测试生成的原有已跟踪截图与平衡产物已还原，数值对照另存为 `vfx-baseline-*.json` / `vfx-final-*.json`。
自动审批拒绝临时基线目录及目录联接的删除命令（仅返回 `blocked by policy`），因此 `.vfx-baseline-runtime/` 与自建测试输出缓存仍留在本地，已通过 `.git/info/exclude` 排除，未改项目共享忽略规则。基线服务已停止。
