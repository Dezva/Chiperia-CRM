> Resultado vigente: [V1.7 delivery, pedidos y finanzas](docs/revisiones/v1.7-pedidos-finanzas.md), 132 pruebas: 130 aprobadas, 0 fallidas y 2 omisiones heredadas. PostgreSQL local, API/worker y Chromium en escritorio/móvil; proveedores simulados.

> Resultado anterior: [V1.6.1 delivery, cantidades y estado del pedido](docs/revisiones/v1.6.1-delivery.md), 126 pruebas: 124 aprobadas, 0 fallidas y 2 omisiones heredadas. Además, 5/5 regresiones reforzadas PostgreSQL/worker y unitarias.

> Resultado anterior: [V1.6 conversación e historial](docs/revisiones/v1.6-conversacion-historial.md), 121 pruebas: 119 aprobadas, 0 fallidas y 2 omitidas heredadas.

> Resultado anterior: [V1.5 login](docs/revisiones/v1.5-login.md), 110 pruebas: 108 aprobadas, 0 fallidas y 2 omitidas heredadas.

> Para el resultado vigente de esta rama ver [validación V1.3/V1.4](docs/revisiones/v1.3-v1.4.md): 104 pruebas, 102 aprobadas y 2 omitidas heredadas. Para V1.2 ver [validación V1.2](docs/revisiones/v1.2-validacion.md). Este documento conserva la evidencia de V1.

# Validación ejecutada

Fecha: 20 de noviembre de 2026. Entorno Linux cloud; Node 24.22.1, pnpm 11.25.0, Chromium del sistema, PGlite 0.5.15. Origen auditado en `docs/auditoria.md`.

`npm run build` terminó correctamente: 31 productos (28 con precio, tres estacionales inactivos sin precio). `npm test` terminó con **65 pruebas: 63 aprobadas, 0 fallidas, 2 omitidas**, aproximadamente 11,5 segundos. Los comandos equivalentes de pnpm están en package.json.

Las dos omisiones están marcadas en las suites originales y corresponden a contratos VM de la interfaz de Guarnipitan, reemplazada en esta entrega: controles de eliminación de la UI antigua y sus tarjetas de ubicación. No se consideran aprobadas. El API/SQL de eliminación y las validaciones de ubicación heredadas sí se ejecutaron. La interfaz nueva tiene una prueba funcional en Chromium, no una emulación de los componentes anteriores.

| Requisito del documento | Evidencia ejecutada |
|---|---|
| 1–3. Selección/cambio de servicio y catálogos independientes | viejo-engine unitario y Chromium; conserva carritos separados. |
| 4–5. Cálculo chipería y buffet sin precio automático | Unitarias, SQL y navegador: 3 tradicionales = 10.500; buffet subtotal/unit_price NULL hasta acuerdo humano. |
| 6–7. Agotados y pan dulce inactivo | Unitarias de disponibilidad/cantidades; seed SQL de 31 productos idempotente. |
| 8–10. Foto, revisión, publicación y menú diario | Chromium sube PNG, impide publicación sin revisión y publica versión; PostgreSQL exige revisión; visión mock con cache por hash. Menú de ayer no es menú de hoy. |
| 11–13. Delivery con/sin punto y retiro | Suites heredadas de ubicaciones, nueva SQL y Chromium. Coordenadas inválidas, antigua ubicación y múltiples pedidos requieren protección/revisión. Retiro no exige punto. |
| 14. Envío manual | Unitarias/SQL exigen introducción explícita, aceptan cero y fuerzan cero para retiro. Chromium verifica total 18.500 con subtotal 10.500 + envío 8.000. Ese valor solo es dato de prueba. |
| 15–17. Confirmación, aviso chipería y buffet humano | SQL confirma estado y cola atómicos; repetición no duplica. Chromium toma chat, registra 50.000 ficticios de buffet y confirma. Buffet no anuncia precio por bot. |
| 18. Cambio de precio | SQL recotiza, mantiene pending y encola aviso. Un reintento con expected_items viejo no acepta la nueva cotización. |
| 19. Duplicados y concurrencia | Suites SQL heredadas de deduplicación y reservas, finish idempotente en la nueva migración, transiciones repetidas rechazadas. |
| 20. Permisos y seguridad | HMAC, autorización API, RPC solo service_role, RLS con usuario ajeno sin lecturas, empleado sin permiso de catálogo. Visión exige admin. Puerta de envío apagada bloquea Meta incluso para avisos humanos. |
| 21. Migraciones/compatibilidad | Suites PostgreSQL original y nueva, aplicación repetida de 007/008 y conservación de datos históricos mediante 006. No se ejecutó SQL en Supabase real. |

Se abrió la interfaz real en Chromium, sin errores JavaScript; se recorrieron las nueve secciones y el filtro por servicio. Vista móvil a 390 × 844 sin desbordamiento de página; tablas con desplazamiento horizontal. Las capturas del test quedan en la carpeta temporal del sistema. El log de la ejecución de esta máquina quedó en `/tmp/el-viejo-tests.log` y no contiene credenciales.

También se comprobó sintaxis de los módulos nuevos y limpieza de whitespace. Se instalaron dependencias con lockfile y verificación de integridad, sin desactivar TLS ni firmas.

## Límites de esta evidencia

No se enviaron mensajes reales, no se creó infraestructura Supabase/Netlify/Meta, no se ejecutó reconocimiento con un proveedor real y no se modificó Guarnipitan. Las pruebas de transporte/proveedor usan mocks y las SQL usan PostgreSQL local en memoria. No se probó autenticación contra una cuenta real ni la precisión de visión con fotos del negocio. No se afirma publicación, funcionamiento de credenciales reales ni restauración del entorno en una tarea nueva.

Ver `docs/operacion.md` para datos comerciales y validaciones pendientes antes de producción. La demo usa edición manual de la foto; el endpoint externo requiere autorización y variables seguras.

Se añadió un workflow CI para repetir instalación, build y pruebas con Chromium. El workflow remoto no se ejecutó desde esta sesión.
