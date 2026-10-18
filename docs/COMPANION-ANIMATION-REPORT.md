# 泡泡螈与芽刺兽移动动画

新素材位于 `public/assets/pixel/skills/animation/`，原图保持不变。已有“三兽编队原型”入口中的泡泡螈、芽刺兽现在使用八方向逐帧行走；V5 单兽技能融合模式仍由焰绒单独出战。

| 角色 | 原始主图集 | 原始斜向图集 | 可用帧 |
| --- | --- | --- | --- |
| 泡泡螈 | 1254×1254 RGBA | 1774×887 RGBA | 24 |
| 芽刺兽 | 1254×1254 RGBA | 1774×887 RGBA | 23 |

芽刺兽主图集第一行第四帧触及原图右边缘（13 个主体像素），无法恢复边缘外的内容。该帧不参与播放，正面行走采用前三帧循环；其他行走方向与正面待机均使用四帧。芽刺兽斜向图第一行实际朝左前，已在显示配置中校准镜像，第二行仍按右后处理。没有生成或重画角色。

运行图集保存在 `public/assets/pixel/creatures/animation/`。通过连通主体提取各帧，单格 384×256，脚底锚点 (192, 240)，每个方向最高主体高度均为 220 像素，保留叶片、尾巴及四肢。每只角色有独立的 `.normalization.json`，记录原图 SHA-256、实际裁切框、锚点、缩放及弃用帧。可复现处理：

```powershell
python scripts/normalize-yanrong-animation.py --species paopaoyuan
python scripts/normalize-yanrong-animation.py --species yacishou
```

扩展现有 `CreatureAnimator` 与 `PixelSpriteRenderer`，每只角色仅加载自身两张图集，通过独立材质 UV 选择帧，共享图集纹理。实际位移经当前相机投影决定朝向，停步保留方向；正面播放待机，其他朝向使用站立帧。跟随、碰撞、自动攻击、技能融合及移动速度保持原有逻辑。暂停、后台和死亡不会继续迈步，重开重置动画。斜向图缺失时使用同侧动画；图集全部失败时保留原静态 PNG。纹理引用归零时释放。

实际游戏截图：

- `artifacts/companions-moving-844.png`（844×390）
- `artifacts/companions-moving-568.png`（568×320）

新增四项有效测试覆盖两角色素材校验、八方向与特殊镜像、帧循环与停步、实际 GPU 帧变化、固定脚底与比例、真实编队跟随、暂停/后台/死亡/重开、静态回退及纹理释放。构建与完整 Chrome 回归结果见下方。

验证结果：

- `npm run build`：通过。
- `npm.cmd test -- --config=playwright.chrome.config.ts --reporter=list`：153 通过，0 失败，0 跳过（3.0 分钟）。使用本机 Chrome；没有运行 WebKit 或 Android/iPhone 真机测试。
- 两只角色六行归一化动作的最高主体高度均为 220 像素，所有可用帧脚底均为 240。
- 安全检查点：`refs/checkpoints/companions-animation-20261019-014720`，独立备份包位于 `D:/projects/MonsterBonk-Mobile-backups/companions-animation-20261019-014720/before-animation.bundle`；工作分支与原索引未切换。

## 三兽入口焰绒静止修复

发现原主控动画开关仅判断 `fusionEnabled`，导致三兽编队的焰绒位置能移动、显示却仍为静态图。启动三兽模式时现已同时开启主控动画，仍保留 `creatureAnimation=static` 回退开关。新增通过真实三兽入口移动的回归测试，验证焰绒实际位移、四帧循环与停步保留朝向。修复前测试在 `animation.enabled=false` 处失败，修复后通过。

本次 `companion-animation`、`creature-animation-ui`、`fusion-ui` 三组测试共 20 通过、0 失败、0 跳过；`npm run build` 通过。截图：`artifacts/legacy-yanrong-animation-fixed.png`。前述 153 项为上轮完整回归结果，本轮执行上述相关回归。
