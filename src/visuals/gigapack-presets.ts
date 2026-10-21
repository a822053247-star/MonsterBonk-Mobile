import type { ImpactVfx } from './vfx-presets';
import type { GigapackClipId } from './gigapack-clips';

export const GIGAPACK_BINDINGS:Record<string,GigapackClipId>={
  'storm-relay':'lightning_strike_001_small_violet',
  'void-vessel':'spell_absorb_001_small_violet',
  'warp-eye':'scifi_warp_003_small_blue',
  'reaper-decree':'stylized_skull_smoke_burst_001_small_white',
  'rhythm-seal':'directional_music_burst_002_small_yellow',
  'alchemist-ledger':'directional_coin_burst_001_small_yellow',
  'venom-insignia':'spell_poison_001_small_green',
  'venom-mark':'status_poison_001_small_green',
  'heart-keeper':'round_heart_burst_001_small_red',
  'smokescreen-feather':'looping_smoke_burst_001_small_gray',
  'levelup-salute':'round_firework_burst_001_small_green',
};
export const GIGAPACK_PRESETS:readonly ImpactVfx[]=Object.keys(GIGAPACK_BINDINGS).map(id=>({
  id,type:'impact',color:'#ffffff',secondaryColor:'#ffffff',radiusScale:1,radiusMode:'event',
  duration:2,particles:false,ring:false,low:{particles:false,animated:true},
}));
