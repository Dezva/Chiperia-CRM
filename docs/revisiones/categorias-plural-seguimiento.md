# Categorías en plural y consultas de seguimiento

La captura posterior al despliegue c466c72 mostró dos errores: «Y de las carnes?» no se reconocía como consulta, y «Cuáles son las carnes del menú de hoy?» mostraba todo el menú. La validación anterior cubría guarniciones, pero no este plural ni esta continuación abreviada.

La normalización comercial existente producía `carn` para «carnes» y `carne` para la etiqueta «Carne», de modo que no se encontraba la categoría. Esta revisión deriva formas plurales desde las etiquetas vigentes de las categorías y las compara dentro del reconocimiento de categorías. Conserva la normalización de productos, sus IDs, precios y equivalencias comerciales. No incorpora un diccionario de errores de alimentos ni una excepción para una frase específica.

Los fragmentos que contienen una categoría identificada y palabras gramaticales de consulta —como «Y de las carnes?»— se reconocen como consultas de menú. No necesitan repetir la pregunta completa. El recorrido determinista conserva los IDs de categoría al generar la respuesta, incluidos los seguimientos en el worker. Preguntar por una categoría no agrega ni modifica artículos.

El filtro utiliza el menú publicado de hoy, la categoría asignada por el encargado y la disponibilidad vigente. `carne` sigue siendo una categoría distinta de `pollo_chancho`; no se reclasifican platos por sus nombres. Si no hay carnes disponibles, informa esa situación en vez de ofrecer guarniciones o el menú completo.

Las pruebas reproducen ambas frases de la captura, el seguimiento después de guarniciones, variantes con y sin signos, singular/plural, categorías administrables de chipería, cambios de disponibilidad y conservación del borrador y la ubicación. Se verifican el motor, el worker con PostgreSQL embebido y Chromium en escritorio y móvil. Las consultas se resuelven sin llamar al modelo.

No requiere otra migración SQL ni nuevas dependencias. No se ejecutan llamadas reales a WhatsApp/OpenAI ni cambios en la base real durante las pruebas. Los resultados ejecutados se guardan en `categorias-plural-seguimiento-pruebas.txt`.

Resultado ejecutado: build correcto; 6 pruebas dirigidas aprobadas; suite completa con 213 pruebas, 211 aprobadas, ninguna fallida y 2 omisiones heredadas. Rama de entrega: `fix/tarifas-buffet-sin-regresion-chiperia`, con el autodeploy existente.
