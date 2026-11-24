import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {activeCatalog,demoCommand,emptyCart,localDate,reduceOrder} from '../shared/viejo-engine.js';
import {deterministicConversation,recoverCandidates,validateInterpretation} from '../shared/conversation-context.js';
import {databaseV11,mockEnvironment,restBridge} from './v11-helpers.mjs';
import {runWorker} from '../netlify/lib/worker.mjs';

const dishes=[
 {id:'milanesa-pollo',name:'Milanesa de pollo',category_id:'pollo_chancho',available:true},
 {id:'sopa',name:'Sopa paraguaya',category_id:'guarniciones',available:true},
 {id:'pure',name:'Puré de papas',category_id:'guarniciones',available:true},
];
const menu=items=>({id:randomUUID(),day:localDate(),status:'published',reviewed:true,items:structuredClone(items||dishes)});
const identities=items=>items.map(item=>[item.variant_id,item.qty]);
const say=(text,cart=emptyCart('Prueba','buffet'),menus=[menu()])=>{
 const catalog=activeCatalog(cart.service,[],menus);
 return reduceOrder({text,cart,catalog:[],menus,command:demoCommand(text,cart,catalog)});
};

test('Buffet: carne inexistente pide repetir todo; pollo y Sopa forman un pedido nuevo sin acumular puré',()=>{
 const saved={...emptyCart('Prueba','chiperia'),items:[{variant_id:'tradicional-base',qty:2}]};
 let cart={...say('Puré de papas 3').cart,saved_carts:{chiperia:saved},fulfillment:'delivery',delivery_location_id:'punto-propio'};
 const failed=say('Milanesa de carne\nPure de papas',cart);
 assert.match(failed.reply,/pedido completo/);assert.match(failed.reply,/Reinicié el borrador/);assert.doesNotMatch(failed.reply,/ajustar|¿Qué artículo|Conservamos tu carrito/);
 assert.deepEqual(failed.cart.items,[]);assert.equal(failed.cart.quoted,false);assert.equal(failed.cart.subtotal,null);assert.equal(failed.cart.conversation.retry_order,true);
 assert.deepEqual(failed.cart.saved_carts.chiperia,saved);assert.equal(failed.cart.service,'buffet');assert.equal(failed.cart.delivery_location_id,'punto-propio');
 cart=failed.cart;
 const confirmation=say('CONFIRMAR PEDIDO',cart);assert.equal(confirmation.kind,'reply');assert.match(confirmation.reply,/pedido completo/);assert.deepEqual(confirmation.cart.items,[]);
 const options=say('MENÚ',cart);assert.match(options.reply,/Sopa paraguaya/);assert.deepEqual(options.cart.items,[]);assert.equal(options.cart.conversation.retry_order,true);
 const valid=say('Milanesa de pollo\nSopa',cart);
 assert.deepEqual(identities(valid.cart.items),[['milanesa-pollo',1],['sopa',1]]);assert.equal(valid.cart.conversation.retry_order,undefined);assert.equal(valid.cart.subtotal,null);assert.ok(valid.cart.items.every(item=>item.unit_price===null));
 assert.match(valid.reply,/Sopa paraguaya/);assert.doesNotMatch(valid.reply,/Puré/);
 assert.deepEqual(identities(say('Milanesa de pollo\nSopa',valid.cart).cart.items),[['milanesa-pollo',1],['sopa',1]]);
});

test('Buffet: abreviaciones únicas y error milenesa; jamás reemplaza carne por pollo ni elige entre dos sopas',()=>{
 const menus=[menu(dishes.map(dish=>dish.id==='milanesa-pollo'?{...dish,name:'Milenesa de pollo'}:dish))];
 const valid=say('Milanesa de pollo\nSopa',undefined,menus);assert.deepEqual(identities(valid.cart.items),[['milanesa-pollo',1],['sopa',1]]);
 assert.match(say('Milanesa de carne\nPuré',undefined,menus).reply,/pedido completo/);
 const duplicate=[menu([...dishes,{id:'otra-sopa',name:'Sopa de verduras',category_id:'guarniciones',available:false}])];
 const ambiguous=say('Sopa',undefined,duplicate);assert.deepEqual(ambiguous.cart.items,[]);assert.match(ambiguous.reply,/Sopa paraguaya.*Sopa de verduras/);
 const exact=[menu([...dishes,{id:'sopa-exacta',name:'Sopa',category_id:'guarniciones',available:true}])];
 assert.deepEqual(identities(say('Sopa',undefined,exact).cart.items),[['sopa-exacta',1]],'Nombre exacto gana a abreviaciones');
 const catalog=activeCatalog('buffet',[],menus),cart=emptyCart('Prueba','buffet'),text='Milanesa de pollo\nSopa';
 const command=deterministicConversation(text,cart,catalog),candidates=recoverCandidates(text,cart,catalog);
 assert.deepEqual(identities(validateInterpretation(structuredClone(command),text,cart,catalog,candidates).items),[['milanesa-pollo',1],['sopa',1]]);
 assert.throws(()=>validateInterpretation({...command,items:[{variant_id:'milanesa-pollo',qty:1,notes:''}]},'Milanesa de carne',cart,catalog,candidates),/unconfirmed/);
});

test('Buffet: agotados reinician el borrador; consultas, menús ausentes y confirmaciones válidas conservan su flujo',()=>{
 const menus=[menu(dishes.map(dish=>dish.id==='sopa'?{...dish,available:false}:dish))],prior=say('Puré 2').cart;
 const query=say('¿Hay sopa?',prior,menus);assert.deepEqual(query.cart.items,prior.items);assert.match(query.reply,/no está disponible/);
 const wrongQuery=say('¿Tienen milanesa de carne?',prior,menus);assert.deepEqual(wrongQuery.cart.items,prior.items);assert.match(wrongQuery.reply,/No identifiqué ese plato completo/);assert.doesNotMatch(wrongQuery.reply,/pollo está disponible/);
 const failed=say('Milanesa de pollo\nSopa',prior,menus);assert.deepEqual(failed.cart.items,[]);assert.match(failed.reply,/no disponible.*pedido completo/s);
 const stale=say('CONFIRMAR PEDIDO',{...say('Sopa').cart,fulfillment:'retiro'},menus);assert.deepEqual(stale.cart.items,[]);assert.match(stale.reply,/pedido completo/);assert.equal(stale.kind,'reply');
 const valid=say('CONFIRMAR PEDIDO',{...say('Milanesa de pollo\nSopa').cart,fulfillment:'retiro'});assert.equal(valid.kind,'submit');
 const noMenu=say('Milanesa de pollo\nSopa',prior,[]);assert.match(noMenu.reply,/no hay menú.*hoy/);assert.deepEqual(noMenu.cart.items,prior.items);
});

test('Worker/PostgreSQL: intento inválido → repetir pedido completo → nueva lista → una solicitud sin importes',async t=>{
 const c=await databaseV11({v17:true});t.after(()=>c.db.close());t.after(mockEnvironment());
 const bridge=restBridge(c);t.mock.method(globalThis,'fetch',bridge.fetch);
 await c.db.exec("update guarni_settings set config=jsonb_set(config,'{bot_enabled}','true')");
 await c.staff('menu',menu());
 let chat;
 const utter=async(text,external=randomUUID())=>{
  const ingested=await c.rpc('guarni_ingest',[external,'595000004040','Prueba',text]);chat=ingested.conversation_id||chat;await runWorker();
  const current=await c.one('select cart,mode from guarni_conversations where id=$1',[chat]);
  const message=await c.one("select body from guarni_messages where conversation_id=$1 and direction='outbound' order by created_at desc,id desc limit 1",[chat]);
  return {...current,reply:message.body};
 };
 await utter('chipería');await utter('2 chipas tradicionales');await utter('buffet');await utter('Puré de papas 3');
 const external=randomUUID();let result=await utter('Milanesa de carne\nPure de papas',external);
 assert.deepEqual(result.cart.items,[]);assert.equal(result.cart.conversation.retry_order,true);assert.equal(result.mode,'bot');assert.match(result.reply,/pedido completo/);
 await utter('Milanesa de carne\nPure de papas',external);await utter('CONFIRMAR PEDIDO');assert.equal((await c.one('select count(*)::int n from guarni_orders')).n,0);
 result=await utter('Milanesa de pollo\nSopa');assert.deepEqual(identities(result.cart.items),[['milanesa-pollo',1],['sopa',1]]);assert.deepEqual(identities(result.cart.saved_carts.chiperia.items),[['tradicional-base',2]]);
 result=await utter('Milanesa de pollo\nSopa');assert.equal(result.cart.items.length,2);
 await utter('retiro');const confirmation=randomUUID();result=await utter('CONFIRMAR PEDIDO',confirmation);assert.match(result.reply,/PENDIENTE DE ACEPTACIÓN/);assert.equal(result.mode,'human');
 await utter('CONFIRMAR PEDIDO',confirmation);
 const orders=(await c.db.query('select items,service,status,subtotal,total from guarni_orders')).rows;assert.equal(orders.length,1);assert.deepEqual(identities(orders[0].items),[['milanesa-pollo',1],['sopa',1]]);assert.equal(orders[0].service,'buffet');assert.equal(orders[0].status,'pending');assert.equal(orders[0].subtotal,null);assert.equal(orders[0].total,null);
 assert.equal(bridge.calls.filter(call=>call.path.includes('responses')).length,0);assert.equal((await c.one('select count(*)::int n from viejo_ai_usage')).n,0);
});
