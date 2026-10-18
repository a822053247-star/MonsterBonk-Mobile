# 首批原创像素素材接入验收

日期：2026-10-18。范围：在现有 Three.js 2.5D 三兽编队原型中，仅替换三只幻兽的游戏内外观。

## 实际素材审查

三兽均为 1254 × 1254 RGBA 单帧 PNG，不是动画图集。图片存在极低 alpha 的外围杂点，直接按非零 alpha 计算边界会引入大量留白。运行时以 alpha ≥ 24 计算主体边界，统一去掉低于该阈值的杂点，再裁剪透明留白；不重采样，不修改原始文件。几乎不透明的主体（alpha ≥ 248）在内存副本中转为完全不透明。

|物种|素材|主体裁剪框 x / y / 宽 / 高|
|---|---|---|
|焰绒|`public/assets/pixel/creatures/yanrong-base.png`|94 / 122 / 1132 / 1090|
|泡泡螈|`public/assets/pixel/creatures/paopaoyuan.png`|68 / 189 / 1168 / 1024|
|芽刺兽|`public/assets/pixel/creatures/yacishou.png`|156 / 157 / 1069 / 1057|

另已查看 `enemies/grass-monster.png`（1254 × 1254 RGBA）和 `enemies/runner-bug.png`（768 × 768 RGBA）。依照“第一轮只替换三只幻兽”的限制，没有加载或替换敌人，也不增加种类；现有敌人几何显示继续作为占位，尚无对应像素图的敌人也沿用占位。map 目录素材未接入交互或玩法。

## 实现

- 新增 `src/pixel-sprite.ts`：数据映射、内存裁剪、`PixelTextureCache` 与 `PixelSpriteRenderer`。Three.js Sprite 朝向相机，所有角色使用脚底锚点 `(0.5, 0)`；显示宽度为统一高度 × 裁剪后主体宽高比，移动时也不做非等比拉伸。
- 纹理设为 sRGB，放大/缩小均使用 NearestFilter，禁用 mipmaps，边缘 ClampToEdgeWrapping。当前仅 3 只幻兽，使用独立 Sprite；同种重复编队共享纹理，不按成员重复解码/上传。
- Sprite 保留 depthTest 和 depthWrite，使用与裁剪一致的 alphaTest；透明角落不写入深度，前方实物能遮挡角色。未强制置顶或穿透地图。
- 修改 `src/party-view.ts`：统一渲染三兽位置与已有插值，主控高度为伙伴的约 1.22 倍（伙伴比例 0.82），主控有浅色识别环和脚影。短横屏目标主控约 56 CSS 像素、伙伴约 46 CSS 像素；不改实体碰撞尺寸。
- 修改 `src/game.ts`：仅编队原型启用像素层，原焰绒根节点仍用于相机位置；像素主控就绪时隐藏旧模型根节点，回菜单/旧模式恢复。未改移动、跟随、敌人、经验、伤害、升级或输入规则。
- `style.css` 仅对像素编队画布设置 `image-rendering: pixelated`，防止动态降低画布分辨率后被浏览器二次平滑放大；DOM UI 不受影响。
- 释放时处理每个 Sprite 的材质和纹理租约，共享纹理在最后引用消失时 dispose；圆环、脚影和旧占位几何也释放。加载期间销毁后不会在异步完成时重新挂载资源。

素材没有方向帧或行走帧，所以保留原画方向，移动只做轻微垂直起伏；没有把单张图错误切分成动画，也没有生成新图片。

## 回退与保护

原 `Monster` 的 GLB / 旧 Sprite / 程序模型以及 P1 伙伴占位实现均保留。给 URL 加 `?partyVisual=legacy` 后，点击相同的“三兽编队原型”入口即可使用原显示。单张 PNG 缺失或解码失败只回退该成员；主控回退原焰绒，伙伴回退原彩色占位体。

本轮前检查点：`refs/checkpoints/v4-before-pixel-20261018-ce508451`，提交 `cb8bbc15c109ff5b68bb84f8e4720ed70842d003`。仓库外备份：`E:\study\game\MonsterBonk-Mobile-v4-before-pixel-20261018-ce508451.bundle`，已通过 bundle verify。原 HEAD 和暂存区不变，已有未提交内容、P1 代码及新素材已纳入快照。

已逐一比对 21 个受保护文件：战斗、编队逻辑、输入、地图、经验、相机、旧模型/Sprite 实现、试炼/挑战，以及 9 张原始 PNG，与本轮前快照内容一致。没有重建工程或引入新依赖。

## 验证与画面结论

|检查|结果|
|---|---|
|`npm run build`|通过 TypeScript + Vite；保留原 Three.js 大 chunk 提示|
|新增显示专项测试|12 通过（6 个用例分别运行 Chromium / WebKit）|
|完整现有 + 新增测试|176 通过，4 原有用例跳过，0 失败（Chromium + WebKit，共 7.5 分钟）|
|生产构建冒烟|通过；三个 PNG 请求成功，无脚本错误/HTTP 失败，无敌人像素图片请求|
|实际输入与生命周期|生产版触摸摇杆、自动击杀、暂停和重开通过；编队移动/跟随/独立攻击继续由原自动测试覆盖|

专项测试覆盖：三张图比例、NearestFilter、禁用 mipmaps、脚底锚点、主控/伙伴尺寸；新旧显示的确定性移动、碰撞、攻击和经验结果一致；真实 WebGL 深度遮挡与透明角落；全部素材缺失回退；同种纹理共享；正常释放和加载期间销毁后的资源释放。

实际生产画面：`artifacts/pixel-production-844.png`（844×390）与 `pixel-production-568.png`（568×320）。已查看两张截图：火/水/草三色和深色像素描边在浅绿色低多边形地形上有清楚分层，没有矩形底色、拉伸或黑色透明边。主控脚环可见，近距离编队存在自然的局部遮挡，但三张脸仍可辨认；没有为避开视觉遮挡而修改原跟随距离或碰撞。

本轮仍是 2D 像素角色与轻量 3D 地图混合的视觉方案，没有把地图或 UI 整体像素重制。菜单、旧模式、敌人显示保持原样。截图来自桌面 Chromium 软件 WebGL 的手机横屏模拟，不代表 Android/iPhone 真机，也没有宣称实测 30/60FPS。

4 项跳过是原有的 WebKit 不支持 Chromium CDP 多点触摸注入用例，对应 Chromium 用例通过。新增 12 项全部通过，原有 164 项也通过。

日志：`artifacts/pixel-build.txt`、`pixel-focused-tests.txt`、`pixel-full-tests.txt`、`pixel-production-smoke.json`。旧自动测试覆盖的历史截图已恢复至本轮前快照；新的像素验收截图使用 `pixel-` 前缀保留。
