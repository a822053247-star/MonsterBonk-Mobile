"""Extract connected silhouettes, never uniform-grid crop the supplied art. Requires Pillow."""
from collections import deque
from pathlib import Path
from PIL import Image
import hashlib
import json

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'public/assets/pixel/skills/animation'
OUTPUT = ROOT / 'public/assets/pixel/creatures/animation'
OUTPUT.mkdir(parents=True, exist_ok=True)
FRAME_W, FRAME_H, FOOT_X, FOOT_Y = 384, 256, 192, 240


def silhouettes(image):
    w, h = image.size
    alpha = image.getchannel('A').tobytes()
    seen = bytearray(w * h)
    bodies = []
    noise = 0
    for start, opacity in enumerate(alpha):
        if opacity < 24 or seen[start]:
            continue
        queue, pixels = deque([start]), []
        seen[start] = 1
        left = right = start % w
        top = bottom = start // w
        while queue:
            index = queue.popleft()
            pixels.append(index)
            x, y = index % w, index // w
            left, right = min(left, x), max(right, x)
            top, bottom = min(top, y), max(bottom, y)
            for ny in range(max(0, y - 1), min(h, y + 2)):
                for nx in range(max(0, x - 1), min(w, x + 2)):
                    neighbor = ny * w + nx
                    if alpha[neighbor] >= 24 and not seen[neighbor]:
                        seen[neighbor] = 1
                        queue.append(neighbor)
        if len(pixels) < 10000:
            noise += len(pixels)
            continue
        box = [left, top, right + 1, bottom + 1]
        # Center of the lowest foot-contact band, not the flame-heavy full silhouette.
        foot_pixels = [p % w for p in pixels if p // w >= bottom - 5]
        foot_x = (min(foot_pixels) + max(foot_pixels)) / 2
        cut = image.crop(box)
        mask = bytearray(cut.width * cut.height)
        for p in pixels:
            mask[(p // w - top) * cut.width + p % w - left] = alpha[p]
        cut.putalpha(Image.frombytes('L', cut.size, bytes(mask)))
        edge = sum(p % w in (0, w - 1) or p // w in (0, h - 1) for p in pixels)
        bodies.append({'box': box, 'pixels': len(pixels), 'foot': [foot_x, bottom + 1],
                       'touchesSourceEdge': edge, 'image': cut})
    return sorted(bodies, key=lambda body: body['box'][1]), noise


def normalize(species):
    report = {'frameSize': [FRAME_W, FRAME_H], 'foot': [FOOT_X, FOOT_Y], 'alphaCutoff': 24, 'sources': {}}
    for name, rows in [(species + '-animation-sheet', 4), (species + '-diagonal-walk', 2)]:
        source = SOURCE / (name + '.png')
        original = Image.open(source).convert('RGBA')
        bodies, noise = silhouettes(original)
        if len(bodies) != rows * 4:
            raise ValueError(f'{name}: expected {rows * 4} distinct silhouettes, found {len(bodies)}; manual review required')
        atlas = Image.new('RGBA', (FRAME_W * 4, FRAME_H * rows))
        frames = []
        for row in range(rows):
            group = sorted(bodies[row * 4:(row + 1) * 4], key=lambda body: body['box'][0])
            # One scale for the whole clip, including all limbs, ears, tail and flame.
            scale = 220 / max(b['image'].height for b in group)
            # The side tail extends far behind the contact foot. Reserve horizontal
            # room instead of shrinking the whole clip to squeeze it into a narrow cell.
            half_extent = max(max(b['foot'][0] - b['box'][0], b['box'][2] - b['foot'][0]) for b in group)
            if half_extent * scale > min(FOOT_X, FRAME_W - FOOT_X) - 4:
                raise ValueError(f'{name} row {row}: widen the cell; never shrink one direction')
            for col, body in enumerate(group):
                usable = not body['touchesSourceEdge']
                cut = body.pop('image')
                width, height = max(1, round(cut.width * scale)), max(1, round(cut.height * scale))
                left = FOOT_X - round((body['foot'][0] - body['box'][0]) * scale)
                top = FOOT_Y - height
                if left < 0 or top < 0 or left + width > FRAME_W or top + height > FRAME_H:
                    raise ValueError(f'{name} row {row} col {col}: normalization would clip subject')
                if usable:
                    resized = cut.resize((width, height), Image.Resampling.NEAREST)
                    atlas.alpha_composite(resized, (col * FRAME_W + left, row * FRAME_H + top))
                frames.append({**body, 'row': row, 'column': col, 'scale': scale, 'usable': usable,
                               'destination': [left, top, width, height],
                               'reason': None if usable else 'Subject touches original image edge; clipped original cannot be recovered'})
        atlas.save(OUTPUT / (name + '.normalized.png'))
        report['sources'][name] = {'path': str(source.relative_to(ROOT)).replace('\\', '/'),
                                  'sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
                                  'size': original.size, 'mode': original.mode, 'grid': [4, rows],
                                  'discardedDisconnectedNoisePixels': noise, 'frames': frames}
    (OUTPUT / ('normalization.json' if species == 'yanrong' else species + '.normalization.json')).write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({name: {'size': data['size'], 'usable': sum(f['usable'] for f in data['frames']),
                            'rejected': [[f['row'], f['column']] for f in data['frames'] if not f['usable']]}
                      for name, data in report['sources'].items()}))


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--species', choices=['yanrong', 'paopaoyuan', 'yacishou'], default='yanrong')
    normalize(parser.parse_args().species)
