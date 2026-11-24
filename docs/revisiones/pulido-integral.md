# Pulido integral de la conversación — 24/11/2026

Rama: `fix/tarifas-buffet-sin-regresion-chiperia`. Base de esta revisión: `e9548065e96b3615aa386ce43f6235716f1430e7`.

PR existente: https://github.com/Dezva/Chiperia-CRM/pull/1. Su vista pública confirma la rama de trabajo y la base `fix/el-viejo-login-v1.5` en `1b15cfbb341e945a97ec8c8235551c8fd3a7fbe3`. No se modifica esa rama, `main`, Guarnipitan ni producción. Los commits de preparación mantienen `[skip netlify]`.

## Problemas corregidos

| Situación | Comportamiento corregido |
| --- | --- |
| «Perfecto» o «¿Dónde están ubicados?» | Podían terminar en `retry_order`. Ahora responden sin borrar el borrador. |
| Producto inexistente dentro de una lista | Se identifica la parte problemática cuando hay evidencia; se explica el reinicio y se pide la lista completa. No se guardan artículos parciales. |
| Agotado, inactivo o sin precio | Se distinguen las causas usando los datos actuales, sin inventar disponibilidad ni usar un precio de categoría. |
| «Entonces agregame una de pollo» | La resolución de contexto podía reemplazar la variedad anterior. Ahora un incremento explícito agrega y conserva los demás productos y sus notas. |
| «Quitame las empanadas» | Se elimina el artículo identificado o se pide elegir variedad si hay varias. La aclaración no modifica cantidades. También se pueden quitar unidades concretas. |
| Pregunta por una variedad | Responde disponibilidad; no agrega la variedad ni responde solamente su precio. |
| Pregunta por tarifas de otro servicio | Se informa con los datos de ese servicio sin cambiar el carrito activo. El cambio de servicio continúa siendo explícito. |
| Error de IA | Se preservan el carrito y el modo bot. Hay un máximo de dos llamadas, compartido entre expansión de candidatos y reintentos técnicos. |
| Campos adicionales del modelo | El servidor no acepta nombre, dirección, pago o modalidad inventados. La modalidad se deriva del mensaje; la referencia y el pago tienen validaciones propias. |
| Observaciones de chipería | Se conservan y se muestran, además de las del buffet, sin permitir que el modelo invente notas. |

La separación entre precio y disponibilidad, las preguntas por ubicación ya enviada, la bienvenida con ambos servicios y los cambios entre carritos conservan sus regresiones anteriores.

## Política de conversación

`shared/message-intent.js` distingue confirmación, cancelación, pedido, modificación, consulta, modalidad, mensaje social, atención humana e incertidumbre. Son reglas lingüísticas generales, no listas de equivalencias entre alimentos.

`shared/customer-messages.js` responde consultas con el catálogo y la configuración vigentes. Ubicación, horarios y métodos de pago provienen del CRM. Una dirección no configurada no se inventa. Las consultas por métodos de pago no seleccionan uno: una declaración explícita, como «Pago con transferencia», solo selecciona un método que esté configurado. No registra recepción del dinero.

| Caso | Estado del borrador |
| --- | --- |
| Consulta, mensaje social o mensaje sin intención de compra suficientemente clara | Se conserva. Se responde o se solicita aclaración. |
| Compra con artículo desconocido, no vendible o cantidad inválida | Se reinicia únicamente el borrador activo y se pide el pedido completo. La nueva lista no arrastra artículos del intento anterior. |
| Ambigüedad entre variantes conocidas | Se pide elegir y se conserva el contexto de todos los artículos reconocidos. No se agregan parcialmente. |
| Error de conexión, timeout, HTTP o respuesta inválida del proveedor | Se conserva el borrador y se ofrece intentar nuevamente. No se deriva automáticamente a atención humana. |
| El modelo altera cantidades o productos de una solicitud válida | Se trata como fallo de interpretación del proveedor, no como error comercial del cliente. |
| Solicitud explícita de una persona | Se mantiene la transferencia existente y se pausa el bot. Mencionar al encargado en una consulta de estado no implica solicitar una transferencia. |

La confirmación sigue siendo explícita mediante CONFIRMAR PEDIDO. CANCELAR PEDIDO, `/cancelar` y `/reiniciar` mantienen el protocolo existente que también descarta el punto de delivery del borrador. Otras formas de cancelar reciben una indicación del comando; no se realizan acciones irreversibles a partir de una interpretación libre. La cancelación no borra el borrador del otro servicio ni solicitudes anteriores.

## Validación comercial y recuperación técnica

La interpretación determinista continúa resolviendo nombres, sinónimos, cantidades por línea, productos repetidos, correcciones, incrementos y modalidad. Los candidatos y las equivalencias menos literales se derivan del catálogo actual. Se conserva el apoyo del modelo configurado; no hay una tabla nueva de alimentos o abreviaciones.

El servidor valida todos los IDs, cantidades, disponibilidad y notas. Una interpretación parcial o una sustitución comercial insegura se rechaza. No se descartan ingredientes desconocidos tratándolos como palabras de relleno. Una observación debe poder vincularse al texto real y al producto; no puede inventarse desde la IA.

`netlify/lib/conversation.mjs` distingue respuestas comerciales de fallos del proveedor. Hay como máximo dos solicitudes por interacción, con timeout de 12 segundos por solicitud. HTTP 429/5xx, errores de conexión y respuestas malformadas tienen un reintento dentro de ese mismo presupuesto. Otros errores HTTP no provocan una repetición innecesaria. No se reproducen cuerpos de error del proveedor ni credenciales en las respuestas al cliente.

`netlify/lib/worker.mjs` conserva reservas, revisiones, deduplicación, reintentos de la cola y envío incierto. Los fallos de interpretación producen una respuesta temporal y conservan `mode='bot'`. Una toma humana concurrente sigue invalidando las respuestas anteriores mediante las funciones SQL existentes.

Se conserva la autenticación ASCII del worker, el manejo de stickers y multimedia, los puntos de WhatsApp, las solicitudes relacionadas, las fotos y menús del día, los permisos y la recotización. No hay nuevas dependencias, migraciones, cambios de credenciales ni variables de entorno.

## Resúmenes

Los resúmenes de chipería muestran nombre, variante, cantidad, precio unitario, importe de la línea, subtotal y observaciones. Indican modalidad y aceptación final del local. Los del buffet muestran platos, cantidades, observaciones y modalidad, manteniendo el importe final bajo control humano. No calculan importes usando tarifas por kilogramo.

Las respuestas sociales no repiten el resumen completo. Una consulta de pagos no mezcla innecesariamente horarios. Las respuestas no muestran IDs, códigos de variantes, `a_coordinar` ni errores internos.

Capturas de la demo con datos ficticios: [escritorio](../capturas/pulido-conversacion-desktop.png) y [móvil](../capturas/pulido-conversacion-mobile.png).

## Validación

```sh
npm run build
node --test --test-concurrency=1 tests/conversation-polish.test.mjs tests/conversation-polish-worker.test.mjs
npm test
```

Las pruebas nuevas cubren conversaciones completas con PGlite y el worker real, incluyendo consultas con carrito activo, productos inexistentes y agotados, variantes, cantidades inválidas, listas, repetición, incrementos, correcciones, eliminación, notas, retiro, ubicación de delivery, pago pendiente, confirmación humana, carritos separados y solicitudes registradas conservadas. También prueban timeout, conexión, HTTP 429/503/401, JSON inválido, respuesta incompleta, acciones no permitidas, intentos de transferencia injustificados y productos/cantidades inventados por el proveedor.

El navegador verifica el recorrido en 1440×950 y 390×844, con ausencia de errores de JavaScript y de desbordamiento horizontal. La demo no llama IA externa; las expresiones que requieren el modelo se prueban con proveedores simulados.

Resultado ejecutado sobre la entrega: **build correcto; 186 pruebas, 184 aprobadas, cero fallos y dos omisiones heredadas**. [Salida completa de los comandos](pulido-integral-pruebas.txt).

Se mantienen las regresiones existentes de fotos, permisos, ubicación, worker y autenticación. No se agregan omisiones. Las dos omisiones heredadas corresponden a contratos de una interfaz anterior.

Tres expectativas anteriores se actualizan por requisitos explícitos de esta revisión, manteniendo sus casos y reforzando las comprobaciones:

- Una consulta de tarifas de otro servicio conserva el carrito y sigue mostrando las tarifas correctas.
- Una cantidad comercial inválida pide la lista completa; un fallo del proveedor no borra el carrito.
- Un proveedor que cambia cantidades o trunca una compra válida genera un fallo técnico, cubierto además con pruebas de persistencia del worker.

## Casos que requieren aclaración y límites

- Una variedad genérica con varias alternativas no se elige automáticamente. «De pollo» necesita un contexto de producto inequívoco.
- Una abreviación sin correspondencia segura o un sinónimo comercial no registrado puede requerir nombres completos o atención del equipo.
- Cambios de ingredientes que no se puedan validar no reciben un precio implícito. Las observaciones explícitas se conservan para revisión del local.
- Mensajes que mezclan una consulta y una compra pueden requerir separar ambas intenciones. No se registra una parte para completar la otra por suposición.
- No se infieren pesos, importes finales de buffet, cargos adicionales ni recepción de pagos desde texto libre.
- Se mantienen los límites existentes de unidades, artículos y observaciones. Los mensajes muy extensos siguen sujetos al límite de WhatsApp; no se cambia la cola para dividir automáticamente un envío en varios mensajes.

No se probó la precisión de un proveedor real ni se enviaron mensajes a Meta. Las pruebas de IA usan respuestas simuladas; sus métricas no representan consumos o costos reales. La validación real del modelo y del número conectado queda para la comprobación autorizada del despliegue.

## Un único despliegue de producción, cuando se autorice

**Esta entrega no publica en Netlify ni fusiona el PR.** Se conserva `[skip netlify]` y no se habilita auto publishing. El workflow de GitHub solo valida; no despliega.

Para actualizar la instalación local de Windows:

```powershell
Set-Location D:\chiperia
git status --short
git fetch origin
git switch fix/tarifas-buffet-sin-regresion-chiperia
git pull --ff-only origin fix/tarifas-buffet-sin-regresion-chiperia
npm run build
```

Cuando se autorice producción:

1. Comprobar la rama y el SHA final de esta entrega en GitHub. Mantener los cambios locales antes de actualizar; no sobrescribirlos ni usar un reset forzado.
2. En el sitio de Netlify conectado a **Dezva/Chiperia-CRM**, generar manualmente **un deploy de Production** de ese commit de la rama indicada, con la configuración de producción existente. No publicar un preview anterior ni habilitar auto publishing para hacerlo.
3. Verificar en el detalle del deploy que el commit sea el correcto. Si queda Ready esperando publicación manual, publicar ese mismo deploy de Production.
4. No ejecutar SQL: esta revisión usa el esquema V1.7 existente. No repetir migraciones antiguas ni modificar credenciales o variables de Meta, Supabase, OpenAI o Netlify.
5. Comprobar `/.netlify/functions/health`: `workerAuth` debe seguir siendo `hmac-sha256-v1`. Ese endpoint solo comprueba presencia de configuración; no acredita conectividad ni validez de las credenciales.
6. Con una conversación de prueba autorizada, verificar consulta → pedido → variedad → retiro/delivery → CONFIRMAR PEDIDO → aceptación del local. Probar un pedido inválido seguido de uno completo y revisar que no arrastre artículos. Para buffet, usar un menú real publicado del día y comprobar importes nulos hasta la aceptación humana.

La reversión de código no requiere revertir SQL. Si se vuelve a una versión anterior, revisar o cancelar los borradores con aclaraciones pendientes antes de continuarlos con otra versión del motor. Los pedidos registrados se conservan.
