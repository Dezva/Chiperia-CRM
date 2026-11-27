import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {databaseV11,mockEnvironment,restBridge} from './v11-helpers.mjs';
import {runWorker} from '../netlify/lib/worker.mjs';
import {localDate} from '../shared/viejo-engine.js';

const output=items=>({intent:'update_cart',items,customer_name:'',fulfillment:'a_coordinar',address:'',payment:'a_coordinar',category:'',query:''});
const item=(id,qty,notes='')=>({variant_id:id,qty,notes});
async function fixture(t){
 const c=await databaseV11({v17:true,pickup:true});t.after(()=>c.db.close());t.after(mockEnvironment());
 let ai=async()=>{throw Error('El recorrido determinista no debe llamar IA');},calls=0;
 const bridge=restBridge(c);t.mock.method(globalThis,'fetch',async(url,options)=>{
  if(new URL(url).hostname==='fixture-ai.test'){calls++;return ai(JSON.parse(options.body));}
  return bridge.fetch(url,options);
 });
 await c.db.exec("update guarni_settings set config=jsonb_set(config,'{bot_enabled}','true')");
 let id;
 const chat=()=>c.one('select * from guarni_conversations where id=$1',[id]);
 const say=async(text,external=randomUUID())=>{
  const ingested=await c.rpc('guarni_ingest',[external,'595000005353','Prueba',text]);id=ingested.conversation_id||id;await runWorker();
  const message=await c.one("select body from guarni_messages where conversation_id=$1 and direction='outbound' order by created_at desc,id desc limit 1",[id]);return {...await chat(),reply:message?.body};
 };
 const aiBehavior=callback=>{ai=callback;};
 return {...c,say,chat,aiBehavior,aiCalls:()=>calls,bridge};
}

test('PGlite/worker: conversación completa con consultas, notas, incrementos, corrección, eliminación, retiro y aceptación humana',async t=>{
 const c=await fixture(t);await c.say('chipería');let result=await c.say('Quiero dos empanadas de carne sin cebolla');
 assert.equal(result.cart.items[0].notes,'sin cebolla');
 for(const text of ['Gracias.','Perfecto.','¿Dónde están ubicados?','¿Hasta qué hora atienden?','¿Puedo pagar por transferencia?','¿Tienen pizza?','¿Puedo pasar a retirar?','¿Cuánto falta para mi pedido?','Necesito ayuda','Quiero ver mi pedido para retirar']){
  const before=structuredClone(result.cart);result=await c.say(text);assert.deepEqual(result.cart,before,text);assert.equal(result.mode,'bot');assert.doesNotMatch(result.reply,/Reinicié|commercial_equivalence|a_coordinar/);
 }
 const before=structuredClone(result.cart);result=await c.say('¿También tienen de pollo?');assert.deepEqual(result.cart,before);assert.match(result.reply,/Pollo está disponible/);
 result=await c.say('Entonces agregame una de pollo');assert.deepEqual(result.cart.items.map(x=>[x.variant_id,x.qty]),[['empanada-carne',2],['empanada-pollo',1]]);
 const duplicate=randomUUID();result=await c.say('Agregame dos más',duplicate);assert.equal(result.cart.items[1].qty,3);result=await c.say('Agregame dos más',duplicate);assert.equal(result.cart.items[1].qty,3);
 result=await c.say('Al final quiero solamente dos');assert.equal(result.cart.items[1].qty,2);assert.equal(result.cart.items[0].notes,'sin cebolla');
 result=await c.say('Quitame las empanadas');assert.match(result.reply,/Carne.*Pollo/);assert.equal(result.cart.items.length,2);
 result=await c.say('Pollo');assert.equal(result.cart.items.length,1);assert.equal(result.cart.items[0].notes,'sin cebolla');assert.equal(result.cart.subtotal,12000);
 result=await c.say('delivery');assert.match(result.reply,/solo con retiro/);result=await c.say('CONFIRMAR PEDIDO');assert.match(result.reply,/retirar|RETIRO/);assert.equal((await c.one('select count(*)::int n from guarni_orders')).n,0);
 await c.say('retiro');result=await c.say('¿Puedo pagar por transferencia?');assert.equal(result.cart.delivery_location_id,null);assert.equal(result.cart.items[0].qty,2);result=await c.say('Pago con transferencia');assert.equal(result.cart.payment,'Transferencia');const confirmation=randomUUID();result=await c.say('CONFIRMAR PEDIDO',confirmation);
 assert.match(result.reply,/PENDIENTE DE ACEPTACIÓN/);await c.say('CONFIRMAR PEDIDO',confirmation);
 const orders=(await c.db.query('select * from guarni_orders')).rows;assert.equal(orders.length,1);const order=orders[0];assert.equal(order.subtotal,12000);assert.equal(order.total,null);assert.equal(order.fulfillment,'retiro');assert.equal(order.items[0].notes,'sin cebolla');assert.equal(order.payment,'Transferencia');assert.equal(order.payment_status,'pending');
 await c.staff('order_status',{id:order.id,status:'accepted',expected_items:order.items,expected_version:order.version,fulfillment:'retiro',shipping_fee:0,schedule_reviewed:true,location_reviewed:true});
 assert.equal((await c.one('select total from guarni_orders')).total,12000);assert.equal(c.aiCalls(),0);
});

test('PGlite/worker: timeout, conexión, HTTP y JSON inválido tienen reintentos acotados sin borrar ni pausar el pedido',async t=>{
 const c=await fixture(t);await c.say('chipería');await c.say('dos empanadas de carne sin cebolla');await c.say('retiro');
 let current=await c.chat();await c.rpc('guarni_ingest_location',[randomUUID(),current.wa_id,'Prueba',{latitude:-25.3,longitude:-57.5},'location']);await runWorker();
 const original=(await c.chat()).cart;
 const failures=[
  [async()=>{throw new TypeError('detalle privado de conexión');},2],
  [async()=>{throw new DOMException('detalle privado','TimeoutError');},2],
  [async()=>new Response('detalle privado',{status:503}),2],
  [async()=>new Response('detalle privado',{status:429}),2],
  [async()=>new Response('detalle privado',{status:401}),1],
  [async()=>new Response('no es JSON'),2],
  [async()=>Response.json({status:'incomplete'}),2],
  [async()=>Response.json({output_text:'no es JSON'}),2],
  [async()=>Response.json({output_text:JSON.stringify({intent:'submit'})}),2],
  [async()=>Response.json({output_text:JSON.stringify({...output([]),intent:'human'})}),2],
  [async()=>Response.json({output_text:JSON.stringify(output([item('bollito-base',30)]))}),2],
 ];
 for(const [failure,limit] of failures){
  c.aiBehavior(failure);const start=c.aiCalls(),external=randomUUID();let result=await c.say('un sangui de pollo',external);
  assert.equal(c.aiCalls()-start,limit);assert.deepEqual(result.cart,original);assert.equal(result.mode,'bot');assert.match(result.reply,/en este momento.*sigue guardado/s);assert.doesNotMatch(result.reply,/detalle privado|Reinicié|Atención:|ai_/);
  result=await c.say('un sangui de pollo',external);assert.equal(c.aiCalls()-start,limit,'Deduplicación no vuelve a llamar al proveedor');assert.deepEqual(result.cart,original);
 }
 assert.equal((await c.one('select count(*)::int n from guarni_orders')).n,0);
 c.aiBehavior(async()=>Response.json({output_text:JSON.stringify({...output([item('empanada-carne',2,'sin cebolla'),item('sandwich-milanesa-de-pollo',1)]),fulfillment:'retiro',address:'INVENTADA',customer_name:'INVENTADO',payment:'Efectivo'})}));
 let result=await c.say('un sangui de pollo');assert.equal(result.mode,'bot');assert.equal(result.cart.items.length,2);assert.equal(result.cart.fulfillment,'retiro');assert.equal(result.cart.delivery_location_id,original.delivery_location_id);assert.equal(result.cart.customer_name,original.customer_name);assert.equal(result.cart.address,original.address);assert.equal(result.cart.payment,original.payment);
 const count=c.aiCalls();result=await c.say('Quiero hablar con alguien del equipo');assert.equal(result.mode,'human');assert.equal(c.aiCalls(),count);
});

test('PGlite/worker: pedido múltiple inválido reinicia solo su borrador; nuevo intento y cambio de servicio conservan solicitudes e historial',async t=>{
 const c=await fixture(t);await c.staff('menu',{id:randomUUID(),day:localDate(),status:'published',reviewed:true,items:[{id:'arroz',name:'Arroz',category_id:'guarniciones',available:true},{id:'pollo',name:'Milanesa de pollo',category_id:'pollo_chancho',available:true}]});
 await c.say('buffet');await c.say('2 arroz sin sal');await c.say('chipería');await c.say('2 empanadas de pollo');
 let current=await c.chat();await c.staff('create_order',{request_id:randomUUID(),client_id:current.client_id,service:'chiperia',items:[item('tradicional-base',1)],fulfillment:'retiro'});
 const registered=await c.one('select * from guarni_orders'),saved=structuredClone(current.cart.saved_carts.buffet);
 c.aiBehavior(async()=>Response.json({output_text:JSON.stringify({...output([]),intent:'help'})}));
 let result=await c.say('Quiero 3 chipas tradicionales, 2 empanadas de carne y una pizza');assert.deepEqual(result.cart.items,[]);assert.match(result.reply,/pizza/);assert.match(result.reply,/pedido completo/);assert.deepEqual(result.cart.saved_carts.buffet,saved);assert.deepEqual(await c.one('select * from guarni_orders'),registered);
 result=await c.say('¿Tienen pizza?');assert.deepEqual(result.cart.items,[]);assert.equal(result.cart.conversation.retry_order,true);assert.doesNotMatch(result.reply,/Reinicié/);
 result=await c.say('Quiero dos bollitos');assert.equal(result.cart.items.length,1);assert.equal(result.cart.items[0].variant_id,'bollito-base');
 result=await c.say('buffet');assert.equal(result.cart.items[0].notes,'sin sal');assert.equal(result.cart.items[0].qty,2);
 result=await c.say('Milanesa de carne\nArroz');assert.deepEqual(result.cart.items,[]);assert.match(result.reply,/Milanesa de carne/);assert.equal(result.cart.saved_carts.chiperia.items[0].variant_id,'bollito-base');
 result=await c.say('Milanesa de pollo sin sal');assert.equal(result.cart.items.length,1);assert.equal(result.cart.items[0].unit_price,null);assert.equal(result.cart.subtotal,null);
 await c.say('retiro');result=await c.say('CONFIRMAR PEDIDO');assert.equal(result.mode,'human');const buffet=await c.one("select * from guarni_orders where service='buffet'");assert.equal(buffet.total,null);assert.equal(buffet.items[0].notes,'sin sal');
 assert.equal((await c.one('select count(*)::int n from guarni_orders')).n,2);
 const previous=await c.one('select * from guarni_orders where id=$1',[registered.id]);
 for(const key of ['id','number','client_id','service','status','items','subtotal','total','fulfillment','address','payment'])assert.deepEqual(previous[key],registered[key],key);
 assert.ok(previous.group_id);assert.equal(previous.group_id,buffet.group_id,'La relación existente entre servicios sigue funcionando sin alterar los artículos históricos');
 await c.staff('take',{id:result.id});await c.staff('order_status',{id:buffet.id,status:'accepted',expected_version:buffet.version,expected_items:buffet.items,fulfillment:'retiro',schedule_reviewed:true,price_agreed:true,buffet_amount:45000,group_reviewed:true});assert.equal((await c.one('select total from guarni_orders where id=$1',[buffet.id])).total,45000);
});
