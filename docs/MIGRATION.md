# V5.0 安全迁移记录

2026-10-19，仅执行根目录 `plan-v5.0.md` 的 P0 / P1。V4 审查与迁移方案完整保存在 [MIGRATION-V4.0.md](MIGRATION-V4.0.md)。

## 已保护的基线

实施前分支 main，HEAD `3caea4db2f25d9adb9b31ac715d81a714b3cd7eb`。工作区已有随机地图、单兽样板、岩甲贴图及测试/截图等未提交改动，以及新技能原图。用户此前删除的 `public/assets/references/yanrong-concept.png` 保留原状态。

- 检查点：`refs/checkpoints/v5-p0-20261019-005053`
- 快照：`96fe8db6cb9bca643e76f64a7996625062458dcf`
- 仓库外备份：`D:/projects/MonsterBonk-Mobile-backups/v5-p0-20261019-005053/pre-v5.bundle`
- 同目录保存 status-before.txt、working-before.patch、staged-before.patch、checkpoint.txt。

使用独立 GIT_INDEX_FILE、write-tree、commit-tree 与检查点引用保存工作树；git bundle verify 已通过，包含完整历史。原分支、HEAD 与正式 index 未移动；未执行 reset、clean 或强制覆盖。忽略的依赖、构建产物和测试缓存可重建，不包含在检查点中。

回看时在其他目录从 bundle 克隆并按 SHA 检出，不在当前目录做破坏性回退。原 GDD、开发计划和迁移记录先逐字复制为 *-V4.0.md 后，再更新当前文档。

## 复用与增量

|现有模块|本轮复用及变化|
|---|---|
|Game / Input|固定 60Hz 移动、相机、摇杆、暂停、选卡、重开；新增融合入口与三兽兼容入口|
|Combat|索敌、扫掠碰撞、24 投射物池、统一 damageEnemy、击杀和经验；仅新增一次爆炸和一代分裂|
|Progression|经验曲线、随机三选一、去重和上限；融合模式扩展命中分裂，旧模式维持原卡池|
|PartySystem / PartyView|融合模式复用单成员焰绒及现有 PNG；三兽兼容入口恢复旧跟随调用|
|CombatView|复用拖尾、命中、血条和脚影；新增一个有界火焰图集批次，保留程序化回退|
|fusion.ts|只配置一条配方、行为参数与视觉 ID，不实现未来配方|
|素材|原图保持原样，生成规范化副本与逐帧裁剪清单|

所有旧敌人、试炼、三波、角色模型、贴图和测试保留。原随机草场仍为单兽入口，V5 新入口是单兽技能融合原型；本轮不新增区域或探索玩法。

## 生命周期

小火种不在生成 tick 被再次处理，整个寿命忽略原目标，最多一代。池满保留主弹与范围伤害。爆炸瞬时遍历一次，动画不重复结算。暂停、选卡、后台与死亡冻结模拟和图集帧，重开清空技能、池活跃标记、计数和显示实例。多次进入复用图集批次，销毁释放纹理、几何、材质、实例缓冲，加载晚到不能重新挂载。

验收与环境限制见 [V5-P0-P1-REPORT.md](V5-P0-P1-REPORT.md)。后续阶段不自动执行。

## 后续授权：水草四融合

以上表格为 P0/P1 迁移记录。本轮在保留原模块与历史模式的基础上，新增水草四配方及 URL 单兽开发入口，尚未开发正式三幻兽选择。当前迁移差异、前置能力核查、兼容规则和验证见 [WATER-GRASS-FUSIONS.md](WATER-GRASS-FUSIONS.md)，规则以更新后的 [GDD.md](GDD.md) 为准。
