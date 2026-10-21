"""Crop the user supplied ten-icon strip; preserve its original alpha channel."""
from PIL import Image
from pathlib import Path
import sys,json

source = Image.open(sys.argv[1]).convert('RGBA')
ids = ['storm-relay','void-vessel','warp-eye','reaper-decree','rhythm-seal','alchemist-ledger','venom-insignia','heart-keeper','smokescreen-feather','levelup-salute']
# Inspected native 2172x724 image: each art silhouette is distinct; avoid cutting the wide wave/eye.
edges = [0,225,425,657,855,1070,1285,1507,1725,1943,2172]
if len(sys.argv)>2:
    ids=[r['id'] for r in json.loads(Path(sys.argv[2]).read_text(encoding='utf-8'))['relics']]
    alpha=source.getchannel('A')
    counts=[sum(alpha.getpixel((x,y))>24 for y in range(source.height)) for x in range(source.width)]
    edges=[0]+[min(range(round(source.width*i/10)-22,round(source.width*i/10)+23),key=lambda x:(counts[x],abs(x-source.width*i/10))) for i in range(1,10)]+[source.width]
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
