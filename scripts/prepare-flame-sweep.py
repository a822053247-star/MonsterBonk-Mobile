"""Repack the supplied two four-pose strips. Mechanical crop/alignment only; Pillow."""
from pathlib import Path
from PIL import Image, ImageDraw
import hashlib
import json
import shutil
import sys

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/assets/pixel/skills/flame-sweep'
# Content gutters, not an unsafe 543px cut through the unevenly spaced drawings.
CUTS = [[0, 470, 940, 1488, 2172], [0, 700, 1175, 1710, 2172]]
SIZE, ANCHOR = 448, (96, 368)

def prepare(paths):
    OUT.mkdir(parents=True, exist_ok=True)
    frames, records = [], []
    for part, path in enumerate(paths):
        original = Image.open(path).convert('RGBA')
        assert original.size == (2172, 724), 'Review source rectangles for a different input size'
        destination = OUT / f'source-{part+1}.png'
        if Path(path).resolve() != destination.resolve():
            shutil.copyfile(path, destination)
        for col in range(4):
            left, right = CUTS[part][col:col+2]
            crop = original.crop((left, 0, right, original.height))
            # A luminous, leftmost base point in the bottom quarter is the root.
            # Do not use the changing silhouette centre or per-frame auto scaling.
            bright = [(x, y) for y in range(530, 675) for x in range(min(240, crop.width))
                      if (lambda p: p[3] > 160 and p[0] > 245 and p[1] > 215 and p[2] > 90)(crop.getpixel((x, y)))]
            assert bright, (part, col)
            tip = min(x for x, _ in bright)
            base = [(x, y) for x, y in bright if x <= tip+10]
            root = (round(sum(x for x, _ in base)/len(base)), round(sum(y for _, y in base)/len(base)))
            canvas = Image.new('RGBA', (896, 896))
            dx, dy = 192-root[0], 736-root[1]
            bbox = crop.getchannel('A').getbbox()
            assert bbox and bbox[0]+dx >= 0 and bbox[2]+dx <= 896 and bbox[1]+dy >= 0 and bbox[3]+dy <= 896, (part,col,bbox,root)
            canvas.alpha_composite(crop, (dx, dy))
            frame = canvas.resize((SIZE, SIZE), Image.Resampling.LANCZOS)
            frames.append(frame)
            frame.save(OUT / f'frame-{len(frames):02}.png')
            records.append({'index': len(frames)-1, 'source': part+1, 'rect': [left, 0, right-left, 724],
                            'sourceRoot': [root[0]+left, root[1]], 'anchor': list(ANCHOR), 'scale': .5})
    atlas = Image.new('RGBA', (SIZE*8, SIZE))
    preview = Image.new('RGB', (SIZE*4, SIZE*2), '#243c39')
    draw = ImageDraw.Draw(preview)
    for i, frame in enumerate(frames):
        atlas.alpha_composite(frame, (i*SIZE, 0))
        x, y = i%4*SIZE, i//4*SIZE
        preview.paste(frame, (x, y), frame)
        ax, ay = x+ANCHOR[0], y+ANCHOR[1]
        draw.line((ax-10, ay, ax+10, ay), fill='#63ffdf', width=2)
        draw.line((ax, ay-10, ax, ay+10), fill='#63ffdf', width=2)
        draw.text((x+16, y+16), str(i+1), fill='white')
    atlas.save(OUT / 'flame-sweep.png')
    frames[3].resize((128,128), Image.Resampling.LANCZOS).save(OUT/'icon.png')
    icon = ROOT/'public/assets/ui/upgrade/illustrations/skills/flame-sweep-weapon.png'
    icon.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(OUT/'icon.png', icon)
    preview.save(ROOT/'artifacts/v6-1-b-frame-anchors.png')
    manifest = {'frames': 8, 'frameSize': [SIZE, SIZE], 'atlasSize': list(atlas.size), 'anchor': list(ANCHOR),
                'backgroundRemoval': 'none; sources already have alpha', 'fps': 20,
                'sources': [{'size': [2172,724], 'sha256': hashlib.sha256(Path(p).read_bytes()).hexdigest()} for p in paths],
                'records': records}
    (OUT/'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf8')
    print(json.dumps(manifest, ensure_ascii=False))

if __name__ == '__main__':
    assert len(sys.argv) == 3, 'Pass the two original PNG paths in order'
    prepare(sys.argv[1:])
