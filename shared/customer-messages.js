import {commercialText,categoryKey,productName,sellable} from './catalog.js';
import {matchCommercial,hasProductEvidence} from './catalog-matching.js';
import {messageIntent} from './message-intent.js';
import {intentText} from './customer-language.js';
import {WEEK_DAYS,deliveryMode} from './settings.js';
import {deliveryStatusCommand,deliveryQueryRequested,explicitReferenceCommand} from './delivery-context.js';

const queryGrammar=new Set(commercialText('que cual cuales tambien mas tienen tiene tenes hay habra tendran tendria venden vende disponible esta estan cuesta cuanto sale precio costo puedo podria podes favor porfa porfavor gracias hola buenas saber saberlo me decime decir decirme un una uno dos tres cuatro cinco seis siete ocho nueve diez el la lo los las a con para quiero quisiera de del hoy ahora y e por su ustedes consulta consultar necesito solo solamente buffet chiperia').split(' '));
const format=n=>new Intl.NumberFormat('es-PY').format(n)+' Gs.';

export function paymentChoice(text,settings){
 if(/[?¿]/.test(String(text))||/\b(?:no|sin|puedo|podria|quizas|tal vez)\b/.test(commercialText(text)))return null;
 const t=commercialText(intentText(text)),prefix=/^(?:pago|pagare|voy a pagar|quiero pagar|prefiero pagar)\b(?: con| por| en)?\s+/;
 if(!prefix.test(t))return null;
 const choice=t.replace(prefix,'').replace(/ (?:por favor|gracias)$/,'');
 const matches=(settings.payment_methods||[]).filter(method=>commercialText(method)===choice);
 return matches.length===1?matches[0]:null;
}

export function readOnlyCommand(text,cart,catalog,settings={}){
 const language=commercialText(intentText(text)),found=matchCommercial(text,catalog,{context:cart?.conversation}),state=messageIntent(text,{hasProducts:hasProductEvidence(found),catalog});
 if(state.kind==='human')return null;
 if(/^(?:pago|pagare|voy a pagar|quiero pagar|prefiero pagar)\b/.test(language))return {intent:'info',topic:'payments'};
 if(state.kind==='social'){
  if(!cart?.service&&/^(?:hola|buen)/.test(language))return null;
  return {intent:'social',message:/gracias/.test(language)?'¡Gracias a vos! Si necesitás algo más, seguimos por acá.':'De acuerdo. Cuando quieras, seguimos con tu pedido.'};
 }
 if(state.kind==='query'&&state.topic==='status')return null;
 const mentioned=state.kind==='query'&&['buffet','chiperia'].find(service=>new RegExp('\\b'+service+'\\b').test(language));
 if(mentioned&&cart?.service&&mentioned!==cart.service)return {intent:'cross_service_query',topic:state.topic,service:mentioned};

 if((state.topic==='fulfillment'||state.topic==='price'&&/\b(?:delivery|envio|domicilio)\b/.test(language))&&cart?.service&&deliveryMode(settings,cart.service)==='disabled')return {intent:'clarify',message:cart.service==='chiperia'?'La chipería trabaja solo con retiro en el local; el delivery corresponde al buffet. Tu pedido sigue igual.':'Este servicio no tiene delivery disponible. Podés retirar en el local. Tu pedido sigue igual.'};
 if(cart?.service==='chiperia'&&cart.items?.length&&cart.fulfillment==='delivery'&&deliveryQueryRequested(text)&&!(state.topic==='location'&&/\b(?:donde|ubicados?|local)\b/.test(language)))return {intent:'clarify',message:'La chipería trabaja solo con retiro en el local; el delivery corresponde al buffet. Conservamos tus productos. Escribí RETIRO para continuar.'};
 const delivery=deliveryStatusCommand(text,cart);
 if(delivery&&!(state.kind==='query'&&state.topic==='location'))return delivery;
 if(!/[?¿]/.test(String(text))&&/^(?:referencia\b|direccion\s*:)/.test(categoryKey(text))&&!explicitReferenceCommand(text,cart))return {intent:'clarify',message:'Para adjuntar esa referencia, primero prepará el pedido para delivery. Tu borrador sigue guardado.'};
 if(!cart?.items?.length&&deliveryQueryRequested(text)&&!(state.kind==='query'&&state.topic==='location'))return null;
 if(state.kind!=='query')return null;
 if(['general','price','availability'].includes(state.topic)&&!found.matches.length&&catalog.some(product=>product.category&&(' '+language+' ').includes(' '+commercialText(product.category)+' ')))return null;
 if(['status','menu'].includes(state.topic))return null;
 if(['hours','payments','location'].includes(state.topic))return {intent:'info',topic:state.topic};

 if(state.topic==='fulfillment')return {intent:'clarify',message:'Podés solicitar retiro o delivery según la disponibilidad del local. ¿Preferís retirar en el local o pedir delivery? Tu pedido sigue igual.'};
 if(state.topic==='general')return /[?¿]/.test(String(text))?null:{intent:'clarify',message:'No entendí bien la consulta. Tu pedido sigue guardado. ¿Podés explicármela de otra manera o preferís hablar con el equipo?'};
 if(!cart?.service)return {intent:'clarify',message:'¿Querés consultar el buffet o la chipería? Elegí un servicio para mostrarte sus opciones.'};
 if(state.topic==='price'&&cart?.service==='buffet')return null;
 if(state.topic==='price'&&/\b(?:delivery|envio|domicilio)\b/.test(language)&&!found.matches.length)return {intent:'clarify',message:'El costo de envío lo confirma el equipo después de revisar la ubicación. Tu pedido sigue igual.'};
 if(found.matches.some(m=>m.unsafeSemantic))return {intent:'clarify',message:'No identifiqué el producto con suficiente seguridad. Escribí su nombre y variedad, o MENÚ para ver las opciones. Tu pedido sigue igual.'};
 const unknown=found.unknown.filter(word=>!queryGrammar.has(commercialText(intentText(word)))&&!/^\d+$/.test(word));
 if(unknown.length)return {intent:'clarify',message:(cart.service==='buffet'&&found.matches.some(m=>m.prefixOnly)?'No identifiqué ese plato completo: no encontré «':'No encontré «')+unknown.join(' ').slice(0,140)+'» en las opciones vigentes de este servicio. Escribí MENÚ para consultarlas. Tu pedido sigue igual.'};
 if(found.ambiguous.length)return {intent:'clarify',message:'¿Qué variedad querés consultar? '+[...new Set(found.ambiguous.flatMap(m=>m.products.map(productName)))].join(', ')+'. No cambié tu pedido.'};
 if(!found.matches.length)return {intent:'clarify',message:'¿Qué producto querés consultar? Podés escribir MENÚ para ver las opciones. Tu pedido sigue guardado.'};
 return {intent:'clarify',message:found.matches.map(m=>{
  const p=m.product,available=p.service==='buffet'?p.available:sellable(p);
  if(!available)return productName(p)+(p.service!=='buffet'&&p.price===null?' no tiene un precio confirmado.':' no está disponible para nuevos pedidos.');
  return productName(p)+(state.topic==='availability'?' está disponible.':p.service==='buffet'?': el encargado acuerda el importe.':': '+format(p.price)+'.');
 }).join('\n')+' No cambié tu pedido.'};
}

export function informationReply(command,cart,settings){
 if(command.topic==='fulfillment'){
  if(!cart.service)return 'El buffet puede tener delivery; la chipería trabaja solo con retiro. ¿Qué servicio querés consultar?';
  const mode=deliveryMode(settings,cart.service);
  return mode==='disabled'?'Este servicio trabaja con retiro en el local. El delivery corresponde al buffet según su disponibilidad.':mode==='pending'?'Podés retirar en el local. Para delivery, el equipo debe confirmar disponibilidad, horario y costo.':'Podés retirar en el local o solicitar delivery entre '+settings.schedules[cart.service].delivery_open+' y '+settings.schedules[cart.service].delivery_close+'. El equipo confirma cada entrega y su costo.';
 }
 if(command.topic==='payments')return settings.payment_methods?.length?'Podés pagar con: '+settings.payment_methods.join(', ')+'. La forma de pago no cambia tu pedido.':'El equipo debe confirmar los métodos de pago disponibles.';
 if(command.topic==='location')return settings.business_address?'Estamos en '+settings.business_address+'.':settings.branch?'Nuestra sucursal es '+settings.branch+'. El equipo puede compartirte la dirección exacta.':'El equipo puede compartirte la dirección exacta del local.';
 const hours=settings.schedules?.[cart.service];
 if(!hours)return '¿Querés consultar los horarios del buffet o de la chipería?';
 const days=WEEK_DAYS.filter(day=>hours.days.includes(day.value)).map(day=>day.label).join(', ');
 const delivery=deliveryMode(settings,cart.service);
 return 'Atención: '+days+', '+hours.open+'–'+hours.close+'.'+(delivery==='disabled'?(cart.service==='chiperia'?' Chipería: solo retiro en el local. El delivery corresponde al buffet.':' Delivery deshabilitado para este servicio.'):delivery==='pending'?' El horario de delivery debe coordinarse con el equipo.':' Delivery: '+hours.delivery_open+'–'+hours.delivery_close+'.');
}
