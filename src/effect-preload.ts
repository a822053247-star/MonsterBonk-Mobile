/** Texture dependencies only; this table never changes skill eligibility or combat. */
const water=['water-aoe/azure-burst','water-aoe/star-tide','water-aoe/still-sea','water-aoe/returning-ring',
  'water-aoe/sea-sparkles','position-aoe/abyss-vortex','position-aoe/ice-radiance','position-aoe/spore-trail','position-aoe/recall-impact'];
const dream=['dream/dart','dream/seed','dream/mark','dream/echo'];
export const EFFECT_ATLASES:Readonly<Record<string,readonly string[]>>={
  'thorn-wheel-weapon':['blade-weapons/thorn-wheel','blade-weapons/thorn-impact'],
  'tidal-blade-weapon':['blade-weapons/tidal-blade','blade-weapons/tidal-impact'],
  'thunder-bud-weapon':['thunder-bud/bud','thunder-bud/lightning','thunder-bud/spark','thunder-bud/arc'],
  'frost-crystal-weapon':['frost/crystal-bolt','frost/freeze-shell','frost/crystal'],
  'shatter-ring':['frost/shatter-ring','frost/crystal'],
  'glacier-trail':['frost/glacier-trail','frost/freeze-shell'],
  'dream-dart-weapon':dream,'resonance-seed-weapon':dream,'sakura-echo':dream,
  'azure-burst':['water-aoe/azure-burst'],'star-tide':['water-aoe/star-tide'],
  'still-sea':['water-aoe/still-sea','water-aoe/sea-sparkles'],'returning-ring':['water-aoe/returning-ring'],
  'abyss-vortex':['position-aoe/abyss-vortex'],
  'ice-radiance':['position-aoe/ice-radiance','water-aoe/still-sea','water-aoe/star-tide'],
  'spore-trail':['position-aoe/spore-trail'],
  'tidal-recall':['water-aoe/star-tide','position-aoe/recall-impact'],
  ...Object.fromEntries(['tsunami-sanctuary','astral-wheel','abyss-crown','undertow-pyre','deep-collapse','frost-prism','all-tides'].map(id=>[id,water])),
};
