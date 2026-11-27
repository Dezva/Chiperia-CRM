# Lenguaje cotidiano, confirmación corta y primer pedido directo

Revisión conjunta de lenguaje cotidiano y flujo inicial. Base: `b508e47`, rama `fix/tarifas-buffet-sin-regresion-chiperia`.

## Comportamiento

Una capa compartida normaliza mayúsculas, acentos y errores de una edición hacia vocabulario de intenciones. No contiene una lista de faltas ortográficas por alimento. Los productos, cantidades, observaciones y direcciones siguen validándose desde el texto original y la información actual de PostgreSQL.

- `Retiiro`, `RETIOR` y expresiones como «voy a retiirar» eligen retiro; `deliveri`, `delibery` y `delivry` se interpretan como delivery. Chipería conserva la prohibición de delivery; buffet exige ubicación y revisión humana.
- Preguntas y negaciones no eligen modalidad: «¿Retiiro?», «no quieroo retiiro» y «puedoo retiiro» se conservan como consulta/aclaración. La normalización de modalidad no cambia palabras de los productos: «una tarta de pollo para retiiro» conserva Tarta · Pollo.
- «Quiero el menú del día», «me pasás el menú de hoy», «quiero ver opciones» o «qué tenés para comer» muestran las opciones actuales sin modificar el borrador. Las consultas de categoría, por ejemplo «quiero ver las facturas», mantienen su filtro.
- Consultas de horarios, ubicación, métodos de pago, estado del pedido y agradecimientos comparten normalización. Para preguntas menos literales, el modelo puede clasificar un tema de información permitido; el servidor responde con configuración real y descarta productos, dirección o pagos que el proveedor intente introducir. No se marca un pago como recibido por una afirmación del cliente.
- `confirmar`, `CONFIRMAR`, `Confirmar`, combinaciones de mayúsculas, espacios externos y puntuación afirmativa se aceptan. También se conserva `confirmar pedido`. «¿Confirmar?», «no confirmar», «noo confirmar», «confirmar más tarde», un carrito vacío o datos de entrega pendientes no envían una solicitud.
- La confirmación del cliente registra una solicitud pendiente. El local sigue aceptando y confirmando importes por separado; un cambio de precio exige revisar el resumen de nuevo.
- En un borrador de chipería que espera la modalidad, un «sí» elige el único modo disponible, retiro; no envía ni acepta automáticamente el pedido. No elige un servicio desde cero ni resuelve opciones ambiguas de productos.

La capa comercial sigue dando prioridad a los alimentos reconocidos y a nombres exactos. No convierte una comida en una orden de navegación por semejanza. Una consulta no tiene permiso para borrar el pedido ni para cambiar precios, cantidades o identidad del cliente.

## Primer mensaje sin saludo

Si no hay un servicio elegido, se compara el pedido completo con los dos catálogos actuales, incluyendo sinónimos y correcciones ya validadas. El menú del buffet debe estar publicado para hoy.

- Si todos los artículos identifican un único servicio, se arma directamente el borrador con sus cantidades. Ejemplo: «una tarta de pollo» identifica chipería sin pedir saludo ni selección previa.
- Si el mismo pedido completo encaja en ambos, se pregunta buffet o chipería. Se conserva el mensaje inicial y se vuelve a procesar al elegir, con precios y disponibilidad actuales.
- No se decide entre servicios por precio o disponibilidad. No se registran órdenes automáticamente a partir del primer mensaje.
- Si no se puede identificar un servicio con seguridad, se solicita aclaración. La inferencia se aplica cuando todavía no hay un servicio seleccionado; no sustituye silenciosamente el servicio de un borrador ya activo.

## Publicación única y SQL 019

Se conserva la política existente de autodeploy de Netlify. El código es compatible con 018: aceptar CONFIRMAR no depende de otro cambio de esquema.

Orden de actualización:

1. Publicar el código conjunto de esta revisión en la rama indicada y verificar el commit desplegado.
2. **Después de que esté publicado el código nuevo**, ejecutar `database/019_confirmacion_amigable.sql` en el Supabase exclusivo de El Viejo que ya tiene 018.
3. Verificar pedido directo → consulta del menú → Retiiro → CONFIRMAR, y comprobar un delivery del buffet.

019 solo acorta el aviso enviado al recibir una ubicación, de CONFIRMAR PEDIDO a CONFIRMAR. Es transaccional, reejecutable y modifica el texto de la función actualmente instalada mediante su definición; no reinstala funciones antiguas ni altera pedidos, catálogo o permisos. La prueba compara cuerpo y permisos antes/después. No aplicar 019 antes de publicar un código que acepte CONFIRMAR. Si se vuelve a un código anterior, restaurar también esa instrucción larga antes del rollback. No volver a ejecutar migraciones anteriores.

## Validación

Ejecución final local:

- `npm run build`: aprobado; catálogo inicial de 31 registros conservado.
- `node --test --test-concurrency=2 tests/*.test.mjs`: **206 pruebas; 204 aprobadas, 0 fallos y 2 omisiones heredadas**; aproximadamente 122 segundos.
- `git diff --check`: aprobado.

La suite incluye la protección de nombres comerciales antes de normalizar intenciones (por ejemplo Papas no se convierte en Pasas), repetición completa tras un artículo desconocido, preguntas y negaciones, variantes de mayúsculas de CONFIRMAR, primer pedido sin saludo y elección de servicio sin perder cantidades. Las pruebas de proveedor usan respuestas simuladas y verifican que sus campos administrativos no cambien el borrador.

Incluye recorrido real del worker con PostgreSQL embebido PGlite, proveedor de IA simulado y Chromium en escritorio de 1440 px y móvil de 390 px. No se enviaron mensajes reales de WhatsApp, no se llamó al modelo real y no se modificó el Supabase real.

[Registro completo](lenguaje-cotidiano-pruebas.txt) · [Captura escritorio](../capturas/lenguaje-cotidiano-desktop.png) · [Captura móvil](../capturas/lenguaje-cotidiano-mobile.png).
