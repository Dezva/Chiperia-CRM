import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {deterministicConversation,validateInterpretation} from '../shared/conversation-context.js';
import {defaults,emptyCart,reduceOrder,localDate} from '../shared/viejo-engine.js';
import {deliveryMode,normalizeSettings,validateSettings} from '../shared/settings.js';
import {databaseV11,mockEnvironment,restBridge} from './v11-helpers.mjs';
import {runWorker} from '../netlify/lib/worker.mjs';
import api from '../netlify/functions/api.mjs';
const dish=(id,name)=>({id,name,service:'buffet',variant:'Base',available:true,price:null});
const dishes=[dish('pollo','Milanesa de pollo'),dish('sopa','Sopa paraguaya')];
const item=(variant_id,qty=1)=>({variant_id,qty,notes:''});

test('Ortografía genérica: una/dos letras, varias líneas y catálogo dinámico; sin equivalencias hardcodeadas',()=>{
 const cart=emptyCart('Prueba','buffet');
 for(const typo of ['milanese','milanesse','milanessaa','milenesa','milansea']){
  const text=`2 ${typo} de pollo\nSopa paraguaya 3`,command=deterministicConversation(text,cart,dishes);
  assert.equal(command.intent,'update_cart',text);assert.deepEqual(command.items,[item('pollo',2),item('sopa',3)]);
  assert.equal(validateInterpretation(structuredClone(command),text,cart,dishes,dishes).intent,'update_cart');
 }
 const blocked=deterministicConversation('2 milanesse de pollo',cart,dishes.map(p=>p.id==='pollo'?{...p,available:false}:p));assert.equal(blocked.intent,'retry_order');assert.match(blocked.message,/no disponible/);
 const fresh=[...dishes,dish('nuevo','Calabacita horneada')];
 assert.deepEqual(deterministicConversation('dos calabacitaa horneada',cart,fresh).items,[item('nuevo',2)]);
 assert.notEqual(deterministicConversation('dos calabacitaa horneada',cart,dishes)?.intent,'update_cart');
});

test('No adivinar productos: empates, palabras cortas, variante inexistente y errores sin ancla literal',()=>{
 const cart=emptyCart('Prueba','buffet');
 for(const [text,list] of [['2 milanesse',dishes],['2 milanesa de carne',dishes],['2 milanesse de pollo',[...dishes,dish('otro','Milaneso de pollo')]],['2 bollo',[dish('bollito','Bollito')]],['2 sopa de pescado',dishes]]){
  assert.notEqual(deterministicConversation(text,cart,list)?.intent,'update_cart',text);
  assert.throws(()=>validateInterpretation({intent:'update_cart',items:[item(list[0].id,2)]},text,cart,list,list,{semantic:true}),/unconfirmed|invalid/,text);
 }
 const exact=[...dishes,dish('exacto','Milanesse de pollo')];
 assert.deepEqual(deterministicConversation('2 milanesse de pollo',cart,exact).items,[item('exacto',2)]);
});

test('Sanwis de verdura: abreviación con cantidad, precio actual y sin producto elegido por defecto',()=>{
 const catalog=[{id:'verdura',name:'Sándwich',variant:'Verdura',service:'chiperia',available:true,active:true,price:10000},{id:'pollo',name:'Sándwich',variant:'Milanesa de pollo',service:'chiperia',available:true,active:true,price:13000}];
 const cart=emptyCart('Prueba','chiperia');
 for(const [text,qty] of [['sanwis de verdura',1],['2 sanwis de verdura',2],['sanwis de verdura 3',3]]){
  const command=deterministicConversation(text,cart,catalog);assert.equal(command.intent,'update_cart');assert.deepEqual(command.items,[item('verdura',qty)]);
  const r=reduceOrder({text,cart,catalog,command});assert.equal(r.cart.items[0].variant_id,'verdura');assert.equal(r.cart.subtotal,qty*10000);
 }
 const invented={id:'inventado',name:'Bravolente',variant:'Azurina',service:'chiperia',available:true,active:true,price:7123};
 assert.deepEqual(deterministicConversation('2 bravole azurina',cart,[...catalog,invented]).items,[item('inventado',2)]);
 assert.notEqual(deterministicConversation('2 bravole azurina',cart,catalog)?.intent,'update_cart');
 const duplicate=[...catalog,{...catalog[0],id:'otra-verdura',price:12000}];assert.notEqual(deterministicConversation('2 sanwis de verdura',cart,duplicate)?.intent,'update_cart');
 assert.notEqual(deterministicConversation('2 sanwis de pescado',cart,catalog)?.intent,'update_cart');
});

test('Modalidades: configuración antigua no habilita delivery de chipería y consultas preservan el borrador',()=>{
 const legacy=structuredClone(defaults);legacy.schedules.chiperia.delivery_mode='scheduled';legacy.schedules.chiperia.delivery_open='09:00';legacy.schedules.chiperia.delivery_close='12:00';
 assert.equal(deliveryMode(legacy,'chiperia'),'disabled');assert.equal(deliveryMode(legacy,'buffet'),'scheduled');
 assert.throws(()=>validateSettings(legacy),/solo con retiro/);assert.equal(validateSettings(normalizeSettings(legacy)).schedules.chiperia.delivery_open,null);
 const product={id:'x',name:'Producto de prueba',variant:'Base',service:'chiperia',price:5000,available:true,active:true};
 let cart=emptyCart('Prueba','chiperia');let r=reduceOrder({text:'2 producto de prueba para delivery',cart,catalog:[product],settings:legacy,command:{intent:'update_cart',items:[item('x',2)],fulfillment:'delivery'}});
 assert.equal(r.cart.items[0].qty,2);assert.equal(r.cart.fulfillment,'a_coordinar');assert.match(r.reply,/solo con retiro/);assert.doesNotMatch(r.reply,/Enviá tu ubicación/);cart=r.cart;
 for(const text of ['¿Hacen delivery?','¿Cuánto cuesta delivery?','¿Puedo retirar?']){r=reduceOrder({text,cart,catalog:[product],settings:legacy});assert.deepEqual(r.cart,cart);assert.match(r.reply,/retiro/);assert.doesNotMatch(r.reply,/ubicación puntual|costo de envío lo confirma/);}
 const cross=reduceOrder({text:'¿El buffet tiene delivery?',cart,catalog:[product],settings:legacy});assert.deepEqual(cross.cart,cart);assert.match(cross.reply,/solicitar retiro o delivery/);
 r=reduceOrder({text:'retiro',cart,catalog:[product],settings:legacy});assert.equal(r.cart.fulfillment,'retiro');assert.equal(reduceOrder({text:'CONFIRMAR PEDIDO',cart:r.cart,catalog:[product],settings:legacy}).kind,'submit');
});

test('018 PostgreSQL: migración reejecutable, históricos intactos y bloqueo SQL de nuevas entregas',async t=>{
 const c=await databaseV11({v17:true});t.after(()=>c.db.close());
 await c.rpc('guarni_ingest',[randomUUID(),'595000008181','Prueba','hola']);const chat=await c.one('select * from guarni_conversations');
 const id=randomUUID();await c.db.query("insert into guarni_orders(id,client_id,conversation_id,service,fulfillment,status,items,subtotal,total,customer_name) values($1,$2,$3,'chiperia','delivery','accepted','[]',7000,15000,'Prueba')",[id,chat.client_id,chat.id]);
 const before=await c.one('select to_jsonb(o) value from guarni_orders o where id=$1',[id]),catalog=await c.one('select jsonb_agg(to_jsonb(p) order by id) value from guarni_catalog p');
 const sql=await readFile(new URL('../database/018_delivery_solo_buffet.sql',import.meta.url),'utf8');await c.db.exec(sql);await c.db.exec(sql);
 assert.deepEqual(await c.one('select to_jsonb(o) value from guarni_orders o where id=$1',[id]),before);assert.deepEqual(await c.one('select jsonb_agg(to_jsonb(p) order by id) value from guarni_catalog p'),catalog);
 assert.equal((await c.one("select viejo_delivery_mode('{\"schedules\":{\"chiperia\":{\"delivery_mode\":\"scheduled\"}}}', 'chiperia') mode")).mode,'disabled');
 await assert.rejects(()=>c.db.query("insert into guarni_orders(client_id,conversation_id,service,fulfillment,items) values($1,$2,'chiperia','delivery','[]')",[chat.client_id,chat.id]),/delivery_disabled/);
 await c.db.query("update guarni_orders set status='preparing' where id=$1",[id]);await c.db.query("update guarni_orders set status='ready' where id=$1",[id]);await c.db.query("update guarni_orders set status='delivered' where id=$1",[id]);assert.equal((await c.one('select total from guarni_orders where id=$1',[id])).total,15000);
 await c.db.exec("update guarni_settings set config=jsonb_set(config,'{schedules,chiperia,delivery_mode}','\"pending\"')");assert.equal((await c.one("select config->'schedules'->'chiperia'->>'delivery_mode' mode from guarni_settings")).mode,'disabled');
 const request=randomUUID();await c.staff('create_order',{request_id:request,client_id:chat.client_id,service:'chiperia',items:[item('tradicional-base')],fulfillment:'retiro'});
 await assert.rejects(()=>c.staff('order_details',{id:request,fulfillment:'delivery',address:'Referencia',payment:'a_coordinar'}),/delivery_disabled/);
});

test('Worker/API: chipería retiro; buffet con errores de escritura y delivery; precios y confirmación humana vigentes',async t=>{
 const c=await databaseV11({v17:true,pickup:true});t.after(()=>c.db.close());t.after(mockEnvironment());const bridge=restBridge(c);t.mock.method(globalThis,'fetch',bridge.fetch);
 await c.db.exec("update guarni_settings set config=jsonb_set(config,'{bot_enabled}','true')");let id;
 const say=async text=>{const ing=await c.rpc('guarni_ingest',[randomUUID(),'595000008282','Prueba',text]);id=ing.conversation_id||id;await runWorker();return c.one('select * from guarni_conversations where id=$1',[id]);};
 const reply=async()=>(await c.one("select body from guarni_messages where conversation_id=$1 and direction='outbound' order by created_at desc,id desc limit 1",[id])).body;
 await say('chipería');const abbreviated=await say('2 sanwis de verdura');assert.equal(abbreviated.cart.items[0].variant_id,'sandwich-verdura');assert.equal(abbreviated.cart.subtotal,20000);await say('CANCELAR PEDIDO');await say('2 sanwich de milanese de pollo');let r=await say('delivery');assert.equal(r.cart.items[0].qty,2);assert.notEqual(r.cart.fulfillment,'delivery');assert.match(await reply(),/solo con retiro/);
 await c.rpc('guarni_ingest_location',[randomUUID(),r.wa_id,'Prueba',{latitude:-25,longitude:-57},'location']);await runWorker();assert.match(await reply(),/No necesitás enviar una ubicación/);assert.equal((await c.one('select draft_location_id from guarni_conversations where id=$1',[id])).draft_location_id,null);
 await say('retiro');await say('CONFIRMAR PEDIDO');const chip=await c.one("select * from guarni_orders where service='chiperia'");assert.equal(chip.subtotal,26000);assert.equal(chip.fulfillment,'retiro');
 const response=await api(new Request('https://crm.test/api',{method:'POST',headers:{authorization:'Bearer fixture','content-type':'application/json'},body:JSON.stringify({action:'create_order',data:{request_id:randomUUID(),client_id:r.client_id,service:'chiperia',fulfillment:'delivery',items:[item('tradicional-base')]}})}));assert.equal(response.status,400);assert.match((await response.json()).error,/solo con retiro/);
 await c.staff('menu',{id:randomUUID(),day:localDate(),status:'published',reviewed:true,items:dishes.map(p=>({id:p.id,name:p.name,category_id:p.id==='pollo'?'pollo_chancho':'guarniciones',available:true}))});
 await say('buffet');r=await say('2 milanesse de pollo y 1 sopa paraguaya');assert.deepEqual(r.cart.items.map(p=>[p.variant_id,p.qty]),[['pollo',2],['sopa',1]]);assert.equal(r.cart.subtotal,null);
 await say('delivery');await c.rpc('guarni_ingest_location',[randomUUID(),r.wa_id,'Prueba',{latitude:-25,longitude:-57},'location']);await runWorker();r=await say('CONFIRMAR PEDIDO');assert.equal(r.mode,'human');const buffet=await c.one("select * from guarni_orders where service='buffet'");assert.equal(buffet.fulfillment,'delivery');assert.ok(buffet.delivery_location_id);assert.equal(buffet.total,null);
 await c.staff('take',{id});await c.staff('order_status',{id:buffet.id,status:'accepted',fulfillment:'delivery',expected_items:buffet.items,shipping_fee:8000,buffet_amount:30000,price_agreed:true,schedule_reviewed:true,group_reviewed:true,location_reviewed:true});assert.equal((await c.one('select total from guarni_orders where id=$1',[buffet.id])).total,38000);
 await c.staff('release',{id});r=await say('chipería');await c.rpc('guarni_ingest_location',[randomUUID(),r.wa_id,'Prueba',{latitude:-24,longitude:-56},'location']);await runWorker();
 assert.doesNotMatch(await reply(),/No necesitás enviar una ubicación/,'Un delivery anterior del buffet sigue admitiendo revisión humana');assert.equal((await c.one('select delivery_location_id from guarni_orders where id=$1',[buffet.id])).delivery_location_id,buffet.delivery_location_id);
 assert.equal(bridge.calls.some(c=>c.path.includes('responses')),false,'Estas correcciones no precisan llamadas al modelo');
});
