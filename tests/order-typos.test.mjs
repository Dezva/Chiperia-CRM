import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {migrateCatalogDemo,withCategories} from '../shared/catalog.js';
import {deterministicOrder,matchCommercial} from '../shared/catalog-matching.js';
import {deterministicConversation,recoverCandidates,validateInterpretation} from '../shared/conversation-context.js';
import {defaults,emptyCart,reduceOrder} from '../shared/viejo-engine.js';
import {interpret} from '../netlify/lib/conversation.mjs';
import {runWorker} from '../netlify/lib/worker.mjs';
import {databaseV11,mockEnvironment,restBridge} from './v11-helpers.mjs';

const data={catalog:JSON.parse(await readFile(new URL('../catalogo-el-viejo.json',import.meta.url)))};
migrateCatalogDemo(data);
const catalog=withCategories(data.catalog,data.categories);
const screenshot='Tradicional argolla 2\nSandwidch de verdura 1\nEmpanada de jamon y queso 5\nSanwich verdura 2';
const expected=[['tradicional-argolla-base',2],['sandwich-verdura',3],['empanada-jamon-y-queso',5]];
const quantities=items=>items.map(item=>[item.variant_id,item.qty]);
const say=(text,cart=emptyCart('Prueba','chiperia'),list=catalog)=>reduceOrder({text,cart,catalog:list,command:deterministicConversation(text,cart,list)||{intent:'help'}});

test('Pedido de la captura: errores, cantidades al final y líneas repetidas sin perder artículos',()=>{
 const result=say(screenshot);
 assert.deepEqual(quantities(result.cart.items),expected);
 assert.equal(result.cart.subtotal,70000);
 assert.equal(result.kind,'reply');
 assert.match(result.reply,/3 × Sándwich.*Verdura/);
 assert.match(result.reply,/5 × Empanada.*Jamón y queso/);
 assert.doesNotMatch(result.reply,/ajustar|horarios|¿Qué producto/);
 assert.equal(result.cart.conversation.focus_ids.length,3);
 assert.deepEqual(quantities(say(screenshot,result.cart).cart.items),expected,'Repetir establece el total, no suma otro pedido');
 assert.deepEqual(quantities(say('Agregame '+screenshot,result.cart).cart.items),expected.map(([id,qty])=>[id,qty*2]));
});

test('Cantidades: límites de línea, comas, punto y coma, prefijos y sufijos',()=>{
 for(const separator of ['\n','\r\n','; ', ', ']){
  const result=say(['Tradicional argolla 2','1 Sandwidch de verdura','Empanada de jamón y queso cinco','Sanwich verdura 2'].join(separator));
  assert.deepEqual(quantities(result.cart.items),expected,JSON.stringify(separator));
 }
 const withoutQty=say('Tradicional argolla\nSandwidch de verdura 2\nEmpanada de jamón y queso');
 assert.deepEqual(quantities(withoutQty.cart.items),[['tradicional-argolla-base',1],['sandwich-verdura',2],['empanada-jamon-y-queso',1]]);
 const prior=say('1 empanada de pollo').cart;
 assert.deepEqual(quantities(say(screenshot,prior).cart.items),[['empanada-pollo',1],...expected]);
 for(const text of ['Sanwich verdura 20\nSandwidch verdura 20','Sanwich verdura 0\nSandwidch verdura 2']){
  const result=say(text,prior);assert.deepEqual(result.cart,prior);assert.match(result.reply,/entre 1 y 30/);
 }
 const oneProduct=say('Sanwich verdura 1\nSandwidch verdura 2').cart;
 assert.equal(oneProduct.conversation.focus_ids.length,1);
 assert.equal(say('Al final solo dos',oneProduct).cart.items[0].qty,2);
});

test('Ortografía: una edición inequívoca, abreviaturas, nombres exactos y ambigüedad comercial',()=>{
 for(const text of ['Sandwidch verdura 2','Sandwcih verdura 2','Sanwich verdura 2','Sanwich de verduras 2']){
  assert.deepEqual(quantities(say(text).cart.items),[['sandwich-verdura',2]],text);
 }
 assert.deepEqual(quantities(say('Tradiconal argolla 2\nEmpanda de pollo 3').cart.items),[['tradicional-argolla-base',2],['empanada-pollo',3]]);
 const base={service:'chiperia',variant:'Base',active:true,available:true,price:9000};
 const list=[...catalog,{...base,id:'bollo',name:'Bollo'},{...base,id:'torta',name:'Torta'},{...base,id:'sandwidch',name:'Sandwidch de verdura'}];
 assert.deepEqual(quantities(say('2 bollo y 3 bollitos',undefined,list).cart.items),[['bollo',2],['bollito-base',3]]);
 assert.deepEqual(quantities(say('Sandwidch de verdura 2',undefined,list).cart.items),[['sandwidch',2]],'Nombre exacto gana a la corrección');
 const unknown=deterministicOrder('bollio 2',emptyCart('Prueba','chiperia'),list);
 assert.equal(unknown.command,null,'A una edición de bollo y bollito: no elegir uno');
 for(const text of ['Bollo 2','Empanada de bollo 2','Torta de pollo 2','Sanwich de pescado 2'])assert.notEqual(deterministicConversation(text,emptyCart('Prueba','chiperia'),catalog)?.intent,'update_cart',text);
 const ambiguous=deterministicConversation('Sandwich 2',emptyCart('Prueba','chiperia'),catalog);
 assert.equal(ambiguous.intent,'clarify');assert.equal(ambiguous.context.pending.candidate_ids.length,4);
 const badVariety=deterministicConversation('Tradiconal 2\nSanwi de pescado 3',emptyCart('Prueba','chiperia'),catalog);
 assert.equal(badVariety,null,'La interpretación requiere IA; no elegir una variedad ni agregar parcialmente');
});

test('Catálogo vigente y servidor: precios, disponibilidad, sinónimos e IDs validados',()=>{
 const candidates=recoverCandidates(screenshot,emptyCart('Prueba','chiperia'),catalog);
 for(const [id] of expected)assert.ok(candidates.some(p=>p.id===id));
 const command=deterministicConversation(screenshot,emptyCart('Prueba','chiperia'),catalog);
 const valid=validateInterpretation(structuredClone(command),screenshot,emptyCart('Prueba','chiperia'),catalog,candidates);
 assert.deepEqual(quantities(valid.items),expected);
 const altered=structuredClone(command);altered.items[1].qty=2;
 assert.throws(()=>validateInterpretation(altered,screenshot,emptyCart('Prueba','chiperia'),catalog,candidates),/unconfirmed/);
 const changed=catalog.map(p=>p.id==='sandwich-verdura'?{...p,price:11000}:p);
 assert.equal(say(screenshot,undefined,changed).cart.subtotal,73000);
 for(const change of [{available:false},{price:null},{active:false}]){
  const list=catalog.map(p=>p.id==='sandwich-verdura'?{...p,...change}:p),prior=say('1 bollito').cart;
  const result=say(screenshot,prior,list);assert.deepEqual(result.cart.items,[]);assert.equal(result.cart.conversation.retry_order,true);assert.match(result.reply,/no disponible|pendiente/);assert.match(result.reply,/pedido completo/);
 }
 const fresh=[...catalog,{id:'nuevo',name:'Rosquita',variant:'Base',service:'chiperia',price:8000,active:true,available:true,aliases:['Aro especial']}];
 assert.deepEqual(quantities(say('Rosquitaa 2',undefined,fresh).cart.items),[['nuevo',2]]);
 assert.deepEqual(quantities(say('Aro especail 2',undefined,fresh).cart.items),[['nuevo',2]]);
 fresh.at(-1).aliases=[];
 assert.notEqual(deterministicConversation('Aro especail 2',emptyCart('Prueba','chiperia'),fresh)?.intent,'update_cart');
 const buffet=[{id:'plato',name:'Sandwich de verdura',variant:'Base',service:'buffet',available:true,price:null}];
 assert.equal(matchCommercial('Sandwidch verdura 2',buffet).matches[0].product.id,'plato','La misma corrección solo usa los platos del buffet actual');
});

test('Proveedor: una interpretación inválida pide un pedido completo y reinicia el borrador',async t=>{
 t.after(mockEnvironment());
 const prior=say('1 bollito').cart;
 t.mock.method(globalThis,'fetch',async url=>url.includes('viejo_ai_usage')?Response.json(null):Response.json({status:'completed',output_text:JSON.stringify({intent:'update_cart',items:[{variant_id:'sandwich-verdura',qty:9,notes:''}]})}));
 const text='Sanwich de pescado 2 y un bollito';
 const command=await interpret(text,prior,catalog,defaults);
 assert.equal(command.intent,'retry_order');assert.doesNotMatch(command.message,/ajustar/);assert.match(command.message,/pedido completo/);
 const reset=reduceOrder({text,cart:prior,catalog,command}).cart;assert.deepEqual(reset.items,[]);assert.equal(reset.conversation.retry_order,true);
});

test('Worker/PostgreSQL: captura real, repetición, precios actuales, retiro y confirmación sin IA',async t=>{
 const context=await databaseV11({v17:true});t.after(()=>context.db.close());t.after(mockEnvironment());
 const bridge=restBridge(context);t.mock.method(globalThis,'fetch',bridge.fetch);
 await context.db.exec("update guarni_settings set config=jsonb_set(config,'{bot_enabled}','true')");
 let chatId;
 const utter=async(text,external=randomUUID())=>{
  const ingested=await context.rpc('guarni_ingest',[external,'595000000333','Prueba',text]);chatId=ingested.conversation_id||chatId;
  await runWorker();
  const message=await context.one("select body from guarni_messages where conversation_id=$1 and direction='outbound' order by created_at desc,id desc limit 1",[chatId]);
  return {...await context.one('select cart,mode from guarni_conversations where id=$1',[chatId]),reply:message?.body};
 };
 await utter('chipería');
 let result=await utter(screenshot);assert.deepEqual(quantities(result.cart.items),expected);assert.equal(result.cart.subtotal,70000);assert.equal(result.mode,'bot');
 result=await utter(screenshot);assert.deepEqual(quantities(result.cart.items),expected);
 await context.db.exec("update guarni_catalog set price=11000 where id='sandwich-verdura'");
 result=await utter(screenshot);assert.equal(result.cart.subtotal,73000);
 await context.db.exec("update guarni_catalog set available=false where id='sandwich-verdura'");
 result=await utter(screenshot);assert.deepEqual(result.cart.items,[]);assert.equal(result.cart.conversation.retry_order,true);assert.match(result.reply,/pedido completo/);assert.match(result.reply,/no disponible/);
 await context.db.exec("update guarni_catalog set available=true where id='sandwich-verdura'");
 await utter(screenshot);await utter('voy a retirar');const confirmationId=randomUUID();result=await utter('confirmar pedido',confirmationId);
 assert.match(result.reply,/PENDIENTE DE ACEPTACIÓN/);
 const order=await context.one('select items,subtotal,total,status,service,fulfillment from guarni_orders');
 assert.deepEqual(quantities(order.items),expected);assert.equal(order.subtotal,73000);assert.equal(order.total,null);assert.equal(order.status,'pending');assert.equal(order.service,'chiperia');assert.equal(order.fulfillment,'retiro');
 await utter('confirmar pedido',confirmationId);assert.equal((await context.one('select count(*)::int n from guarni_orders')).n,1);
 assert.equal((await context.one('select count(*)::int n from viejo_ai_usage')).n,0);
 assert.equal(bridge.calls.filter(call=>call.path.includes('responses')).length,0);
});
