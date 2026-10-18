const fs=require('node:fs'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const sourcePath='public/assets/characters/fire+fox+3d+model_Clone1.glb',fixedPath='public/assets/characters/yanrong-repaired.glb';
function read(path){const bytes=fs.readFileSync(path),length=bytes.readUInt32LE(12),json=JSON.parse(bytes.subarray(20,20+length)),bin=bytes.subarray(28+length);return {bytes,json,get(id){const a=json.accessors[id],v=json.bufferViews[a.bufferView],n={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16}[a.type],method={5126:'readFloatLE',5125:'readUInt32LE',5123:'readUInt16LE',5121:'readUInt8'}[a.componentType],size={5126:4,5125:4,5123:2,5121:1}[a.componentType],out=[];for(let i=0;i<a.count;i++)for(let k=0;k<n;k++)out.push(bin[method]((v.byteOffset||0)+(a.byteOffset||0)+i*(v.byteStride||n*size)+k*size));return out}}}
const a=read(sourcePath),b=read(fixedPath),hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
assert.equal(hash(a.bytes),hash(execFileSync('git',['show','8e77ccc:'+sourcePath],{maxBuffer:16*1024*1024})));
const p=a.json.meshes[0].primitives[0],q=b.json.meshes[0].primitives[0];
assert.deepEqual(a.get(p.attributes.POSITION),b.get(q.attributes.POSITION));assert.deepEqual(a.get(p.attributes.TEXCOORD_0),b.get(q.attributes.TEXCOORD_0));assert.deepEqual(a.get(p.indices),b.get(q.indices));
const anim=b.json.animations[0],body=anim.channels.find(c=>c.target.path==='translation');const translation=b.get(anim.samplers[body.sampler].output);
for(let i=0;i<translation.length;i+=3){assert.equal(translation[i],0);assert.equal(translation[i+2],0)}
let maxJointStep=0;
for(const channel of anim.channels){if(channel.target.path!=='rotation')continue;const values=b.get(anim.samplers[channel.sampler].output);for(let i=4;i<values.length;i+=4){let dot=0;for(let k=0;k<4;k++)dot+=values[i+k]*values[i+k-4];maxJointStep=Math.max(maxJointStep,2*Math.acos(Math.min(1,Math.abs(dot))))}}
assert(maxJointStep<.15,'Knee pole flip or overextended IK caused an abrupt joint step');
const result={originalSha256:hash(a.bytes),repairedSha256:hash(b.bytes),originalBytes:a.bytes.length,repairedBytes:b.bytes.length,originalPreserved:true,positionUvAndTrianglesUnchanged:true,vertices:b.json.accessors[q.attributes.POSITION].count,triangles:b.json.accessors[q.indices].count/3,bones:b.json.skins[0].joints.length,clip:anim.name,noHorizontalRootMotion:true,maxJointStepDegrees:maxJointStep*180/Math.PI,images:b.json.images.length};
fs.writeFileSync('artifacts/fox-asset-audit.json',JSON.stringify(result,null,2));console.log(result);
