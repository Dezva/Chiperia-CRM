import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {join} from 'node:path';
import {tmpdir} from 'node:os';

test('Navegador: conversación natural con consultas, notas, eliminación y reintento completo en móvil y escritorio',async()=>{
 const server=spawn(process.execPath,['scripts/dev.mjs'],{cwd:new URL('../',import.meta.url),env:{...process.env,PORT:'5198'},stdio:['ignore','pipe','pipe']});let browser;
 try{
  await Promise.race([once(server.stdout,'data'),once(server,'exit').then(()=>{throw Error('No se inició la demo');})]);
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:1440,height:950}}),errors=[];page.setDefaultTimeout(5000);page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:5198');await page.getByRole('heading',{name:'Buena atención, todos los días.'}).waitFor();
  await page.locator('[data-view="chats"]').click();await page.locator('.chat-preview').first().click();
  const simulate=async text=>{await page.locator('#simulateForm input').fill(text);await page.getByRole('button',{name:'Simular mensaje',exact:true}).click();};
  const state=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('el-viejo-demo-v1')));
  const cart=async()=>(await state()).conversations[0].cart;
  const reply=()=>page.locator('.message.outbound .bubble').last();
  await simulate('chipería');await simulate('Quiero dos empanadas de carne sin cebolla');const before=await cart();
  for(const text of ['Perfecto.','¿Dónde están ubicados?','¿Hasta qué hora atienden?','¿También tienen de pollo?']){await simulate(text);assert.deepEqual(await cart(),before,text);}
  assert.match(await reply().innerText(),/Pollo está disponible/);
  await simulate('Entonces agregame una de pollo');assert.equal((await cart()).items.length,2);
  await simulate('Quitame las empanadas');assert.equal((await cart()).items.length,2);await simulate('Pollo');assert.equal((await cart()).items.length,1);assert.equal((await cart()).items[0].notes,'sin cebolla');
  const saved=await cart();await simulate('¿Puedo pagar por transferencia?');assert.deepEqual(await cart(),saved);
  await simulate('retiro');
  for(const [width,height,label] of [[1440,950,'desktop'],[390,844,'mobile']]){
   await page.setViewportSize({width,height});if(label==='mobile')await page.waitForFunction(()=>document.getElementById('sidebar').getBoundingClientRect().right<=0);
   await reply().scrollIntoViewIfNeeded();const text=await reply().innerText();assert.match(text,/Observación: sin cebolla/);assert.match(text,/6\.000 Gs\. c\/u/);assert.match(text,/Retiro en el local/);assert.match(text,/aceptación final.*local/);assert.doesNotMatch(text,/a_coordinar|variant_id/);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:join(tmpdir(),'pulido-conversacion-'+label+'.png'),fullPage:true});
  }
  await simulate('Quiero tres tradicionales y una pizza');assert.deepEqual((await cart()).items,[]);assert.match(await reply().innerText(),/pizza/);assert.match(await reply().innerText(),/pedido completo/);
  await simulate('Un bollito');assert.equal((await cart()).items.length,1);assert.equal((await cart()).items[0].variant_id,'bollito-base');assert.equal((await state()).orders.length,0);
  assert.deepEqual(errors,[]);
 }finally{await browser?.close();server.kill();}
});
