import type { RelicDefinition } from '../content-types';

export const tidePrism = {
  id: 'tide-prism', title: '潮涌棱镜', category: 'relic', rarity: 'rare', modes: ['formal'],
  tags: ['water','area'], requirements: { weapon: 'bubble', skills: ['area'] },
  modifiers: [
    { handler: 'multiply', target: 'water-area', stat: 'areaMultiplier', multiply: 1.25, polarity: 'benefit' },
    { handler: 'multiply', target: 'water-weapon', stat: 'intervalMultiplier', multiply: 1.10, polarity: 'tradeoff' },
  ],
  art: { symbol: 'prism', palette: 'water', png: 'assets/ui/upgrade/illustrations/relics/tide-prism.png' }, vfx: { preset: 'tidal-ring', target: 'water-area' },
  maxRank: 1, rewards: { upgrade: true, shop: true },
} as const satisfies RelicDefinition;
