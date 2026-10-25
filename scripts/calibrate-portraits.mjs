// Development-only geometry measurement; start the local preview first.
import {chromium} from '../tests/playwright.mjs';import {writeFile} from 'node:fs/promises';
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage();await page.goto('http://127.0.0.1:1420/');
 const result=await page.evaluate(async()=>{
  const size=160,out={};
  for(const role of ['mai','roxy']){
   const canv=document.createElement('canvas');canv.width=canv.height=size;const ctx=canv.getContext('2d',{willReadFrequently:true});
   const extract=async(name,cols,rows)=>{const img=new Image();img.src=`/src/assets/${role}/${name}.png`;await img.decode();const list=[];for(let i=0;i<cols*rows;i++){ctx.clearRect(0,0,size,size);ctx.drawImage(img,i%cols*img.width/cols,Math.floor(i/cols)*img.height/rows,img.width/cols,img.height/rows,0,0,size,size);list.push(ctx.getImageData(0,0,size,size).data);}return list;};
   const open=await extract('open',3,3),half=await extract('half',3,3),blink=await extract('blink',3,3),emotions=await extract('emotions-v1',4,3),reference=open[0];
   const samples=[];
   // Registration uses the silhouette and hair, excluding facial features.
   for(let y=12;y<125;y+=2)for(let x=10;x<150;x+=2)if(y<64||x<45||x>123)samples.push([x,y,(y*size+x)*4]);
   const fit=pixels=>{
    const score=(scale,dx,dy)=>{let error=0;for(const[x,y,k]of samples){const sx=Math.round((x-size/2-dx)/scale+size/2),sy=Math.round((y-size/2-dy)/scale+size/2),j=(sy*size+sx)*4,a=reference[k+3]/255,b=sx>=0&&sx<size&&sy>=0&&sy<size?pixels[j+3]/255:0;error+=Math.abs(a-b);if(a>.85&&b>.85)error+=(Math.abs(reference[k]-pixels[j])+Math.abs(reference[k+1]-pixels[j+1])+Math.abs(reference[k+2]-pixels[j+2]))/255*.18;}return error/samples.length;};
    let best={scale:1,x:0,y:0,score:score(1,0,0)},original=best.score;
    for(const step of [.02,.005,.00125]){const center=best;for(let s=-2;s<=2;s++)for(let x=-2;x<=2;x++)for(let y=-2;y<=2;y++){const scale=center.scale+s*step,dx=center.x+x*step*size,dy=center.y+y*step*size;if(scale<.92||scale>1.08||Math.abs(dx)>size*.06||Math.abs(dy)>size*.06)continue;const n=score(scale,dx,dy);if(n<best.score)best={scale,x:dx,y:dy,score:n};}}
    return {transform:[+best.scale.toFixed(5),+(best.x/size*100).toFixed(3),+(best.y/size*100).toFixed(3)],before:+original.toFixed(4),after:+best.score.toFixed(4)};
   };
   out[role]={work:open.map(fit),half:half.map(fit),blink:blink.map(fit),emotions:Array.from({length:4},(_,i)=>[fit(emotions[i]),fit(emotions[i+4]),fit(emotions[i+8])])};
  }return out;
 });await writeFile('test-results/portrait-registration-measured.json',JSON.stringify(result,null,2));console.log('Portrait calibration measurements saved to test-results/portrait-registration-measured.json');
}finally{await browser.close();}
