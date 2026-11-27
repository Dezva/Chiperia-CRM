import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {emptyCart,reduceOrder,demoCommand,activeCatalog,localDate} from '../shared/viejo-engine.js';
import {withCategories} from '../shared/catalog.js';
import {databaseV11,mockEnvironment,restBridge} from './v11-helpers.mjs';
import {runWorker} from '../netlify/lib/worker.mjs';
const items=[{id:'arroz',name:'Arroz primavera',category_id:'guarniciones',available:true},{id:'sopa',name:'Sopa paraguaya',category_id:'guarniciones',available:true},{id:'agotado',name:'Puré de papas',category_id:'guarniciones',available:false},{id:'carne',name:'Tapa asado al horno',category_id:'carne',available:true},{id:'pollo',name:'Milanesa de pollo',category_id:'pollo_chancho',available:true},{id:'pendiente',name:'Por revisar',category_id:'pending',available:false}];
const menus=[{day:localDate(),status:'published',items}];
const say=(text,cart=emptyCart('Prueba','buffet'),catalog=[],menu=menus)=>reduceOrder({text,cart,catalog,menus:menu,command:demoCommand(text,cart,activeCatalog(cart.service,catalog,menu))});

test('Consulta natural de categoría buffet: filtra opciones actuales sin reiniciar ni modificar borradores',()=>{
 const before={...say('dos arroz primavera para retirar').cart,reference_price_context:true};
 for(const text of ['Puedes darme las guarniciones que provee el buffet','Podés decirme qué guarniciones tienen','Me das las guarniciones','Quiero ver las guarniciones del día','GUARNICIONES','¿Cuáles son las guarniciones?']){
  const r=say(text,before);assert.deepEqual(r.cart,before,text);assert.match(r.reply,/Arroz primavera/);assert.match(r.reply,/Sopa paraguaya/);assert.doesNotMatch(r.reply,/Tapa asado|Milanesa|Puré|Por revisar|Reinicié|pedido completo/,text);
 }
 const fresh=say('Puedes darme las guarniciones que provee el buffet',emptyCart());assert.equal(fresh.cart.service,'buffet');assert.deepEqual(fresh.cart.items,[]);assert.match(fresh.reply,/Sopa paraguaya/);assert.doesNotMatch(fresh.reply,/Tapa asado/);
 const saved={...emptyCart('Prueba','chiperia'),items:[{variant_id:'previo',qty:2}],conversation:{focus_ids:['previo']}};const cross=say('Puedes darme las guarniciones que provee el buffet',saved);assert.deepEqual(cross.cart,saved);assert.match(cross.reply,/Sopa paraguaya/);assert.doesNotMatch(cross.reply,/Tapa asado/);
 const empty=say('Puedes darme las guarniciones que provee el buffet',before,[],[{...menus[0],items:items.filter(p=>p.category_id!=='guarniciones')}]);assert.deepEqual(empty.cart,before);assert.match(empty.reply,/no hay productos disponibles en Guarniciones/);assert.doesNotMatch(empty.reply,/Tapa asado/);
 const missing=say('Puedes darme las guarniciones que provee el buffet',before,[],[]);assert.deepEqual(missing.cart,before);assert.match(missing.reply,/no hay menú.*hoy/);
});

test('Consulta de categoría dinámica chipería y compras concretas conservan sus recorridos',()=>{
 const categories=[{id:'nueva',name:'Dulces artesanales',active:true}],catalog=withCategories([{id:'nuevo',name:'Alfajor casero',service:'chiperia',variant:'Base',category_id:'nueva',available:true,active:true,price:7000}],categories);
 const before=emptyCart('Prueba','chiperia');const r=say('Puedes darme los dulces artesanales que ofrecen',before,catalog);assert.deepEqual(r.cart,before);assert.match(r.reply,/Alfajor casero: 7.000/);
 const bought=say('quiero dos arroz primavera');assert.equal(bought.cart.items[0].qty,2);assert.equal(bought.cart.items[0].variant_id,'arroz');
 const invalid=say('quiero dos arroz primavera y una pizza',bought.cart);assert.deepEqual(invalid.cart.items,[]);assert.match(invalid.reply,/Reinicié/);
 const price=say('Cuánto cuestan las guarniciones');assert.match(price.reply,/40.000/);assert.deepEqual(price.cart.items,[]);
});

test('Worker/PostgreSQL: consulta de guarniciones de la captura mantiene pedido, ubicación y conversación sin IA',async t=>{
 const c=await databaseV11({v17:true,pickup:true});t.after(()=>c.db.close());t.after(mockEnvironment());const bridge=restBridge(c);t.mock.method(globalThis,'fetch',bridge.fetch);
 await c.db.exec("update guarni_settings set config=jsonb_set(config,'{bot_enabled}','true')");await c.staff('menu',{id:randomUUID(),day:localDate(),status:'published',reviewed:true,items});
 let id;const say=async text=>{const ing=await c.rpc('guarni_ingest',[randomUUID(),'595000005454','Prueba',text]);id=ing.conversation_id||id;await runWorker();return c.one('select * from guarni_conversations where id=$1',[id]);};
 await say('buffet');await say('dos arroz primavera');let r=await say('delivery');await c.rpc('guarni_ingest_location',[randomUUID(),r.wa_id,'Prueba',{latitude:-25,longitude:-57},'location']);await runWorker();
 const before=(await c.one('select cart from guarni_conversations where id=$1',[id])).cart;assert.ok(before.delivery_location_id);
 r=await say('Puedes darme las guarniciones que provee el buffet');assert.deepEqual(r.cart,before);assert.equal(r.mode,'bot');
 const messages=(await c.db.query("select body from guarni_messages where conversation_id=$1 and direction='outbound'",[id])).rows;assert.ok(messages.some(m=>m.body.includes('Arroz primavera')&&m.body.includes('Sopa paraguaya')&&!m.body.includes('Tapa asado')));
 assert.equal((await c.one('select count(*)::int n from guarni_orders')).n,0);assert.equal(bridge.calls.some(c=>c.path.includes('responses')),false);
});
