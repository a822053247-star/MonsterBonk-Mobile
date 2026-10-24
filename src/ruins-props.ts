/** Original transparent atlas: UV crops only, shared by generation and rendering. */
export const RUINS_ATLAS_SIZE = { width: 1245, height: 659 };
export const RUINS_PROPS = [
  { name: '晶簇', rect: [19,31,226,314], height: 2.8, radius: .72 },
  { name: '断墙碎石', rect: [283,58,578,302], height: 2.1, radius: .9 },
  { name: '冰晶岩', rect: [621,86,866,296], height: 2, radius: .8 },
  { name: '裂纹石板', rect: [939,108,1226,308], height: 1.05, radius: .8 },
  { name: '残柱', rect: [19,368,256,635], height: 2.7, radius: .7 },
  { name: '覆晶岩', rect: [316,416,578,618], height: 1.8, radius: .8 },
  { name: '零散碎石', rect: [638,434,907,619], height: .85, radius: .55 },
  { name: '符文石', rect: [979,398,1206,628], height: 2.5, radius: .72 },
] as const;
