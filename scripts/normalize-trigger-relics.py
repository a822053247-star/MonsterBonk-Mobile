"""Slice the user-provided six-icon strip; preserve its original RGBA transparency."""
from pathlib import Path
from PIL import Image
import hashlib
import json

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'public/assets/ui/raw/六件奇幻魔法道具图标.png'
OUT = ROOT / 'public/assets/ui/upgrade/illustrations/relics'
BOXES = {
    'draft-martyr-core': (0, 175, 320, 550),
    'draft-kindling-flask': (320, 175, 660, 550),
    'draft-thorn-testament': (660, 175, 975, 550),
    'draft-bubble-spore': (995, 175, 1300, 560),
    'draft-echo-bone-dice': (1300, 175, 1648, 560),
    'draft-slaughter-hourglass': (1648, 175, 1950, 560),
}

if __name__ == '__main__':
    original = Image.open(SOURCE).convert('RGBA')
    OUT.mkdir(parents=True, exist_ok=True)
    for name, box in BOXES.items():
        tile = original.crop(box)
        tile = tile.crop(tile.getbbox())
        tile.thumbnail((256, 256), Image.Resampling.LANCZOS)
        canvas = Image.new('RGBA', (288, 288))
        canvas.paste(tile, ((288-tile.width)//2, (288-tile.height)//2))
        canvas.save(OUT / (name+'.png'))
    (OUT / 'trigger-relics-manifest.json').write_text(json.dumps({
        'source': SOURCE.relative_to(ROOT).as_posix(),
        'sha256': hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
        'preservedAlpha': True, 'icons': BOXES,
    }, ensure_ascii=False, indent=2), encoding='utf-8')
