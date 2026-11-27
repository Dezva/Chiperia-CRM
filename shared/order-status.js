import {intentText} from './customer-language.js';
export function orderStatusRequested(text){const t=intentText(text);return /\b(?:pedido|solicitud|carrito)\b/.test(t)&&/\b(?:tienes|tenes|tengo|esta|quedo|estado|como|ver|mostrar|mostrame|resumen|detalle|revisar|almacenad\w*|guardad\w*|registrad\w*|confirmad\w*|envie|hice|falta)\b/.test(t);}
export function registeredOrderCommand(text,order){
 if(!orderStatusRequested(text))return null;
 if(!order)return {intent:'clarify',message:'No veo una solicitud registrada en esta conversación. Decime los productos y cantidades que querés pedir.'};
 const labels={draft:'en borrador',needs_info:'pendiente de información',pending:'pendiente de aceptación del local',accepted:'confirmada por el local',preparing:'en preparación',ready:'lista',out_for_delivery:'en reparto',delivered:'entregada o retirada',cancelled:'cancelada',rejected:'rechazada'};
 return {intent:'clarify',message:'La última solicitud registrada es la #'+order.number+' de '+(order.service==='buffet'?'buffet':'chipería')+': '+(labels[order.status]||'en revisión del equipo')+'.'+(order.status==='pending'?' El equipo todavía debe confirmar disponibilidad, entrega y total.':'')};
}
