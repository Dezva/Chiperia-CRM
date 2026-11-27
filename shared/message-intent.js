import {BUFFET_CATEGORIES} from './buffet-categories.js';
import {categoryRequest,isCategoryFragment} from './category-query.js';
import {commercialText,productTerms} from './catalog.js';
import {intentText,isCustomerConfirmation as isConfirmation} from './customer-language.js';
import {fulfillmentIntent} from './fulfillment.js';
import {orderStatusRequested} from './order-status.js';

export function humanRequested(text){
 const t=intentText(text);
 if(/\bno (?:quiero|necesito|deseo)\b.*\b(?:humano|persona|encargado|empleado|hablar)\b/.test(t))return false;
 if(/^(?:(?:un|una|el|la) )?(?:humano|persona|encargado|empleado|atencion humana)[.!?]*$/.test(t))return true;
 return /\b(?:hablar|comunicarme|pasame|contactar|que me atienda|quiero|necesito|prefiero)\b.*\b(?:humano|persona|encargado|empleado|alguien del equipo|hablar con alguien)\b/.test(t)||/\b(?:hablar|comunicarme|pasame)\b.*\b(?:alguien|equipo|local)\b/.test(t);
}

// Intenciones lingüísticas generales; no contiene nombres de alimentos ni equivalencias.
export function messageIntent(text,{hasProducts=false,catalog=[]}={}){
 const protectedWords=new Set(catalog.flatMap(product=>productTerms(product).flatMap(term=>term.split(' '))));
 const raw=intentText(text,{protectedWords}),t=commercialText(raw);
 if(isConfirmation(text))return {kind:'confirmation'};
 if(/^(?:referencia\b|direccion\s*:)/.test(raw))return {kind:'reference'};
 if(/^(?:\/cancelar|\/reiniciar|cancelar (?:el )?pedido|cancela (?:el )?pedido)$/.test(raw))return {kind:'cancellation'};
 if(humanRequested(text))return {kind:'human'};
 if(/^(?:(?:muchas|muchisimas) )?(?:gracias|perfecto|perfecta|genial|excelente|entendido|de acuerdo|esta bien|ok|okay|dale|listo|bueno|hola|buenas|buen dia|buenos dias|buenas tardes|buenas noches)(?: (?:gracias|por todo|por la ayuda|igualmente|hasta luego))?$/.test(t))return {kind:'social'};
 if(orderStatusRequested(text))return {kind:'query',topic:'status'};
 const change=/\b(?:agrega\w*|suma\w*|anad\w*|quita\w*|saca\w*|elimina\w*|borra\w*|cambia\w*|corrige|corregi|en total|al final)\b/.test(t);
 const request=/\b(?:quiero|quisiera|querria|dame|deme|necesito|llevo|voy a llevar|voy a querer|me das|me darias|pedir)\b/.test(t);
 if(request&&!hasProducts&&!/\b(?:\d+|un|una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\b/.test(t)&&/\b(?:ayuda|ayudarme|informacion|explicar|explicame|entender|repetir|repitas|mensaje|responder|respuesta)\b/.test(t))return {kind:'query',topic:'general'};
 const mode=fulfillmentIntent(text);
 // Una corrección sobre retiro/delivery prevalece sobre palabras de consultas negadas.
 // Pedir información en una frase cotidiana no equivale a comprar un artículo.
 const show=/\b(?:ver|mostrar|mostrame|pasame|pasas|mandame|envias|enviar|consultar|conocer|saber)\b/.test(raw);
 const negated=/\b(?:no|sin|nunca)\b/.test(t),quantity=/\b(?:\d+|un|una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\b/.test(t);
 // Una categoría consultada no es un producto desconocido. Las cantidades y las
 // modificaciones conservan el recorrido de compra; los nombres exactos también.
 const category=categoryRequest(raw,catalog,!catalog.length||/\bbuffet\b/.test(raw)?BUFFET_CATEGORIES:[]);
 const fragment=isCategoryFragment(raw,category);
 const inquiry=/\b(?:que|cual|cuales|puedes|podes|podrias|podria|quisiera|quiero|necesito|darme|decirme|informacion|lista|opcion|ofrece|ofrecen|provee|tienen|tenes|hay)\b/.test(t);
 if(category&&!quantity&&!change&&!negated&&(!hasProducts||show||fragment)&&
    !/\b(?:precio|costo|tarifa|valor|cuanto|kilo)\b/.test(t)&&
    (show||inquiry||request||fragment))return {kind:'query',topic:'menu'};
 const menu=/\b(?:menu|catalogo|carta)\b/.test(t)&&(!hasProducts&&!quantity||show||/\b(?:menu|catalogo|carta)\b/.test(commercialText(text)));
 if(menu&&!change&&!negated&&(/\b(?:el menu|menu dia|menu hoy)\b/.test(t)||/^(?:menu|catalogo|carta)[.!?]*$/.test(t)))return {kind:'query',topic:'menu'};
 if((!hasProducts||show)&&!change&&!negated){
  if(menu)return {kind:'query',topic:'menu'};
  if(show&&/\b(?:opcion|producto|plato)\b/.test(t))return {kind:'query',topic:'menu'};
  if(show&&/\b(?:precio|costo|tarifa|valor)\b/.test(t))return {kind:'query',topic:'price'};
  if(/\b(?:horario|a que hora|hasta que hora)\b/.test(t))return {kind:'query',topic:'hours'};
  if(/\b(?:forma pago|metodo pago|como .*pagar|aceptan)\b/.test(t)&&/\b(?:pago|pagar|transferencia|tarjeta|efectivo|qr)\b/.test(t))return {kind:'query',topic:'payments'};
  if(/\b(?:direccion|donde|ubicados|ubicado)\b/.test(t)&&!mode.mentioned&&!/\b(?:ya|envie|mande|mi pedido)\b/.test(t))return {kind:'query',topic:'location'};
  if(show&&!mode.mentioned&&!/\b(?:tienen|tenes|hay|venden|ofrecen)\b/.test(raw)&&!/\b(?:\d+|un|una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\b/.test(t))return {kind:'query',topic:'menu'};
 }
 if(menu&&!hasProducts&&!change&&negated)return {kind:'query',topic:'general'};
 if(mode.choice&&!hasProducts&&!change)return {kind:'fulfillment'};
 const offers=/\b(?:tenes|tienen|tiene|vende|venden|vendes|hay|sirven|ofrecen)\b/.test(raw);
 const query= offers||/[?¿]/.test(String(text))||/\b(?:tienen|tiene|tenes|hay|habra|tendran|tendria|venden|vende|disponible|cuanto|donde|horario|hasta que hora|a que hora|puedo|se puede|forma pago|metodo pago)\b/.test(t);
 if(query&&!change&&!/\b(?:me das|me darias|dame|deme|llevo|voy a llevar|voy a querer)\b/.test(t)){
  if(/\b(?:horario|atienden|atiende|abren|abre|cierran|cierra|hasta que hora|a que hora)\b/.test(t))return {kind:'query',topic:'hours'};
  if(/\b(?:pago|pagar|forma pago|metodo pago|transferencia|tarjeta|efectivo|qr)\b/.test(t))return {kind:'query',topic:'payments'};
  if(/\b(?:donde|direccion|ubicados|ubicado|local|ubicacion)\b/.test(t)&&!hasProducts&&!/\b(?:ya|envie|enviada|mande|mandada|recibiste|mi pedido|delivery)\b/.test(t))return {kind:'query',topic:'location'};
  if((mode.mentioned||/\b(?:retiro|retirar|buscar|delivery|domicilio)\b/.test(t))&&!hasProducts&&!/\b(?:precio|costo|cuanto)\b/.test(t))return {kind:'query',topic:'fulfillment'};
  if(/\b(?:precio|cuanto|cuesta|sale|costo|tarifa|valor|cotizacion|presupuesto|kilo)\b/.test(t))return {kind:'query',topic:'price'};
  if(menu||/\b(?:clase|tipo)\b/.test(t)||offers&&/\b(?:que|cual|cuales)\b/.test(raw))return {kind:'query',topic:'menu'};
  if(offers||/\b(?:tienen|tiene|tenes|hay|habra|tendran|tendria|venden|vende|disponible)\b/.test(t))return {kind:'query',topic:'availability'};
  return {kind:'query',topic:'general'};
 }
 if(/^(?:horario|forma pago|metodo pago)$/.test(t))return {kind:'query',topic:t==='horario'?'hours':'payments'};
 if(change)return {kind:'modification'};
 if(request||hasProducts||/^(?:\d+|un|una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\b\s+\S/.test(t))return {kind:'purchase'};
 return {kind:'unknown'};
}

export const isPurchaseAttempt=(text,options)=>['purchase','modification'].includes(messageIntent(text,options).kind);
