"""Crop the user supplied ten-icon strip; preserve its original alpha channel."""
from PIL import Image
from pathlib import Path
import sys

source = Image.open(sys.argv[1]).convert('RGBA')
ids = ['storm-relay','void-vessel','warp-eye','reaper-decree','rhythm-seal','alchemist-ledger','venom-insignia','heart-keeper','smokescreen-feather','levelup-salute']
# Inspected native 2172x724 image: each art silhouette is distinct; avoid cutting the wide wave/eye.
edges = [0,225,425,657,855,1070,1285,1507,1725,1943,2172]
out = Path('public/assets/ui/upgrade/illustrations/relics')
out.mkdir(parents=True, exist_ok=True)
for i, relic in enumerate(ids):
    crop = source.crop((edges[i],0,edges[i+1],source.height))
    # Original has near-transparent stray pixels across the full canvas. Find the visible silhouette.
    box = crop.getchannel('A').point(lambda a: 255 if a > 8 else 0).getbbox()
    if box is None: raise ValueError(relic)
    crop = crop.crop(box)
    crop.thumbnail((240,240), Image.Resampling.LANCZOS)
    icon = Image.new('RGBA',(256,256))
    icon.alpha_composite(crop, ((256-crop.width)//2,(256-crop.height)//2))
    icon.save(out / (relic+'.png'))
print('Cropped 10 individual relic icons')
