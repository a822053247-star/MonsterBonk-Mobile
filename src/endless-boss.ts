import type { EnemyKind } from './combat';

type Attack = 'dash-windup' | 'spread-windup' | 'quake-windup';
export interface EndlessBossDefinition {
  readonly name: string; readonly kind: EnemyKind; readonly scale: number;
  readonly speed: number; readonly dashSpeed: number; readonly dashDuration: number;
  readonly shotSpeed: number; readonly shotLife: number; readonly shotCount: number;
  readonly pattern: readonly Attack[]; readonly enragedPattern: readonly Attack[];
}
const BOSSES: readonly EndlessBossDefinition[] = [
  {name:'熔果暴君',kind:'molten-fruit',scale:2,speed:1.8,dashSpeed:13,dashDuration:.75,
    shotSpeed:5.5,shotLife:2,shotCount:7,
    pattern:['dash-windup','spread-windup'],
    enragedPattern:['dash-windup','dash-windup','spread-windup']},
  {name:'晶甲重炮王',kind:'crystal-crawler',scale:2,speed:1.1,dashSpeed:0,dashDuration:0,
    shotSpeed:4.5,shotLife:2.5,shotCount:5,
    pattern:['spread-windup','spread-windup'],
    enragedPattern:['spread-windup','spread-windup','spread-windup']},
  {name:'霜绒巨兽',kind:'frost-fluff',scale:2,speed:1.4,dashSpeed:10,dashDuration:.65,
    shotSpeed:4.5,shotLife:2.5,shotCount:5,
    pattern:['dash-windup','quake-windup'],
    enragedPattern:['dash-windup','quake-windup','quake-windup']},
];

export function endlessBossDefinition(cycleIndex: number) {
  return cycleIndex > 0 ? BOSSES[(cycleIndex - 1) % BOSSES.length] : undefined;
}
