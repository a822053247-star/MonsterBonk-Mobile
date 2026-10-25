import { GIGAPACK_CLIPS } from '../src/visuals/gigapack-clips.ts';
import { CARD_ART, COMBINED_CARD_ART } from '../src/card-art-manifest.ts';

// Read the same registries as the game; source artwork and sheet metadata stay out.
export const releaseAssets = new Set([
  ...Object.values(GIGAPACK_CLIPS).map(clip => clip.url),
  ...Object.values(CARD_ART).map(path => 'assets/ui/' + path),
  ...Object.values(COMBINED_CARD_ART).map(path => 'assets/ui/' + path),
  ...['deep-bubble', 'chain-bubble', 'thorn-scatter', 'jump-thorn'].map(id => `assets/pixel/skills/fusions/${id}-icon.png`),
]);
