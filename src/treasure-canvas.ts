import { treasurePresentation, type TreasureCue } from './treasure-presentation';
// Adapted from the user-supplied astral-relics-reference-rebuild Canvas effect.
export function createTreasureCanvas(canvas: HTMLCanvasElement, titles: string[], artUrls: (string | undefined)[] = [], modal = false, onCue: (cue: TreasureCue, index?: number) => void = () => {}, rollingItems: readonly {title:string;artUrl?:string}[] = []) {
type Tier = 'COMMON' | 'RARE' | 'EPIC' | 'LEGENDARY';
type IconKind = 'sword' | 'cross' | 'orb' | 'staff' | 'prism' | 'crown' | 'flame' | 'axe' | 'book' | 'shield';
type Reward = { image?: HTMLImageElement; name: string; tier: Tier; icon: IconKind; color: string; bright: string; dark: string };
type ParticleKind = 'coin' | 'gem' | 'spark' | 'sliver';
type Particle = { x: number; y: number; vx: number; vy: number; g: number; life: number; max: number; size: number; rot: number; vr: number; kind: ParticleKind; color: string };
type Reel = { result: Reward; strip: Reward[]; stoppedAt: number; stopped: boolean; pop: number; spinOffset: number; lastTick: number };

const W = 900, H = 988;
const settings = treasurePresentation(titles.length);
const PANEL = { x: 25, y: 52, w: 850, h: 558 };
const laneColors = settings.count >= 3 ? ['#ff3158', '#ffca46', '#c967ff', '#ff2446', '#fff088'] : ['#d35cff', '#ffd34f'];
const CELL = 70;

const rewards: Reward[] = titles.map((name, i) => ({ name, image: artUrls[i] ? Object.assign(new Image(), { src: artUrls[i] }) : undefined, tier: 'COMMON', icon: 'prism', color: laneColors[i], bright: '#fff4a0', dark: '#40117e' }));
const imageCache=new Map<string,HTMLImageElement>();
function shuffled<T>(items:readonly T[]):T[]{
  const copy=[...items];
  for(let i=copy.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[copy[i],copy[j]]=[copy[j],copy[i]];}
  return copy;
}


function tierLabel(tier: Tier): string {
  const labels: Record<Tier, string> = {
    COMMON: '本局奖励',
    RARE: '稀有',
    EPIC: '史诗',
    LEGENDARY: '传说'
  };
  return labels[tier];
}

const ctx = canvas.getContext('2d')!;
type Phase = 'idle' | 'intro' | 'opening' | 'rolling' | 'burst' | 'result';
let phase: Phase = 'idle';
let phaseTime = 0, time = 0, nextCoin = 0;
let reels: Reel[] = [];
let particles: Particle[] = [];
let flash = 0, shake = 0, lid = 0;
let selectedCount = titles.length;
let rollDuration = settings.roll;
let stopGap = settings.gap;
let revealPulse: number[] = Array(selectedCount).fill(0);
const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
function lanePositions(count = selectedCount): number[] {
  if (count <= 1) return [450];
  const spacing = Math.min(300, 1000 / (count + 1));
  return Array.from({ length: count }, (_, i) => 450 + (i - (count - 1) / 2) * spacing);
}
function effectiveRollDuration(count = selectedCount): number {
  const factors = [0.58, 0.68, 0.78, 0.89, 1];
  return modal ? rollDuration : rollDuration * factors[count - 1];
}
function effectiveStopGap(count = selectedCount): number {
  if (count <= 1) return 0;
  return Math.min(stopGap, Math.max(0, (effectiveRollDuration(count) - 0.8) / (count - 1)));
}
function stopTimes(count = selectedCount): number[] {
  const total = effectiveRollDuration(count);
  const gap = effectiveStopGap(count);
  const first = Math.max(0.8, total - gap * (count - 1));
  return Array.from({ length: count }, (_, i) => first + i * gap);
}
function triggerShake(intensity: number): void {
  const factors = modal ? [.4, .55, .7, .85, 1] : [0, 0, 0.18, 0.5, 1];
  shake = Math.max(shake, intensity * (modal ? settings.shake : factors[selectedCount - 1]));
}
const easeOut = (t: number) => 1 - Math.pow(1 - clamp(t), 4);
const smooth = (t: number) => { t = clamp(t); return t * t * (3 - 2 * t); };
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];

function tone(..._args: unknown[]) {}
function fanfare() {}
function burst(x: number, y: number, count: number, kind: ParticleKind, colors = ['#fff9c7', '#ffc42f', '#ff7438', '#ffffff']) {
  for (let i = 0; i < count; i++) {
    const a = rand(-Math.PI, Math.PI);
    const speed = kind === 'coin' ? rand(170, 560) : kind === 'sliver' ? rand(150, 500) : rand(35, 330);
    const angle = kind === 'coin' || kind === 'sliver' ? -Math.PI / 2 + rand(-1.18, 1.18) : a;
    particles.push({
      x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      g: kind === 'coin' ? 350 : kind === 'sliver' ? 280 : -15,
      life: rand(0.6, kind === 'coin' ? 2.4 : 1.5), max: kind === 'coin' ? 2.4 : 1.5,
      size: rand(kind === 'coin' ? 5 : 2, kind === 'coin' ? 13 : 7),
      rot: rand(0, 6), vr: rand(-9, 9), kind, color: pick(colors)
    });
  }
  if (particles.length > 160) particles.splice(0, particles.length - 160);
}
function begin() {
  if (phase !== 'idle' && phase !== 'result') return;
  const times = stopTimes(selectedCount);
  // Sample the full catalogue, but decode at most 28 roulette images per chest.
  const deck:Reward[]=shuffled(rollingItems).slice(0,28).map(item=>{
    let image=item.artUrl?imageCache.get(item.artUrl):undefined;
    if(item.artUrl&&!image){image=Object.assign(new Image(),{src:item.artUrl});imageCache.set(item.artUrl,image);}
    return {...rewards[0],name:item.title,image};
  });
  reels = Array.from({ length: selectedCount }, (_, i) => {
    const result = rewards[i];
    const laneDeck=shuffled(deck.length?deck:rewards);
    const length=modal?18+i*2:30+i*3;
    const strip = Array.from({ length }, (_,j) => ({...laneDeck[j%laneDeck.length],color:result.color}));
    strip.push(result);
    return { result, strip, stoppedAt: times[i], stopped: false, pop: 0, spinOffset: 0, lastTick: -1 };
  });
  particles = [];
  revealPulse = Array(selectedCount).fill(0);
  phase = 'intro'; phaseTime = 0; lid = 0; flash = 0.1; shake = 0;
  triggerShake(3);


  tone(110, 0.5, 'sawtooth', 0.04);

}
function pathPoly(points: [number, number][], fill: string | CanvasGradient | CanvasPattern, stroke?: string, width = 1) {
  ctx.beginPath();
  points.forEach(([x, y], i) => i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y));
  ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
}
function rr(x: number, y: number, w: number, h: number, r: number, fill: string, stroke?: string, sw = 1) {
  ctx.beginPath(); ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath();
  ctx.fillStyle = fill; ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = sw; ctx.stroke(); }
}
function line(x1:number,y1:number,x2:number,y2:number,color:string,width=1) {
  ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.strokeStyle=color; ctx.lineWidth=width; ctx.stroke();
}
function circle(x:number,y:number,r:number,fill:string,stroke?:string,sw=1) {
  ctx.beginPath(); ctx.arc(x,y,Math.max(0.1,r),0,Math.PI*2); ctx.fillStyle=fill; ctx.fill();
  if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=sw;ctx.stroke();}
}
function glow(x:number,y:number,r:number,color:string) {
  const g=ctx.createRadialGradient(x,y,0,x,y,r); g.addColorStop(0,color); g.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle=g; ctx.fillRect(x-r,y-r,r*2,r*2);
}
function txt(s:string,x:number,y:number,size:number,color:string,font='system-ui,sans-serif',weight=800) {
  ctx.save(); ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.font=`${weight} ${size}px ${font}`;
  ctx.fillStyle=color; ctx.shadowColor=color; ctx.shadowBlur=size*0.25; ctx.fillText(s,x,y); ctx.restore();
}
function diamond(x:number,y:number,r:number,fill:string,stroke?:string) {
  pathPoly([[x,y-r],[x+r*0.75,y],[x,y+r],[x-r*0.75,y]],fill,stroke,1);
}

function drawBackground() {
  const bg=ctx.createLinearGradient(0,0,0,H);
  bg.addColorStop(0,'#080e60'); bg.addColorStop(0.38,'#17146f'); bg.addColorStop(0.72,'#3c167f'); bg.addColorStop(1,'#100a43');
  ctx.fillStyle=bg; ctx.fillRect(0,0,W,H);
  // Pixel-grid and checkerboard stage.
  for(let y=0;y<H;y+=22) for(let x=0;x<W;x+=22) {
    const alt=((x/22+y/22)%2)===0;
    ctx.fillStyle=alt?'rgba(78,92,255,0.065)':'rgba(9,13,64,0.075)';
    ctx.fillRect(x,y,22,22);
  }
  // Large diagonal indigo rays.
  ctx.save(); ctx.translate(450,520); ctx.rotate(time*0.025);
  for(let i=0;i<32;i++){
    const a=i*Math.PI*2/32, half=0.025+(i%4)*0.009;
    pathPoly([[Math.cos(a-half)*50,Math.sin(a-half)*50],[Math.cos(a+half)*50,Math.sin(a+half)*50],[Math.cos(a+half*.6)*1000,Math.sin(a+half*.6)*1000],[Math.cos(a-half*.6)*1000,Math.sin(a-half*.6)*1000]],
      i%3===0?'rgba(71,56,255,0.18)':i%3===1?'rgba(255,48,224,0.09)':'rgba(38,199,255,0.08)');
  }
  ctx.restore();
  const core=ctx.createRadialGradient(450,735,5,450,735,490);
  const power = phase === 'opening' ? 1 : phase === 'burst' ? 1.25 : phase === 'result' ? 0.65 : phase === 'rolling' ? 0.38 : 0.16;
  core.addColorStop(0,`rgba(255,240,135,${.7*power})`);
  core.addColorStop(.18,`rgba(255,125,38,${.48*power})`);
  core.addColorStop(.44,`rgba(255,40,202,${.22*power})`);
  core.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle=core; ctx.fillRect(0,0,W,H);
  // Bright floating pixel-stars.
  for(let i=0;i<70;i++){
    const x=(i*137.1+Math.sin(time*.3+i)*20+900)%900;
    const y=(i*91.7-time*(8+i%5*3)+1100)%988;
    const s=1.5+(i%4)*.9;
    ctx.globalAlpha=.25+.65*Math.pow(Math.sin(time*1.4+i),2);
    circle(x,y,s,i%3===0?'#ff73ee':i%3===1?'#6ef5ff':'#fff5b2');
    if(i%5===0){line(x-s*3,y,x+s*3,y,'#fff6cc',1.5);line(x,y-s*3,x,y+s*3,'#fff6cc',1.5);}
  }
  ctx.globalAlpha=1;
  // Perspective floor.
  const floor=ctx.createLinearGradient(0,810,0,H); floor.addColorStop(0,'rgba(69,43,255,0)'); floor.addColorStop(1,'rgba(8,7,40,.85)');
  ctx.fillStyle=floor;ctx.fillRect(0,800,W,H-800);
  ctx.save();ctx.translate(450,905);ctx.scale(1,.24);
  for(let i=0;i<9;i++){ctx.strokeStyle=`rgba(${i%2?91:255},${i%2?86:173},255,${.3-i*.022})`;ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(0,0,90+i*43,42+i*17,0,0,Math.PI*2);ctx.stroke();}
  ctx.restore();
  const vign=ctx.createRadialGradient(450,490,230,450,490,780);vign.addColorStop(0,'rgba(0,0,0,0)');vign.addColorStop(1,'rgba(0,0,18,.65)');
  ctx.fillStyle=vign;ctx.fillRect(0,0,W,H);
}

function drawPanel() {
  const entrance=phase==='idle'?1:phase==='intro'?0.9+0.1*smooth(phaseTime/.45):1;
  ctx.save();ctx.globalAlpha=entrance;ctx.translate(450,331);ctx.scale(entrance,entrance);ctx.translate(-450,-331);
  // Thick beveled neon frame with pixel-cut corners.
  ctx.shadowColor='#2a82ff';ctx.shadowBlur=24;
  rr(PANEL.x,PANEL.y,PANEL.w,PANEL.h,12,'#17145b','#ff70ef',5);
  ctx.shadowBlur=0;
  rr(PANEL.x+9,PANEL.y+9,PANEL.w-18,PANEL.h-18,8,'#152b91','#76f8ff',4);
  rr(PANEL.x+17,PANEL.y+17,PANEL.w-34,PANEL.h-34,5,'#27216f','#fff1a0',2);
  // Pixel-cut corner plates.
  for(const [x,y,sx,sy] of [[PANEL.x+10,PANEL.y+10,1,1],[PANEL.x+PANEL.w-10,PANEL.y+10,-1,1],[PANEL.x+10,PANEL.y+PANEL.h-10,1,-1],[PANEL.x+PANEL.w-10,PANEL.y+PANEL.h-10,-1,-1]] as [number,number,number,number][]){
    pathPoly([[x,y],[x+sx*22,y],[x+sx*22,y+sy*7],[x+sx*7,y+sy*7],[x+sx*7,y+sy*22],[x,y+sy*22]],'#c8ffff','#ffffff',2);
    pathPoly([[x+sx*5,y+sy*5],[x+sx*14,y+sy*5],[x+sx*14,y+sy*10],[x+sx*10,y+sy*10],[x+sx*10,y+sy*14],[x+sx*5,y+sy*14]],'#ff5ff3');
  }
  // Colored lane curtains taper down into the treasure chest.
  ctx.save();ctx.beginPath();ctx.rect(PANEL.x+20,PANEL.y+20,PANEL.w-40,PANEL.h-40);ctx.clip();
  const xs = lanePositions();
  for(let i=0;i<selectedCount;i++){
    const x=xs[i], width=selectedCount===1?220:selectedCount===2?180:selectedCount===3?160:selectedCount===4?150:142;
    const g=ctx.createLinearGradient(x-width/2,70,x+width/2,610);
    g.addColorStop(0,`${laneColors[i]}aa`);g.addColorStop(.55,`${laneColors[i]}66`);g.addColorStop(1,`${laneColors[i]}1c`);
    pathPoly([[x-width/2,70],[x+width/2,70],[450+(x-450)*0.16+12,665],[450+(x-450)*0.16-12,665]],g);
    line(x-width/2+7,85,x-width/2+18,596,'rgba(255,255,255,.26)',2);
    // Broad beams are vivid but not scribbled across the items.
    const beam=ctx.createLinearGradient(x,100,x,640);
    beam.addColorStop(0,'rgba(255,255,255,.12)');beam.addColorStop(.4,`${laneColors[i]}22`);beam.addColorStop(1,'rgba(255,255,255,0)');
    ctx.fillStyle=beam;ctx.fillRect(x-26,95,52,530);
  }
  // Faint pixel grid inside the glass.
  for(let y=95;y<600;y+=22) line(45,y,855,y,'rgba(255,255,255,.07)',1);
  for(let x=55;x<855;x+=22) line(x,85,x,600,'rgba(255,255,255,.035)',1);
  ctx.restore();
  // Top crest.
  pathPoly([[407,56],[427,56],[438,38],[450,23],[462,38],[473,56],[493,56],[480,72],[420,72]],'#4b55ff','#a7ffff',4);
  diamond(450,48,14,'#fff8a5','#ffffff');
  diamond(427,62,6,'#ff65ef');diamond(473,62,6,'#ff65ef');
  // Frame light strip.
  ctx.shadowColor='#6cfbff';ctx.shadowBlur=14;
  line(52,79,848,79,'#b5ffff',3);
  ctx.restore();
}

function drawIcon(kind:IconKind,x:number,y:number,size:number,bright:string,dark:string,rotation=0) {
  ctx.save();ctx.translate(x,y);ctx.rotate(rotation);const s=size;
  // Outer six-sided relic tile, dark bevel and colored inner face.
  pathPoly([[0,-s*.56],[s*.46,-s*.29],[s*.46,s*.29],[0,s*.56],[-s*.46,s*.29],[-s*.46,-s*.29]],'#10123d','#fff1a3',Math.max(1.5,s*.035));
  pathPoly([[0,-s*.43],[s*.34,-s*.22],[s*.34,s*.22],[0,s*.43],[-s*.34,s*.22],[-s*.34,-s*.22]],dark,bright,Math.max(1,s*.025));
  const lw=Math.max(2,s*.055);
  if(kind==='prism'){
    pathPoly([[0,-s*.34],[s*.22,-s*.04],[s*.16,s*.26],[0,s*.35],[-s*.16,s*.26],[-s*.22,-s*.04]],'#aa68ff','#fff',1.5);
    pathPoly([[0,-s*.34],[0,s*.35],[-s*.16,s*.26],[-s*.22,-s*.04]],'#6422b4');
    line(0,-s*.3,0,s*.28,'#fef4ff',1.5);diamond(0,s*.33,s*.08,'#ffc83d');
  } else if(kind==='cross'){
    rr(-s*.075,-s*.35,s*.15,s*.7,3,bright,'#ffffff',1.4);
    rr(-s*.29,-s*.09,s*.58,s*.18,3,bright,'#ffffff',1.4);
    diamond(0,0,s*.06,'#ffffff');
  } else if(kind==='orb'){
    ctx.shadowColor=bright;ctx.shadowBlur=12;
    const orbGlow=ctx.createRadialGradient(-s*.08,-s*.1,1,0,0,s*.24);
    orbGlow.addColorStop(0,'#ffffff');orbGlow.addColorStop(.24,bright);orbGlow.addColorStop(1,dark);
    circle(0,0,s*.21,orbGlow as unknown as string);
    ctx.shadowBlur=0;
    ctx.strokeStyle='#e7ffff';ctx.lineWidth=Math.max(2,s*.04);ctx.beginPath();ctx.ellipse(0,0,s*.35,s*.13,-.4,0,Math.PI*2);ctx.stroke();
    circle(-s*.08,-s*.08,s*.035,'#ffffff');
  } else if(kind==='staff'){
    // diagonal staff and oversized ember gem
    line(-s*.21,s*.31,s*.2,-s*.3,'#ffb33c',lw+2);line(-s*.21,s*.31,s*.2,-s*.3,'#fff0a2',Math.max(1,lw*.45));
    pathPoly([[s*.1,-s*.34],[s*.22,-s*.27],[s*.25,-s*.1],[s*.11,-s*.03],[s*.02,-s*.16]],'#ff3e1d','#fff3a4',1.5);
    circle(s*.14,-s*.2,s*.045,'#fff7c5');
    for(let i=0;i<3;i++)diamond(-s*.15+i*s*.07,s*.08+i*s*.05,s*.025,'#ff6d2d');
  } else if(kind==='sword'){
    pathPoly([[-s*.055,s*.22],[-s*.025,-s*.34],[0,-s*.42],[s*.07,-s*.34],[s*.055,s*.22]],'#fff7db','#ffffff',1.3);
    line(-s*.2,s*.13,s*.2,s*.13,'#ffbf4b',lw);
    rr(-s*.045,s*.18,s*.09,s*.18,2,'#a34c2a','#ffd46a',1);
    pathPoly([[-s*.08,-s*.3],[0,-s*.42],[s*.02,-s*.15]],'#ffffff');
  } else if(kind==='crown'){
    pathPoly([[-s*.31,-s*.02],[-s*.25,-s*.29],[-s*.09,-s*.12],[0,-s*.36],[s*.1,-s*.12],[s*.26,-s*.29],[s*.31,-s*.02],[s*.23,s*.21],[-s*.23,s*.21]],'#ffbd37','#fff5a6',2);
    line(-s*.22,s*.13,s*.22,s*.13,'#ffffff',2);diamond(0,s*.01,s*.055,'#ffffff');
  } else if(kind==='flame'){
    pathPoly([[0,s*.31],[-s*.24,s*.08],[-s*.17,-s*.16],[-s*.06,-s*.31],[0,-s*.15],[s*.12,-s*.32],[s*.22,-s*.04],[s*.18,s*.15]],'#ff4b23','#fff4a5',2);
    pathPoly([[0,s*.17],[-s*.09,s*.03],[0,-s*.11],[s*.08,s*.04]],'#ffe66b');
  } else if(kind==='axe'){
    line(-s*.03,-s*.25,s*.03,s*.3,'#ffe8a1',lw);
    pathPoly([[0,-s*.27],[s*.27,-s*.19],[s*.24,s*.03],[s*.07,s*.13],[0,s*.07]],'#d6efff','#fff',1.3);
  } else if(kind==='book'){
    pathPoly([[-s*.28,-s*.25],[-s*.03,-s*.18],[-s*.03,s*.25],[-s*.28,s*.18]],'#dcaaff','#fff',1.3);
    pathPoly([[s*.28,-s*.25],[s*.03,-s*.18],[s*.03,s*.25],[s*.28,s*.18]],'#9a52f0','#fff',1.3);
    line(0,-s*.18,0,s*.25,'#fff3d2',2);
  } else {
    pathPoly([[0,-s*.32],[s*.25,-s*.18],[s*.27,s*.09],[0,s*.31],[-s*.27,s*.09],[-s*.25,-s*.18]],'#4bdfff','#fff',2);
    pathPoly([[0,-s*.18],[s*.15,-s*.1],[s*.17,s*.06],[0,s*.2],[-s*.17,s*.06],[-s*.15,-s*.1]],'#225bda');
  }
  ctx.restore();
}

function drawMedallion(x:number,y:number,reward:Reward,scale=1,locked=false) {
  const r=67*scale, color=reward.color;
  ctx.save();ctx.translate(x,y);ctx.scale(scale,scale);
  // Two animated circular halos and cardinal sparkles.
  ctx.shadowColor=color;ctx.shadowBlur=18;
  ctx.strokeStyle=reward.bright;ctx.lineWidth=3;
  ctx.beginPath();ctx.arc(0,0,r+7,0,Math.PI*2);ctx.stroke();
  ctx.shadowBlur=0;
  ctx.strokeStyle=color;ctx.lineWidth=2;ctx.setLineDash([5,7]);ctx.lineDashOffset=-time*12;
  ctx.beginPath();ctx.arc(0,0,r+13,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);
  for(let a=0;a<4;a++){
    const ang=a*Math.PI/2+Math.PI/4;
    const sx=Math.cos(ang)*(r+12),sy=Math.sin(ang)*(r+12);
    diamond(sx,sy,5,'#fffbd0','#fff');
  }
  // thick dark hex, gold bevel and saturated inner gemstone
  pathPoly([[0,-r],[r*.78,-r*.47],[r*.78,r*.47],[0,r],[-r*.78,r*.47],[-r*.78,-r*.47]],'#0a103b','#fff1a0',4);
  pathPoly([[0,-r+8],[r*.67,-r*.41],[r*.67,r*.41],[0,r-8],[-r*.67,r*.41],[-r*.67,-r*.41]],color,'#ffffff',2);
  pathPoly([[0,-r+15],[r*.49,-r*.3],[r*.49,r*.3],[0,r-15],[-r*.49,r*.3],[-r*.49,-r*.3]],reward.dark, '#ffc95a',1.5);
  if (reward.image?.complete && reward.image.naturalWidth) ctx.drawImage(reward.image,-42,-42,84,84);
  else drawIcon(reward.icon,0,0,75,reward.bright,reward.dark);
  if(locked){ctx.shadowColor=reward.bright;ctx.shadowBlur=22;circle(0,0,47,'rgba(255,255,255,.05)');ctx.shadowBlur=0;}
  ctx.restore();
}

function drawReels() {
  if(phase==='idle'||phase==='intro') return;

  // Spotlight follows the next reel to land. The other lanes stay visible but less dominant.
  const xs = lanePositions(reels.length || selectedCount);
  const activeIndex = reels.findIndex(r => !r.stopped);
  if (phase === 'rolling' && activeIndex >= 0) {
    const x = xs[activeIndex];
    const pulse = 0.78 + 0.22 * Math.sin(time * 10);
    const spotlight = ctx.createLinearGradient(x, 95, x, 610);
    spotlight.addColorStop(0, `rgba(255,255,255,${0.10 * pulse})`);
    spotlight.addColorStop(0.42, `${laneColors[activeIndex]}${Math.round(42 * pulse).toString(16).padStart(2,'0')}`);
    spotlight.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = spotlight;
    ctx.fillRect(x - 64, 90, 128, 520);
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.shadowColor = laneColors[activeIndex]; ctx.shadowBlur = 18;
    line(x - 58, 100, x - 58, 385, `${laneColors[activeIndex]}aa`, 2);
    line(x + 58, 100, x + 58, 385, `${laneColors[activeIndex]}aa`, 2);
    ctx.restore();
  }

  // Every landed reward gets a short radial flare around its own medallion.
  for (let i = 0; i < reels.length; i++) {
    const p = revealPulse[i];
    if (p > 0.01) {
      const x = xs[i], y = 320, radius = 68 + (1 - p) * 72;
      ctx.save(); ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = p;
      const halo = ctx.createRadialGradient(x, y, 8, x, y, radius * 1.7);
      halo.addColorStop(0, `${laneColors[i]}88`); halo.addColorStop(0.45, `${laneColors[i]}38`); halo.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = halo; ctx.fillRect(x-radius*1.7,y-radius*1.7,radius*3.4,radius*3.4);
      ctx.strokeStyle = i % 2 === 0 ? '#fff6b0' : '#9afaff'; ctx.lineWidth = 3;
      ctx.shadowColor = laneColors[i]; ctx.shadowBlur = 24;
      ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI*2); ctx.stroke();
      // Crisp radial rays, not a curved ribbon.
      for (let k = 0; k < 16; k++) {
        const a = k * Math.PI * 2 / 16 + time * 0.25;
        const inner = 78, outer = 96 + (k % 3) * 12;
        ctx.strokeStyle = k % 3 === 0 ? `rgba(255,255,220,${p})` : `${laneColors[i]}cc`;
        ctx.lineWidth = k % 4 === 0 ? 3 : 1.5;
        ctx.beginPath(); ctx.moveTo(x + Math.cos(a)*inner, y + Math.sin(a)*inner);
        ctx.lineTo(x + Math.cos(a)*outer, y + Math.sin(a)*outer); ctx.stroke();
      }
      ctx.restore();
    }
  }

  for(let i=0;i<reels.length;i++){
    const r=reels[i], x=xs[i];
    const duration=r.stoppedAt;
    const progress=clamp(phase==='rolling'?phaseTime/duration:1);
    const offset=(r.strip.length-1)*CELL*easeOut(progress);
    const stopped=r.stopped||phase==='burst'||phase==='result';
    if(stopped){
      const pop=1+Math.sin(Math.min(1,r.pop)*Math.PI)*.12;
      drawMedallion(x,320,r.result,pop,true);
      txt(r.result.name,x,401,15,'#fff3c5','system-ui,sans-serif',900);
      txt(tierLabel(r.result.tier),x,423,13,r.result.tier==='LEGENDARY'?'#ffe66a':r.result.tier==='EPIC'?'#f2a7ff':r.result.tier==='RARE'?'#d8faff':'#ffffff','system-ui,sans-serif',900);
    } else {
      ctx.save();ctx.beginPath();ctx.rect(x-61,90,122,300);ctx.clip();
      const base=Math.floor(offset/CELL);
      for(let j=Math.max(0,base-5);j<=Math.min(r.strip.length-1,base+5);j++){
        const y=250-(j*CELL-offset);
        if(y<55||y>440)continue;
        const dist=Math.abs(y-250);
        ctx.globalAlpha=clamp(1-dist/270,.15,1);
        drawIcon(r.strip[j].icon,x,y,52,r.strip[j].bright,r.strip[j].dark,Math.sin(time*8+j)*.05);
      }
      ctx.globalAlpha=1;ctx.restore();
      // active lane central catch glow
      ctx.globalAlpha=.45;
      rr(x-57,250-39,114,78,10,'rgba(255,255,255,.08)',laneColors[i],1.5);
      ctx.globalAlpha=1;
    }
  }
}

function drawChest() {
  const bob=phase==='idle'?Math.sin(time*1.5)*3:0;
  const open=lid;
  ctx.save();ctx.translate(450,835+bob);
  // Big stage shadow.
  ctx.save();ctx.scale(1,.25);const sh=ctx.createRadialGradient(0,270,4,0,270,250);sh.addColorStop(0,'rgba(0,0,0,.7)');sh.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=sh;ctx.beginPath();ctx.ellipse(0,270,250,90,0,0,Math.PI*2);ctx.fill();ctx.restore();
  // opening light well
  if(open>.02){glow(0,-25-open*20,160+open*70,`rgba(255,246,153,${.8*open})`);glow(0,-30-open*25,115+open*55,`rgba(255,82,219,${.45*open})`);}
  // back silhouette and side volume
  ctx.shadowColor='#ff9e28';ctx.shadowBlur=18;
  pathPoly([[-146,-25],[-102,-64],[102,-64],[146,-25],[125,102],[0,133],[-125,102]],'#261044','#ffcb56',4);
  ctx.shadowBlur=0;
  pathPoly([[-146,-25],[-100,-53],[-91,78],[-125,102]],'#6c2369','#ffb844',2);
  pathPoly([[146,-25],[100,-53],[91,78],[125,102]],'#28104f','#ffb844',2);
  // front left/right facets
  pathPoly([[-133,-14],[0,17],[0,123],[-121,88]],'#d34836','#ffdd6e',3);
  pathPoly([[0,17],[133,-14],[121,88],[0,123]],'#75265c','#ffc94d',3);
  pathPoly([[-121,88],[0,123],[121,88],[102,111],[0,143],[-102,111]],'#1b123d','#ffb83d',3);
  // inset panels, thick beveled gold ribs
  pathPoly([[-108,-4],[-25,18],[-25,100],[-99,78]],'#8f2c46','#ffb848',2);
  pathPoly([[25,18],[108,-4],[99,78],[25,100]],'#4c1b53','#ffb848',2);
  pathPoly([[-13,18],[13,18],[13,125],[-13,125]],'#ffb837','#fff0a2',2);
  for(const side of [-1,1]){
    pathPoly([[side*115,-10],[side*99,-14],[side*95,82],[side*109,86]],'#ffcf57','#fff0a2',2);
    for(let k=0;k<3;k++)rr(side*105-3,5+k*26,7,9,1,'#fff0a2','#ffb22d',1);
  }
  // lid swings backward with top plane, front lip, side bevels
  ctx.save();ctx.translate(0,-25-open*90);ctx.rotate(-open*.56);
  ctx.shadowColor='#ffcf48';ctx.shadowBlur=16+open*20;
  pathPoly([[-148,-22],[-104,-72],[0,-92],[104,-72],[148,-22],[0,18]],'#9b2859','#fff0a0',4);
  ctx.shadowBlur=0;
  pathPoly([[-148,-22],[-104,-72],[0,-92],[0,-48],[-90,-21]],'#ffc64b','#fff6ad',2);
  pathPoly([[0,-92],[104,-72],[148,-22],[90,-21],[0,-48]],'#f37b38','#ffe99b',2);
  pathPoly([[-90,-21],[0,-48],[90,-21],[0,18]],'#ffdf67','#ffffff',2);
  line(-94,-57,-8,-78,'#fff8c8',4);line(8,-78,94,-57,'#fff8c8',4);
  if(open>.12){
    pathPoly([[-91,-21],[0,18],[91,-21],[75,-3],[0,34],[-75,-3]],'#fff7b7','#ffffff',2);
    pathPoly([[-75,-3],[0,34],[0,46],[-80,8]],'#ff5f51');
    pathPoly([[0,34],[75,-3],[80,8],[0,46]],'#bf31aa');
  }
  ctx.restore();
  // Oversized front lock and ruby
  pathPoly([[-29,25],[0,15],[29,25],[25,66],[0,81],[-25,66]],'#ffca47','#fff3a5',3);
  pathPoly([[-16,31],[0,25],[16,31],[13,57],[0,66],[-13,57]],'#b91e4e','#ffefb2',2);
  rr(-7,37,14,15,2,'#ff5649','#fff3b7',1.5);
  // Gold corner blocks create chunky pixel-art volume.
  for(const sx of [-1,1])for(const sy of [-1,1]){
    rr(sx*111-12,sy>0?72:-19,24,25,3,'#ffcf55','#fff2a0',2);
    rr(sx*111-5,sy>0?79:-12,10,11,1,'#fff0a1');
  }
  ctx.restore();
}

function drawCoins(dt:number) {
  for(let i=particles.length-1;i>=0;i--){
    const p=particles[i];p.life-=dt;if(p.life<=0){particles.splice(i,1);continue;}
    p.vy+=p.g*dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.rot+=p.vr*dt;
    const alpha=clamp(p.life/(p.max*.24));
    ctx.save();ctx.globalAlpha=alpha;
    if(p.kind==='coin'){
      ctx.translate(p.x,p.y);ctx.rotate(p.rot);ctx.scale(Math.max(.12,Math.abs(Math.cos(p.rot*1.2))),1);
      ctx.shadowColor='#ffc32c';ctx.shadowBlur=0;
      circle(0,0,p.size,'#fff078','#a94b10',Math.max(1,p.size*.17));
      ctx.shadowBlur=0;circle(0,0,p.size*.68,'#ffb71e','#fff6a2',Math.max(1,p.size*.1));
      diamond(0,0,p.size*.35,'#ffe98b');
    }else if(p.kind==='gem'){
      ctx.translate(p.x,p.y);ctx.rotate(p.rot);
      pathPoly([[0,-p.size*1.8],[p.size*.75,0],[0,p.size*1.8],[-p.size*.75,0]],p.color,'#fff',1.5);
      pathPoly([[0,-p.size*1.8],[0,p.size*1.8],[-p.size*.75,0]],'#ffffff88');
    }else if(p.kind==='sliver'){
      ctx.translate(p.x,p.y);ctx.rotate(p.rot);
      pathPoly([[-p.size*.35,-p.size*1.7],[p.size*.35,-p.size*1.7],[p.size*.55,p.size*1.7],[-p.size*.55,p.size*1.7]],p.color,'#fff6c8',1.2);
    }else{
      ctx.translate(p.x,p.y);ctx.rotate(p.rot);ctx.shadowColor=p.color;ctx.shadowBlur=0;
      circle(0,0,p.size,p.color);
      line(-p.size*2,0,p.size*2,0,'#ffffff',1.5);line(0,-p.size*2,0,p.size*2,'#ffffff',1.5);
    }
    ctx.restore();
  }
  // Continuous little treasure spill during the climax only.
  if(phase==='burst'&&time>nextCoin){burst(rand(140,760),rand(690,825),2,'coin');nextCoin=time+.07;}
}


function drawLabels(){
  if(phase==='idle'){txt('星界秘藏宝箱',450,25,15,'#fff6a4');txt(`${selectedCount} 道光柱 · 一箱秘藏`,450,965,12,'#b8baff');return;}
  if(phase==='intro')txt('秘藏之力正在苏醒',450,25,14,'#fff4b3');
  else if(phase==='opening')txt('秘藏之力全面爆发',450,25,14,'#fff4b3');
  else if(phase==='rolling')txt(`${selectedCount} 道命运之光正在揭晓`,450,25,14,'#fff4b3');
  else txt(`✦ 已获得 ${selectedCount} 件秘藏道具 ✦`,450,25,14,'#fff4b3');
  if(phase==='result')txt('奖励已自动收入本局构筑',450,965,11,'#d9d6ff');
}
function update(dt:number){
  time+=dt;phaseTime+=dt;flash=Math.max(0,flash-dt*2.7);shake=Math.max(0,shake-dt*25);
  for(let i=0;i<revealPulse.length;i++) revealPulse[i]=Math.max(0,revealPulse[i]-dt*1.7);
  if(phase==='idle'&&Math.random()<dt*8)burst(rand(20,880),rand(0,960),1,'spark',['#fff3a2','#ff65e8','#6af5ff']);
  if(phase==='intro'&&phaseTime>settings.intro){
    phase='opening';onCue('open');phaseTime=0;flash=1;shake=0;triggerShake(24);
    tone(78,.7,'sawtooth',.065);tone(196,.6,'triangle',.055,.03);tone(880,.32,'sine',.04,.08);
    burst(450,790,80+selectedCount*16,'spark',['#fff','#fff7b0','#ff58e5','#6af6ff']);
    burst(450,780,45+selectedCount*9,'gem',['#fff7b0','#ff6ce8','#66f4ff']);
  }
  else if(phase==='opening'){
    lid=smooth(phaseTime/settings.opening);
    if(Math.random()<dt*(50+selectedCount*10))burst(450+rand(-80,80),rand(760,825),3,'spark',['#fff','#fff3a2','#ff5fe4','#67f4ff','#ffb22e']);
    if(phaseTime>settings.opening){phase='rolling';phaseTime=0;flash=.7;shake=0;triggerShake(14);burst(450,750,20*selectedCount,'sliver',['#fff','#fff3a2','#ff5fe4','#67f4ff']);tone(523,.4,'triangle',.05);}
  } else if(phase==='rolling'){
    for(let i=0;i<reels.length;i++){
      const r=reels[i];
      if(!r.stopped&&phaseTime>=r.stoppedAt){
        r.stopped=true;r.pop=0;revealPulse[i]=1;onCue('reveal',i);
        flash=r.result.tier==='LEGENDARY'?.42:.24;
        shake=0;triggerShake(r.result.tier==='LEGENDARY'?10:5);
        const xs=lanePositions(reels.length);
        burst(xs[i],320,r.result.tier==='LEGENDARY'?55:30,'gem',[r.result.bright,r.result.color,'#fff']);
        burst(xs[i],320,12,'spark',['#ffffff',r.result.bright,laneColors[i]]);
        tone(350+i*95,.12,'triangle',.04);
      }
      if(!r.stopped){
        const tick=Math.floor(phaseTime*(13-i*1.45));
        if(tick!==r.lastTick){r.lastTick=tick;if(i===reels.findIndex(reel=>!reel.stopped))onCue('tick');tone(280+i*32,.035,'square',.009);}
      } else r.pop=Math.min(1,r.pop+dt*3);
    }
    const finalStop = reels.length ? reels[reels.length-1].stoppedAt : rollDuration;
    if(phaseTime>finalStop+settings.settle){
      phase='burst';onCue('finish');phaseTime=0;flash=1;shake=0;triggerShake(19);
      burst(450,760,80*selectedCount,'coin');
      burst(450,730,50*selectedCount,'spark',['#fff','#fff5a8','#ffb72f','#ff59e9','#63f6ff']);
      burst(450,730,34*selectedCount,'gem',['#fff5a8','#ff59e9','#63f6ff']);
      fanfare();
    }
  } else if(phase==='burst'&&phaseTime>settings.finale){phase='result';phaseTime=0;}
}
/** Responsive stage: rewards above the chest, all drawing fills the available area. */
function drawModal() {
  const h = canvas.height, w = canvas.width;
  const centerX = w / 2, chestY = h * .80;
  const chestScale = Math.min(w / 850, h / 760);
  const active = phase !== 'idle' && phase !== 'intro';
  const climax = phase === 'opening' || phase === 'burst';
  const energy = climax ? 1 : phase === 'rolling' ? .72 : phase === 'result' ? .5 : 0;
  ctx.clearRect(0,0,w,h);ctx.save();
  // Transparent stage lets the light spill beyond the framed panel.
  if (energy) {
    const aura=ctx.createRadialGradient(centerX,chestY,5,centerX,chestY,Math.max(w,h)*.85);
    aura.addColorStop(0,`rgba(255,255,195,${energy})`);
    aura.addColorStop(.35,`rgba(255,207,45,${energy*.5})`);
    aura.addColorStop(1,'rgba(255,203,38,0)');ctx.fillStyle=aura;ctx.fillRect(0,0,w,h);
    ctx.save();ctx.globalCompositeOperation='screen';
    for(let i=0;i<settings.rays;i++){
      const angle=i*Math.PI*2/settings.rays+time*.16;
      const length=Math.max(w,h)*1.2;
      const spread=.025+(i%3)*.012;
      pathPoly([[centerX,chestY],[centerX+Math.cos(angle-spread)*length,chestY+Math.sin(angle-spread)*length],[centerX+Math.cos(angle+spread)*length,chestY+Math.sin(angle+spread)*length]],`rgba(255,245,167,${energy*(i%2?.07:.16)})`);
    }ctx.restore();
  }
  ctx.save();
  const kick=shake*Math.min(w,h)/988;
  if(kick)ctx.translate(Math.sin(time*87)*kick,Math.cos(time*113)*kick*.65);
  if(active){
    const spacing=Math.min(w*.88/selectedCount,selectedCount===1?320:260), top=h*.28;
    // A lane is one ray from the chest through its final reward center.
    const beamX=(laneX:number,y:number)=>centerX+(laneX-centerX)*(chestY-y)/(chestY-top);
    for(let i=0;i<selectedCount;i++){
      const x=centerX+(i-(selectedCount-1)/2)*spacing;
      const width=spacing*(selectedCount>=3?1.04:.94);
      const upperX=beamX(x,0);
      ctx.save();ctx.globalCompositeOperation='screen';
      const beam=ctx.createLinearGradient(x,0,x,chestY);
      beam.addColorStop(0,laneColors[i]+'88');beam.addColorStop(.4,laneColors[i]+'dd');beam.addColorStop(1,'#fff5aacc');
      ctx.shadowColor=laneColors[i];ctx.shadowBlur=selectedCount>=3?42:28;
      pathPoly([[centerX-30,chestY],[centerX+30,chestY],[upperX+width*.5,0],[upperX-width*.5,0]],beam);
      const core=ctx.createLinearGradient(upperX,0,centerX,chestY);
      core.addColorStop(0,'#ffffff00');core.addColorStop(.4,selectedCount>=3?'#fff5df99':'#fff5df66');core.addColorStop(1,'#ffffff00');
      pathPoly([[centerX-8,chestY],[centerX+8,chestY],[upperX+width*.16,0],[upperX-width*.16,0]],core);
      ctx.restore();
    }
    // Finish every beam before drawing rewards so neighboring light cannot wash out icons.
    for(let i=0;i<selectedCount;i++){
      const x=centerX+(i-(selectedCount-1)/2)*spacing;
      const reel=reels[i];
      const scale=Math.min(spacing/165,h/510,1.4);
      const stopped=reel?.stopped||phase==='burst'||phase==='result';
      if(stopped){
        drawMedallion(x,top,rewards[i],scale*(1+Math.sin(Math.min(1,reel?.pop??1)*Math.PI)*.16),true);
        const labelSize=Math.min(24,spacing/7);
        // Short rows keep the actual reward readable even with five lanes.
        const chars=Math.max(4,Math.floor(spacing/labelSize)-1);
        rr(x-spacing*.46,top+92*scale-labelSize*.7,spacing*.92,Math.ceil(rewards[i].name.length/chars)*labelSize*1.2+labelSize*.5,8,'#17112bc9');
        for(let start=0;start<rewards[i].name.length;start+=chars)
          txt(rewards[i].name.slice(start,start+chars),x,top+92*scale+(start/chars)*labelSize*1.2,labelSize,'#fff8df');
      } else if(phase==='rolling') {
        const bottom=h*.53, half=spacing*.48;
        ctx.save();ctx.beginPath();
        ctx.moveTo(beamX(x,0)-half,0);ctx.lineTo(beamX(x,0)+half,0);
        ctx.lineTo(beamX(x,bottom)+half,bottom);ctx.lineTo(beamX(x,bottom)-half,bottom);ctx.closePath();ctx.clip();
        const size=134*scale, cell=size*1.4;
        const progress=clamp(phaseTime/(reel?.stoppedAt??settings.roll));
        // Constant readable motion followed by a distinct braking phase.
        const travel=progress<.65?progress/.825:1-(1-progress)**2/(.7*.825);
        const steps=reel.strip.length-1;
        const offset=travel*steps*cell;
        const base=Math.floor(offset/cell);
        for(let j=base-3;j<=base+3;j++){
          const y=top+j*cell-offset;
          const index=((j%steps)+steps)%steps;
          const reward=reel.strip[index];
          ctx.globalAlpha=clamp(1-Math.abs(y-top)/(h*.38),.18,1);
          // Same art, centerline and scale on both sides of the final stop.
          drawMedallion(beamX(x,y),y,j===steps?rewards[i]:reward,scale);
        }
        ctx.restore();
        rr(x-spacing*.43,top-cell*.46,spacing*.86,cell*.92,12,'#100d3b22','#fff2bd99',2);
        pathPoly([[x-spacing*.48,top-10],[x-spacing*.38,top],[x-spacing*.48,top+10]],'#fff5bb');
      }
      const pulse=revealPulse[i];
      if(pulse>0){ctx.strokeStyle='#fff8bf';ctx.lineWidth=3;ctx.globalAlpha=pulse;ctx.beginPath();ctx.arc(x,top,spacing*.4+(1-pulse)*spacing*.35,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=1;}
    }
    // Orbiting light ribbons and expanding shock rings emphasize the opening impact.
    ctx.save();ctx.globalCompositeOperation='screen';
    for(let i=0;i<3;i++){
      const r=(.2+((time*.65+i/3)%1))*Math.min(w,h)*.7;
      ctx.globalAlpha=(1-((time*.65+i/3)%1))*energy*.65;
      ctx.strokeStyle=i%2?'#fffde1':'#ffe268';ctx.lineWidth=4+i*2;
      ctx.beginPath();ctx.ellipse(centerX,chestY-h*.1,r,r*.32,time*.25,0,Math.PI*2);ctx.stroke();
    }ctx.restore();
  }
  ctx.save();ctx.translate(centerX,chestY);ctx.scale(chestScale,chestScale);ctx.translate(-450,-835);drawChest();ctx.restore();
  if(active){
    // Bounded deterministic particles: no per-frame allocations or shadow blur.
    const count=phase==='result'?12+settings.count*4:settings.particles;
    for(let i=0;i<count;i++){
      const seed=(i*0.61803398875)%1;
      const cycle=(time*(.45+seed*.3)+seed)%1;
      const angle=-Math.PI*.94+((i*0.381966)%1)*Math.PI*.88;
      const travel=cycle*Math.min(w,h)*1.35;
      const x=centerX+Math.cos(angle)*travel;
      const y=chestY+Math.sin(angle)*travel+cycle*cycle*h*.45;
      ctx.globalAlpha=Math.min(1,(1-cycle)*3)*Math.max(.4,energy);
      ctx.save();ctx.translate(x,y);ctx.rotate(time*3+i);
      if(i%5===0){const reward=rewards[i%rewards.length];if(reward.image?.complete&&reward.image.naturalWidth)ctx.drawImage(reward.image,-13,-13,26,26);else diamond(0,0,8,'#fff8c7');}
      else {ctx.fillStyle=i%2?'#ffd24f':'#fff4ad';ctx.fillRect(-3,-8,6,16);ctx.fillStyle='#a77024';ctx.fillRect(3,-7,2,14);}
      ctx.restore();
    }ctx.globalAlpha=1;
  }
  ctx.restore();
  if(flash>0){ctx.fillStyle=`rgba(255,252,200,${flash*.48})`;ctx.fillRect(0,0,w,h);}
  ctx.restore();
}
function drawAllWithDelta(dt:number){
  if(modal){drawModal();return;}
  // render scene, then advance particles using the current frame delta
  ctx.save();if(shake>0)ctx.translate(rand(-shake,shake),rand(-shake,shake));
  if (modal) { ctx.fillStyle='#4b4d70'; ctx.fillRect(0,0,W,H); } else drawBackground();
  if (!modal || phase !== 'idle') { drawPanel();drawReels(); }
  if (modal && phase === 'idle') { ctx.save();ctx.translate(450,494);ctx.scale(1.8,1.8);ctx.translate(-450,-835);drawChest();ctx.restore(); } else drawChest();
  drawCoins(dt);
  if(phase==='opening'||phase==='burst'||phase==='result'){
    const power=phase==='opening'?1:phase==='burst'?1.2:.3;
    ctx.save();ctx.globalCompositeOperation='screen';
    // Wide triangular god-rays burst upward from the chest; no S/Z path is drawn.
    const rayProgress = phase === 'opening' ? smooth(phaseTime / .34) : phase === 'burst' ? 1 : .45;
    for(let i=0;i<25;i++){
      const a=-Math.PI+(i/24)*Math.PI;
      const inner=40+(i%4)*10, outer=(330+(i%6)*48)*rayProgress;
      const x1=450+Math.cos(a)*inner, y1=790+Math.sin(a)*inner;
      const x2=450+Math.cos(a)*outer, y2=790+Math.sin(a)*outer;
      ctx.strokeStyle=i%3===0?`rgba(255,255,220,${.92*power})`:i%3===1?`rgba(255,54,211,${.72*power})`:`rgba(67,220,255,${.72*power})`;
      ctx.lineWidth=i%4===0?6:2.5;ctx.shadowColor=ctx.strokeStyle;ctx.shadowBlur=20*power;
      line(x1,y1,x2,y2,ctx.strokeStyle,ctx.lineWidth);
    }
    // Bright central shaft ties the chest opening to the reward panel.
    const shaft=ctx.createLinearGradient(0,805,0,220);
    shaft.addColorStop(0,`rgba(255,255,220,${.48*power})`);
    shaft.addColorStop(.28,`rgba(255,190,58,${.28*power})`);
    shaft.addColorStop(.7,`rgba(255,77,218,${.12*power})`);
    shaft.addColorStop(1,'rgba(80,225,255,0)');
    pathPoly([[424,800],[476,800],[555,250],[345,250]],shaft);
    ctx.restore();
  }
  if (!modal) drawLabels();if(flash>0){ctx.fillStyle=`rgba(255,251,220,${flash*.72})`;ctx.fillRect(0,0,W,H);}ctx.restore();
}

let lastAge = -1;
if (!modal) begin();
const draw = (age: number) => { if (lastAge === age) return; const dt = lastAge < 0 ? 0 : Math.max(0, age - lastAge); lastAge = age; let remaining = dt; while (remaining > 0) { const step = Math.min(remaining, 1/60); update(step); remaining -= step; } drawAllWithDelta(dt); };
return Object.assign(draw, { redraw: () => drawAllWithDelta(0), open: () => { begin(); lastAge = -1; }, glow: () => phase === 'opening' ? .55 + .45 * Math.sin(clamp(phaseTime / settings.opening) * Math.PI) : phase === 'burst' ? .25 + .75 * (1 - smooth(phaseTime / settings.finale)) : phase === 'rolling' ? .38 : phase === 'result' ? .12 : phase === 'intro' ? .15 * smooth(phaseTime / .45) : 0, inspect: () => ({ phase, count:selectedCount, stopped:reels.filter(r=>r.stopped).length, rollingPoolSize:rollingItems.length, rollingTitles:[...new Set(reels.flatMap(r=>r.strip.slice(0,-1).map(item=>item.name)))], results:reels.map(r=>r.result.name), settings }), done: () => phase === 'result' });
}
