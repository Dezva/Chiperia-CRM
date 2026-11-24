import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {migrateCatalogDemo,withCategories} from '../shared/catalog.js';
import {emptyCart,defaults,reduceOrder} from '../shared/viejo-engine.js';
import {interpret} from '../netlify/lib/conversation.mjs';
import {validateInterpretation} from '../shared/conversation-context.js';
import {runWorker} from '../netlify/lib/worker.mjs';
import {databaseV11,mockEnvironment,restBridge} from './v11-helpers.mjs';

const data={catalog:JSON.parse(await readFile(new URL('../catalogo-el-viejo.json',import.meta.url)))};migrateCatalogDemo(data);
const catalog=withCategories(data.catalog,data.categories),cart=emptyCart('Prueba','chiperia');
const item=(id,qty=1)=>({variant_id:id,qty,notes:''});
const output=items=>({intent:'update_cart',items,customer_name:'',fulfillment:'a_coordinar',address:'',payment:'a_coordinar',category:'',query:''});
const screenshot='Tradicional argolla 2\nSandwidch de verdura 1\nEmpanada de jamon y queso 5\nSanwi verdura 2';
const expected=[item('tradicional-argolla-base',2),item('sandwich-verdura',3),item('empanada-jamon-y-queso',5)];

test('Interpretación del proveedor: sanwich, sangui y sanwi contra catálogo actual, sin tabla de equivalencias',async t=>{
 t.after(mockEnvironment());let response;
 t.mock.method(globalThis,'fetch',async url=>url.includes('viejo_ai_usage')?Response.json(null):Response.json({status:'completed',output_text:JSON.stringify(response)}));
 for(const [text,items] of [['un sangui de pollo',[item('sandwich-milanesa-de-pollo')]],['dos sanwich de pollo',[item('sandwich-milanesa-de-pollo',2)]],['un sanguche de pollo',[item('sandwich-milanesa-de-pollo')]],['un sanwi de verdura',[item('sandwich-verdura')]], [screenshot,expected]]){
  response=output(items);const command=await interpret(text,cart,catalog,defaults);
  assert.equal(command.intent,'update_cart',text);assert.deepEqual(command.items,items,text);
  const result=reduceOrder({text,cart,catalog,command});assert.equal(result.kind,'reply');assert.equal(result.cart.items.length,items.length);assert.match(result.reply,/¿Vas a retirar/);
 }
 const product={id:'nuevo-pavo',name:'Baguette',variant:'Pavo',price:7123,available:true,active:true,service:'chiperia',aliases:[]};
 response=output([item(product.id,2)]);
 const command=await interpret('dos baguet de pavo',cart,[...catalog,product],defaults);
 assert.equal(command.intent,'update_cart');assert.equal(reduceOrder({text:'dos baguet de pavo',cart,catalog:[...catalog,product],command}).cart.subtotal,14246,'Un producto nuevo no necesita cambios en el código');
});

test('Interpretación insegura: ambigüedad, producto desconocido, precio pendiente, cantidades inventadas o lote incompleto exigen repetir todo',async t=>{
 t.after(mockEnvironment());let response;
 t.mock.method(globalThis,'fetch',async url=>url.includes('viejo_ai_usage')?Response.json(null):Response.json({status:'completed',output_text:JSON.stringify(response)}));
 const requests=[
  ['un bollo',[item('bollito-base')],catalog],
  ['una pizza de pollo',[item('sandwich-milanesa-de-pollo')],catalog],
  ['un sangui de pescado',[item('sandwich-milanesa-de-pollo')],catalog],
  ['un sangui de pollo',[item('sandwich-milanesa-de-pollo',4)],catalog],
  [screenshot,expected.slice(0,2),catalog],
  ['un sangui de pollo',[item('sandwich-milanesa-de-pollo')],catalog.map(p=>p.id==='sandwich-milanesa-de-pollo'?{...p,price:null,available:false}:p)],
  ['un sangui de pollo',[item('sandwich-milanesa-de-pollo')],[...catalog,{id:'otro-pollo',name:'Sándwich',variant:'Pollo',price:9000,available:true,active:true,service:'chiperia'}]],
 ];
 for(const [text,items,list] of requests){
  response=output(items);const command=await interpret(text,cart,list,defaults);assert.equal(command.intent,'retry_order',text);assert.match(command.message,/pedido completo/);assert.doesNotMatch(command.message,/ajustar/);
 }
 for(const intent of ['info','menu','summary']){response={...output([]),intent};assert.equal((await interpret('un sangui desconocido',cart,catalog,defaults)).intent,'retry_order','No mostrar horarios ni un resumen viejo ante un pedido no comprendido');}
 const normal=output([item('sandwich-milanesa-de-pollo')]);
 assert.throws(()=>validateInterpretation(normal,'un sangui de pollo',cart,catalog,catalog),/unconfirmed/,'La interpretación no literal requiere validación adicional');
 assert.equal(validateInterpretation(normal,'un sangui de pollo',cart,catalog,catalog,{semantic:true}).intent,'update_cart');
});

test('Worker/PostgreSQL: captura original y expresión natural; rechazo completo y nuevo pedido sin restos con precios actuales',async t=>{
 const c=await databaseV11({v17:true});t.after(()=>c.db.close());t.after(mockEnvironment());let response=output(expected);
 const bridge=restBridge(c,{onAI:()=>({status:'completed',output_text:JSON.stringify(response)})});t.mock.method(globalThis,'fetch',bridge.fetch);
 await c.db.exec("update guarni_settings set config=jsonb_set(config,'{bot_enabled}','true')");let id;
 const say=async text=>{const ingested=await c.rpc('guarni_ingest',[randomUUID(),'595000007171','Prueba',text]);id=ingested.conversation_id||id;await runWorker();return c.one('select cart,mode from guarni_conversations where id=$1',[id]);};
 await say('chipería');let result=await say(screenshot);assert.deepEqual(result.cart.items.map(x=>[x.variant_id,x.qty]),expected.map(x=>[x.variant_id,x.qty]));assert.equal(result.cart.subtotal,70000);
 response={...output([]),intent:'help'};result=await say('un producto que no existe');assert.deepEqual(result.cart.items,[]);assert.equal(result.cart.conversation.retry_order,true);
 await c.db.exec("update guarni_catalog set price=14000 where id='sandwich-milanesa-de-pollo'");
 response=output([item('sandwich-milanesa-de-pollo',2)]);result=await say('dos sangui de pollo');assert.equal(result.cart.items.length,1);assert.equal(result.cart.items[0].variant_id,'sandwich-milanesa-de-pollo');assert.equal(result.cart.items[0].qty,2);assert.equal(result.cart.subtotal,28000);
 await say('retiro');await say('CONFIRMAR PEDIDO');const order=await c.one('select items,subtotal,total,status from guarni_orders');assert.equal(order.items.length,1);assert.equal(order.subtotal,28000);assert.equal(order.total,null);assert.equal(order.status,'pending');
 assert.ok(bridge.calls.some(call=>call.path.includes('responses')),'La prueba usa interpretación del proveedor simulado, sin enviar mensajes reales');
});
