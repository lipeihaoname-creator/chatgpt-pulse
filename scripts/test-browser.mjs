import {readdir,mkdir,writeFile,readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import path from 'node:path';
await mkdir('test-results/evidence',{recursive:true});
// Exercise the same production assets embedded in the installer. A Vite HMR
// server adds unrelated first-load CSS/dependency requests and is not shipped.
const built=await new Promise((resolve,reject)=>{
 const child=spawn(process.execPath,['node_modules/vite/bin/vite.js','build'],{stdio:'ignore',windowsHide:true});
 child.on('error',reject);child.on('close',code=>resolve(code));
});
if(built!==0)throw Error('Production browser build failed');
const dist=path.resolve('dist');
const server=createServer(async(request,response)=>{
 try{
  const pathname=decodeURIComponent(new URL(request.url,'http://127.0.0.1').pathname);
  const target=path.resolve(dist,'.'+(pathname==='/'?'/index.html':pathname));
  if(!target.startsWith(dist+path.sep)){response.writeHead(403);response.end();return;}
  const body=await readFile(target);
  response.writeHead(200,{'Content-Type':{'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'}[path.extname(target)]||'application/octet-stream','Cache-Control':'no-store'});
  response.end(body);
 }catch{response.writeHead(404);response.end();}
});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(1420,'127.0.0.1',resolve);});
const results=[];
try{
 const files=['browser.mjs',...(await readdir('tests')).filter(f=>f.endsWith('.browser.mjs')).sort()];
 const selected=process.argv.slice(2); // Optional focused rerun after a failure.
 for(const file of files.filter(f=>!selected.length||selected.includes(f))){
  const result=await new Promise(resolve=>{
   const child=spawn(process.execPath,['tests/'+file],{stdio:['ignore','pipe','pipe']});let output='';
   child.stdout.on('data',c=>output+=c);child.stderr.on('data',c=>output+=c);
   const timeout=setTimeout(()=>child.kill(),180000);
   child.on('close',code=>{clearTimeout(timeout);resolve({file,passed:code===0,output});});
  });
  results.push(result);console.log((result.passed?'PASS ':'FAIL ')+file);if(!result.passed)console.error(result.output);
 }
 await writeFile('test-results/'+(selected.length?'browser-focused':'browser-suite')+'.json',JSON.stringify(results,null,2));
 process.exitCode=results.every(r=>r.passed)?0:1;
}finally{server.closeAllConnections();server.close();}
