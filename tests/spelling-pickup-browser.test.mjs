import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {join} from 'node:path';
import {tmpdir} from 'node:os';

test('Escritorio/móvil: pedido con errores, delivery rechazado en chipería y controles de CRM coherentes',async()=>{
 const server=spawn(process.execPath,['scripts/dev.mjs'],{cwd:new URL('../',import.meta.url),env:{...process.env,PORT:'5199'},stdio:['ignore','pipe','pipe']});let browser;
 try{
  await Promise.race([once(server.stdout,'data'),once(server,'exit').then(()=>{throw Error('No inició la demo');})]);
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:1440,height:950}}),errors=[];page.setDefaultTimeout(5000);page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:5199');await page.getByRole('heading',{name:'Buena atención, todos los días.'}).waitFor();
  await page.locator('[data-view="chats"]').click();await page.locator('.chat-preview').first().click();
  const say=async text=>{await page.locator('#simulateForm input').fill(text);await page.getByRole('button',{name:'Simular mensaje',exact:true}).click();};
  const cart=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('el-viejo-demo-v1')).conversations[0].cart);
  const reply=()=>page.locator('.message.outbound .bubble').last();
  await say('chipería');await say('2 sanwis de verdura');assert.equal((await cart()).subtotal,20000);assert.equal((await cart()).items[0].qty,2);
  await say('delivery');assert.equal((await cart()).fulfillment,'a_coordinar');assert.match(await reply().innerText(),/solo con retiro/);assert.doesNotMatch(await reply().innerText(),/Enviá tu ubicación/);
  for(const [width,height,label] of [[1440,950,'desktop'],[390,844,'mobile']]){
   await page.setViewportSize({width,height});if(label==='mobile')await page.waitForFunction(()=>document.getElementById('sidebar').getBoundingClientRect().right<=0);
   await reply().scrollIntoViewIfNeeded();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:join(tmpdir(),'ortografia-retiro-'+label+'.png'),fullPage:true});
  }
  await say('retiro');assert.equal((await cart()).fulfillment,'retiro');assert.match(await reply().innerText(),/CONFIRMAR PEDIDO/);
  await page.setViewportSize({width:1440,height:950});await page.locator('[data-view="settings"]').click();
  assert.equal(await page.locator('[name="delivery_mode_chiperia"]').count(),1);assert.equal(await page.locator('[name="delivery_mode_chiperia"]').inputValue(),'disabled');assert.equal(await page.locator('[name="delivery_mode_buffet"]').count(),3);
  await page.locator('[data-view="orders"]').click();await page.locator('[data-do="neworder"]').click();
  const fulfillment=page.locator('#dialogForm [name="fulfillment"]'),service=page.locator('#dialogForm [name="service"]');
  assert.deepEqual(await fulfillment.locator('option').evaluateAll(nodes=>nodes.map(n=>n.value)),['retiro']);
  await service.selectOption('buffet');assert.deepEqual(await fulfillment.locator('option').evaluateAll(nodes=>nodes.map(n=>n.value)),['retiro','delivery']);await fulfillment.selectOption('delivery');
  await service.selectOption('chiperia');assert.equal(await fulfillment.inputValue(),'retiro');assert.equal(await page.locator('#newOrderPoint').innerText(),'');
  assert.deepEqual(errors,[]);
 }finally{await browser?.close();server.kill();}
});
