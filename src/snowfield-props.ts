/** Transparent atlas; explicit tight crops preserve sprite proportions and foot anchors. */
export const SNOWFIELD_ATLAS_SIZE = { width: 1536, height: 1024 };
const RECTS = [
  [75,18,321,269], [435,51,721,270], [808,61,1099,266], [1182,57,1498,268],
  [71,294,312,508], [448,284,682,524], [809,320,1099,520], [1201,314,1484,508],
  [65,526,321,760], [411,550,734,750], [836,532,1099,762], [1224,518,1471,760],
  [101,766,293,1013], [450,775,715,990], [826,791,1087,1001], [1190,784,1480,1005],
] as const;
export const SNOWFIELD_PROPS = [
  {name:'冰晶簇',height:3.4,radius:1.05},
  {name:'覆雪巨岩',height:2.8,radius:1.15},
  {name:'圆雪岩',height:2.5,radius:1.1},
  {name:'冰裂石台',height:1.7,radius:1.15},
  {name:'高冰晶',height:3.2,radius:.95},
  {name:'冰柱',height:3.2,radius:.85},
  {name:'覆雪石群',height:2.2,radius:1.1},
  {name:'方岩群',height:2,radius:1.05},
  {name:'冰纹立石',height:3.3,radius:.9},
  {name:'封冻冰池',height:1.5,radius:1.3},
  {name:'晶岩群',height:3,radius:1.1},
  {name:'双残柱',height:3.1,radius:1.1},
  {name:'冰焰石座',height:3.1,radius:.85},
  {name:'覆霜方石',height:2.4,radius:1.1},
  {name:'蓝冰花',height:2.1,radius:.95},
  {name:'雪丘岩',height:2.4,radius:1.15},
].map((p,i)=>({...p,rect:RECTS[i]}));

/** Keep a connected eight-unit cross through each 32-unit macrocell. */
export function snowfieldPassage(x:number,z:number,padding=0) {
  const distance=(v:number)=>Math.abs(v-Math.round(v/32)*32);
  return Math.min(distance(x),distance(z))<4+padding;
}
