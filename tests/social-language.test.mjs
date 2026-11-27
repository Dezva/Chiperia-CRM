import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {greetingParts,withoutGreeting} from '../shared/social-language.js';
import {messageIntent} from '../shared/message-intent.js';
import {migrateCatalogDemo,withCategories} from '../shared/catalog.js';
import {emptyCart,reduceOrder,demoCommand,activeCatalog,localDate} from '../shared/viejo-engine.js';
import {databaseV11,mockEnvironment,restBridge} from './v11-helpers.mjs';
import {runWorker} from '../netlify/lib/worker.mjs';
const data={catalog:JSON.parse(await readFile(new URL('../catalogo-el-viejo.json',import.meta.url)))};migrateCatalogDemo(data);const catalog=withCategories(data.catalog,data.categories);
const say=(text,cart=emptyCart(),menus=[])=>reduceOrder({text,cart,catalog,menus,command:demoCommand(text,cart,activeCatalog(cart.service,catalog,menus))});
const greetings=['Hola qtal?','Hola buenas','Hola buenas qtal?','HOLA BUENAS','¡Hola, buenas tardes!','Hloa buenas','Holaa buenas','Buen día','Buenas noches, ¿cómo están?','hola que tal','Hola q tal?','¿Qué tal?','Hola, todo bien?','Hola 😊'];

test('Saludos componibles y abreviados: cliente nuevo, servicio elegido y borrador activo sin pérdida de estado',()=>{
 const draft=say('dos empanadas de carne para retirar').cart;
 for(const before of [emptyCart(),emptyCart('Prueba','chiperia'),{...draft,reference_price_context:true},emptyCart('Prueba','buffet'),{...draft,conversation:{retry_order:true}},{...draft,conversation:{pending:{candidate_ids:['empanada-pollo'],qty:2}}}]){
  for(const text of greetings){assert.equal(messageIntent(text,{catalog}).topic,'greeting',text);const r=say(text,before);assert.match(r.reply,/¡Hola!/);assert.doesNotMatch(r.reply,/No entendí|Reinicié|pedido completo|aceptado/);assert.deepEqual(r.cart,before,text);assert.equal(r.kind,'reply');if(!before.service)assert.match(r.reply,/buffet.*chipería/);}
 }
});

test('Saludo seguido de solicitud: conserva productos, cantidades, preguntas, negaciones y el texto original restante',()=>{
 const prefix='Hola buenas qtal? ';
 assert.equal(withoutGreeting(prefix+'Quiero dos Empanadas de Carne sin cebolla'),'Quiero dos Empanadas de Carne sin cebolla');
 assert.equal(say(prefix+'Quiero dos empanadas de carne').cart.service,'chiperia');
 const order=say(prefix+'Quiero dos empanadas de carne sin cebolla',emptyCart('Prueba','chiperia'));assert.equal(order.cart.service,'chiperia');assert.equal(order.cart.items[0].variant_id,'empanada-carne');assert.equal(order.cart.items[0].qty,2);assert.equal(order.cart.items[0].notes,'sin cebolla');assert.notEqual(order.kind,'submit');
 const before=order.cart;
 for(const text of [prefix+'¿Cuál es el menú?',prefix+'quiero el menú del día']){const r=say(text,before);assert.match(r.reply,/Tradicional/);assert.deepEqual(r.cart,before);}
 const menus=[{day:localDate(),status:'published',items:[{id:'arroz',name:'Arroz',category_id:'guarniciones',available:true}]}];assert.match(say(prefix+'Cuáles son las guarniciones del menú de hoy',emptyCart('Prueba','buffet'),menus).reply,/Arroz/);
 const ready=say('retiro',before).cart;
 assert.equal(say(prefix+'CONFIRMAR',ready).kind,'submit');
 for(const text of ['Hola, ¿confirmar?','Hola, confirmar?','Hola, ¿confirmar','Hola, no confirmar','Hola? confirmar']){assert.notEqual(say(text,ready).kind,'submit',text);assert.equal(withoutGreeting(text).includes('?')||withoutGreeting(text).includes('¿')||withoutGreeting(text).includes('no'),true,text);}
 assert.equal(greetingParts('Hola, quiero 2 empanadas').only,false);assert.equal(greetingParts('Hola, hablar con un encargado').only,false);assert.equal(say('Hola, quiero hablar con un encargado',before).kind,'human');
});

test('No oculta productos comerciales exactos, texto desconocido ni cantidades detrás de un saludo',()=>{
 const product={id:'saludo-comercial',name:'Buenas tardes',variant:'Base',service:'chiperia',available:true,active:true,price:5000};
 assert.equal(greetingParts('Buenas tardes',[product]),null);assert.equal(withoutGreeting('Buenas tardes',[product]),'Buenas tardes');assert.notEqual(messageIntent('Buenas tardes',{catalog:[product],hasProducts:true}).kind,'social');
 for(const text of ['',null,{},'Hola quiero una pizza','Hola 2','hola desconocido','hola buenas tengo una consulta de delivery'])assert.notEqual(greetingParts(text)?.only,true,String(text));
 const before=say('dos empanadas de carne').cart,invalid=say('Hola qtal? quiero una pizza',before);assert.deepEqual(invalid.cart.items,[]);assert.match(invalid.reply,/pizza|pedido completo/);
});

test('Worker/PostgreSQL: saludos antes/después del pedido pendiente y /reiniciar, sin borrar cliente ni alterar pedidos registrados',async t=>{
 const c=await databaseV11({v17:true,pickup:true});t.after(()=>c.db.close());t.after(mockEnvironment());const bridge=restBridge(c);t.mock.method(globalThis,'fetch',bridge.fetch);await c.db.exec("update guarni_settings set config=jsonb_set(config,'{bot_enabled}','true')");
 let id;const say=async text=>{const seen=new Set((await c.db.query("select id from guarni_messages where direction='outbound'")).rows.map(m=>m.id));const ing=await c.rpc('guarni_ingest',[randomUUID(),'595000004646','Prueba',text]);id=ing.conversation_id||id;await runWorker();const row=await c.one('select * from guarni_conversations where id=$1',[id]);const fresh=(await c.db.query("select id,body from guarni_messages where direction='outbound'")).rows.filter(m=>!seen.has(m.id));assert.equal(fresh.length,1);return {...row,reply:fresh[0].body};};
 let r=await say('Hola buenas qtal?');assert.match(r.reply,/¡Hola!.*buffet.*chipería/);assert.equal(r.cart.service,null);
 r=await say('Hola qtal? quiero dos empanadas de carne');assert.equal(r.cart.service,'chiperia');assert.equal(r.cart.items[0].qty,2);const client=r.client_id,before=r.cart;
 for(const text of ['Hola qtal?','Hola buenas']){r=await say(text);assert.deepEqual(r.cart,before);assert.match(r.reply,/¡Hola!.*guardado/);assert.equal(r.client_id,client);}
 await say('retiro');await say('confirmar');const order=await c.one('select * from guarni_orders');assert.equal(order.status,'pending');
 for(const text of ['Hola buenas','Hola qtal?']){r=await say(text);assert.match(r.reply,/¡Hola!/);assert.deepEqual(await c.one('select * from guarni_orders'),order);}
 await say('/reiniciar');r=await say('Hola buenas qtal?');assert.match(r.reply,/¡Hola!/);assert.equal(r.client_id,client);assert.deepEqual(r.cart.items,[]);assert.deepEqual(await c.one('select * from guarni_orders'),order);
 assert.equal(bridge.calls.some(c=>c.path.includes('responses')),false);
});
