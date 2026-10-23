import {CARD_ART,COMBINED_CARD_ART} from './card-art-manifest';

const prefix=`${import.meta.env.BASE_URL}assets/ui/`;
const key=(url:string)=>url.startsWith(prefix)?url.slice(prefix.length):undefined;
const originals=Object.fromEntries(Object.entries(CARD_ART).map(([source,output])=>[output,source]));
/** Build-time WebP subjects share an optical center; no runtime alpha scans or canvases. */
export function cardArtUrl(url:string){const path=key(url);return path&&CARD_ART[path]?prefix+CARD_ART[path]:url;}
export function cardArtImages(urls:readonly string[]){
 const paths=urls.map(url=>{const path=key(url);return path?(originals[path]??path):undefined;}),combined=paths.every(Boolean)?COMBINED_CARD_ART[paths.join('|')]:undefined;
 return combined?[prefix+combined]:urls.map(cardArtUrl);
}
