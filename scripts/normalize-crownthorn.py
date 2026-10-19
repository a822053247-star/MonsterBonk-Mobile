"""Audit Crownthorn connected silhouettes; never repair or overwrite source art.
Requires Pillow, numpy, scipy. Run from any directory.
"""
from pathlib import Path
import hashlib
import json
import numpy as np
from scipy import ndimage
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'public/assets/pixel/boss/Crownthorn'
OUTPUT = SOURCE / 'runtime'
SHEETS = {'directions': ('Directional Sprites', 5), 'idle': ('Idle', 4),
          'dash-windup': ('Dash Windup', 4), 'dash': ('Dash', 4),
          'spread-cast': ('Spread Cast', 4), 'summon': ('Summon', 4),
          'enraged-idle': ('Enraged Idle', 6), 'death': ('Death', 6)}
CELL, FOOT, BODY = 512, (256, 480), 280


def normalize():
    OUTPUT.mkdir(exist_ok=True)
    audit = {'cell': CELL, 'foot': FOOT, 'bodyHeight': BODY, 'alphaCutoff': 24, 'sources': {}}
    for key, (name, expected) in SHEETS.items():
        path = SOURCE / (name + '.png')
        original = Image.open(path).convert('RGBA')
        rgba = np.array(original)
        labels, _ = ndimage.label(rgba[:, :, 3] >= 24, np.ones((3, 3)))
        sizes = np.bincount(labels.ravel())
        # Preserve detached spell particles by nearest silhouette. Only isolated
        # export specks (<=8 pixels) are discarded, with counts in the audit.
        major = (sizes[labels] >= 10000) & (labels != 0)
        particles = (sizes[labels] > 8) & (sizes[labels] < 10000) & (labels != 0)
        discarded = int(np.count_nonzero((sizes[labels] <= 8) & (labels != 0)))
        if np.any(particles):
            nearest = ndimage.distance_transform_edt(~major, return_distances=False, return_indices=True)
            labels[particles] = labels[tuple(nearest[:, particles])]
        labels[(sizes[labels] <= 8) & (labels != 0)] = 0
        bodies = []
        for label, box in enumerate(ndimage.find_objects(labels), 1):
            if box is None or sizes[label] < 10000:
                continue
            ys, xs = box
            bodies.append((label, (xs.start, ys.start, xs.stop, ys.stop)))
        bodies.sort(key=lambda b: b[1][0])
        if len(bodies) != expected:
            raise ValueError(f'{key}: expected {expected} separate silhouettes, found {len(bodies)}; audit required')
        scale = BODY / (bodies[0][1][3] - bodies[0][1][1])
        # A single scale per sheet, based on the first upright pose. Death retains
        # its collapse and windup retains its crouch; never resize each pose to fit.
        atlas = Image.new('RGBA', (CELL * expected, CELL))
        frames = []
        slot = 0
        for label, box in bodies:
            x0, y0, x1, y1 = box
            mask = labels[y0:y1, x0:x1] == label
            cut = rgba[y0:y1, x0:x1].copy()
            cut[:, :, 3][~mask] = 0
            cut[:, :, 3][cut[:, :, 3] < 24] = 0
            cut[:, :, 3][cut[:, :, 3] >= 248] = 255
            # Include both soles, rather than anchoring to whichever single toe
            # happens to be lowest in this pose.
            contact_band = max(6, round((y1-y0)*.12))
            foot_xs = np.nonzero(mask[-contact_band:])[1]
            foot_x = (int(foot_xs.min()) + int(foot_xs.max()) + 1) / 2
            w, h = round((x1-x0)*scale), round((y1-y0)*scale)
            left, top = FOOT[0]-round(foot_x*scale), FOOT[1]-h
            edge = int(np.count_nonzero((labels == label)[[0, -1], :])) + int(np.count_nonzero((labels == label)[:, [0, -1]]))
            reason = 'Silhouette clipped at original image edge' if edge else None
            if left < 4 or top < 4 or left+w > CELL-4:
                reason = 'Silhouette does not fit shared foot anchor'
            if reason is None:
                atlas.alpha_composite(Image.fromarray(cut).resize((w, h), Image.Resampling.NEAREST), (slot*CELL+left, top))
            frames.append({'frame': slot, 'usable': reason is None, 'reason': reason, 'box': box,
                           'touchesSourceEdge': edge, 'sourceFoot': [x0+foot_x, y1], 'contactBand': contact_band,
                           'destination': [left, top, w, h]})
            slot += 1
        if slot != expected:
            raise ValueError(f'{key}: expected {expected} slots, found {slot}; audit required')
        atlas.save(OUTPUT / (key + '.png'))
        audit['sources'][key] = {'path': path.relative_to(ROOT).as_posix(), 'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
                                 'size': original.size, 'expected': expected, 'scale': scale, 'frames': frames,
                                 'preservedParticlePixels': int(np.count_nonzero(particles)), 'discardedNoisePixels': discarded,
                                 'usableFrames': [f['frame'] for f in frames if f['usable']]}
    (OUTPUT / 'audit.json').write_text(json.dumps(audit, indent=2)+'\n', encoding='utf-8')
    print({key: source['usableFrames'] for key, source in audit['sources'].items()})


if __name__ == '__main__':
    normalize()

