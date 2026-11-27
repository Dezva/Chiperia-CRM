import {matchCommercial,hasProductEvidence,orderFillers,quantityWords} from './catalog-matching.js';
import {productName,sellable} from './catalog.js';
import {retryOrderCommand} from './order-retry.js';
import {isPurchaseAttempt} from './message-intent.js';

export function unavailableReason(product){
 const name=productName(product);
 if(product.service==='buffet')return name+(product.category_id==='pending'?' está pendiente de revisión y todavía no se ofrece.':' está agotado o no disponible en el menú de hoy.');
 if(product.active===false||product.category_active===false||product.legacy_generic)return name+' está inactivo y no disponible para nuevos pedidos.';
 if(!Number.isSafeInteger(product.price)||product.price<=0)return name+' tiene el precio individual pendiente de confirmación.';
 return name+' está agotado y no disponible en este momento.';
}

export function quantityProblem(text){
 return /(?:^|\s)-\s*\d|\d+[.,]\d+/.test(String(text))?'Las cantidades deben ser unidades enteras entre 1 y 30.':null;
}

export function invalidOrderCommand(text,cart,catalog,{reason}={}){
 const found=matchCommercial(text,catalog,{context:cart?.conversation});
 if(!isPurchaseAttempt(text,{hasProducts:hasProductEvidence(found),catalog}))return {intent:'clarify',message:'No entendí bien el mensaje. Tu pedido sigue guardado. ¿Podés explicarme qué necesitás o preferís hablar con el equipo?'};
 if(reason||quantityProblem(text))return retryOrderCommand(reason||quantityProblem(text));
 const blocked=found.matches.filter(m=>!(found.unknown.length&&(m.variantOnly||m.prefixOnly))&&(m.product.service==='buffet'?!m.product.available:!sellable(m.product)));
 if(blocked.length)return retryOrderCommand([...new Set(blocked.map(m=>unavailableReason(m.product)))].join(' '));
 if(found.matches.some(m=>m.qty<1||m.qty>30))return retryOrderCommand('Las cantidades deben ser unidades enteras entre 1 y 30.');
 const unknownIndices=found.unmatched.filter(i=>!orderFillers.has(found.tokens[i])&&!quantityWords[found.tokens[i]]&&!/^\d+$/.test(found.tokens[i])&&!['al','final','en','total','cambia','cambiar','cambiame','corrige','corregi','no'].includes(found.tokens[i]));
 const unknown=unknownIndices.map(i=>found.tokens[i]);
 // Un prefijo con un calificativo desconocido no acredita el plato completo.
 const unsafeSegments=found.segments.filter(segment=>unknownIndices.some(i=>i>=segment.start&&i<segment.end)&&found.matches.some(m=>m.prefixOnly&&m.start>=segment.start&&m.end<=segment.end));
 const missing=unsafeSegments.length?unsafeSegments.map(segment=>segment.source):unknown;
 const known=[...new Set(found.matches.filter(m=>!m.variantOnly&&!unsafeSegments.some(segment=>m.start>=segment.start&&m.end<=segment.end)).map(m=>productName(m.product)))];
 if(missing.length){
  const label=[...new Set(missing)].join(' ').slice(0,160);
  return retryOrderCommand((known.length?'Reconocí '+known.join(', ')+', pero ':'')+'no encontré «'+label+'» en '+(cart?.service==='buffet'?'el menú del buffet de hoy.':'el catálogo vigente.'));
 }
 return retryOrderCommand('No pude identificar con seguridad todos los productos y cantidades de ese pedido.');
}
