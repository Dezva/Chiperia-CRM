import {commercialText,productTerms,sellable} from './catalog.js';
import {CATEGORY_IDS} from './buffet-categories.js';
export const repeatOrderPrompt='Volvé a enviar el pedido completo, con todos los productos y cantidades. La nueva lista comenzará un pedido nuevo, sin sumar artículos del intento anterior. Escribí MENÚ para ver las opciones.';

// Acción interna: el modelo no puede ordenar reiniciar un borrador.
export function retryOrderCommand(reason='No pude identificar todos los productos del pedido en las opciones disponibles.'){
 return {intent:'retry_order',message:reason+' Reinicié el borrador de este servicio; este intento no se envió al local.\n'+repeatOrderPrompt};
}


// Ejemplos visuales tomados de las opciones vigentes: nunca se agregan al carrito.
export function orderWritingGuide(cart={},catalog=[]){
 const instructions='Para hacer un pedido, escribí la cantidad y el nombre completo de cada producto, con su variedad, uno por línea. Enviá esa lista en un mensaje, sin agregar otros comentarios.';
 if(!cart?.service)return 'Primero indicá si querés buffet o chipería. '+instructions+' Escribí MENÚ para consultar las opciones o pedí hablar con el equipo.';
 const name=product=>product.name+(product.variant&&product.variant!=='Base'?' de '+product.variant:'');
 const options=catalog.filter(product=>product.service===cart.service&&(cart.service==='buffet'?product.available&&CATEGORY_IDS.includes(product.category_id)&&product.category_id!=='pending'&&product.active!==false:sellable(product)));
 const examples=options.filter(product=>{
  const term=commercialText(name(product));
  return term&&catalog.filter(candidate=>productTerms(candidate).includes(term)).length===1;
 }).slice(0,2).map((product,index)=>(index===0?'2 ':'1 ')+name(product));
 return instructions+(examples.length?'\nEjemplo de cómo escribirlo (elegí tus propios productos y cantidades):\n'+examples.join('\n'):'\nUsá este formato: cantidad + nombre del producto + variedad.')+'\nEscribí MENÚ para ver las opciones o pedí hablar con el equipo.';
}
export function unclearMessageHelp(cart,catalog){
 return 'No entendí bien el mensaje. '+(cart?.items?.length?'Tu pedido sigue guardado.':'No cambié tu pedido.')+'\n'+orderWritingGuide(cart,catalog);
}
export const retryOrderHelp=(cart,catalog)=>repeatOrderPrompt.replace(' Escribí MENÚ para ver las opciones.','')+'\n'+orderWritingGuide(cart,catalog);
