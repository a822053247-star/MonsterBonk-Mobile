export type TreasureCue = 'open' | 'tick' | 'reveal' | 'finish';
/** Seconds; independent of game speed. Results wait for explicit continuation. */
export function treasurePresentation(count: number) {
  const n=Math.max(1,Math.min(5,Math.floor(count))),i=n-1;
  return { count:n, transition:.75, intro:.4, opening:.65, roll:[1.1,1.6,2.25,3,3.8][i], gap:[0,.18,.24,.3,.36][i], settle:.25, finale:[.55,.7,.9,1.15,1.45][i], particles:35+n*13, rays:8+n*3, shake:.25+n*.15 };
}
/** Deterministic bounded samples; same mixer, mute and voice lifecycle as combat audio. */
export function synthesizeTreasureCue(cue:TreasureCue,count:number,index:number,rate:number){
 const n=treasurePresentation(count).count;
 const seconds=cue==='tick'?.045:cue==='reveal'?.22:cue==='open'?.35:.45+n*.09;
 const data=new Float32Array(Math.ceil(rate*seconds));
 const base=cue==='open'?90+n*12:cue==='tick'?500+n*45:cue==='reveal'?660*2**(index/6):440;
 for(let i=0;i<data.length;i++){
  const t=i/rate,p=i/data.length;let value=0;
  if(cue==='finish'){
   const notes=[0,4,7,12,16];
   for(let k=0;k<n;k++){const local=t-k*.055;if(local>=0)value+=Math.sin(2*Math.PI*base*2**(notes[k]/12)*local)*Math.exp(-local*5)/Math.sqrt(n);}
  }else{const f=base*(cue==='open'?1+.8*p:1);value=Math.sin(2*Math.PI*f*t)+.2*Math.sin(4*Math.PI*f*t);}
  data[i]=Math.tanh(value)*Math.min(1,t/.005)*(1-p)**(cue==='tick'?3:1.6)*(cue==='tick'?.22:.55);
 }
 return data;
}
