# V1.4: interpretación compacta y métricas

El worker sigue leyendo el catálogo/categorías y el menú publicado de hoy desde PostgreSQL en cada interacción relevante. No hay entrenamiento ni copia comercial dentro de un prompt fijo. Editar categorías, productos o sinónimos no solicita interpretación al modelo ni despierta el worker.

## Recorrido

1. Selección de servicio, menú, modalidades, confirmación, cancelación e intervención humana mantienen su recorrido. Horarios, consultas de precio reconocibles y pedidos con equivalencias/cantidades inequívocas se resuelven sin IA.
2. Se recuperan todos los candidatos coincidentes por nombres, variedades y sinónimos; se incluyen los productos del carrito. Se buscan términos de todos los artículos, sin cortar en la primera coincidencia. Una categoría o un nombre compartido recupera sus opciones.
3. Si hace falta IA, el contexto contiene servicio, IDs/cantidades del carrito, candidatos `[id,nombre,sinónimos,vendible]` y pagos permitidos. No incluye precios, fotografías, datos del cliente, ubicaciones, carritos de otros servicios, horarios completos, auditoría ni menús históricos.
4. Sin coincidencias se usa todo el catálogo compacto. Si el modelo indica duda o devuelve IDs no verificables y la búsqueda era parcial, se amplía una vez a todo el catálogo compacto. No se eligen los primeros N artículos. Máximo dos llamadas, de hasta 20 segundos cada una.
5. El servidor verifica cada equivalencia, cantidad, ID, opción disponible y preservación de los artículos mencionados/previos. No acepta un sinónimo no registrado por sugerencia del modelo. Ambigüedades, artículos desconocidos o no vendibles piden aclaración sin agregar parcialmente. Errores de red/proveedor transfieren la atención humana conservando el carrito.
6. Cotización, precio y disponibilidad se verifican de nuevo en el motor y PostgreSQL; la confirmación humana, el costo manual de delivery y la recotización siguen vigentes. Buffet conserva sus importes bajo control humano.

La coincidencia determinista admite cantidades numéricas y las palabras uno a doce, plurales regulares, tildes, mayúsculas y conectores comunes. Otros giros naturales pasan al modelo; si no se puede comprobar la equivalencia comercial, se pide una formulación clara o intervención humana. Esta restricción evita inventar ventas. No se interpretan libremente referencias de categorías como productos.

## Comparación reproducible

Ejecutar `node scripts/compare-context.mjs`. El archivo [v1.4-contexto.json](revisiones/v1.4-contexto.json) compara el JSON de contexto anterior (carrito, las siete columnas de catálogo disponibles que seleccionaba la rama base y configuración) con el contexto compacto para los mismos datos iniciales V1.3. No mide instrucciones, esquema ni el mensaje del usuario.

| Consulta de ejemplo | Antes (caracteres) | Después | Reducción del contexto | Recorrido |
|---|---:|---:|---:|---|
| dos bollitos | 4.719 | 166 | 96,5 % | Sin IA |
| dos bollitos, tres empanadas de carne y una pastafrola | 4.719 | 599 | 87,3 % | Sin IA |
| pasame dos bollitos bien calientes | 4.719 | 166 | 96,5 % | Candidatos; ampliación si hace falta |
| dos empanadas | 4.719 | 383 | 91,9 % | Aclaración sin IA |
| producto desconocido | 4.719 | 1.743 | 63,1 % | Catálogo completo compacto |

Son **caracteres, no tokens facturados ni ahorro de costos**. Las consultas deterministas no envían ese contexto. No se llamó a un proveedor real, por lo que no hay comparación de consumo real disponible. La reducción puede variar al crecer el catálogo y al ampliar candidatos.

## Métricas y privacidad

Aplicar `database/013_metricas_ia.sql` después de 012. `viejo_ai_usage` registra UUID, modelo informado por el proveedor (o el configurado), operación `conversation`/`vision`, fecha y los tokens de entrada/salida/total cuando sean enteros válidos informados. Los campos no informados quedan nulos; no se deduce el total ni se inventan costos. Conversación añade cantidad de caracteres del contexto. Cada llamada del proveedor registra su operación; una lectura de caché de fotografía no genera consumo nuevo.

La tabla no guarda mensajes, prompts, fotos, teléfonos, clientes, claves, URLs privadas ni respuestas. RLS y revocaciones bloquean lectura/escritura directa de `anon`/`authenticated`. Solo el backend autorizado registra datos; no se expone en la API general del CRM. Si falla la escritura de métricas, se conserva el resultado de la operación comercial y no se reintenta la llamada al modelo para medirla.

Una persona autorizada con acceso a la base independiente puede agregar los datos por fecha/modelo/operación. No se activaron claves ni conexiones reales en esta entrega.

## Validación de etapa

Build correcto y 15 pruebas ejecutadas sin fallos: recuperación múltiple, ambigüedad, ampliación, contexto compacto, proveedor simulado y sus errores, seguridad comercial, cambios de catálogo/sinónimos sin reinicio, disponibilidad, recotización, privacidad de métricas, visión y compatibilidad del buffet V1.2. Las cifras de uso en las pruebas son fixtures; no son consumos reales. La validación completa se ejecuta al terminar las alertas.
