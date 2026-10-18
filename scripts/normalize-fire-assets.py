"""Prepare runtime atlases without modifying supplied originals. Requires Pillow."""
from pathlib import Path
from PIL import Image
from collections import deque
import hashlib
import json

ROOT = Path(__file__).resolve().parents[1]
DIRECTORY = ROOT / 'public/assets/pixel/skills/yanrong'


def main_component(image):
    """Remove disconnected alpha noise; preserve the largest 8-connected silhouette."""
    width, height = image.size
    alpha = image.getchannel('A').tobytes()
    visited = bytearray(width * height)
    largest = []
    for start, opacity in enumerate(alpha):
        if opacity < 24 or visited[start]:
            continue
        queue, component = deque([start]), []
        visited[start] = 1
        while queue:
            index = queue.popleft()
            component.append(index)
            x, y = index % width, index // width
            for ny in range(max(0, y - 1), min(height, y + 2)):
                for nx in range(max(0, x - 1), min(width, x + 2)):
                    neighbor = ny * width + nx
                    if alpha[neighbor] >= 24 and not visited[neighbor]:
                        visited[neighbor] = 1
                        queue.append(neighbor)
        if len(component) > len(largest):
            largest = component
    if not largest:
        raise ValueError('Empty atlas cell')
    mask = bytearray(width * height)
    for index in largest:
        mask[index] = alpha[index]
    image.putalpha(Image.frombytes('L', image.size, bytes(mask)))
    return image


report = {}
for stem, columns, rows in [('fire-effects-sheet', 4, 4), ('fire-skill-icons', 3, 1)]:
    source = DIRECTORY / (stem + '.png')
    image = Image.open(source).convert('RGBA')
    atlas = Image.new('RGBA', (columns * 128, rows * 128))
    rectangles = []
    for row in range(rows):
        row_cells = []
        for col in range(columns):
            box = tuple(round(v) for v in (col * image.width / columns, row * image.height / rows,
                                          (col + 1) * image.width / columns, (row + 1) * image.height / rows))
            cell = main_component(image.crop(box))
            row_cells.append(cell)
            rectangles.append({'source': box, 'silhouette': cell.getbbox()})
        # Common scale per animation row, so growth/shrinkage remains animated.
        scale = 108 / max(max(c.getbbox()[2] - c.getbbox()[0], c.getbbox()[3] - c.getbbox()[1]) for c in row_cells)
        for col, cell in enumerate(row_cells):
            cut = cell.crop(cell.getbbox())
            cut = cut.resize((max(1, round(cut.width * scale)), max(1, round(cut.height * scale))), Image.Resampling.NEAREST)
            atlas.alpha_composite(cut, (col * 128 + (128 - cut.width) // 2, row * 128 + (128 - cut.height) // 2))
    output = DIRECTORY / (stem + '.normalized.png')
    atlas.save(output)
    report[stem] = {'originalSize': image.size, 'mode': image.mode, 'sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
                    'grid': [columns, rows], 'runtimeSize': atlas.size, 'cells': rectangles}
(DIRECTORY / 'normalization.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
print(json.dumps({k: {'source': v['originalSize'], 'runtime': v['runtimeSize']} for k, v in report.items()}))
