# 雪原图集提示词

工具：内置 `image_gen.imagegen`；两次均设置 `transparent_background: true`。最终选择第二次输出，复制到 `public/assets/scenery/snowfield-props-atlas.png`。用户原图保留在同目录的 `snowfield-props-reference.png`。

## 第一次：网格整理与背景提取

Background extraction for a game sprite atlas. Edit target is the supplied image. Remove ALL dark blue/gray background and background glow, replace with actual transparent alpha. Preserve all sixteen snow/ice obstacle sprites, their crisp pixel-art silhouettes, colors, details and proportions. Arrange in an exact 4 columns by 4 rows uniform grid on a 1536x1024 transparent canvas: each cell 384 wide x256 high. Original first row five objects: redistribute all original sixteen objects in reading order into the new 4x4 grid. Every sprite must fit completely inside its cell with 20px transparent margin on every side, bottom centered at cell bottom minus 20px. Keep isolated objects, no overlap or stray particles outside cells. No added objects, text, background, drop shadows or surrounding glow. Preserve blue flame atop pedestal and the frozen pond; pond is one obstacle sprite. Clean transparent padding.

## 第二次：最终透明图集

Edit target: supplied 4x4 sprite atlas. CRITICAL remove the entire dark smoky blue background everywhere, including gaps between and inside sprites, and surrounding blue glows. Output must be genuine RGBA transparency, no opaque background pixels. Keep exactly the same 4x4 grid layout and sixteen isolated snow/ice objects in their existing cells. Do not move or resize objects. Preserve the solid objects and their black edge outlines, blue flame is part of object. This is a clean transparent-background game cutout atlas, NOT an illustration on a dark background. No ground plane, no glow around objects, no checkerboard painted into image. Canvas 1536x1024.

图集实际各行并非严格等高，接入采用逐项显式裁切，避免按理论格子截断主体。宽高与背景alpha已读取检查；游戏内渲染尚待手动体验。
