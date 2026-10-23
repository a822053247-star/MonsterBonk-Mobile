/** Selection copy only. Full numeric rules stay in descriptions, ARIA and the build panel. */
interface CardCopyInput {id?:string;benefit:string;tradeoff?:string}
const RELIC_COPY:Record<string,readonly [string,string]>={
 'draft-boiling-core':['水火连击触发蒸爆','消耗湿润，有触发间隔'],
 'hunter-eye':['派生弹轻微追踪','派生伤害降低'],
 'shattered-core':['分裂时多发一枚子弹','派生伤害降低'],
 'tidal-pearl':['水泡减速持续更久','直击伤害降低'],
 'specialist-badge':['单武器伤害提升','装备副武器后失效'],
 'echo-rune':['连锁跳得更远','后续跳跃伤害降低'],
 'draft-martyr-core':['火系击杀引发连爆','传播次数有限'],
 'draft-kindling-flask':['火系命中施加燃烧','爆炸会消耗燃烧层数'],
 'draft-thorn-testament':['草系击杀发射荆棘','荆棘不再连锁派生'],
 'draft-bubble-spore':['水系击杀生成弹射泡','有触发间隔'],
 'draft-echo-bone-dice':['定期复制一次攻击','复制攻击伤害较低'],
 'draft-slaughter-hourglass':['短时间连杀获得攻速','有冷却，不叠加'],
 'mirror-prism':['主弹命中后折射','折射不再派生'],
 'returning-crown':['飞叶到远端后返回','只命中尚未击中的敌人'],
 'tidal-magnet':['水系范围攻击牵引敌群','无法牵引精英与Boss'],
 'hive-fuse':['多次主弹命中留下地雷','延时爆炸，数量有限'],
 'ember-sigil':['火系命中留下燃烧区','有冷却，范围有限'],
 'spore-crown':['草系击杀留下毒雾','有冷却，数量有限'],
 'back-mirror':['定期追加背后射击','幻影弹伤害较低'],
 'slaughter-drum':['短时间连杀释放冲击波','有冷却，不连续触发'],
 'wet-vines':['飞叶命中湿润敌人强减速','消耗湿润，Boss效果较弱'],
 'blood-pact':['低血时攻速提升，击杀回血','最大生命降低'],
 'storm-relay':['连续主命中触发额外雷击','有冷却，雷击不再派生'],
 'void-vessel':['定期抵消受伤并储存反击','最多储存一次反击'],
 'warp-eye':['定期将主弹折跃至远敌前','只移动原弹，不额外发射'],
 'reaper-decree':['击杀蓄能后处决普通敌人','对精英与Boss改为伤害'],
 'rhythm-seal':['多次施放后释放音浪','有冷却，音浪不再派生'],
 'alchemist-ledger':['赚金币获得经验','每波触发次数有限'],
 'venom-insignia':['飞叶挂印，异系命中引爆','每个敌人有触发间隔'],
 'heart-keeper':['无伤连杀储存治疗','受伤后消耗储存'],
 'smokescreen-feather':['冲刺起点留下减速烟幕','有冷却，Boss免疫'],
 'levelup-salute':['升级后释放多目标礼炮','恢复战斗后只触发一次'],
 'resonant-aftershock':['火系群体爆炸追加余震','有冷却，余震不再派生'],
 'reverse-tide':['水系多次命中释放推波','不造成伤害，Boss免疫'],
 'charge-chamber':['停射蓄能，下次命中爆发','最多储存一次'],
 'azure-ward':['持续无伤获得减伤守印','抵挡一次后进入冷却'],
 'swift-weave':['连续命中不同敌人加攻速','短时生效，不叠加'],
 'pristine-halo':['满血时多次命中释放光波','受伤清空计数'],
 'blazing-satellite':['火系近战连击召唤火卫星','短时生效，最多一枚'],
 'prism-shower':['同轮多弹命中不同敌人落星','有冷却，星屑不再派生'],
 'scarlet-reprisal':['受伤后下一次攻击带复制','短时有效，只消耗一次'],
 'starlit-magnet':['短时间连杀吸引经验宝珠','只吸引已有宝珠'],
 'berserk-route':['火种爆炸范围提升','攻击变慢，放弃追猎路线'],
 'pursuit-route':['派生火种追踪敌人','爆炸缩小，放弃狂暴路线'],
 'tsunami-sanctuary':['震爆后留下减速领域','替换原有两项技能'],
 'astral-wheel':['扩张水环与冰棱齐射','替换原有两项技能'],
 'abyss-crown':['随身聚怪并重击中心','Boss不受牵引'],
 'undertow-pyre':['移动铺毒焰，回潮引爆','回潮会消耗足迹'],
 'deep-collapse':['先聚拢敌群，再坍缩爆发','Boss不受牵引'],
 'frost-prism':['冰棱齐射后交叉反射','替换原有两项技能'],
 'all-tides':['往返水环，归心后爆发','替换原有两项技能'],
 'weapon-pair-fusion':['两把武器合为一把','占用一次升级选择'],
 'spark-weapon':['火花命中爆发',''], 'bubble-weapon':['水泡减速敌人',''],
 'leaf-weapon':['飞叶穿透敌群',''], 'flame-sweep-weapon':['火浪横扫近敌',''],
 'thorn-wheel-weapon':['荆轮绕身切割',''], 'tidal-blade-weapon':['水刃往返穿透',''],
 'thunder-bud-weapon':['雷电连击多敌',''], 'frost-crystal-weapon':['冰晶减速，水冰冻结',''],
 'dream-dart-weapon':['三层梦印触发绽放',''], 'resonance-seed-weapon':['穿透挂印，击杀传伤',''],
 'steam-comet-weapon':['蒸汽彗星溅射',''], 'bramble-tide-weapon':['藤潮爆发控场',''],
 'blazing-thorn-weapon':['烈焰荆棘贯穿',''], 'split-on-hit':['命中后分裂',''], 'chain':['弹射至附近敌人',''],
};
const clean=(text:string)=>text.replace(/所有武器/g,'武器').replace(/武器直接命中伤害/g,'直击伤害').replace(/最大生命值/g,'最大生命').replace(/移动速度/g,'移速').replace(/攻击速度/g,'攻速').replace(/魔法弹伤害/g,'伤害').replace(/每次施法/g,'每轮').replace(/(\d+)\.00\b/g,'$1').trim();
const first=(text:string)=>clean(text.split(/[；。]/)[0].split(' · ')[0]);
const percentages=(text:string)=>text.match(/\d+(?:\.\d+)?%/g)??[];
export function cardCopy(input:CardCopyInput,kind?:string){
 const {id,benefit,tradeoff=''}=input;
 if(kind==='heal')return {benefit:`恢复${benefit.match(/\d+/)?.[0]??''}点生命`,tradeoff:benefit.includes('限购')?'每店限购1次':'不超过最大生命'};
 if(kind==='contract'){
  const health=Number(tradeoff.match(/最大生命乘(\d+)%/)?.[1]??100);
  return {benefit:`伤害强化 +${percentages(benefit)[0]??''}`,tradeoff:`最大生命 -${100-health}% · 本局限${tradeoff.match(/本局最多(\d+)次/)?.[1]??''}次`};
 }
 if(id==='far-lens'){
  const line=benefit.split('；').find(s=>!s.includes('已封顶'))??benefit;
  const range=line.match(/射程\s*([\d.]+)\s*→\s*([\d.]+)/);
  return {benefit:range?`射程 ${Number(range[1])} → ${Number(range[2])}`:`射程最多 +${percentages(benefit)[0]??''}`,tradeoff:'有射程收益时攻击略慢'};
 }
 if(id==='steady-cannon')return {benefit:clean(benefit),tradeoff:first(tradeoff)};
 if(id==='fleet-contract')return {benefit:clean(benefit),tradeoff:first(tradeoff)};
 if(id==='heavy-ammo')return {benefit:`单发伤害 +${percentages(benefit)[0]??''}`,tradeoff:`每轮额外主弹 -${tradeoff.match(/少(\d+)枚/)?.[1]??1}`};
 if(id==='last-stand'){const p=percentages(benefit);return {benefit:`生命≤${p[0]}：直击 +${p[1]}`,tradeoff:'仅低血时生效'};}
 if(id==='elite-hunter')return {benefit:`精英/Boss直击 +${percentages(benefit)[0]??''}`,tradeoff:`普通敌人直击 -${percentages(tradeoff)[0]??''}`};
 const copy=id?RELIC_COPY[id]:undefined;
 return {benefit:copy?.[0]??first(benefit),tradeoff:tradeoff?(copy?.[1]??first(tradeoff)):''};
}
