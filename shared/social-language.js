import {commercialText,productTerms} from './catalog.js';
import {intentText} from './customer-language.js';

// Cláusulas sociales componibles, independientes de los nombres del catálogo.
const clauses=['hola','amigo','amiga','senor','senora','muy buenas','buenas tardes','buenas noches','buenos dias','buen dia','buenas','que tal','como estas','como estan','todo bien'].map(value=>value.split(' ')).sort((a,b)=>b.length-a.length);
const vocabulary=new Set(clauses.flat());
const abbreviate=word=>word==='que'?'q':word;
export function greetingParts(text,catalog=[]){
 if(typeof text!=='string'||!text.trim())return null;
 // Un nombre comercial exacto al principio tiene prioridad sobre el saludo.
 const source=commercialText(text);
 if(catalog.some(product=>productTerms(product).some(term=>source===term||source.startsWith(term+' '))))return null;
 const tokens=[...text.matchAll(/[\p{L}\p{N}]+/gu)],words=tokens.map(token=>intentText(token[0],{vocabulary}));
 let count=0,questionClause=false;
 while(count<words.length){
  let consumed=0,matched;
  for(const clause of clauses){
   if(clause.every((word,index)=>words[count+index]===word||words[count+index]===abbreviate(word))){consumed=clause.length;matched=clause;break;}
   if(clause.length>1&&[clause.join(''),clause.map(abbreviate).join('')].includes(words[count])){consumed=1;matched=clause;break;}
  }
  if(!consumed)break;
  questionClause=['que','como','todo'].includes(matched[0]);
  count+=consumed;
 }
 if(!count)return null;
 const end=tokens[count-1].index+tokens[count-1][0].length;
 let rest=text.slice(end).replace(/^[\s,;:.!¡]+/u,'').trim();
 // Solo consume el cierre de una pregunta social reconocida; conserva cualquier
 // pregunta del pedido (incluso un ¿ sin cierre) para no convertirla en confirmación.
 if(questionClause)rest=rest.replace(/^\?[\s,;:.!¡]*/u,'');
 return {only:/^[\s\p{P}\p{S}\uFE0F\u200D]*$/u.test(rest),remainder:rest};
}
// Conserva el texto restante tal como lo escribió el cliente, incluidas cantidades,
// negaciones, preguntas, nombres y observaciones. Nunca elimina palabras internas.
export function withoutGreeting(text,catalog=[]){
 const greeting=greetingParts(text,catalog);
 return greeting&&!greeting.only?greeting.remainder:text;
}
