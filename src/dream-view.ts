import * as THREE from 'three';
import type { Combat } from './combat';
import { isDreamWeapon } from './dream-combat';
import { WaterAtlas } from './water-aoe-view';
import { instanceOpacity } from './visuals/instance-opacity';

const OPACITY = { projectile: .96, mark: 1, flower: .86, petal: .85, star: .95, link: .85 } as const;

/** Per-frame UV windows align the supplied uneven raw frames without rewriting any PNG. */
class DreamAtlas extends WaterAtlas {
  private rects: THREE.InstancedBufferAttribute;
  constructor(name: string, capacity: number, private windows: readonly (readonly number[])[], private sheet: readonly number[], clearCenter = false) {
    super(name, 1, 1, 'dream', capacity, false);
    this.mesh.material.color.setScalar(1); this.mesh.material.alphaTest = .14;
    this.rects = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
    this.rects.setUsage(THREE.DynamicDrawUsage); this.mesh.geometry.setAttribute('dreamRect', this.rects);
    const compile = this.mesh.material.onBeforeCompile;
    this.mesh.material.onBeforeCompile = (shader, renderer) => {
      compile(shader, renderer);
      shader.vertexShader = 'attribute vec4 dreamRect;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_MAP
          vMapUv = dreamRect.xy + uv * dreamRect.zw;
        #endif`);
      shader.fragmentShader = shader.fragmentShader.replace('#include <alphatest_fragment>', `
        float dreamEdge = min(min(waterLocalUv.x, 1.0-waterLocalUv.x), min(waterLocalUv.y, 1.0-waterLocalUv.y));
        diffuseColor.a *= smoothstep(0.0, 0.075, dreamEdge);
        ${clearCenter ? 'diffuseColor.a *= mix(0.68, 1.0, smoothstep(0.10, 0.30, length(waterLocalUv - vec2(0.5))));' : ''}
        #include <alphatest_fragment>`);
    };
    this.mesh.material.customProgramCacheKey = () => `dream-aligned-rect-center-${clearCenter}`;
  }
  putRect(frame: number, x: number, z: number, width: number, depth: number, alpha: number, rotation = 0, height = .08) {
    const index = this.mesh.count;
    super.putRect(0, x, z, width, depth, alpha, rotation, height);
    if (this.mesh.count === index) return;
    const [rx, ry, rw, rh] = this.windows[Math.min(this.windows.length - 1, Math.max(0, frame))];
    this.rects.setXYZW(index, rx / this.sheet[0], 1 - (ry + rh) / this.sheet[1], rw / this.sheet[0], rh / this.sheet[1]);
  }
  finish() { super.finish(); this.rects.needsUpdate = true; }
}

export class DreamView {
  readonly group = new THREE.Group();
  readonly darts = new DreamAtlas('dart', 24, [[35,170,590,440],[630,140,620,510],[0,610,627,520],[640,680,610,420]], [1254,1254]);
  readonly seeds = new DreamAtlas('seed', 24, [[100,280,1060,700]], [1254,1254]);
  readonly marks = new DreamAtlas('mark', 512, [[200,120,850,1020]], [1254,1254]);
  readonly flowers = new DreamAtlas('echo', 64,
    [[15,20,400,420],[420,20,400,420],[825,5,435,435],[1260,0,514,443],
      [0,443,465,444],[470,443,440,444],[925,443,420,444],[1350,443,424,444]], [1774,887], true);
  private atlases = [this.darts, this.seeds, this.marks, this.flowers];
  private orientation = new THREE.Quaternion();
  private ground = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0), -Math.PI/2);
  private spin = new THREE.Quaternion();
  private axis = new THREE.Vector3(0,0,1);
  private pose = new THREE.Object3D();
  private color = new THREE.Color();
  private petals = this.batch(this.petalGeometry(), 256, '#ffb5df');
  private stars = this.batch(this.starGeometry(), 128, '#ffe8f4');
  private lines = this.batch(new THREE.PlaneGeometry(1,1), 128, '#ff9bda');
  constructor() {
    this.group.name = 'DreamFlowerEffects';
    for (const atlas of this.atlases) { atlas.mesh.material.color.setScalar(1.2); atlas.mesh.material.alphaTest = .14; this.group.add(atlas.mesh); }
    this.flowers.mesh.material.alphaTest = .055;
    this.marks.mesh.setColorAt(0, this.color.set('#ffffff'));
    this.group.add(this.petals.mesh, this.stars.mesh, this.lines.mesh);
  }
  private petalGeometry() {
    const s = new THREE.Shape(); s.moveTo(0,-.5); s.quadraticCurveTo(-.5,.05,0,.5); s.quadraticCurveTo(.5,.05,0,-.5);
    return new THREE.ShapeGeometry(s, 3);
  }
  private starGeometry() {
    const s = new THREE.Shape();
    for (let i=0;i<8;i++) { const a=i*Math.PI/4, r=i%2?.12:.5; if (!i) s.moveTo(Math.cos(a)*r,Math.sin(a)*r); else s.lineTo(Math.cos(a)*r,Math.sin(a)*r); }
    s.closePath(); return new THREE.ShapeGeometry(s);
  }
  private batch(geometry: THREE.BufferGeometry, capacity: number, color: string) {
    const mesh = new THREE.InstancedMesh(geometry,new THREE.MeshBasicMaterial({color,transparent:true,depthWrite:false,side:THREE.DoubleSide,toneMapped:false}),capacity);
    mesh.count=0; mesh.frustumCulled=false; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    return {mesh,alpha:instanceOpacity(mesh,capacity)};
  }
  setView(camera: THREE.Camera) { this.orientation.copy(camera.quaternion); }
  private sprite(atlas: DreamAtlas, x: number, y: number, z: number, w: number, h: number, tint: string) {
    const index = atlas.mesh.count; atlas.putRect(0,x,z,w,h,OPACITY.mark);
    if (atlas.mesh.count === index) return;
    this.pose.position.set(x,y,z); this.pose.quaternion.copy(this.orientation); this.pose.scale.set(w,h,1); this.pose.updateMatrix();
    atlas.mesh.setMatrixAt(index,this.pose.matrix); atlas.mesh.setColorAt(index,this.color.set(tint));
  }
  private particle(batch: typeof this.petals, x: number, y: number, z: number, w: number, h: number, alpha: number, angle: number, billboard=false) {
    if (batch.mesh.count>=batch.mesh.instanceMatrix.count || alpha<=0) return;
    const index=batch.mesh.count++; this.pose.position.set(x,y,z); this.pose.scale.set(w,h,1);
    this.pose.quaternion.copy(billboard?this.orientation:this.ground).multiply(this.spin.setFromAxisAngle(this.axis,angle));
    this.pose.updateMatrix(); batch.mesh.setMatrixAt(index,this.pose.matrix); batch.alpha.setX(index,alpha);
  }
  render(combat: Combat, alpha: number, detail: number) {
    this.clear();
    for (const shot of combat.projectiles) {
      if (!shot.active || !isDreamWeapon(shot.attackId) || shot.vfxPresetId) continue;
      const x=THREE.MathUtils.lerp(shot.previousX,shot.x,alpha),z=THREE.MathUtils.lerp(shot.previousZ,shot.z,alpha),angle=-Math.atan2(shot.vz,shot.vx);
      const scale=combat.projectileRadius(shot)/.2;
      if (shot.attackId==='dream-dart') this.darts.putRect(Math.floor((shot.age??0)*10)%4,x,z,1.65*scale,1.10*scale,OPACITY.projectile,angle,.32);
      else this.seeds.putRect(0,x,z,1.8*scale,1.0*scale,OPACITY.projectile,angle,.3);
    }
    for (const enemy of combat.enemies) {
      if (!enemy.active || enemy.spawnTime>0) continue;
      const x=THREE.MathUtils.lerp(enemy.previousX,enemy.x,alpha),z=THREE.MathUtils.lerp(enemy.previousZ,enemy.z,alpha);
      const head=enemy.rank==='boss'?4.8:(enemy.kind==='tank'?2.3:enemy.kind==='fast'?1.45:1.7)*(enemy.rank==='elite'?1.35:1)+.35;
      const stacks=enemy.dreamStacks??0, resonance=(enemy.resonanceTime??0)>0;
      if (stacks>0 && (enemy.dreamTime??0)>0) {
        this.sprite(this.marks,x,head,z,.34+stacks*.045,.43+stacks*.055,'#ffffff');
        for(let i=0;i<stacks;i++) this.particle(this.stars,x+(i-(stacks-1)/2)*.18,head-.4,z,.09,.09,1,0,true);
      }
      if(resonance) this.sprite(this.marks,x+(stacks ? .48 : 0),head+.02,z,.32,.4,'#d4a6ff');
    }
    for(const event of combat.dream.events) {
      if(!event.active)continue;
      const t=event.age/event.duration;
      if(event.kind==='link') {
        const dx=event.tx-event.x,dz=event.tz-event.z,length=Math.hypot(dx,dz);
        this.particle(this.lines,(event.x+event.tx)/2,.35,(event.z+event.tz)/2,length,.055,(1-t)*OPACITY.link,-Math.atan2(dz,dx));
      } else if(event.kind==='bloom'||event.kind==='pulse') {
        const frame=Math.min(7,Math.floor(t*8)),scale=event.kind==='pulse'?1:.88;
        this.flowers.put(frame,event.x,event.z,event.radius*2.05*scale,Math.min(1,(1-t)*3)*OPACITY.flower,0,.18);
      }
      const count=detail<=2?3:event.kind==='impact'?4:8;
      for(let i=0;i<count;i++) {
        const a=event.seed*1.9+i/count*Math.PI*2,reach=(event.kind==='impact' ? .4 : Math.max(.7,event.radius))*(.12+t*.9);
        this.particle(this.petals,event.x+Math.cos(a)*reach,.28+Math.sin(t*Math.PI)*.5,event.z+Math.sin(a)*reach,
          .13*(1-t),.24*(1-t),OPACITY.petal*(1-t),a+t*2);
        if(i%3===0)this.particle(this.stars,event.x+Math.cos(a)*reach,.42,event.z+Math.sin(a)*reach,.2*(1-t),.2*(1-t),OPACITY.star*(1-t),a);
      }
    }
    for(const atlas of this.atlases)atlas.finish();
    if(this.marks.mesh.instanceColor)this.marks.mesh.instanceColor.needsUpdate=true;
    for(const b of [this.petals,this.stars,this.lines]){b.mesh.instanceMatrix.needsUpdate=true;b.alpha.needsUpdate=true;}
  }
  clear(){for(const a of this.atlases)a.begin();for(const b of [this.petals,this.stars,this.lines])b.mesh.count=0;}
  inspect(){return{atlases:this.atlases.map(a=>({name:a.mesh.name,...a.inspect()})),petals:this.petals.mesh.count,stars:this.stars.mesh.count,links:this.lines.mesh.count};}
  dispose(){this.clear();for(const a of this.atlases)a.dispose();for(const b of [this.petals,this.stars,this.lines]){b.mesh.geometry.dispose();b.mesh.material.dispose();b.mesh.dispose();}this.group.removeFromParent();}
}
