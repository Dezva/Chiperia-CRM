import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

test('Lenguaje cotidiano en escritorio/móvil: pedido directo, menú natural, deliveri, Retiiro y CONFIRMAR',async()=>{
 const server=spawn(process.execPath,['scripts/dev.mjs'],{cwd:new URL('../',import.meta.url),env:{...process.env,PORT:'5211'},stdio:['ignore','pipe','pipe']});let browser;
 try{
  await Promise.race([once(server.stdout,'data'),once(server,'exit').then(()=>{throw Error('No inició la demo');})]);
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
  for(const [width,height,label,confirmation] of [[1440,950,'desktop','CONFIRMAR'],[390,844,'mobile','cOnFiRmAr']]){
   const context=await browser.newContext({viewport:{width,height}}),page=await context.newPage(),errors=[];page.setDefaultTimeout(7000);page.on('pageerror',e=>errors.push(e.message));
   await page.goto('http://127.0.0.1:5211');await page.getByRole('heading',{name:'Buena atención, todos los días.'}).waitFor();
   if(label==='mobile')await page.locator('#mobileNav').click();await page.locator('[data-view="chats"]').click();await page.locator('.chat-preview').first().click();
   if(label==='mobile')await page.waitForFunction(()=>document.getElementById('sidebar').getBoundingClientRect().right<=0);
   const say=async text=>{await page.locator('#simulateForm input').fill(text);await page.getByRole('button',{name:'Simular mensaje',exact:true}).click();};
   const state=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('el-viejo-demo-v1'))),cart=async()=>(await state()).conversations[0].cart,reply=()=>page.locator('.message.outbound .bubble').last();
   await say('una tarta de pollo');const initial=await cart();assert.equal(initial.service,'chiperia');assert.equal(initial.items[0].variant_id,'tarta-pollo');assert.equal(initial.items[0].qty,1);assert.equal(initial.subtotal,8000);assert.equal((await state()).orders.length,0);
   await say('quiero el menú del día');assert.match(await reply().innerText(),/Tradicional/);assert.deepEqual(await cart(),initial);
   await say('deliveri');assert.match(await reply().innerText(),/solo con retiro/);assert.deepEqual((await cart()).items,initial.items);
   await say('Retiiro');assert.equal((await cart()).fulfillment,'retiro');assert.match(await reply().innerText(),/CONFIRMAR/);assert.doesNotMatch(await reply().innerText(),/CONFIRMAR PEDIDO|No entendí/);
   await reply().scrollIntoViewIfNeeded();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:join(tmpdir(),'lenguaje-cotidiano-'+label+'.png'),fullPage:true});
   await say(confirmation);let orders=(await state()).orders;assert.equal(orders.length,1);assert.equal(orders[0].fulfillment,'retiro');assert.equal(orders[0].status,'pending');assert.equal(orders[0].subtotal,8000);assert.equal(orders[0].total,null);
   await say('CONFIRMAR');assert.equal((await state()).orders.length,1);assert.deepEqual(errors,[]);await context.close();
  }
 }finally{await browser?.close();server.kill();}
});
