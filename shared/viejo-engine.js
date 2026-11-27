import {cancellationCommand} from './cancellation.js';
import {withoutGreeting} from './social-language.js';
import {referencePriceRequest,referencePriceReply} from './reference-prices.js';
import {deterministicConversation,fulfillmentCommand,categoryRequest} from './conversation-context.js';
import {commercialText,sellable,productName} from './catalog.js';
import {deliveryMode,WEEK_DAYS} from './settings.js';
import {BUFFET_CATEGORIES,CATEGORY_IDS} from './buffet-categories.js';
import {normalize} from './order-engine.js';
import {intentText,isCustomerConfirmation as isConfirmation} from './customer-language.js';
import {initialOrder} from './initial-order.js';
import {fulfillmentChoice} from './fulfillment.js';
import {repeatOrderPrompt,retryOrderHelp,retryOrderCommand,unclearMessageHelp} from './order-retry.js';
import {readOnlyCommand,informationReply,paymentChoice} from './customer-messages.js';
import {humanRequested,isPurchaseAttempt,messageIntent} from './message-intent.js';
import {matchCommercial,hasProductEvidence} from './catalog-matching.js';
import {invalidOrderCommand} from './order-diagnostics.js';
import {cartOperationCommand} from './cart-operations.js';
import {explicitReferenceCommand} from './delivery-context.js';
export {normalize,isConfirmation,fulfillmentChoice};
export const money=n=>n==null?'Pendiente':new Intl.NumberFormat('es-PY').format(n)+' Gs.';
const servicePrompt='Elegí un servicio para continuar: respondé Buffet o Chipería.';
export const greeting='¡Buenas! Bienvenido a El Viejo. '+servicePrompt;
export const defaults={business_name:'El Viejo',branch:'Ruta Villeta–Alberdi',logo_url:'assets/abuelito-provisional.png',timezone:'America/Asuncion',bot_enabled:false,payment_methods:['Efectivo','Tarjeta de débito','Tarjeta de crédito','QR','Transferencia'],fulfillment_modes:['retiro','delivery'],schedules:{buffet:{days:[1,2,3,4,5,6],open:'11:00',close:'15:00',delivery_mode:'scheduled',delivery_open:'12:00',delivery_close:'14:00'},chiperia:{days:[1,2,3,4,5,6],open:'05:15',close:'18:30',delivery_mode:'disabled',delivery_open:null,delivery_close:null}},reference_prices:{guarniciones:40000,carne:80000,pollo_chancho:75000}};
export function localDate(now=new Date()){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Asuncion',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);}
export function serviceChoice(text){const t=intentText(text),state=messageIntent(text);if(['query','social','human'].includes(state.kind)&&state.topic!=='menu'&&!/\b(?:quiero ver|mostrame|ver el menu)\b/.test(t))return null;if(state.kind==='unknown'&&!/^(?:el |la )?(?:buffet|chiperia)(?: y (?:buffet|chiperia))?[.!]*$/.test(t))return null;const b=/\bbuffet\b/.test(t),c=/\bchiperia\b/.test(t);return b&&c?'mixed':b?'buffet':c?'chiperia':null;}
export function emptyCart(name='',service=null){return {items:[],service,customer_name:name,fulfillment:'a_coordinar',address:'',payment:'a_coordinar',quoted:false,delivery_location_id:null,saved_carts:{}};}
export function activeCatalog(service,catalog,menus=[],now=new Date()){
 if(service==='buffet'){const menu=menus.find(m=>m.day===localDate(now)&&m.status==='published');return (menu?.items||[]).map(p=>({...p,service:'buffet',price:null,variant:'Base',available:p.available!==false&&CATEGORY_IDS.includes(p.category_id)&&p.category_id!=='pending'}));}
 return catalog.filter(p=>p.service==='chiperia');
}
export function availability(service,fulfillment,settings=defaults,now=new Date()){
 const mode=deliveryMode(settings,service);
 if(fulfillment==='delivery'&&mode==='disabled')return 'El delivery está deshabilitado para este servicio. El equipo puede ayudarte a coordinar otra modalidad.';
 if(fulfillment==='delivery'&&mode==='pending')return 'El horario de delivery está pendiente de confirmación. El equipo debe coordinarlo antes de aceptar.';
 const s=settings.schedules?.[service]||defaults.schedules[service];
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/Asuncion',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now).map(p=>[p.type,p.value]));
 const day=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(parts.weekday),time=parts.hour+':'+parts.minute;
 if(!s.days.includes(day)||time<s.open||time>=s.close)return 'Fuera del horario de atención. El equipo debe revisar la solicitud.';
 if(fulfillment==='delivery'&&(!s.delivery_open||!s.delivery_close))return 'El horario de delivery está pendiente de confirmación. El equipo revisará la solicitud.';
 if(fulfillment==='delivery'&&(time<s.delivery_open||time>=s.delivery_close))return 'Fuera del horario de delivery. El equipo debe revisar la solicitud.';
 return null;
}
function price(p){return Number.isSafeInteger(p.price)&&p.price>0;}
export function quote(items,service,catalog){
 if(!['buffet','chiperia'].includes(service)||!Array.isArray(items)||items.length<1||items.length>30)throw Error('Seleccioná productos de un servicio.');
 const seen=new Set();
 const lines=items.map(x=>{
  const p=catalog.find(p=>p.id===x.variant_id&&p.service===service);
  if(!p||!p.available||(service==='chiperia'&&!sellable(p)))throw Error('Producto inactivo, agotado o sin precio confirmado.');
  if(!Number.isSafeInteger(x.qty)||x.qty<1||x.qty>30)throw Error('La cantidad debe ser entre 1 y 30.');
  if(seen.has(p.id))throw Error('Agrupá las cantidades del mismo producto.');seen.add(p.id);
  return {variant_id:p.id,name:p.name,variant:p.variant||'Base',qty:x.qty,unit_price:service==='buffet'?null:p.price,notes:String(x.notes||'').slice(0,300)};
 });
 return {items:lines,subtotal:service==='buffet'?null:lines.reduce((s,x)=>s+x.qty*x.unit_price,0)};
}
export function confirmation(order,input,catalog,{mode,owner_id,actor,menus=[],now=new Date(),settings=defaults}={}){
 if(input.fulfillment==='delivery'&&deliveryMode(settings,order.service)==='disabled')throw Error('El delivery está deshabilitado para este servicio.');
 const q=quote(order.items,order.service,activeCatalog(order.service,catalog,menus,now));
 if(!['retiro','delivery'].includes(input.fulfillment))throw Error('Confirmá retiro o delivery.');
 if(order.fulfillment!==input.fulfillment)throw Error('Revisá la modalidad del pedido antes de confirmar.');
 if(input.fulfillment==='delivery'&&!order.delivery_location_id)throw Error('Falta la ubicación puntual.');
 if(input.fulfillment==='delivery'&&(!Number.isSafeInteger(input.shipping_fee)||input.shipping_fee<0))throw Error('Establecé explícitamente el costo del delivery, incluso si es cero.');
 if(order.group_id&&!input.group_reviewed)throw Error('Revisá los pedidos relacionados para no duplicar el delivery.');
 const warning=availability(order.service,input.fulfillment,settings,now);if(warning&&!input.schedule_reviewed)throw Error(warning);
 if(order.service==='buffet'&&(mode!=='human'||owner_id!==actor))throw Error('Tomá la conversación para acordar el importe del buffet.');
 if(order.service==='buffet'&&(!Number.isSafeInteger(input.buffet_amount)||input.buffet_amount<=0||!input.price_agreed))throw Error('Registrá el importe acordado con el cliente.');
 const changed=order.service==='chiperia'&&JSON.stringify(q.items.map(x=>x.unit_price))!==JSON.stringify(order.items.map(x=>x.unit_price));
 if(changed)return {requote:true,...q};
 const amount=order.service==='buffet'?input.buffet_amount:q.subtotal,fee=input.fulfillment==='delivery'?input.shipping_fee:0;
 return {...q,subtotal:amount,shipping_fee:fee,total:amount+fee};
}
export function sameItems(a,b){const fields=['variant_id','name','variant','qty','unit_price','notes'];return JSON.stringify(a.map(x=>fields.map(k=>x[k])))===JSON.stringify(b.map(x=>fields.map(k=>x[k])));}
export function summary(cart){
 const modality=cart.service==='chiperia'&&cart.fulfillment==='delivery'?'Por definir: chipería solo para retirar':{retiro:'Retiro en el local',delivery:'Delivery'}[cart.fulfillment]||'A coordinar';
 return cart.items.map(x=>`${x.qty} × ${x.name}${x.variant==='Base'?'':' · '+x.variant}${cart.service==='chiperia'?': '+money(x.qty*x.unit_price)+' ('+money(x.unit_price)+' c/u)':''}${x.notes?' · Observación: '+x.notes:''}`).join('\n')+'\n'+(cart.service==='buffet'?'Buffet: importe pendiente; el encargado lo acordará con vos.':'Subtotal: '+money(cart.items.reduce((s,x)=>s+x.qty*x.unit_price,0))+'\nLa aceptación final corresponde al local.')+'\nModalidad: '+modality+(cart.fulfillment==='delivery'?'. Envío pendiente de revisión.':'.');
}
export function demoCommand(text,cart,catalog,categories=[]){
 text=withoutGreeting(text,catalog);
 const advisory=readOnlyCommand(text,cart,catalog);if(advisory)return advisory;
 const mode=fulfillmentCommand(text,cart,catalog);if(mode)return mode;
 if(cart?.service==='buffet'){const pricing=referencePriceRequest(text,cart,catalog);if(pricing)return pricing;}
 const resolved=deterministicConversation(text,cart,catalog,{categories});if(resolved)return resolved;
 return cart?.service?invalidOrderCommand(text,cart,catalog):{intent:'help'};
}
function restartedOrder(cart,command,catalog){
 const reset={...cart,items:[],subtotal:cart.service==='buffet'?null:0,quoted:false,conversation:{retry_order:true}};
 delete reset.reference_price_context;
 const reason=command.message.replace('\n'+repeatOrderPrompt,'');
 return {cart:reset,kind:'reply',reply:reason+'\n'+retryOrderHelp(cart,catalog)};
}
function fulfillmentPrompt(cart,settings){return deliveryMode(settings,cart.service)==='disabled'?'Este servicio es para retirar en el local. ¿Vas a retirarlo?':'¿Vas a retirar o querés delivery?';}
function menuReply(cart,list,command={}){
 if(cart.service==='buffet'&&!list.length)return 'Todavía no hay menú del buffet confirmado para hoy. Podés pedir atención del encargado.';
 const offered=list.filter(p=>(!command.category_ids?.length||command.category_ids.includes(p.category_id||p.category))&&p.available&&(cart.service==='buffet'||sellable(p)));
 return offered.length?offered.map(p=>p.name+(p.variant&&p.variant!=='Base'?' · '+p.variant:'')+(cart.service==='chiperia'?': '+money(p.price):'')).join('\n')+'\n'+(cart.service==='buffet'?'El encargado acuerda los precios finales.':'Elegí productos y cantidades. El local confirma cada pedido.'):'Por ahora no hay productos disponibles'+(command.category_names?.length?' en '+command.category_names.join(' y '):' en este servicio')+'. El equipo puede ayudarte.';
}
export function reduceOrder({text,cart:old,catalog=[],menus=[],command={},profileName='',settings=defaults,now=new Date(),orders=[]}){
 text=withoutGreeting(text,[...activeCatalog('chiperia',catalog,menus,now),...activeCatalog('buffet',catalog,menus,now)]);
 let cart=structuredClone({...emptyCart(profileName),...old});
 const cancellation=cancellationCommand(text,cart,orders);
 if(cancellation){
  if(cancellation.intent==='cancel_draft'){
   const saved={...(cart.saved_carts||{})};delete saved[cart.service];
   return {cart:{...emptyCart(cart.customer_name||profileName,cancellation.legacy?cart.service:null),saved_carts:saved},kind:'reply',reply:cancellation.message};
  }
  return {cart,kind:cancellation.intent==='cancellation_review'?'human':'reply',reply:cancellation.message};
 }

 const intake=initialOrder(text,cart,{chiperia:activeCatalog('chiperia',catalog,menus,now),buffet:activeCatalog('buffet',catalog,menus,now)},serviceChoice(text));
 if(intake?.needsService)return {cart:intake.cart,kind:'reply',reply:'Esos productos pueden corresponder a buffet o chipería. ¿De cuál servicio querés pedir? Conservé tu mensaje para continuar con las mismas cantidades.'};
 if(intake){cart=intake.cart;text=intake.text;command=demoCommand(text,cart,activeCatalog(cart.service,catalog,menus,now));}
 let selected=serviceChoice(text);
 const payment=paymentChoice(text,settings);
 if(payment&&cart.service)return {cart:{...cart,payment},kind:'reply',reply:'Anoté '+payment+' como forma de pago. Los productos y cantidades siguen igual. El local confirmará la recepción del pago por separado.'};
 const advisory=readOnlyCommand(text,cart,activeCatalog(cart.service,catalog,menus,now),settings);
 if(advisory){
  if(advisory.intent==='cross_service_query'){
   const target=advisory.service,targetCart={...cart,service:target,items:[],conversation:{}},targetList=activeCatalog(target,catalog,menus,now);
   let reply;
   if(advisory.topic==='price'&&target==='buffet')reply=referencePriceReply(text,targetList,settings);
   else if(['hours','payments','location'].includes(advisory.topic))reply=informationReply({topic:advisory.topic},targetCart,settings);
   else if(advisory.topic==='menu')reply=menuReply(targetCart,targetList,categoryRequest(text,targetList,target==='buffet'?BUFFET_CATEGORIES:[])||{});
   else {const response=readOnlyCommand(text,targetCart,targetList,settings);reply=response?.message||'Podés escribir '+(target==='buffet'?'BUFFET':'CHIPERÍA')+' para consultar las opciones de ese servicio.';}
   return {cart,kind:'reply',reply:reply+'\nTu borrador de '+(cart.service==='buffet'?'buffet':'chipería')+' sigue igual.'};
  }
  return {cart,kind:'reply',reply:advisory.intent==='info'?informationReply(advisory,cart,settings):advisory.message};
 }
 if(command.intent==='technical_error')return {cart,kind:'reply',reply:'No pude procesar tu mensaje en este momento. Tu pedido sigue guardado. ¿Podés intentarlo nuevamente? Si el problema continúa, podés pedir atención del equipo.'};
 if(command.intent==='info'&&command.topic&&messageIntent(text).kind==='query')return {cart,kind:'reply',reply:informationReply(command,cart,settings)};
 if(['/cancelar','/reiniciar','cancelar pedido'].includes(normalize(text)))return {cart:{...emptyCart(cart.customer_name||profileName,cart.service),saved_carts:cart.saved_carts||{}},kind:'reply',reply:'Borrador cancelado. Conservamos el historial y el borrador del otro servicio.'};
 if(selected==='mixed')return {cart,kind:'reply',reply:'Prepararemos solicitudes separadas y relacionadas para buffet y chipería. Empezá eligiendo un servicio; el buffet puede tener delivery y la chipería es para retirar en el local.'};
 if(selected&&selected!==cart.service){const initialPoint=cart.service?null:cart.delivery_location_id;const saved=cart.saved_carts||{};for(const draft of Object.values(saved))if(draft&&typeof draft==='object')draft.delivery_location_id=null;if(cart.service)saved[cart.service]={...cart,delivery_location_id:null,saved_carts:{}};cart={...emptyCart(profileName,selected),...saved[selected],service:selected,saved_carts:saved,delivery_location_id:selected==='chiperia'?null:initialPoint};delete cart.reference_price_context;command=(selected==='buffet'&&referencePriceRequest(text,cart,activeCatalog('buffet',catalog,menus,now)))||{intent:'menu'};}
 const list=cart.service?activeCatalog(cart.service,catalog,menus,now):[];
 const mentionedProducts=matchCommercial(text,list,{context:cart.conversation});
 const menuIntent=messageIntent(text,{hasProducts:hasProductEvidence(mentionedProducts),catalog:list});
 if(cart.service&&menuIntent.topic==='menu')return {cart,kind:'reply',reply:menuReply(cart,list,{...command,...categoryRequest(text,list,cart.service==='buffet'?BUFFET_CATEGORIES:[])})};
 const reference=explicitReferenceCommand(text,cart),edit=reference?null:cartOperationCommand(text,cart,list);if(reference)command=reference;else if(edit)command=edit;
 const mode=fulfillmentCommand(text,cart,list);if(mode)command=mode;
 if(!mode&&cart.service==='buffet'&&(command.intent==='reference_prices'||referencePriceRequest(text,cart,list))){
  cart.reference_price_context=true;
  return {cart,kind:'reply',reply:referencePriceReply(text,list,settings)};
 }
 if(humanRequested(text)||command.intent==='human')return {cart,kind:'human',reply:'El equipo continuará la atención. El asistente queda pausado.'};
 if(!cart.service){
  if(command.intent==='clarify')return {cart,kind:'reply',reply:command.message};
  const affirmative=/^si(?: por favor)?$/.test(commercialText(text));
  return {cart,kind:'reply',reply:affirmative?servicePrompt:unclearMessageHelp(cart,[])};
 }
 if(command.intent==='retry_order'){
  const found=matchCommercial(text,list,{context:cart.conversation});
  if(!isPurchaseAttempt(text,{hasProducts:hasProductEvidence(found),catalog:list}))return {cart,kind:'reply',reply:unclearMessageHelp(cart,list)};
  return restartedOrder(cart,command,list);
 }
 delete cart.reference_price_context;
 const requestedMode=fulfillmentChoice(text)||command.fulfillment;
 const rejectedDelivery=requestedMode==='delivery'&&deliveryMode(settings,cart.service)==='disabled';
 if(rejectedDelivery){command={...command,fulfillment:undefined};cart.fulfillment='a_coordinar';cart.delivery_location_id=null;}
 if(command.context)cart.conversation=structuredClone(command.context);
 if(['retiro','delivery'].includes(command.fulfillment)){cart.fulfillment=command.fulfillment;if(command.fulfillment==='retiro')cart.delivery_location_id=null;}
 if(command.intent==='clarify')return {cart,kind:'reply',reply:command.message};
 if(command.intent==='draft_status'){
  let preview=cart,changed=false;try{const fresh=quote(cart.items,cart.service,list);changed=!sameItems(fresh.items,cart.items);preview={...cart,...fresh};}catch{return {cart,kind:'reply',reply:'Tengo tu pedido en borrador, pero cambió la disponibilidad. El equipo puede ayudarte a revisarlo. No lo envié al local.'};}
  const next=(cart.fulfillment==='a_coordinar'||cart.fulfillment==='delivery'&&deliveryMode(settings,cart.service)==='disabled')?fulfillmentPrompt(cart,settings):cart.fulfillment==='delivery'&&!cart.delivery_location_id?'Falta tu ubicación puntual de WhatsApp.':'Escribí CONFIRMAR para enviar la solicitud al local.';
  return {cart,kind:'reply',reply:'Tengo este pedido en borrador; todavía no está enviado al local:\n'+summary(preview)+'\n'+(changed?'Los precios cambiaron; se revisarán antes de enviar.\n':'')+next};
 }
 if(!list.length&&cart.service==='buffet')return {cart,kind:'reply',reply:'Todavía no hay menú del buffet confirmado para hoy. Podés pedir atención del encargado.'};
 if(command.intent==='cart_edit'){
  if(!edit)return {cart,kind:'reply',reply:'No pude validar ese cambio. Tu pedido sigue guardado.'};
  if(!edit.items.length)return {cart:{...cart,items:[],subtotal:cart.service==='buffet'?null:0,quoted:false,conversation:{}},kind:'reply',reply:edit.message+' El borrador quedó sin artículos. Podés enviarme un pedido nuevo cuando quieras.'};
  try{cart={...cart,...quote(edit.items,cart.service,list),quoted:true};}catch{return restartedOrder(cart,invalidOrderCommand(text,cart,list,{reason:'Cambió la disponibilidad de los productos del borrador.'}),list);}
  return {cart,kind:'reply',reply:edit.message+'\n'+summary(cart)+'\nEl local debe aceptar la solicitud cuando la envíes.'};
 }
 if(command.intent==='update_cart'){try{cart={...cart,...quote(command.items,cart.service,list),quoted:false};}catch{return restartedOrder(cart,retryOrderCommand('Cambió la disponibilidad del catálogo y no pude registrar todos los productos.'),list);}}
 const choice=rejectedDelivery?null:requestedMode;
 if(['retiro','delivery'].includes(choice)){cart.fulfillment=choice;if(choice==='retiro')cart.delivery_location_id=null;}
 if(command.address){cart.address=String(command.address).trim().slice(0,500);cart.address_location_id=null;}
 if(command.customer_name)cart.customer_name=String(command.customer_name).slice(0,120);
 if(settings.payment_methods.includes(command.payment))cart.payment=command.payment;
 if(rejectedDelivery){if(cart.items.length)cart.quoted=true;return {cart,kind:'reply',reply:(cart.items.length?summary(cart)+'\n':'')+(cart.service==='chiperia'?'La chipería trabaja solo con retiro en el local; el delivery corresponde al buffet.':'Este servicio no tiene delivery disponible.')+' Conservamos tus productos. Escribí RETIRO para elegir esa modalidad.'};}
 if(isConfirmation(text)){
  if(!cart.items.length)return {cart,kind:'reply',reply:cart.conversation?.retry_order?retryOrderHelp(cart,list):'Elegí productos y cantidades antes de enviar la solicitud.'};
  let fresh;try{fresh=quote(cart.items,cart.service,list);}catch{return restartedOrder(cart,retryOrderCommand('Cambió la disponibilidad del catálogo y no pude registrar todos los productos.'),list);}
  if(!cart.quoted||!sameItems(fresh.items,cart.items)){cart={...cart,...fresh,quoted:true};return {cart,kind:'reply',reply:'Revisá el resumen actualizado:\n'+summary(cart)+'\nEscribí CONFIRMAR.'};}
  if(!['retiro','delivery'].includes(cart.fulfillment))return {cart,kind:'reply',reply:fulfillmentPrompt(cart,settings)};
  if(cart.fulfillment==='delivery'&&deliveryMode(settings,cart.service)==='disabled')return {cart,kind:'reply',reply:'El delivery está deshabilitado para este servicio. Elegí retiro o pedí atención del equipo.'};
  if(cart.fulfillment==='delivery'&&!cart.delivery_location_id)return {cart,kind:'reply',reply:'Enviá tu ubicación puntual de WhatsApp para este delivery.'};
  const warning=availability(cart.service,cart.fulfillment,settings,now);
  return {cart,kind:'submit',reply:'Solicitud pendiente de revisión humana.'+(warning?' '+warning:'')};
 }
 if(command.intent==='menu'){
  return {cart,kind:'reply',reply:menuReply(cart,list,command)};
 }
 if(command.intent==='info'){
  const hours=settings.schedules[cart.service],days=WEEK_DAYS.filter(d=>hours.days.includes(d.value)).map(d=>d.label).join(', '),mode=deliveryMode(settings,cart.service);
  const delivery=mode==='disabled'?'Delivery deshabilitado para este servicio.':mode==='pending'?'Horario de delivery pendiente: el equipo debe coordinar antes de aceptar una entrega.':'Delivery: '+hours.delivery_open+'–'+hours.delivery_close+'. El equipo confirma disponibilidad y costo.';
  return {cart,kind:'reply',reply:'Atención: '+days+', '+hours.open+'–'+hours.close+'.\n'+delivery+'\nPagos: '+(settings.payment_methods.join(', ')||'a coordinar con el equipo')+'.'};
 }

 if(cart.conversation?.retry_order)return {cart,kind:'reply',reply:retryOrderHelp(cart,list)};
 if(cart.items.length){cart.quoted=true;return {cart,kind:'reply',reply:(command.intent==='update_cart'?'¡Dale! ':'')+summary(cart)+'\n'+((cart.fulfillment==='a_coordinar'||cart.fulfillment==='delivery'&&deliveryMode(settings,cart.service)==='disabled')?fulfillmentPrompt(cart,settings):cart.fulfillment==='delivery'&&!cart.delivery_location_id?'Enviá tu ubicación puntual de WhatsApp.':'Escribí CONFIRMAR para solicitar revisión del local.')};}
 return {cart,kind:'reply',reply:'Servicio activo: '+cart.service+'. Escribí MENÚ para consultar los productos o el nombre del otro servicio para cambiar.'};
}
