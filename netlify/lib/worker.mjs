import {referencePriceRequest} from '../../shared/reference-prices.js';
import {orderStatusRequested,registeredOrderCommand} from '../../shared/order-status.js';
import {hydrateDeliveryLocation,deliveryQueryRequested,registeredDeliveryCommand} from '../../shared/delivery-context.js';
import {deterministicConversation} from '../../shared/conversation-context.js';
import {interpret} from './conversation.mjs';
import {withCategories} from '../../shared/catalog.js';
import {randomUUID} from 'node:crypto';
import {env,db,rpc} from './platform.mjs';
import {reduceOrder,emptyCart,isConfirmation,fulfillmentChoice,serviceChoice,activeCatalog,defaults,localDate} from '../../shared/viejo-engine.js';
async function send(job,token){
 const m=job.message,c=job.conversation;
 // Última comprobación después de la reserva; una toma humana invalida respuestas del bot.
 if(m.actor==='bot'){
  const [current,settings]=await Promise.all([db('/rest/v1/guarni_conversations?id=eq.'+c.id+'&select=mode,revision'),db('/rest/v1/guarni_settings?id=eq.true')]);
  if(current[0]?.mode!=='bot'||current[0]?.revision!==m.revision||env('BOT_ENABLED')!=='true'||settings[0]?.config?.bot_enabled!==true){await rpc('guarni_sent',{p_token:token,p_message:m.id,p_status:'cancelled'});return;}
 }
 let status='uncertain',external=null,error=null;
 const version=env('WHATSAPP_GRAPH_VERSION'),phone=env('WHATSAPP_PHONE_NUMBER_ID'),key=env('WHATSAPP_TOKEN');
 if(env('WHATSAPP_SEND_ENABLED')!=='true'){status='failed';error='Envíos reales desactivados por configuración.';}
 else if(!version||!phone||!key){status='failed';error='Falta configurar WhatsApp.';}
 else try{
  const r=await fetch(`https://graph.facebook.com/${version}/${phone}/messages`,{method:'POST',headers:{authorization:'Bearer '+key,'content-type':'application/json'},body:JSON.stringify({messaging_product:'whatsapp',recipient_type:'individual',to:c.wa_id,type:'text',text:{preview_url:false,body:m.body}}),signal:AbortSignal.timeout(15000)});
  const data=await r.json().catch(()=>({}));
  if(r.ok&&data.messages?.[0]?.id){status='sent';external=data.messages[0].id;}
  else {status=r.status>=500?'uncertain':'failed';error='WhatsApp no confirmó el envío (HTTP '+r.status+'). Revisar antes de reenviar.';}
 }catch{error='No se pudo confirmar el resultado del envío. Revisar WhatsApp antes de reenviar.';}
 await rpc('guarni_sent',{p_token:token,p_message:m.id,p_status:status,p_external:external,p_error:error});
}
export async function runWorker({budgetMs=45000}={}){
 const start=Date.now();let count=0;
 while(Date.now()-start<budgetMs){
  const token=randomUUID();const job=await rpc('guarni_claim',{p_token:token});if(!job)break;if(job.kind==='skip')continue;
  if(job.kind==='send'){await send(job,token);count++;continue;}
  const c=job.conversation;
  try{
   const settings=await db('/rest/v1/guarni_settings?id=eq.true');
   const config={...defaults,...settings[0]?.config};
   const botEnabled=env('BOT_ENABLED')==='true'&&config.bot_enabled===true;
   if(['location','invalid_location','live_location'].includes(job.message.content_type)){
    await rpc('guarni_process_location',{p_token:token,p_job:job.job.id,p_reply_enabled:botEnabled});
    count++;
    continue;
   }
   let result;
   if(c.mode==='human'||!botEnabled)result={kind:'ignore',cart:c.cart,reply:''};
   else if(/^\[Contenido (location|live_location) recibido:/.test(job.message.body))result={kind:'reply',cart:c.cart,reply:'Para adjuntar la ubicación a tu pedido, enviame tu ubicación actual puntual desde WhatsApp 📍.'};
   else if(job.message.body.startsWith('[Contenido '))result={kind:'human',cart:c.cart,reply:'Recibí un archivo. El equipo continuará la atención por este chat.'};
   else {
    const [rawCatalog,client,menus,categories,points,lastOrders]=await Promise.all([db('/rest/v1/guarni_catalog?select=id,name,variant,category,category_id,price,available,active,seasonal,aliases,legacy_generic,service'),db('/rest/v1/crm_clients?id=eq.'+c.client_id+'&select=name'),db('/rest/v1/viejo_menus?status=eq.published&day=eq.'+localDate()+'&select=id,day,status,items'),db('/rest/v1/viejo_catalog_categories?order=position,name'),c.draft_location_id?db('/rest/v1/guarni_locations?id=eq.'+c.draft_location_id+'&conversation_id=eq.'+c.id+'&select=id,address'):Promise.resolve([]),!c.cart?.items?.length&&(orderStatusRequested(job.message.body)||deliveryQueryRequested(job.message.body))?db('/rest/v1/guarni_orders?conversation_id=eq.'+c.id+'&order=created_at.desc&limit=1&select=id,number,status,service,fulfillment,delivery_location_id'):Promise.resolve([])]);
    const catalog=withCategories(rawCatalog,categories);
    const text=job.message.body;const cart=hydrateDeliveryLocation(c.cart?.items?c.cart:emptyCart(client[0]?.name),points[0]);
    let command;
    if(config.bot_enabled!==true){result={kind:'ignore',cart,reply:''};}
    else {
    if((cart.service==='buffet'||serviceChoice(text)==='buffet')&&referencePriceRequest(text,cart))command={intent:'reference_prices'};
    else if(!cart.items?.length&&orderStatusRequested(text))command=registeredOrderCommand(text,lastOrders[0]);
    else if(!cart.items?.length&&deliveryQueryRequested(text))command=registeredDeliveryCommand(lastOrders[0],cart);
    else if(!cart.service&&!serviceChoice(text))command={intent:'help'};
    else if(serviceChoice(text))command={intent:'menu'};
    else if(/^(men[uú]|carta|cat[aá]logo)[.!?]?$/i.test(text.trim()))command={intent:'menu'};
    else if(fulfillmentChoice(text))command={intent:'summary',fulfillment:fulfillmentChoice(text)};
    else if(!isConfirmation(text)&&!['/cancelar','/reiniciar','cancelar pedido'].includes(text.toLowerCase())&&!/\b(humano|persona|encargado|empleado)\b/i.test(text)){
     try{command=deterministicConversation(text,cart,activeCatalog(cart.service,catalog,menus),{categories:cart.service==='chiperia'?categories:[]})||await interpret(text,cart,activeCatalog(cart.service,catalog,menus),config);}catch{command={intent:'human'};}
    }
    result=reduceOrder({text,cart,catalog,command,profileName:client[0]?.name,settings:config,menus});
    }
   }
   await rpc('guarni_finish',{p_token:token,p_job:job.job.id,p_revision:c.revision,p_cart:result.cart,p_body:result.reply,p_kind:result.kind});
  }catch(error){await rpc('guarni_retry',{p_token:token,p_job:job.job.id,p_error:error.message});}
  count++;
 }
 return count;
}
