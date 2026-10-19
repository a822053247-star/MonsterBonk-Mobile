"""Pack six CC0 Kenney textures for bounded combat feedback; originals stay intact."""
from pathlib import Path
import hashlib
import json
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'public/assets/kenney_particle-pack/PNG (Transparent)'
OUTPUT = ROOT / 'public/assets/particles'
FILES = ['star_01.png', 'star_04.png', 'trace_06.png', 'slash_02.png', 'flame_05.png', 'flame_06.png']
atlas = Image.new('RGBA', (512, 256))
entries = []
for frame, name in enumerate(FILES):
    path = SOURCE / name
    source = Image.open(path)
    rgba = source.convert('RGBA')
    # Trim only fully transparent margins; retain every nonzero-alpha glow pixel.
    bounds = rgba.getchannel('A').getbbox()
    box = (max(0, bounds[0] - 16), max(0, bounds[1] - 16),
           min(rgba.width, bounds[2] + 16), min(rgba.height, bounds[3] + 16))
    tile = ImageOps.contain(rgba.crop(box), (124, 124), Image.Resampling.NEAREST)
    x, y = frame % 4 * 128, frame // 4 * 128
    atlas.paste(tile, (x + (128-tile.width)//2, y + (128-tile.height)//2))
    entries.append(dict(frame=frame, source=path.relative_to(ROOT).as_posix(),
                        sha256=hashlib.sha256(path.read_bytes()).hexdigest(),
                        source_size=source.size, source_mode=source.mode,
                        cell=[x, y, 128, 128], crop=box))
OUTPUT.mkdir(parents=True, exist_ok=True)
path = OUTPUT / 'kenney-feedback.png'
if path.exists():
    with Image.open(path) as existing:
        if existing.convert('RGBA').tobytes() != atlas.tobytes() or existing.size != atlas.size:
            raise FileExistsError(f'Refusing to overwrite different atlas: {path}')
else:
    atlas.save(path, optimize=True)
(OUTPUT / 'kenney-feedback.json').write_text(json.dumps(dict(
    license='CC0; see ../kenney_particle-pack/License.txt', columns=4, rows=2,
    cell_size=128, method='nonzero-alpha bounds + 16px margin; contain nearest to 124px; minimum 2px cell padding; RGBA retained',
    entries=entries), ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(f'{len(entries)} textures -> {path.name} ({path.stat().st_size} bytes)')
