import test from 'node:test';
import assert from 'node:assert/strict';
import { activeCatalog, defaults, emptyCart, reduceOrder, quote, localDate } from '../shared/viejo-engine.js';
import { deterministicConversation } from '../shared/conversation-context.js';

const catalog = [{ id: 'tradicional-base', name: 'Chipa tradicional', variant: 'Base',
  service: 'chiperia', category: 'Chipas', category_id: 'chipas',
  aliases: [], available: true, active: true, category_active: true,
  seasonal: false, legacy_generic: false, price: 3500 }];
const menus = [{ day: localDate(), status: 'published',
  items: [{ id: 'tallarin', name: 'Tallarín', category_id: 'guarniciones', available: true }] }];
const settings = { ...defaults, reference_prices: { guarniciones: 40000, carne: 80000, pollo_chancho: 75000 } };
const answer = (text, cart, command) => reduceOrder({ text, cart, command, catalog, menus, settings });

test('Las tarifas por kilo son exclusivas del buffet y no cotizan un pedido', () => {
  const selected = answer('buffet', emptyCart('Prueba', 'chiperia'));
  const price = answer('¿Cuáles son los precios por kilo?', selected.cart);
  assert.equal(price.cart.service, 'buffet');
  assert.equal(price.cart.reference_price_context, true);
  assert.match(price.reply, /40\.000/);
  assert.match(price.reply, /80\.000/);
  assert.match(price.reply, /75\.000/);
  assert.deepEqual(price.cart.items, []);
  const followup = answer('del tallarín', price.cart);
  assert.match(followup.reply, /Tallarín.*Guarniciones.*40\.000/);
  assert.deepEqual(followup.cart.items, []);
  assert.equal(followup.cart.subtotal, undefined);
  const quantity = answer('2 tallarines', price.cart);
  assert.equal(quantity.cart.reference_price_context, undefined);
  assert.doesNotMatch(quantity.reply, /referencia por kilo/);
});

test('La chipería mantiene precios unitarios, cálculos y carrito separados del buffet', () => {
  let cart = emptyCart('Prueba', 'chiperia');
  const priceCommand = deterministicConversation('¿Cuánto cuesta la chipa tradicional?', cart, catalog);
  const consult = answer('¿Cuánto cuesta la chipa tradicional?', cart, priceCommand);
  assert.match(consult.reply, /3\.500/);
  assert.doesNotMatch(consult.reply, /por kilo|referencia por kilo/i);
  assert.deepEqual(consult.cart.items, []);
  const order = answer('Quiero 2 chipas tradicionales', cart, {
    intent: 'update_cart', items: [{ variant_id: 'tradicional-base', qty: 2, notes: '' }]
  });
  assert.equal(order.cart.subtotal, 7000);
  assert.equal(quote([{ variant_id: 'tradicional-base', qty: 2 }], 'chiperia', catalog).subtotal, 7000);
  const switched = answer('buffet', order.cart);
  assert.equal(switched.cart.service, 'buffet');
  assert.deepEqual(switched.cart.items, []);
  const back = answer('chipería', switched.cart);
  assert.equal(back.cart.service, 'chiperia');
  assert.equal(back.cart.subtotal, 7000);
  assert.equal(back.cart.reference_price_context, undefined);
  assert.match(back.reply, /3\.500/);
});

test('El cambio directo a buffet con consulta de precios no rompe la selección del servicio', () => {
  const result = answer('¿Cuáles son los precios por kilo del buffet?', emptyCart('Prueba', 'chiperia'));
  assert.equal(result.cart.service, 'buffet');
  assert.match(result.reply, /40\.000/);
  assert.deepEqual(result.cart.items, []);
});

test('Consulta de menú del buffet seguida de pedido conserva el flujo humano de precios', () => {
  const buffet = answer('buffet', emptyCart('Prueba', 'chiperia'));
  const menu = answer('menú', buffet.cart, { intent: 'menu' });
  assert.match(menu.reply, /Tallarín/);
  assert.match(menu.reply, /encargado/);
  const prices = answer('¿Cuánto sale el tallarín?', menu.cart);
  assert.match(prices.reply, /40\\.000/);
  const selection = 'voy a querer el tallarin';
  const command = deterministicConversation(selection, prices.cart, activeCatalog('buffet', catalog, menus));
  assert.equal(command?.intent, 'update_cart');
  const placed = answer(selection, prices.cart, command);
  assert.match(placed.reply, /1 × Tallarín/);
  assert.match(placed.reply, /Modalidad: A coordinar/);
  assert.match(placed.reply, /¿Vas a retirar o querés delivery\\?/);
  assert.equal(placed.cart.items[0].unit_price, null);
  assert.equal(placed.cart.subtotal, null);
  assert.equal(placed.cart.reference_price_context, undefined);
  const delivery = answer('delivery', placed.cart, { intent: 'summary', fulfillment: 'delivery' });
  assert.match(delivery.reply, /Enviá tu ubicación puntual de WhatsApp/);
  const premature = answer('CONFIRMAR PEDIDO', delivery.cart);
  assert.equal(premature.kind, 'reply');
  assert.match(premature.reply, /ubicación puntual/);
  const pickup = answer('retiro', placed.cart, { intent: 'summary', fulfillment: 'retiro' });
  assert.match(pickup.reply, /Modalidad: Retiro en el local/);
  assert.equal(pickup.cart.items[0].unit_price, null);
});

test('Dos tallarines después de consultar tarifas se procesa como pedido y no como otra tarifa', () => {
  const buffet = answer('buffet', emptyCart('Prueba', 'chiperia'));
  const rates = answer('¿Cuáles son los precios por kilo?', buffet.cart);
  const text = '2 tallarines';
  const command = deterministicConversation(text, rates.cart, activeCatalog('buffet', catalog, menus));
  assert.equal(command?.intent, 'update_cart');
  const placed = answer(text, rates.cart, command);
  assert.deepEqual(placed.cart.items.map(item => [item.name, item.qty]), [['Tallarín', 2]]);
  assert.equal(placed.cart.reference_price_context, undefined);
  assert.equal(placed.cart.subtotal, null);
});

test('Chipería no pierde su subtotal después de consultas y pedidos del buffet', () => {
  const chiperia = answer('2 chipas tradicionales', emptyCart('Prueba', 'chiperia'),
    { intent: 'update_cart', items: [{ variant_id: 'tradicional-base', qty: 2, notes: '' }] });
  assert.equal(chiperia.cart.subtotal, 7000);
  const buffet = answer('buffet', chiperia.cart);
  const rate = answer('¿Cuáles son los precios por kilo?', buffet.cart);
  const order = answer('voy a querer el tallarin', rate.cart,
    deterministicConversation('voy a querer el tallarin', rate.cart, activeCatalog('buffet', catalog, menus)));
  assert.equal(order.cart.subtotal, null);
  const back = answer('chipería', order.cart);
  assert.equal(back.cart.subtotal, 7000);
  assert.equal(back.cart.items.length, 1);
  assert.doesNotMatch(back.reply, /por kilo/);
});
