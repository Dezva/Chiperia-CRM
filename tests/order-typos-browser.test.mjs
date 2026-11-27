import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {join} from 'node:path';
import {tmpdir} from 'node:os';

test('Navegador: pedido con errores y artículos repetidos, resumen legible en escritorio y móvil',async()=>{
 const server=spawn(process.execPath,['scripts/dev.mjs'],{cwd:new URL('../',import.meta.url),env:{...process.env,PORT:'5196'},stdio:['ignore','pipe','pipe']});
 let browser;
 try{
  await Promise.race([once(server.stdout,'data'),once(server,'exit').then(()=>{throw Error('No se inició la demo');})]);
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:1440,height:950}}),errors=[];
  page.setDefaultTimeout(5000);page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:5196');await page.getByRole('heading',{name:'Buena atención, todos los días.'}).waitFor();
  await page.locator('[data-view="chats"]').click();await page.locator('.chat-preview').first().click();
  const simulate=async text=>{await page.locator('#simulateForm input').fill(text);await page.getByRole('button',{name:'Simular mensaje',exact:true}).click();};
  await simulate('chipería');
  // El simulador tiene un campo de una línea. El worker prueba la captura con saltos reales.
  await simulate('Tradicional argolla 2; Sandwidch de verdura 1; Empanada de jamon y queso 5; Sanwi verdura 2');
  assert.match(await page.locator('.message.outbound .bubble').last().innerText(),/3 × Sándwich.*Verdura/);
  await simulate('Tradicional argolla 2; Sandwich de verdura 3; Empanada de jamon y queso 5');
  const state=await page.evaluate(()=>JSON.parse(localStorage.getItem('el-viejo-demo-v1')));
  assert.deepEqual(state.conversations[0].cart.items.map(item=>[item.variant_id,item.qty]),[['tradicional-argolla-base',2],['sandwich-verdura',3],['empanada-jamon-y-queso',5]]);
  assert.equal(state.conversations[0].cart.subtotal,70000);
  for(const [width,height,label] of [[1440,950,'desktop'],[390,844,'mobile']]){
   await page.setViewportSize({width,height});
   if(label==='mobile')await page.waitForFunction(()=>document.getElementById('sidebar').getBoundingClientRect().right<=0);
   const summary=page.locator('.message.outbound .bubble').last();await summary.scrollIntoViewIfNeeded();
   const text=await summary.innerText();assert.match(text,/3 × Sándwich.*Verdura/);assert.match(text,/5 × Empanada.*Jamón y queso/);assert.match(text,/70\.000/);assert.doesNotMatch(text,/ajustar/);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   await page.screenshot({path:join(tmpdir(),'chiperia-pedido-errores-'+label+'.png'),fullPage:true});
  }
  assert.deepEqual(errors,[]);
 }finally{await browser?.close();server.kill();}
});
