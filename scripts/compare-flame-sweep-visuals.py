"""Compose unmodified browser screenshot crops; never edit game art."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

root = Path(__file__).resolve().parents[1]
out = root / 'artifacts'
font = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 18)
small = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 15)
sheet = Image.new('RGB', (1172, 350), '#17251f')
draw = ImageDraw.Draw(sheet)
profiles = [
    ('compact', 'A / Compact', '65% size | 58% vertical | 180ms', 'Brightness 0.80 | core gain 0.50'),
    ('balanced', 'B / Balanced - DEFAULT', '70% size | 68% vertical | 230ms', 'Brightness 1.00 | core gain 0.70'),
    ('punchy', 'C / Punchy', '75% size | 78% vertical | 280ms', 'Brightness 0.92 | core gain 0.70'),
]
for i, (key, title, line1, line2) in enumerate(profiles):
    x = 8 + i * 390
    shot = Image.open(out / f'v6-1-b-visual-{key}-compare-detail.png').convert('RGB')
    sheet.paste(shot, (x, 8))
    draw.text((x+4, 267), title, font=font, fill='#ffdc9c')
    draw.text((x+4, 296), line1, font=small, fill='white')
    draw.text((x+4, 321), line2, font=small, fill='#c5d6c9')
sheet.save(out / 'v6-1-b-visual-comparison.png')
