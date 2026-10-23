"""Repack the supplied five poses with shared scale; no generative edits."""
from pathlib import Path
import json
import shutil
import argparse
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('source', nargs='?')
parser.add_argument('--species', choices=['crystal-crawler', 'scarlet-flower', 'spore-floater', 'nightshade-bat', 'frost-fluff'], default='crystal-crawler')
args = parser.parse_args()
species = args.species
OUT = ROOT / 'public/assets/pixel/enemies/direction' / species
SOURCE = OUT / 'source.png'
if args.source:
    supplied = Path(args.source)
    if supplied.resolve() != SOURCE.resolve():
        shutil.copyfile(supplied, SOURCE)

image = Image.open(SOURCE).convert('RGBA')
# The supplied PNG contains almost invisible stray alpha around the strip.
# Match the existing direction normalizer's cutoff before measuring silhouettes.
image.putalpha(image.getchannel('A').point(lambda value: 0 if value < 24 else value))
# Source is transparent, not a black backdrop. Split in actual empty gutters,
# never by five equal widths: the two middle silhouettes are wider than the ends.
cuts = {'crystal-crawler': [0, 414, 866, 1349, 1777, 2172],
        'scarlet-flower': [0, 459, 918, 1296, 1740, 2172],
        'spore-floater': [0, 399, 870, 1333, 1783, 2172],
        'nightshade-bat': [0, 448, 899, 1317, 1730, 2172],
        'frost-fluff': [0, 424, 863, 1331, 1750, 2172]}[species]
names = ['front', 'front-right', 'right', 'back-right', 'back']
poses = []
for index, name in enumerate(names):
    region = image.crop((cuts[index], 0, cuts[index + 1], image.height))
    bounds = region.getchannel('A').getbbox()
    if bounds is None:
        raise ValueError(f'Missing supplied pose: {name}')
    pose = region.crop(bounds)
    poses.append((name, pose, [bounds[0] + cuts[index], bounds[1], bounds[2] + cuts[index], bounds[3]]))

scale = min(200 / max(p.height for _, p, _ in poses), 224 / max(p.width for _, p, _ in poses))
atlas = Image.new('RGBA', (1280, 256))
records = []
for index, (name, pose, bounds) in enumerate(poses):
    size = (round(pose.width * scale), round(pose.height * scale))
    resized = pose.resize(size, Image.Resampling.NEAREST)
    offset = (128 - size[0] // 2, 240 - size[1])
    atlas.alpha_composite(resized, (index * 256 + offset[0], offset[1]))
    records.append(dict(direction=name, sourceBounds=bounds, size=size, offset=offset))
atlas.save(OUT / 'runtime.normalized.png')
atlas.crop((0, 0, 256, 256)).save(ROOT / 'public/assets/pixel/enemies' / f'{species}.png')
(OUT / 'crop.json').write_text(json.dumps(dict(source='source.png', sourceSize=image.size,
    cell=256, bodyHeight=200, maxWidth=224, foot=[128, 240], scale=scale, frames=records),
    ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

preview = Image.new('RGB', atlas.size, '#263c36')
preview.paste(atlas, mask=atlas.getchannel('A'))
draw = ImageDraw.Draw(preview)
for i in range(5):
    draw.rectangle((i * 256, 0, (i + 1) * 256 - 1, 255), outline='#59776d')
    draw.line((i * 256 + 16, 240, i * 256 + 240, 240), fill='#8bd8b5')
preview.save(ROOT / 'artifacts' / f'{species}-recrop.png')
print(json.dumps(records))
