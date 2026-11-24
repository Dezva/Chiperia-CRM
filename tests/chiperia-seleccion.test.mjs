import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { commercialText } from '../shared/catalog.js';
import { deterministicOrder } from '../shared/catalog-matching.js';
import { runWorker } from '../netlify/lib/worker.mjs';
import { databaseV11, mockEnvironment, restBridge } from './v11-helpers.mjs';

const exactOrder = 'Quiero 3 chipas rellenas de jamon y queso y 2 sandwichs de milanesa de carne';
const chipa = 'chipa-rellena-jamon-y-queso';
const sandwich = 'sandwich-milanesa-de-carne';

async function conversation(t) {
  const ctx = await databaseV11({ v17: true });
  t.after(() => ctx.db.close());
  t.after(mockEnvironment());
  const bridge = restBridge(ctx);
  t.mock.method(globalThis, 'fetch', bridge.fetch);
  await ctx.db.exec("update guarni_settings set config=jsonb_set(config,'{bot_enabled}','true')");
  const say = async text => {
    const incoming = await ctx.rpc('guarni_ingest', [randomUUID(), '595000000124', 'Prueba', text]);
    const start = bridge.calls.length;
    await runWorker();
    const emitted = bridge.calls.slice(start).filter(call => call.path.endsWith('/guarni_finish'));
    assert.equal(emitted.length, 1);
    const chat = await ctx.one('select cart,mode from guarni_conversations where id=$1', [incoming.conversation_id]);
    return { ...chat, reply: emitted[0].body.p_body };
  };
  return { ...ctx, say };
}

test('Chipería: pedido real con dos variantes y precios actuales del catálogo', async t => {
  const { db, say, one } = await conversation(t);
  await db.query('update guarni_catalog set price=$2 where id=$1', [chipa, 5700]);
  await db.query('update guarni_catalog set price=$2 where id=$1', [sandwich, 13200]);
  const expected = [[chipa, 3, 5700], [sandwich, 2, 13200]];
  const itemDetails = items => items.map(item => [item.variant_id, item.qty, item.unit_price]);

  await say('chipería');
  for (const plural of ['sandwichs', 'sandwiches', 'sándwiches']) {
    assert.equal(commercialText(plural), 'sandwich');
    const { cart, mode } = await say(exactOrder.replace('sandwichs', plural));
    assert.equal(mode, 'bot');
    assert.equal(cart.service, 'chiperia');
    assert.deepEqual(itemDetails(cart.items), expected, plural);
    assert.equal(cart.subtotal, 43500);
  }

  await say('retiro');
  await say('CONFIRMAR PEDIDO');
  const order = await one('select service,status,subtotal,total,items from guarni_orders');
  assert.equal(order.service, 'chiperia');
  assert.equal(order.status, 'pending');
  assert.equal(order.subtotal, 43500);
  assert.equal(order.total, null);
  assert.deepEqual(itemDetails(order.items), expected);
});

test('Chipería: una variante ausente o desconocida no se sustituye por una del catálogo', async t => {
  const { db } = await conversation(t);
  const { rows: catalog } = await db.query("select * from guarni_catalog where id like 'sandwich-%'");
  const unspecified = deterministicOrder('2 sandwichs', { items: [] }, catalog);
  assert.equal(unspecified.command.intent, 'clarify');
  assert.ok(unspecified.command.context.pending.candidate_ids.length > 1);
  assert.equal(deterministicOrder('2 sandwichs de milanesa de pescado', { items: [] }, catalog).command.intent, 'clarify');
});

test('WhatsApp pide elegir servicio tras Sí y Sí por favor, incluso al repetirlos', async t => {
  const { say, one } = await conversation(t);
  const welcome = await say('Hola');
  assert.match(welcome.reply, /Bienvenido.*Buffet o Chipería/);

  for (const text of ['Sí', 'Sí por favor', 'Sí, por favor', 'Sí']) {
    const { reply, cart, mode } = await say(text);
    assert.match(reply, /Elegí un servicio.*Buffet o Chipería/);
    assert.doesNotMatch(reply, /Bienvenido/);
    assert.equal(mode, 'bot');
    assert.equal(cart.service, null);
    assert.deepEqual(cart.items, []);
  }
  assert.equal((await one('select count(*)::int n from guarni_orders')).n, 0);
  assert.equal((await say('Chipería')).cart.service, 'chiperia');
});
