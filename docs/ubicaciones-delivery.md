# Ubicaciones de WhatsApp para delivery

Entrega del 15/11/2026 en `feature/whatsapp-delivery-locations`, basada en `f5573f07e7255e97b0feaf46a09912058cbaa712`.

## Comportamiento implementado

- El webhook guarda cada ubicación puntual mediante `guarni_ingest_location`, en la misma transacción que crea el mensaje y su trabajo. El ID de Meta conserva la deduplicación existente. Las coordenadas se validan en JavaScript y en PostgreSQL. Se guardan nombre y dirección opcionales, hora de recepción y hora de envío de WhatsApp cuando está disponible.
- La ubicación se conserva en `guarni_locations`, vinculada al mensaje y a su conversación. El borrador referencia `draft_location_id`. Los pedidos referencian `delivery_location_id`. `guarni_order_locations` conserva los cambios de asociación y quién los aprobó.
- El worker procesa puntos, avisos de ubicación inválida y señales explícitas de tiempo real mediante una RPC específica. Las coordenadas no se envían al modelo de IA. Recibir un punto válido mantiene el modo de atención actual.
- Con productos elegidos y modalidad desconocida, el bot pregunta si será retiro o delivery. Las respuestas breves de modalidad conservan el carrito y se procesan sin IA. Delivery requiere un punto antes de registrar la solicitud. Retiro funciona sin coordenadas. Cada solicitud sigue naciendo en estado `pending`.
- En Conversaciones se muestra una tarjeta con fecha, datos descriptivos, Abrir en Google Maps y Copiar enlace. El botón de copia confirma “Enlace de ubicación copiado”. El detalle del pedido y el formulario de aceptación muestran la ubicación asociada.
- Aceptar un delivery exige dirección textual y una ubicación válida de la misma conversación. La comprobación se hace en PostgreSQL además de la interfaz. Un pedido pendiente de retiro puede recibir una ubicación seleccionada por el personal y convertirse a delivery al aceptarlo.

## Reglas de asociación y revisión

1. Si hay un borrador activo, el punto recibido se asocia a ese borrador. También se conserva una ubicación anticipada cuando todavía no hay pedidos candidatos. El punto se consume al registrar el pedido. Registrar un retiro, cancelar el borrador o reactivar el bot limpia la referencia del borrador.
2. Con el borrador vacío y un único delivery pendiente, un nuevo punto actualiza esa solicitud y se conserva el historial del cambio.
3. Los pedidos pendientes se consideran candidatos para revisión, cualquiera sea su modalidad actual. Si hay varios candidatos, la tarjeta indica que el personal debe seleccionar el correcto.
4. Un punto nuevo con un delivery ya aceptado, en preparación o listo queda pendiente de revisión. El personal utiliza Asociar a pedido / revisar o Seleccionar / revisar ubicación, compara los puntos y marca la aprobación antes de guardar.
5. La asociación manual comprueba la ubicación anterior esperada. Si otro integrante ya la cambió, obliga a actualizar y revisar de nuevo. Durante un procesamiento activo de la conversación, se pide esperar.
6. Entregados, cancelados y rechazados conservan su ubicación. Una ubicación nueva puede pertenecer a una solicitud posterior.
7. Si la hora original de WhatsApp indica que el punto llegó fuera de orden, es anterior a otra ubicación recibida o a un pedido ya registrado, se conserva para revisión en lugar de asociarlo automáticamente a otra solicitud. La precisión de segundos de Meta se tiene en cuenta en la comparación con la creación del pedido.
8. Las lecturas de coordenadas requieren una sesión autorizada. Las tablas nuevas tienen RLS y solo permiten lectura a integrantes. Las RPC de escritura se reservan a `service_role`. La eliminación administrativa existente limpia también las ubicaciones asociadas mediante las claves foráneas.

## Archivos de la entrega

| Archivo | Cambio |
| --- | --- |
| `netlify/functions/whatsapp.mjs` | Recepción tipada, coordenadas y timestamp de Meta |
| `netlify/lib/worker.mjs` | Procesamiento sin IA de ubicaciones, recuperación de fallos y elección de modalidad |
| `shared/locations.js` | Validación, enlace de Maps, portapapeles y textos de solicitud |
| `shared/order-engine.js` | Modalidad condicional y bloqueo de delivery sin punto |
| `netlify/functions/api.mjs` | Lecturas autenticadas, ubicaciones por mensaje y pedido, selección y aprobación |
| `public/app.js` | Tarjetas, copia, detalle del pedido y selector de asociación |
| `public/app.css` | Presentación de las tarjetas en escritorio y móvil |
| `database/006_ubicaciones_delivery.sql` | Tablas, columnas, RLS, asociaciones, historial y validaciones transaccionales |
| `tests/locations.test.mjs` | Pruebas de webhook, worker, motor, API, Maps, copia e interfaz |
| `tests/location-database.test.mjs` | Casos de integración en PostgreSQL/PGlite |
| `tests/order-engine.test.mjs` | Confirmación de retiro con la modalidad seleccionada |
| `tests/database.test.mjs` | Compatibilidad de las pruebas existentes con la nueva migración |
| `tests/admin-delete.test.mjs` | Dependencias del entorno simulado de la interfaz |
| `package.json` | Inclusión de las nuevas pruebas en los comandos existentes |
| `README.md` | Referencia a la nueva funcionalidad y migración |
| `docs/ubicaciones-delivery.md` | Esta guía de instalación, validación y operación |

## Pruebas ejecutadas

Ejecutadas realmente el 15/11/2026 con resultado satisfactorio.

| Comando / verificación | Resultado |
| --- | --- |
| `npm test` | 33 pruebas aprobadas, 0 fallidas |
| `npm run test:db` | 20 pruebas aprobadas, 0 fallidas, incluidas las subpruebas PostgreSQL |
| `npm run build` | Correcto, 69 opciones del catálogo |
| `node --check` sobre interfaz, código compartido, servidor y pruebas | Correcto |
| Revisión en navegador local | Tarjeta en conversación y pedido, copia con confirmación y aprobación de asociación |
| Escritorio 1440 × 950 y móvil 390 × 844 | Tarjetas y controles revisados con datos ficticios |
| Migraciones `001` a `005` | Se conservaron sin modificaciones |

Las 20 situaciones solicitadas están cubiertas entre la suite de aplicación y la de PostgreSQL. Incluyen coordenadas válidas e inválidas, deduplicación, persistencia, historial antiguo paginado, enlace y copia, asociación, retiro, delivery con y sin punto, validación de aceptación, cambios de modalidad, ubicaciones anticipadas y nuevas, atención humana, varios candidatos y datos anteriores a la migración. Se agregaron regresiones para reintentos, usuarios no autorizados, cambios concurrentes, entregas demoradas, pedidos cerrados y eliminación administrativa.

PostgreSQL/PGlite ejecutó las migraciones y procedimientos de la base. Las llamadas HTTP a Meta, OpenAI y Supabase REST se simularon en las pruebas automatizadas. La revisión visual utilizó una copia local del build con una ubicación ficticia. La prueba completa con un número real, Supabase alojado y Netlify queda para el ambiente que el operador habilite siguiendo los pasos siguientes.

## Actualizar Supabase existente

La entrega está preparada en una rama. La aplicación de la migración y la publicación se realizan cuando decidas activar esta versión.

1. En Supabase, seleccioná el proyecto que corresponda al ambiente a actualizar. Comprobá que tenga instalada la versión actual del CRM, incluidas las migraciones hasta `005_eliminacion_admin.sql`.
2. Abrí SQL Editor y creá una consulta nueva.
3. Abrí `database/006_ubicaciones_delivery.sql` de esta rama y copiá el archivo completo, desde `begin` hasta `commit`, junto con las definiciones que contiene.
4. Ejecutá Run. El archivo crea las estructuras y actualiza las funciones dentro de una transacción. Los mensajes y pedidos anteriores conservan sus filas. El archivo puede volver a ejecutarse con la misma versión.
5. Comprobá la estructura con esta consulta de lectura.

```sql
select to_regclass('public.guarni_locations') as ubicaciones,
       to_regclass('public.guarni_order_locations') as historial,
       to_regprocedure('public.guarni_ingest_location(text,text,text,jsonb,text,text)') as recepcion;
```

Las tres columnas deben devolver los nombres de los objetos. La migración emite la notificación para actualizar la caché de PostgREST.

Los deliveries antiguos sin coordenadas aparecen con ubicación pendiente. Para aceptarlos, el personal pide un punto nuevo al cliente y lo asocia desde la conversación o desde el pedido. Su dirección textual sigue siendo necesaria.

Al aplicar la migración cambia inmediatamente la validación de aceptación del servidor. Coordiná su ejecución con la publicación de las funciones y de la interfaz de esta versión en una misma ventana de actualización. Las migraciones iniciales ya instaladas se conservan.

## Revisar la rama y desplegar en Netlify

Para obtener el código localmente dentro de un checkout existente del repositorio.

```sh
git fetch origin
git switch --track origin/feature/whatsapp-delivery-locations
npm install
npm test
npm run test:db
npm run build
```

Si la rama ya existe localmente, usá `git switch feature/whatsapp-delivery-locations`. Se requiere Node.js 22 o superior. El build conserva los valores públicos y secretos configurados mediante los nombres de variables existentes.

Para una validación aislada, utilizá un proyecto Supabase de pruebas con la migración instalada y credenciales de un número de prueba de WhatsApp. Definí sus valores en el contexto Deploy Previews de Netlify. La URL de una preview y su backend pueden operar sobre producción si heredan sus credenciales, por lo que la separación del proyecto y del número es necesaria para una prueba aislada.

1. Creá un pull request desde `feature/whatsapp-delivery-locations` hacia `main` para revisar el código. Con Deploy Previews habilitados, Netlify construye una URL para ese PR.
2. Verificá que el build use `npm run build`, publique `dist` y empaquete las funciones de `netlify/functions`, como en la configuración actual.
3. Si se prueba WhatsApp en una preview, verificá el webhook del número de pruebas con la URL `https://URL-DE-LA-PREVIEW/.netlify/functions/whatsapp` y suscribí `messages` en la app y cuenta de pruebas. Conservá el token de verificación correspondiente a ese ambiente.
4. Realizá el recorrido de prueba indicado abajo. Las funciones programadas de recuperación se ejecutan en el despliegue de producción. En la preview, cada webhook recibido despierta el worker mediante el mecanismo existente.
5. Cuando decidas publicar, coordiná la aplicación de `006` al proyecto correspondiente y la fusión del PR a `main`. La integración existente de Netlify generará el despliegue de producción. Verificá en Deploys que figure Published antes de recargar el CRM.
6. Recargá con Ctrl + F5. La ruta de webhook y los nombres de variables existentes se mantienen para el despliegue de producción.

Referencias para el procedimiento de previews y los valores por ambiente. [Deploy Previews de Netlify](https://docs.netlify.com/deploy/deploy-types/deploy-previews/), [variables por contexto](https://docs.netlify.com/build/environment-variables/overview/).

## Prueba desde WhatsApp real

Usá el número que hayas habilitado para el ambiente de prueba. Ingresá al CRM como integrante autorizado.

1. Enviá `Quiero 2 Kikito`. Si todavía no indicaste modalidad, el asistente debe preguntar retiro o delivery.
2. Respondé `delivery`. Debe solicitar la ubicación actual puntual. El carrito conserva los productos y cantidades.
3. Antes de enviar el punto, escribí `CONFIRMAR PEDIDO`. Debe volver a pedir la ubicación y conservar el borrador, sin crear un pedido.
4. En WhatsApp, abrí Adjuntar o el botón +, elegí Ubicación y enviá tu ubicación actual puntual. Usá la opción puntual del cliente de WhatsApp.
5. En Conversaciones debe aparecer la tarjeta con la fecha, los botones Abrir en Google Maps y Copiar enlace. El bot debe acusar recibo de la ubicación. Copiá el enlace y pegalo en un campo de texto para comprobar que contiene las coordenadas recibidas. El mapa se abre al pulsar el enlace.
6. Enviá `CONFIRMAR PEDIDO`. Debe aparecer una sola solicitud `pending` con la ubicación en el detalle. El local todavía debe aceptarla.
7. Desde el CRM, abrí el pedido, revisá la ubicación, completá dirección, modalidad y costo de envío y aceptalo. Comprobá la notificación normal de aceptación.
8. Enviá otra ubicación con el pedido aceptado. La original debe seguir asociada hasta que un integrante revise y apruebe el cambio mediante Seleccionar / revisar ubicación.
9. Repetí con un pedido para retiro. Debe registrarse y aceptarse sin solicitar coordenadas.
10. Tomá una conversación y enviá una ubicación desde el cliente. Debe guardarse en la tarjeta mientras la atención humana continúa y el bot permanece pausado.
11. Con varios pedidos pendientes del mismo cliente, enviá otro punto. Revisá el aviso, elegí el pedido correspondiente y confirmá la asociación.
12. Para un mensaje ya recibido, una nueva entrega del mismo ID de Meta debe conservar un solo punto y un solo trabajo. Esta última comprobación se prueba automáticamente y puede revisarse por el ID de mensaje en Supabase, sin imprimir las coordenadas en logs.

## Límites técnicos

- El punto enviado por el cliente puede proceder de la opción de ubicación actual o de una selección manual del mapa. El payload de coordenadas no prueba su presencia física. La interfaz lo presenta como una ubicación compartida.
- Se guarda un punto por mensaje. Las señales explícitas `live_location`, `is_live` o `live_period` generan una solicitud de ubicación puntual. Si Meta informa un contenido simplemente como `unsupported`, su payload puede no identificar que el origen era una ubicación en vivo. Ese caso mantiene la atención de contenidos no compatibles existente. No hay seguimiento continuo.
- Los mensajes genéricos de ubicación anteriores a esta versión carecen de coordenadas recuperables. El cliente debe reenviar el punto. Los mensajes nuevos conservan sus coordenadas y pueden abrirse y copiarse también desde el historial paginado.
- El selector del detalle carga las últimas 100 ubicaciones de la conversación. Un punto más antiguo se puede abrir, copiar y asociar desde su tarjeta usando Cargar mensajes anteriores.
- Recibir un punto no solicita automáticamente al local aceptar el pedido ni envía mensajes a un repartidor. El personal decide la aceptación y comparte el enlace copiado mediante su procedimiento habitual.

Los enlaces de búsqueda se construyen con `api=1` y coordenadas codificadas. Este formato funciona sin una clave de Google Maps. [Maps URLs de Google](https://developers.google.com/maps/documentation/urls/get-started).
