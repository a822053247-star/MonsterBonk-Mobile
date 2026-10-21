import {readFileSync,writeFileSync,existsSync} from 'node:fs';
const dir='artifacts/vfx-lifecycle';
const read=name=>JSON.parse(readFileSync(`${dir}/${name}`,'utf8'));
const sets=['chromium-844-high.json','chromium-568-battery.json'].map(read);
const warnings=read('chromium-warnings.json');
const custom=read('chromium-custom.json');
const labels={spark:'火花弹',bubble:'水泡弹',burst:'火花弹 · 已有爆裂分裂升级',steam:'真实蒸汽反应'};
const sections=sets.flatMap(set=>Object.entries(set.scenarios).map(([kind,frames])=>({
  name:`${labels[kind]} · ${set.width}×${set.height} · ${set.quality}`,kind,
  frames:frames.map(f=>({label:f.label,image:f.image,gameTime:f.state.combatTime,age:f.state.event?.age,
    active:f.state.event?.active,radius:f.state.event?.radius,hp:f.state.hp,wet:f.state.wet,
    steam:f.state.steamBursts,pixels:f.pixels.changed,shots:f.state.shots.length,
    atlas:f.state.fire.frames,feedback:f.state.feedback.count,mist:f.state.reactions.count})),
})));
sections.push({name:'临时测试预设 · 不进入卡池',kind:'custom',frames:custom.frames.map(f=>({label:f.label,image:f.image,
  gameTime:f.state.combatTime,pixels:f.pixels.changed,atlas:f.state.fire.frames,shots:f.state.shots.length}))});
const allWarnings=['chromium','webkit'].filter(b=>existsSync(`${dir}/${b}-warnings.json`)).flatMap(b=>read(`${b}-warnings.json`).map(w=>({browser:b,width:w.width,effect:w.effect,kind:w.kind,...w.pixels})));
const summary={seed:20261021,step:1/120,source:'Actual Game / CombatView screenshots, no compositing or interpolation',
  sequences:sections.map(s=>({name:s.name,frames:s.frames})),warnings:allWarnings,
  minimumWarningRetention:Math.min(...allWarnings.map(w=>w.ratio)),custom:custom.validation,
  stress:{accepted:custom.stress.accepted,high:custom.stress.high.feedback.count,low:custom.stress.low.feedback.count,memoryStable:JSON.stringify(custom.stress.memory)===JSON.stringify(custom.stress.after)}};
writeFileSync(`${dir}/summary.json`,JSON.stringify(summary,null,2));
const payload=JSON.stringify({sections,warnings}).replaceAll('<','\\u003c');
writeFileSync(`${dir}/index.html`,`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MonsterBonk VFX 生命周期验收</title>
<style>body{margin:0;background:#111b21;color:#e6f0ef;font:16px/1.65 system-ui,sans-serif}main{max-width:1120px;margin:auto;padding:24px}h1{font-size:26px}h2{font-size:20px}p{color:#bcd1ce}a{color:#8ee3e3}select,button{background:#243b43;color:#fff;border:1px solid #58787f;border-radius:6px;padding:10px;font:inherit}select{max-width:100%}nav{display:flex;gap:12px;flex-wrap:wrap;margin:20px 0}.screen{width:100%;max-width:844px;image-rendering:auto;display:block;border:1px solid #526b72;background:black}input{width:100%;max-width:844px}pre{white-space:pre-wrap;background:#203038;padding:14px;border-radius:8px}#thumbs{display:flex;gap:8px;overflow:auto;max-width:100%;padding:12px 0}#thumbs button{min-width:160px;padding:5px;font-size:12px}#thumbs img{width:150px;display:block}.warnings{display:grid;grid-template-columns:repeat(auto-fit,minmax(310px,1fr));gap:16px}.warnings img{width:100%}.warnings article{background:#203038;padding:12px}footer{margin:36px 0}</style>
<main><h1>MonsterBonk · 战斗特效生命周期</h1><p>以下均为实际游戏渲染截图。固定种子 20261021，正式 Game.step 以 120 Hz 推进；每组从同一局 00:03 开始，沿时间正向采样。夹具控制施法与敌人布置，命中、潮湿、爆裂和蒸汽由现有战斗规则产生。没有拼图、合成特效或插值帧。</p>
<p>HUD 仅显示整秒；下方显示实际战斗时间和事件年龄。慢放是离散原始帧回放，不代表游戏原生帧率。施法起点可能被角色遮挡，随后“emerge / flight-trail”帧展示弹体离开角色和拖尾。</p>
<nav><select id="choose"></select><button id="play">逐帧慢放</button><button id="prev">上一帧</button><button id="next">下一帧</button></nav>
<h2 id="title"></h2><img class="screen" id="screen"><input id="scrub" type="range" min="0" step="1"><pre id="stats"></pre><div id="thumbs"></div>
<h2>精英 / Boss 预警与特效重叠</h2><p>采用现有精英蓄力、Boss 冲锋和扇形预警状态，锁定待比较的警告姿态。通过同一帧四次实际渲染消融计算：有/无 VFX × 有/无预警。统计预警本身仍能贡献可辨认颜色变化的像素比例，而不是只检查 visible 标志。截图和统计涵盖爆炸与蒸汽。</p><div class="warnings" id="warnings"></div>
<h2>可复用与故障验收</h2><p>临时预设使用同一 FirePixelView：1.8 倍尺寸、青色 tint、紫色拖尾、已有图集第 1 行和 [0,2,3] 帧，12 FPS。没有新渲染类，也没有加入玩家卡池。无效尺寸、越界图集和类别错误通过 tryBind 返回错误，保持前一有效预设，测试确认前后屏幕像素完全一致。</p>
<p>素材失败用例实际中断四种 VFX 贴图请求，仍执行真实水命中→火命中→蒸汽伤害；另验证暂停、恢复、事件到期、重开清理、24 发投射物上限、48 粒子上限和高/低画质资源稳定。<a href="chromium-failed-assets-steam.png">查看缺失素材时的实际回退截图</a>。</p>
<footer><a href="summary.json">精简证据 JSON</a> · <a href="chromium-844-high.json">844 高画质完整时序</a> · <a href="chromium-568-battery.json">568 省电画质完整时序</a> · <a href="chromium-custom.json">临时预设与压力证据</a> · <a href="chromium-failed-assets.json">故障与触发条件对照</a></footer></main>
<script>const data=${payload};let section=0,index=0,timer;const $=id=>document.getElementById(id);function stop(){clearTimeout(timer);timer=undefined;$('play').textContent='逐帧慢放'}function render(){const s=data.sections[section],f=s.frames[index];$('title').textContent=s.name+' · '+f.label;$('screen').src=f.image;$('screen').alt=s.name+' '+f.label;$('scrub').max=s.frames.length-1;$('scrub').value=index;$('stats').textContent='战斗时间 '+f.gameTime.toFixed(4)+' s'+(f.age===undefined?'':' | 事件年龄 '+f.age.toFixed(4)+' s | '+(f.active?'存活':'已到期'))+String.fromCharCode(10)+JSON.stringify(f,null,2)}function choose(){stop();section=+$('choose').value;index=0;$('thumbs').replaceChildren();data.sections[section].frames.forEach((f,i)=>{const b=document.createElement('button'),img=document.createElement('img');img.src=f.image;b.append(img,document.createTextNode(f.label+' · '+f.gameTime.toFixed(3)+'s'));b.onclick=()=>{stop();index=i;render()};$('thumbs').append(b)});render()}data.sections.forEach((s,i)=>{const o=document.createElement('option');o.value=i;o.textContent=s.name;$('choose').append(o)});$('choose').onchange=choose;$('scrub').oninput=()=>{stop();index=+$('scrub').value;render()};$('prev').onclick=()=>{stop();index=Math.max(0,index-1);render()};$('next').onclick=()=>{stop();index=Math.min(data.sections[section].frames.length-1,index+1);render()};function advance(){const frames=data.sections[section].frames;if(index>=frames.length-1){stop();return}const delay=Math.max(180,Math.min(1200,(frames[index+1].gameTime-frames[index].gameTime)*5000));timer=setTimeout(()=>{index++;render();advance()},delay)}$('play').onclick=()=>{if(timer){stop();return}if(index===data.sections[section].frames.length-1)index=0;$('play').textContent='暂停慢放';render();advance()};data.warnings.forEach(w=>{const a=document.createElement('article'),p=document.createElement('p'),img=document.createElement('img');p.textContent=w.width+'px · '+w.effect+' / '+w.kind+' · 预警像素保留 '+(100*w.pixels.ratio).toFixed(2)+'%';img.src=w.image;img.alt=p.textContent;a.append(p,img);$('warnings').append(a)});choose();</script></html>`);
console.log(JSON.stringify({sequences:sections.length,frames:sections.reduce((n,s)=>n+s.frames.length,0),warningCases:allWarnings.length,minimumWarningRetention:summary.minimumWarningRetention},null,2));
