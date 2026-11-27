import {commercialText} from './catalog.js';
import {BUFFET_CATEGORIES} from './buffet-categories.js';

// Reutiliza las etiquetas comerciales vigentes; no define equivalencias de productos.
export function categoryGroups(catalog=[],categories=[]){
 if(categories.length)return categories;
 if(catalog.some(p=>p.service==='buffet'))return BUFFET_CATEGORIES;
 return [...new Map(catalog.filter(p=>p.category).map(p=>[p.category_id||p.category,{id:p.category_id||p.category,name:p.category,active:p.category_active!==false}])).values()];
}
// Deriva los plurales desde las etiquetas conocidas. Evita suponer una única
// raíz universal: pan/panes y carne/carnes no se reducen de la misma manera.
const connectors=new Set(['y','e','con','sin','a','en','para']);
function categoryForms(name){
 const base=commercialText(name);
 const plural=base.split(' ').map(word=>connectors.has(word)?word:/[aeiou]$/.test(word)?word+'s':/z$/.test(word)?word.slice(0,-1)+'ces':word+'es').join(' ');
 return [...new Set([base,commercialText(plural)])].filter(Boolean);
}
const fragmentWords=new Set('y e el la lo los las cual cuales que son es hoy dia menu catalogo carta opcion tipo plato por favor porfa solo solamente unicamente tambien buffet chiperia'.split(' '));
export function isCategoryFragment(text,request){
 if(!request)return false;
 let rest=' '+commercialText(text)+' ';
 const forms=request.category_names.flatMap(categoryForms).sort((a,b)=>b.length-a.length);
 for(const form of forms)rest=rest.replaceAll(' '+form+' ',' ');
 return rest.trim().split(/\s+/).filter(Boolean).every(word=>fragmentWords.has(word));
}
export function categoryRequest(text,catalog,categories=[]){
 const t=commercialText(text),groups=categoryGroups(catalog,categories);
 const hits=groups.filter(c=>c.active!==false&&categoryForms(c.name).some(form=>(' '+t+' ').includes(' '+form+' '))).sort((a,b)=>commercialText(b.name).length-commercialText(a.name).length);
 if(!hits.length)return null;
 const chosen=hits.filter(c=>!hits.some(other=>other!==c&&commercialText(other.name).startsWith(commercialText(c.name)+' '))),roots=chosen.map(c=>commercialText(c.name));
 return {category_ids:groups.filter(c=>c.active!==false&&roots.some(root=>commercialText(c.name)===root||commercialText(c.name).startsWith(root+' '))).map(c=>c.id),category_names:groups.filter(c=>c.active!==false&&roots.some(root=>commercialText(c.name)===root||commercialText(c.name).startsWith(root+' '))).map(c=>c.name)};
}
