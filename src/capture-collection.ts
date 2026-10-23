import {ENEMY_TYPES,type EnemyKind} from './combat';
export const COLLECTION_KEY='monsterbonk:prison-collection:v1';
export interface CollectionSave {version:1; counts:Partial<Record<EnemyKind,number>>; receipts:string[]}
export class CaptureCollection {
  data:CollectionSave={version:1,counts:{},receipts:[]};
  saved=true;
  constructor(private storage?:Pick<Storage,'getItem'|'setItem'>) {
    try {
      const raw=storage?.getItem(COLLECTION_KEY);if(!raw)return;
      const d=JSON.parse(raw);if(d?.version!==1)return;
      for(const kind of Object.keys(ENEMY_TYPES) as EnemyKind[]) {
        const n=d.counts?.[kind];if(Number.isSafeInteger(n)&&n>0)this.data.counts[kind]=Math.min(n,999999);
      }
      this.data.receipts=Array.isArray(d.receipts)?d.receipts.filter((v:unknown)=>typeof v==='string').slice(-2048):[];
    } catch {this.saved=false;}
  }
  add(kind:EnemyKind,receipt:string) {
    if(this.data.receipts.includes(receipt))return false;
    this.data.counts[kind]=Math.min(999999,(this.data.counts[kind]??0)+1);
    this.data.receipts.push(receipt);this.data.receipts=this.data.receipts.slice(-2048);
    return this.flush();
  }
  release(kind:EnemyKind) {
    const count=this.data.counts[kind]??0;
    if(count<=0)return false;
    const counts={...this.data.counts};
    if(count===1)delete counts[kind];else counts[kind]=count-1;
    const next:CollectionSave={...this.data,counts};
    try {
      if(!this.storage)throw new Error('storage unavailable');
      this.storage.setItem(COLLECTION_KEY,JSON.stringify(next));
      this.data=next;this.saved=true;return true;
    } catch {this.saved=false;return false;}
  }
  flush() {try {if(!this.storage)throw new Error('storage unavailable');this.storage.setItem(COLLECTION_KEY,JSON.stringify(this.data));this.saved=true;return true;}catch{this.saved=false;return false;}}
  owns(kind:EnemyKind) {return (this.data.counts[kind]??0)>0;}
}
