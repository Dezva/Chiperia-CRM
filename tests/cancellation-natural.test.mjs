import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {migrateCatalogDemo,withCategories} from '../shared/catalog.js';
import {cancellationIntent} from '../shared/cancellation.js';
import {emptyCart,reduceOrder,demoCommand,activeCatalog,localDate} from '../shared/viejo-engine.js';
import {databaseV11,mockEnvironment,restBridge} from './v11-helpers.mjs';
import {runWorker} from '../netlify/lib/worker.mjs';
const data={catalog:JSON.parse(await readFile(new URL('../catalogo-el-viejo.json',import.meta.url)))};migrateCatalogDemo(data);const catalog=withCategories(data.catalog,data.categories);
const say=(text,cart=emptyCart(),orders=[])=>reduceOrder({text,cart,catalog,orders,command:demoCommand(text,cart,activeCatalog(cart.service,catalog))});
const draft=()=>say('dos empanadas de carne para retirar').cart;

test('Cancelación explícita de borrador, comandos anteriores e independencia de servicios',()=>{
 const other={...emptyCart('Prueba','buffet'),items:[{variant_id:'sopa',qty:1}]},before={...draft(),saved_carts:{buffet:other}};
 for(const text of ['Cambié de opinión, quiero cancelar el pedido','quiero anular mi pedido','ya no voy a querer el pedido','CANCELAR PEDIDO','Hola buenas, cancelar el pedido','/cancelar','/reiniciar']){
  const r=say(text,before);assert.deepEqual(r.cart.items,[],text);assert.deepEqual(r.cart.saved_carts.buffet,other);assert.match(r.reply,/cancel|Cancel/);assert.equal(r.kind,'reply');
 }
 const registered={number:9,status:'pending',service:'chiperia'};assert.equal(say('cancelar borrador',before,[registered]).kind,'reply');assert.deepEqual(registered,{number:9,status:'pending',service:'chiperia'});
});

test('Ambigüedad, negaciones, preguntas y productos concretos jamás cancelan automáticamente',()=>{
 const before=draft();
 for(const text of ['no voy a querer más','no quiero más','ya no quiero nada','no quiero cancelar el pedido','¿Puedo cancelar el pedido?','Si quiero cancelar el pedido','cancelar una empanada','¿ya no quiero el pedido?','no quiero agregar más']){const r=say(text,before);assert.deepEqual(r.cart,before,text);assert.equal(r.kind,'reply');assert.doesNotMatch(r.reply,/Cancelé el borrador|Borrador cancelado/);}
 assert.match(say('no voy a querer más',before).reply,/cancelar.*solamente dejar de agregar/);
 assert.equal(cancellationIntent('dos empanadas de carne'),null);
});

test('Pedido registrado: deriva a revisión humana; aclara números y múltiples objetivos sin cambiar estados',()=>{
 const empty=emptyCart('Prueba','chiperia');
 for(const status of ['pending','accepted','preparing','ready','out_for_delivery']){const order={id:randomUUID(),number:7,status,service:'chiperia'},r=say('cambié de opinión, quiero cancelar el pedido',empty,[order]);assert.equal(r.kind,'human');assert.match(r.reply,/#7.*todavía no está cancelado/s);assert.deepEqual(r.cart,empty);assert.equal(order.status,status);}
 const orders=[{number:7,status:'pending',service:'buffet'},{number:8,status:'pending',service:'chiperia'}];assert.equal(say('cancelar el pedido',empty,orders).kind,'reply');assert.match(say('cancelar el pedido',empty,orders).reply,/#7.*#8/);assert.equal(say('cancelar pedido #8',empty,orders).kind,'human');assert.match(say('cancelar pedido 8',empty,orders).reply,/#8/);assert.match(say('cancelar pedido #99',draft(),orders).reply,/No identifiqué/);assert.deepEqual(say('cancelar pedido #99',draft(),orders).cart,draft());
 assert.deepEqual(say('cancelar el pedido',draft(),orders).cart,draft(),'Un borrador y pedidos registrados requieren identificar el objetivo');
});

async function fixture(t){
 const c=await databaseV11({v17:true,pickup:true});t.after(()=>c.db.close());t.after(mockEnvironment());const bridge=restBridge(c);t.mock.method(globalThis,'fetch',bridge.fetch);await c.db.exec("update guarni_settings set config=jsonb_set(config,'{bot_enabled}','true')");let id;
 const say=async(text,external=randomUUID())=>{const ing=await c.rpc('guarni_ingest',[external,'595000004747','Prueba',text]);id=ing.conversation_id||id;await runWorker();return c.one('select * from guarni_conversations where id=$1',[id]);};return {...c,bridge,say};
}

test('Worker/PostgreSQL: cancelar borrador de buffet despega ubicación; no cambia otro servicio ni crea pedidos',async t=>{
 const c=await fixture(t);await c.staff('menu',{id:randomUUID(),day:localDate(),status:'published',reviewed:true,items:[{id:'arroz',name:'Arroz',category_id:'guarniciones',available:true}]});await c.say('dos empanadas de carne');await c.say('buffet');await c.say('dos arroz');let r=await c.say('delivery');await c.rpc('guarni_ingest_location',[randomUUID(),r.wa_id,'Prueba',{latitude:-25,longitude:-57},'location']);await runWorker();const before=await c.one('select * from guarni_conversations where id=$1',[r.id]);assert.ok(before.draft_location_id);
 r=await c.say('cambié de opinión, quiero cancelar el pedido');assert.deepEqual(r.cart.items,[]);assert.equal(r.draft_location_id,null);assert.equal(r.cart.delivery_location_id,null);assert.deepEqual(r.cart.saved_carts.chiperia,before.cart.saved_carts.chiperia);await c.say('buffet');r=await c.say('dos arroz para delivery');assert.equal(r.draft_location_id,null);assert.equal(r.cart.delivery_location_id,null);assert.equal((await c.one('select count(*)::int n from guarni_orders')).n,0);assert.equal(c.bridge.calls.some(c=>c.path.includes('responses')),false);
});

test('Worker/PostgreSQL: pedido pendiente no se cancela ni duplica; solicitud persiste y conversación pasa al equipo',async t=>{
 const c=await fixture(t);await c.say('dos empanadas de carne');await c.say('retiro');let r=await c.say('confirmar');const order=await c.one('select * from guarni_orders');assert.equal(order.status,'pending');const original={...emptyCart('Prueba','chiperia'),...r.cart};
 r=await c.say('no voy a querer más');assert.deepEqual(r.cart,original);assert.equal(r.mode,'bot');assert.deepEqual(await c.one('select * from guarni_orders'),order);
 const external=randomUUID();r=await c.say('cambié de opinión, quiero cancelar el pedido',external);assert.equal(r.mode,'human');assert.deepEqual(await c.one('select * from guarni_orders'),order);const count=await c.one('select count(*)::int n from guarni_messages');await c.say('cambié de opinión, quiero cancelar el pedido',external);assert.deepEqual(await c.one('select count(*)::int n from guarni_messages'),count);assert.equal(c.bridge.calls.some(c=>c.path.includes('responses')),false);
});
