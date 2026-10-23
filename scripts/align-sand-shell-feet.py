"""Align existing sand-shell silhouettes to the ground without resizing art."""
from pathlib import Path
import json
import shutil
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/assets/pixel/enemies/direction/sand-shell'
runtime = OUT / 'runtime.normalized.png'
source = OUT / 'source.before-ground-alignment.png'
if not source.exists():
    shutil.copyfile(runtime, source)
image = Image.open(source).convert('RGBA')
image.putalpha(image.getchannel('A').point(lambda a: 0 if a < 24 else a))
atlas = Image.new('RGBA', (1280, 256))
records = []
for i, direction in enumerate(['front', 'front-right', 'right', 'back-right', 'back']):
    frame = image.crop((i * 256, 0, (i + 1) * 256, 256))
    bounds = frame.getbbox()
    if bounds is None:
        raise ValueError(f'Missing pose: {direction}')
    body = frame.crop(bounds)
    offset = (bounds[0], 240 - body.height)
    atlas.alpha_composite(body, (i * 256 + offset[0], offset[1]))
    records.append(dict(direction=direction, bounds=bounds, offset=offset, shiftY=240-bounds[3]))
atlas.save(runtime)
atlas.crop((0, 0, 256, 256)).save(ROOT / 'public/assets/pixel/enemies/sand-shell.png')
(OUT / 'ground-alignment.json').write_text(json.dumps(records, indent=2) + '\n', encoding='utf-8')
preview = Image.new('RGB', atlas.size, '#263c36')
preview.paste(atlas, mask=atlas.getchannel('A'))
draw = ImageDraw.Draw(preview)
for i in range(5):
    draw.rectangle((i*256, 0, (i+1)*256-1, 255), outline='#59776d')
    draw.line((i*256+16, 240, i*256+240, 240), fill='#8bd8b5')
preview.save(ROOT / 'artifacts/sand-shell-ground-alignment.png')
print(json.dumps(records))
