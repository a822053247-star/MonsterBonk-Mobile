import * as THREE from 'three';
import type { Combat, EnemyKind } from './combat';
import { ENEMY_PIXEL_HEIGHTS } from './enemy-pixel-view';
import { SPORE_BOMBER, TREASURE_RUNNER } from './special-enemies';
import { SporeExplosionView } from './spore-explosion-view';
import { TreasureTrackerView } from './treasure-tracker-view';

/** Fixed visual pools; all animation reads simulation clocks, including while paused. */
export class SpecialEnemyView {
  readonly group = new THREE.Group();
  private resources: (THREE.BufferGeometry | THREE.Material | THREE.Texture)[] = [];
  private up = new THREE.Vector3(0,1,0);
  private pose = new THREE.Object3D();
  private explosions: THREE.Sprite[] = [];
  private sporeView = new SporeExplosionView();
  private treasureTracker: TreasureTrackerView;
  private rewards: THREE.Sprite[] = [];
  private coins: THREE.InstancedMesh;


  constructor(private combat: Combat, private enemyHeight: (kind: EnemyKind) => number = kind => ENEMY_PIXEL_HEIGHTS[kind]) {
    this.group.name = 'SpecialEnemyEffects';
    this.treasureTracker = new TreasureTrackerView(combat,enemyHeight);
    this.group.add(this.sporeView.group,this.treasureTracker.group);
    const own = <T extends THREE.BufferGeometry | THREE.Material | THREE.Texture>(resource: T) => { this.resources.push(resource); return resource; };
    const basic = (color: string, opacity = 1) => own(new THREE.MeshBasicMaterial({color,transparent: opacity < 1,opacity,depthWrite:false,side:THREE.DoubleSide,toneMapped:false}));
    const label = (text: string, color: string, width: number) => {
      const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = 64;
      const ctx = canvas.getContext('2d')!;
      ctx.font = 'bold 34px "Microsoft YaHei", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round'; ctx.lineWidth = 7; ctx.strokeStyle = '#533e31'; ctx.strokeText(text,width/2,32);
      ctx.fillStyle = color; ctx.fillText(text,width/2,32);
      const texture = own(new THREE.CanvasTexture(canvas)); texture.colorSpace = THREE.SRGBColorSpace;
      return own(new THREE.SpriteMaterial({map:texture,transparent:true,depthWrite:false,toneMapped:false}));
    };
    const warning = label('!', '#fff3bf', 64);
    // The lethal countdown marker must remain readable inside a dense crowd.
    warning.depthTest = false;
    const reward = label(`+${TREASURE_RUNNER.coins} 金币`, '#ffe494', 256);
    for (let i=0;i<SPORE_BOMBER.capacity;i++) {
      const icon = new THREE.Sprite(warning); icon.visible=false; icon.scale.set(.8,.8,1); icon.renderOrder=20;
      this.group.add(icon); this.explosions.push(icon);
    }
    for (let i=0;i<TREASURE_RUNNER.rewardCapacity;i++) {
      const popup = new THREE.Sprite(reward); popup.visible = false; popup.scale.set(3.6,.9,1); this.group.add(popup); this.rewards.push(popup);

    }
    this.coins = new THREE.InstancedMesh(own(new THREE.CylinderGeometry(1,1,.25,10)),basic('#ffd365'),TREASURE_RUNNER.rewardCapacity*8);
    for (const mesh of [this.coins]) { mesh.count = 0; mesh.frustumCulled = false; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.group.add(mesh); }
  }

  setView(camera: THREE.Camera, viewportHeight = 720, frustumHeight = 20) { this.treasureTracker.setView(camera,viewportHeight,frustumHeight); this.sporeView.setView(camera); this.up.set(0,1,0).applyQuaternion(camera.quaternion); }
  private particle(mesh: THREE.InstancedMesh, x: number, y: number, z: number, size: number, rotation = 0) {
    if (mesh.count >= mesh.instanceMatrix.count) return;
    this.pose.position.set(x,y,z); this.pose.scale.setScalar(size); this.pose.rotation.set(rotation,rotation,0); this.pose.updateMatrix(); mesh.setMatrixAt(mesh.count++,this.pose.matrix);
  }
  render(alpha: number) {
    this.clear();
    if (this.combat.encounters.dying) return;
    this.sporeView.render(this.combat.sporeExplosions);
    for (let i=0;i<this.combat.sporeExplosions.length;i++) {
      const event=this.combat.sporeExplosions[i], icon=this.explosions[i];
      if(!event.active||event.detonated)continue;
      const progress=Math.min(1,event.age/SPORE_BOMBER.warning);
      icon.visible=true; icon.position.set(event.x,0,event.z).addScaledVector(this.up,this.enemyHeight('draft-spore-bomber')+.2);
      icon.scale.setScalar(.8+Math.sin(progress*Math.PI*8)*.08);
    }
    this.treasureTracker.render(alpha);
    for (let i=0;i<this.combat.treasureRewards.length;i++) {
      const event = this.combat.treasureRewards[i]; if (!event.active) continue;
      if(this.combat.areaDeaths.some(d=>d.active&&d.enemyKind==='draft-treasure-runner'&&Math.hypot(d.x-event.x,d.z-event.z)<.1))continue;
      const progress = event.age/TREASURE_RUNNER.rewardDuration, popup = this.rewards[i];
      popup.visible = true; popup.position.set(event.x,0,event.z).addScaledVector(this.up,this.enemyHeight('draft-treasure-runner')+.1+progress);
      for (let j=0;j<8;j++) {
        const angle = j*Math.PI/4, distance = .2+progress*.8;
        this.particle(this.coins,event.x+Math.cos(angle)*distance,.4+Math.sin(progress*Math.PI)*1.3,event.z+Math.sin(angle)*distance,.12*(1-progress),progress*5+j);
      }
    }
    this.coins.instanceMatrix.needsUpdate = true;
  }
  clear() {
    this.sporeView.clear();
    for (const icon of this.explosions) icon.visible = false;
    this.treasureTracker.clear();
    for (const reward of this.rewards) reward.visible = false;
    this.coins.count = 0;
  }
  inspect() { return { warnings:this.explosions.filter(v=>v.visible).length, bursts:this.sporeView.inspect().bursts, runners:this.treasureTracker.inspect().runners, rewards:this.rewards.filter(v=>v.visible).length }; }
  inspectTreasure() { return this.treasureTracker.inspect(); }
  inspectSpore() { return this.sporeView.inspect(); }
  dispose() { this.clear(); this.sporeView.dispose(); this.treasureTracker.dispose(); this.group.clear(); for (const resource of this.resources) resource.dispose(); this.resources = []; }
}
