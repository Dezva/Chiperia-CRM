# Instalación y despliegue

## Windows: demo local

1. Instalar Node.js 24 LTS y Git. Clonar **Chiperia-CRM**, no usar la base de producción de Guarnipitan.
2. En PowerShell, dentro del repositorio:

```powershell
corepack enable
corepack prepare pnpm@11.25.0 --activate
pnpm install --frozen-lockfile
pnpm build
pnpm dev
```

Usar la dirección local que imprime el servidor. La demo funciona sin `.env` ni servicios externos. Si Corepack no puede activarse por permisos de Windows, `npx pnpm@11.25.0 install --frozen-lockfile` instala con la misma versión. Los comandos `pnpm` restantes pueden ejecutarse como `npx pnpm@11.25.0 ...`.

Para las pruebas de navegador instalar Chromium/Chrome y definir la ruta, por ejemplo:

```powershell
$env:CHROMIUM_PATH = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
pnpm build
pnpm test
```

La suite usa PGlite (PostgreSQL en memoria) y Chromium headless. No requiere conectividad con Supabase, Meta ni IA. Las capturas se guardan en el directorio temporal del sistema. Se recomienda al menos 2 GB libres de RAM. En Linux cloud se validó con Node 24.22.1, pnpm 11.25.0 y `/usr/bin/chromium`.

## Supabase independiente

Crear un proyecto **nuevo** exclusivo para El Viejo Villeta. Ejecutar con SQL Editor, en este orden:

1. `database/001_base_crm.sql`
2. `database/002_guarnipitan.sql`
3. `database/005_eliminacion_admin.sql`
4. `database/006_ubicaciones_delivery.sql`
5. `database/007_el_viejo.sql`
6. `database/008_catalogo_el_viejo.sql`
7. `database/009_v11_fiabilidad.sql`
8. `database/010_buffet_categories.sql`
9. `database/011_configuracion_ux.sql`
10. `database/012_catalogo_individual.sql`
11. `database/013_metricas_ia.sql`
12. `database/014_avisos_pedidos.sql`
13. `database/015_historial_seguro.sql`
14. `database/016_referencia_delivery.sql`
15. `database/017_delivery_y_pedidos_v17.sql`

003 está reservado; no carga productos del bar original. 004 es una plantilla para autorizar usuarios, no una migración automática. Desactivar registro público, crear/invitar la primera cuenta en Supabase Auth y autorizarla con 004 cambiando el correo, nombre y rol a `admin`. Posteriores cuentas Auth se autorizan desde Usuarios del CRM. Configurar Site URL y Redirect URLs; completar contraseña desde los mecanismos de Auth. No hay pantalla propia para invitaciones/restablecimiento.

La migración 007 conserva datos/esquema previos de la copia y añade campos con valores por defecto; 008 no sobrescribe productos existentes. **Esto no autoriza ejecutar migraciones en Guarnipitan.** Una copia de una base histórica podría contener su catálogo: no convertir esos datos en oferta de El Viejo. Para instalaciones nuevas usar únicamente las migraciones listadas. Para una copia histórica, hacer revisión y migración de datos fuera de producción antes de habilitar catálogos.

## Netlify

Conectar un sitio nuevo a la rama de este repositorio. `netlify.toml` define build `npm run build`, directorio `dist`, Functions y redirecciones API. Usar Node 24. El lockfile es pnpm; instalar con `pnpm install --frozen-lockfile`. Configurar variables de `.env.example` en el panel seguro, nunca en Git.

| Variables | Uso |
|---|---|
| PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_KEY | Build; URL y clave **sb_publishable_**. Únicos datos de conexión públicos. |
| SUPABASE_URL, SUPABASE_SECRET_KEY | Functions; proyecto independiente y clave secreta de backend. |
| WORKER_SECRET | Cadena aleatoria larga y exclusiva para despachar trabajo. Debe coincidir entre funciones en Production; el transporte usa HMAC en ASCII. |
| BOT_ENABLED | `false` hasta autorización; además Configuración → Habilitar asistente debe estar activo. |
| WHATSAPP_SEND_ENABLED | `false` hasta autorización; protege también mensajes humanos y notificaciones de pedidos. |
| AI_IMAGE_ENABLED | `false` hasta autorizar envío de fotos al proveedor. |
| WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID | Functions; cuenta y número del local, exclusivamente. |
| WHATSAPP_VERIFY_TOKEN, META_APP_SECRET | Verificación callback y firma HMAC. |
| WHATSAPP_GRAPH_VERSION | Versión Graph vigente para la cuenta; no se inventa un valor. |
| AI_BASE_URL | Base HTTPS de OpenAI `/v1` o proveedor compatible con API Responses. |
| AI_API_KEY, AI_MODEL, AI_VISION_MODEL | Clave y modelos del proveedor autorizado, interpretación y visión separados. |

Las variables `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_VISION_MODEL` se aceptan como compatibilidad. No son necesarias si se usan AI_*. No poner secretos en PUBLIC_*. `.env.example` no contiene credenciales. La demo no necesita completar esta tabla. `pnpm dev` es estático: no sirve Functions; para conexiones reales usar Netlify o su entorno de desarrollo con esas Functions.

Para WhatsApp configurar callback `https://TU-SITIO/.netlify/functions/whatsapp` y suscribir `messages`. Probar verificación, firmas, filtro de número y recepción con números autorizados. `health` verifica presencia de variables, no autenticidad ni disponibilidad. Los trabajos se recuperan con la función programada en Netlify. Revisar en la bandeja mensajes fallidos/inciertos y ventana de atención de 24 horas.

Antes de activar conexiones reales, confirmar autorización del negocio y revisar permisos con dos integrantes y una cuenta ajena. Activar **solo** las puertas autorizadas y probar en un proyecto/número de prueba independiente. Publicar una web estática por sí sola no activa el webhook ni la cola.

## Red en cloud

La demo necesita GitHub para checkout y el registro npm para instalar. Los presets actuales los permiten. Producción conectada necesitará el hostname exacto del nuevo proyecto Supabase, `graph.facebook.com` y el hostname del proveedor de IA (por ejemplo `api.openai.com`). Añadir esos dominios en ajustes si se autoriza ese flujo; no se amplió la red ni se añadieron secretos para esta demo.

Los administradores pueden conceder a un empleado el permiso explícito `catalog_editor` desde Usuarios. Permite editar productos/precios en Catálogo sin autorizar configuración, menús ni gestión de usuarios. Las órdenes individuales siguen sin admitir cambios arbitrarios de precio unitario.

## Actualizar desde V1

Aplicar únicamente 009 antes del backend/frontend V1.1, siguiendo [la guía incremental](revisiones/v1.1-actualizacion.md). El bucket Storage es opcional y permanece apagado hasta autorización. Ver [visión real](vision-real.md) para variables y prueba manual aislada; las suites automáticas nunca activan esa prueba.

## Actualizar desde V1.1 a V1.2

Aplicar solo 010 antes del nuevo backend/frontend; revisar los ítems pendientes que deje la conversión conservadora. Seguir [actualización V1.2](revisiones/v1.2-actualizacion.md) y [menú por fotografía](menu-diario-v12.md). Los menús nuevos requieren category_id oficial, no textos libres.

## Configuración amigable sobre V1.2

Aplicar solo 011 antes de usar el código de `feat/configuracion-amigable`. Conserva los horarios existentes, hace explícitos los estados de delivery y añade validaciones del servidor. Ver [cambios, migración, pruebas y capturas](configuracion-amigable.md). No volver a aplicar migraciones anteriores después de 011.

## Actualizar desde Configuración amigable a V1.3/V1.4

Aplicar únicamente 012, 013 y 014, en ese orden, antes del código de `feat/catalogo-alertas-v1.3-v1.4`. Ver [guía incremental, comandos Windows, pruebas y límites](revisiones/v1.3-v1.4.md). Las migraciones anteriores no se vuelven a ejecutar.

## V1.6: conversación e historial seguro

Desde V1.5 aplicar únicamente 015 antes del backend/frontend compatible, siguiendo [la guía V1.6](revisiones/v1.6-conversacion-historial.md). No repetir las migraciones antiguas. La instalación no borra registros; las operaciones administrativas requieren vista previa y confirmación explícita.

## V1.6.1: referencia de delivery y recuperación del pedido

Desde V1.6 aplicar únicamente 016 antes del código compatible de la misma rama, siguiendo [la guía de corrección](revisiones/v1.6.1-delivery.md). No es necesario limpiar el historial ni descartar borradores. No repetir migraciones anteriores.

## V1.7: pedidos, delivery sin referencia y finanzas

Desde una base en 015, aplicar **016 si falta y después 017**, antes de un único despliegue manual del código compatible. Seguir [la guía V1.7](revisiones/v1.7-pedidos-finanzas.md) para comprobaciones, recuperación ante fallos y límites históricos. No volver a ejecutar migraciones anteriores. No se eliminan pedidos al instalar.

## Buffet: consultas, pedidos y tarifas vigentes

La actualización del [PR #1](https://github.com/Dezva/Chiperia-CRM/pull/1), en `fix/tarifas-buffet-sin-regresion-chiperia`, no añade SQL para una base en V1.7. Revisar [la guía de actualización](revisiones/buffet-flujo-tarifas.md) y realizar un único despliegue manual del commit aprobado, conservando conexiones y tarifas del CRM.

## Autenticación del worker y contextos Netlify

La [corrección de autenticación ASCII](revisiones/worker-auth-ascii.md) evita enviar `WORKER_SECRET` directamente como encabezado. No requiere SQL ni rotar un secreto existente por contener Unicode. Generar un deploy de Production del nuevo commit y comprobar `workerAuth: "hmac-sha256-v1"` en health; publicar un preview anterior no incorpora esta corrección.
