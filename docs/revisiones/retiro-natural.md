# Retiro y delivery expresados naturalmente

Continuación sobre `fix/tarifas-buffet-sin-regresion-chiperia`, desde `38602c344f0016ae8dd9da08f361a0202a4e458c`. Se conservan las correcciones de stickers, selección de servicio, pedidos múltiples y tarifas del buffet.

## Problema corregido

La modalidad solo se reconocía mediante una lista de respuestas exactas como «retiro» o «para retirar». «Voy a retirar» no coincidía y se enviaba al modelo. Una interpretación inválida podía terminar preguntando qué producto modificar; otra respuesta podía clasificarse como información general y mostrar horarios/pagos, a pesar de que el cliente estaba eligiendo retiro.

Ahora `shared/fulfillment.js` reconoce expresiones de retiro y delivery y distingue negaciones, preguntas y opciones contradictorias. `fulfillmentCommand` se reutiliza en el worker, la demo, la validación del proveedor y el motor del pedido. Una elección clara de modalidad tiene prioridad sobre una interpretación de horarios o cambio de productos. No necesita una llamada al modelo.

Se reproducen las cuatro frases de las capturas:

- «voy a retirar».
- «No voy a ajustar productos, voy a querer el pedido para retirar».
- «No me interesan los horarios ni métodos de pagos. Te estoy diciendo que el modo de retirar sería el que usaría para mi pedido».
- «no voy a ajustar nada de mi pedido. Solo quiero RETIRAR el pedido».

Las cuatro conservan pasta frola y empanada de pollo, una unidad de cada una y subtotal Gs. 11.000 con el catálogo ficticio de prueba; seleccionan Retiro en el local y muestran el paso CONFIRMAR PEDIDO. No muestran horarios ni preguntan por cambios de productos. El resumen de retiro ya no habla de envío pendiente.

## Límites y protecciones

Las consultas y negaciones no se convierten automáticamente en una elección. «No quiero delivery», «retiro o delivery» y «¿Puedo retirar?» requieren aclaración y conservan el borrador. Las preguntas por el estado real del pedido mantienen su ruta de consulta.

Las solicitudes que incluyen productos y modalidad se interpretan juntas: «Voy a retirar 1 pastafrola y 1 empanada de pollo» conserva ambos artículos. No se descartan productos por atender primero la modalidad. Si se elige retiro, se descarta el punto de delivery del borrador; elegir delivery sigue exigiendo un punto válido antes de registrar la solicitud.

No cambian precios, cantidades, variantes, notas, pagos ni la aceptación del negocio. Buffet conserva importes pendientes y revisión humana. La solicitud solo se registra con la confirmación explícita existente. Un mensaje ambiguo puede seguir requiriendo aclaración; esta corrección no garantiza comprender cualquier expresión natural.

## Validación

Build correcto; suite completa de **155 pruebas: 153 aprobadas, 0 fallidas y 2 omisiones heredadas**. Después de ajustar el texto del resumen y preservar las consultas de estado, se repitieron las cinco pruebas específicas/navegador, todas aprobadas. Ver [evidencia ejecutada](retiro-natural-pruebas.txt). La regresión específica usa el worker real con PostgreSQL local PGlite, todos los mensajes de las capturas, cero llamadas al modelo y confirmación repetida sin duplicar pedidos. También cubre protección frente a una intención `info` incorrecta, contexto del buffet, preguntas, negaciones y pedidos con modalidad.

La prueba de navegador de la demo utiliza «voy a retirar» y la aclaración completa antes de confirmar. Las pruebas de proveedores y WhatsApp están simuladas; no se enviaron mensajes reales ni se alteró la base alojada.

## Actualizar

No requiere SQL nuevo. La rama de Netlify sigue siendo `fix/tarifas-buffet-sin-regresion-chiperia`; no volver a la rama base V1.7. Después de revisar el commit final, hacer un único despliegue manual del código actualizado y comprobar que Netlify muestre ese commit.

El commit incluye `[skip netlify]` para evitar un despliegue automático al subirlo a GitHub. No se fusiona el PR ni se cambian variables, credenciales o conexiones.
