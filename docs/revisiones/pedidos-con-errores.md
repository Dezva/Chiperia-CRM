# Pedidos de chipería con errores de escritura y varias líneas

**Actualización posterior:** [pedido completo e interpretación sin equivalencias fijas](pedido-completo.md) reemplaza la tabla especial de abreviaciones y el comportamiento de conservar el borrador ante un producto desconocido. Esta página y su salida de pruebas documentan el estado de `1f13cf4`.

Corrección sobre `fix/tarifas-buffet-sin-regresion-chiperia`, desde `9afd5bc1759e27fd7096c9a7504dde8bc61a63da`.

## Mensaje reproducido

```text
Tradicional argolla 2
Sandwidch de verdura 1
Empanada de jamon y queso 5
Sanwi verdura 2
```

Antes se reconocían únicamente la argolla y la empanada. La cantidad del sándwich desconocido podía asignarse a la empanada al juntar todas las líneas. La validación de la interpretación terminaba preguntando qué producto ajustar. Incluso con todos los nombres bien escritos, la segunda mención del sándwich reemplazaba la primera y se perdía una unidad.

Ahora se reconocen dos tradicionales argolla, tres sándwiches de verdura y cinco empanadas de jamón y queso. Con el catálogo inicial de prueba suman Gs. 70.000; el servidor siempre consulta los precios actuales, sin fijar ese importe en la interpretación.

## Reglas

- Saltos de línea, comas y punto y coma separan artículos. Se aceptan cantidades antes o después del nombre, en números o palabras admitidas.
- Las cantidades del mismo producto en un mensaje se suman. Repetir el mensaje establece nuevamente esos totales; «agregame» incrementa el carrito existente.
- Las equivalencias usan nombres, variantes y sinónimos del catálogo actual. Una palabra exacta tiene prioridad sobre cualquier corrección.
- En chipería se tolera una inserción, omisión, sustitución o transposición de letras en palabras de al menos seis caracteres, únicamente si hay un solo candidato a una edición. No se elige por precio ni disponibilidad. Se reconocen también formas comunes de sándwich como «sanwi», «sanwich» y «sanguche», cuando el catálogo contiene esa palabra.
- Las palabras cortas se conservan: «bollo» no se corrige a «pollo» ni se equipara con «bollito». Dos candidatos cercanos requieren aclaración. La tolerancia es conservadora y no interpreta cualquier error o abreviatura.
- Un nombre genérico como «sanwi» pide la variedad. Si además hay una variedad desconocida, no se guarda una equivalencia parcial que pueda agregarse después por error.
- La IA usa los mismos resultados para recuperar candidatos y validar IDs y cantidades. Una interpretación inválida conserva el carrito y pide aclaración sin suponer que el cliente quiso ajustar productos.
- No se agregan productos agotados, inactivos o sin precio individual. El resumen muestra los nombres oficiales para revisar antes de enviar. La aceptación sigue a cargo del local.

No se cambia el reconocimiento ortográfico del buffet ni su control humano de importes. No hay nuevas dependencias, migraciones, precios ni sinónimos persistidos automáticamente. Se conserva el transporte ASCII de autenticación del worker y el build automático de Netlify.

## Validación reproducible

```sh
npm run build
node --test tests/order-typos.test.mjs tests/order-typos-browser.test.mjs
npm test
```

Las regresiones cubren el texto exacto, cantidades de líneas adyacentes, productos repetidos, repetición de mensajes, incrementos, correcciones posteriores, límites, nombres exactos y ambiguos, bollo/bollito/pollo, catálogo y sinónimos modificados, agotados, precios pendientes, validación de respuestas del proveedor y confirmación con worker/PostgreSQL PGlite. Ese pedido se procesa sin llamadas al modelo. El proveedor se simula únicamente para comprobar el rechazo seguro; no se miden tokens ni costos reales.

El navegador prueba el resumen en 1440×950 y 390×844, sin errores de JavaScript ni desbordamiento horizontal. El simulador de la demo tiene un campo de una línea y recibe el mismo pedido separado por punto y coma; la prueba del worker usa los saltos originales de WhatsApp.

Resultado ejecutado: build correcto; suite completa de 167 pruebas, 165 aprobadas, cero fallos y dos omisiones heredadas. La nueva prueba de navegador se ejecutó aparte y aprobó: **168 pruebas distintas, 166 aprobadas y dos omitidas**. [Salida de los comandos](pedidos-con-errores-pruebas.txt).

Capturas de la demo con datos ficticios: [escritorio](../capturas/pedido-errores-desktop.png) y [móvil](../capturas/pedido-errores-mobile.png). No se enviaron mensajes reales ni se modificaron servicios o datos de producción.

## Actualización Windows

```powershell
Set-Location D:\chiperia
git fetch origin
git switch fix/tarifas-buffet-sin-regresion-chiperia
git pull --ff-only origin fix/tarifas-buffet-sin-regresion-chiperia
npm run build
```

No hace falta volver a ejecutar SQL. En Netlify, comprobar que el deploy de Production use el nuevo commit de esta rama. Los pushes mantienen habilitado el build automático; el estado de auto publishing sigue controlado por la configuración del sitio.
