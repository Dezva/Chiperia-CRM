import {fulfillmentChoice,stripFulfillment} from './fulfillment.js';
import {commercialText,productTerms,productName,sellable} from './catalog.js';
import {correctOrderTokens} from './order-spelling.js';
import {retryOrderCommand} from './order-retry.js';
export const quantityWords={un:1,uno:1,una:1,dos:2,tres:3,cuatro:4,cinco:5,seis:6,siete:7,ocho:8,nueve:9,diez:10,once:11,doce:12,otro:1,otra:1};
const filler=new Set('quiero quisiera querria dame llevo llevar necesito pedir pedido agregar agrega agregame por favor y e con para el la lo los las me mi a unidad unidades unidade gracias hola buenas voy querer solo solamente unicamente mas suma sumame sumar anade anadi te dije lee lea mensaje bien'.split(' '));
// Una cantidad declarada establece el total; sumar requiere una intención de incremento.
export function orderText(text){
 let t=commercialText(text);if(/^\s*no\s*,/i.test(String(text)))t=t.replace(/^no\s+/,'');
 return t.replace(/\bno\s+(?:[0-9]+|un|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\b.*$/,'').trim();
}
export function orderOperation(text){const t=orderText(text);if(/\b(?:solo|solamente|unicamente|al final|en total|cambia|cambiar|cambiame|corrige|corregi|te dije)\b/.test(t))return 'set';return /\b(?:agrega|agregame|agregar|suma|sumame|sumar|anade|anadi|mas|otro|otra)\b/.test(t)?'add':'set';}
export function inlineFulfillment(text){const natural=fulfillmentChoice(text);if(natural)return natural;const t=commercialText(text);if(/[?¿]/.test(String(text))||/\b(?:no|sin)\b.*\b(?:delivery|retiro|retirar)\b/.test(t))return null;if(/\bdelivery\b|\ba domicilio\b/.test(t))return 'delivery';if(/\b(?:retiro|retirar)\b/.test(t))return 'retiro';return null;}
function prepared(text){return orderText(stripFulfillment(text)).replace(/\b(?:lee|lea) (?:el )?mensaje(?: bien)?\b/g,' ').replace(/\b(?:deja|deje) repetir(?: el mismo mensaje)?\b/g,' ').replace(/\bpara (?:delivery|retiro|retirar)\b|\ba domicilio\b/g,' ').replace(/\bdelivery\b/g,' ').trim();}
export function matchCommercial(text,catalog,{context,semantic=false}={}){
 const tokens=[],segments=[],terms=new Map(),shortNames=new Map(),semanticTerms=new Map(),weak=new Set();
 // La cantidad de una línea nunca pertenece a un producto de otra línea.
 for(const line of String(text).replace(/^\s*no\s*,/i,'').split(/[\r\n;,]+/)){
  const start=tokens.length;tokens.push(...prepared(line).split(/\s+/).filter(Boolean));
  for(let i=start;i<tokens.length;i++)segments[i]={start,end:tokens.length};
 }
 const originalTokens=[...tokens];
 function add(term,p){const list=terms.get(term)||[];list.push(p);terms.set(term,list);}
 for(const p of catalog)for(const t of productTerms(p))add(t,p);
 if(semantic)for(const p of catalog.filter(p=>p.service==='chiperia'&&p.variant&&p.variant!=='Base')){
  const words=commercialText(p.variant).split(' ');
  for(let start=0;start<words.length;start++)for(let end=start+1;end<=words.length;end++){
   const fragment=words.slice(start,end);if(!fragment.some(word=>word.length>=4&&!filler.has(word)))continue;
   const term=commercialText(p.name)+' '+fragment.join(' '),list=semanticTerms.get(term)||[];list.push(p);semanticTerms.set(term,list);
  }
 }
 // Solo prefijos del nombre real del plato de hoy, nunca ingredientes sueltos.
 for(const p of catalog.filter(p=>p.service==='buffet')){
  const words=commercialText(p.name).split(' ');
  for(let n=1;n<words.length;n++){const term=words.slice(0,n).join(' ');if(term.length<4)continue;const list=shortNames.get(term)||[];list.push(p);shortNames.set(term,list);}
 }
 if(catalog.length&&catalog.every(p=>p.service===catalog[0].service)&&['chiperia','buffet'].includes(catalog[0].service)){
  const vocabulary=new Set([...terms.keys()].flatMap(term=>term.split(' ')));
  const direct=correctOrderTokens(tokens,vocabulary),corrected=semantic?correctOrderTokens(direct,vocabulary,{semantic:true}):direct;
  for(let i=0;i<tokens.length;i++)if(direct[i]!==corrected[i])weak.add(i);
  tokens.splice(0,tokens.length,...corrected);
 }
 const pending=context?.pending,focus=context?.focus_ids||[];
 const contextual=catalog.filter(p=>pending?.candidate_ids?.includes(p.id)||focus.some(id=>catalog.find(x=>x.id===id)?.name===p.name));
 const used=new Set(),matches=[],ambiguous=[],hits=[];let last=null;
 for(let i=0;i<tokens.length;){let hit=null;
  const variants=[...contextual];
  if(last&&tokens.slice(last.end,i).some(t=>['y','e'].includes(t)))variants.push(...catalog.filter(p=>p.name===last.product.name));
  for(let n=segments[i].end-i;n>=1;n--){const term=tokens.slice(i,i+n).join(' '),exact=terms.get(term),short=exact?null:shortNames.get(term),semanticHit=exact||short?null:semanticTerms.get(term),variant=variants.filter(p=>p.variant&&p.variant!=='Base'&&commercialText(p.variant)===term);const products=[...(exact||short||semanticHit||[]),...variant];
   if(products.length){hit={n,term,products:[...new Map(products.map(p=>[p.id,p])).values()],variantOnly:!exact&&!short&&!semanticHit,semanticHit:!!semanticHit};break;}}
  if(hit){const m={product:hit.products[0],products:hit.products,term:hit.term,variantOnly:hit.variantOnly,start:i,end:i+hit.n};
   if(semantic&&(hit.semanticHit||Array.from({length:hit.n},(_,j)=>i+j).some(j=>weak.has(j))))m.unsafeSemantic=!originalTokens.slice(i,i+hit.n).some((word,j)=>!weak.has(i+j)&&word===tokens[i+j]&&word.length>=4&&!filler.has(word)&&!quantityWords[word]);
   hits.push(m);last=m;i+=hit.n;}else{i++;}
 }
 last=null;
 for(let index=0;index<hits.length;index++){
   const m=hits[index],i=m.start;let quantity=null,quantityIndex=null;
   // Una cantidad pertenece a su segmento, no al último número de todo el mensaje.
   const start=Math.max(last?.end||0,segments[i].start);
   for(let j=start;j<i;j++)if(!used.has(j)&&(quantityWords[tokens[j]]||/^\d+$/.test(tokens[j]))){quantity=quantityWords[tokens[j]]||Number(tokens[j]);quantityIndex=j;}
   if(quantityIndex!==null)used.add(quantityIndex);
   if(quantity===null){for(let j=m.end;j<Math.min(segments[i].end,hits[index+1]?.start??tokens.length);j++){if(['y','e'].includes(tokens[j]))break;if(quantityWords[tokens[j]]||/^\d+$/.test(tokens[j])){quantity=quantityWords[tokens[j]]||Number(tokens[j]);used.add(j);break;}}}
   for(let j=i;j<m.end;j++)used.add(j);
   Object.assign(m,{qty:quantity??pending?.qty??1,explicitQty:quantity!==null});
   if(m.products.length>1)ambiguous.push(m);else matches.push(m);last=m;
 }
 for(let i=0;i<tokens.length;i++)if(filler.has(tokens[i]))used.add(i);
 const unknown=tokens.filter((_,i)=>!used.has(i));return {matches,ambiguous,unknown,tokens};
}
export function clarifyOptions(products,qty=1,operation='add'){
 const common=products.length&&products.every(p=>p.name===products[0].name),names=products.map(p=>common&&p.variant&&p.variant!=='Base'?p.variant:productName(p));
 return {intent:'clarify',message:'¿Cuál preferís: '+names.join(', ')+'?',context:{pending:{candidate_ids:products.map(p=>p.id),qty,operation},focus_ids:[]}};
}
export function requestedItems(found,cart,text){
 const items=new Map((cart?.items||[]).map(x=>[x.variant_id,{variant_id:x.variant_id,qty:x.qty,notes:x.notes||''}]));
 const pending=cart?.conversation?.pending,correction=orderOperation(text)==='set';
 const resolvedContext=found.matches.every(m=>m.variantOnly)&&!/^\s*(?:agrega|agregame|sumame)/.test(commercialText(text));
 const mentions=new Map();
 for(const m of found.matches){const previous=mentions.get(m.product.id);mentions.set(m.product.id,previous?{...m,qty:previous.qty+m.qty,explicitQty:previous.explicitQty||m.explicitQty}:m);}
 for(const m of mentions.values()){let operation=pending?.operation||(correction?'set':'add');
  if(resolvedContext&&!pending)operation='set';
  let qty=m.qty;
  if(operation==='set'&&!m.explicitQty&&!pending){const focused=(cart?.conversation?.focus_ids||[]).map(id=>items.get(id)).filter(Boolean);if(focused.length===1&&(m.product.service!=='buffet'||m.variantOnly))qty=focused[0].qty;else if(items.has(m.product.id))qty=items.get(m.product.id).qty;}
  if(resolvedContext&&operation==='set')for(const id of cart?.conversation?.focus_ids||[]){const previous=items.get(id);if(previous&&id!==m.product.id&&cart.items.find(x=>x.variant_id===id)?.name===m.product.name)items.delete(id);}
  const old=items.get(m.product.id);items.set(m.product.id,{variant_id:m.product.id,qty:(operation==='add'?old?.qty||0:0)+qty,notes:old?.notes||''});
 }
 return [...items.values()];
}
export function deterministicOrder(text,cart,catalog){
 const found=matchCommercial(text,catalog,{context:cart?.conversation}),fulfillment=inlineFulfillment(text),operation=orderOperation(text);
 if(/^\s*no\s+(?:quiero|agreg|sum)/i.test(String(text)))return {found,command:{intent:'clarify',message:'¿Querés quitar un producto o cambiar su cantidad? Indicá el artículo y el total.'}};
 if(!found.matches.length&&!found.ambiguous.length)return {found,command:null};
 if(found.ambiguous.length&&found.unknown.length)return {found,command:null};
 if(found.ambiguous.length){const a=found.ambiguous[0],command=clarifyOptions(a.products,a.qty,operation);command.context.pending.resolved_items=found.matches.map(m=>({id:m.product.id,qty:m.qty}));command.context.pending.remaining=found.ambiguous.slice(1).map(m=>({candidate_ids:m.products.map(p=>p.id),qty:m.qty}));return {found,command:{...command,...(fulfillment?{fulfillment}:{})}};}
 const blocked=found.matches.filter(m=>m.product.service==='buffet'?!m.product.available:!sellable(m.product));
 if(blocked.length)return {found,command:retryOrderCommand(blocked.map(m=>productName(m.product)+': '+(m.product.service==='buffet'?'no disponible en el menú de hoy':m.product.price===null?'precio individual pendiente de confirmar':'no disponible para nuevos pedidos')).join('. ')+'.')};
 const correctionOnly=found.unknown.every(t=>['al','final','en','total','cambia','cambiar','cambiame','corrige','corregi','no'].includes(t));
 if(found.unknown.length&&!correctionOnly)return {found,command:null};
 const pending=cart?.conversation?.pending;
 if(pending&&found.matches.every(m=>m.variantOnly)){const resolved=[...(pending.resolved_items||[]),...found.matches.map(m=>({id:m.product.id,qty:m.qty}))];if(pending.remaining?.length){const next=pending.remaining[0],command=clarifyOptions(catalog.filter(p=>next.candidate_ids.includes(p.id)),next.qty,pending.operation);command.context.pending.resolved_items=resolved;command.context.pending.remaining=pending.remaining.slice(1);return {found,command};}found.matches=resolved.map(m=>({product:catalog.find(p=>p.id===m.id),qty:m.qty,explicitQty:true,variantOnly:true})).filter(m=>m.product);}
 const items=requestedItems(found,cart,text);
 if(found.matches.some(m=>m.qty<1||m.qty>30)||items.some(x=>x.qty<1||x.qty>30))return {found,command:{intent:'clarify',message:'Indicá entre 1 y 30 unidades por producto.'}};
 return {found,command:{intent:'update_cart',items,context:{focus_ids:[...new Set(found.matches.map(m=>m.product.id))]},...(fulfillment?{fulfillment}:{})}};
}

// Observaciones explícitas del buffet, separadas del nombre y de las cantidades.
// No interpreta pesos ni usa tarifas; una segunda comida desconocida exige aclaración.
export function buffetOrder(text,cart,catalog){
 const original=matchCommercial(text,catalog,{context:cart?.conversation});
 const all=[...original.matches,...original.ambiguous].sort((a,b)=>a.start-b.start);
 const tokens=[...original.tokens],notes=new Map();let annotated=false;
 const source=String(text),words=[...source.matchAll(/[\p{L}\p{N}]+/gu)].map(m=>({key:commercialText(m[0]),start:m.index,end:m.index+m[0].length})).filter(w=>w.key);
 const literal=terms=>{const start=words.findIndex((_,i)=>terms.every((term,j)=>words[i+j]?.key===term));return start<0?terms.join(' '):source.slice(words[start].start,words[start+terms.length-1].end);};
 for(const match of all){
  let i=match.end;
  if(/^\d+$/.test(tokens[i]||'')||quantityWords[tokens[i]])i++;
  if(!['sin','con','bien','aparte','nota','observacion'].includes(tokens[i]))continue;
  // «con» solo inicia una observación inequívoca: «con poca sal», no otro plato.
  if(tokens[i]==='con'&&!['poca','poco','mucha','mucho','extra','bastante'].includes(tokens[i+1]))continue;
  let end=i+1;while(end<tokens.length&&!['y','e'].includes(tokens[end]))end++;
  if(end-i<2||all.some(other=>other!==match&&other.start>=i&&other.start<end))return {intent:'clarify',message:'¿Qué plato querés y qué observación lleva? Separá cada artículo con su cantidad. Conservamos el borrador.'};
  const note=literal(tokens.slice(i,end));if(note.length>300)return {intent:'clarify',message:'La observación debe tener hasta 300 caracteres.'};
  notes.set(match.product.id,note);for(let j=i;j<end;j++)tokens[j]='';annotated=true;
 }
 if(!annotated)return null;
 const cleaned=tokens.filter(Boolean).join(' '),resolved=deterministicOrder(cleaned,cart,catalog);
 if(resolved.command?.intent!=='update_cart')return resolved.command||retryOrderCommand('No pude identificar todos los platos del pedido en el menú de hoy.');
 return {...resolved.command,items:resolved.command.items.map(item=>({...item,notes:notes.get(item.variant_id)||item.notes}))};
}
