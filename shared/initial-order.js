import {matchCommercial,orderFillers} from './catalog-matching.js';
import {messageIntent} from './message-intent.js';
import {intentText} from './customer-language.js';

// Busca en los dos catálogos actuales; nunca decide por precio o disponibilidad.
export function initialOrder(text,cart,catalogs,explicitService){
 if(cart.service)return null;
 const pending=cart.initial_order_request;
 const choose=(service,request)=>{
  const next={...cart,service,delivery_location_id:null};delete next.initial_order_request;
  return {cart:next,text:request};
 };
 if(pending&&['buffet','chiperia'].includes(explicitService))return choose(explicitService,pending);
 if(explicitService==='mixed')return null;
 const request=explicitService?String(text).replace(/\p{L}+/gu,word=>intentText(word)===explicitService?'':word):text;
 if(explicitService&&messageIntent(request).kind==='purchase')return choose(explicitService,request);
 const services=[];
 for(const [service,catalog] of Object.entries(catalogs)){
  if(explicitService&&service!==explicitService)continue;
  const found=matchCommercial(request,catalog,{semantic:true}),hits=[...found.matches,...found.ambiguous];
  if(!hits.length||hits.some(m=>m.unsafeSemantic)||found.unknown.some(word=>!orderFillers.has(word)))continue;
  if(messageIntent(request,{hasProducts:true,catalog}).kind==='purchase')services.push(service);
 }
 if(services.length===1)return choose(services[0],request);
 if(services.length>1)return {cart:{...cart,initial_order_request:String(text).slice(0,4096)},needsService:true};
 return null;
}
