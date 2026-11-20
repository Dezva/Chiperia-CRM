# Auditoría y preparación

Fuente consultada por HTTPS de solo lectura: `Dezva/Guarnipitan-CRM`, commit `ccd7e9e35ddc70bd51dfaa8b67f6556555480f3c`. Copia de consulta fuera del checkout de destino. No se modificó ni se hizo push al original. Destino: `Dezva/Chiperia-CRM`, inicialmente vacío en `c7df37f71b8202ff0a1b043c23674227e29ba873`.

| Componente inspeccionado | Decisión |
|---|---|
| shared/order-engine.js | Se conserva como motor de compatibilidad y utilidades de normalización. Reglas de El Viejo en viejo-engine.js; pruebas originales se mantienen sobre el motor original. |
| shared/locations.js | Reutilizado: coordenadas, Maps y copia de enlaces. |
| netlify/lib/worker.mjs | Conserva reservas, revisión de atención, reintentos y envío incierto. Cambia catálogo/contexto por servicio y añade puerta explícita de envío real. |
| netlify/functions/whatsapp.mjs | Reutilizado: HMAC, persistencia antes de 200, deduplicación, filtro de número y mensajes de ubicación. |
| netlify/functions/api.mjs | Conserva JWT, membresía, cursores de mensajes y asignación de ubicación. Escrituras nuevas mediante viejo_staff, sin confiar precios del navegador. |
| database/001,002,005 | Base Auth/RLS, cola y administración reutilizadas. |
| database/006_ubicaciones_delivery.sql | Conservada. 007 amplía sus procesadores para incluir pedidos en reparto y conserva asociación, historial, revisión de cambios y ubicación antigua. |
| public/ | Interfaz reemplazada por El Viejo; estructura CSS reutilizada. No se reutiliza el logotipo de Guarnipitan como identidad del negocio. |
| tests/ | Se conservan suites de motor, webhook, seguridad, eliminación y ubicación. Dos pruebas VM de la interfaz anterior quedan explícitamente omitidas por no aplicables. Nueva prueba real de navegador valida la interfaz actual. |
| docs/ubicaciones-delivery.md | Se conserva como referencia técnica heredada; instalación actual en instalacion.md. |

El catálogo original solo aparece en fixtures de compatibilidad, jamás en el build ni en el seed comercial de El Viejo. 003 queda reservado y 008 instala exclusivamente los 31 productos del documento. La procedencia histórica recibida se conserva en `UPSTREAM_PROVENANCE.json`.

Fases realizadas: auditoría y base independiente; interfaz y catálogo; menú fotográfico con edición/revisión y adaptador de reconocimiento externo apagado; reglas por servicio y transporte reutilizado; pruebas locales y documentación. La validación de proveedores reales no forma parte de la evidencia local: requiere configuración y autorización del negocio.
