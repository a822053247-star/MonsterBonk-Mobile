# 三类敌人方向资源接入

2026-10-19。工作区已有上一轮融合开发、测试截图等未提交内容，本轮保留这些内容，未执行重置或清理。

## 资源审查

来源：`public/assets/pixel/enemies/direction/`。三包分别是 grass-monster-directions（normal）、runner-bug-directions（fast）、rock-armor-bug-directions（tank）。每包实际有一张1280×256 RGBA图集和五张256×256独立图，逐像素确认独立图与图集对应格一致。原始18张PNG均保留，SHA256见 `direction/normalization.json`。

从左至右：正面、右前、右侧、右后、背面。左前、左侧、左后用水平镜像，覆盖八方向。资源是五方向静态姿态，现有轻微步态起伏继续使用；本轮没有增加逐帧腿部走路动画。

原始元数据的脚底基准并不全部等于真实可见像素底部。处理脚本先按alpha≥24测量有效边界，清理低透明背景噪点、将近乎不透明内部alpha≥248设为255，然后生成非破坏性副本。每个新图集仍是五个256×256格子，统一脚底 `(128,240)`，至少16像素透明边距，使用最近邻缩放。每个物种共用基础比例，保留正侧方向的自然姿态差别。

岩甲虫背面的有效高度208像素，其他四向最大166像素；直接接入会在转身时突然长大。对背面额外乘166/208，再统一基础显示比例，校正记录于 `sizeCorrection`。三个运行图集分别位于原包内的 `runtime.normalized.png`，原图未覆盖。

重建命令（Pillow、NumPy）：

```text
python scripts/normalize-enemy-directions.py
```

[素材对齐预览](../artifacts/enemy-direction-contact-sheet.png)。

## 游戏行为

- 朝向来自敌人本次模拟的真实位移 `x-previousX / z-previousZ`，经相机右/上向量投影到屏幕，再选择八向；不会拿追踪目标的方位替代绕障或滑动时的真实方向。
- 复用角色方向算法的角度滞回，减轻分区边缘抖动。停止时保留最后方向，新实体默认正面。
- 每个实例有独立的列索引和镜像UV属性，整张平面仍面向相机；不是转动平面冒充背面，也不修改共享纹理的offset/repeat。
- 保留三个实例化批次、三个纹理缓存项与每类48实例容量，不为每只敌人创建纹理或材质，48敌人测试中绘制调用数量不随数量增加。
- 方向状态只保留当前可见实体及短暂尸体，尸体结束后移除；重开清空，暂停冻结。死亡特效保存敌人ID和最后位移，沿用死亡前朝向。
- 保留受击闪白、缩小消散、阴影、生命条、冲刺预警与遮挡深度。规范化透明脚底由顶点锚点补偿，形象不会因方向切换悬空。
- 方向图缺失或尺寸异常时，仅该类型回退原静态PNG；两种资源都失败时沿用原有几何/岩甲虫标记回退。加载结束晚于销毁时不会重新附着资源。
- 敌人追踪、碰撞、伤害、速度、掉落和融合规则未改动；Combat只为死亡特效增加方向所需的显示元数据。

## 验证

第一轮Chromium素材/敌人专项：19通过，0失败。

构建通过（TypeScript及Vite），日志：[enemy-direction-build.txt](../artifacts/enemy-direction-build.txt)。保留原有Three.js约639.90kB分包体积告警，没有宣称手机帧率或温升达标。

两浏览器扩展回归命令：

```text
npm test -- tests/enemy-directions.spec.ts tests/enemy-motion-ui.spec.ts tests/enemy-pixel.spec.ts tests/enemy-motion-model.spec.ts tests/combat-model.spec.ts tests/fusion-model.spec.ts tests/elemental-fusion-model.spec.ts tests/companion-animation.spec.ts tests/fusion-ui.spec.ts tests/creature-animation-ui.spec.ts --reporter=list
```

结果：**151通过、1失败、0跳过**，4.4分钟，[完整日志](../artifacts/enemy-direction-final-tests.txt)。其中敌人方向/渲染专项在Chromium与WebKit全部通过。唯一失败是旧焰绒视觉测试在视口变化后预期4个瞬时特效、实际已推进至2个；单独复测通过，见 [复测日志](../artifacts/enemy-direction-retest.txt)。

旧视觉测试原本只调用sleep，窗口resize仍可能唤醒playing模式。现在只在该受控视觉用例中固定paused模式并手动推进Combat，避免渲染断言与实时模拟竞争；没有为此改游戏运行逻辑。两浏览器各重复三次，**6/6通过**，[稳定性记录](../artifacts/enemy-direction-stable-visual-tests.txt)。未声称重新执行过第二轮全量回归。

手机双尺寸方向截图在每个尺寸独立创建Game，并持续呈现冻结场景，避免暂停后的WebKit截图合成取得空白画布；两浏览器共**4/4通过**，两尺寸图片均经人工查看，[截图验证记录](../artifacts/enemy-direction-screenshot-tests.txt)。

`git diff --check`通过。原图哈希检查、48实体绘制与资源复用、加载期间销毁、旧三兽、焰绒融合、水草融合模型、角色八方向/伙伴动画均在上述检查内。没有运行Android/iPhone物理设备测试。

真实游戏引擎受控场景截图（不是素材图）：

- [三类敌人八方向，844×390](../artifacts/enemy-directions-eight-844.png)
- [三类敌人八方向，568×320](../artifacts/enemy-directions-eight-568.png)
- [实际追踪移动](../artifacts/enemy-motion-pursuit-844.png)

八方向图从左至右为上、右上、右、右下、下、左下、左、左上；从上至下是草怪、奔跑虫、岩甲虫。该图固定敌人位置验证同时选帧；另有真实追踪测试验证位移与朝向对应。

测试覆盖三类各八种不同GPU像素输出、镜像、停止保持方向、旋转相机投影、死亡方向、尸体状态清理、原图哈希、透明边距、缺图回退、48敌人资源复用，以及既有角色/伙伴动画与融合战斗。浏览器模拟不代表Android/iPhone物理设备测试。
