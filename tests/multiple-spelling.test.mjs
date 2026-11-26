import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {migrateCatalogDemo,withCategories} from '../shared/catalog.js';
import {deterministicConversation,validateInterpretation} from '../shared/conversation-context.js';
import {emptyCart,reduceOrder,defaults} from '../shared/viejo-engine.js';
import {interpret} from '../netlify/lib/conversation.mjs';
import {runWorker} from '../netlify/lib/worker.mjs';
import {databaseV11,mockEnvironment,restBridge} from './v11-helpers.mjs';
const data={catalog:JSON.parse(await readFile(new URL('../catalogo-el-viejo.json',import.meta.url)))};migrateCatalogDemo(data);
const catalog=withCategories(data.catalog,data.categories),cart=emptyCart('Prueba','chiperia');
const item=(variant_id,qty=1)=>({variant_id,qty,notes:''});
const say=(text,list=catalog,before=cart)=>{const command=deterministicConversation(text,before,list);return {command,result:reduceOrder({text,cart:before,catalog:list,command:command||{intent:'help'}})};};

test('Varias palabras mal escritas: frase completa, abreviaciones y cantidad sin ninguna palabra perfecta del producto',()=>{
 for(const text of ['un sanwis de milnesa de polo','un sanwis de milanesse de polo','un sandwcih de milnesa de polo','1 sanwis de milanessa de polo']){
  const {command,result}=say(text);assert.equal(command.intent,'update_cart',text);assert.deepEqual(command.items,[item('sandwich-milanesa-de-pollo')]);assert.equal(result.cart.subtotal,13000);assert.equal(result.cart.items[0].name,'Sándwich');assert.equal(result.cart.items[0].variant,'Milanesa de pollo');
  assert.equal(validateInterpretation(structuredClone(command),text,cart,catalog,catalog).intent,'update_cart');
 }
 const {command}=say('dos sanwis de milnesa de polo; tres enpanadas de carme');
 // La sustitución en una palabra corta requiere el proveedor y su validación adicional.
 assert.notEqual(command?.intent,'update_cart');
 const multi=say('dos sanwis de milnesa de polo; tres enpanadas de carne; un sanwis de milnesa de polo');
 assert.deepEqual(multi.command.items,[item('sandwich-milanesa-de-pollo',3),item('empanada-carne',3)]);assert.equal(multi.result.cart.subtotal,57000);
 assert.deepEqual(say('dos enpanadas de polo').command.items,[item('empanada-pollo',2)]);
 const misleading={id:'numero-parecido',name:'Teres',variant:'Base',service:'chiperia',active:true,available:true,price:1000};assert.deepEqual(say('tres enpanadas de polo',[...catalog,misleading]).command.items,[item('empanada-pollo',3)],'Una cantidad nunca se corrige hacia un nombre del catálogo');
});

test('Catálogo dinámico y ambigüedad: nombres nuevos sin diccionario, nombres exactos prioritarios y aclaración con cantidad conservada',()=>{
 const product={id:'dinamico',name:'Calabacita',variant:'Arroz',service:'chiperia',active:true,available:true,price:7123,aliases:[]};
 assert.notEqual(say('dos calabacta de aroz').command?.intent,'update_cart');
 assert.deepEqual(say('dos calabacta de aroz',[...catalog,product]).command.items,[item(product.id,2)]);
 assert.equal(say('dos calabacta de aroz',[...catalog,product]).result.cart.subtotal,14246);
 const literal={...product,id:'literal',name:'Sanwis',variant:'Milnesa de polo',price:9999};
 assert.deepEqual(say('un sanwis de milnesa de polo',[...catalog,literal]).command.items,[item('literal')]);
 const duplicate={...catalog.find(p=>p.id==='sandwich-milanesa-de-pollo'),id:'otra-opcion',variant:'Milanesa de pollo',price:9000};
 const ambiguous=say('dos sanwis de milnesa de polo',[...catalog,duplicate]);assert.equal(ambiguous.command.intent,'clarify');assert.deepEqual(ambiguous.result.cart.items,[]);assert.equal(ambiguous.command.context.pending.qty,2);assert.match(ambiguous.result.reply,/¿Cuál preferís/);
 const colliding={...product,id:'polvo',name:'Sándwich',variant:'Milanesa de polvo'};
 assert.notEqual(say('un sanwis de milnesa de polo',[...catalog,colliding]).command?.intent,'update_cart','Pollo y polvo están a la misma distancia: no elegir por precio ni stock');
});

test('Seguridad comercial: no reemplaza variedades inexistentes, nombres cortos distintos ni pedidos parciales',async t=>{
 t.after(mockEnvironment());
 const proposal={intent:'update_cart',items:[item('sandwich-milanesa-de-pollo')],customer_name:'',fulfillment:'a_coordinar',address:'',payment:'a_coordinar',category:'',query:''};
 t.mock.method(globalThis,'fetch',async url=>url.includes('viejo_ai_usage')?Response.json(null):Response.json({status:'completed',output_text:JSON.stringify(proposal)}));
 for(const text of ['un sanwis de milnesa de pescado','un sanwis de milnesa de bollo','un bollo','un sanwis de milnesa de polo y una pizza']){
  assert.notEqual(say(text).command?.intent,'update_cart',text);
  assert.throws(()=>validateInterpretation(structuredClone(proposal),text,cart,catalog,catalog,{semantic:true}),/unconfirmed/,text);
  assert.equal((await interpret(text,cart,catalog,defaults)).intent,'retry_order',text);
 }
 for(const change of [{available:false},{active:false},{price:null}]){
  const list=catalog.map(p=>p.id==='sandwich-milanesa-de-pollo'?{...p,...change}:p),request=say('un sanwis de milnesa de polo',list);assert.equal(request.command.intent,'retry_order');assert.deepEqual(request.result.cart.items,[]);
 }
 proposal.items=[item('sandwich-milanesa-de-pollo',4)];assert.throws(()=>validateInterpretation(structuredClone(proposal),'un sanwis de milnesa de polo',cart,catalog,catalog),/unconfirmed/);
});

test('PostgreSQL/worker: frase exacta del usuario, producto nuevo y precios actualizados, sin IA ni envíos reales',async t=>{
 const c=await databaseV11({v17:true,pickup:true});t.after(()=>c.db.close());t.after(mockEnvironment());const bridge=restBridge(c);t.mock.method(globalThis,'fetch',bridge.fetch);
 await c.db.exec("update guarni_settings set config=jsonb_set(config,'{bot_enabled}','true')");let id;
 const message=async text=>{const ing=await c.rpc('guarni_ingest',[randomUUID(),'595000009393','Prueba',text]);id=ing.conversation_id||id;await runWorker();return (await c.one('select cart from guarni_conversations where id=$1',[id])).cart;};
 await message('chipería');let result=await message('un sanwis de milnesa de polo');assert.equal(result.items[0].variant_id,'sandwich-milanesa-de-pollo');assert.equal(result.items[0].qty,1);assert.equal(result.subtotal,13000);
 await c.db.exec("update guarni_catalog set price=14500 where id='sandwich-milanesa-de-pollo'");result=await message('un sanwis de milnesa de polo');assert.equal(result.items[0].qty,1);assert.equal(result.subtotal,14500);
 await message('retiro');await message('CONFIRMAR PEDIDO');let order=await c.one('select * from guarni_orders');assert.equal(order.status,'pending');assert.equal(order.fulfillment,'retiro');assert.equal(order.subtotal,14500);assert.equal(order.total,null);
 const category=await c.one("select category_id from guarni_catalog where id='tradicional-base'");await c.staff('catalog',{id:'recien-creado',name:'Calabacita',variant:'Arroz',category_id:category.category_id,price:7123,available:true,active:true,seasonal:false,aliases:[]});
 result=await message('dos calabacta de aroz');assert.equal(result.items[0].variant_id,'recien-creado');assert.equal(result.items[0].qty,2);assert.equal(result.subtotal,14246);
 assert.deepEqual(await c.one('select * from guarni_orders'),order);assert.equal(bridge.calls.some(c=>c.path.includes('responses')),false);
});
