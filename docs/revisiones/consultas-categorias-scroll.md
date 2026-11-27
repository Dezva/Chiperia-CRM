# Consultas por categoría y posición de lectura del chat

La consulta «Puedes darme las guarniciones que provee el buffet» se interpretaba como un producto desconocido. La detección de consultas por categoría utiliza ahora las etiquetas vigentes del catálogo y las categorías oficiales del buffet, junto con la intención de consultar. No agrega equivalencias entre alimentos ni registra artículos a partir de una categoría. Los pedidos concretos con cantidades conservan su validación comercial.

La respuesta se filtra por los identificadores actuales de categoría, muestra solo platos disponibles del menú publicado de hoy y conserva todo el borrador, incluidas cantidades, modalidad y ubicación. También funciona al consultar el buffet desde una conversación de chipería sin cambiar su borrador. Si la categoría no tiene opciones disponibles o falta el menú de hoy, se informa esa situación.

El chat se reconstruía cada cinco segundos durante la actualización automática, incluso sin novedades. Esa reconstrucción perdía la posición del panel. Ahora se conserva el panel si su contenido no cambió. Si cambia, se restaura el mensaje visible y su desplazamiento dentro del panel; cuando el usuario estaba al final, se acompaña la llegada de mensajes nuevos. Se conservan también las posiciones de la lista de conversaciones y el panel lateral.

Las páginas antiguas cargadas se mantienen durante las actualizaciones mientras la revisión de la conversación siga vigente y exista solapamiento con la ventana actual. La limpieza del historial incrementa la revisión e invalida esas páginas para evitar volver a mostrar mensajes eliminados. Las respuestas tardías de otra conversación se descartan.

No requiere una migración SQL adicional. La 019 conserva su finalidad independiente: acortar el texto de confirmación de ubicación. Esta revisión no habilita servicios externos ni modifica producción durante las pruebas.

Validación: pruebas de consultas de categorías (motor y worker con PostgreSQL embebido), pruebas de navegador Chromium en escritorio y móvil con rueda real y actualización automática simulada, build y suite de regresión. Los resultados ejecutados se registran en `consultas-categorias-scroll-pruebas.txt`. No se realizaron llamadas reales a WhatsApp u OpenAI ni se aplicaron migraciones a la base real.

Resultado ejecutado: 210 pruebas en la suite completa, 208 aprobadas, ninguna fallida y 2 omisiones heredadas. Tras los ajustes finales de la interfaz se reconstruyó y se repitieron las dos pruebas de navegador de chat y lenguaje cotidiano: ambas aprobadas.

Rama de entrega: `fix/tarifas-buffet-sin-regresion-chiperia`. Subida autorizada por el usuario para activar el despliegue automático existente de Netlify.
