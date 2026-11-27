import {categoryRequest} from './category-query.js';
export {categoryRequest} from './category-query.js';
import {fulfillmentIntent} from './fulfillment.js';
import {BUFFET_CATEGORIES} from './buffet-categories.js';
import {referencePriceRequest} from './reference-prices.js';
import {orderStatusRequested} from './order-status.js';
import {deliveryStatusCommand,deliveryReferenceCommand,explicitReferenceCommand} from './delivery-context.js';
import {intentText,isCustomerConfirmation as isConfirmation} from './customer-language.js';
import {readOnlyCommand} from './customer-messages.js';
import {humanRequested,isPurchaseAttempt,messageIntent} from './message-intent.js';
import {invalidOrderCommand,quantityProblem} from './order-diagnostics.js';
import {cartOperationCommand} from './cart-operations.js';
import {commercialText,productTerms,productName,sellable} from './catalog.js';
import {orderFillers,matchCommercial,hasProductEvidence,deterministicOrder,orderWithNotes,quantityWords,orderOperation,inlineFulfillment,orderText,requestedItems,clarifyOptions} from './catalog-matching.js';
const grammatical=new Set([...orderFillers,...commercialText('producto productos porfa porfavor podes podria podrias traer traeme pasame preparame enviame mandame favor quiero quisiera necesito gustaria me el la lo los las un una uno y e para a mi agregar agrega agregame dame llevo llevar pedir pedido con bien por favor gracias voy querer te dije al final total cambia cambiar solo solamente unicamente no').split(' ')]);
const queryWords=new Set('que cual cuales tienen tiene hay venden vende disponible disponibles esta estan hoy buffet opcion opciones'.split(' '));
export function recoverCandidates(text,cart,catalog,{expanded=false}={}){
 if(expanded)return [...catalog];
 const found=matchCommercial(text,catalog,{context:cart?.conversation}),ids=new Set([...(cart?.items||[]).map(x=>x.variant_id),...(cart?.conversation?.pending?.candidate_ids||[]),...found.matches.map(m=>m.product.id),...found.ambiguous.flatMap(a=>a.products.map(p=>p.id))]);
 const tokens=commercialText(text).split(' ').filter(t=>t.length>2&&!grammatical.has(t)&&!/^\d+$/.test(t));
 for(const p of catalog){const terms=productTerms(p).join(' ').split(' '),cat=commercialText(p.category||'').split(' ');if(tokens.some(t=>terms.includes(t)||cat.includes(t)))ids.add(p.id);}
 return ids.size?catalog.filter(p=>ids.has(p.id)):[...catalog];
}
export function compactContext(cart,candidates,settings){
 return {service:cart?.service||null,cart:(cart?.items||[]).map(x=>[x.variant_id,x.qty]),...(cart?.conversation?{conversation:cart.conversation}:{}),products:candidates.map(p=>[p.id,productName(p),p.aliases||[],p.service==='buffet'?!!p.available:sellable(p)]),payments:settings.payment_methods||[]};
}
function quantityFollowup(text,cart,catalog){
 const t=commercialText(text),correct=/\b(?:solo|solamente|unicamente|al final|en total|no una|no uno|cambia|cambiame|corrige|corregi)\b/.test(t),increment=orderOperation(text)==='add'&&/\b(?:mas|otro|otra)\b/.test(t);
 if(!correct&&!increment)return null;
 const beforeNo=orderText(text),quantity=beforeNo.split(' ').map(x=>quantityWords[x]||(/^\d+$/.test(x)?Number(x):null)).find(x=>x!==null);
 if(quantity===undefined)return null;
 if(quantity<1||quantity>30)return invalidOrderCommand(text,cart,catalog,{reason:'La cantidad debe estar entre 1 y 30 unidades por producto.'});
 const pending=cart?.conversation?.pending;
 if(pending?.operation==='remove')return {intent:'clarify',message:'Estamos definiendo qué producto quitar. Indicá su nombre y cuántas unidades querés quitar; no cambié el pedido.'};
 if(pending?.candidate_ids?.length){const options=catalog.filter(p=>pending.candidate_ids.includes(p.id));return clarifyOptions(options,correct?quantity:(pending.qty||0)+quantity,pending.operation||'add');}
 const ids=(cart?.conversation?.focus_ids?.length?cart.conversation.focus_ids:(cart?.items||[]).map(x=>x.variant_id)).filter(id=>cart?.items?.some(x=>x.variant_id===id)&&catalog.some(p=>p.id===id));
 if(ids.length!==1)return {intent:'clarify',message:'¿De qué producto querés cambiar la cantidad? Indicá su nombre y el total.'};
 const product=catalog.find(p=>p.id===ids[0]);if(product.service==='buffet'?!product.available:!sellable(product))return {intent:'clarify',message:productName(product)+': no disponible para nuevos pedidos. El equipo puede ayudarte.'};
 const id=ids[0],items=cart.items.map(x=>({variant_id:x.variant_id,qty:x.variant_id===id?(correct?quantity:x.qty+quantity):x.qty,notes:x.notes||''}));
 if(items.some(x=>x.qty>30))return invalidOrderCommand(text,cart,catalog,{reason:'El máximo es 30 unidades por producto.'});
 return {intent:'update_cart',items,context:{focus_ids:[id]},...(inlineFulfillment(text)?{fulfillment:inlineFulfillment(text)}:{})};
}
export function fulfillmentCommand(text,cart,catalog){
 if(explicitReferenceCommand(text,cart))return null;
 // En chipería solo hay retiro. Un sí a esa pregunta elige la modalidad;
 // nunca equivale a enviar o aceptar el pedido.
 if(cart?.service==='chiperia'&&cart.items?.length&&cart.quoted&&cart.fulfillment==='a_coordinar'&&!cart.conversation?.pending&&/^si(?:,? por favor)?[.!]*$/.test(intentText(text)))return {intent:'summary',fulfillment:'retiro'};
 const state=fulfillmentIntent(text);if(!state.mentioned)return null;
 if(orderStatusRequested(text))return null;
 const found=matchCommercial(text,catalog,{context:cart?.conversation});
 if(messageIntent(text,{hasProducts:hasProductEvidence(found),catalog}).topic==='menu')return null;
 if(hasProductEvidence(found))return null;
 if(state.choice)return {intent:'summary',fulfillment:state.choice};
 // Las consultas de precios/horarios conservan su intención; no eligen modalidad.
 if(/\b(?:precio|tarifa|cuanto|horario|costo)\b/.test(commercialText(text)))return null;
 return {intent:'clarify',message:'¿Preferís retirar en el local o pedir delivery? Conservamos tus productos y cantidades.'};
}
export function deterministicConversation(text,cart,catalog,{categories=[]}={}){
 if(humanRequested(text))return {intent:'human'};
 if(messageIntent(text).kind==='cancellation')return ['/cancelar','/reiniciar','cancelar pedido'].includes(String(text).trim().toLowerCase())?{intent:'cancel_order'}:{intent:'clarify',message:'Para cancelar el borrador, escribí CANCELAR PEDIDO. El historial y las solicitudes registradas se conservan.'};
 const advisory=readOnlyCommand(text,cart,catalog);if(advisory)return advisory;
 const reference=explicitReferenceCommand(text,cart);if(reference)return reference;
 const edit=cartOperationCommand(text,cart,catalog);if(edit)return edit;
 if(isConfirmation(text))return {intent:'summary'};
 const mode=fulfillmentCommand(text,cart,catalog);if(mode)return mode;
 if(cart?.service==='buffet'){const pricing=referencePriceRequest(text,cart,catalog);if(pricing)return pricing;}
 if(orderStatusRequested(text)&&cart?.items?.length)return {intent:'draft_status'};
 const status=deliveryStatusCommand(text,cart);if(status)return status;
 const t=commercialText(intentText(text));
 if(/^(?:hola|buenas|buen dia|buenos dias|buenas tardes|buenas noches|gracias|muchas gracias|ok|dale)$/.test(t))return {intent:'help'};
 if(/^(horario|horarios|forma pago|forma pago disponible|metodo pago|metodo pago disponible)$/.test(t))return {intent:'info'};
 if(cart?.service==='buffet'&&!catalog.length)return {intent:'menu'};
 const found=matchCommercial(text,catalog,{context:cart?.conversation}),category=categoryRequest(text,catalog,cart?.service==='buffet'?BUFFET_CATEGORIES:categories),isQuery=/\b(?:que|cual|clase|tipo|vendes|vende|venden|tienen|tiene|hay|mostra|mostrame|solo|unicamente|cuanto|menu|catalogo|carta)\b/.test(t)||category?.category_names?.some(name=>commercialText(name)===t);
 if(messageIntent(text,{hasProducts:hasProductEvidence(found),catalog}).topic==='menu')return {intent:'menu',...(category||{})};
 if(isPurchaseAttempt(text,{hasProducts:hasProductEvidence(found),catalog})&&(quantityProblem(text)||found.matches.some(m=>m.qty<1||m.qty>30)))return invalidOrderCommand(text,cart,catalog);
 if(cart?.service==='buffet'){
  if(/\b(?:menu|carta)\b/.test(t)&&!found.matches.length&&!found.ambiguous.length||/\b(?:que|cual)\b/.test(t)&&/\b(?:plato|hay|tienen|opcion|sirven|venden)\b/.test(t))return {intent:'menu',...(category||{})};
  if(/\b(?:tienen|tiene|hay|disponible|venden)\b/.test(t)&&found.matches.length){
   if(found.unknown.some(word=>!grammatical.has(word)&&!queryWords.has(word)))return {intent:'clarify',message:'No identifiqué ese plato completo en el menú del buffet de hoy. Escribí MENÚ para consultar las opciones. No cambié tu pedido.'};
   return {intent:'clarify',message:found.matches.map(m=>productName(m.product)+(m.product.available?' está disponible en el menú de hoy.':' no está disponible en el menú de hoy.')).join('\n')+' No cambié tu pedido.'};
  }
 }
 // Un nombre/variante específicos gana a una categoría; una consulta de categoría no arma carritos.
 if(category&&isQuery&&!found.matches.some(m=>m.product.variant&&m.product.variant!=='Base')&&!found.matches.some(m=>m.product.name!==m.product.category&&!m.product.legacy_generic))return {intent:'menu',...category};
 if(category&&isQuery&&!found.matches.length)return {intent:'menu',...category};
 if(!found.matches.length&&!found.ambiguous.length){const followup=quantityFollowup(text,cart,catalog);if(followup)return followup;}
 const noted=orderWithNotes(text,cart,catalog);
 const resolved=deterministicOrder(text,cart,catalog);
 if(/\b(precio|cuanto|cuesta|sale|tienen|hay|disponible)\b/.test(t)){
  if(category&&!found.matches.length)return {intent:'menu',...category};
  const f=resolved.found;if(f.ambiguous.length||f.matches.some(m=>m.product.service==='buffet'?!m.product.available:!sellable(m.product)))return resolved.command?.intent==='clarify'?resolved.command:{intent:'clarify',message:'El equipo debe confirmar la variedad y su disponibilidad.'};
  if(f.matches.length)return {intent:'clarify',message:f.matches.map(m=>productName(m.product)+': '+(m.product.service==='buffet'?'importe a acordar con el encargado':new Intl.NumberFormat('es-PY').format(m.product.price)+' Gs.')).join('\n')+'\nNo agregué productos al carrito.'};
  return {intent:'clarify',message:'¿De qué producto querés consultar el precio?'};
 }
 if(noted)return noted;
 if(resolved.command){
  if(resolved.command.intent==='retry_order'||resolved.command.intent==='clarify'&&/entre 1 y 30/.test(resolved.command.message||''))return invalidOrderCommand(text,cart,catalog,{reason:resolved.command.intent==='clarify'?resolved.command.message:undefined});
  return resolved.command;
 }
 const tentative=deterministicOrder(text,cart,catalog,{semantic:true});
 if(tentative.command?.intent==='clarify'&&tentative.found.ambiguous.length&&!tentative.found.unknown.length&&![...tentative.found.matches,...tentative.found.ambiguous].some(m=>m.unsafeSemantic))return tentative.command;
 if(cart?.service==='buffet'&&found.unknown.some(t=>!grammatical.has(t))&&(found.matches.length||found.ambiguous.length||/[\r\n;]/.test(text)||/\b(?:quiero|quisiera|dame|llevo|pedir|pedido|\d+)\b/.test(t))){
  const semantic=matchCommercial(text,catalog,{context:cart?.conversation,semantic:true});
  if(semantic.matches.length&&!semantic.ambiguous.length&&!semantic.matches.some(m=>m.unsafeSemantic)&&semantic.unknown.every(word=>grammatical.has(word)))return null;
  return invalidOrderCommand(text,cart,catalog);
 }
 if(/\b(?:repetir|lee|mensaje)\b/.test(t)&&!found.matches.length)return {intent:'clarify',message:cart?.conversation?.pending?'Decime la variedad que preferís; conservamos la cantidad que pediste.':'Decime qué producto o categoría querés revisar y te muestro solo esas opciones.'};
 return found.matches.length||found.ambiguous.length?null:deliveryReferenceCommand(text,cart);
}
export function validOrderSource(text,cart,catalog){
 if(quantityProblem(text))return false;
 if([false,true].some(semantic=>orderWithNotes(text,cart,catalog,{semantic})?.intent==='update_cart'))return true;
 return [false,true].some(semantic=>{const found=matchCommercial(text,catalog,{context:cart?.conversation,semantic});return found.matches.length&&!found.ambiguous.length&&found.unknown.every(word=>grammatical.has(word))&&found.matches.every(m=>!m.unsafeSemantic&&m.qty>=1&&m.qty<=30&&(m.product.service==='buffet'?m.product.available:sellable(m.product)));});
}
export function validateInterpretation(command,text,cart,catalog,candidates,{semantic=false}={}){
 const advisory=readOnlyCommand(text,cart,catalog);if(advisory)return advisory;
 const reference=explicitReferenceCommand(text,cart);if(reference)return reference;
 const edit=cartOperationCommand(text,cart,catalog);if(edit)return edit;
 const mode=fulfillmentCommand(text,cart,catalog);if(mode)return mode;
 if(cart?.service==='buffet'&&referencePriceRequest(text,cart,catalog))return {intent:'reference_prices'};
 if(!command||typeof command!=='object'||!['update_cart','menu','info','summary','human','help'].includes(command.intent))throw Error('invalid_interpretation');
 if(command.intent==='human'&&!humanRequested(text))throw Error('commercial_equivalence_unconfirmed');
 const requestText=commercialText(text),explicitQuery=/\b(?:menu|catalogo|carta|horario|pago|pagar|precio|cuanto|tienen|hay|disponible|estado)\b/.test(requestText)||/[?¿]/.test(String(text));
 const orderAttempt=!explicitQuery&&requestText.split(' ').some(word=>quantityWords[word]||/^\d+$/.test(word)||['quiero','quisiera','pedir','dame','agrega','agregame'].includes(word));
 if(orderAttempt&&!['update_cart','help','human'].includes(command.intent))throw Error('commercial_equivalence_unconfirmed');
 if(command.intent==='menu'){const request=categoryRequest(text,catalog);if(request)return {intent:'menu',...request};if(command.category){const group=categoryRequest(command.category,catalog);if(!group)throw Error('commercial_equivalence_unconfirmed');return {intent:'menu',...group};}return {intent:'menu'};}
 if(command.intent!=='update_cart'){
  if(command.intent==='info'){
   const found=matchCommercial(text,catalog,{context:cart?.conversation});
   const state=messageIntent(text,{hasProducts:hasProductEvidence(found),catalog});
   if(state.kind!=='query'||!['hours','location','payments','fulfillment'].includes(command.query))throw Error('commercial_equivalence_unconfirmed');
   if(state.topic&&state.topic!=='general'&&state.topic!==command.query)throw Error('commercial_equivalence_unconfirmed');
   return {intent:'info',topic:command.query};
  }
  if(command.intent==='summary'&&!/^(?:resumen|mi pedido|mi carrito|ver pedido)$/.test(requestText))throw Error('commercial_equivalence_unconfirmed');
  return {intent:command.intent};
 }
 if(/^\s*no\s+(?:quiero|agreg|sum)/i.test(String(text)))throw Error('commercial_equivalence_unconfirmed');
 const found=matchCommercial(text,catalog,{context:cart?.conversation,semantic});
 const annotated=orderWithNotes(text,cart,catalog,{semantic});
 if(annotated&&annotated.intent!=='update_cart')throw Error('commercial_equivalence_unconfirmed');
 if(!annotated&&(found.ambiguous.length||!found.matches.length||found.unknown.some(t=>!grammatical.has(t))))throw Error('commercial_equivalence_unconfirmed');
 if(found.matches.some(m=>m.unsafeSemantic||m.qty<1||m.qty>30||(m.product.service==='buffet'?!m.product.available:!sellable(m.product))))throw Error('commercial_equivalence_unconfirmed');
 if(!Array.isArray(command.items)||!command.items.length||command.items.length>30)throw Error('invalid_interpretation');
 if(cart?.conversation?.pending?.resolved_items?.length&&found.matches.every(m=>m.variantOnly||cart.conversation.pending.candidate_ids?.includes(m.product.id))){found.resolvingPending=true;found.matches=[...cart.conversation.pending.resolved_items.map(m=>({product:catalog.find(p=>p.id===m.id),qty:m.qty,explicitQty:true,variantOnly:true})).filter(m=>m.product),...found.matches];}
 const expectedItems=annotated?.items||requestedItems(found,cart,text),expected=new Map(expectedItems.map(x=>[x.variant_id,x.qty]));
 if(command.items.length!==expected.size)throw Error('commercial_equivalence_unconfirmed');
 const expectedNotes=new Map(expectedItems.map(x=>[x.variant_id,x.notes||'']));
 const seen=new Set();for(const item of command.items){if(seen.has(item.variant_id)||!candidates.some(p=>p.id===item.variant_id)||!Number.isSafeInteger(item.qty)||item.qty<1||item.qty>30||item.qty!==expected.get(item.variant_id)||typeof item.notes!=='string'||item.notes.length>300)throw Error('commercial_equivalence_unconfirmed');if(item.notes&&item.notes!==expectedNotes.get(item.variant_id))throw Error('commercial_equivalence_unconfirmed');item.notes=expectedNotes.get(item.variant_id)||'';seen.add(item.variant_id);}
 const fulfillment=inlineFulfillment(text);return {intent:'update_cart',items:command.items,context:{focus_ids:[...new Set(found.matches.map(m=>m.product.id))]},...(fulfillment?{fulfillment}:{})};
}
