import { GIGAPACK_PRESETS } from './gigapack-presets';
/** Presets describe visuals; renderers own bounded shared atlas resources. */
export interface AtlasAnimation {
  atlas: 'fire' | 'elemental'; row: number; childRow?: number; frames: readonly number[]; fps: number;
}
interface Base { id: string; color: string }
export interface ProjectileVfx extends Base {
  type: 'projectile'; scale: number; animation?: AtlasAnimation;
  trail: { color: string; length: number; opacity: number };
  low: { animated: boolean; trail: boolean };
}
export interface ImpactVfx extends Base {
  type: 'impact'; secondaryColor: string; radiusScale: number;
  height?: number; radiusMode?: 'event';
  /** Maximum visual seconds, clamped to the real event's remaining lifecycle. */
  duration: number; particles: boolean; ring: boolean; animation?: AtlasAnimation;
  low: { particles: boolean; animated: boolean };
}
export interface AreaVfx extends Base {
  type: 'area'; secondaryColor: string; outline: 'ring' | 'none'; radiusScale: number;
  duration: 'event'; fade: number; rotationSpeed: number; pulseSpeed: number;
  height?: number; rise?: number;
  low: { mist: boolean };
}
export type VfxPreset = ProjectileVfx | ImpactVfx | AreaVfx;

export const VFX_PRESETS: readonly VfxPreset[] = [
  { id: 'fire-projectile', type: 'projectile', color: '#ff9849', scale: 1.3,
    animation: { atlas: 'fire', row: 0, childRow: 1, frames: [0,1,2,3], fps: 12 },
    trail: { color: '#ff9849', length: .65, opacity: .55 }, low: { animated: true, trail: true } },
  { id: 'water-projectile', type: 'projectile', color: '#55c9ed', scale: 1.1,
    trail: { color: '#55c9ed', length: .65, opacity: .55 }, low: { animated: false, trail: true } },
  { id: 'fire-impact', type: 'impact', color: '#ffe7ae', secondaryColor: '#ffbb60', radiusScale: 1.2, height: 1.45,
    duration: .16, particles: true, ring: false, low: { particles: true, animated: false } },
  { id: 'water-impact', type: 'impact', color: '#91e5f2', secondaryColor: '#65dcff', radiusScale: 1.35, height: 1.55,
    duration: .2, particles: true, ring: false,
    animation: { atlas: 'elemental', row: 0, frames: [3,4,5,6,7], fps: 25 }, low: { particles: true, animated: true } },
  { id: 'fire-explosion', type: 'impact', color: '#ffac48', secondaryColor: '#ffe09a', radiusScale: 1,
    duration: .32, particles: true, ring: false,
    animation: { atlas: 'fire', row: 2, frames: [0,1,2,3], fps: 12.5 }, low: { particles: true, animated: true } },
  { id: 'steam-area', type: 'area', color: '#80caff', secondaryColor: '#55aaff', outline: 'none', height: 1.1, rise: 1.2,
    radiusScale: 1, duration: 'event', fade: .8, rotationSpeed: 0, pulseSpeed: 0, low: { mist: true } },
  { id: 'tidal-ring', type: 'impact', color: '#70d9ff', secondaryColor: '#329de5', radiusScale: 1, radiusMode: 'event', height: 1.55,
    duration: .32, particles: true, ring: true,
    animation: { atlas: 'elemental', row: 0, frames: [3,4,5,6,7], fps: 20 }, low: { particles: false, animated: true } },
  { id:'mine-warning',type:'impact',color:'#ffb45f',secondaryColor:'#ffcb68',radiusScale:1,radiusMode:'event',
    duration:.7,particles:false,ring:true,low:{particles:false,animated:false} },
  { id:'ember-area',type:'area',color:'#ff9d4b',secondaryColor:'#e65d36',outline:'ring',radiusScale:1,
    duration:'event',fade:.45,rotationSpeed:.4,pulseSpeed:4,height:.35,rise:.3,low:{mist:false} },
  { id:'prism-projectile',type:'projectile',color:'#b6e9ff',scale:.9,
    trail:{color:'#c4f2ff',length:.6,opacity:.5},low:{animated:false,trail:true} },
  { id:'spore-area',type:'area',color:'#a7e77a',secondaryColor:'#72aa52',outline:'ring',radiusScale:1,
    duration:'event',fade:.4,rotationSpeed:.3,pulseSpeed:3,height:.4,rise:.35,low:{mist:false} },
  { id:'phantom-projectile',type:'projectile',color:'#b78bed',scale:.8,
    trail:{color:'#d9bcff',length:.7,opacity:.4},low:{animated:false,trail:true} },
  ...GIGAPACK_PRESETS,
];
