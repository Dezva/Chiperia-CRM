import {runWorker} from '../lib/worker.mjs';
import {env} from '../lib/platform.mjs';
import {workerAuthorized} from '../lib/worker-auth.mjs';
export default async request=>{
 const secret=env('WORKER_SECRET'),header=request.headers.get('x-worker-secret');
 if(request.method!=='POST'||!workerAuthorized(header,secret)){
  console.warn('worker_authorization_rejected',JSON.stringify({post:request.method==='POST',header_present:!!header,secret_configured:!!secret}));
  return new Response('Forbidden',{status:403});
 }
 console.info('worker_started',JSON.stringify({auth:'hmac-sha256-v1'}));
 try{const handled=await runWorker({budgetMs:50000});console.info('worker_completed',JSON.stringify({handled}));return new Response('OK');}
 catch(error){console.error('worker_failed',JSON.stringify({reason:'processing_error'}));throw error;}
};
export const config={background:true};
