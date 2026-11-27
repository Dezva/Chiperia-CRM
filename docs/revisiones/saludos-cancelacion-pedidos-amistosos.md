# Saludos, cancelación y pedidos con lenguaje informal

## Problemas reproducidos

Una conversación nueva recibía la bienvenida por defecto, pero «Hola qtal?» y «Hola buenas» podían responder «No entendí» cuando ya había un servicio o borrador. Borrar el cliente o reiniciar ocultaba el problema, sin demostrar que el saludo se interpretara correctamente.

El pedido «Amigo dame 2 empanadas de carne 2 de pollo y 2 de jamón con un Villarroel y un sándwich de verduras» no conservaba la familia de producto al omitir la palabra empanada en las variedades siguientes. El vocativo se trataba como texto desconocido y el nombre comercial unido no se recuperaba correctamente.

Las cancelaciones en lenguaje cotidiano necesitaban distinguir un borrador de una solicitud registrada y no interpretar «no voy a querer más» como una cancelación inequívoca.

## Comportamiento

El reconocimiento social combina cláusulas de saludo, formas abreviadas y vocativos. No depende de comas ni compara el mensaje con una frase completa predefinida. Un saludo sin solicitud recibe una respuesta apropiada al estado actual, conservando cantidades, modalidad, ubicación, aclaraciones y pedidos registrados. `/reiniciar` descarta el borrador, sin cancelar solicitudes ya enviadas al local.

Si el saludo precede a un pedido o consulta, se procesa el texto restante con la validación comercial existente. Se mantienen sus cantidades, nombres, notas, negaciones y signos de pregunta. Un nombre comercial exacto tiene prioridad sobre un saludo; nunca se eliminan palabras internas de los productos.

El matcher conserva la familia comercial ya identificada cuando las variedades siguientes aparecen con cantidades o conectores, por ejemplo «2 empanadas de carne 2 de pollo». Un prefijo de variedad solo puede resolverse dentro de esa familia y si el catálogo actual lo identifica sin ambigüedad. Si aparecen varias variedades compatibles, se pregunta cuál corresponde.

Los nombres escritos sin espacios se contrastan con nombres y sinónimos actuales de varias palabras. Se admiten coincidencias exactas o una única edición en nombres largos cuando hay una sola forma candidata. Los nombres exactos existentes siempre prevalecen. No se agregó una equivalencia específica para Villa Roel, empanadas ni alimentos particulares. El ejemplo de la captura se reconoce como cinco artículos vendibles distintos y su precio se calcula con los registros vigentes del servidor.

Una cancelación explícita descarta el borrador que todavía no se envió, conservando el otro servicio y el historial. Al cancelar ese borrador se despega también la ubicación para evitar reutilizarla en otro pedido. Los comandos anteriores siguen disponibles.

«No voy a querer más» pide aclarar si se desea cancelar o dejar de agregar productos. Las preguntas sobre cancelación, las negaciones y las solicitudes de quitar un artículo no cancelan todo el pedido. Si hay borrador y solicitudes registradas, o varios pedidos activos, se pide identificar el objetivo.

Para una solicitud ya enviada, se registra el mensaje y se pasa la conversación a atención humana. No se cambia automáticamente el estado del pedido ni se promete que esté cancelado: el local debe revisar y confirmar la cancelación. El usuario puede identificar el pedido por número; la búsqueda se limita a su conversación. Si la atención humana ya estaba activa, el mensaje sigue el flujo existente del equipo.

## Validación y actualización

Las pruebas cubren motor, worker con PostgreSQL embebido, deduplicación, borrador con ubicación, pedido registrado, `/reiniciar`, ambigüedades, variantes, precios actualizados, nombres unidos y colisiones. Chromium comprueba la experiencia completa en escritorio y móvil. Los resultados ejecutados están en `saludos-cancelacion-pedidos-amistosos-pruebas.txt`.

No requiere migraciones SQL adicionales ni dependencias nuevas. No se habilitan servicios externos durante las pruebas ni se cambian datos de la instalación real. Las mejoras anteriores de categorías del buffet, confirmación, delivery exclusivo del buffet y lectura del chat se mantienen en la misma rama.

Resultado ejecutado: build correcto; 11 pruebas dirigidas aprobadas; recorrido de Chromium aprobado en ambos tamaños; suite final de 224 pruebas con 222 aprobadas, ninguna fallida y 2 omisiones heredadas. Se actualizaron dos expectativas de texto de bienvenida/cancelación, manteniendo sus verificaciones de selección de servicio, conservación del carrito y protección frente a IA adversarial.

Rama de entrega: `fix/tarifas-buffet-sin-regresion-chiperia`, con el autodeploy existente.
