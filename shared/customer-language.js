import {categoryKey,commercialText} from './catalog.js';
import {oneEdit} from './order-spelling.js';
import {isConfirmation as exactConfirmation} from './order-engine.js';

// Vocabulario de intenciones, no equivalencias de alimentos ni una lista de errores.
// Conserva texto original para validar artículos, cantidades, notas y direcciones.
const vocabulary=new Set(('retiro retirar retirarlo retiramos retirare recogerlo buscarlo buscar paso vamos delivery domicilio envio envialo traemelo casa local '+
 'buffet chiperia menu catalogo carta opciones productos platos comer ofrecen sirven horario horarios atienden atiende abren abre cierran cierra '+
 'pago pagos pagar pagare efectivo tarjeta tarjetas debito credito transferencia direccion ubicacion precio precios costo costos tarifa tarifas valor disponible '+
 'pedido pedidos solicitud carrito resumen estado guardado registrado confirmado almacenado '+
 'gracias perfecto entendido hola buenas ayuda humano persona encargado empleado equipo atencion hablar '+
 'cancelar confirmar confirmo quiero quisiera necesito consultar conocer saber ver mostrar mostrame pasame pasas mandame enviar envias tenes tienen venden '+
 'no sin nunca puedo podria podemos').split(' '));
export function intentText(text,{vocabulary:scope=vocabulary,protectedWords=new Set()}={}){
 const words=[...scope].filter(word=>word.length>=4);
 return categoryKey(text).replace(/\b[a-z]+\b/g,word=>{
  if(protectedWords.has(word)||protectedWords.has(commercialText(word))||vocabulary.has(word)||scope.has(word))return word;
  const compact=word.replace(/([a-z])\1+/g,'$1');
  if(['no','sin','nunca'].includes(compact))return compact;
  if(word.length<4)return word;
  const candidates=words.filter(target=>oneEdit(word,target));
  return candidates.length===1?candidates[0]:word;
 });
}

// La frase completa debe seguir siendo una confirmación afirmativa explícita.
export const isCustomerConfirmation=text=>{
 if(typeof text!=='string')return false;
 const value=intentText(text).replace(/\s+/g,' ').trim().replace(/[.!]+$/,'');
 return value==='confirmar'||exactConfirmation(value);
};
