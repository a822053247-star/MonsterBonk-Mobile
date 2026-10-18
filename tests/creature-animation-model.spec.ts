import { test, expect } from '@playwright/test';
import * as THREE from 'three';
import { CreatureAnimator, FACING_ORDER, WALK_CLIPS, FRONT_IDLE, screenFacing, clipFrame } from '../src/creature-animation';
import { screenToGround } from '../src/camera-25d';

const basis = { rightX: 1, rightZ: 0, upX: 0, upZ: -Math.SQRT1_2 };

test('all eight directions follow projected screen velocity, including rotated cameras and left mirrors', () => {
  const camera = new THREE.OrthographicCamera(-10,10,5,-5,.1,100);
  for (const azimuth of [0, .7, 1.8]) {
    camera.position.set(Math.sin(azimuth)*20,20,Math.cos(azimuth)*20); camera.lookAt(0,0,0);camera.updateMatrixWorld();
    const m=camera.matrixWorld.elements,b={rightX:m[0],rightZ:m[2],upX:m[4],upZ:m[6]};
    for(let i=0;i<8;i++) {
      const angle=i*Math.PI/4,x=Math.cos(angle),y=Math.sin(angle),det=b.rightX*b.upZ-b.rightZ*b.upX;
      const vx=(x*b.upZ+y*b.rightZ)/det,vz=(-y*b.rightX-x*b.upX)/det;
      const projected=new THREE.Vector3(vx,0,vz).project(camera),center=new THREE.Vector3().project(camera);
      const actual=Math.atan2(-(projected.y-center.y)*5,(projected.x-center.x)*10),expected=Math.atan2(y,x);
      expect(Math.atan2(Math.sin(actual-expected),Math.cos(actual-expected))).toBeCloseTo(0,6);
      expect(screenFacing(vx,vz,b)).toBe(FACING_ORDER[i]);
    }
  }
  for(const direction of ['left','down-left','up-left'] as const) expect(WALK_CLIPS[direction].mirror).toBe(true);
  for(const direction of ['right','down-right','up-right','down','up'] as const) expect(WALK_CLIPS[direction].mirror).toBe(false);
});

test('continuous analog motion is not quantized and sector boundaries use hysteresis', () => {
  for(const degrees of [17,24,28,31,46]) {
    const a=degrees*Math.PI/180,v=screenToGround(Math.cos(a)*.6,Math.sin(a)*.6,new THREE.Vector2());
    expect(v.length()).toBeCloseTo(.6,9);
    expect(Math.atan2(-v.y*basis.upZ,v.x)).toBeCloseTo(a,9);
    expect(screenFacing(v.x,v.y,basis,'right')).toBe(degrees<=29.5?'right':'down-right');
  }
  expect(screenFacing(0,0,basis,'up-left')).toBe('up-left');
});

test('walk and idle clips loop at their configured FPS and never select the clipped source frame', () => {
  const walk=WALK_CLIPS.down;
  expect([0,.125,.25,.375,.5].map(t=>clipFrame(walk,t))).toEqual([0,1,2,0,1]);
  expect([0,1/3.5,2/3.5,3/3.5,4/3.5].map(t=>clipFrame(FRONT_IDLE,t))).toEqual([12,13,14,15,12]);
  for(const direction of FACING_ORDER) {
    const animator=new CreatureAnimator(),a=FACING_ORDER.indexOf(direction)*Math.PI/4;
    animator.step(.125,Math.cos(a)*4.6,Math.sin(a)*4.6/Math.SQRT1_2,basis);
    expect(animator.facing).toBe(direction); expect(animator.moving).toBe(true);
    animator.step(.1,0,0,basis); expect(animator.facing).toBe(direction); expect(animator.moving).toBe(false);
    const first=clipFrame(animator.clip,animator.time);animator.step(1,0,0,basis);
    if(direction==='down') expect(animator.clip.name).toBe('idle-down');
    else {expect(animator.clip.name).toBe('idle-'+direction);expect(clipFrame(animator.clip,animator.time)).toBe(first);}
  }
});

test('animation clocks only change on explicit simulation steps; stop and restart retain/reset direction appropriately', () => {
  const animator=new CreatureAnimator();animator.step(.2,0,-4.6,basis);const state=animator.inspect();
  for(let i=0;i<20;i++) expect(animator.inspect()).toEqual(state);
  animator.step(0,4.6,0,basis);expect(animator.inspect()).toEqual(state);
  animator.stop();expect(animator.inspect()).toMatchObject({facing:'up',moving:false,time:0,frame:4});
  animator.reset();expect(animator.inspect()).toMatchObject({facing:'down',moving:false,time:0,frame:12});
});
