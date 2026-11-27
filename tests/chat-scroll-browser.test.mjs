import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';

test('Chat en escritorio y móvil: rueda, polling sin novedades, mensajes nuevos e historial conservan posición',async()=>{
 const server=spawn(process.execPath,['scripts/dev.mjs'],{env:{...process.env,PORT:'5220'},stdio:['ignore','pipe','pipe']});let browser;
 try{
  await once(server.stdout,'data');browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
  const seedPage=await browser.newPage();await seedPage.goto('http://127.0.0.1:5220');await seedPage.getByRole('heading',{name:'Buena atención, todos los días.'}).waitFor();
  const seed=await seedPage.evaluate(()=>JSON.parse(localStorage.getItem('el-viejo-demo-v1')));await seedPage.close();
  for(const width of [1440,390]){
   const page=await browser.newPage({viewport:{width,height:950}}),fixture=structuredClone(seed),conversation=fixture.conversations[0];fixture.pendingOrders=[];fixture.orders=[];
   let messages=Array.from({length:160},(_,i)=>({id:randomUUID(),conversation_id:conversation.id,direction:i%2?'outbound':'inbound',body:'Mensaje de historial '+i+' con texto para comprobar la posición de lectura.',actor:i%2?'bot':'customer',status:'sent',created_at:new Date(1700000000000+i*1000).toISOString()})),reads=0;
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/config.js',route=>route.fulfill({contentType:'text/javascript',body:'window.VIEJO_CONFIG={supabaseUrl:"https://fixture.supabase.test",publishableKey:"sb_publishable_fixture",apiBase:"/api"};'}));
   await page.addInitScript(()=>sessionStorage.setItem('viejo-session',JSON.stringify({access_token:'fixture',expires_at:Math.floor(Date.now()/1000)+3600})));
   await page.route('**/api*',route=>{const url=new URL(route.request().url());if(url.searchParams.has('conversation_id')){reads++;const rows=url.searchParams.has('before')?messages.slice(0,60):messages.slice(-100);return route.fulfill({json:{messages:rows}});}return route.fulfill({json:fixture});});
   await page.goto('http://127.0.0.1:5220/#chats');await page.locator('.chat-preview').first().click();await page.locator('.message').last().waitFor();
   const scroll=()=>page.locator('#messageList').evaluate(el=>({top:el.scrollTop,bottom:el.scrollHeight-el.clientHeight-el.scrollTop}));
   assert.ok((await scroll()).bottom<2,'Al abrir se muestran los mensajes recientes');
   // Gesto real de rueda, sin mensajes entrantes: el mismo nodo sobrevive al polling.
   await page.locator('#messageList').hover();await page.mouse.wheel(0,-500);await page.waitForFunction(()=>{const el=document.getElementById('messageList');return el.scrollHeight-el.clientHeight-el.scrollTop>300;});
   await page.evaluate(()=>window.__readingList=document.getElementById('messageList'));const before=(await scroll()).top,start=reads;
   await page.waitForFunction(()=>window.__readingList===document.getElementById('messageList'));await new Promise(resolve=>setTimeout(resolve,5300));assert.ok(reads>start);assert.equal(await page.evaluate(()=>window.__readingList===document.getElementById('messageList')),true);assert.ok(Math.abs((await scroll()).top-before)<2,'El polling sin novedades no mueve la lectura');
   // Mensaje nuevo mientras se lee: queda en el mismo punto.
   const readAnchor=()=>page.locator('#messageList').evaluate(el=>{const top=el.getBoundingClientRect().top,node=[...el.querySelectorAll('[data-message-id]')].find(n=>n.getBoundingClientRect().bottom>top);return {id:node.dataset.messageId,offset:node.getBoundingClientRect().top-top};});
   const anchor=await readAnchor();messages.push({...messages.at(-1),id:randomUUID(),body:'Novedad recibida',created_at:new Date(1700000200000).toISOString()});
   await page.locator('.bubble').filter({hasText:'Novedad recibida'}).waitFor({timeout:9000});const after=await readAnchor();assert.equal(after.id,anchor.id);assert.ok(Math.abs(after.offset-anchor.offset)<2);
   // Al llegar al final sí acompaña los mensajes siguientes.
   await page.locator('#messageList').evaluate(el=>el.scrollTop=el.scrollHeight);messages.push({...messages.at(-1),id:randomUUID(),body:'Segunda novedad',created_at:new Date(1700000201000).toISOString()});
   await page.locator('.bubble').filter({hasText:'Segunda novedad'}).waitFor({timeout:9000});assert.ok((await scroll()).bottom<2);
   // Cargar anteriores mantiene el mensaje visible; el siguiente polling conserva las páginas.
   await page.locator('#messageList').evaluate(el=>el.scrollTop=0);await page.getByRole('button',{name:'Cargar anteriores',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.message').length===162);assert.equal(await page.locator('.message').count(),162,'Las páginas se combinan sin duplicar mensajes');
   await page.locator('#messageList').evaluate(el=>el.scrollTop=150);const oldAnchor=await readAnchor(),oldReads=reads;await new Promise(resolve=>setTimeout(resolve,5300));assert.ok(reads>oldReads);assert.equal(await page.locator('.message').count(),162);const oldAfter=await readAnchor();assert.equal(oldAfter.id,oldAnchor.id);assert.ok(Math.abs(oldAfter.offset-oldAnchor.offset)<2);
   // La caché no resucita un historial que un administrador eliminó.
   conversation.revision++;messages=[{...messages.at(-1),id:randomUUID(),body:'Historial nuevo tras limpieza',created_at:new Date(1700000300000).toISOString()}];
   await page.locator('#refresh').click();await page.locator('.bubble').filter({hasText:'Historial nuevo tras limpieza'}).waitFor();assert.equal(await page.locator('.message').count(),1);assert.deepEqual(errors,[]);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.close();
  }
 }finally{await browser?.close();server.kill();}
});
