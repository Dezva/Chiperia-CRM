import {workerToken} from './worker-auth.mjs';
export async function requestWorkerDispatch({origin,secret,source,timeoutMs=2500}){
 const token=workerToken(secret);
 if(!token||!origin){const reason=!token?'worker_secret_missing':'origin_missing';console.warn('worker_dispatch_skipped',JSON.stringify({source,reason}));return {accepted:false,reason};}
 let target;try{target=new URL('/.netlify/functions/dispatch-background',origin);if(!['https:','http:'].includes(target.protocol)||target.username||target.password)throw Error();}catch{console.warn('worker_dispatch_skipped',JSON.stringify({source,reason:'invalid_origin'}));return {accepted:false,reason:'invalid_origin'};}
 try{
  const response=await fetch(target.href,{method:'POST',redirect:'error',headers:{'x-worker-secret':token},signal:AbortSignal.timeout(timeoutMs)});
  const result={accepted:response.ok,status:response.status};
  const log=response.ok?console.info:console.warn;
  log('worker_dispatch_result',JSON.stringify({source,...result,auth:'hmac-sha256-v1'}));
  // HTTP 202 solo confirma recepción por Netlify; worker_started confirma autenticación.
  return result;
 }catch(error){const reason=['AbortError','TimeoutError'].includes(error?.name)?'timeout':'network_error';console.warn('worker_dispatch_failed',JSON.stringify({source,reason}));return {accepted:false,reason};}
}
