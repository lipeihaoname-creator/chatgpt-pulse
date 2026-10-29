import {spectrumLines,spectrumWidth} from './music-animation.js';
import {cleanVisual} from './music-settings.js';
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,Number.isFinite(v)?v:a));
// Weighted bins include all 24 captured bands. Fewer strokes never discard
// alternating frequencies or manufacture stereo/time-domain waveform samples.
export function bandLevels(values,count=24){
 const input=Array.from({length:24},(_,i)=>clamp(values?.[i]));
 return Array.from({length:count},(_,i)=>{let total=0;const a=i*24/count,b=(i+1)*24/count;for(let k=Math.floor(a);k<Math.ceil(b);k++)total+=input[k]*Math.max(0,Math.min(b,k+1)-Math.max(a,k));return total/(b-a);});
}
export function spectrumColor(visual,index,count){
 const t=count>1?index/(count-1):.5;
 if(visual.color_mode==='theme')return 'currentColor';
 if(visual.color_mode==='solid')return visual.color;
 if(visual.color_mode==='rainbow')return `hsl(${(265-t*235).toFixed(1)} 85% 72%)`;
 const rgb=color=>[1,3,5].map(i=>parseInt(color.slice(i,i+2),16)),a=rgb(visual.color),b=rgb(visual.color2);
 return '#'+a.map((v,i)=>Math.round(v+(b[i]-v)*t).toString(16).padStart(2,'0')).join('');
}
// Remove part of the shared visual floor so nearby measured bands do not
// all look equally tall. This is monotone and never invents band variation.
// One reference is shared by live bars and held peaks to keep markers ordered.
export function contrastBands(values,peaks,contrast=2,gain=1){
 const sorted=values.map(n=>clamp(n)).sort((a,b)=>a-b);
 const reference=sorted[Math.floor(Math.max(0,sorted.length-1)*.2)]||0;
 const amount=clamp((contrast-1)/2);
 const floor=reference*.85*amount*(2-amount);
 const scale=n=>{const level=clamp((clamp(n)-floor)/(1-floor));return gain<=1?level*gain:level*gain/(1+(gain-1)*level);};
 return {values:values.map(scale),peaks:peaks.map(scale)};
}
const pointDistance=(p,l)=>{const x=l.x2-l.x1,y=l.y2-l.y1,d=x*x+y*y,t=d?clamp(((p[0]-l.x1)*x+(p[1]-l.y1)*y)/d):0;return Math.hypot(p[0]-l.x1-t*x,p[1]-l.y1-t*y);};
const gap=(a,b)=>Math.min(pointDistance([a.x1,a.y1],b),pointDistance([a.x2,a.y2],b),pointDistance([b.x1,b.y1],a),pointDistance([b.x2,b.y2],a));
export function spectrumShape(style,levels,peaks,{avatar=false,clearance=0,mix,visual={}}={}){
 const v=cleanVisual(visual),count=v.density;
 const arrange=input=>{const half=bandLevels(input,v.mirror?count/2:count);return v.mirror?[...half.slice().reverse(),...half]:half;};
 let values=arrange(levels),held=arrange(peaks);
 ({values,peaks:held}=contrastBands(values,held,v.contrast,v.gain));
 const layout=mix??(['arc','dots'].includes(style)?1:0);
 const geometry=a=>spectrumLines(layout,a,{avatar,clearance}).map((line,i)=>{
  let y1=line.y1,y2=line.y1+(line.y2-line.y1)*v.height;
  if(style==='mirror'){const center=avatar?118+8*clearance:18,extent=Math.min(.5+Math.pow(a[i],1.6)*(avatar?7:11)*v.height,avatar?12-4*clearance:16);y1=center-extent;y2=center+extent;}
  return {...line,y1:clamp(y1,avatar?Math.max(1,118*clearance):1,avatar?134:35),y2:clamp(y2,avatar?Math.max(1,118*clearance):1,avatar?134:35)};
 });
 const lines=geometry(values),tips=geometry(held);
 const strokes=lines.map((line,i)=>{
  const separation=Math.min(i?gap(lines[i-1],line):Infinity,i<count-1?gap(line,lines[i+1]):Infinity);
  const width=Math.min(v.width*spectrumWidth(layout,i,count,avatar?clearance:1)/2.6,separation*.84);
  return {...line,width:Math.max(.5,width),color:spectrumColor(v,i,count),radius:Math.min(2.4,Math.max(.65,width*.5+values[i]*.6)),tip:tips[i],peak:v.peaks&&held[i]>values[i]+.035};
 });
 const points=lines.map(l=>[l.x2,l.y2]);
 const path=points.map((p,i)=>{
  if(!i)return `M${p[0].toFixed(3)},${p[1].toFixed(3)}`;
  const a=points[i-1],mid=(a[0]+p[0])/2;return `C${mid.toFixed(3)},${a[1].toFixed(3)} ${mid.toFixed(3)},${p[1].toFixed(3)} ${p[0].toFixed(3)},${p[1].toFixed(3)}`;
 }).join(' ');
 const base=avatar?118+16*clearance:29,area=path+` L${points.at(-1)[0]},${base} L${points[0][0]},${base} Z`;
 return {strokes,path,area,visual:v};
}
