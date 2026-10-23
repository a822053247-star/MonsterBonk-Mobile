import type { EnemyKind } from './combat';
import type { BarragePattern } from './boss-barrage';

type Attack = 'dash-windup' | 'spread-windup' | 'quake-windup' | 'barrage-windup';
export interface EndlessBossDefinition {
  readonly name: string; readonly kind: EnemyKind; readonly scale: number;
  readonly speed: number; readonly dashSpeed: number; readonly dashDuration: number;
  readonly shotSpeed: number; readonly shotLife: number; readonly shotCount: number;
  readonly barragePattern: BarragePattern;
  readonly barragePatterns: readonly BarragePattern[];
  readonly pattern: readonly Attack[]; readonly enragedPattern: readonly Attack[];
}
const BOSSES: readonly EndlessBossDefinition[] = [
  {name:'熔果暴君',kind:'molten-fruit',scale:2,speed:1.8,dashSpeed:13,dashDuration:.75,
    shotSpeed:5.5,shotLife:2,shotCount:7,
    barragePattern:'molten-spiral',barragePatterns:['molten-spiral','molten-crossfire','molten-bloom'],
    pattern:['dash-windup','barrage-windup','spread-windup','barrage-windup','dash-windup','barrage-windup'],
    enragedPattern:['dash-windup','dash-windup','barrage-windup','spread-windup','barrage-windup','dash-windup','barrage-windup']},
  {name:'晶甲重炮王',kind:'crystal-crawler',scale:2,speed:1.1,dashSpeed:0,dashDuration:0,
    shotSpeed:4.5,shotLife:2.5,shotCount:5,
    barragePattern:'crystal-lattice',barragePatterns:['crystal-lattice','crystal-cross','crystal-prism'],
    pattern:['spread-windup','barrage-windup','spread-windup','barrage-windup','spread-windup','barrage-windup'],
    enragedPattern:['spread-windup','spread-windup','barrage-windup','spread-windup','barrage-windup','spread-windup','barrage-windup']},
  {name:'霜绒巨兽',kind:'frost-fluff',scale:2,speed:1.4,dashSpeed:10,dashDuration:.65,
    shotSpeed:4.5,shotLife:2.5,shotCount:5,
    barragePattern:'frost-ripple',barragePatterns:['frost-ripple','frost-snowflake','frost-drift'],
    pattern:['dash-windup','barrage-windup','quake-windup','barrage-windup','dash-windup','barrage-windup'],
    enragedPattern:['dash-windup','barrage-windup','quake-windup','barrage-windup','quake-windup','barrage-windup']},
];

export function endlessBossDefinition(cycleIndex: number) {
  return cycleIndex > 0 ? BOSSES[(cycleIndex - 1) % BOSSES.length] : undefined;
}
