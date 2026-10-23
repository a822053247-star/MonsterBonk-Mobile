# 夜影蝠五方向素材

- `source.png`：用户提供的2172×724原图，保留原样。
- `runtime.normalized.png`：1280×256，五个256×256格，依次为正面、右前、右侧、右后、背面；左向由运行时镜像。
- `crop.json`：各方向在原图中的轮廓边界、统一缩放比例和格内位置。
- 重建：项目根目录执行 `python scripts/recrop-crystal-crawler.py --species nightshade-bat`；额外传入图片路径可以更新原图。

按实际透明间隔分割，去除alpha低于24的背景杂点；不按RGB黑色去背，保留耳朵、身体和翅膀的深色细节。各方向统一缩放，最大宽224/高200，底部落点为(128,240)，完整保留耳尖、翼尖和脚。同步更新基础正面单图，预览输出 `artifacts/nightshade-bat-recrop.png`。显示尺寸配置沿用此前的1.5倍调整；碰撞及战斗属性不变。
