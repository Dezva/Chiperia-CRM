# Worker: autenticación ASCII y diagnóstico del despacho

Corrección sobre `fix/tarifas-buffet-sin-regresion-chiperia`, desde `2d4eab863ed1910fb7ec20d68bba641b1e5362f3`. Conserva la corrección de retiro natural y las reglas comerciales de V1.7.

## Causa identificada

El log `Discarded request header 'x-worker-secret' because it contains non-ASCII characters` identifica un bloqueo en la autenticación interna. `whatsapp` y `sweep` enviaban directamente `WORKER_SECRET` dentro del encabezado HTTP. Netlify podía eliminar ese encabezado antes de ejecutar la función, y `dispatch-background` rechazaba la petición con 403 sin comenzar el worker.

Una ejecución de `sweep` no demostraba éxito: no se comprobaba su respuesta HTTP. El webhook también podía guardar un mensaje sin lograr despertar el procesador. Esto es independiente de la interpretación comercial o del modelo configurado.

Un Deploy Preview puede usar variables distintas de Production. Publicar un preview no demuestra que se haya construido con las variables de Production. La captura recibida mostraba Production en Ready y Deploy Preview en Live; ambas versiones todavía correspondían a `2d4eab8`.

## Corrección

`workerToken` deriva una credencial ASCII mediante HMAC-SHA256, usando el valor exacto de `WORKER_SECRET` como clave y un identificador fijo de operación/versionado. El encabezado contiene únicamente `v1.` y caracteres hexadecimales. El secreto puede contener Unicode; no se recorta, normaliza ni modifica su valor.

Los dos invocadores —webhook/API y cron— reutilizan `requestWorkerDispatch`. El receptor calcula y compara la credencial en tiempo constante. Se mantiene compatibilidad con llamadas antiguas que usaban un secreto ASCII imprimible sin espacios. Un encabezado ausente o incorrecto sigue rechazándose: no se desactiva la autenticación ni se permite una clave vacía.

La credencial derivada sigue permitiendo despachar trabajo: debe tratarse como un secreto. No se envía al navegador ni se registra en logs. Tampoco se registran cuerpos, teléfonos, URLs de destino, valores de variables ni respuestas HTTP que podrían reflejar credenciales. Las solicitudes no siguen redirecciones.

No cambian `WORKER_SECRET`, las claves de Meta/OpenAI/Supabase ni las conexiones de Netlify. No hay SQL nuevo ni cambios en catálogo, precios, carritos, permisos, ventana de WhatsApp o deduplicación. La cola conserva sus validaciones, reintentos y tratamiento de envíos inciertos; no se fuerzan reenvíos.

## Logs nuevos

| Evento | Significado |
|---|---|
| `worker_dispatch_result` | HTTP devuelto al solicitar el despacho; incluye `source`, `status`, `accepted` y versión de autenticación. |
| `worker_dispatch_skipped` | Falta la variable, la URL o su formato es inválido. Muestra el motivo sin imprimir el valor. |
| `worker_dispatch_failed` | Timeout o fallo de red, sin imprimir el mensaje original de error. |
| `worker_authorization_rejected` | El receptor no aceptó el método o la credencial; solo indica presencia del encabezado y de la configuración. |
| `worker_started` | La autenticación del receptor pasó y el worker comenzó. |
| `worker_completed` | Finalizó esta ejecución; `handled` cuenta operaciones atendidas, no entregas confirmadas. |
| `worker_failed` | El procesador lanzó una excepción; se conserva su propagación y recuperación anteriores. |

HTTP 202 de Netlify solo confirma recepción del despacho, no ejecución exitosa de la autenticación. Buscar `worker_started` en `dispatch-background`. Para confirmar la entrega, revisar el estado guardado del mensaje o la respuesta recibida en WhatsApp. Un contador `handled` no sustituye esa comprobación.

El endpoint público de lectura `/.netlify/functions/health` añade `workerAuth: "hmac-sha256-v1"` para identificar que ese sitio está sirviendo esta corrección. No devuelve el secreto ni la credencial.

## Desplegar en Production

1. Conservar como Production branch `fix/tarifas-buffet-sin-regresion-chiperia`.
2. Generar un deploy **Production** desde el commit de esta corrección. No volver a publicar el preview anterior de `2d4eab8`.
3. Comprobar en Netlify **Where: Production**, la rama y el commit nuevos. Si requiere publicación manual, publicar ese deploy de Production para que sea el activo.
4. Las funciones deben disponer del mismo `WORKER_SECRET` en el contexto Production y scope Functions. La corrección no obliga a reemplazar su valor por contener Unicode. Si faltara la variable, habrá que configurarla; codificar no puede sustituir un secreto inexistente ni hacer coincidir valores distintos.
5. Abrir el health del dominio público y verificar `workerAuth: "hmac-sha256-v1"`.
6. Enviar un mensaje nuevo y revisar `worker_started` / `worker_completed`, además de la respuesta en WhatsApp.

Si sigue apareciendo el aviso de encabezado no ASCII, todavía hay un invocador anterior enviando el valor sin codificar: comprobar que webhook, sweep y dispatch correspondan al nuevo deploy activo. Si desaparece el aviso pero se registra 403, revisar la coincidencia de variables/contextos, sin compartir su contenido. `secret_configured: false` identifica una variable ausente.

Los trabajos viejos pueden haber agotado sus reintentos. No reiniciar indiscriminadamente estados `sending` o `uncertain`; primero probar un mensaje nuevo y revisar la cola. La instalación de código no altera esos estados ni elimina el historial.

El commit incluye `[skip netlify]`; se prepara un único despliegue manual. No se despliega, fusiona el PR ni modifica producción desde esta sesión.

## Validación

Build correcto y suite completa de **161 pruebas: 159 aprobadas, 0 fallidas y 2 omisiones heredadas**. La regresión específica terminó con 24 aprobadas y una de esas omisiones heredadas. Ver [evidencia ejecutada](worker-auth-ascii-pruebas.txt). Pruebas locales con proveedores simulados, Node, Chromium y PostgreSQL PGlite. El recorrido de integración usa una clave ficticia con `ñ`, emoji y caracteres chinos: webhook firmado → encabezado ASCII → dispatch autenticado → worker → envío de WhatsApp simulado guardado en SQL. Cron procesa otro mensaje y una ejecución repetida no duplica el envío.

También se cubren claves incorrectas/ausentes, método incorrecto, compatibilidad ASCII, HTTP 403, timeout, error de red, fallo del procesador y ausencia de secretos en logs. La validación local no prueba la configuración ni la entrega reales del sitio alojado; esa comprobación se realiza después del despliegue de Production.
