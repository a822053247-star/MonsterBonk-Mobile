import type { RelicDefinition } from './content-types';

export const ICON_PALETTES = {
  water: ['#123c68','#237fc1','#68d8f4','#d1fbff'],
  fire: ['#612733','#ce5e32','#ffb454','#fff0b0'],
  grass: ['#244b3a','#538d41','#a4d86b','#e6f7b1'],
} as const;
export const ICON_SYMBOLS = ['prism','orb'] as const;
/** Integer pixel geometry, no fonts or external image service. Same config yields identical SVG. */
export function relicIconSvg(art: RelicDefinition['art']) {
  const [dark,mid,light,white] = ICON_PALETTES[art.palette];
  const shape = art.symbol === 'prism'
    ? `<path fill="${dark}" d="M14 3h4v3h4v4h3v11h-3v4h-4v4h-4v-4h-4v-4H7V10h3V6h4z"/><path fill="${mid}" d="M14 7h4v3h4v10h-4v5h-4v-5h-4V10h4z"/><path fill="${light}" d="M14 7h3v18h-3V19h-3v-8h3z"/><path fill="${white}" d="M14 9h2v7h-2zM18 11h2v3h-2z"/>`
    : `<path fill="${dark}" d="M10 6h12v4h4v12h-4v4H10v-4H6V10h4z"/><path fill="${mid}" d="M10 10h12v12H10z"/><path fill="${light}" d="M11 10h8v5h-8z"/><path fill="${white}" d="M11 10h3v3h-3z"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 32 32" shape-rendering="crispEdges">${shape}<path fill="${light}" d="M2 23h4v2H2zM4 26h6v2H4zM24 5h4v2h-4zM26 8h4v2h-4z"/></svg>`;
}
export function generatedIcon(art: RelicDefinition['art']) { return `data:image/svg+xml,${encodeURIComponent(relicIconSvg(art))}`; }
export function relicIcon(art: RelicDefinition['art'], baseUrl: string) { return art.png ? `${baseUrl}${art.png}` : generatedIcon(art); }
