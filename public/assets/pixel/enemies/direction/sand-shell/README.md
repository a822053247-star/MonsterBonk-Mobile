# 沙甲团兽贴地对齐

2026-10-23：原图集实际可见身体底部约在第188–191像素，透明杂点却延伸至第240像素，造成主体与脚下圆圈分离。

`scripts/align-sand-shell-feet.py` 清除alpha低于24的杂点，将五个方向的可见身体分别下移49–52像素，统一落在第240像素。保持主体原像素大小、水平位置及此前1.5倍显示尺寸配置，不改变脚下圆圈、碰撞或战斗属性。基础正面单图同步更新。

- `source.before-ground-alignment.png` 保存修正前图集，用于重建。
- `ground-alignment.json` 保存各方向原边界与下移量。
- 重建：项目根目录执行 `python scripts/align-sand-shell-feet.py`。
- 素材预览：`artifacts/sand-shell-ground-alignment.png`。

只核对素材预览，未运行代码测试或游戏实测。
