const {chromium}=require('@playwright/test');const fs=require('node:fs/promises');
(async()=>{const browser=await chromium.launch({args:['--enable-unsafe-swiftshader']});try{
 const page=await browser.newPage({viewport:{width:960,height:720}});page.on('pageerror',console.error);
 await page.goto('http://127.0.0.1:5173/artifacts/fox-probe.html');await page.waitForFunction(()=>window.fox);
 for(const [name,t,bind] of [['bind',0,true],['walk-0',0,false],['walk-06',.6,false],['walk-12',1.2,false]]){
 await page.evaluate(([t,bind])=>window.fox.set(t,bind),[t,bind]);await page.screenshot({path:`artifacts/fox-before-${name}.png`});}
 const data=await page.evaluate(()=>{const f=window.fox;f.set(0,true);const meshes=[];f.gltf.scene.traverse(o=>{if(!o.isSkinnedMesh)return;const geo=o.geometry,weights=geo.attributes.skinWeight,joints=geo.attributes.skinIndex,p=geo.attributes.position;const bones=o.skeleton.bones.map(b=>({name:b.name,world:b.getWorldPosition(b.position.clone()).toArray(),vertices:0,weight:0,center:[0,0,0]}));for(let i=0;i<p.count;i++)for(let k=0;k<4;k++){const w=weights.array[i*4+k],j=joints.array[i*4+k],bone=bones[j];bone.weight+=w;if(w>.25)bone.vertices++;for(let a=0;a<3;a++)bone.center[a]+=p.array[i*3+a]*w;}bones.forEach(b=>b.center=b.center.map(x=>x/Math.max(.0001,b.weight)));meshes.push({vertices:p.count,bones});});return {clips:f.gltf.animations.map(a=>({name:a.name,duration:a.duration,tracks:a.tracks.map(t=>({name:t.name,keys:t.times.length}))})),meshes};});
 await fs.writeFile('artifacts/fox-rig-analysis.json',JSON.stringify(data,null,2));console.log('Original rig inspected:',data.meshes[0].bones.length,'bones');
 await page.goto('http://127.0.0.1:5173/artifacts/fox-probe.html?fixed');await page.waitForFunction(()=>window.fox);
 for(const time of [0,.18,.36,.54]){await page.evaluate(t=>window.fox.set(t),time);await page.screenshot({path:`artifacts/fox-after-${time}.png`});}
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
