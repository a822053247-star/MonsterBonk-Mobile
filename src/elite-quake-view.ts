import * as THREE from 'three';
import { ENCOUNTER_RULES } from './enemy-challenge';
import { ELITE_QUAKE_DURATION, type EliteQuakeEvent } from './elite-quake';
import { instanceOpacity } from './visuals/instance-opacity';

const RADIUS = ENCOUNTER_RULES.elitePulseRadius + .62;
const CAPACITY = 24;

/** One bounded earthquake; clocks and origin come exclusively from simulation. */
export class EliteQuakeView {
  readonly group = new THREE.Group();
  private pose = new THREE.Object3D();
  private cameraRotation = new THREE.Quaternion();
  private ground = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { progress: { value: 0 }, age: { value: 0 }, warning: { value: 1 } },
    vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `
      varying vec2 vUv; uniform float progress; uniform float age; uniform float warning;
      void main(){
        vec2 p=vUv*2.-1.; float r=length(p); if(r>1.)discard;
        float a=atan(p.y,p.x), edge=1.-smoothstep(.014,.027,abs(r-.974));
        if(warning>.5){
          float ticks=step(.58,cos(a*24.))*smoothstep(.89,.92,r);
          float inward=1.-smoothstep(.008,.022,abs(r-(.92-progress*.7)));
          float pulse=.7+.3*sin(progress*30.);
          gl_FragColor=vec4(mix(vec3(.95,.38,.13),vec3(1.,.8,.38),edge),
            .055+edge*(.65+.3*progress)+ticks*.2+inward*.19*pulse);
        }else{
          float spread=clamp(age/.19,0.,1.);
          float warp=abs(fract(r*5.5)*2.-1.)*.43;
          float seam=abs(sin(a*5.+warp+sin(a*13.)*.16));
          float crack=(1.-smoothstep(.02,.075,seam))*smoothstep(.12,.25,r);
          float groove=(1.-smoothstep(.06,.15,seam))*smoothstep(.12,.25,r);
          float reveal=1.-smoothstep(spread-.1,spread+.02,r);
          float fade=1.-smoothstep(.36,1.15,age);
          float core=(1.-smoothstep(.04,.35,r))*(1.-smoothstep(0.,.16,age));
          gl_FragColor=vec4(mix(vec3(.21,.12,.07),vec3(1.,.68,.24),crack*.85+core),
            min(.9,(.12+groove*.5+crack*.45)*reveal*fade+core*.7));
        }
      }`,
  }));
  private rings = Array.from({ length: 2 }, () => new THREE.Mesh(new THREE.RingGeometry(.965, 1, 64),
    new THREE.MeshBasicMaterial({ color: '#ffe0a2', transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false })));
  private rocks = this.batch(new THREE.IcosahedronGeometry(1, 0), '#ad875c');
  private dust = this.batch(new THREE.CircleGeometry(1, 9), '#dec198');

  constructor() {
    this.group.name = 'EliteEarthquake';
    this.ground.rotation.x = -Math.PI / 2; this.ground.position.y = .055;
    this.ground.scale.setScalar(RADIUS);
    for (const ring of this.rings) { ring.rotation.x = -Math.PI / 2; ring.position.y = .09; }
    this.group.add(this.ground, ...this.rings, this.rocks.mesh, this.dust.mesh);
    this.clear();
  }
  private batch(geometry: THREE.BufferGeometry, color: string) {
    const mesh = new THREE.InstancedMesh(geometry, new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, side: THREE.DoubleSide }), CAPACITY);
    mesh.count = 0; mesh.frustumCulled = false; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    return { mesh, alpha: instanceOpacity(mesh, CAPACITY) };
  }
  setView(camera: THREE.Camera) { this.cameraRotation.copy(camera.quaternion); }
  render(windup: { x: number; z: number; progress: number } | null, impact: EliteQuakeEvent, detail = 3, radius = RADIUS) {
    this.clear();
    if (!windup && !impact.active) return;
    const warning = !!windup, age = warning ? 0 : impact.age;
    this.group.visible = true;
    radius = Number.isFinite(radius) && radius > 0 ? radius : RADIUS;
    this.ground.scale.setScalar(radius);
    this.group.position.set(windup?.x ?? impact.x, 0, windup?.z ?? impact.z);
    this.ground.material.uniforms.warning.value = warning ? 1 : 0;
    this.ground.material.uniforms.progress.value = THREE.MathUtils.clamp(windup?.progress ?? 1, 0, 1);
    this.ground.material.uniforms.age.value = age;
    if (warning) return;
    for (let i = 0; i < this.rings.length; i++) {
      const t = (age - i * .075) / .32, ring = this.rings[i];
      ring.visible = t >= 0 && t < 1;
      ring.scale.setScalar(radius * (.15 + .85 * Math.min(1, Math.max(0, t) * 1.7)));
      ring.material.opacity = (1 - Math.max(0, t)) * (i ? .48 : .95);
    }
    const amount = detail <= 2 ? 10 : CAPACITY;
    for (let i = 0; i < amount; i++) {
      const seed = (i * .61803398875) % 1, angle = i * 2.39996323;
      const flight = Math.max(0, Math.min(1, age / (.42 + seed * .24)));
      if (flight < 1) {
        const distance = radius * (.18 + flight * (.45 + seed * .28));
        this.pose.position.set(Math.cos(angle) * distance, .1 + Math.sin(flight * Math.PI) * (.45 + seed * .8), Math.sin(angle) * distance);
        this.pose.rotation.set(age * (3 + seed), angle, age * 4);
        this.pose.scale.setScalar((.1 + seed * .15) * (1 - flight * .55));
        this.pose.updateMatrix();
        const index = this.rocks.mesh.count++;
        this.rocks.mesh.setMatrixAt(index, this.pose.matrix); this.rocks.alpha.setX(index, 1 - flight ** 3);
      }
      const t = age / ELITE_QUAKE_DURATION, drift = radius * (.36 + seed * .36 + t * .12);
      const alpha = Math.sin(Math.min(1, age / .08) * Math.PI / 2) * (1 - t) ** 2 * .28;
      this.pose.position.set(Math.cos(angle) * drift, .15 + t * (.3 + seed * .5), Math.sin(angle) * drift);
      this.pose.quaternion.copy(this.cameraRotation); this.pose.scale.setScalar((.24 + seed * .22) * (.7 + t));
      this.pose.updateMatrix();
      const index = this.dust.mesh.count++;
      this.dust.mesh.setMatrixAt(index, this.pose.matrix); this.dust.alpha.setX(index, alpha);
    }
    for (const batch of [this.rocks, this.dust]) { batch.mesh.instanceMatrix.needsUpdate = true; batch.alpha.needsUpdate = true; }
  }
  clear() { this.group.visible = false; this.rocks.mesh.count = this.dust.mesh.count = 0; for (const ring of this.rings) ring.visible = false; }
  inspect() { return { visible: this.group.visible, warning: this.ground.material.uniforms.warning.value > .5,
    radius: this.ground.scale.x, age: this.ground.material.uniforms.age.value, rocks: this.rocks.mesh.count, dust: this.dust.mesh.count, capacity: CAPACITY }; }
  dispose() {
    for (const mesh of [this.ground, ...this.rings, this.rocks.mesh, this.dust.mesh]) { mesh.geometry.dispose(); mesh.material.dispose(); }
    this.rocks.mesh.dispose(); this.dust.mesh.dispose(); this.group.clear(); this.group.removeFromParent();
  }
}
