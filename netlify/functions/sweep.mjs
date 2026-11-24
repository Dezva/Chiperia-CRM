import {env} from '../lib/platform.mjs';
import {requestWorkerDispatch} from '../lib/worker-dispatch.mjs';
// Solo despierta el procesador; nunca interpreta ni envía mensajes directamente.
export default async ()=>{
 await requestWorkerDispatch({origin:env('URL'),secret:env('WORKER_SECRET'),source:'schedule',timeoutMs:5000});
};
export const config={schedule:'* * * * *'};
