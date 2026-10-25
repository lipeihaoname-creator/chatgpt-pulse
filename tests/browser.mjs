// Uses an existing Playwright installation and an isolated Chrome profile.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const modulePath=process.env.PULSE_PLAYWRIGHT_MODULE;
const {chromium}=modulePath?await import(pathToFileURL(modulePath)):await import('playwright');
await mkdir('test-results',{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1280,height:950},deviceScaleFactor:1});
const errors=[],external=[],passed=[];
const pending=new Set();
page.on('request',r=>pending.add(r.url()));
page.on('requestfinished',r=>pending.delete(r.url()));
page.on('requestfailed',r=>pending.delete(r.url()));
page.on('pageerror',e=>errors.push(String(e)));
page.on('request',r=>{if(!r.url().startsWith('http://127.0.0.1:1420')&&!r.url().startsWith('data:'))external.push(r.url());});
try{
  try {
    await page.goto('http://127.0.0.1:1420/',{waitUntil:'networkidle'});
  } catch(error) {
    await writeFile('test-results/evidence/hardening-browser-load-failure.json',JSON.stringify({error:String(error),pending:[...pending],errors,external},null,2));
    throw error;
  }
  assert.match(await page.locator('h1').textContent(),/实时概览/);
  assert.equal(await page.locator('.metric-number').first().textContent(),'—Token/s');assert.match(await page.getByRole('region',{name:'工作状态'}).textContent(),/监测已暂停/);passed.push('Work state is primary and real metrics initially unavailable');
  await page.getByRole('button',{name:'开始监测'}).click();
  await page.getByRole('alert').waitFor();assert.match(await page.getByRole('alert').textContent(),/不能读取本地日志/);passed.push('Browser cannot silently monitor a client');
  await page.getByRole('button',{name:'关闭提示'}).click();
  await page.getByText('监测详情',{exact:true}).click();
  assert.equal(await page.getByRole('checkbox',{name:'自动跟随活跃日志'}).isChecked(),true);await page.getByRole('checkbox',{name:'自动跟随活跃日志'}).uncheck();assert.equal(await page.getByRole('combobox',{name:'日志会话'}).isEnabled(),true);passed.push('Automatic follow can be disabled for a pinned source');
  await page.getByRole('button',{name:'查看演示',exact:true}).click();
  await page.locator('.demo-banner').waitFor();assert.match(await page.getByRole('region',{name:'工作状态'}).textContent(),/处理中/);await page.getByRole('region',{name:'最近活动轨迹'}).getByText('任务开始',{exact:true}).waitFor();await page.waitForFunction(()=>document.querySelector('.metric-number')?.textContent==='32.0Token/s');
  assert.match(await page.locator('.demo-banner').textContent(),/演示/);assert.doesNotMatch(await page.locator('.metric-number').first().textContent(),/≈/);passed.push('Synthetic rates explicitly labelled; no character estimates');
  await page.waitForFunction(()=>document.querySelector('.poll-status')?.textContent.includes('已检查 2 次'));passed.push('One-second check heartbeat updates independently of usage');
  await page.screenshot({path:'test-results/dashboard.png',fullPage:true});
  await page.getByRole('button',{name:'偏好设置'}).click();
  assert.equal(await page.getByRole('checkbox',{name:'保留本地记录'}).isChecked(),false);
  assert.equal(await page.getByRole('checkbox',{name:'自动适应日志节奏'}).isChecked(),true);assert.equal(await page.getByRole('checkbox',{name:'完成结算卡'}).isChecked(),true);
  await page.getByRole('checkbox',{name:'自动适应日志节奏'}).uncheck();await page.getByRole('checkbox',{name:'完成结算卡'}).uncheck();
  assert.equal(await page.getByRole('combobox',{name:'无活动后隐藏旧速率'}).inputValue(),'30');
  await page.getByRole('combobox',{name:'无活动后隐藏旧速率'}).selectOption('60');
  await page.getByRole('checkbox',{name:'保留本地记录'}).check();
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('pulse-settings')).keep_history===true);
  await page.reload({waitUntil:'networkidle'});await page.getByRole('button',{name:'偏好设置'}).click();
  assert.equal(await page.getByRole('checkbox',{name:'保留本地记录'}).isChecked(),true);assert.equal(await page.getByRole('checkbox',{name:'自动适应日志节奏'}).isChecked(),false);assert.equal(await page.getByRole('checkbox',{name:'完成结算卡'}).isChecked(),false);await page.getByRole('checkbox',{name:'自动适应日志节奏'}).check();await page.getByRole('checkbox',{name:'完成结算卡'}).check();assert.equal(await page.getByRole('combobox',{name:'无活动后隐藏旧速率'}).inputValue(),'60');await page.getByRole('combobox',{name:'无活动后隐藏旧速率'}).selectOption('30');passed.push('Settings persist; recording opt-in');
  await page.getByRole('checkbox',{name:'保留本地记录'}).uncheck();
  await page.getByRole('button',{name:'本地记录'}).click();assert.match(await page.locator('main').textContent(),/记录未开启/);passed.push('Demo has no persisted session history');
  assert.equal(await page.getByRole('button',{name:'数据说明'}).count(),0);passed.push('Three concise pages; technical explanations moved to repository documentation');
  await page.getByRole('button',{name:'实时概览'}).click();
  await page.setViewportSize({width:390,height:844});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1));passed.push('Narrow screen has no horizontal overflow');
  await page.screenshot({path:'test-results/narrow.png',fullPage:true});
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);passed.push('No JavaScript errors or external network requests');
  await writeFile('test-results/browser.json',JSON.stringify({passed,errors,external,real_client_accessed:false},null,2));
  console.log(JSON.stringify({passed:passed.length,checks:passed,real_client_accessed:false},null,2));
}finally{await browser.close();}
