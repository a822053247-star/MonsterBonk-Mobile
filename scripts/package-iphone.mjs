import { readdir, readFile, writeFile, mkdir, copyFile, stat } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { releaseAssets } from './release-assets.mjs';
import { checkReleaseAssets } from './check-release-assets.mjs';

// Ship existing runtime resources; original artwork/source packs stay in the repository.
function runtime(path) {
  if (releaseAssets.has(path)) return true;
  if (!path.startsWith('assets/')) return ['index.html','favicon.svg','manifest.webmanifest','install.html','THIRD_PARTY_LICENSES.txt'].includes(path);
  if (!path.slice(7).includes('/')) return /\.(js|css)$/.test(path);
  if (path.startsWith('assets/audio/')) return /\.(mp3|ogg|txt|md)$/.test(path);
  if (path.startsWith('assets/scenery/volcano/')) return path.endsWith('/volcano-atlas.png');
  if (path.startsWith('assets/scenery/')) return /\.png$/.test(path) && !path.includes('reference');
  if (path.startsWith('assets/kenney_particle-pack/')) return /\/PNG \(Transparent\)\/(smoke_08|magic_02|circle_03|spark_01)\.png$/.test(path);
  if (path.startsWith('assets/music/')) return /\/(bgm-grassland|BossBattle)\.ogg$/.test(path);
  if (path.startsWith('assets/pixel/')) {
    return /^assets\/pixel\/creatures\/[^/]+\.png$/.test(path)
      || /^assets\/pixel\/creatures\/animation\/[^/]+\.normalized\.png$/.test(path)
      || /^assets\/pixel\/enemies\/[^/]+\.png$/.test(path)
      || /^assets\/pixel\/enemies\/direction\/[^/]+\/runtime\.normalized\.png$/.test(path)
      || /^assets\/pixel\/boss\/Crownthorn\/runtime\/[^/]+\.png$/.test(path)
      || /^assets\/pixel\/skills\/(yanrong|fusions)\/[^/]+\.normalized\.png$/.test(path);
  }
  return /\.(png|webp|glb|svg)$/.test(path) && !path.startsWith('assets/ui/raw/');
}
async function walk(root, prefix = '') {
  const result = [];
  for (const entry of await readdir(join(root,prefix), { withFileTypes: true })) {
    const path = prefix + entry.name;
    if (entry.isDirectory()) result.push(...await walk(root,path+'/'));
    else if (runtime(path)) result.push(path);
  }
  return result.sort();
}
const files = await walk('dist');
const hash = createHash('sha256');
const assetHashes = {};
for (const path of files) {
  const bytes = await readFile(join('dist',path));
  hash.update(path).update(bytes);
  assetHashes[path] = createHash('sha256').update(bytes).digest('hex');
}
const workerSource = await readFile('scripts/iphone-sw.js','utf8');
hash.update(workerSource);
const version = hash.digest('hex').slice(0,12);
const folder = resolve('releases',`MonsterBonk-iPhone-${version}`), site = join(folder,'site');
await mkdir(site, { recursive:true });
let bytes = 0;
for (const path of files) {
  const destination = join(site,path); await mkdir(dirname(destination),{recursive:true});
  await copyFile(join('dist',path),destination); bytes += (await stat(destination)).size;
}
await checkReleaseAssets(site);
const worker = workerSource.replace('__VERSION__',version)
  .replace('__FILES__',JSON.stringify(files)).replace('__HASHES__',JSON.stringify(assetHashes));
await writeFile(join(site,'sw.js'),worker);
await writeFile(join(site,'.nojekyll'),'');
await writeFile(join(site,'version.json'),JSON.stringify({version,sourceCommit:spawnSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).stdout.trim()}));
await writeFile(join(folder,'安装说明.txt'), '请将 site 文件夹完整部署到 HTTPS 静态网站。\n苹果手机用 Safari 打开网址，可直接联网游玩；需要离线时点击菜单“下载离线资源”，等待“离线资源已就绪”，分享 → 添加到主屏幕。\n这是主屏幕网页 App，不是 IPA；不能直接在“文件”中点击 ZIP 安装。\n安装后首次启动仍应保持联网，确认离线就绪后再断网。\n');
await writeFile('releases/latest.json',JSON.stringify({folder,site,version,files:files.length,bytes},null,2));
const zip = folder + '.zip';
if (!process.argv.includes('--no-zip') && process.platform === 'win32') {
  const result = spawnSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',resolve('scripts/archive-iphone.ps1'),'-Source',folder,'-Destination',zip],{stdio:'inherit'});
  if (result.status !== 0) throw new Error('ZIP packaging failed');
} else if (!process.argv.includes('--no-zip') && process.platform === 'darwin') {
  const result = spawnSync('ditto',['-c','-k','--keepParent',folder,zip],{stdio:'inherit'});
  if (result.status !== 0) throw new Error('ZIP packaging failed');
}
console.log(`iPhone home-screen app: ${files.length} files, ${(bytes/1048576).toFixed(1)} MB\n${folder}${process.argv.includes('--no-zip')?'':`\n${zip}`}`);
