import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {orderWritingGuide} from '../shared/order-retry.js';
import {emptyCart,reduceOrder,demoCommand,activeCatalog,localDate} from '../shared/viejo-engine.js';
import {databaseV11,mockEnvironment,restBridge} from './v11-helpers.mjs';
import {runWorker} from '../netlify/lib/worker.mjs';

test('Guía: ejemplos del catálogo vigente, sin productos ambiguos, agotados, inactivos, sin precio ni de otro servicio',()=>{
 const base={service:'chiperia',variant:'Base',available:true,active:true,price:5000};
 const catalog=[{...base,id:'ok',name:'Alfajor nuevo'},{...base,id:'agotado',name:'Agotado',available:false},{...base,id:'inactivo',name:'Inactivo',active:false},{...base,id:'sinprecio',name:'Sin precio',price:null},{...base,id:'otro',name:'Plato buffet',service:'buffet',category_id:'carne'},{...base,id:'legacy',name:'Genérico',legacy_generic:true},{...base,id:'a',name:'Duplicado'},{...base,id:'b',name:'Duplicado'}];
 const guide=orderWritingGuide(emptyCart('','chiperia'),catalog);assert.match(guide,/2 Alfajor nuevo/);assert.doesNotMatch(guide,/Agotado|Inactivo|Sin precio|Plato buffet|Genérico|Duplicado/);assert.match(guide,/cantidad.*nombre completo.*variedad.*uno por línea/);assert.match(guide,/MENÚ.*equipo/);
 const changed=catalog.map(p=>p.id==='ok'?{...p,name:'Producto actualizado'}:p);assert.match(orderWritingGuide(emptyCart('','chiperia'),changed),/2 Producto actualizado/);assert.doesNotMatch(orderWritingGuide(emptyCart('','chiperia'),changed),/Alfajor nuevo/);
 const menus=[{day:localDate(),status:'published',items:[{id:'sopa',name:'Sopa de hoy',category_id:'guarniciones',available:true},{id:'pending',name:'Pendiente',category_id:'pending',available:true}]}];const today=activeCatalog('buffet',[],menus);assert.match(orderWritingGuide(emptyCart('','buffet'),today),/2 Sopa de hoy/);assert.doesNotMatch(orderWritingGuide(emptyCart('','buffet'),today),/Pendiente/);assert.doesNotMatch(orderWritingGuide(emptyCart('','buffet'),[]),/Sopa de hoy|Alfajor/);
 const before={...emptyCart('','chiperia'),items:[{variant_id:'ok',name:'Alfajor nuevo',variant:'Base',qty:1,unit_price:5000}]};const text='kp';const reply=reduceOrder({text,cart:before,catalog,command:demoCommand(text,before,catalog)});assert.deepEqual(reply.cart,before);assert.match(reply.reply,/Ejemplo.*\n2 Alfajor nuevo/);assert.match(reply.reply,/sigue guardado/);
});

test('Worker/PostgreSQL: guía tras texto extra, sin agregar ejemplos; pedido completo siguiente se registra una sola vez',async t=>{
 const c=await databaseV11({v17:true,pickup:true});t.after(()=>c.db.close());t.after(mockEnvironment());const bridge=restBridge(c,{onAI:()=>({output_text:JSON.stringify({intent:'help',items:[]})})});t.mock.method(globalThis,'fetch',bridge.fetch);await c.db.exec("update guarni_settings set config=jsonb_set(config,'{bot_enabled}','true')");let id;
 const say=async text=>{const seen=new Set((await c.db.query("select id from guarni_messages where direction='outbound'")).rows.map(m=>m.id));const ing=await c.rpc('guarni_ingest',[randomUUID(),'595000003636','Prueba',text]);id=ing.conversation_id||id;await runWorker();const row=await c.one('select * from guarni_conversations where id=$1',[id]);const message=(await c.db.query("select id,body from guarni_messages where direction='outbound'")).rows.find(m=>!seen.has(m.id));return {...row,reply:message?.body};};
 await say('chipería');await say('una tarta de pollo');let r=await say('kp quiero dos empanadas de carne');assert.match(r.reply,/No entendí el pedido completo/);assert.match(r.reply,/Ejemplo de cómo escribirlo/);assert.match(r.reply,/nombre completo.*variedad.*uno por línea/);assert.deepEqual(r.cart.items,[]);assert.equal(r.cart.conversation.retry_order,true);assert.equal((await c.one('select count(*)::int n from guarni_orders')).n,0);
 r=await say('CONFIRMAR');assert.match(r.reply,/Ejemplo de cómo escribirlo/);assert.equal((await c.one('select count(*)::int n from guarni_orders')).n,0);
 r=await say('2 empanadas de carne\n1 empanada de pollo');assert.deepEqual(r.cart.items.map(p=>[p.variant_id,p.qty]),[['empanada-carne',2],['empanada-pollo',1]]);await say('retiro');await say('confirmar');const order=await c.one('select * from guarni_orders');assert.equal(order.items.length,2);assert.equal(order.subtotal,18000);assert.equal((await c.one('select count(*)::int n from guarni_orders')).n,1);assert.equal(bridge.calls.filter(c=>c.path.includes('responses')).length,2,'Solo el mensaje no interpretado usa los dos intentos acotados del proveedor simulado');
});
