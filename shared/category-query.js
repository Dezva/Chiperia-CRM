import {commercialText} from './catalog.js';
import {BUFFET_CATEGORIES} from './buffet-categories.js';

// Reutiliza las etiquetas comerciales vigentes; no define equivalencias de productos.
export function categoryGroups(catalog=[],categories=[]){
 if(categories.length)return categories;
 if(catalog.some(p=>p.service==='buffet'))return BUFFET_CATEGORIES;
 return [...new Map(catalog.filter(p=>p.category).map(p=>[p.category_id||p.category,{id:p.category_id||p.category,name:p.category,active:p.category_active!==false}])).values()];
}
export function categoryRequest(text,catalog,categories=[]){
 const t=commercialText(text),groups=categoryGroups(catalog,categories);
 const hits=groups.filter(c=>c.active!==false&&commercialText(c.name)&&(' '+t+' ').includes(' '+commercialText(c.name)+' ')).sort((a,b)=>commercialText(b.name).length-commercialText(a.name).length);
 if(!hits.length)return null;
 const chosen=hits.filter(c=>!hits.some(other=>other!==c&&commercialText(other.name).startsWith(commercialText(c.name)+' '))),roots=chosen.map(c=>commercialText(c.name));
 return {category_ids:groups.filter(c=>c.active!==false&&roots.some(root=>commercialText(c.name)===root||commercialText(c.name).startsWith(root+' '))).map(c=>c.id),category_names:groups.filter(c=>c.active!==false&&roots.some(root=>commercialText(c.name)===root||commercialText(c.name).startsWith(root+' '))).map(c=>c.name)};
}
