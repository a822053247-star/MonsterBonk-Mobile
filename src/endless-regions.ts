export const ENDLESS_REGION_IDS = ['meadow', 'ruins', 'snowfield', 'volcano'] as const;
export type EndlessRegionId = typeof ENDLESS_REGION_IDS[number];
export type RegionRewardBias = 'growth' | 'weapon';

/** Shared by terrain generation, the route picker and exploration rewards. */
export const ENDLESS_REGIONS = {
  volcano: {
    title: '熔岩火山', subtitle: '熔纹石庭 · 火晶残柱',
    description: '穿过暗红石庭与熔焰裂缝，在火晶残柱和符文石之间迎战。',
    rewardCopy: '封印宝箱优先武器获得或强化；数量不变', rewardBias: 'weapon' as RegionRewardBias,
    events: ['sealed-chest', 'lost-workshop'] as const,
    palette: {base:'#533b3d',stone:'#684a48',path:'#c34419',accent:'#ffb35c'},
  },
  snowfield: {
    title: '永恒雪原', subtitle: '开阔冰原 · 覆雪晶岩',
    description: '沿雪岸绕过覆雪岩与冰晶，在开阔冰原回转拾取。',
    rewardCopy: '封印宝箱优先通用强化；数量不变', rewardBias: 'growth' as RegionRewardBias,
    events: ['sealed-chest', 'lost-workshop'] as const,
    palette: {base:'#c5d9e0',stone:'#8eb6c9',path:'#afcbd7',accent:'#8ee5ff'},
  },
  meadow: {
    title: '繁花草甸', subtitle: '开阔草地 · 零散树丛',
    description: '在宽阔草地和沙土之间绕行，适合追击与拾取。',
    rewardCopy: '封印宝箱优先通用强化；数量不变', rewardBias: 'growth' as RegionRewardBias,
    events: ['sealed-chest', 'lost-workshop'] as const,
    palette: {base:'#359b46',stone:'#768c89',path:'#92aaa6',accent:'#e8d697'},
  },
  ruins: {
    title: '晶石遗迹', subtitle: '晶纹石庭 · 符文残柱',
    description: '穿过青灰石庭与晶纹镶嵌，在对称残柱和晶簇之间探索。',
    rewardCopy: '封印宝箱优先武器获得或强化；数量不变', rewardBias: 'weapon' as RegionRewardBias,
    events: ['sealed-chest', 'lost-workshop'] as const,
    palette: {base:'#4c6871',stone:'#587985',path:'#6c8d95',accent:'#79d7da'},
  },
} as const;

export function isEndlessRegion(id: string): id is EndlessRegionId {
  return (ENDLESS_REGION_IDS as readonly string[]).includes(id);
}

/** Open axes and the central inlay stay clear; the surrounding stone court holds pillars. */
export function ruinsRoad(x:number,z:number,padding=0) {
  return ruinsRoadDistance(x,z)<=padding;
}

/** Axis-aligned clear space, shared by paving edges and obstacle placement. */
export function ruinsRoadDistance(x:number,z:number) {
  const distance=(v:number)=>Math.abs(v-Math.round(v/32)*32);
  return Math.min(distance(x)-4.2,distance(z)-4.2,ruinsCourtDistance(x,z)-4.8);
}

export function ruinsCourtDistance(x:number,z:number) {
  return Math.max(Math.abs(x-Math.round(x/32)*32),Math.abs(z-Math.round(z/32)*32));
}
