import {categoryKey} from './catalog.js';
export const hasDeliveryReference=cart=>typeof cart?.address==='string'&&cart.address.trim().length>=3;
export const deliveryReferencePrompt='Ya tengo tu ubicación 📍. Solo falta una referencia escrita para llegar: calle y número, fachada o un punto de referencia cercano.';
export function deliveryStatusCommand(text,cart){
 if(cart?.fulfillment!=='delivery'||!cart.items?.length)return null;
 const t=categoryKey(text);
 if(/\bno (?:te )?(?:estoy |estaba )?pidiendo\b.*\b(?:horario|informacion)\b/.test(t)||/\b(?:ubicacion|localizacion)\b/.test(t)||/\breferencia\b/.test(t)&&(/^(?:que|cual|como|no tengo|no se|falta)\b/.test(t)||/[?¿]/.test(String(text||''))||t==='referencia')||/\bya\b.*\b(?:envi\w*|mand\w*|pas[eé]|comparti\w*)\b/.test(t)){
  // Un texto de dirección no sustituye el evento estructurado de ubicación de WhatsApp.
  const message=!cart.delivery_location_id?'Todavía falta una ubicación puntual válida de WhatsApp para este delivery. Enviá el punto desde Adjuntar → Ubicación.':!hasDeliveryReference(cart)?deliveryReferencePrompt:'Sí, ya tengo tu ubicación y la referencia de entrega. Escribí CONFIRMAR PEDIDO para enviar la solicitud al local.';
  return {intent:'clarify',message};
 }
 return null;
}
export function deliveryReferenceCommand(text,cart){
 if(cart?.fulfillment!=='delivery'||!cart.items?.length||!cart.delivery_location_id||hasDeliveryReference(cart))return null;
 const value=String(text||'').trim(),t=categoryKey(value);
 if(value.length<3||value.length>500||/^(?:hola|buenas|gracias|ok|dale|listo|si|no|no se|nose|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|confirmar pedido|confirmo pedido|delivery|retiro|menu|catalogo|carta)[.!?]*$/.test(t)||value.startsWith('/')||/[?¿]/.test(value))return null;
 return {intent:'summary',address:value};
}
// Solo la fila consultada por ID y conversación puede hidratar el punto del borrador.
export function hydrateDeliveryLocation(cart,point){
 const result={...cart,delivery_location_id:point?.id||null};
 if(result.address_location_id&&result.address_location_id!==point?.id){result.address='';result.address_location_id=null;}
 if(point&&!hasDeliveryReference(result)&&typeof point.address==='string'&&point.address.trim().length>=3){result.address=point.address.trim().slice(0,500);result.address_location_id=point.id;}
 return result;
}
