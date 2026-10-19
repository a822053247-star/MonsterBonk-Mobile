"""Non-uniform, audited extraction. Never modifies the supplied PNG. Pillow/numpy/scipy."""
from pathlib import Path
import hashlib, json, shutil
import numpy as np
from scipy import ndimage
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/assets/pixel/skills/fusions'
OUT.mkdir(parents=True, exist_ok=True)
(OUT / 'frames').mkdir(exist_ok=True)
source = ROOT.parent / 's.png'
if source.exists():
    shutil.copyfile(source, OUT / 'water-grass-original.png')
source = OUT / 'water-grass-original.png'
im = Image.open(source).convert('RGBA')
assert im.size == (1774, 887)
pixels = np.array(im)
alpha = pixels[:, :, 3].copy()
# Alpha <24 is overwhelmingly background noise; no RGB chroma key is used.
pixels[alpha < 24] = 0
clean = Image.fromarray(pixels)
atlas = Image.new('RGBA', (2048, 1024))
preview = Image.new('RGB', (2048, 1120), '#303840')
draw = ImageDraw.Draw(preview)
rows = [
    ('deep-bubble', 0, 260, [0,188,365,574,779,994,1218,1405,1525]),
    ('chain-bubble', 265, 474, [0,215,416,618,850,1110,1275,1525]),
    ('thorn-scatter', 480, 670, [0,248,460,654,880,1092,1290,1525]),
    ('jump-thorn', 674, 870, [0,240,430]),
]
records = []
for row, (name, top, bottom, edges) in enumerate(rows):
    # Preserve relative stage size: one common scale per skill, not per frame.
    crops = []
    for left, right in zip(edges, edges[1:]):
        region = np.array(clean.crop((left,top,right,bottom)))
        labels, count = ndimage.label(region[:,:,3] >= 24, np.ones((3,3)))
        sizes = np.bincount(labels.ravel()); sizes[0] = 0
        # Remove isolated speckles, retain detached authored droplets/leaves.
        region[~np.isin(labels, np.flatnonzero(sizes >= 24))] = 0
        cut = Image.fromarray(region); bbox = cut.getbbox()
        assert bbox is not None
        crops.append((cut.crop(bbox), [left+bbox[0],top+bbox[1],left+bbox[2],top+bbox[3]]))
    scale = min(1, 224 / max(max(c.size) for c,b in crops))
    for col,(cut,bbox) in enumerate(crops):
        size = tuple(max(1,round(s*scale)) for s in cut.size)
        cut = cut.resize(size, Image.Resampling.NEAREST)
        offset = ((256-size[0])//2,(256-size[1])//2)
        atlas.alpha_composite(cut,(col*256+offset[0],row*256+offset[1]))
        atlas.crop((col*256,row*256,(col+1)*256,(row+1)*256)).save(OUT / 'frames' / f'{name}-{col}.png')
        preview.paste(cut,(col*256+offset[0],row*280+offset[1]),cut)
        draw.text((col*256+8,row*280+250),f'{name} {col}: {bbox}',fill='white')
        records.append(dict(skill=name,frame=col,source=bbox,atlas=[col*256,row*256,256,256],pivot=[128,128],scale=scale))
    # Icons use a wholly separate file, never a battle atlas slot.
    icon = clean.crop((1535,top,1774,bottom)); box=icon.getbbox(); icon=icon.crop(box)
    icon.thumbnail((112,112),Image.Resampling.NEAREST)
    canvas=Image.new('RGBA',(128,128));canvas.alpha_composite(icon,((128-icon.width)//2,(128-icon.height)//2))
    canvas.save(OUT / f'{name}-icon.png')
atlas.save(OUT / 'effects.normalized.png')
preview.save(ROOT / 'artifacts/fusion-extraction-contact-sheet.png')
report = dict(sourceSize=im.size,sourceSHA256=hashlib.sha256(source.read_bytes()).hexdigest(),alpha=dict(zero=int((alpha==0).sum()),faint=int(((alpha>0)&(alpha<24)).sum()),visible=int((alpha>=24).sum())),threshold=24,minimumComponentPixels=24,cell=256,grid=[8,4],frames=records,
    rejected=[dict(skill='jump-thorn',source=[430,674,1035,870],reason='Impact and two arc stages overlap: connected body spans x597..1030; impact x434..607 overlaps it. No reliable boundary.'),dict(skill='jump-thorn',source=[1035,674,1380,870],reason='Impact x1043..1183 overlaps arc x1175..1371. Keep procedural impact and curved travel.'),dict(skill='jump-thorn',source=[1380,674,1525,870],reason='Terminal detached debris; not enough to reconstruct the obscured impact animation.')],
    playback={'deep-bubble':dict(flight=[0,1,2],impact=[3,4,5,6,7]),'chain-bubble':dict(flight=[0,1],impact=[2,5,6],unusedArcs=[3,4]),'thorn-scatter':dict(flight=[0],impact=[1,2,3,4,5,6]),'jump-thorn':dict(flight=[0,1],impact=[],fallback='procedural')})
(OUT/'extraction.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
audit=Image.new('RGB',im.size,'#303840');audit.paste(im,(0,0),im)
pen=ImageDraw.Draw(audit)
for f in records:
    pen.rectangle(f['source'],outline='#88ff88',width=2)
    pen.text(tuple(f['source'][:2]),f"{f['skill']}:{f['frame']}",fill='white')
for rejected in report['rejected']:
    pen.rectangle(rejected['source'],outline='#ff5555',width=3)
for name,top,bottom,edges in rows:
    pen.rectangle((1535,top,1773,bottom),outline='#ffdd44',width=2)
    pen.text((1540,top+4),'ICON - NOT ANIMATION',fill='#ffdd44')
audit.save(ROOT/'artifacts/fusion-source-audit.png')
print(json.dumps({k:v for k,v in report.items() if k not in ('frames',)},ensure_ascii=False))

