# Arquitectura

Cliente estático en `public/`, build reproducible en `dist/`. JavaScript ESM sin framework. Configuración pública solo URL Supabase y clave publishable. Login mediante Supabase Auth. Sesión real en sessionStorage; la demo usa localStorage con clave distinta. Todas las interpolaciones del CRM escapan HTML.

Netlify Functions valida JWT contra Auth y membresía antes de leer o escribir. Las RPC de escritura quedan exclusivamente en service_role, con `search_path=''`; la membresía/rol se revalida en PostgreSQL. RLS protege tablas e historial. Usuarios no miembros no leen registros. El último administrador no puede degradarse; la cuenta Auth se crea/invita en Supabase antes de autorizarla en Usuarios.

```
WhatsApp → webhook HMAC → mensajes/trabajos persistentes
                            ↓ reserva por conversación
                       worker + intérprete IA
                            ↓
           viejo-engine: servicio, catálogo y borrador
                            ↓
     guarni_finish: revalidación SQL + pedido + respuesta atómicos
                            ↓
              empleado → viejo_staff → confirmación
                            ↓
               mensajes en cola → envío controlado
```

Los prefijos internos `guarni_*` se conservan por compatibilidad. No implican conexión al negocio original. `007` añade servicio a pedidos/catálogo, JSON de configuración, menús, cache por hash de foto e historial de pedidos. `008` es un seed idempotente: nunca sobrescribe precios editados.

`viejo_quote` obtiene precios y disponibilidad desde PostgreSQL; para buffet consulta solo el menú publicado de la fecha de Asunción y devuelve precios/subtotal nulos. Nunca utiliza tarifas por kilogramo. Cantidades 1–30 enteras, máximo 30 líneas, sin productos repetidos. El cliente y la IA no pueden fijar precios.

`viejo_staff` reserva conversación y pedido al confirmar. Chipería recotiza desde el catálogo actual, registra aviso de diferencia y devuelve `requote`; el empleado debe volver a revisar. `expected_items` protege contra reintentos de una confirmación basada en una cotización vieja. El total se calcula en SQL. Buffet requiere conversación humana asignada al actor, importe positivo y constancia de acuerdo. No genera una comunicación automática del importe del buffet.

Los horarios usan America/Asuncion. Se pueden registrar solicitudes fuera de horario, pero quedan pendientes: la confirmación exige revisión explícita del empleado. Delivery chipería sin horario confirmado requiere coordinación humana. El retiro fuerza envío cero. Delivery requiere punto asociado a la misma conversación, referencia y costo explícito; las solicitudes relacionadas exigen revisión del envío conjunto, sin inventar tarifa ni sumarla automáticamente dos veces.

La cola y los source_message_id únicos conservan deduplicación y reservas. La confirmación repetida falla por transición ya aplicada y no inserta otra notificación. Toma humana invalida respuestas del bot por revisión; los envíos de resultado incierto no se repiten a ciegas. Un envío iniciado a Meta no puede retirarse. Los mensajes fuera de 24 horas quedan fallidos para revisión; no se implementan plantillas.

En V1.1 la versión guarda una referencia opcional a Storage privado; las fotos Base64 anteriores se conservan con RLS. El API general devuelve solo metadatos y el original se recupera bajo autenticación por demanda. El reconocimiento es una petición de administrador separada; solo produce propuestas. SHA-256 evita llamadas repetidas tras procesar la foto. El botón publicar exige revisión humana y SQL impide dos menús publicados para la misma fecha. Las versiones anteriores se archivan; no se reutilizan como menú de hoy. El adaptador acepta API Responses de OpenAI o un endpoint compatible configurado por el operador mediante variables del servidor. No toma endpoints desde prompts. Interpretación y visión tienen modelos separados. Sin entrenamiento diario.

No hay procesos nuevos contra datos reales durante el desarrollo local. `pnpm dev` sirve la demo estática; el backend real se ejecuta en Netlify. Las pruebas simulan proveedores y ejecutan las migraciones en PostgreSQL local en memoria.

Los administradores pueden conceder a un empleado el permiso explícito `catalog_editor` desde Usuarios. Permite editar productos/precios en Catálogo sin autorizar configuración, menús ni gestión de usuarios. Las órdenes individuales siguen sin admitir cambios arbitrarios de precio unitario.

V1.1 añade `menu_editor`, independiente del rol administrador y de `catalog_editor`. Backend, API, interfaz y SQL validan ese permiso para fotografía, visión y publicación. La migración 009 reemplaza transaccionalmente finish/staff sin cambiar el transporte heredado. El catálogo del worker incluye service; los menús se consultan por fecha/estado sin imágenes. El motor compara campos comerciales sin depender del orden de claves de JSONB.
