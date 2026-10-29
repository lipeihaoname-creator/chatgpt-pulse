// Optional network-free production-asset renderer. No network permission change.
import {chromium as actualChromium,webkit} from 'playwright';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
const dist=path.resolve('dist');
async function attach(context){
 await context.route('http://127.0.0.1:1420/**',async route=>{
  const pathname=decodeURIComponent(new URL(route.request().url()).pathname);
  const file=path.resolve(dist,'.'+(pathname==='/'?'/index.html':pathname));
  if(!file.startsWith(dist+path.sep))return route.abort();
  try {await route.fulfill({body:await readFile(file),contentType:{'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'}[path.extname(file)]||'application/octet-stream'});}catch{await route.fulfill({status:404,body:''});}
 });
 return context;
}
export const chromium={async launch(options){
 const browser=await actualChromium.launch(options);
 const newContext=browser.newContext.bind(browser),newPage=browser.newPage.bind(browser);
 browser.newContext=async options=>attach(await newContext(options));
 browser.newPage=async options=>{const page=await newPage(options);await attach(page.context());return page;};
 return browser;
}};
export {webkit};
