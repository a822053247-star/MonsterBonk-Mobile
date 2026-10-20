import * as THREE from 'three';
import type { Combat, EnemyKind } from './combat';
import { TREASURE_RUNNER } from './special-enemies';
import { FlameAtlasBatch } from './flame-sweep-assets';

type Slot = {
  group: THREE.Group; coin: THREE.Sprite; title: THREE.Sprite; ticks: THREE.Mesh[];
  tracker: THREE.Group; arrow: THREE.Sprite; edgeTitle: THREE.Sprite;
  id: number; age: number; sampledAt: number; head: number;
  trail: {x:number;z:number;time:number}[];
};

/** Gold identification and tracking, bounded to eight slots and simulation time. */
export class TreasureTrackerView {
  readonly group = new THREE.Group();
  private resources: (THREE.Texture | THREE.Material | THREE.BufferGeometry)[] = [];
  private slots: Slot[] = [];
  private stars = new FlameAtlasBatch('/assets/particles/kenney-feedback.png',TREASURE_RUNNER.rewardCapacity*8,4,2);
  private orientation = new THREE.Quaternion();
  private up = new THREE.Vector3(0,1,0);
  private right = new THREE.Vector3(1,0,0);
  private projected = new THREE.Vector3();
  private inward = new THREE.Vector3();
  private camera?: THREE.Camera;
  private worldPerPixel = 20/720;
  private screenAspect = 1;
  private disposed = false;

  constructor(private combat: Combat,private enemyHeight: (kind: EnemyKind)=>number) {
    this.group.name = 'TreasureTracking'; this.group.add(this.stars.mesh);
    const own = <T extends THREE.Texture | THREE.Material | THREE.BufferGeometry>(resource:T) => {this.resources.push(resource);return resource;};
    const texture = (canvas: HTMLCanvasElement) => {
      const result=own(new THREE.CanvasTexture(canvas)); result.colorSpace=THREE.SRGBColorSpace;result.generateMipmaps=false;return result;
    };
    const badge=document.createElement('canvas');badge.width=192;badge.height=64;
    const ctx=badge.getContext('2d')!;
    ctx.fillStyle='#392717';ctx.strokeStyle='#ffe39a';ctx.lineWidth=4;
    ctx.beginPath();ctx.roundRect(3,5,186,54,12);ctx.fill();ctx.stroke();
    ctx.font='bold 32px "Microsoft YaHei", sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillStyle='#ffe49b';ctx.fillText('携宝兽',96,32);
    const badgeTexture=texture(badge);
    const coin=document.createElement('canvas');coin.width=coin.height=64;
    const coinCtx=coin.getContext('2d')!;
    coinCtx.fillStyle='#8b521d';coinCtx.beginPath();coinCtx.arc(32,33,28,0,Math.PI*2);coinCtx.fill();
    coinCtx.fillStyle='#ffd05c';coinCtx.beginPath();coinCtx.arc(32,30,25,0,Math.PI*2);coinCtx.fill();
    coinCtx.lineWidth=4;coinCtx.strokeStyle='#fff1ae';coinCtx.stroke();coinCtx.fillStyle='#a76722';coinCtx.fillRect(28,14,8,32);
    const coinTexture=texture(coin);
    const arrow=document.createElement('canvas');arrow.width=arrow.height=64;
    const arrowCtx=arrow.getContext('2d')!;
    arrowCtx.fillStyle='#ffdc70';arrowCtx.strokeStyle='#57391d';arrowCtx.lineWidth=6;arrowCtx.lineJoin='round';
    arrowCtx.beginPath();arrowCtx.moveTo(57,32);arrowCtx.lineTo(31,8);arrowCtx.lineTo(31,22);arrowCtx.lineTo(8,22);
    arrowCtx.lineTo(8,42);arrowCtx.lineTo(31,42);arrowCtx.lineTo(31,56);arrowCtx.closePath();arrowCtx.fill();arrowCtx.stroke();
    const arrowTexture=texture(arrow);
    const sprite=(map:THREE.Texture)=>{
      const material=own(new THREE.SpriteMaterial({map,depthTest:false,depthWrite:false,toneMapped:false,fog:false}));
      const result=new THREE.Sprite(material);result.renderOrder=28;return result;
    };
    const tickGeometry=own(new THREE.RingGeometry(.84,1,5,1,0,Math.PI*2/8*.72));
    const tickMaterial=own(new THREE.MeshBasicMaterial({color:'#ffda72',transparent:true,opacity:.9,depthWrite:false,side:THREE.DoubleSide,toneMapped:false}));
    for(let i=0;i<TREASURE_RUNNER.rewardCapacity;i++) {
      const group=new THREE.Group(),tracker=new THREE.Group();group.visible=tracker.visible=false;
      const coin=sprite(coinTexture),title=sprite(badgeTexture),arrow=sprite(arrowTexture),edgeTitle=sprite(badgeTexture);
      const ticks=Array.from({length:8},(_,j)=>{
        const tick=new THREE.Mesh(tickGeometry,tickMaterial);tick.rotation.set(-Math.PI/2,0,j*Math.PI/4);tick.position.y=.085;group.add(tick);return tick;
      });
      group.add(coin,title);tracker.add(arrow,edgeTitle);this.group.add(group,tracker);
      this.slots.push({group,tracker,coin,title,arrow,edgeTitle,ticks,id:0,age:0,sampledAt:-1,head:0,
        trail:Array.from({length:8},()=>({x:0,z:0,time:-100}))});
    }
  }
  setView(camera:THREE.Camera,viewportHeight:number,frustumHeight:number) {
    this.camera=camera;this.orientation.copy(camera.quaternion);
    this.up.set(0,1,0).applyQuaternion(this.orientation);this.right.set(1,0,0).applyQuaternion(this.orientation);
    this.worldPerPixel=frustumHeight/Math.max(1,viewportHeight);
    this.screenAspect=camera instanceof THREE.OrthographicCamera?(camera.right-camera.left)/Math.max(.001,frustumHeight):1;
  }
  render(alpha:number) {
    this.clear();if(this.disposed)return;
    let index=0;
    for(const enemy of this.combat.enemies) {
      if(!enemy.active||enemy.spawnTime>0||enemy.kind!=='draft-treasure-runner'||index>=this.slots.length)continue;
      const slot=this.slots[index++],age=enemy.specialTime??0;
      if(slot.id!==enemy.id||age<slot.age) {
        slot.id=enemy.id;slot.sampledAt=-1;slot.head=0;for(const point of slot.trail)point.time=-100;
      }
      slot.age=age;slot.group.visible=true;
      const x=THREE.MathUtils.lerp(enemy.previousX,enemy.x,alpha),z=THREE.MathUtils.lerp(enemy.previousZ,enemy.z,alpha);
      slot.group.position.set(x,0,z);
      const height=this.enemyHeight(enemy.kind),badgeHeight=Math.max(.8,28*this.worldPerPixel);
      const coinSize=Math.max(.8,24*this.worldPerPixel),pulse=.5+.5*Math.sin(age*(age>6?13:6));
      slot.title.scale.set(badgeHeight*3,badgeHeight,1);
      slot.title.position.copy(this.up).multiplyScalar(height+badgeHeight*.65+.12);
      slot.coin.position.copy(slot.title.position).addScaledVector(this.right,-badgeHeight*1.5-coinSize*.56);
      slot.coin.position.addScaledVector(this.up,pulse*.07);
      slot.coin.scale.set(coinSize*(.8+pulse*.2),coinSize*(1+pulse*.08),1);
      for(let j=0;j<8;j++) {
        slot.ticks[j].visible=j<Math.ceil(8*(1-age/TREASURE_RUNNER.lifetime));
        slot.ticks[j].scale.setScalar(1.1+pulse*.04);
      }
      // Sample actual movement only once per simulation interval. Rendering a
      // paused frame cannot create a trail or leave a new sparkle behind.
      if(age-slot.sampledAt>=.12&&Math.hypot(enemy.walkX??0,enemy.walkZ??0)>.001) {
        const previous=slot.trail[(slot.head+7)%8];
        if(previous.time<0||Math.hypot(enemy.x-previous.x,enemy.z-previous.z)>.16) {
          Object.assign(slot.trail[slot.head],{x:enemy.x,z:enemy.z,time:age});slot.head=(slot.head+1)%8;slot.sampledAt=age;
        }
      }
      for(const point of slot.trail) {
        const life=age-point.time;if(life<0||life>.7)continue;
        const fade=1-life/.7,size=Math.max(.17,4*this.worldPerPixel)*fade;
        this.stars.put(1,point.x,.2,point.z,size,size,fade*.8,'#ffda70',this.orientation,life*2);
      }
      if(this.camera) {
        this.projected.set(x,0,z).addScaledVector(this.up,height*.5).project(this.camera);
        if(Math.abs(this.projected.x)>.86||Math.abs(this.projected.y)>.63) {
          const dx=this.projected.x,dy=this.projected.y;
          const t=1/Math.max(Math.abs(dx)/.78,Math.abs(dy)/.52);
          const edgeX=dx*t;
          // The left HUD and bottom-left joystick share this edge on phones.
          // Shift the marker into the gap, keeping its arrow's true bearing.
          const edgeY=edgeX<-.35?THREE.MathUtils.clamp(dy*t,-.03,.12):dy*t;
          slot.tracker.visible=true;slot.tracker.position.set(edgeX,edgeY,0).unproject(this.camera);
          const arrowSize=Math.max(.75,26*this.worldPerPixel);
          const sx=dx*this.screenAspect;
          slot.arrow.scale.set(arrowSize,arrowSize,1);slot.arrow.material.rotation=Math.atan2(dy,sx);
          const length=Math.max(.001,Math.hypot(sx,dy));
          this.inward.copy(this.right).multiplyScalar(-sx/length).addScaledVector(this.up,-dy/length);
          slot.edgeTitle.position.copy(this.inward).multiplyScalar(badgeHeight*2.25);
          slot.edgeTitle.scale.copy(slot.title.scale);
        }
      }
    }
    this.stars.finish();
  }
  clear() {for(const slot of this.slots){slot.group.visible=false;slot.tracker.visible=false;}this.stars.begin();}
  inspect() {
    return {runners:this.slots.filter(s=>s.group.visible).length,offscreen:this.slots.filter(s=>s.tracker.visible).length,
      trail:this.stars.inspect(),markers:this.slots.filter(s=>s.group.visible).map(s=>({id:s.id,badgeHeight:s.title.scale.y,
        alwaysVisible:!s.title.material.depthTest,edge:s.tracker.visible?this.projected.copy(s.tracker.position).project(this.camera!).toArray():null}))};
  }
  dispose() {
    if(this.disposed)return;this.clear();this.disposed=true;this.stars.dispose();this.group.clear();
    for(const resource of this.resources)resource.dispose();this.resources=[];
  }
}
