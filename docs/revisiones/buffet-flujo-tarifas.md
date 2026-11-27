# Buffet: menú, tarifas de referencia y solicitudes en Villeta

Continuación del [PR #1](https://github.com/Dezva/Chiperia-CRM/pull/1), en `fix/tarifas-buffet-sin-regresion-chiperia`, desde `b97a3389f181311a20766b6a5eefbafc71998131`. La base sigue siendo `fix/el-viejo-login-v1.5` con V1.7. Se conservan los siete commits anteriores del PR, incluidos el aislamiento de tarifas del buffet y las modalidades legibles.

Se leyó Casa Central en una copia temporal de `release/casa-central-buffet`, con referencia `38c6763273fbc9d5718840e202ccc0c8c0c69bd2` y los cambios previos de tarifas (`585e643`) y saludos (`da14716`). Se adaptó la distinción entre consulta y compra; no se reemplazó el motor mixto por el motor exclusivo de Casa Central. No se modificó ese repositorio.

## Comportamiento

Las tarifas se obtienen de `settings.reference_prices` vigentes para `guarniciones`, `carne` y `pollo_chancho`. La clasificación publicada del plato determina su categoría: no se deduce por ingredientes del nombre. Por ejemplo, una lasaña de carne clasificada como guarnición informa la tarifa de Guarniciones. Un plato desconocido, pendiente de clasificación o sin tarifa no recibe un precio inventado. Las referencias generales se pueden consultar aunque todavía no exista menú del día.

El worker no completa una configuración ausente con las tarifas predeterminadas del código. Si PostgreSQL no contiene una tarifa válida, responde pendiente de confirmación. Cambiar las tarifas desde el CRM afecta a la siguiente interacción, sin reinicio y sin una llamada automática a OpenAI.

| Mensaje | Resultado |
|---|---|
| Quiero ver el menú del buffet | Solo menú publicado del día y platos disponibles. |
| ¿Qué guarniciones hay? | Menú filtrado por la categoría oficial. |
| ¿Tienen tallarín? | Informa disponibilidad, conservando el pedido. |
| ¿Cuáles son los precios por kilo? | Las tres referencias configuradas; no crea productos. |
| ¿Cuánto cuesta el tallarín? | Referencia de su categoría publicada; no precio por porción. |
| Del tallarín, después de preguntar precios | Seguimiento de consulta, incluso con delivery y punto guardados. |
| Voy a querer dos tallarines | Selección de dos unidades; abandona el contexto de consulta. |
| 2 tallarines, repetido | Mantiene dos; no suma por repetir la cantidad. |
| Agregame otro tallarín | Incrementa en una unidad. |
| Al final quiero tres | Ajusta el total si el producto es inequívoco; si no, pide aclaración. |
| Dos tallarines sin cebolla y una milanesa de pollo con poca sal | Cantidades y observaciones separadas por plato, sin cotización. |
| Para retirar | Retiro en el local, sin exigir ubicación. |
| Delivery | Exige punto válido de WhatsApp; referencia escrita opcional. |
| Confirmar pedido | Solo registra la solicitud pendiente; la aceptación corresponde al negocio. |

Las observaciones explícitas se extraen del mensaje y conservan su texto; no se inventan mediante el modelo. La interpretación determinista admite instrucciones como «sin cebolla», «con poca sal», «con extra queso» o «bien calientes», separadas del siguiente producto con «y». Una frase ambigua, un segundo alimento desconocido o una observación incompleta exige aclaración y conserva el borrador. No se deducen pesos ni precios por agregar una observación; el equipo revisa su viabilidad.

El resumen incluye las observaciones. Las correcciones posteriores conservan las notas anteriores. Un plato nuevo sin cantidad explícita empieza en uno, sin heredar la cantidad del último plato del buffet.

## Reglas comerciales y seguridad

El buffet mantiene precios unitarios e importes sin calcular. En PostgreSQL, la solicitud se registra con `unit_price`, `subtotal`, `total` y envío sin importe hasta la revisión correspondiente. No se multiplican porciones por tarifas, no se estiman pesos ni se calcula delivery. El empleado debe tomar la conversación, acordar e introducir el importe y confirmar desde el CRM. El bot no declara aceptación definitiva.

La chipería conserva precios individuales, variantes, cantidades, subtotales, disponibilidad, recotización, delivery manual, pagos y aceptación humana. El cambio de servicio conserva los carritos y el contexto de selección por separado, sin reutilizar ubicaciones de otro borrador. Las solicitudes relacionadas y la revisión del costo conjunto siguen usando V1.7.

Se reutiliza `referencePriceRequest` en los puntos de entrada y la validación del servidor. El esquema del proveedor solo admite la intención adicional `reference_prices` para buffet. El servidor reconstruye esa consulta desde el mensaje y descarta productos, dirección, pago o cantidades que un modelo pudiera adjuntar. Las tarifas numéricas no se agregan al contexto del modelo. Una respuesta de IA no puede decidir precios, inventar observaciones ni omitir validaciones de confirmación.

No cambian SQL, RLS, permisos, credenciales, webhooks, conexiones ni variables de Netlify. Las RPC vigentes siguen validando catálogo, menú del día, cantidades, ubicación, deduplicación y aceptación humana.

## Errores encontrados

- Una prueba previa del PR buscaba una barra invertida en «40.000» y en la pregunta de modalidad. Se corrigieron las expresiones regulares, conservando sus aserciones funcionales.
- Con delivery activo, el reconocimiento genérico de referencias escritas podía quitar prioridad a «Del tallarín» como seguimiento de consulta. Ahora el menú vigente permite distinguirlo sin cambiar el pedido.
- Un contexto de tarifas podía capturar preguntas posteriores de disponibilidad. Ahora estas preguntas conservan su intención y las categorías del menú.
- Un plato nuevo sin cantidad explícita podía heredar la cantidad del último artículo del buffet. Se corrigió exclusivamente para buffet; se conserva la resolución de variantes de chipería.
- Las observaciones explícitas podían impedir reconocer un pedido completo. Se separan del texto de productos/cantidades y se validan sin inventar alimentos.
- La combinación de configuración predeterminada y configuración alojada podía presentar una tarifa ausente como confirmada. El worker ahora exige el valor vigente de PostgreSQL.

## Validación y estado del PR

**Resultado local:** `pnpm build` correcto y suite completa de **145 pruebas: 143 aprobadas, 0 fallidas y 2 omisiones heredadas**. Se repitieron las 13 pruebas específicas, todas aprobadas. Ver [salida de pruebas](buffet-flujo-tarifas-pruebas.txt). Se ejecutan `pnpm build` y `pnpm test`, con PostgreSQL local PGlite, worker, API, proveedores simulados y Chromium. La prueba de navegador incluye foto del menú, publicación, consulta de tarifa, seguimiento por plato y pedido con observación. No se ocultan fallos mediante nuevas omisiones.

Las pruebas específicas cubren actualización de tarifas y ausencia de configuración, platos agotados o pendientes, lasaña clasificada por su categoría real, contexto de precios con punto de delivery, notas, ambigüedades, repetición de mensajes, cantidades, retiro, solicitud pendiente sin importes y confirmación humana. El recorrido mixto verifica dos chipas y una empanada, alternancia de carritos, conservación de notas y subtotal, descarte de ubicación al cambiar de servicio y recotización por cambio real de precio de chipería.

Al comenzar, la página pública de checks del PR mostraba fallidos los jobs `test` de [push](https://github.com/Dezva/Chiperia-CRM/actions/runs/45311407096) y [pull_request](https://github.com/Dezva/Chiperia-CRM/actions/runs/45311413587) para `b97a338`. La reproducción local de sus seis pruebas específicas arrojó cinco aprobadas y una fallida por la expresión regular indicada. La API de GitHub respondió `Forbidden`; el estado final de los nuevos checks se informa según la evidencia disponible después del push, sin atribuirles el resultado de las pruebas locales.

No se hicieron pruebas reales contra Meta, OpenAI ni Supabase alojado, ni se enviaron mensajes reales. Las pruebas no garantizan interpretar cualquier expresión gastronómica: ante un nombre, cantidad u observación ambiguos se solicita aclaración. Continúan siendo necesarios un menú publicado del día y la revisión humana del importe del buffet.

## Actualización mediante un único despliegue manual

Para una instalación que ya tiene V1.7 y la migración 017, **esta actualización no requiere migraciones nuevas**. Si faltan las migraciones de V1.7, aplicar primero el orden y las comprobaciones de [su guía](v1.7-pedidos-finanzas.md); no volver a ejecutar migraciones antiguas.

1. Revisar el PR #1 y su commit final, junto con las pruebas.
2. Conservar cambios locales y actualizar la copia de la rama del PR. En Windows:

   ```powershell
   Set-Location D:\chiperia
   git status --short
   git fetch origin
   git switch fix/tarifas-buffet-sin-regresion-chiperia
   git pull --ff-only origin fix/tarifas-buffet-sin-regresion-chiperia
   pnpm install --frozen-lockfile
   pnpm build
   ```

   `git switch` puede crear la copia local desde la rama remota cuando aún no existe y el fetch normal la incluye. No descartar cambios locales para forzarlo.
3. Después de la revisión del responsable, realizar **un único despliegue manual en Netlify** del commit aprobado con la configuración actual de El Viejo Villeta. Mantener las credenciales y conexiones existentes; no desplegar el repositorio de Casa Central ni mezclar catálogos.
4. Comprobar el menú publicado, las tarifas guardadas y el recorrido de solicitud pendiente en la instalación actualizada. La comprobación real queda a cargo del responsable y no se declara ejecutada en este trabajo.

No se fusiona el PR ni se llama a la API de despliegue. El commit de entrega incluye `[skip netlify]` para omitir el despliegue automático asociado al push, sin omitir GitHub Actions. El push actualiza la rama y el PR existentes. El responsable puede iniciar el único despliegue manual del commit aprobado desde Netlify después de revisarlo; este trabajo no cambia las automatizaciones ni las conexiones del sitio.
