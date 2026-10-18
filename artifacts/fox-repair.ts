import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

// Asset-specific repair. Original geometry/UVs are retained; the input is never overwritten.
const input = await new GLTFLoader().loadAsync('/assets/characters/fire+fox+3d+model_Clone1.glb');
let source: THREE.SkinnedMesh | undefined;
input.scene.traverse(o => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) source = o as THREE.SkinnedMesh; });
if (!source) throw Error('Expected the supplied Tripo skinned mesh');
source.pose(); input.scene.updateMatrixWorld(true);
const original = source.skeleton.bones, geometry = source.geometry.clone();
const root = new THREE.Group(); root.name = 'YanrongRepaired';
const body = new THREE.Bone(); body.name = 'Body'; root.add(body);
const tail = new THREE.Bone(); tail.name = 'Tail'; tail.position.set(.056,.246,-.176); body.add(tail);
const bones = [body, tail];
const v = (x:number,y:number,z:number) => new THREE.Vector3(x,y,z);
const defs = [
  {name:'FrontRight',prefix:'tripo1_Right_Limb_',hip:v(.125,.22,.173),knee:v(.155,.11,.145),paw:v(.178,.034,.291),phase:0},
  {name:'FrontLeft',prefix:'tripo1_Left_Limb_',hip:v(-.133,.238,.147),knee:v(-.19,.12,.10),paw:v(-.232,.034,.211),phase:Math.PI},
  {name:'RearRight',prefix:'tripo0_Right_Limb_',hip:v(.14,.2,-.073),knee:v(.175,.115,-.19),paw:v(.219,.034,-.159),phase:Math.PI},
  {name:'RearLeft',prefix:'tripo0_Left_Limb_',hip:v(-.084,.197,-.085),knee:v(-.065,.11,-.24),paw:v(-.071,.034,-.208),phase:0},
];
const legs = defs.map(d => {
  const hip = new THREE.Bone(), knee = new THREE.Bone(), paw = new THREE.Bone();
  hip.name = d.name+'Hip'; knee.name = d.name+'Knee'; paw.name = d.name+'Paw';
  hip.position.copy(d.hip); knee.position.copy(d.knee).sub(d.hip); paw.position.copy(d.paw).sub(d.knee);
  body.add(hip); hip.add(knee); knee.add(paw); const offset = bones.length; bones.push(hip,knee,paw);
  const bindAxis=d.paw.clone().sub(d.hip).normalize();
  const pole=d.knee.clone().sub(d.hip);pole.addScaledVector(bindAxis,-pole.dot(bindAxis)).normalize();
  return {...d,hipBone:hip,kneeBone:knee,pawBone:paw,offset,pole};
});
const oldJoints = geometry.getAttribute('skinIndex'), oldWeights = geometry.getAttribute('skinWeight'), positions = geometry.getAttribute('position');
const joints = new Uint16Array(positions.count*4), weights = new Float32Array(positions.count*4);
const smooth = (t:number) => {t=THREE.MathUtils.clamp(t,0,1);return t*t*(3-2*t)};
for (let i=0;i<positions.count;i++) {
  const amounts = [0,0,0,0]; let tailWeight = 0;
  for (let k=0;k<4;k++) {
    const name=original[oldJoints.getComponent(i,k)].name, w=oldWeights.getComponent(i,k);
    legs.forEach((leg,n)=>{if(name.startsWith(leg.prefix))amounts[n]+=w});
    if (/^bone_(23|24|25|26|27)$/.test(name)) tailWeight+=w;
  }
  const limb=amounts.indexOf(Math.max(...amounts)), leg=legs[limb], amount=amounts[limb], y=positions.getY(i);
  const list: [number,number][] = [[0,Math.max(0,1-amount-tailWeight)],[1,tailWeight]];
  if (y>=leg.knee.y) {
    const blend=smooth((leg.hip.y-y)/(leg.hip.y-leg.knee.y));
    list.push([leg.offset,amount*(1-blend)],[leg.offset+1,amount*blend]);
  } else {
    // Keep all toe/sole vertices rigid to the paw to avoid folded claws and sole tearing.
    const blend=smooth((leg.knee.y-y)/(leg.knee.y-.065));
    list.push([leg.offset+1,amount*(1-blend)],[leg.offset+2,amount*blend]);
  }
  list.sort((a,b)=>b[1]-a[1]);const sum=list.reduce((s,a)=>s+a[1],0);
  list.forEach(([bone,w],k)=>{joints[i*4+k]=bone;weights[i*4+k]=w/sum});
}
geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(joints,4));geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weights,4));
const mesh = new THREE.SkinnedMesh(geometry, source.material); mesh.name='Yanrong';mesh.frustumCulled=false;root.add(mesh);
root.updateMatrixWorld(true);mesh.bind(new THREE.Skeleton(bones));mesh.normalizeSkinWeights();

function pose(phase:number) {
  body.position.y=.004*(1-Math.cos(phase*2)); tail.quaternion.setFromAxisAngle(v(0,1,0),Math.sin(phase)*.045);
  for(const leg of legs) {
    const p=phase+leg.phase, swing=Math.sin(p);
    const hip=leg.hip.clone().add(v(0,body.position.y,0));
    const target=leg.paw.clone().add(v(0,Math.max(0,swing)*.038,Math.cos(p)*.055));
    const a=leg.knee.clone().sub(leg.hip), b=leg.paw.clone().sub(leg.knee), l1=a.length(),l2=b.length();
    const axis=target.clone().sub(hip), distance=THREE.MathUtils.clamp(axis.length(),Math.abs(l1-l2)+.0001,l1+l2-.0001);axis.normalize();
    target.copy(hip).addScaledVector(axis,distance);
    // Keep a fixed bend pole: projecting the upper-leg direction itself can
    // switch hemisphere as the foot passes under the hip, popping the knee.
    const bend=leg.pole.clone().addScaledVector(axis,-leg.pole.dot(axis)).normalize();
    const along=(l1*l1-l2*l2+distance*distance)/(2*distance), height=Math.sqrt(Math.max(0,l1*l1-along*along));
    const knee=hip.clone().addScaledVector(axis,along).addScaledVector(bend,height);
    const upper=new THREE.Quaternion().setFromUnitVectors(a.normalize(),knee.clone().sub(hip).normalize());
    const lower=new THREE.Quaternion().setFromUnitVectors(b.normalize(),target.clone().sub(knee).normalize());
    leg.hipBone.quaternion.copy(upper);leg.kneeBone.quaternion.copy(upper).invert().multiply(lower);leg.pawBone.quaternion.copy(lower).invert();
  }
  root.updateMatrixWorld(true);mesh.skeleton.update();
}
const times:number[]=[],values=new Map<string,number[]>();
for(let frame=0;frame<=48;frame++) {
  const time=frame/48*.72;times.push(time);pose(frame/48*Math.PI*2);
  for(const bone of bones) {
    const name=bone.name+'.quaternion';if(!values.has(name))values.set(name,[]);values.get(name)!.push(...bone.quaternion.toArray());
  }
  const name='Body.position';if(!values.has(name))values.set(name,[]);values.get(name)!.push(...body.position.toArray());
}
const tracks=[...values].map(([name,data])=>name.endsWith('position')?new THREE.VectorKeyframeTrack(name,times,data):new THREE.QuaternionKeyframeTrack(name,times,data));
const clip=new THREE.AnimationClip('WalkInPlace',.72,tracks);
// Return to bind pose before exporting; inverse bind matrices stay unchanged.
body.position.set(0,0,0);bones.forEach(b=>b.quaternion.identity());root.updateMatrixWorld(true);
root.userData={repair:'MonsterBonk four-leg IK gait v1',source:'fire+fox+3d+model_Clone1.glb',triangles:geometry.index!.count/3};
Object.assign(window,{foxRepair:{root,mesh,bones,legs,pose,clip,export:()=>new GLTFExporter().parseAsync(root,{binary:true,animations:[clip],maxTextureSize:1024})}});
