# 孢子浮囊射手五方向素材

- `source.png`：用户提供的2172×724原图，保留原样。
- `runtime.normalized.png`：1280×256，五个256×256格，依次为正面、右前、右侧、右后、背面；左向由运行时镜像。
- `crop.json`：原图轮廓边界、统一缩放比例和各帧落点。
- 重建：项目根目录执行 `python scripts/recrop-crystal-crawler.py --species spore-floater`；额外传入图片路径可以更新原图。

按真实透明间隔分割，避免等分原图造成喷口截断或混入相邻帧碎片。清除alpha低于24的背景杂点，保留主体原色与细节。各方向共享缩放比例，最大宽224/高200，底部对齐(128,240)。同步更新基础正面单图；预览为 `artifacts/spore-floater-recrop.png`。不修改朝向映射、显示尺寸配置、碰撞或战斗属性。
