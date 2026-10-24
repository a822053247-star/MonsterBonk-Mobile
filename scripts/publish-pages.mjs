import { spawnSync } from 'node:child_process';
import { readFile, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';

// Publish a packaged site without checking out branches or replacing source files.
const root=resolve('.');
function run(args,options={}) {
  const result=spawnSync('git',args,{cwd:root,encoding:'utf8',...options});
  if(result.status!==0)throw new Error(result.stderr||result.error?.message||`git ${args[0]} failed`);
  return result.stdout.trim();
}
if(run(['status','--porcelain']))throw new Error('Commit source changes before publishing Pages.');
if(run(['branch','--show-current'])!=='main')throw new Error('Publish the committed main branch.');
const release=JSON.parse(await readFile('releases/latest.json','utf8'));
const manifest=JSON.parse(await readFile(join(release.site,'version.json'),'utf8'));
const head=run(['rev-parse','HEAD']);
if(manifest.sourceCommit!==head)throw new Error('Packaged site does not match HEAD. Rebuild and package before publishing.');
run(['fetch','origin','gh-pages-iphone']);
const parent=run(['rev-parse','origin/gh-pages-iphone']);
const gitDir=run(['rev-parse','--absolute-git-dir']);
const index=resolve('releases',`pages-index-${randomUUID()}`);
const options={cwd:release.site,env:{...process.env,GIT_INDEX_FILE:index}};
const git=['--git-dir',gitDir,'--work-tree',release.site];
try {
  run([...git,'read-tree','--empty'],options);
  run([...git,'-c','core.autocrlf=false','add','--all','--force'],options);
  const tree=run([...git,'write-tree'],options);
  const commit=run(['commit-tree',tree,'-p',parent,'-m',`Publish ${release.version} from main ${head.slice(0,7)}`]);
  console.log(run(['push','origin',`${commit}:refs/heads/gh-pages-iphone`]));
  console.log(JSON.stringify({version:release.version,sourceCommit:head,deploymentCommit:commit,url:'https://a822053247-star.github.io/MonsterBonk-Mobile/'}));
} finally { await rm(index,{force:true}); }
