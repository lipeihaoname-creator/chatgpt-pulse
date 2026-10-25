// Collect the resolved Windows graph and local upstream license files; no network.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const readJson=file=>{
 const bytes=fs.readFileSync(file);
 // Windows PowerShell 5.1 native redirection produces UTF-16LE with a BOM.
 // Decode it losslessly; UTF-8, with or without its BOM, remains supported.
 const encoding=bytes[0]===0xff&&bytes[1]===0xfe?'utf16le':'utf8';
 return JSON.parse(bytes.toString(encoding).replace(/^\uFEFF/,''));
};
const meta=readJson(path.join(root,'.tools/windows-cargo-metadata.json'));
const nodes=new Map(meta.resolve.nodes.map(n=>[n.id,n]));
const reachable=new Set(),queue=[meta.resolve.root];
while(queue.length){const id=queue.pop();if(reachable.has(id))continue;reachable.add(id);queue.push(...(nodes.get(id)?.dependencies??[]));}
const packages=meta.packages.filter(p=>reachable.has(p.id)&&p.id!==meta.resolve.root).sort((a,b)=>a.name.localeCompare(b.name)||a.version.localeCompare(b.version));
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const lock=new Map();
for(const block of fs.readFileSync(path.join(root,'src-tauri/Cargo.lock'),'utf8').split('[[package]]')){
 const get=key=>block.match(new RegExp('^'+key+' = "([^"]+)"','m'))?.[1];
 if(get('name')&&get('version'))lock.set(get('name')+'@'+get('version'),get('checksum'));
}
const marker='\n=== Windows x86_64 dependency review (2026-10-24) ===\n';
const noticePath=path.join(root,'THIRD_PARTY_NOTICES.txt');
const original=fs.readFileSync(noticePath,'utf8').split(marker)[0];
const sections=[marker,'Resolved Windows build/runtime dependency graph. Original dependency terms remain applicable. This review does not grant character artwork distribution rights.\n'];
const inventory=[],missing=[];
let addedNotices=0;
for(const pkg of packages){
 const folder=path.dirname(pkg.manifest_path);
 const names=fs.readdirSync(folder).filter(n=>/^(licen[sc]e|copying|copyright)/i.test(n)&&fs.statSync(path.join(folder,n)).isFile());
 if(pkg.license_file){const file=path.resolve(folder,pkg.license_file);if(file.startsWith(folder+path.sep)&&fs.existsSync(file)&&!names.includes(path.relative(folder,file)))names.push(path.relative(folder,file));}
 const texts=names.map(n=>({name:n,bytes:fs.readFileSync(path.join(folder,n))}));
 const overrideNames={
  'alloc-stdlib':'alloc-stdlib-0.3.0-BSD-3-Clause.txt',
  'webview2-com':'webview2-rs-edc2caf-MIT.txt',
  'webview2-com-sys':'webview2-rs-edc2caf-MIT.txt',
  'webview2-com-macros':'webview2-rs-dffa41a-MIT.txt',
 };
 if(!texts.length&&overrideNames[pkg.name]){
  const rel='licenses/third-party/'+overrideNames[pkg.name],file=path.join(root,rel);
  if(fs.existsSync(file))texts.push({name:rel,bytes:fs.readFileSync(file)});
 }
 if(!texts.length&&pkg.name==='tauri-plugin'){
  const sibling=path.join(path.dirname(folder),'tauri-2.12.4');
  const ownVcs=readJson(path.join(folder,'.cargo_vcs_info.json'));
  const otherVcs=readJson(path.join(sibling,'.cargo_vcs_info.json'));
  if(ownVcs.git.sha1===otherVcs.git.sha1){
   for(const name of ['LICENSE-MIT','LICENSE-APACHE-2.0']){
    const rel='licenses/third-party/tauri-plugin-2.7.2-'+name+'.txt',bytes=fs.readFileSync(path.join(sibling,name));
    fs.writeFileSync(path.join(root,rel),bytes);
    texts.push({name:rel+' (same upstream repository commit)',bytes});
   }
  }
 }
 if(!texts.length&&pkg.license?.includes('MPL-2.0'))texts.push({name:'MPL-2.0.txt (included upstream license text)',bytes:fs.readFileSync(path.join(root,'licenses/third-party/MPL-2.0.txt'))});
 if(!pkg.license||!texts.length)missing.push({name:pkg.name,version:pkg.version,license:pkg.license,license_files:texts.length});
 const entry={name:pkg.name,version:pkg.version,license:pkg.license,repository:pkg.repository,source_url:'https://crates.io/api/v1/crates/'+pkg.name+'/'+pkg.version+'/download',license_files:texts.map(f=>({name:f.name,sha256:sha(f.bytes)}))};
 if(pkg.license?.includes('MPL-2.0')){
  const archive=pkg.name+'-'+pkg.version+'.crate',target=path.join(root,'licenses/mpl-sources',archive);
  const registry=path.basename(path.dirname(folder));
  const cached=path.join(root,'.tools/cargo/registry/cache',registry,archive);
  const source=fs.existsSync(target)?target:cached;
  if(!fs.existsSync(source))throw Error('Missing required MPL source archive: '+archive);
  const bytes=fs.readFileSync(source),digest=sha(bytes);
  if(digest!==lock.get(pkg.name+'@'+pkg.version))throw Error('MPL source checksum mismatch: '+archive);
  if(source!==target)fs.copyFileSync(source,target);
  entry.mpl_source={file:'mpl-sources/'+archive,sha256:digest};
 }
 if(!original.includes(pkg.name+' '+pkg.version+'\nLicense:')||texts.some(f=>!original.includes(f.bytes.toString('utf8')))){
  sections.push('\n'+'='.repeat(72)+'\n'+pkg.name+' '+pkg.version+'\nLicense: '+pkg.license+'\nSource: '+entry.source_url+'\n');
  for(const f of texts)sections.push('\n--- '+f.name+' ---\n'+f.bytes.toString('utf8')+'\n');
  addedNotices++;
 }
 inventory.push(entry);
}
const result={scope:'Resolved Windows x86_64 MSVC dependency graph, including build dependencies; frontend runtime remains in the existing inventory',target:'x86_64-pc-windows-msvc',reviewed:'2026-10-24',rust:inventory,missing_license_evidence:missing,added_notice_packages:addedNotices};
fs.writeFileSync(path.join(root,'licenses/windows-dependency-inventory.json'),JSON.stringify(result,null,2)+'\n');
fs.writeFileSync(noticePath,original+sections.join(''));
const baseInventoryPath=path.join(root,'licenses/dependency-inventory.json'),base=readJson(baseInventoryPath);
base.additional_platform_inventories={...base.additional_platform_inventories,'x86_64-pc-windows-msvc':'windows-dependency-inventory.json'};
fs.writeFileSync(baseInventoryPath,JSON.stringify(base,null,2)+'\n');
const summary={target:result.target,resolved_packages:inventory.length,missing_license_evidence:missing,mpl_archives_verified:inventory.filter(p=>p.mpl_source).map(p=>({name:p.name,version:p.version,sha256:p.mpl_source.sha256})),added_notice_packages:addedNotices};
fs.writeFileSync(path.join(root,'test-results/evidence/windows-license-review.json'),JSON.stringify(summary,null,2)+'\n');
const lines=[
 '# Windows 依赖证据 · 2026-10-24',
 '',
 '本机 x86_64-pc-windows-msvc 实际解析图：'+inventory.length+' 个 Rust 包（含构建依赖）。元数据声明与本地许可文本分别核对，不代表每个包都会独立链接到最终程序。',
 '',
 '清单：licenses/windows-dependency-inventory.json；通知：THIRD_PARTY_NOTICES.txt。原 Mac 清单保留，并链接此平台清单。前端 svelte 与 @tauri-apps/api 仍保留原许可。',
 '',
 '项目仍采用 PolyForm Noncommercial 1.0.0 + 内部使用附加许可。第三方依赖保持自己的许可，角色素材公开分发权仍待复核；本轮只做私人测试。',
 '',
 '5 份 MPL 原始 .crate 源码归档已逐项按 Cargo.lock 核验 SHA-256，并随 licenses/mpl-sources 提供；没有修改依赖源码。',
 '',
 'Tauri plugin 的缺失工作区许可，从相同仓库且相同提交的 tauri 2.12.4 源码归档收集；保留 MIT 和 Apache-2.0 文本。plist 的 LICENCE 文件按原文收集。',
 '',
 'Windows 原生主按钮代码只链接系统 User32；测试诊断另用系统 Shcore，均不捆绑这些系统 DLL。Rust/pnpm/.tools 是构建工具，不是最终软件运行依赖。',
 '',
 'NSIS 策略：currentUser、现有 icon.ico、简体中文/英语。默认离线版使用 WebView2 offlineInstaller，缺失运行时时无需再下载；小体积联网版使用 embedBootstrapper。已有运行时直接复用。没有购买签名。NSIS COPYING 随 licenses/tools 提供；不把构建工具链打进安装包。',
 '',
 '## 上游许可文本缺口',
 '',
 missing.length?'以下包已有 SPDX 声明，但还需取得相应提交的原工作区许可文本；不能标记许可证据完整。':'本次解析图中的许可声明与文本均已收集；此结论不包含素材公开分发权和 NSIS 工具最终复核。',
 '',
 ...missing.map(p=>'- '+p.name+' '+p.version+'：'+p.license),
 '',
 '可在普通 PowerShell 执行 scripts/windows-package.ps1。脚本只下载固定上游提交的许可文本到项目，补齐后才允许打包；不更换全局工具、不修改安全设置。',
 ];
fs.writeFileSync(path.join(root,'docs/WINDOWS_DEPENDENCIES.md'),lines.join('\n')+'\n');
console.log(JSON.stringify(summary,null,2));if(missing.length)process.exitCode=1;
