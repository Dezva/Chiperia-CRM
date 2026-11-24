# El Viejo CRM · Villeta V1.2

Proyecto independiente para Buffet El Viejo y Chipería El Viejo, Ruta Villeta–Alberdi. Adaptado de Guarnipitan sin modificar ese repositorio ni conectarse a sus datos.

V1.1 consolida la implementación existente: ubicación residual, permiso `menu_editor`, sincronización de menú, validación de visión y preparación de fotos privadas. [Actualizar sin perder datos](docs/revisiones/v1.1-actualizacion.md) · [Prueba de visión real](docs/vision-real.md) · [Validación V1.1](docs/revisiones/v1.1-validacion.md).

V1.2 prioriza una foto del menú completo, revisión en página completa, tres categorías oficiales y mascota provisional configurable. [Módulo de menú](docs/menu-diario-v12.md) · [Actualización V1.2](docs/revisiones/v1.2-actualizacion.md) · [Validación V1.2](docs/revisiones/v1.2-validacion.md).

La rama `feat/configuracion-amigable` añade días visuales, tres estados de delivery y pagos seleccionables. [Cambios, migración 011, pruebas y capturas](docs/configuracion-amigable.md).

V1.3/V1.4 añade catálogo comercial por producto, categorías editables, sinónimos, interpretación compacta y avisos de pedidos. [Catálogo](docs/catalogo-v13.md) · [Optimización y métricas](docs/optimizacion-v14.md) · [Alertas](docs/alertas-v14.md) · [Actualización y Windows](docs/revisiones/v1.3-v1.4.md).

V1.5 presenta un inicio de sesión independiente con la identidad de El Viejo. [Cambios, capturas, pruebas y actualización del sitio Netlify](docs/revisiones/v1.5-login.md). No requiere migraciones.

Preparación del despliegue final: estos cambios usan `[skip netlify]` y no activan publicaciones automáticas. [Política actual de publicación manual](docs/instalacion.md#preparación-del-despliegue-final--publicación-manual).

Pedidos con errores de escritura: reconoce «sandwidch» y «sanwi», cantidades por línea y productos repetidos sin perder unidades. [Reglas, pruebas y actualización](docs/revisiones/pedidos-con-errores.md).

Pedido completo: si un artículo no se identifica o no está disponible, reinicia el borrador y pide repetir toda la lista. Interpreta expresiones naturales con el catálogo vigente y validación del servidor, sin una tabla fija de abreviaciones. [Flujo actualizado y pruebas](docs/revisiones/pedido-completo.md).

Autenticación del worker en ASCII: corrige el descarte de `x-worker-secret` con valores Unicode y añade logs de despacho. [Diagnóstico y despliegue en Production](docs/revisiones/worker-auth-ascii.md).

Retiro natural: reconoce «voy a retirar» y aclaraciones sobre la entrega, conservando el pedido y el subtotal. [Corrección, pruebas y actualización](docs/revisiones/retiro-natural.md).

Mejora del buffet en el [PR #1](https://github.com/Dezva/Chiperia-CRM/pull/1): tarifas vigentes por kilo, consultas y pedidos diferenciados, observaciones por plato y carritos separados de chipería. [Guía y validación](docs/revisiones/buffet-flujo-tarifas.md).

V1.7 hace opcional la referencia del delivery, reorganiza pedidos, separa entrega y cobro y añade períodos financieros y eliminación administrativa segura. [Guía, migraciones 016 → 017, pruebas y capturas](docs/revisiones/v1.7-pedidos-finanzas.md).

V1.6.1 corrige el flujo de ubicación/referencia del delivery, las cantidades repetidas y las consultas sobre el estado del pedido. [Guía, migración 016 y pruebas](docs/revisiones/v1.6.1-delivery.md).

V1.6 corrige consultas por categoría, variantes y correcciones conversacionales, y añade limpieza segura del historial y eliminación administrativa de clientes. [Guía, migración 015, pruebas y capturas](docs/revisiones/v1.6-conversacion-historial.md).

## Empezar con la demo

Node.js 24 LTS (mínimo 22), pnpm 11.25.0. No requiere credenciales.

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm build
pnpm dev
```

El servidor usa el puerto 5173, configurable con `PORT`. La demo guarda datos ficticios en el navegador; “Restablecer demo” los elimina. No envía mensajes ni fotos a servicios externos. No hay productos de buffet de muestra: el empleado carga su menú diario.

Incluye resumen, pedidos, conversaciones, clientes, menú del buffet, catálogo de chipería, delivery, usuarios y configuración. Filtro global Todos/Buffet/Chipería.

- **Chipería:** 28 productos con precio confirmado y tres panes dulces inactivos sin precio. El servidor calcula subtotal y total; el empleado introduce únicamente delivery. Al cambiar un precio se recotiza antes de confirmar, conservando evidencia de la cotización revisada.
- **Buffet:** foto original y menús versionados por fecha; borrador, revisión y publicación. Los pedidos mantienen importes nulos hasta que el empleado toma el chat y registra el importe acordado. Las tarifas por kg son solo referencias.
- **WhatsApp:** selección/cambio de servicio, carritos separados, solicitud pendiente, cola persistente, deduplicación, control de concurrencia, pausa humana y ubicaciones puntuales. Los pedidos de ambos servicios en curso se relacionan para revisar el envío conjunto.
- **Pagos:** método elegido y recepción del pago son campos independientes. Sin pasarela.

## Probar el recorrido

1. Conversaciones → elegir el contacto ficticio → simular `chipería`, `3 tradicional`, `retiro`, `CONFIRMAR PEDIDO`.
2. Pedidos → Ver pedido → Confirmado → revisar horario. Subtotal y total: Gs. 10.500, sin ingreso manual del subtotal.
3. Para delivery, simular `delivery` y una ubicación puntual con referencia. El costo del envío debe introducirse explícitamente, incluso cuando sea cero.
4. Menú del buffet → cargar foto → agregar/transcribir platos → guardar borrador o revisar y publicar. En demo no hay OCR real: el botón explica que la transcripción es manual.
5. Simular `buffet`, productos del menú, modalidad y `CONFIRMAR PEDIDO`. Se pausa el bot. Tomar conversación, acordar precio personalmente y confirmar desde Pedidos.
6. Cambiar precios, marcar agotados o alternar servicios. Los productos sin precio confirmado no se ofrecen.

## Pruebas

```sh
pnpm build
pnpm test
```

Las pruebas de navegador usan Chromium instalado. En Windows u otra ubicación, definir `CHROMIUM_PATH` con la ruta del ejecutable. PGlite ejecuta PostgreSQL en memoria; no necesita Supabase ni toca producción. Los tests se ejecutan en serie para limitar memoria. El build no reescribe migraciones ni catálogos.

Ver [resultados](VALIDACION.md), [auditoría](docs/auditoria.md), [arquitectura](docs/arquitectura.md), [instalación Windows y despliegue](docs/instalacion.md), [Casa Central y pendientes](docs/operacion.md) y [requerimiento original](docs/requerimientos.md).

**Producción requiere un proyecto Supabase nuevo, un sitio Netlify independiente, cuentas autorizadas y autorización explícita para activar WhatsApp o IA.** Esas conexiones no se activaron ni se probaron con credenciales reales en esta entrega.
