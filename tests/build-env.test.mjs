import {test} from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,rmSync,realpathSync} from 'node:fs';import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';import {spawnSync} from 'node:child_process';
test('Fresh checkouts keep normal toolchain homes; project-local tools activate only when present',{skip:process.platform==='win32'},()=>{
 const folder=realpathSync(mkdtempSync(join(tmpdir(),'pulse-env-'))),script=resolve('scripts/env.sh');
 const read=()=>spawnSync('/bin/sh',['-c','. "$1"; printf "%s\\n%s\\n" "$CARGO_HOME" "$RUSTUP_HOME"','sh',script],{cwd:folder,env:{...process.env,CARGO_HOME:'/existing/cargo',RUSTUP_HOME:'/existing/rustup'},encoding:'utf8'});
 try{
  const fresh=read();assert.equal(fresh.status,0);assert.deepEqual(fresh.stdout.trim().split('\n'),['/existing/cargo','/existing/rustup']);
  mkdirSync(join(folder,'.tools/rustup/toolchains'),{recursive:true});
  const cached=read();assert.equal(cached.status,0);assert.deepEqual(cached.stdout.trim().split('\n'),[join(folder,'.tools/cargo'),join(folder,'.tools/rustup')]);
 }finally{rmSync(folder,{recursive:true,force:true});}
});
