import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {spawn} from 'node:child_process';
import {once} from 'node:events';

test('Escritorio/móvil: guarniciones → y de las carnes → consulta completa, sin mostrar todo el menú ni alterar el pedido',async()=>{
 const server=spawn(process.execPath,['scripts/dev.mjs'],{env:{...process.env,PORT:'5221'},stdio:['ignore','pipe','pipe']});let browser;
 try{
  await once(server.stdout,'data');browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
  for(const width of [1440,390]){
   const page=await browser.newPage({viewport:{width,height:950}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto('http://127.0.0.1:5221');await page.getByRole('heading',{name:'Buena atención, todos los días.'}).waitFor();
   await page.evaluate(()=>{
    const data=JSON.parse(localStorage.getItem('el-viejo-demo-v1'));
    data.conversations[0].cart.service='buffet';
    data.menus=[{id:crypto.randomUUID(),day:new Intl.DateTimeFormat('en-CA',{timeZone:'America/Asuncion',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),status:'published',items:[{id:'arroz',name:'Arroz',category_id:'guarniciones',available:true},{id:'pure',name:'Puré de papas',category_id:'guarniciones',available:true},{id:'carne',name:'Tapa asado al horno',category_id:'carne',available:true},{id:'agotado',name:'Estofado de carne',category_id:'carne',available:false},{id:'pollo',name:'Milanesa de pollo',category_id:'pollo_chancho',available:true},{id:'pendiente',name:'Por revisar',category_id:'pending',available:false}]}];
    localStorage.setItem('el-viejo-demo-v1',JSON.stringify(data));
   });
   await page.locator('#refresh').click();if(width===390)await page.locator('#mobileNav').click();await page.locator('[data-view="chats"]').click();await page.locator('.chat-preview').first().click();
   const say=async text=>{await page.locator('#simulateForm input').fill(text);await page.getByRole('button',{name:'Simular mensaje',exact:true}).click();};
   const state=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('el-viejo-demo-v1'))),reply=()=>page.locator('.message.outbound .bubble').last().innerText();
   await say('dos arroz para retirar');const before=(await state()).conversations[0].cart;assert.equal(before.items[0].qty,2);
   await say('Cuales son las guarniciones del menu de hoy');assert.match(await reply(),/Puré de papas/);assert.doesNotMatch(await reply(),/Tapa asado|Milanesa/);assert.deepEqual((await state()).conversations[0].cart,before);
   for(const text of ['Y de las carnes?','Cuales son las carnes del menu de hoy?','¿Y las carnes?']){
    await say(text);assert.match(await reply(),/Tapa asado al horno/);assert.doesNotMatch(await reply(),/Arroz|Puré|Milanesa|Estofado|Por revisar|No entendí/);assert.deepEqual((await state()).conversations[0].cart,before);
   }
   // El siguiente mensaje consulta el menú vigente, sin conservar disponibilidad antigua.
   await page.evaluate(()=>{const data=JSON.parse(localStorage.getItem('el-viejo-demo-v1'));data.menus[0].items.find(p=>p.id==='carne').available=false;localStorage.setItem('el-viejo-demo-v1',JSON.stringify(data));});await page.locator('#refresh').click();await say('Y de las carnes?');assert.match(await reply(),/no hay productos disponibles en Carne/);assert.doesNotMatch(await reply(),/Arroz|Milanesa/);assert.deepEqual((await state()).conversations[0].cart,before);assert.equal((await state()).orders.length,0);assert.deepEqual(errors,[]);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.close();
  }
 }finally{await browser?.close();server.kill();}
});
