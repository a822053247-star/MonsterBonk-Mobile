import * as THREE from 'three';
import { ITEM_TEST_ALTAR, type ItemTestSkill } from './item-test-mode';
import { COLORED_BARRAGES } from './colored-barrage';
import { ALTAR_LAYOUT, altarReliefHeight } from './altar-layout';

const ALTAR_FADE_SECONDS=1.2;

/** Painted woodland shrine, reused by the training scene with a selectively tinted crystal. */
export class ItemTestAltarView {
  readonly group=new THREE.Group();
  private fallback=new THREE.Group();
  private geometry=new THREE.PlaneGeometry(ALTAR_LAYOUT.width,ALTAR_LAYOUT.height,24,32);
  private material=new THREE.MeshBasicMaterial({transparent:true,alphaTest:.08,depthWrite:false,toneMapped:false});
  private art=new THREE.Mesh(this.geometry,this.material);
  private crystalMaterial=new THREE.MeshBasicMaterial({transparent:true,alphaTest:.08,depthWrite:false,toneMapped:false});
  private crystal=new THREE.Mesh(this.geometry,this.crystalMaterial);
  private plinthMaterial=new THREE.MeshBasicMaterial({color:'#82715a',transparent:true,alphaTest:.08,depthWrite:false,toneMapped:false});
  private plinth=new THREE.Mesh(this.geometry,this.plinthMaterial);
  private shadowGeometry=new THREE.PlaneGeometry(1,1);
  private shadowMaterial=new THREE.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{strength:{value:.3}},
    vertexShader:'varying vec2 shadowUv;void main(){shadowUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader:'varying vec2 shadowUv;uniform float strength;void main(){float r=length((shadowUv-.5)*2.0);float a=(1.0-smoothstep(.2,1.0,r))*strength;gl_FragColor=vec4(.035,.055,.035,a);}' });
  private contactMaterial=this.shadowMaterial.clone();
  private shadow=new THREE.Mesh(this.shadowGeometry,this.shadowMaterial);
  private contact=new THREE.Mesh(this.shadowGeometry,this.contactMaterial);
  private animationTime=0;
  private fadeRemaining=0;
  private fading=false;
  private reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
  private texture?:THREE.Texture;
  private disposed=false;
  private tint={value:new THREE.Color('#ffcd87')};
  private tintAmount={value:0};
  private fallbackGeometry=new THREE.CylinderGeometry(2.7,2.85,.1,12);
  private fallbackMaterial=new THREE.MeshBasicMaterial({color:'#657661',transparent:true});

  constructor(){
    this.group.name='ItemTestWoodlandAltar';this.group.visible=false;
    this.group.renderOrder=-10;this.fallback.renderOrder=-10;
    this.group.position.set(ITEM_TEST_ALTAR.x,0,ITEM_TEST_ALTAR.z);
    const base=new THREE.Mesh(this.fallbackGeometry,this.fallbackMaterial);
    base.position.y=-.02;this.fallback.add(base);this.group.add(this.fallback);
    // Lift the rear architecture, preserving most of the painted perspective.
    // Shared geometry avoids loading or enlarging the optimized PNG.
    const positions=this.geometry.getAttribute('position') as THREE.BufferAttribute;
    const uvs=this.geometry.getAttribute('uv') as THREE.BufferAttribute;
    for(let i=0;i<positions.count;i++){
      const v=uvs.getY(i),h=altarReliefHeight(v);
      positions.setXYZ(i,positions.getX(i),positions.getY(i)-h*ALTAR_LAYOUT.depthCompensation,h);
    }
    positions.needsUpdate=true;this.geometry.computeVertexNormals();this.geometry.computeBoundingSphere();
    this.shadow.rotation.x=this.contact.rotation.x=-Math.PI/2;
    this.shadow.position.set(.35,.015,1.5);this.shadow.scale.set(9.3,8.3,1);
    this.contact.position.set(0,.022,2.15);this.contact.scale.set(7.5,5.4,1);
    this.contactMaterial.uniforms.strength.value=.36;this.group.add(this.shadow,this.contact);
    this.plinth.rotation.x=-Math.PI/2;this.plinth.position.set(0,.02,.09);this.plinth.renderOrder=1;this.plinth.visible=false;
    this.plinthMaterial.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','#include <map_fragment>\n#ifdef USE_MAP\nif(vMapUv.y>.32)discard;\n#endif');};
    this.plinthMaterial.customProgramCacheKey=()=> 'altar-front-step-thickness-v1';
    this.crystal.rotation.x=-Math.PI/2;this.crystal.position.y=.36;this.crystal.renderOrder=3;this.crystal.visible=false;
    this.group.add(this.plinth,this.crystal);
    this.art.name='PaintedWoodlandShrine';this.art.rotation.x=-Math.PI/2;
    this.art.position.y=ALTAR_LAYOUT.artHeight;this.art.renderOrder=2;this.art.visible=false;this.group.add(this.art);
    const configureMaterial=(material:THREE.MeshBasicMaterial,crystalOnly:boolean)=>{material.onBeforeCompile=shader=>{
      shader.uniforms.altarCrystalTint=this.tint;shader.uniforms.altarTintAmount=this.tintAmount;
      shader.fragmentShader='uniform vec3 altarCrystalTint; uniform float altarTintAmount;\n'+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
        #ifdef USE_MAP
          // Isolate the diamond so it can float above the bowl without moving the stonework.
          float diamond=abs((vMapUv.x-.501)/.063)+abs((vMapUv.y-.803)/.108);
          float gem=1.0-smoothstep(.96,1.025,diamond);
          ${crystalOnly?'diffuseColor.a *= gem;':'diffuseColor.a *= 1.0-gem;'}
          // The upper central crystal is tinted; carved gold and moss stay intact.
          float crystalRegion = smoothstep(0.40,0.435,vMapUv.x)*(1.0-smoothstep(0.56,0.60,vMapUv.x))
            *smoothstep(0.68,0.715,vMapUv.y)*(1.0-smoothstep(0.915,0.95,vMapUv.y));
          float goldMask = smoothstep(0.08,0.28,diffuseColor.r-diffuseColor.b);
          float crystalLight = dot(diffuseColor.rgb,vec3(0.2126,0.7152,0.0722));
          vec3 crystalColor = mix(altarCrystalTint*(0.18+0.95*crystalLight),vec3(1.0),pow(crystalLight,6.0)*0.34);
          diffuseColor.rgb = mix(diffuseColor.rgb,crystalColor,crystalRegion*goldMask*altarTintAmount);
        #endif`);
    };material.customProgramCacheKey=()=>`woodland-altar-depth-v3-${crystalOnly}`;};
    configureMaterial(this.material,false);configureMaterial(this.crystalMaterial,true);
    new THREE.TextureLoader().load(`${import.meta.env.BASE_URL}assets/scenery/item-test-altar-v2.png`,texture=>{
      if(this.disposed){texture.dispose();return;}
      this.texture=texture;texture.colorSpace=THREE.SRGBColorSpace;
      texture.magFilter=THREE.LinearFilter;texture.minFilter=THREE.LinearMipmapLinearFilter;
      texture.generateMipmaps=true;
      for(const material of [this.material,this.crystalMaterial,this.plinthMaterial]){material.map=texture;material.needsUpdate=true;}
      this.art.visible=this.crystal.visible=this.plinth.visible=true;this.fallback.visible=false;
    },undefined,()=>{if(!this.disposed)this.fallback.visible=true;});
  }
  setPosition(x:number,z:number){this.group.position.set(x,0,z);}
  setEnabled(enabled:boolean,skill:ItemTestSkill='screen-barrage'){
    if(enabled&&!this.group.visible){this.animationTime=0;this.crystal.position.y=.36;}
    this.fading=false;this.fadeRemaining=0;
    if(enabled)this.setOpacity(1);
    this.group.visible=enabled;
    this.tint.value.set(skill==='screen-barrage'?'#ffcd87':COLORED_BARRAGES[skill].color);
    this.tintAmount.value=skill==='screen-barrage'?0:1;
  }
  private setOpacity(opacity:number){
    for(const material of [this.material,this.crystalMaterial,this.plinthMaterial,this.fallbackMaterial])material.opacity=opacity;
    this.shadowMaterial.uniforms.strength.value=.3*opacity;
    this.contactMaterial.uniforms.strength.value=.36*opacity;
  }
  fadeOut(){
    if(!this.group.visible||this.fading)return;
    this.fading=true;this.fadeRemaining=ALTAR_FADE_SECONDS;
  }
  step(dt:number){
    if(!this.group.visible)return;
    if(this.fading){
      this.fadeRemaining=Math.max(0,this.fadeRemaining-dt);
      const t=this.fadeRemaining/ALTAR_FADE_SECONDS;
      this.setOpacity(t*t*(3-2*t));
      if(this.fadeRemaining===0){this.group.visible=false;this.fading=false;return;}
    }
    this.animationTime+=dt;
    this.crystal.position.y=.36+(this.reducedMotion.matches?0:Math.sin(this.animationTime*1.4)*.08);
  }
  setColor(color:string){this.tint.value.set(color);this.tintAmount.value=color==='#ffcd87'?0:1;}
  dispose(){
    this.disposed=true;this.texture?.dispose();this.geometry.dispose();this.material.dispose();
    this.crystalMaterial.dispose();this.plinthMaterial.dispose();this.shadowGeometry.dispose();this.shadowMaterial.dispose();this.contactMaterial.dispose();
    this.fallbackGeometry.dispose();this.fallbackMaterial.dispose();this.group.clear();this.group.removeFromParent();
  }
}
