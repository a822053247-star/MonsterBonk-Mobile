import{test,expect}from'@playwright/test';
import{Combat,ENEMY_TYPES}from'../src/combat';
import{enemyPose}from'../src/enemy-motion';
function quiet(c:Combat){(c as any).fireClock=(c as any).spawnClock=1e9;c.hp=1e9;}
test('coincident crowds separate gradually without exceeding species speed or teleporting',()=>{
 const c=new Combat();quiet(c);const enemies=Array.from({length:12},()=>c.spawn('normal',8,0,0)!);
 for(let tick=0;tick<180;tick++){c.update(1/60,{x:0,z:0});for(const e of enemies)expect(Math.hypot(e.x-e.previousX,e.z-e.previousZ)).toBeLessThanOrEqual(ENEMY_TYPES[e.kind].speed/60+1e-8);}
 const nearest=enemies.map(e=>Math.min(...enemies.filter(o=>o!==e).map(o=>Math.hypot(e.x-o.x,e.z-o.z))));expect(Math.min(...nearest)).toBeGreaterThan(.15);
 expect(new Set(enemies.map(e=>e.walkPhase)).size).toBe(12);
});
test('swept collision stops tunneling and tangent sliding keeps every moving frame outside cover',()=>{
 const c=new Combat([{x:0,z:0,radius:1}]);quiet(c);const e=c.spawn('fast',4,0,0)!;
 c.update(2,{x:-4,z:0});expect(e.x).toBeGreaterThanOrEqual(1+ENEMY_TYPES.fast.radius-1e-6);
 const nav=new Combat([{x:0,z:0,radius:2}]);nav.useNavigation=true;quiet(nav);const runner=nav.spawn('fast',5,0,0)!;
 for(let i=0;i<420;i++){nav.update(1/60,{x:-5,z:0});expect(Math.hypot(runner.x,runner.z)).toBeGreaterThanOrEqual(2+ENEMY_TYPES.fast.radius-1e-5);expect(Math.hypot(runner.x-runner.previousX,runner.z-runner.previousZ)).toBeLessThanOrEqual(ENEMY_TYPES.fast.speed/60+1e-7);}
 expect(runner.x).toBeLessThan(-2);
});
test('render pose is restrained, allocation-free and stops at rest; animation cadence follows real displacement',()=>{
 const pose={bob:0,lean:0,squash:0};for(const kind of['normal','fast','tank']as const)for(let i=0;i<60;i++){expect(enemyPose(kind,i*.1,1,pose)).toBe(pose);expect(pose.bob).toBeLessThanOrEqual(.065);expect(Math.abs(pose.lean)).toBeLessThanOrEqual(.045);expect(Math.abs(pose.squash)).toBeLessThanOrEqual(.035);enemyPose(kind,i*.1,0,pose);for(const value of Object.values(pose))expect(value).toBeCloseTo(0,10);}
 const normal=new Combat(),slow=new Combat();quiet(normal);quiet(slow);const a=normal.spawn('normal',8,0,0)!,b=slow.spawn('normal',8,0,0)!;b.slowTime=1.5;const phase=b.walkPhase!;
 for(let i=0;i<30;i++){normal.update(1/60,{x:0,z:0});slow.update(1/60,{x:0,z:0});}
 expect((8-b.x)/(8-a.x)).toBeCloseTo(.7,6);expect(b.walkPhase).not.toBe(phase);expect(b.walkAmount).toBeLessThan(a.walkAmount!);
});
