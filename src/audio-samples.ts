/** User-supplied Boolean Productions assets; see the adjacent asset LICENSE.txt. */
export const AUDIO_SAMPLES={
  'capture-start':{file:'Magic_Abilities_MagicCharge_001.mp3',peak:.5},
  'capture-success':{file:'Feedback_Achievement_001.mp3',peak:.65},
  death:{file:'Feedback_Defeat_007.mp3',peak:.7},
  'treasure-open':{file:'Pickups_Items_TreasureChest_009.mp3',peak:.65},
  'treasure-coin':{file:'Pickups_Items_Coin_001.mp3',peak:.42},
  'treasure-gem':{file:'Pickups_Items_Gem_001.mp3',peak:.52},
} as const;
export type AudioSampleId=keyof typeof AUDIO_SAMPLES;

/** Trim silent padding and match peak levels without amplifying quiet/noisy files excessively. */
export function prepareAudioSample(context:AudioContext,decoded:AudioBuffer,targetPeak:number){
  let peak=0,first=decoded.length,last=-1;
  for(let channel=0;channel<decoded.numberOfChannels;channel++){
    const data=decoded.getChannelData(channel);
    for(let i=0;i<data.length;i++)peak=Math.max(peak,Math.abs(data[i]));
  }
  if(peak<.0001)return decoded;
  const threshold=Math.max(.0001,peak*.003);
  for(let channel=0;channel<decoded.numberOfChannels;channel++){
    const data=decoded.getChannelData(channel);
    for(let i=0;i<data.length;i++)if(Math.abs(data[i])>threshold){first=Math.min(first,i);last=Math.max(last,i);}
  }
  const margin=Math.ceil(decoded.sampleRate*.015);
  const start=Math.max(0,first-margin),end=Math.min(decoded.length,last+margin+1);
  const buffer=context.createBuffer(decoded.numberOfChannels,Math.max(1,end-start),decoded.sampleRate);
  const gain=Math.min(2,targetPeak/peak),fade=Math.max(1,Math.ceil(decoded.sampleRate*.004));
  for(let channel=0;channel<buffer.numberOfChannels;channel++){
    const source=decoded.getChannelData(channel),out=buffer.getChannelData(channel);
    for(let i=0;i<out.length;i++)out[i]=source[start+i]*gain*Math.min(1,i/fade,(out.length-1-i)/fade);
  }
  return buffer;
}
