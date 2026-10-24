import type { Combat } from './combat';
import type { Obstacle } from './world';
import { PLAYER_COLLISION_RADIUS } from './arena-boundary';

export interface RegionMigrationReport { movedPlayer:boolean; movedEnemies:number; movedOrbs:number; unresolved:number }
type Point={x:number;z:number};

/** Preserve identities and simulation state; only resolve overlap with the new scenery. */
export function migrateRegionObjects(combat:Combat,player:Point,obstacles:readonly Obstacle[]):RegionMigrationReport {
  const report:RegionMigrationReport={movedPlayer:false,movedEnemies:0,movedOrbs:0,unresolved:0};
  const free=(p:Point,r:number)=>obstacles.every(o=>Math.hypot(p.x-o.x,p.z-o.z)>=o.radius+r+.08);
  const move=(p:Point,r:number)=>{
    if(free(p,r))return false;
    const origin={x:p.x,z:p.z};
    for(let radius=.5;radius<=24;radius+=.5)for(let angle=0;angle<24;angle++){
      const a=angle*Math.PI/12,point={x:origin.x+Math.cos(a)*radius,z:origin.z+Math.sin(a)*radius};
      if(free(point,r)){p.x=point.x;p.z=point.z;return true;}
    }
    report.unresolved++;return false;
  };
  report.movedPlayer=move(player,PLAYER_COLLISION_RADIUS);
  for(const enemy of combat.enemies)if(enemy.active&&move(enemy,combat.enemyRadius(enemy))){
    enemy.previousX=enemy.x;enemy.previousZ=enemy.z;report.movedEnemies++;
  }
  for(const orb of combat.orbs)if(orb.active&&move(orb,.15)){
    orb.previousX=orb.x;orb.previousZ=orb.z;report.movedOrbs++;
  }
  return report;
}
