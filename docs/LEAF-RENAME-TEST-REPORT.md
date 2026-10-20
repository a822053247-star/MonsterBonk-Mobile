# 飞叶弹改名测试记录

日期：2026-10-20（Asia/Shanghai）

## 结果

- `npm run build`：通过 TypeScript 检查和生产构建。Vite 保留大包体提示。
- `git diff --check`：通过。
- `npx playwright test tests/leaf-rename.spec.ts --reporter=list --output=artifacts/leaf-rename-results`：4/4 通过。
- 全量命令：`npx playwright test --workers=4 --reporter=line,json`；608 项，580 通过、24 失败、4 跳过、0 flaky，耗时约 7.6 分钟。
- 浏览器：Chromium、WebKit。改名界面检查覆盖 844×390、568×320。

新增专项测试检查真实武器定义、获取和强化卡、融合预览、角色选择、战斗 HUD、新名称容纳情况及页面运行异常。三武器模型测试另行覆盖获取、冷却、分裂、连锁、弹池满载和重开。

## 全量失败清单

以下 12 个用例均在两个浏览器失败，共 24 项。没有为使测试通过而修改游戏行为或放宽断言。

| 文件 / 场景 | 实际失败点 |
|---|---|
| `build-depth-ui.spec.ts` 构筑展示 | 期望 `火花弹 Lv.2`，实际为 `火花弹 2级` |
| `combat-clarity-ui.spec.ts` 冷却条 | 期望 3 个 `.weapon-charge`，实际 0 个 |
| `combat-model.spec.ts` 对象池上限 | 仅生成 100 个敌人，却要求激活数等于容量 256 |
| `elemental-fusion-ui.spec.ts` 水系融合 | 读取未定义对象的 `count` |
| `elemental-fusion-ui.spec.ts` 草系融合 | 读取未定义对象的 `count` |
| `elemental-fusion-ui.spec.ts` 缺图回退 | 读取未定义对象的 `count` |
| `flame-sweep.spec.ts` 满弹池近战结算 | 期望 1，实际 0；需要继续核查结算场景 |
| `fusion-ui.spec.ts` 融合卡图标 | 未找到旧 `.fire-icon` 元素 |
| `fusion-ui.spec.ts` 缺图回退 | 读取未定义对象的 `count` |
| `swarm.spec.ts` 范围击杀 | 期望击杀 8，实际 7 |
| `swarm.spec.ts` 大量敌人资源边界 | 期望击杀数大于 0，实际 0 |
| `three-weapon-ui.spec.ts` 融合提示 | 期望“融合协同”，实际提示为空且隐藏；新名称断言已通过 |

已核实 `src/game.ts` 主动清空并隐藏融合提示，`src/style.css` 明确隐藏旧冷却与提示区域，等级使用“2级”。这些失败预期与当前界面实现不一致。其余战斗和视觉失败尚未完成根因修复，也未对改名前版本进行完整对照运行，因此本次结果不代表整个游戏全部通过。

## 产物

- 完整机器结果：`artifacts/rename-test-results.json`
- 完整运行日志：`artifacts/rename-test-progress.txt`
- 失败截图、上下文和 trace：`test-results/`
- 专项用例：`tests/leaf-rename.spec.ts`

已还原本次运行产生的 120 个原先干净的受跟踪截图差异；运行前已有改动的截图和已删除文档未执行 Git 还原。
