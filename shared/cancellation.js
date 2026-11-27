import {commercialText} from './catalog.js';
import {intentText} from './customer-language.js';
import {withoutGreeting} from './social-language.js';
const active=new Set(['draft','needs_info','pending','accepted','preparing','ready','out_for_delivery']);
export function cancellationIntent(text){
 if(typeof text!=='string')return null;
 const source=withoutGreeting(text),t=commercialText(intentText(source));
 if(/^\s*\/(?:cancelar|reiniciar)\s*$/i.test(source))return {kind:'cancel',draftOnly:true,legacy:true};
 const verb=/\b(?:cancelar|cancela|cancelame|cancelalo|cancelarlo|cancele|anular|anula|anulame|anulalo)\b/.test(t);
 const refusal=/\b(?:ya )?no (?:voy a querer|quiero|necesito|deseo)\b/.test(t);
 if(!verb&&!refusal)return null;
 if(verb&&/\bno\b.*\b(?:cancel\w*|anul\w*)\b/.test(t))return {kind:'keep'};
 const question=/[¿?]/.test(source)||/\b(?:si|puedo|podria|quizas|tal vez|que pasa|como)\b/.test(t);
 const whole=/\b(?:pedido|orden|solicitud|borrador|carrito)\b/.test(t);
 if(question&&(verb||refusal&&whole))return {kind:'question'};
 if(refusal&&!verb){
  if(/\b(?:agregar|sumar|anadir)\b/.test(t))return {kind:'keep'};
  if(!whole&&/\b(?:mas|nada)\b/.test(t))return {kind:'ambiguous'};
  if(!whole)return null;
 }
 if(verb&&!whole&&!/^(?:cancelar|cancela|cancelame|cancelalo|anular|anula|anulame)(?: por favor)?$/.test(t))return {kind:'partial'};
 const number=t.match(/(?:#|\b(?:pedido|orden|solicitud)\s+(?:numero\s+)?)\s*(\d+)/)?.[1]||source.match(/#\s*(\d+)/)?.[1];
 return {kind:'cancel',draftOnly:/\b(?:borrador|carrito)\b|\bsin enviar\b/.test(t),number:number?Number(number):null,service:/\bbuffet\b/.test(t)?'buffet':/\bchiperia\b/.test(t)?'chiperia':null};
}
export function cancellationCommand(text,cart,orders=[]){
 const request=cancellationIntent(text);if(!request)return null;
 const unchanged=message=>({intent:'clarify',message});
 if(request.kind==='keep')return unchanged('De acuerdo, no cancelé ni modifiqué tu pedido. Cuando quieras, seguimos.');
 if(request.kind==='ambiguous')return unchanged('¿Querés cancelar el pedido o solamente dejar de agregar productos? Tu pedido sigue igual.');
 if(request.kind==='question')return unchanged('Si todavía es un borrador, podés pedir CANCELAR BORRADOR. Si ya lo enviaste al local, el equipo debe revisar la cancelación. No cambié tu pedido.');
 if(request.kind==='partial')return unchanged('¿Querés quitar un producto o cancelar todo el pedido? Indicá el producto y la cantidad, o escribí CANCELAR PEDIDO. Tu pedido sigue igual.');
 if(request.draftOnly&&request.service&&request.service!==cart.service)return unchanged('Elegí primero el servicio del borrador que querés cancelar. Conservamos tus pedidos.');
 if(request.draftOnly)return {intent:'cancel_draft',legacy:request.legacy,message:'Borrador cancelado. Conservamos el historial y los pedidos ya enviados al local; esos pedidos no se cancelaron.'};
 const candidates=orders.filter(order=>active.has(order.status)&&(!request.number||order.number===request.number)&&(!request.service||order.service===request.service));
 if(request.number&&!candidates.length)return unchanged('No identifiqué un pedido activo con ese número en esta conversación. Tu pedido sigue igual; el equipo puede revisarlo.');
 if(candidates.length){
  if(candidates.length>1||cart.items?.length&&!request.number)return unchanged('Hay '+(cart.items?.length?'un borrador sin enviar y ':'')+'pedidos registrados'+(candidates.length===1?'':' para revisar')+': '+candidates.slice(0,5).map(order=>'#'+order.number+' de '+(order.service==='buffet'?'buffet':'chipería')).join(', ')+'. Escribí CANCELAR BORRADOR o indicá CANCELAR PEDIDO # y el número. No cambié nada.');
  return {intent:'cancellation_review',message:'Recibí tu solicitud de cancelación del pedido #'+candidates[0].number+'. Paso la conversación al equipo para que la revise. El pedido todavía no está cancelado; el local debe confirmártelo.'};
 }
 if(request.service&&cart.service&&request.service!==cart.service)return unchanged('Tu borrador actual corresponde a '+(cart.service==='buffet'?'buffet':'chipería')+'. Indicá qué borrador querés cancelar; no cambié nada.');
 if(!cart.items?.length)return unchanged('No veo un borrador con productos ni un pedido activo para cancelar en esta conversación. El equipo puede ayudarte a revisarlo.');
 return {intent:'cancel_draft',message:'Cancelé el borrador sin enviarlo al local. Conservamos el historial y el borrador del otro servicio.'};
}
