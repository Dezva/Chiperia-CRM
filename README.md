# El Viejo CRM · Villeta V1.1

Proyecto independiente para Buffet El Viejo y Chipería El Viejo, Ruta Villeta–Alberdi. Adaptado de Guarnipitan sin modificar ese repositorio ni conectarse a sus datos.

V1.1 consolida la implementación existente: ubicación residual, permiso `menu_editor`, sincronización de menú, validación de visión y preparación de fotos privadas. [Actualizar sin perder datos](docs/revisiones/v1.1-actualizacion.md) · [Prueba de visión real](docs/vision-real.md) · [Validación V1.1](docs/revisiones/v1.1-validacion.md).

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
