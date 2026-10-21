# Gigapack 遗物 11–20 接入记录

唯一新增内容规格：`monsterbonk_gigapack_relics_11_20_spec.json`（原件保留）。其中 `effects/` 统一映射到下方素材根目录。

## 实际加载的资源

根目录：`public/assets/pixel/effects/Super Pixel Effects Gigapack (Free Version)/`。只为已装备的新遗物预热纹理；未装备的素材不发起请求。所有动画采用素材包 `guide.txt` 明示的 15 FPS；每帧矩形来自对应 `spritesheet.txt`，含 32/48/64 像素帧及非整除尺寸，不预设网格。

| 遗物 | Spritesheet 相对路径 |
|---|---|
| 雷鸣中继 | `spritesheet/Lightning/lightning_strike_001/lightning_strike_001_small_violet/spritesheet.png` |
| 虚空收纳匣 | `spritesheet/Fantasy Spells/spell_absorb_001/spell_absorb_001_small_violet/spritesheet.png` |
| 折跃之瞳 | `spritesheet/Sci-fi/scifi_warp_003/scifi_warp_003_small_blue/spritesheet.png` |
| 死神点名 | `spritesheet/Smoke Bursts/stylized_skull_smoke_burst_001/stylized_skull_smoke_burst_001_small_white/spritesheet.png` |
| 律动破阵 | `spritesheet/Magic Bursts/directional_music_burst_002/directional_music_burst_002_small_yellow/spritesheet.png` |
| 点金秘典 | `spritesheet/Magic Bursts/directional_coin_burst_001/directional_coin_burst_001_small_yellow/spritesheet.png` |
| 蚀毒棱印 | `spritesheet/Fantasy Spells/spell_poison_001/spell_poison_001_small_green/spritesheet.png` |
| 蚀毒棱印 | `spritesheet/Fantasy Spells/status_poison_001/status_poison_001_small_green/spritesheet.png` |
| 无伤心铃 | `spritesheet/Magic Bursts/round_heart_burst_001/round_heart_burst_001_small_red/spritesheet.png` |
| 烟幕羽坠 | `spritesheet/Smoke Bursts/looping_smoke_burst_001/looping_smoke_burst_001_small_gray/spritesheet.png` |
| 升阶礼炮 | `spritesheet/Magic Bursts/round_firework_burst_001/round_firework_burst_001_small_green/spritesheet.png` |

每张 PNG 对应同目录 `spritesheet.txt`。清单和逐帧矩形生成在 `src/visuals/gigapack-clips.ts`，重建命令：`node scripts/import-gigapack.mjs`。原素材包文件未修改或复制。

## 图标与署名

图标来自用户提供的 `十枚奇幻魔法图腾精灵_sprite.png`，从左到右对应 11–20；裁去可见主体外的近透明杂点，保留原 alpha，输出十张独立 256×256 PNG。裁剪脚本：`scripts/crop-gigapack-icons.py`。沿用现有卡片模板、生成图标回退及资源加载状态。

已阅读本地素材包 `license.txt`：允许商用/非商用游戏或应用内分发，禁止单独再分发素材包或素材、随游戏制作工具再分发，以及用于 AI 训练；要求在 credits 或适当位置署名。游戏设置页已添加 `Super Pixel Effects Gigapack — Will Tice / unTied Games`。许可原件在素材根目录；其中引用的在线完整版本次访问超时，未声称读取成功。

## 接入与兼容

- 11–15 完成后构建通过；16–20 完成后构建通过。
- Combat 的伤害、遮挡、击杀和金币收入仍是结算入口；新机制共用现有 6次/tick、24次/秒派生预算及 24 弹、48 特效容量。派生伤害保留源武器信息并标记 behavior/copied，禁止命中递归。
- 状态使用敌人 ID；处决不会误杀复用槽位。过波仅清瞬态，心瓣、虚空层及收入余数不丢失；结束/重开清空全部。
- 使用现有 FlameAtlasBatch 实例化渲染器，增加任意 UV 矩形支持；预设追加注册，保留旧预设顺序。
- 用户明确批准将现有冲刺开放到正式模式：沿用原速度、时长和冷却，支持空格/Shift 与原冲刺按钮。旧编队原型继续仅移动。
- flame-sweep 的资源 URL 为无 Vite env 的纯逻辑测试增加 `/` 回退；浏览器 BASE_URL 行为不变。
- 保留用户工作区原有 `public/assets/effects` 删除记录，本分支提交不包含这些删除。

## 验证

- `npm run build`：两批及最终构建通过；保留现有 Three chunk 大小警告。
- `npm run content:check`：21 件工厂遗物校验通过。
- `tests/gigapack-relics.spec.ts`：10件参数化触发/边界 + 11张源元数据一致性 + 饱和预算 + ID复用/死亡取消。
- `tests/gigapack-smoke.spec.ts`：一次浏览器流程验证雷击、同弹折跃、毒印、真实键盘冲刺烟幕、真实升级确认礼炮；逐场检查加载、错误、容量及帧缓冲像素变化。
- 最终定向测试 **28/28 通过**（11.5秒）：13项新逻辑/素材/边界，1次浏览器流程，10项原遗物逻辑及4项原VFX校验。命令：`npx playwright test tests/gigapack-relics.spec.ts tests/gigapack-smoke.spec.ts tests/behavior-relics.spec.ts tests/vfx-presets.spec.ts --config=playwright.chrome.config.ts --grep-invert "one real browser smoke" --reporter=list`。日志：`artifacts/gigapack/tests.txt`。
- 额外保留前10件逻辑回归和4项既有 VFX 注册校验。未运行全量 Playwright、旧浏览器烟测或平衡模拟；CI未改。
- 初次处决测试因近处经验球触发暂停而停止倒计时，改为远处击杀布置后通过。初次混合烟测的毒印伤害包含同时持有的雷鸣中继，断言改为精确计算两者；预设前插引发旧索引校验失败，改为追加后原测试通过。没有删除原测试或降低断言。

截图：`artifacts/gigapack/{storm-relay,warp-eye,venom-insignia,smokescreen-feather,levelup-salute}.png`。
