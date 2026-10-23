import {ENEMY_TYPES,type EnemyKind} from './combat';
import {captureSpawnRate} from './capture-rules';

export const CAPTURE_SPAWNS_KEY='monsterbonk:capture-spawns:v1';
/** Per-local-player spawn history, separate from ownership and capture success. */
export class CaptureSpawns {
  private spawned:Partial<Record<EnemyKind,number>>={};
  saved=true;
  constructor(private storage?:Pick<Storage,'getItem'|'setItem'>,private random=Math.random){this.refresh();}
  private refresh(){
    try{
      const raw=this.storage?.getItem(CAPTURE_SPAWNS_KEY);if(!raw)return;
      const data=JSON.parse(raw);if(data?.version!==1)return;
      for(const kind of Object.keys(ENEMY_TYPES) as EnemyKind[]){
        const count=data.spawned?.[kind];
        if(Number.isSafeInteger(count) && count>=0)this.spawned[kind]=Math.max(this.spawned[kind]??0,count);
      }
    }catch{this.saved=false;}
  }
  rate(kind:EnemyKind){return captureSpawnRate(this.spawned[kind]??0);}
  roll(kind:EnemyKind){
    this.refresh();
    if(this.random()>=this.rate(kind))return false;
    this.spawned[kind]=Math.min(Number.MAX_SAFE_INTEGER,(this.spawned[kind]??0)+1);
    this.flush();return true;
  }
  flush(){
    this.refresh();
    try{
      if(!this.storage)throw new Error('storage unavailable');
      this.storage.setItem(CAPTURE_SPAWNS_KEY,JSON.stringify({version:1,spawned:this.spawned}));
      this.saved=true;return true;
    }catch{this.saved=false;return false;}
  }
  inspect(){
    return {saved:this.saved,species:Object.fromEntries((Object.keys(ENEMY_TYPES) as EnemyKind[]).map(kind=>[kind,{spawned:this.spawned[kind]??0,rate:this.rate(kind)}]))};
  }
}
