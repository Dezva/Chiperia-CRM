import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {migrateCatalogDemo,withCategories} from '../shared/catalog.js';
import {demoCommand,emptyCart,reduceOrder,defaults,localDate} from '../shared/viejo-engine.js';
import {validateInterpretation} from '../shared/conversation-context.js';
import {messageIntent} from '../shared/message-intent.js';

const data={catalog:JSON.parse(await readFile(new URL('../catalogo-el-viejo.json',import.meta.url)))};migrateCatalogDemo(data);
const catalog=withCategories(data.catalog,data.categories),config={...defaults,business_address:'Dirección ficticia del local',payment_methods:['Efectivo','Transferencia']};
const say=(text,cart=emptyCart('Prueba','chiperia'),list=catalog,menus=[])=>reduceOrder({text,cart,catalog:list,menus,settings:config,command:demoCommand(text,cart,cart.service==='buffet'?menus[0]?.items.map(p=>({...p,service:'buffet',price:null,variant:'Base'}))||[]:list)});
const ids=cart=>cart.items.map(item=>[item.variant_id,item.qty]);

test('Conversación completa: consulta de variedad → incremento → retiro → pago consultado → eliminación sin perder observaciones',()=>{
 let result=say('Quiero dos empanadas de carne sin cebolla');assert.equal(result.cart.items[0].notes,'sin cebolla');
 for(const text of ['Gracias.','Perfecto.','¿Dónde están ubicados?','¿Hasta qué hora atienden?','¿Puedo pagar por transferencia?','¿Tienen pizza?','¿Puedo pasar a retirar?','¿Qué significa eso?','Empanadas de carne habrá','Necesito ayuda','Quiero que dejes de repetir el mensaje','Quiero ver mi pedido para retirar']){
  const before=structuredClone(result.cart);result=say(text,before);assert.deepEqual(result.cart,before,text);assert.equal(result.kind,'reply');assert.doesNotMatch(result.reply,/Reinicié|a_coordinar|commercial_equivalence/);
 }
 const menuOnly=say('¿Qué venden?',result.cart);assert.deepEqual(menuOnly.cart.items,result.cart.items);assert.match(menuOnly.reply,/Tradicional.*Gs\./);assert.doesNotMatch(menuOnly.reply,/¿De qué producto/);
 const before=structuredClone(result.cart);result=say('¿También tienen de pollo?',before);assert.deepEqual(result.cart,before);assert.match(result.reply,/Pollo está disponible/);assert.doesNotMatch(result.reply,/6\.000/,'Disponibilidad no es una consulta de precios');
 result=say('Entonces agregame una de pollo.',result.cart);assert.deepEqual(ids(result.cart),[['empanada-carne',2],['empanada-pollo',1]]);assert.equal(result.cart.items[0].notes,'sin cebolla');
 result=say('Para retirar.',result.cart);assert.equal(result.cart.fulfillment,'retiro');
 const selected=structuredClone(result.cart);result=say('¿Puedo pagar por transferencia?',result.cart);assert.deepEqual(result.cart,selected);assert.match(result.reply,/Transferencia/);assert.doesNotMatch(result.reply,/Tarjeta|Atención:/);
 result=say('Pago con transferencia',result.cart);assert.equal(result.cart.payment,'Transferencia');assert.deepEqual(result.cart.items,selected.items);
 const chosen=structuredClone(result.cart);result=say('¿Puedo pagar en efectivo?',result.cart);assert.deepEqual(result.cart,chosen);
 result=say('Pago con tarjeta',result.cart);assert.deepEqual(result.cart,chosen);assert.match(result.reply,/Efectivo.*Transferencia/);
 result=say('Quitame las empanadas.',result.cart);assert.deepEqual(ids(result.cart),ids(selected));assert.match(result.reply,/Carne.*Pollo/);
 result=say('Pollo',result.cart);assert.deepEqual(ids(result.cart),[['empanada-carne',2]]);assert.equal(result.cart.items[0].notes,'sin cebolla');assert.match(result.reply,/Quité.*Pollo/);
 result=say('Quitame una empanada de carne',result.cart);assert.deepEqual(ids(result.cart),[['empanada-carne',1]]);assert.equal(result.cart.items[0].notes,'sin cebolla');
 result=say('Quitame las empanadas',result.cart);assert.deepEqual(result.cart.items,[]);assert.equal(result.cart.conversation.retry_order,undefined);assert.match(result.reply,/quedó sin artículos/);
 let pending=say('Quitame las empanadas',say('2 empanadas de carne y una de pollo').cart).cart;
 let fresh=say('Entonces agregame una de pollo',pending);assert.deepEqual(ids(fresh.cart),[['empanada-carne',2],['empanada-pollo',2]],'Un incremento explícito abandona la aclaración de eliminación');
 fresh=say('Quitame dos de pollo',fresh.cart);assert.deepEqual(ids(fresh.cart),[['empanada-carne',2]]);
});

test('Compra inválida: identifica pizza, distingue agotado/inactivo/sin precio y exige lista nueva sin restos',()=>{
 const initial=say('2 empanadas de pollo').cart;
 const failed=say('Quiero 3 chipas tradicionales, 2 empanadas de carne y una pizza.',initial);
 assert.match(failed.reply,/Reconocí.*Tradicional.*Empanada.*Carne.*pizza/s);assert.match(failed.reply,/pedido completo/);assert.deepEqual(failed.cart.items,[]);
 const valid=say('1 bollito',failed.cart);assert.deepEqual(ids(valid.cart),[['bollito-base',1]]);
 for(const [change,pattern] of [[{available:false},/agotado/],[{active:false},/inactivo/],[{price:null,available:false},/precio individual pendiente/]]){
  const list=catalog.map(p=>p.id==='bollito-base'?{...p,...change}:p),failure=say('Quiero un bollito',initial,list);assert.match(failure.reply,pattern);assert.deepEqual(failure.cart.items,[]);assert.equal(failure.cart.conversation.retry_order,true);
 }
 for(const text of ['Quiero -2 tradicionales','Quiero 1.5 tradicionales','Quiero 0 tradicionales','Quiero 31 tradicionales']){const failure=say(text,initial);assert.deepEqual(failure.cart.items,[],text);assert.match(failure.reply,/enteras|entre 1 y 30/);}
});

test('Guardas frente a IA adversarial: consultas/sociales no cambian precios, modalidad, nombre, dirección ni carrito',()=>{
 const cart={...say('2 empanadas de carne').cart,fulfillment:'delivery',delivery_location_id:'punto-propio',address:'Referencia propia',saved_carts:{buffet:{items:[],service:'buffet',delivery_location_id:'otro-punto'}}};
 const malicious={intent:'update_cart',items:[{variant_id:'bollito-base',qty:30,notes:'inventada'}],fulfillment:'retiro',address:'INVENTADA',payment:'Transferencia',customer_name:'INVENTADO',context:{retry_order:true}};
 for(const text of ['Gracias.','Perfecto.','¿Dónde están ubicados?','¿Puedo pagar por transferencia?','¿Tienen pizza?','¿Puedo pasar a retirar?']){
  const command=validateInterpretation(structuredClone(malicious),text,cart,catalog,catalog);const result=reduceOrder({text,cart,catalog,settings:config,command});assert.deepEqual(result.cart,cart,text);assert.equal(result.kind,'reply');
 }
 const valid=validateInterpretation({...malicious,items:[{variant_id:'empanada-carne',qty:2,notes:''}]},'Quiero 2 empanadas de carne',cart,catalog,catalog);
 assert.equal(valid.fulfillment,undefined);assert.equal(valid.payment,undefined);assert.equal(valid.address,undefined);assert.equal(valid.customer_name,undefined);
 assert.throws(()=>validateInterpretation({intent:'update_cart',items:[{variant_id:'empanada-carne',qty:2,notes:''}]},'Quiero dos empanadas de carne con queso',cart,catalog,catalog),/unconfirmed/,'No descartar una modificación de ingredientes sin validarla');
 const unknown=say('No entendí nada de eso',cart);assert.deepEqual(unknown.cart.items,cart.items);assert.doesNotMatch(unknown.reply,/Reinicié/);
 const informal=say('Me gustó mucho',cart);assert.deepEqual(informal.cart,cart,'Tener ubicación no convierte un comentario en referencia');
 const addressWithoutIntent=say('San Martín 123',cart);assert.deepEqual(addressWithoutIntent.cart,cart,'Un texto ambiguo no debe borrar el pedido ni inventar una dirección');
 const reference=say('Referencia: casa de prueba, portón azul',cart);assert.match(reference.cart.address,/casa de prueba/);assert.deepEqual(reference.cart.items,cart.items);
 const namedPlace=say('Referencia: frente al local de empanadas de carne, portón azul',cart);assert.match(namedPlace.cart.address,/local de empanadas de carne/);assert.deepEqual(namedPlace.cart.items,cart.items,'Un lugar que menciona alimentos no es un pedido nuevo');
 const pickup={...cart,fulfillment:'retiro',delivery_location_id:null};assert.deepEqual(say('Dirección: frente al local de empanadas de carne',pickup).cart,pickup);
 const cancelled=say('CANCELAR PEDIDO',{...cart,conversation:{pending:{operation:'remove',candidate_ids:['empanada-carne']}}});assert.deepEqual(cancelled.cart.items,[]);assert.deepEqual(cancelled.cart.saved_carts,cart.saved_carts);assert.equal(cancelled.cart.delivery_location_id,null);assert.match(cancelled.reply,/cancelado/);
});

test('Cantidades repetidas, incrementos, correcciones y notas de varias líneas conservan independencia',()=>{
 let result=say('1 sandwich de verdura sin mayonesa\n2 sandwiches de verdura\n3 empanadas de carne sin cebolla');
 assert.deepEqual(ids(result.cart),[['sandwich-verdura',3],['empanada-carne',3]]);assert.equal(result.cart.items[0].notes,'sin mayonesa');assert.equal(result.cart.items[1].notes,'sin cebolla');
 result=say('1 sandwich de verdura sin mayonesa\n2 sandwiches de verdura\n3 empanadas de carne sin cebolla',result.cart);assert.deepEqual(ids(result.cart),[['sandwich-verdura',3],['empanada-carne',3]]);
 result=say('Quiero dos empanadas de carne',result.cart);assert.equal(result.cart.items[1].notes,'sin cebolla');
 result=say('Agregame dos más',result.cart);assert.equal(result.cart.items[1].qty,4);assert.equal(result.cart.items[0].qty,3);
 result=say('Al final quiero solamente dos',result.cart);assert.equal(result.cart.items[1].qty,2);assert.equal(result.cart.items[0].notes,'sin mayonesa');
 assert.match(result.reply,/6\.000 Gs\. c\/u/);assert.match(result.reply,/Observación: sin cebolla/);assert.match(result.reply,/aceptación final.*local/);assert.doesNotMatch(result.reply,/variant_id|a_coordinar/);
});

test('Buffet: consultas de estado y disponibilidad no se vuelven tarifas; observaciones y precios humanos intactos',()=>{
 const menus=[{day:localDate(),status:'published',items:[{id:'a',name:'Arroz',category_id:'guarniciones',available:true},{id:'p',name:'Milanesa de pollo',category_id:'pollo_chancho',available:true}]}];
 const initial=say('2 arroz sin sal\nMilanesa de pollo',emptyCart('Prueba','buffet'),[],menus).cart;assert.equal(initial.items[0].notes,'sin sal');assert.equal(initial.subtotal,null);
 for(const text of ['¿Cuánto falta para mi pedido?','¿Hay milanesa de pollo?','Perfecto.','¿Puedo pagar por transferencia?']){
  const result=say(text,initial,[],menus);assert.deepEqual(result.cart,initial,text);assert.doesNotMatch(result.reply,/Gs\.|Reinicié/);
 }
 const failed=say('Milanesa de carne\nArroz',initial,[],menus);assert.deepEqual(failed.cart.items,[]);assert.match(failed.reply,/Milanesa de carne/);
 const restored=say('Milanesa de pollo',failed.cart,[],menus);assert.equal(restored.cart.items.length,1);assert.equal(restored.cart.items[0].unit_price,null);
});

test('Intenciones: distinguir pregunta, modificación, confirmación, cancelación, humano e incertidumbre',()=>{
 for(const [text,kind] of [['Perfecto.','social'],['¿Tienen pizza?','query'],['Quiero una pizza','purchase'],['Quitame las empanadas','modification'],['Agregame dos más','modification'],['Confirmar pedido','confirmation'],['Cancelar pedido','cancellation'],['Voy a retirar','fulfillment'],['Quiero hablar con alguien del equipo','human'],['No entendí nada','unknown']])assert.equal(messageIntent(text).kind,kind,text);
});
