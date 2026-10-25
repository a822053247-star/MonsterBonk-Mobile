# GitHub Pages 正式游戏发布

固定网址：https://a822053247-star.github.io/MonsterBonk-Mobile/

Pages 当前从 `gh-pages-iphone` 分支根目录发布，`main` 保存源码；只推送 `main` 不会替换在线游戏。完成源码提交并推送 `main` 后，在项目根目录运行：

```powershell
npm run publish:pages
```

该命令执行类型检查/生产构建、iPhone/PWA运行资源打包，再使用独立临时Git索引创建发布提交并正常推送 `gh-pages-iphone`；不切换源码工作区、不强制推送、不删除本地源码。源码必须已提交，打包版本必须匹配当前HEAD；远程存在竞争更新时推送会失败，不能覆盖他人提交。

`scripts/package-iphone.mjs`纳入运行时WebP卡图、MP3/OGG音效与四地区图集，排除火山源分割片、归属图和参考原图。`version.json`提供资源版本和源码提交；发布后核对Pages构建成功、该文件及首页引用的带哈希JS/CSS可访问。

正式构建隐藏主菜单“新功能测试、道具测试、捕捉测试、敌人测试、旧版模式”页脚，保留DOM供原事件绑定，`hidden`有专用CSS。开发构建保留这些入口。最高游戏速度为2倍，设置仅有1/2，HUD循环1→2→1；旧存储的3–10倍加载时被限制至2。

本次用户明确要求可玩的正式发布，因此执行必要生产构建和定向验证，覆盖此前扩展阶段“不构建/不测试”的相应限制，不开展无关全量回归。定向验证：`npx playwright test tests/game-speed.spec.ts --project=chromium`；打包后运行本地静态预览并执行 `node scripts/smoke-public-release.mjs [预览URL]`，核对正式页入口隐藏、旧设置限制、四地区加载及计时。

PWA更新时联网导航优先当前HTML，离线仍回退缓存；资源按哈希版本缓存，新worker不强制中断正在进行的游戏。曾打开旧版的用户如仍见旧界面，应关闭该站点的旧标签页/主屏幕App后重新打开，让等待中的更新接管。

无尽进入加载：`src/infinite-world.ts`只请求当前选中地区的障碍物图集，避免草甸被雪原/火山等无关图集的慢请求阻塞。当前地区图集8秒未返回时使用既有占位布景；真实图集随后完成会更新共享材质及实例UV/锚点，地形生成和碰撞就绪仍是开战条件。回归见`tests/endless-startup-assets.spec.ts`，覆盖无关图集挂起与火山图集超时后恢复。
