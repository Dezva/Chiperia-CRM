import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {intentText,isCustomerConfirmation} from '../shared/customer-language.js';
import {fulfillmentChoice} from '../shared/fulfillment.js';
import {messageIntent} from '../shared/message-intent.js';
import {migrateCatalogDemo,withCategories} from '../shared/catalog.js';
import {defaults,emptyCart,reduceOrder,demoCommand,activeCatalog,localDate} from '../shared/viejo-engine.js';
import {databaseV11,mockEnvironment,restBridge} from './v11-helpers.mjs';
import {interpret} from '../netlify/lib/conversation.mjs';
import {validateInterpretation} from '../shared/conversation-context.js';
import {runWorker} from '../netlify/lib/worker.mjs';
const data={catalog:JSON.parse(await readFile(new URL('../catalogo-el-viejo.json',import.meta.url)))};migrateCatalogDemo(data);
const catalog=withCategories(data.catalog,data.categories);
const say=(text,cart=emptyCart(),menus=[])=>reduceOrder({text,cart,catalog,menus,command:demoCommand(text,cart,activeCatalog(cart.service,catalog,menus))});
const draft=()=>say('una tarta de pollo',emptyCart('Prueba','chiperia')).cart;

test('Lenguaje común: modalidades con errores, mayúsculas, negaciones y preguntas',()=>{
 for(const text of ['Retiiro','RETIOR','retiroo','voy a retiirar','Para retiraR'])assert.equal(fulfillmentChoice(text),'retiro',text);
 for(const text of ['deliveri','DELIVERY','delibery','quiero delivry'])assert.equal(fulfillmentChoice(text),'delivery',text);
 for(const text of ['Noo retiiro','no quieroo retiiro','puedoo retiiro','sin delivry','¿Retiiro?','¿Puedoo pedir deliveri?','retiiro o deliveri','tal vez retiiro'])assert.equal(fulfillmentChoice(text),null,text);
 assert.equal(fulfillmentChoice('Noo quiero deliveri, voy a retiirar'),'retiro');
 const before=draft();for(const text of ['Retiiro','RETIOR','retiroo','voy a retiirar']){const r=say(text,before);assert.equal(r.cart.fulfillment,'retiro');assert.deepEqual(r.cart.items,before.items);assert.equal(r.cart.subtotal,8000);assert.match(r.reply,/CONFIRMAR/);assert.doesNotMatch(r.reply,/CONFIRMAR PEDIDO/);}
 for(const text of ['¿Retiiro?','Noo quiero deliveri']){const r=say(text,before);assert.deepEqual(r.cart,before);}
 assert.deepEqual(say('quiero 1 corta',before).cart.items,[],'Un pedido desconocido no se convierte en carta por similitud');
 assert.deepEqual(say('1 tarta de pollo para retiiro').cart.items.map(p=>[p.variant_id,p.qty]),[['tarta-pollo',1]]);
 assert.equal(say('tarta',before).cart.items[0].variant_id,'tarta-pollo','Un alimento exacto no se convierte en una consulta de carta');
 const inline=say('una tarta de pollo para deliveri');assert.equal(say('sí',inline.cart).cart.fulfillment,'retiro');
 const affirmative=say('SÍ',before);assert.equal(affirmative.cart.fulfillment,'retiro');assert.notEqual(affirmative.kind,'submit');assert.equal(say('SÍ',emptyCart()).cart.service,null);
 const blocked=say('deliveri',before);assert.match(blocked.reply,/solo con retiro/);assert.deepEqual(blocked.cart.items,before.items);assert.notEqual(blocked.cart.fulfillment,'delivery');
});

test('Confirmación: acepta mayúsculas/minúsculas y espacios; no preguntas, negaciones, datos no textuales ni órdenes incompletas',()=>{
 const before=say('Retiiro',draft()).cart;
 for(const text of ['confirmar','CONFIRMAR','Confirmar','cOnFiRmAr','  CONFIRMAR  ','\nconfirmar\t','confirmar!','CONFIRMAR!!!','confirmar pedido','CONFIRMAR PEDIDO','confimar']){assert.equal(isCustomerConfirmation(text),true,text);const r=say(text,before);assert.equal(r.kind,'submit',text);assert.deepEqual(r.cart.items,before.items);}
 for(const text of ['',null,undefined,1,true,{},['confirmar'],'¿confirmar?','no confirmar','noo confirmar','sin confirmar','quiero saber si debo confirmar','confirmar más tarde','no confirmar pedido'])assert.equal(isCustomerConfirmation(text),false,String(text));
 assert.notEqual(say('CONFIRMAR',emptyCart('Prueba','chiperia')).kind,'submit');
 assert.notEqual(say('CONFIRMAR',draft()).kind,'submit','Debe elegir retiro antes de enviar');
 const stale={...before,items:before.items.map(p=>({...p,unit_price:1}))};assert.notEqual(say('confirmar',stale).kind,'submit','Recotiza antes de enviar');
});

test('Consultas cotidianas: menú del día, horarios, ubicación, pagos y agradecimientos conservan el borrador',()=>{
 const before=draft();
 for(const text of ['quiero el menú del día','ME PASAS EL MENU DE HOY','podrias mostrarme el catalogo','quiero ver las opciones','¿Qué tenés para comer?']){const r=say(text,before);assert.deepEqual(r.cart,before,text);assert.match(r.reply,/Tradicional/);assert.match(r.reply,/Tarta.*Pollo/);}
 const cases=[['Quiero saber los horraios','hours',/Atención:/],['Quiero saber la direccioon','location',/sucursal|dirección|Estamos/],['¿Puedoo pagar con transferencia?','payments',/Transferencia/],['GRCAIAS',undefined,/Gracias/]];
 for(const [text,topic,pattern] of cases){if(topic)assert.equal(messageIntent(text).topic,topic,text);const r=say(text,before);assert.deepEqual(r.cart,before,text);assert.match(r.reply,pattern,text);}
 const categories=say('Quiero ver las facturas',before);assert.deepEqual(categories.cart,before);assert.match(categories.reply,/Bollito/);assert.doesNotMatch(categories.reply,/Tradicional/);
 const payment=say('Pago con transferensia',before);assert.equal(payment.cart.payment,'Transferencia');assert.deepEqual(payment.cart.items,before.items);assert.match(payment.reply,/recepción del pago/);
 const named={id:'menu-propio',name:'Menú ejecutivo',variant:'Base',service:'chiperia',active:true,available:true,price:18000};const actual=reduceOrder({text:'quiero un menú ejecutivo',cart:emptyCart('Prueba','chiperia'),catalog:[...catalog,named],command:demoCommand('quiero un menú ejecutivo',emptyCart('Prueba','chiperia'),[...catalog,named])});assert.equal(actual.cart.items[0].variant_id,named.id);
 const menus=[{day:localDate(),status:'published',items:[{id:'sopa',name:'Sopa paraguaya',category_id:'guarniciones',available:true}]}];
 const buffet=say('buffet',before,menus).cart,r=say('Quiero el menú del día',buffet,menus);assert.match(r.reply,/Sopa paraguaya/);assert.deepEqual(r.cart,buffet);
});

test('Primer mensaje sin saludo: inferencia inequívoca, productos compartidos y elección sin perder cantidades',()=>{
 const r=say('dos sanwis de milnesa de polo');assert.equal(r.cart.service,'chiperia');assert.equal(r.cart.items[0].qty,2);assert.equal(r.cart.items[0].variant_id,'sandwich-milanesa-de-pollo');assert.equal(r.kind,'reply');assert.equal(r.cart.subtotal,26000);
 assert.equal(say('quiero 2 empanadas de pollo de la chipería').cart.items[0].qty,2);
 const menus=[{day:localDate(),status:'published',items:[{id:'emp-buffet',name:'Empanada de pollo',category_id:'pollo_chancho',available:true},{id:'sopa',name:'Sopa paraguaya',category_id:'guarniciones',available:true}]}];
 const ambiguous=say('dos empanadas de pollo',emptyCart(),menus);assert.equal(ambiguous.cart.service,null);assert.deepEqual(ambiguous.cart.items,[]);assert.match(ambiguous.reply,/buffet o chipería/);assert.equal(ambiguous.cart.initial_order_request,'dos empanadas de pollo');
 const selected=say('Chipería',ambiguous.cart,menus);assert.equal(selected.cart.service,'chiperia');assert.equal(selected.cart.items[0].qty,2);assert.equal(selected.cart.items[0].variant_id,'empanada-pollo');assert.equal(selected.cart.initial_order_request,undefined);
 const soup=say('dos sopas paraguayas',emptyCart(),menus);assert.equal(soup.cart.service,'buffet');assert.equal(soup.cart.subtotal,null);assert.equal(soup.cart.items[0].qty,2);
 assert.match(say('quiero el menú del buffet',emptyCart(),menus).reply,/Sopa paraguaya/);
 assert.equal(say('hola').cart.service,null);assert.deepEqual(say('¿Tienen tarta de pollo?').cart.items,[]);
});

async function fixture(t){
 const c=await databaseV11({v17:true,pickup:true});t.after(()=>c.db.close());t.after(mockEnvironment());const bridge=restBridge(c);t.mock.method(globalThis,'fetch',bridge.fetch);await c.db.exec("update guarni_settings set config=jsonb_set(config,'{bot_enabled}','true')");
 let id;const message=async(text,external=randomUUID())=>{const ing=await c.rpc('guarni_ingest',[external,'595000009494','Prueba',text]);id=ing.conversation_id||id;await runWorker();return c.one('select * from guarni_conversations where id=$1',[id]);};
 return {...c,bridge,message};
}

test('Worker/PostgreSQL: primer pedido → menú natural → Retiiro → CONFIRMAR; una solicitud sin IA',async t=>{
 const c=await fixture(t);let r=await c.message('una tarta de pollo');assert.equal(r.cart.service,'chiperia');assert.equal(r.cart.items[0].qty,1);const before=r.cart;
 r=await c.message('quiero el menú del día');assert.deepEqual(r.cart,before);r=await c.message('Retiiro');assert.equal(r.cart.fulfillment,'retiro');assert.equal(r.cart.subtotal,8000);
 const id=randomUUID();await c.message('CONFIRMAR',id);await c.message('CONFIRMAR',id);let order=await c.one('select * from guarni_orders');assert.equal(order.items[0].variant_id,'tarta-pollo');assert.equal(order.status,'pending');assert.equal(order.subtotal,8000);assert.equal(order.fulfillment,'retiro');assert.equal(order.total,null);
 await c.message('CONFIRMAR');assert.equal((await c.one('select count(*)::int n from guarni_orders')).n,1);assert.equal(c.bridge.calls.some(c=>c.path.includes('responses')),false);
});

test('Worker/PostgreSQL: selección tras pedido compartido, modalidad con error en buffet y confirmación segura',async t=>{
 const c=await fixture(t);await c.staff('menu',{id:randomUUID(),day:localDate(),status:'published',reviewed:true,items:[{id:'emp-buffet',name:'Empanada de pollo',category_id:'pollo_chancho',available:true}]});
 let r=await c.message('dos empanadas de pollo');assert.equal(r.cart.service,null);assert.deepEqual(r.cart.items,[]);r=await c.message('buffet');assert.equal(r.cart.service,'buffet');assert.equal(r.cart.items[0].qty,2);
 r=await c.message('deliveri');assert.equal(r.cart.fulfillment,'delivery');await c.message('CONFIRMAR');assert.equal((await c.one('select count(*)::int n from guarni_orders')).n,0,'Falta ubicación');
 await c.rpc('guarni_ingest_location',[randomUUID(),r.wa_id,'Prueba',{latitude:-25,longitude:-57},'location']);await runWorker();await c.message('¿confirmar?');assert.equal((await c.one('select count(*)::int n from guarni_orders')).n,0);await c.message('confirmar');const order=await c.one('select * from guarni_orders');assert.equal(order.service,'buffet');assert.equal(order.items[0].qty,2);assert.equal(order.total,null);assert.ok(order.delivery_location_id);
});

test('019 SQL: cambia solo el aviso vigente, reejecutable y exige 018',async t=>{
 const c=await databaseV11({v17:true});t.after(()=>c.db.close());const sql=await readFile(new URL('../database/019_confirmacion_amigable.sql',import.meta.url),'utf8');
 await assert.rejects(()=>c.db.exec(sql),/apply_018_first/);await c.db.exec('rollback');await c.db.exec(await readFile(new URL('../database/018_delivery_solo_buffet.sql',import.meta.url),'utf8'));
 const before=await c.one("select prosrc,prosecdef,proacl,proconfig from pg_proc where oid=to_regprocedure('public.guarni_process_location(uuid,uuid,boolean)')");await c.db.exec(sql);await c.db.exec(sql);const after=await c.one("select prosrc,prosecdef,proacl,proconfig from pg_proc where oid=to_regprocedure('public.guarni_process_location(uuid,uuid,boolean)')");assert.deepEqual(after,{...before,prosrc:before.prosrc.replaceAll('CONFIRMAR PEDIDO','CONFIRMAR')});
});


test('Consultas menos literales: el modelo clasifica el tema y el servidor responde sin inventar ni tocar el carrito',async t=>{
 t.after(mockEnvironment());let response;let calls=0;
 t.mock.method(globalThis,'fetch',async url=>{if(url.includes('viejo_ai_usage'))return Response.json(null);calls++;return Response.json({status:'completed',output_text:JSON.stringify(response)});});
 const before={...draft(),reference_price_context:true},settings={...defaults,business_address:'Dirección configurada de prueba'};
 const cases=[['¿Hasta cuándo reciben encargos?', 'hours', /Atención:/],['¿Cómo puedo llegar hasta ahí?', 'location', /Dirección configurada/],['¿Con qué se abona?', 'payments', /Transferencia/],['¿Me lo pueden acercar?', 'fulfillment', /retiro/]];
 for(const [text,topic,expected] of cases){response={intent:'info',query:topic,items:[],fulfillment:'delivery',address:'INVENTADA',payment:'Efectivo'};const command=await interpret(text,before,catalog,settings);assert.deepEqual(command,{intent:'info',topic});const result=reduceOrder({text,cart:before,catalog,settings,command});assert.deepEqual(result.cart,before);assert.match(result.reply,expected);}
 assert.equal(calls,cases.length);
 response={intent:'info',query:'hours',items:[]};assert.throws(()=>validateInterpretation(response,'quiero una tarta de pollo',before,catalog,catalog),/unconfirmed/,'Un pedido no se puede desviar a horarios');
 assert.throws(()=>validateInterpretation({intent:'info',query:'invented'},'¿Qué onda con eso?',before,catalog,catalog),/unconfirmed/);
});
