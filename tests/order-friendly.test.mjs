import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {migrateCatalogDemo,withCategories} from '../shared/catalog.js';
import {emptyCart,reduceOrder,demoCommand} from '../shared/viejo-engine.js';
import {matchCommercial} from '../shared/catalog-matching.js';
const data={catalog:JSON.parse(await readFile(new URL('../catalogo-el-viejo.json',import.meta.url)))};migrateCatalogDemo(data);const catalog=withCategories(data.catalog,data.categories);
const text='Amigo dame 2 empanadas de carne 2 de pollo y 2 de jamón con un Villarroel y un sándwich de verduras';
const say=(text,products=catalog)=>{const cart=emptyCart('Prueba','chiperia');return reduceOrder({text,cart,catalog:products,command:demoCommand(text,cart,products)});};

test('Pedido amistoso de la captura: sin comas, familias elípticas y nombre unido, cantidades y precio actuales',()=>{
 const r=say(text);assert.deepEqual(r.cart.items.map(p=>[p.variant_id,p.qty]),[['empanada-carne',2],['empanada-pollo',2],['empanada-jamon-y-queso',2],['villa-roel-base',1],['sandwich-verdura',1]]);assert.equal(r.cart.subtotal,50000);assert.equal(r.kind,'reply');
 const changed=catalog.map(p=>p.id==='empanada-carne'?{...p,price:7500}:p);assert.equal(say(text,changed).cart.subtotal,53000);
});

test('Familias y palabras unidas genéricas: no dependen de Empanada ni Villa Roel; la ambigüedad se conserva',()=>{
 const products=[{id:'a',name:'Canastita',variant:'Calabaza',price:4000},{id:'b',name:'Canastita',variant:'Espinaca y queso',price:6000},{id:'c',name:'Pan especial',variant:'Base',price:5000}].map(p=>({...p,service:'chiperia',available:true,active:true}));
 const r=say('Amiga dame 3 canastitas de calabaza 2 de espinaca y un panespecial',products);assert.deepEqual(r.cart.items.map(p=>[p.variant_id,p.qty]),[['a',3],['b',2],['c',1]]);assert.equal(r.cart.subtotal,29000);
 const ambiguous=[...products,{...products[1],id:'d',variant:'Espinaca y pollo'}];const f=matchCommercial('3 canastitas de calabaza 2 de espinaca',ambiguous);assert.equal(f.ambiguous.length,1);assert.deepEqual(new Set(f.ambiguous[0].products.map(p=>p.id)),new Set(['b','d']));assert.deepEqual(say('3 canastitas de calabaza 2 de espinaca',ambiguous).cart.items,[]);
 const collision=[...products,{...products[2],id:'d',name:'Panespecial'}];const exact=say('un panespecial',collision);assert.equal(exact.cart.items[0].variant_id,'d');
 const joinedAmbiguity=[...products,{...products[2],id:'d',name:'Pane special'}];assert.deepEqual(say('un panespecial',joinedAmbiguity).cart.items,[]);
});
