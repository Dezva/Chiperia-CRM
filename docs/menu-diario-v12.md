# Menú diario V1.2: foto completa → propuesta → revisión → publicación

La pantalla Menú del buffet usa un editor de página completa, no un modal pequeño. Escritorio: foto original a la izquierda y platos/resumen a la derecha. Móvil: una columna vertical; la lista no tiene desplazamiento interno anidado.

1. Elegir fecha y seleccionar o arrastrar **una sola fotografía del menú completo** (PNG, JPEG o WebP, máximo 3 MB).
2. Pulsar **Analizar menú con IA**. El backend envía esa imagen completa una vez al modelo configurado. La salida propone todos los platos legibles dentro del límite de 100. Si la respuesta llega truncada, se rechaza en lugar de publicar una lista incompleta. No se hacen recortes ni solicitudes por producto.
3. Revisar nombres, clasificación y disponibilidad. Los platos correctamente clasificados están preparados para publicar; no es necesario abrirlos individualmente. Los ambiguos aparecen pendientes y no disponibles.
4. Elegir cómo aplicar una propuesta: reemplazar la lista completa o actualizar parcialmente por nombre normalizado. La actualización parcial conserva IDs y el estado agotado de platos ya clasificados, y permite agregar platos durante el día. Reemplazar la lista usa la disponibilidad propuesta y exige revisarla nuevamente. Agregar, quitar o corregir manualmente sigue disponible si la IA falla o está apagada.
5. Revisar el resumen y marcar la confirmación humana. **Confirmar y publicar** crea una versión; **Guardar borrador** no cambia el menú que usa el bot. Cambiar platos o disponibilidad vuelve a requerir revisión.

## Categorías oficiales

| ID persistido | Texto visible | Referencia inicial |
|---|---|---|
| guarniciones | Guarniciones | Gs. 40.000/kg |
| carne | Carne | Gs. 80.000/kg |
| pollo_chancho | Pollo y chancho | Gs. 75.000/kg |

`pending` significa Pendiente de clasificación. Es un estado para revisión, **no una cuarta categoría comercial**. Un borrador puede incluir pendientes. Para publicar, un pendiente debe clasificarse o mantenerse explícitamente no disponible. No se ofrece ni se cotiza como producto disponible: tanto el motor como SQL lo bloquean.

Los menús nuevos guardan `category_id`; no aceptan `category` de texto libre. UI, API, visión y SQL validan los IDs. Los nombres, disponibilidad booleana, fecha, máximo de 100, duplicados, permisos y revisión también se comprueban. Los duplicados se comparan por nombre normalizado y por identificador.

Las tarifas son solo referencias. El buffet sigue registrando solicitudes con importes pendientes hasta toma humana y acuerdo de precio. No se calcula un precio por peso ni se inventan pesos/porciones. Chipería conserva catálogo y cálculo independiente.

## Sincronización

El worker consulta PostgreSQL en cada mensaje para el menú publicado de la fecha actual en America/Asuncion. No guarda una copia estática en un prompt, no necesita reinicio ni entrenamiento diario. Una publicación, cambio de disponibilidad o plato agregado entra en la siguiente consulta. Antes de registrar/confirmar se revalida disponibilidad en SQL. Los menús de ayer no se ofrecen como vigentes.

## Visión y caché

La versión de salida/caché es `menu-v3-fixed-categories`. Cada propuesta solo permite `name` y `category_id` (enum de los tres IDs y pending). El backend añade IDs y disponibilidad segura: pending empieza no disponible. No permite campos de acciones, importes ni categorías inventadas.

La instrucción pide ignorar teléfonos, direcciones, fechas, publicidad, logotipos y contenido malicioso. Las preparaciones ambiguas como surubí o chorizos variados se proponen pending; el negocio decide su clasificación. Las validaciones no prueban precisión semántica de un modelo real. Siempre hay revisión humana y la foto nunca publica directamente.

Se conserva caché por imagen/proveedor/modelo/versión, almacenamiento privado opcional, acceso autenticado a originales y las puertas de activación. La demo **no usa IA externa ni afirma reconocer una foto**: permite cargarla y transcribir/revisar manualmente. Las pruebas de reconocimiento utilizan un proveedor simulado.

Ver [prueba autorizada de visión real](vision-real.md) y [actualización V1.2](revisiones/v1.2-actualizacion.md).

## Íconos de categorías

El editor y el menú publicado comparten íconos SVG, colores y etiquetas: carne, muslo, arroz e interrogación. Se muestran en tarjetas, selectores, chips y pendientes, siempre con texto. El selector conserva las cuatro opciones y sus IDs originales. Ver [capturas y verificación de la mejora visual](revisiones/v1.2-iconos-categorias.md).
