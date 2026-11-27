import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {join} from 'node:path';
import {tmpdir} from 'node:os';

test('Navegador: repetir pedido completo tras plato inexistente, sin acumular, en escritorio y móvil',async()=>{
 const server=spawn(process.execPath,['scripts/dev.mjs'],{cwd:new URL('../',import.meta.url),env:{...process.env,PORT:'5197'},stdio:['ignore','pipe','pipe']});
 let browser;
 try{
  await Promise.race([once(server.stdout,'data'),once(server,'exit').then(()=>{throw Error('No se inició la demo');})]);
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:1440,height:950}}),errors=[];
  page.setDefaultTimeout(5000);page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:5197');await page.getByRole('heading',{name:'Buena atención, todos los días.'}).waitFor();
  await page.evaluate(()=>{
   const data=JSON.parse(localStorage.getItem('el-viejo-demo-v1'));
   data.menus=[{id:crypto.randomUUID(),day:new Intl.DateTimeFormat('en-CA',{timeZone:'America/Asuncion',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),status:'published',items:[{id:'pollo',name:'Milanesa de pollo',category_id:'pollo_chancho',available:true},{id:'sopa',name:'Sopa paraguaya',category_id:'guarniciones',available:true},{id:'pure',name:'Puré de papas',category_id:'guarniciones',available:true}]}];
   localStorage.setItem('el-viejo-demo-v1',JSON.stringify(data));
  });
  await page.reload();await page.getByRole('heading',{name:'Buena atención, todos los días.'}).waitFor();
  await page.locator('[data-view="chats"]').click();await page.locator('.chat-preview').first().click();
  const simulate=async text=>{await page.locator('#simulateForm input').fill(text);await page.getByRole('button',{name:'Simular mensaje',exact:true}).click();};
  const state=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('el-viejo-demo-v1')));
  await simulate('buffet');await simulate('Puré de papas 3');await simulate('Milanesa de carne; Pure de papas');
  let data=await state();assert.deepEqual(data.conversations[0].cart.items,[]);assert.equal(data.conversations[0].cart.conversation.retry_order,true);
  assert.match(await page.locator('.message.outbound .bubble').last().innerText(),/pedido completo/);
  const guidance=await page.locator('.message.outbound .bubble').last().innerText();assert.match(guidance,/cantidad.*nombre completo.*variedad.*uno por línea/);assert.match(guidance,/Ejemplo de cómo escribirlo[\s\S]*2 Milanesa de pollo[\s\S]*1 Sopa paraguaya/);assert.equal(data.orders.length,0);
  await simulate('CONFIRMAR PEDIDO');assert.equal((await state()).orders.length,0);
  await simulate('Milanesa de pollo; Sopa');data=await state();
  assert.deepEqual(data.conversations[0].cart.items.map(item=>[item.variant_id,item.qty]),[['pollo',1],['sopa',1]]);
  for(const [width,height,label] of [[1440,950,'desktop'],[390,844,'mobile']]){
   await page.setViewportSize({width,height});if(label==='mobile')await page.waitForFunction(()=>document.getElementById('sidebar').getBoundingClientRect().right<=0);
   const summary=page.locator('.message.outbound .bubble').last();await summary.scrollIntoViewIfNeeded();
   const text=await summary.innerText();assert.match(text,/Milanesa de pollo/);assert.match(text,/Sopa paraguaya/);assert.doesNotMatch(text,/Puré|ajustar|Gs\./);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   await page.screenshot({path:join(tmpdir(),'buffet-pedido-nuevo-'+label+'.png'),fullPage:true});
  }
  assert.deepEqual(errors,[]);
 }finally{await browser?.close();server.kill();}
});
