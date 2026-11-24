import test from 'node:test';import assert from 'node:assert/strict';import {createHmac,randomUUID as uid} from 'node:crypto';
import {workerToken,workerAuthorized} from '../netlify/lib/worker-auth.mjs';import {requestWorkerDispatch} from '../netlify/lib/worker-dispatch.mjs';import {kick} from '../netlify/lib/platform.mjs';import dispatch from '../netlify/functions/dispatch-background.mjs';import sweep from '../netlify/functions/sweep.mjs';import webhook from '../netlify/functions/whatsapp.mjs';import health from '../netlify/functions/health.mjs';import {databaseV11,mockEnvironment,restBridge} from './v11-helpers.mjs';
const secret='ficticio-con-ñ-🔑-中文';
function capture(t){const logs=[];for(const level of ['info','warn','error'])t.mock.method(console,level,(...args)=>logs.push(args.join(' ')));return logs;}

test('Worker auth: Unicode viaja en ASCII, comparación exacta y compatibilidad con secreto ASCII anterior',()=>{
 const token=workerToken(secret);assert.match(token,/^v1\.[0-9a-f]{64}$/);assert.equal(new Headers({'x-worker-secret':token}).get('x-worker-secret'),token);assert.equal(workerAuthorized(token,secret),true);assert.equal(workerAuthorized(token,secret+'otro'),false);assert.equal(workerAuthorized(token.slice(0,-1)+'x',secret),false);assert.equal(workerAuthorized(secret,secret),false);assert.equal(workerAuthorized('ascii-fixture-only','ascii-fixture-only'),true);for(const value of ['',null,undefined]){assert.equal(workerToken(value),null);assert.equal(workerAuthorized(token,value),false);assert.equal(workerAuthorized(value,secret),false);}
});

test('Despertar worker: webhook/API y sweep usan encabezados ASCII sin revelar clave ni token',async t=>{
 t.after(mockEnvironment());Object.assign(process.env,{WORKER_SECRET:secret,URL:'https://site.fixture.test'});const logs=capture(t),calls=[];t.mock.method(globalThis,'fetch',async(url,options)=>{calls.push({url,options});const header=options.headers['x-worker-secret'];assert.match(header,/^[\x21-\x7e]+$/);assert.equal(workerAuthorized(header,secret),true);assert.equal(options.redirect,'error');return new Response(null,{status:202});});
 await kick(new Request('https://site.fixture.test/.netlify/functions/whatsapp'));await sweep();assert.equal(calls.length,2);assert.ok(calls.every(c=>c.url==='https://site.fixture.test/.netlify/functions/dispatch-background'));assert.match(logs.join('\n'),/"source":"webhook"/);assert.match(logs.join('\n'),/"source":"schedule"/);assert.match(logs.join('\n'),/"status":202/);assert.ok(!logs.join('\n').includes(secret));assert.ok(!logs.join('\n').includes(workerToken(secret)));
 const h=await (await health()).json();assert.equal(h.workerAuth,'hmac-sha256-v1');assert.ok(!JSON.stringify(h).includes(secret));
});

test('Despacho: clave/URL ausentes, HTTP 403 y errores de red se distinguen sin registrar respuesta ni secretos',async t=>{
 const logs=capture(t);let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;return new Response('REFLEJO '+secret+' '+workerToken(secret),{status:403});});
 const input={origin:'https://fixture.test',secret,source:'schedule'};assert.equal((await requestWorkerDispatch({...input,secret:''})).reason,'worker_secret_missing');assert.equal((await requestWorkerDispatch({...input,origin:''})).reason,'origin_missing');assert.equal((await requestWorkerDispatch({...input,origin:'not a URL'})).reason,'invalid_origin');assert.equal(calls,0);assert.deepEqual(await requestWorkerDispatch(input),{accepted:false,status:403});assert.equal(calls,1);
 t.mock.method(globalThis,'fetch',async()=>{throw Object.assign(Error('No revelar '+secret),{name:'TimeoutError'});});assert.equal((await requestWorkerDispatch(input)).reason,'timeout');t.mock.method(globalThis,'fetch',async()=>{throw Error('No revelar '+secret);});assert.equal((await requestWorkerDispatch(input)).reason,'network_error');assert.ok(!logs.join('\n').includes(secret));assert.ok(!logs.join('\n').includes(workerToken(secret)));assert.doesNotMatch(logs.join('\n'),/REFLEJO/);
});

test('Dispatch: peticiones ajenas nunca reservan trabajos; la autenticación correcta deja inicio y fin',async t=>{
 t.after(mockEnvironment());process.env.WORKER_SECRET=secret;const logs=capture(t);let claims=0;t.mock.method(globalThis,'fetch',async url=>{assert.match(url,/guarni_claim$/);claims++;return Response.json(null);});
 for(const [method,header] of [['POST',null],['POST','incorrecto'],['POST',workerToken(secret+'otro')],['GET',workerToken(secret)]]){const r=await dispatch(new Request('https://fixture.test/dispatch',{method,...(header?{headers:{'x-worker-secret':header}}:{})}));assert.equal(r.status,403);}assert.equal(claims,0);assert.equal((await dispatch(new Request('https://fixture.test/dispatch',{method:'POST',headers:{'x-worker-secret':workerToken(secret)}}))).status,200);assert.equal(claims,1);assert.match(logs.join('\n'),/worker_authorization_rejected/);assert.match(logs.join('\n'),/worker_started/);assert.match(logs.join('\n'),/worker_completed.*"handled":0/);
 process.env.WORKER_SECRET='ascii-fixture';assert.equal((await dispatch(new Request('https://fixture.test/dispatch',{method:'POST',headers:{'x-worker-secret':'ascii-fixture'}}))).status,200);assert.equal(claims,2);process.env.WORKER_SECRET='';assert.equal((await dispatch(new Request('https://fixture.test/dispatch',{method:'POST',headers:{'x-worker-secret':'ascii-fixture'}}))).status,403);assert.equal(claims,2);
});

test('Dispatch: fallo del procesador queda visible y se propaga para conservar la recuperación existente',async t=>{
 t.after(mockEnvironment());process.env.WORKER_SECRET=secret;const logs=capture(t);t.mock.method(globalThis,'fetch',async()=>{throw Error('dato privado '+secret);});await assert.rejects(()=>dispatch(new Request('https://fixture.test/dispatch',{method:'POST',headers:{'x-worker-secret':workerToken(secret)}})));assert.match(logs.join('\n'),/worker_failed/);assert.ok(!logs.join('\n').includes(secret));assert.doesNotMatch(logs.join('\n'),/dato privado/);
});

test('PostgreSQL + webhook/cron/worker: secreto Unicode, envío simulado y reintento sin duplicados',async t=>{
 const c=await databaseV11({v17:true});t.after(()=>c.db.close());t.after(mockEnvironment());Object.assign(process.env,{WORKER_SECRET:secret,URL:'https://fixture.site.test',WHATSAPP_SEND_ENABLED:'true',WHATSAPP_TOKEN:'fixture-only-token',WHATSAPP_PHONE_NUMBER_ID:'123456789',WHATSAPP_GRAPH_VERSION:'v25.0',META_APP_SECRET:'fixture-meta'});const logs=capture(t),bridge=restBridge(c);await c.db.exec("update guarni_settings set config=jsonb_set(config,'{bot_enabled}','true')");let delivered=0,dispatches=0;
 t.mock.method(globalThis,'fetch',async(url,options={})=>{
  if(String(url).startsWith('https://fixture.site.test/')){dispatches++;const value=options.headers['x-worker-secret'];assert.match(value,/^[\x21-\x7e]+$/);return dispatch(new Request(String(url),options));}
  if(String(url).startsWith('https://graph.facebook.com/')){delivered++;return Response.json({messages:[{id:'fixture.sent.'+delivered}]});}
  return bridge.fetch(url,options);
 });
 const ext='worker.unicode.'+uid(),wa='595000006666',body=JSON.stringify({entry:[{changes:[{value:{metadata:{phone_number_id:'123456789'},messages:[{id:ext,from:wa,type:'text',text:{body:'hola'}}]}}]}]}),signature='sha256='+createHmac('sha256','fixture-meta').update(body).digest('hex');
 const response=await webhook(new Request('https://fixture.site.test/.netlify/functions/whatsapp',{method:'POST',headers:{'x-hub-signature-256':signature},body}));assert.equal(response.status,200);assert.equal((await response.json()).accepted,1);assert.equal(delivered,1);assert.equal((await c.one("select status from guarni_messages where direction='outbound'")).status,'sent');assert.equal((await c.one('select status from guarni_jobs')).status,'done');
 await c.rpc('guarni_ingest',['worker.cron.'+uid(),wa,'Prueba','chipería']);await sweep();assert.equal(delivered,2);await sweep();assert.equal(delivered,2);assert.equal((await c.rpc('guarni_ingest',[ext,wa,'Prueba','hola'])).duplicate,true);assert.equal(dispatches,3);assert.equal((await c.one('select count(*)::int n from viejo_ai_usage')).n,0);assert.ok(!logs.join('\n').includes(secret));assert.ok(!logs.join('\n').includes(workerToken(secret)));assert.match(logs.join('\n'),/worker_started/);
});
