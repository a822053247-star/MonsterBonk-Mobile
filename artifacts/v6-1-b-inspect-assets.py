from PIL import Image
from pathlib import Path
for path in [Path('C:/Users/ADMINI~1/AppData/Local/Temp/codex-clipboard-705fa8cd-fb52-4920-9a46-ca1811136e2e.png'), Path('C:/Users/ADMINI~1/AppData/Local/Temp/codex-clipboard-c64b12db-0afe-4bd8-989b-f4efa4b7bf57.png')]:
    im = Image.open(path).convert('RGBA')
    alpha = im.getchannel('A')
    counts = [sum(v > 32 for v in alpha.crop((x, 0, x+1, im.height)).getdata()) for x in range(im.width)]
    print(path.name, im.size)
    print('valleys', [(x, max(counts[x:x+16])) for x in range(380, 1850, 8) if max(counts[x:x+16]) < 5])
    print('columns', [(x, counts[x]) for x in range(0, im.width, 100)])
