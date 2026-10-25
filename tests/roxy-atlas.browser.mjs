import {assetUrl} from './production-assets.mjs';
// Render the actual PNGs on an opaque UI surface; transparent RGB bytes must
// not be mistaken for visible edge artifacts by a raw PNG previewer.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {chromium} from './playwright.mjs';
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage({viewport:{width:750,height:820}});
 await page.route('http://127.0.0.1:1420/__atlas',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><body></body></html>'}));
 await page.goto('http://127.0.0.1:1420/__atlas');
 const names=['平静','专注','思考','输出','工具','等你','完成','待确认','不可读'];
 await page.setContent(`<style>body{margin:0;background:#151a2b;color:#f5efdf;font:14px system-ui;padding:30px}main{display:grid;grid-template-columns:repeat(3,1fr);gap:24px}article{display:grid;place-items:center;gap:8px}.portrait{width:180px;height:180px;border-radius:50%;background-color:#2b3553;background-size:300% 300%;background-repeat:no-repeat;border:1px solid #b5c5ff40}h1{font-size:18px;font-weight:500;margin:0 0 24px}</style><h1>洛琪希 · 九种状态表情</h1><main>${names.map((name,i)=>`<article><div class="portrait" style="background-image:url(${assetUrl("src/assets/roxy/open.png")});background-position:${i%3*50}% ${Math.floor(i/3)*50}%"></div><span>${name}</span></article>`).join('')}</main>`,{waitUntil:'domcontentloaded'});
 const result=await page.evaluate(async frames=>{
  const results=[];
  for(const {frame,url} of frames){
   const image=new Image();image.src=url;await image.decode();
   const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
   const c=canvas.getContext('2d');c.drawImage(image,0,0);const pixels=c.getImageData(0,0,image.width,image.height).data;
   let opaque=0,transparent=0;const histogram={};for(let i=3;i<pixels.length;i+=4){if(pixels[i]===0)transparent++;if(pixels[i]>=250)opaque++;histogram[pixels[i]]=(histogram[pixels[i]]||0)+1;}
   results.push({frame,width:image.width,height:image.height,opaque,transparent,cornerAlpha:pixels[3],alphaExtremes:{zero:histogram[0],full:histogram[255],nearFull:histogram[254]}});
  }
  return results;
 },(process.argv.includes('--open-only')?['open']:['open','half','blink']).map(frame=>({frame,url:assetUrl(`src/assets/roxy/${frame}.png`)})));
 await page.screenshot({path:'test-results/roxy-expressions.png'});
 for(const frame of result){assert.equal(frame.width,frame.height);assert.equal(frame.width%3,0);assert.ok(frame.opaque>frame.width*frame.height*.25);assert.ok(frame.transparent>frame.width*frame.height*.1);assert.equal(frame.cornerAlpha,0);}
 await page.screenshot({path:'test-results/roxy-expressions.png'});
 await writeFile('test-results/roxy-atlas.json',JSON.stringify({passed:true,frames:result},null,2));console.log(JSON.stringify(result));
}finally{await browser.close();}
