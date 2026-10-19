# 荆冠兽王素材接入（2026-10-19）

素材首次接入时主线为阶段 D，仅添加独立动画组件与预览，未开发 Boss 战斗。随后阶段 E 已将该组件接入第六波正式 Boss，详见 [V5.3-E-REPORT.md](V5.3-E-REPORT.md)。本记录保留素材审查和组件约定，工作区原有未提交改动保留。

启动 `npm run dev` 后打开 `/crownthorn-preview.html`。构建也输出这个独立页面；可选八方向、七种动作、暂停、重播与重置，手机窄屏可用，切后台自动暂停。

## 素材审查

全部原 PNG 保留。`scripts/normalize-crownthorn.py` 使用 Pillow、numpy、scipy 提取 alpha ≥24 的连通轮廓，派生 `public/assets/pixel/boss/Crownthorn/runtime/` 图集与 `audit.json`。审计记录原图 SHA-256、来源尺寸、有效帧、拒绝原因、变换和脚底锚点。非均匀排布没有按等宽网格硬切；保留与主体分离的施法粒子，只剔除不超过 8 像素的孤立导出噪点。

| 素材 | 可用 / 原定帧 | 限制（从 1 开始计数） |
| --- | --- | --- |
| 五方向 | 5/5 | 左前、左侧、左后复用右侧水平镜像 |
| 待机 | 4/4 | 替换后完整 |
| 蓄力冲刺 | 4/4 | 替换后完整 |
| 冲刺 | 4/4 | 完整 |
| 扇形弹幕施法 | 4/4 | 完整，保留分离的紫色施法粒子 |
| 召唤 | 4/4 | 替换后完整 |
| 狂暴待机 | 6/6 | 替换后完整 |
| 死亡 | 6/6 | 完整，播完保留最后一帧 |

用户替换 `Idle.png`、`Dash Windup.png`、`Summon.png`、`Enraged Idle.png` 后已重新审查：四张分别为 1024×256、1024×256、1024×256、1536×256，均具有原定数量的独立轮廓，没有贴边截断。已删除旧素材粘连槽位的硬编码，恢复七套动作的完整顺序帧（共 32 帧，另有 5 张方向帧），重新生成图集、来源哈希及脚底变换记录。处理脚本如发现独立轮廓数与预定帧数不一致会直接报错，要求重新审查。

此前版本的待机、狂暴待机第 3、4 帧粘连，以及蓄力第 1 帧、召唤第 4 帧截断问题已由替换素材解决。没有补画、复制帧或虚构其他方向动作；未来战斗控制器仍应独立控制攻击时序。

## 组件约定

- `CrownthornAnimator.step(dt, dx, dz, basis)` 接收实际移动位移和镜头屏幕基向量，复用 `screenFacing` 的八方向与边界迟滞。零位移保留逻辑朝向。
- `play(null)` 使用移动方向素材；停下时显示正面待机。`play(action)` 显式覆盖为正面动作，逻辑移动方向继续更新；`play(action, true)` 从头重播。死亡、蓄力、施法和召唤结束停在末帧，冲刺和待机循环。`reset()` 重置状态；无显式 step 不推进时钟。
- `CrownthornView` 是 Three.js billboard，只改变视觉。位置由外部控制器设置 `group.position`。不直接旋转平面实现转身，不处理目标、碰撞、伤害或预警。
- 复用 `clipFrame`、`PixelTextureCache` 与提取出的 `configurePixelFrame`，每个实例拥有独立 UV，不改变共享纹理的 offset/repeat。最近邻、无 mipmap、alpha 裁切与现有角色一致。
- 统一 512×512 单元、脚底 (256,480)，脚底水平位置由最低 12% 接触带确定，避免只锚定某一个最低脚趾。每张动作表使用一个固定缩放因子，以首个直立姿态对齐 280 像素参考高度，保留蓄力下蹲和死亡倒塌的相对尺寸；不逐帧拉伸或缩放到同高。
- 图集加载失败时明确报告，能加载五方向图时回退正面静态帧；全部不可用时隐藏并显示错误状态。`inspect()` 区分请求动作与实际回退素材。`dispose()` 释放纹理引用与材质，迟到回调不会重新挂载。

## 验证

测试见 `tests/crownthorn.spec.ts`，覆盖投影与镜像、正面动作覆盖、死亡末帧、原图哈希和素材缺陷、解码后透明边距和脚底线、最近邻、暂停/后台、窄屏、失败回退与释放后迟到加载。截图保存于 `artifacts/crownthorn-preview.png`、`artifacts/crownthorn-preview-mobile.png`。

- `npm run build`：通过 TypeScript 与生产构建；仍有 Three.js 共享包大于 500 kB 的构建提示。
- 四张替换素材接入后重跑 `npx playwright test tests/crownthorn.spec.ts`：Chromium、WebKit 共 10 项通过。新增完整顺序帧播放、循环/末帧行为、全部 37 个槽位可用及预览完整性提示检查；保留真实 GPU 八方向像素检查、窄屏 resize、暂停/后台、加载失败与资源释放验证。已人工检查 `artifacts/crownthorn-runtime-audit.png` 的全部派生帧。
- 首次接入时针对现有 `creature-animation-model`、`creature-animation-ui`、`creature-animation-assets`、`companion-animation`、`enemy-hit-facing`、`run-flow`、`run-flow-ui`，使用 `--config=playwright.chrome.config.ts`：28 项回归通过。覆盖历史编队、原有角色动画、受击朝向和六波流程。测试生成的旧角色截图已恢复到测试前版本。本轮替换只调整 Boss 素材、帧序列、预览说明与审查脚本，未重跑这 28 项。
- `git diff --check`：通过。没有运行整个测试目录；没有进行完整 Boss 战斗或 Android/iPhone 真机验收。

执行测试时应单次运行或使用不同 output 目录，避免多个 Playwright 进程同时清理 `test-results`。桌面 WebKit 不等于 iPhone 真机验收。

本机 WebKit 在 resize 后的 Playwright 截图未捕获 WebGL 图层，但立即读回 GPU 仍可确认角色像素；因此保存的桌面/窄屏截图采用 Chromium。WebKit 窄屏最终合成显示仍需实机复核，不把 GPU 读回等同于 iPhone 视觉验收。
