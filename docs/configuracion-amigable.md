# Configuración amigable sobre V1.2

Rama: `feat/configuracion-amigable`, basada en `feat/el-viejo-v1.2` (`84300cf`).

## Pantalla y comportamiento

Configuración reúne en una página los datos del negocio, buffet, chipería, pagos y asistente. Conserva la identidad y la mascota provisional de El Viejo.

- Los días se seleccionan con casillas visuales, utilizables con teclado. El servidor sigue recibiendo números: domingo 0, lunes 1 a sábado 6.
- Cada servicio conserva sus días y horarios independientes. Las instalaciones nuevas y la demo mantienen buffet lunes a sábado 11:00–15:00, delivery 12:00–14:00; chipería lunes a sábado 05:15–18:30, con delivery pendiente. Una instalación existente conserva sus valores.
- Delivery tiene tres estados explícitos: con horario definido, horario pendiente y deshabilitado. Solo el primero muestra los campos de delivery. Cambiar a pendiente o deshabilitado conserva las horas anteriores sin utilizarlas para ofrecer entregas.
- Los cinco métodos reconocidos se seleccionan mediante casillas. Desmarcar todos deja el pago a coordinar; seleccionar un método no registra un cobro.
- Las tarifas por categoría siguen siendo referencias por kilogramo. No calculan el precio definitivo de los pedidos del buffet.
- El guardado muestra progreso, confirmación o un error específico. No se reconstruye el formulario mientras se edita. Navegar, actualizar, restablecer la demo o cerrar sesión exige decidir sobre los cambios pendientes; cerrar o recargar la pestaña activa la advertencia del navegador.
- Los empleados sin rol administrador consultan la pantalla en modo de solo lectura. API y PostgreSQL también exigen administración para guardar.

Las validaciones compartidas y SQL comprueban días, apertura/cierre, franja de delivery dentro de la atención, modalidades coherentes, métodos reconocidos y tarifas enteras positivas. Los controles móviles evitan desplazamiento horizontal y el botón de guardar permanece visible.

## Compatibilidad con el asistente

El asistente informa horarios con nombres de días y distingue los tres estados. Un delivery pendiente requiere coordinación humana antes de aceptación. Deshabilitar delivery impide nuevas solicitudes y aceptaciones de esa modalidad para ese servicio; no cancela pedidos previamente confirmados.

Apagar el asistente conserva los mensajes entrantes, las ubicaciones y el historial, y evita respuestas automáticas, incluidas las respuestas a ubicaciones y las respuestas del bot que seguían en cola. La atención humana y las notificaciones de pedidos aprobados por el equipo mantienen su funcionamiento. Las puertas del servidor `BOT_ENABLED` y `WHATSAPP_SEND_ENABLED` siguen siendo necesarias; el interruptor de Configuración no activa conexiones externas.

No se cambian cálculos de importes, categorías, publicación del menú ni reglas de revisión de pedidos. Se añade el consumo de la modalidad explícita de delivery y se hace que las respuestas a ubicaciones respeten el interruptor existente del asistente.

## Actualización de una instalación V1.2

1. En la base independiente de El Viejo, aplicar **solo** `database/011_configuracion_ux.sql`, después de 010 y antes de usar este backend/frontend.
2. Publicar el código de esta rama mediante el proceso habitual, cuando corresponda. Esta entrega no ejecutó migraciones remotas ni publicó el entorno.
3. Un administrador debe revisar Configuración y comprobar que se conservan sus horarios y medios de pago antes de guardar cambios.

La migración es transaccional y reejecutable. Añade `schedules.<servicio>.delivery_mode` al JSON de configuración y actualiza las validaciones/RPC. No inventa horarios, no modifica días y no altera menús, pedidos, ubicaciones, precios ni conexiones.

Para configuraciones antiguas sin modalidad explícita: si el delivery global estaba desactivado, ambos servicios quedan deshabilitados; con horas válidas queda con horario definido; sin ellas queda pendiente. Los estados explícitos existentes se conservan. Los métodos no reconocidos quedan registrados en `legacy_payment_methods` para revisión y se retiran de la selección activa, sin habilitar equivalencias nuevas. La configuración original completa queda protegida en `viejo_settings_ux_backup`, versión `011`, accesible solo al backend autorizado.

Las funciones anteriores se conservan como implementación interna para las acciones ajenas a este cambio; la función base no admite invocación directa desde clientes ni desde `service_role`. La configuración sigue sin permitir escritura directa de usuarios autenticados. No volver a ejecutar 009/010 después de 011: esas migraciones anteriores reemplazan funciones. La suite aplica 011 al final para verificar el estado actualizado.

## Validación ejecutada

`pnpm build` y `pnpm test`: **91 pruebas, 89 correctas, 0 fallidas y 2 omitidas heredadas** de la interfaz anterior. Las cuatro pruebas nuevas cubren validación compartida, migración/persistencia/permisos en PostgreSQL, compatibilidad de delivery/asistente y recorrido completo en Chromium.

Se verificaron selección por teclado, guardar y recuperar horarios, independencia de servicios, tres estados de delivery, pagos, errores, cambios pendientes, modo de solo lectura y móvil de 390 px sin desbordamiento. PGlite ejecuta las migraciones y RPC con datos ficticios; las pruebas del worker usan transporte simulado. No se realizaron pruebas con credenciales de Supabase, WhatsApp o IA reales.

Capturas de la demo inicial, sin datos reales:

- [Configuración completa en escritorio (1440 px)](capturas/configuracion-desktop.png)
- [Configuración completa en móvil (390 px)](capturas/configuracion-mobile.png)

## Archivos principales

| Archivo | Cambio |
|---|---|
| `public/settings-editor.js` y `public/app.css` | Formulario visual y estilos adaptables. |
| `public/app.js` | Montaje, persistencia y protección de cambios pendientes. |
| `shared/settings.js` | Días, pagos, normalización y validación centralizados. |
| `database/011_configuracion_ux.sql` | Migración conservadora, respaldo, validación y permisos. |
| `netlify/functions/api.mjs` | Validación administrativa del servidor y errores comprensibles. |
| `shared/viejo-engine.js`, `netlify/lib/worker.mjs` | Lectura de estados explícitos e interruptor del asistente. |
| `tests/settings*.test.mjs` | Recorrido de interfaz, PostgreSQL y compatibilidad. |

Los cambios están aislados en una rama de desarrollo. No se modifica `main`, el repositorio de Guarnipitan ni producción.
