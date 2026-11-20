import {CATEGORY_IDS} from './buffet-categories.js';
import {normalize,fulfillmentChoice,isConfirmation} from './order-engine.js';
export {normalize,isConfirmation,fulfillmentChoice};
export const money=n=>n==null?'Pendiente':new Intl.NumberFormat('es-PY').format(n)+' Gs.';
export const greeting='¡Buenas! Bienvenido a El Viejo. ¿Querés consultar o hacer un pedido del buffet o de la chipería?';
export const defaults={business_name:'El Viejo',branch:'Ruta Villeta–Alberdi',logo_url:'assets/abuelito-provisional.png',timezone:'America/Asuncion',bot_enabled:false,payment_methods:['Efectivo','Tarjeta de débito','Tarjeta de crédito','QR','Transferencia'],fulfillment_modes:['retiro','delivery'],schedules:{buffet:{days:[1,2,3,4,5,6],open:'11:00',close:'15:00',delivery_open:'12:00',delivery_close:'14:00'},chiperia:{days:[1,2,3,4,5,6],open:'05:15',close:'18:30',delivery_open:null,delivery_close:null}},reference_prices:{guarniciones:40000,carne:80000,pollo_chancho:75000}};
export function localDate(now=new Date()){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Asuncion',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);}
export function serviceChoice(text){const t=normalize(text);const b=/\bbuffet\b/.test(t),c=/\bchiperia\b/.test(t);return b&&c?'mixed':b?'buffet':c?'chiperia':null;}
export function emptyCart(name='',service=null){return {items:[],service,customer_name:name,fulfillment:'a_coordinar',address:'',payment:'a_coordinar',quoted:false,delivery_location_id:null,saved_carts:{}};}
export function activeCatalog(service,catalog,menus=[],now=new Date()){
 if(service==='buffet'){const menu=menus.find(m=>m.day===localDate(now)&&m.status==='published');return (menu?.items||[]).map(p=>({...p,service:'buffet',price:null,variant:'Base',available:p.available!==false&&CATEGORY_IDS.includes(p.category_id)&&p.category_id!=='pending'}));}
 return catalog.filter(p=>p.service==='chiperia');
}
export function availability(service,fulfillment,settings=defaults,now=new Date()){
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
  if(!p||!p.available||(service==='chiperia'&&!price(p)))throw Error('Producto inactivo, agotado o sin precio confirmado.');
  if(!Number.isSafeInteger(x.qty)||x.qty<1||x.qty>30)throw Error('La cantidad debe ser entre 1 y 30.');
  if(seen.has(p.id))throw Error('Agrupá las cantidades del mismo producto.');seen.add(p.id);
  return {variant_id:p.id,name:p.name,variant:p.variant||'Base',qty:x.qty,unit_price:service==='buffet'?null:p.price,notes:String(x.notes||'').slice(0,300)};
 });
 return {items:lines,subtotal:service==='buffet'?null:lines.reduce((s,x)=>s+x.qty*x.unit_price,0)};
}
export function confirmation(order,input,catalog,{mode,owner_id,actor,menus=[],now=new Date(),settings=defaults}={}){
 const q=quote(order.items,order.service,activeCatalog(order.service,catalog,menus,now));
 if(!['retiro','delivery'].includes(input.fulfillment))throw Error('Confirmá retiro o delivery.');
 if(order.fulfillment!==input.fulfillment)throw Error('Revisá la modalidad del pedido antes de confirmar.');
 if(input.fulfillment==='delivery'&&(!order.delivery_location_id||String(input.address||'').trim().length<3))throw Error('Faltan ubicación puntual y referencia.');
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
export function summary(cart){return cart.items.map(x=>`${x.qty} × ${x.name}${x.variant==='Base'?'':' · '+x.variant}${cart.service==='chiperia'?': '+money(x.qty*x.unit_price):''}`).join('\n')+'\n'+(cart.service==='buffet'?'Buffet: importe pendiente; el encargado lo acordará con vos.':'Subtotal: '+money(cart.items.reduce((s,x)=>s+x.qty*x.unit_price,0)))+'\nModalidad: '+cart.fulfillment+'. Envío pendiente de revisión.';}
export function demoCommand(text,cart,catalog){
 const t=normalize(text),choice=fulfillmentChoice(text);
 if(choice)return {intent:'summary',fulfillment:choice};
 if(/menu|catalogo|carta/.test(t))return {intent:'menu'};
 const matches=catalog.filter(p=>t.includes(normalize(p.name+(p.variant&&p.variant!=='Base'?' '+p.variant:'')))).sort((a,b)=>(b.name+b.variant).length-(a.name+a.variant).length);
 if(matches.length){const p=matches[0];return {intent:'update_cart',items:[...(cart?.items||[]).filter(x=>x.variant_id!==p.id),{variant_id:p.id,qty:Number(t.match(/\b(\d+)\b/)?.[1]||1)}]};}
 return {intent:'help'};
}
export function reduceOrder({text,cart:old,catalog,menus=[],command={},profileName='',settings=defaults,now=new Date()}){
 let cart=structuredClone({...emptyCart(profileName),...old});let selected=serviceChoice(text);
 for(const saved of Object.values(cart.saved_carts||{}))if(saved&&typeof saved==='object')saved.delivery_location_id=null;
 if(selected==='mixed')return {cart,kind:'reply',reply:'Prepararemos solicitudes separadas y relacionadas para buffet y chipería. Empezá eligiendo un servicio; el equipo revisará un único delivery si corresponde.'};
 if(selected&&selected!==cart.service){const initialPoint=cart.service?null:cart.delivery_location_id;const saved=cart.saved_carts||{};if(cart.service)saved[cart.service]={...cart,delivery_location_id:null,saved_carts:{}};cart={...emptyCart(profileName,selected),...saved[selected],service:selected,saved_carts:saved,delivery_location_id:initialPoint};command={intent:'menu'};}
 if(!cart.service)return {cart,kind:'reply',reply:greeting};
 const list=activeCatalog(cart.service,catalog,menus,now);
 if(/\b(humano|persona|encargado|empleado)\b/.test(normalize(text))||command.intent==='human')return {cart,kind:'human',reply:'El equipo continuará la atención. El asistente queda pausado.'};
 if(['/cancelar','/reiniciar','cancelar pedido'].includes(normalize(text)))return {cart:emptyCart(profileName,cart.service),kind:'reply',reply:'Borrador cancelado. Conservamos el historial.'};
 if(!list.length&&cart.service==='buffet')return {cart,kind:'reply',reply:'Todavía no hay menú del buffet confirmado para hoy. Podés pedir atención del encargado.'};
 if(command.intent==='update_cart'){cart={...cart,...quote(command.items,cart.service,list),quoted:false};}
 const choice=fulfillmentChoice(text)||command.fulfillment;
 if(['retiro','delivery'].includes(choice)){cart.fulfillment=choice;if(choice==='retiro')cart.delivery_location_id=null;}
 if(command.address)cart.address=String(command.address).slice(0,500);
 if(command.customer_name)cart.customer_name=String(command.customer_name).slice(0,120);
 if(settings.payment_methods.includes(command.payment))cart.payment=command.payment;
 if(isConfirmation(text)){
  if(!cart.items.length)return {cart,kind:'reply',reply:'Elegí productos y cantidades antes de enviar la solicitud.'};
  let fresh;try{fresh=quote(cart.items,cart.service,list);}catch{return {cart:{...cart,quoted:false},kind:'reply',reply:'Cambió la disponibilidad del catálogo. Revisá los productos con el equipo.'};}
  if(!cart.quoted||!sameItems(fresh.items,cart.items)){cart={...cart,...fresh,quoted:true};return {cart,kind:'reply',reply:'Revisá el resumen actualizado:\n'+summary(cart)+'\nEscribí CONFIRMAR PEDIDO.'};}
  if(!['retiro','delivery'].includes(cart.fulfillment))return {cart,kind:'reply',reply:'¿Será retiro o delivery?'};
  if(cart.fulfillment==='delivery'&&(!cart.delivery_location_id||cart.address.trim().length<3))return {cart,kind:'reply',reply:'Enviá tu ubicación puntual de WhatsApp y una referencia para el delivery.'};
  const warning=availability(cart.service,cart.fulfillment,settings,now);
  return {cart,kind:'submit',reply:'Solicitud pendiente de revisión humana.'+(warning?' '+warning:'')};
 }
 if(command.intent==='menu')return {cart,kind:'reply',reply:list.filter(p=>p.available&&(cart.service==='buffet'||price(p))).map(p=>p.name+(p.variant&&p.variant!=='Base'?' · '+p.variant:'')+(cart.service==='chiperia'?': '+money(p.price):'')).join('\n')+'\n'+(cart.service==='buffet'?'El encargado acuerda los precios finales.':'Elegí productos y cantidades. El local confirma cada pedido.')};
 if(command.intent==='info')return {cart,kind:'reply',reply:'Horarios: '+JSON.stringify(settings.schedules[cart.service])+'. Pagos: '+settings.payment_methods.join(', ')+'. Delivery sujeto a revisión; costo definido por el equipo.'};
 if(cart.items.length){cart.quoted=true;return {cart,kind:'reply',reply:summary(cart)+'\n'+(cart.fulfillment==='a_coordinar'?'¿Será retiro o delivery?':cart.fulfillment==='delivery'&&!cart.delivery_location_id?'Enviá tu ubicación puntual de WhatsApp y referencia.':'Escribí CONFIRMAR PEDIDO para solicitar revisión del local.')};}
 return {cart,kind:'reply',reply:'Servicio activo: '+cart.service+'. Escribí MENÚ para consultar los productos o el nombre del otro servicio para cambiar.'};
}
