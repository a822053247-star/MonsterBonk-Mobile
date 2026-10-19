"""Slice the reviewed UI batches without resampling or changing their alpha.

Requires Pillow and numpy. Run from any directory. Existing different files get
a version suffix; raw files are never written. Coordinates are source pixels,
left/top inclusive and right/bottom exclusive.
"""
from pathlib import Path
import hashlib
import json

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / 'public/assets/ui'
PAD = 24
# Manual review corrected equal-width slots: the generated pictures are uneven.
BATCHES = [
    ('三联魔法精灵像素特效.png', [0, 762, 1440, 2172], [
        ('B01', '魔力浓缩', 'damage'), ('B02', '分枝魔法', 'multishot'),
        ('B03', '蓬勃生长', 'vitality')]),
    ('四连魔法狐灵技能图标.png', [0, 523, 1126, 1583, 2172], [
        ('C01', '草叶轻步', 'movement'), ('C02', '远星回响', 'range'),
        ('C03', '伴星魔法球', 'orbit'), ('C04', '草原冲击波', 'shockwave')]),
    ('三元素萌宠攻击精灵图.png', [0, 740, 1407, 2172], [
        ('D01', '获得火花弹', 'spark-weapon'), ('D02', '获得水泡弹', 'bubble-weapon'),
        ('D03', '获得叶刃', 'leaf-weapon')]),
    ('双狐烈焰技能精灵图.png', [0, 1086, 2172], [
        ('E01', '狂暴火种', 'berserk-route'), ('E02', '追猎火种', 'pursuit-route')]),
    ('三系元素魔法爆发特效.png', [0, 732, 1438, 2172], [
        ('F01', '命中分裂：火焰版本', 'split-on-hit-fire'),
        ('F02', '命中分裂：荆棘版本', 'split-on-hit-thorn'),
        ('F03', '范围扩张', 'area-expansion')]),
    ('水叶双链魔法特效.png', [0, 1054, 2172], [
        ('G01', '连锁弹射：水系版本', 'chain-bounce-water'),
        ('G02', '连锁弹射：草系版本', 'chain-bounce-grass')]),
    ('三枚魔法神器图标.png', [0, 714, 1486, 2172], [
        ('H01', '过载核心', 'overload-core'), ('H02', '追猎之眼', 'hunter-eye'),
        ('H03', '破碎晶核', 'shattered-core')]),
    ('三件奇幻魔法神器图标.png', [0, 714, 1461, 2172], [
        ('I01', '潮汐遗珠', 'tidal-pearl'), ('I02', '专精徽记', 'specialist-badge'),
        ('I03', '回声符石', 'echo-rune')]),
]
RELIC_IDS = {'overload-core', 'hunter-eye', 'shattered-core',
             'tidal-pearl', 'specialist-badge', 'echo-rune'}
GRID_FILE = '奇幻RPG宝石花叶图标集.png'
GRID = [
    ('UI01', '金币', 'coin', 'common', [0, 0, 393, 388]),
    ('UI02', '生命药水', 'health-potion', 'shop', [393, 0, 696, 388]),
    ('UI03', '商店刷新符文', 'refresh-rune', 'shop', [696, 0, 1092, 388]),
    ('UI04', '经验魔法星', 'experience-star', 'hud', [1092, 0, 1448, 388]),
    ('UI05', '胜利皇冠', 'victory-crown', 'result', [0, 388, 552, 776]),
    ('UI06', '失败徽记', 'defeat-badge', 'result', [552, 388, 945, 776]),
    ('UI07', '金色星级勋章', 'star-medal', 'result', [945, 388, 1448, 776]),
    ('UI08', '普通强化宝石', 'gem-common', 'upgrade', [0, 776, 314, 1086]),
    ('UI09', '稀有宝石', 'gem-rare', 'upgrade', [314, 776, 616, 1086]),
    ('UI10', '传奇进化宝石', 'gem-legendary', 'upgrade', [616, 776, 892, 1086]),
    ('UI11', '森林藤蔓装饰', 'forest-vine', 'common', [892, 776, 1448, 1086]),
]


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def save_new(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    candidate, version = path, 1
    while candidate.exists():
        if candidate.read_bytes() == data:
            return candidate
        version += 1
        candidate = path.with_name(f'{path.stem}-v{version}{path.suffix}')
    with candidate.open('xb') as out:
        out.write(data)
    return candidate


def png_bytes(im):
    from io import BytesIO
    stream = BytesIO()
    im.save(stream, format='PNG')
    return stream.getvalue()


def main():
    inventory, assets, previews = [], [], []
    expected = {batch[0] for batch in BATCHES} | {GRID_FILE}
    actual = {p.name for p in (BASE / 'raw').rglob('*') if p.is_file()}
    if actual - expected:
        raise ValueError(f'Unknown raw files; review before slicing: {actual - expected}')
    jobs = []
    for filename, edges, entries in BATCHES:
        jobs.append((filename, (2172, 724), [
            (*entry, 'relics' if entry[2] in RELIC_IDS else 'skills',
             [edges[i], 0, edges[i + 1], 724]) for i, entry in enumerate(entries)]))
    jobs.append((GRID_FILE, (1448, 1086), GRID))
    for filename, expected_size, entries in jobs:
        source = BASE / 'raw' / filename
        if not source.exists():
            continue  # Historical sources may have been moved; keep their exports.
        original_hash = digest(source)
        im = Image.open(source)
        im.load()
        # Do not infer white pixels as background, even in an unexpected new file.
        if im.mode != 'RGBA' or im.size != expected_size:
            raise ValueError(f'Requires new manual review: {filename}, {im.mode}, {im.size}')
        alpha = np.asarray(im.getchannel('A'))
        inventory.append(dict(source='raw/' + filename, width=im.width,
                              height=im.height, mode=im.mode, bands=list(im.getbands()),
                              alpha_min=int(alpha.min()), alpha_max=int(alpha.max()),
                              alpha_levels=len(np.unique(alpha)), sha256=original_hash,
                              order=[entry[1] for entry in entries]))
        retained_count, retained_sum = 0, 0
        for i, (code, title, asset_id, category, region_box) in enumerate(entries):
            left, top, right, bottom = region_box
            region = im.crop(region_box)
            box = region.getchannel('A').getbbox()  # Includes even alpha=1 halos.
            if box is None:
                raise ValueError(f'Empty asset: {title}')
            crop_box = (left + box[0], top + box[1], left + box[2], top + box[3])
            cut = im.crop(crop_box)
            size = max(cut.size) + 2 * PAD
            output_size = (cut.width + 2 * PAD, cut.height + 2 * PAD) if asset_id == 'forest-vine' else (size, size)
            result = Image.new('RGBA', output_size, (0, 0, 0, 0))
            offset = ((result.width - cut.width) // 2, (result.height - cut.height) // 2)
            result.paste(cut, offset)  # No mask: avoid multiplying soft alpha twice.
            path = save_new(BASE / category / f'{asset_id}.png', png_bytes(result))
            saved = Image.open(path)
            assert saved.mode == 'RGBA' and saved.size == result.size
            assert saved.tobytes() == result.tobytes()
            assert saved.crop((*offset, offset[0] + cut.width, offset[1] + cut.height)).tobytes() == cut.tobytes()
            retained_count += int(np.count_nonzero(np.asarray(cut)[:, :, 3]))
            retained_sum += int(np.asarray(cut)[:, :, 3].sum())
            # Reviewed split columns contain only alpha <= 2 residuals, no subject.
            seam_values = [int(alpha[top:bottom, max(0, x - 1):min(im.width, x + 1)].max())
                           for x in (left, right) if x not in (0, im.width)]
            seam_values += [int(alpha[max(0, y - 1):min(im.height, y + 1), left:right].max())
                            for y in (top, bottom) if y not in (0, im.height)]
            seam_max = max(seam_values, default=0)
            assert seam_max <= 2
            assets.append(dict(code=code, title=title, id=asset_id, category=category, source='raw/' + filename,
                               order=i + 1, source_region=region_box,
                               crop_box=list(crop_box), output=path.relative_to(BASE).as_posix(),
                               output_size=list(output_size), paste_offset=list(offset),
                               padding_min=PAD, transparency='original RGBA, unchanged',
                               split_method='alpha projection, manually reviewed coordinates',
                               split_edge_alpha_max=seam_max, accepted=True,
                               notes='保留全部非零透明度像素，包括低透明度残点；未去背景、缩放或补画。'))
            previews.append((code, title, result))
        assert retained_count == np.count_nonzero(alpha)
        assert retained_sum == int(alpha.sum())
        assert digest(source) == original_hash

    manifest = dict(coordinates='[left, top, right, bottom), source pixels',
                    source_files=inventory, assets=assets,
                    historical_manifest='asset-manifest.json',
                    historical_note='本次仅处理当前raw中的图片，不覆盖历史成品；前两批清单分别为原版和v2。',
                    validation=f'{len(assets)} exports reopened; exact RGBA comparison; all source nonzero alpha pixels and alpha sums retained; source SHA256 unchanged')
    manifest_path = save_new(BASE / 'asset-manifest.json', (json.dumps(manifest, ensure_ascii=False, indent=2) + '\n').encode('utf-8'))
    font_path = Path('C:/Windows/Fonts/msyh.ttc')
    font = ImageFont.truetype(str(font_path), 18) if font_path.exists() else ImageFont.load_default()
    sheet = Image.new('RGB', (1200, ((len(previews) + 2) // 3) * 335), '#eee9dd')
    draw = ImageDraw.Draw(sheet)
    for index, (code, title, result) in enumerate(previews):
        x, y = index % 3 * 400, index // 3 * 335
        for yy in range(y + 36, y + 326, 16):
            for xx in range(x + 8, x + 392, 16):
                draw.rectangle((xx, yy, min(xx + 15, x + 391), min(yy + 15, y + 325)),
                               fill='#343b48' if ((xx-x)//16 + (yy-y)//16) % 2 else '#46505d')
        thumb = result.copy()
        thumb.thumbnail((380, 280), Image.Resampling.NEAREST)
        sheet.paste(thumb, (x + (400-thumb.width)//2, y + 40 + (280-thumb.height)//2), thumb)
        draw.text((x + 14, y + 8), f'{code}  {title}', font=font, fill='#222222')
    sheet_path = save_new(BASE / 'asset-contact-sheet.png', png_bytes(sheet))
    lines = ['# 界面批量素材裁切清单', '',
             f'本次检查 {len(inventory)} 张原图，按行从左到右切出 {len(assets)} 个独立素材。全部为真实 RGBA，真实尺寸与分类见下表。无需去白底，白色高光和内部颜色保持原样。', '',
             '## 处理方式与验收范围', '',
             '- 先分析透明度列投影，再人工校正不等宽的分界。分界两侧最多只有透明度 1–2 的残点，没有切过角色或可见特效主体。',
             '- 按全部非零透明度像素取边界，保留原始色值、半透明光晕、耳朵、叶片和粒子；不做阈值清除。每张置于原生分辨率的透明画布，四周至少 24 像素安全边距。图标使用正方形画布，森林藤蔓保留横向画布。',
             '- 原图带少量散落的极低透明度残点，因此采用保守边界，部分成品留白较多。原图最外沿也有极低透明度残点，均保留；未发现可见主体被原图边缘截断。',
             '- 提示词中的 512×512 并非原图真实规格。本次不缩放，避免丢失像素和微弱光晕；实际输出尺寸见表。',
             '- 验收通过表示顺序、独立裁切、主体完整度、透明通道和导出保真通过；不代表重新生成内容或审核角色设计一致性。',
             '- 成品重新打开后与预期逐像素一致；每批全部非零透明度像素数量和透明度总和均保留，原图校验值未改变。',
             '- 分类：common 通用金币及藤蔓；shop 药水及刷新；hud 经验星；result 皇冠、失败徽记及星级；upgrade 三种宝石；历史技能与道具分属 skills 和 relics。未修改游戏代码或执行游戏测试。',
             '- 旧批次原图已不在当前 raw 中，历史 23 张成品及原清单保留。本清单仅涵盖当前批次。',
             '- 已有内容不同的文件绝不覆盖，自动增加版本后缀。清单 JSON 包含原图 SHA256、分区坐标、粘贴偏移及完整规格。', '',
             f'机器可读清单：[{manifest_path.name}]({manifest_path.name})。历史清单：[ASSET-MANIFEST.md](ASSET-MANIFEST.md)。', '',
             '## 原图规格', '',
             '| 来源 | 尺寸 | 模式 | 透明度范围 | 透明度级数 |',
             '|---|---|---|---|---|']
    for source in inventory:
        lines.append(f"| {source['source']} | {source['width']}×{source['height']} | {source['mode']} | {source['alpha_min']}–{source['alpha_max']} | {source['alpha_levels']} |")
    lines += ['', '## 裁切清单', '',
             '裁切坐标为原图像素 `[左, 上, 右, 下)`，右、下边界不包含在内。', '',
             '| 编号 | 素材 | 来源文件 | 裁切坐标 | 最终文件 | 尺寸 | 验收 |',
             '|---|---|---|---|---|---|---|']
    for asset in assets:
        lines.append(f"| {asset['code']} | {asset['title']} | {asset['source']} | {asset['crop_box']} | [{asset['output']}]({asset['output']}) | {asset['output_size'][0]}×{asset['output_size'][1]} | 通过 |")
    lines += ['', '预览：', '', f'![裁切总览]({sheet_path.name})', '']
    save_new(BASE / 'ASSET-MANIFEST.md', '\n'.join(lines).encode('utf-8'))
    print(f'Inspected {len(inventory)} sources; exported and verified {len(assets)} transparent PNGs.')


if __name__ == '__main__':
    main()
