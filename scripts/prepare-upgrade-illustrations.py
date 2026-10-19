"""Prepare tightly framed UI copies; keep all supplied master assets intact."""
from pathlib import Path
import json
from PIL import Image

ROOT = Path(__file__).resolve().parents[1] / 'public/assets/ui'
entries = []
for category in ('skills', 'relics'):
    for source in sorted((ROOT / category).glob('*.png')):
        im = Image.open(source).convert('RGBA')
        # Alpha 1–2 is the near-invisible noise in the generated master margins.
        # Use it only for boundary detection; keep original RGBA inside the crop.
        bounds = im.getchannel('A').point(lambda value: 255 if value > 2 else 0).getbbox()
        if bounds is None:
            continue
        box = (max(0, bounds[0] - 16), max(0, bounds[1] - 16),
               min(im.width, bounds[2] + 16), min(im.height, bounds[3] + 16))
        output = ROOT / 'upgrade/illustrations' / category / source.name
        output.parent.mkdir(parents=True, exist_ok=True)
        crop = im.crop(box)
        if output.exists():
            existing = Image.open(output).convert('RGBA')
            if existing.size != crop.size or existing.tobytes() != crop.tobytes():
                raise FileExistsError(f'Different existing derivative: {output}')
        else:
            crop.save(output)
        entries.append(dict(source=source.relative_to(ROOT).as_posix(),
                            output=output.relative_to(ROOT).as_posix(), crop_box=box,
                            size=crop.size, method='alpha > 2 boundary + 16px halo margin; no resize or pixel recoloring'))
manifest = ROOT / 'upgrade/illustrations/manifest.json'
manifest.write_text(json.dumps(entries, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(f'Prepared {len(entries)} display copies; masters unchanged.')
