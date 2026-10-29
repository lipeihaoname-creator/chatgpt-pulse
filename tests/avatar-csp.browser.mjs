import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {chromium} from './playwright.mjs';
const browser=await chromium.launch({channel:'chrome',headless:true});const errors=[],checks=[];
try{
 const page=await browser.newPage({viewport:{width:1160,height:1000}});page.on('pageerror',e=>errors.push(String(e)));
 await page.route('http://127.0.0.1:1420/',async route=>{await route.fulfill({body:await readFile('dist/index.html'),contentType:'text/html',headers:{'content-security-policy':"img-src 'self' asset: data:"}});});
 await page.goto('http://127.0.0.1:1420/',{waitUntil:'networkidle'});await page.getByRole('button',{name:'偏好设置'}).click();
 const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'导入图片',exact:true}).click();await (await chooser).setFiles('src-tauri/icons/128x128.png');
 const image=page.getByLabel('外观预览',{exact:true}).getByAltText('自定义头像',{exact:true});
 await image.waitFor({timeout:5000});assert.equal(await image.evaluate(el=>el.complete&&el.naturalWidth>0),true);
 assert.equal(await page.getByRole('combobox',{name:'角色头像',exact:true}).inputValue(),'custom');
 checks.push('Actual file chooser imports and renders a PNG under production img-src CSP without blob access');
 await page.reload({waitUntil:'networkidle'});await page.getByRole('button',{name:'偏好设置'}).click();await image.waitFor();assert.equal(await image.evaluate(el=>el.naturalWidth>0),true);
 checks.push('Imported image and selection persist across page restart');
 const before=await image.getAttribute('src');
 await page.getByLabel('导入头像图片',{exact:true}).setInputFiles({name:'broken.png',mimeType:'image/png',buffer:Buffer.from('not a png')});
 await page.getByRole('alert').filter({hasText:/图片|解码/}).waitFor();assert.equal(await image.getAttribute('src'),before);
 checks.push('Invalid image reports an actionable error while keeping the prior avatar');
 const bytes=await readFile('src-tauri/icons/128x128.png');
 await page.getByLabel('导入头像图片',{exact:true}).setInputFiles({name:'LOCAL.PNG',mimeType:'',buffer:bytes});
 await page.waitForFunction(()=>!document.querySelector('[role="alert"]'));
 assert.equal(await page.getByRole('combobox',{name:'角色头像',exact:true}).inputValue(),'custom');checks.push('Missing MIME type is accepted for a verified supported extension through the actual file input');
 const alphaPng=await page.evaluate(()=>{
  const canvas=document.createElement('canvas');canvas.width=384;canvas.height=384;const context=canvas.getContext('2d');const pixels=context.createImageData(384,384);
  for(let i=0;i<pixels.data.length;i+=65536)crypto.getRandomValues(pixels.data.subarray(i,Math.min(pixels.data.length,i+65536)));
  context.putImageData(pixels,0,0);return canvas.toDataURL('image/png').split(',')[1];
 });
 const beforeAlpha=await image.getAttribute('src');
 await page.getByLabel('导入头像图片',{exact:true}).setInputFiles({name:'alpha.png',mimeType:'image/png',buffer:Buffer.from(alphaPng,'base64')});
 await page.waitForFunction(before=>localStorage.getItem('pulse-custom-avatar')!==before,beforeAlpha);
 const highAlpha=await page.evaluate(async()=>{
  const encoded=localStorage.getItem('pulse-custom-avatar');const image=new Image();image.src=encoded;await image.decode();return {width:image.width,bytes:(encoded.length-22)*3/4};
 });assert.ok(highAlpha.width<=320&&highAlpha.bytes<=512*1024);
 checks.push('High-entropy alpha images are reduced to fit the native PNG limit');
 assert.deepEqual(errors,[]);await writeFile('test-results/avatar-csp-browser.json',JSON.stringify({passed:true,checks,errors},null,2));console.log(JSON.stringify({passed:true,checks,errors}));
}finally{await browser.close();}
