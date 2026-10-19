"""Classify UI12–UI15 byte-for-byte, preserving sources and existing exports."""
from pathlib import Path
from io import BytesIO
import hashlib
import json

from PIL import Image, ImageDraw, ImageFont

BASE = Path(__file__).resolve().parents[1] / 'public/assets/ui'
ITEMS = [
    ('UI12', '冒险战报羊皮纸背景.png', 'result/battle-report-panel.png',
     '战报背景', '中心羊皮纸保留，适合覆盖动态战斗数据与技能列表。'),
    ('UI13', '森林魔法商店背景.png', 'shop/shop-panel.png',
     '商店背景', '中心留白，商品槽位应由代码布局。'),
    ('UI14', '商店商品槽位.png', 'shop/item-slot.png',
     '商品卡底板', '外部带背景氛围；保留原始透明度，不做自动抠图。下方留白可覆盖价格与购买按钮。'),
    ('UI15', '幻兽生命状态面板.png', 'hud/creature-health-panel.png',
     '生命状态面板', '左侧头像区与右侧文字区保留羊皮纸底。绿色血条已画入原图，动态血量接入需另行处理，不能直接当空血条框使用。'),
]


def save_new(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    target, version = path, 1
    while target.exists():
        if target.read_bytes() == data:
            return target
        version += 1
        target = path.with_name(f'{path.stem}-v{version}{path.suffix}')
    with target.open('xb') as stream:
        stream.write(data)
    return target


def main():
    assets = []
    sheet = Image.new('RGB', (1200, 900), '#eee9dd')
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.truetype('C:/Windows/Fonts/msyh.ttc', 19)
    for index, (code, filename, destination, category, note) in enumerate(ITEMS):
        source = BASE / 'raw' / filename
        data = source.read_bytes()
        im = Image.open(source)
        im.load()
        target = save_new(BASE / destination, data)
        assert target.read_bytes() == data
        alpha = im.getchannel('A') if 'A' in im.getbands() else None
        assets.append(dict(code=code, source='raw/' + filename,
                           output=target.relative_to(BASE).as_posix(),
                           category=category, width=im.width, height=im.height,
                           mode=im.mode, bands=list(im.getbands()),
                           alpha_range=list(alpha.getextrema()) if alpha else None,
                           crop_box=[0, 0, im.width, im.height],
                           resized=False, reencoded=False,
                           sha256=hashlib.sha256(data).hexdigest(),
                           classification_accepted=True, integration_accepted=False,
                           note=note))
        x, y = index % 2 * 600, index // 2 * 450
        draw.text((x + 16, y + 10), f'{code}  {category}', font=font, fill='#222222')
        for yy in range(y + 42, y + 440, 16):
            for xx in range(x + 8, x + 592, 16):
                draw.rectangle((xx, yy, min(xx + 15, x + 591), min(yy + 15, y + 439)),
                               fill='#343b48' if ((xx-x)//16 + (yy-y)//16) % 2 else '#46505d')
        thumb = im.copy()
        thumb.thumbnail((565, 380), Image.Resampling.NEAREST)
        sheet.paste(thumb, (x + (600-thumb.width)//2, y + 48 + (380-thumb.height)//2), thumb)
    manifest = save_new(BASE / 'asset-manifest-v4.json',
                        (json.dumps(assets, ensure_ascii=False, indent=2) + '\n').encode('utf-8'))
    buffer = BytesIO()
    sheet.save(buffer, 'PNG')
    preview = save_new(BASE / 'asset-contact-sheet-v4.png', buffer.getvalue())
    lines = ['# UI12–UI15 面板素材分类清单', '',
             '4 张均为独立成品、真实 RGBA。已保留完整原始尺寸及透明通道，按用途复制分类，无需批量切分。没有去白、裁切、缩放或重编码，羊皮纸内部、白色高光及光晕均保留。', '',
             '原图及历史文件保留，内容不同的同名目标自动添加版本后缀。分类后文件与原图字节一致。未修改游戏代码，未运行游戏测试。', '',
             '分类验收通过只表示内容、用途、尺寸、通道与复制保真已确认，不表示已接入界面。', '',
             '| 编号 | 来源 | 分类文件 | 真实尺寸 | 模式 | 透明度范围 | 裁切范围 | 状态 |',
             '|---|---|---|---|---|---|---|---|']
    for asset in assets:
        lines.append(f"| {asset['code']} | {asset['source']} | [{asset['output']}]({asset['output']}) | {asset['width']}×{asset['height']} | {asset['mode']} | {asset['alpha_range']} | {asset['crop_box']}（整图） | 分类通过 |")
    lines += ['', '## 接入备注', '']
    for asset in assets:
        lines.append(f"- {asset['code']}：{asset['note']}")
    lines += ['', f'机器可读清单：[{manifest.name}]({manifest.name})。', '',
              f'![面板分类预览]({preview.name})', '']
    report = save_new(BASE / 'ASSET-MANIFEST-v4.md', '\n'.join(lines).encode('utf-8'))
    print(f'Classified {len(assets)} panels; originals preserved. Report: {report.name}')


if __name__ == '__main__':
    main()
