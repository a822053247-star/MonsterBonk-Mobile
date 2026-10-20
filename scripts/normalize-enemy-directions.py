"""Audit supplied five-direction PNGs and align feet without modifying originals."""
from pathlib import Path
import hashlib, json
import numpy as np
from PIL import Image, ImageDraw

ROOT=Path(__file__).resolve().parents[1]
BASE=ROOT/'public/assets/pixel/enemies/direction'
NAMES=['front','front-right','right','back-right','back']
SPECIES=['grass-monster','runner-bug','rock-armor-bug',
         'draft-crystal-swarm','draft-spore-bomber','draft-treasure-runner']
preview=Image.new('RGB',(1280,len(SPECIES)*280),'#263c36')
draw=ImageDraw.Draw(preview)
report={'cell':256,'columns':5,'bodyHeight':200,'foot':[128,240],'species':{}}
for row,name in enumerate(SPECIES):
    folder=BASE/(name+'-directions')
    sheet=Image.open(folder/(name+'-directions.png')).convert('RGBA')
    assert sheet.size==(1280,256)
    # New supplied sheets already contain five cells. Extract derived direction
    # files without changing the user's original sheet or existing source PNGs.
    if name.startswith('draft-'):
        metadata={'image':name+'-directions.png','frameWidth':256,'frameHeight':256,
                  'columns':5,'rows':1,'order':NAMES,'frames':[]}
        for i,direction in enumerate(NAMES):
            cell=sheet.crop((i*256,0,(i+1)*256,256))
            source=folder/f'{name}-{direction}.png'
            if not source.exists():
                cell.save(source)
            else:
                assert np.array_equal(np.array(Image.open(source).convert('RGBA')),np.array(cell)), f'{source}: differs from supplied sheet'
            metadata['frames'].append({'name':f'{name}-{direction}','file':source.name,
                'x':i*256,'y':0,'width':256,'height':256,'source_bbox':cell.getbbox()})
        (folder/(name+'-directions.json')).write_text(json.dumps(metadata,ensure_ascii=False,indent=2),encoding='utf-8')
        (folder/'README.txt').write_text(f'{name}-directions.png: supplied 5x1 sprite sheet, 1280x256\n'
            'Order: front, front-right, right, back-right, back\nEach extracted frame: 256x256 transparent PNG\n'
            'runtime.normalized.png: 5x256 cells, body height <=200, feet at (128,240).\n'
            'Mirror in code for left-facing directions; retain supplied originals.\n',encoding='utf-8')
    frames=[];hashes={};bounds=[];equal=[];alphaStats=[]
    for i,direction in enumerate(NAMES):
        source=folder/f'{name}-{direction}.png'
        im=Image.open(source).convert('RGBA');assert im.size==(256,256)
        equal.append(np.array_equal(np.array(im),np.array(sheet.crop((i*256,0,(i+1)*256,256)))))
        pixels=np.array(im);alpha=pixels[:,:,3].copy()
        alphaStats.append({'zero':int((alpha==0).sum()),'faint':int(((alpha>0)&(alpha<24)).sum())})
        pixels[alpha<24]=0;pixels[:,:,3][alpha>=248]=255
        im=Image.fromarray(pixels);box=im.getbbox();assert box
        bounds.append(box);frames.append(im.crop(box))
        hashes[source.name]=hashlib.sha256(source.read_bytes()).hexdigest()
    # Preserve stance differences; cap the tank's oversized back to its front/side height.
    reference=max(frame.height for frame in frames[:4])
    adjustments=[reference/frame.height if frame.height>reference*1.1 else 1 for frame in frames]
    scale=200/max(frame.height*adjust for frame,adjust in zip(frames,adjustments))
    atlas=Image.new('RGBA',(1280,256));records=[]
    for i,(frame,box) in enumerate(zip(frames,bounds)):
        size=(round(frame.width*scale*adjustments[i]),round(frame.height*scale*adjustments[i]));assert size[0]<=224
        cut=frame.resize(size,Image.Resampling.NEAREST)
        offset=(128-size[0]//2,240-size[1]);assert offset[0]>=16 and offset[1]>=16
        atlas.alpha_composite(cut,(i*256+offset[0],offset[1]))
        preview.paste(cut,(i*256+offset[0],row*280+offset[1]),cut)
        draw.line((i*256+16,row*280+240,i*256+240,row*280+240),fill='#61e9ac')
        draw.text((i*256+8,row*280+250),f'{name} / {NAMES[i]}',fill='white')
        records.append({'direction':NAMES[i],'sourceBounds':box,'offset':offset,'size':size,'sizeCorrection':adjustments[i]})
    hashes[folder.name+'.png']=hashlib.sha256((folder/(folder.name+'.png')).read_bytes()).hexdigest()
    atlas.save(folder/'runtime.normalized.png')
    report['species'][name]={'sourceSHA256':hashes,'matchesSheet':equal,'alpha':alphaStats,'scale':scale,'frames':records}
(BASE/'normalization.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
preview.save(ROOT/'artifacts/enemy-direction-contact-sheet.png')
print(json.dumps({name:{'scale':s['scale'],'sourceBounds':[f['sourceBounds'] for f in s['frames']],'matchesSheet':s['matchesSheet']}for name,s in report['species'].items()}))
