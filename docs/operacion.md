# Operación y reutilización

## Menú del buffet

Subir fotografía original PNG/JPEG/WebP hasta 3 MB. La aplicación no publica resultados de visión: devuelve propuestas editables; el empleado revisa nombre, categoría y agotados y confirma publicación. Se puede guardar borrador, editar manualmente, agregar/eliminar productos, reemplazar el menú completo o actualizar parcialmente el vigente. Cada guardado es una versión nueva. El chatbot consulta únicamente el publicado de la fecha actual de America/Asuncion.

En demo la transcripción es manual; no hay un modelo local de OCR ni se simula haber reconocido la foto. El endpoint real y su cache SHA-256 están implementados y probados con proveedor simulado. Su precisión necesita validación con fotos reales y el proveedor autorizado. La imagen permanece en versiones protegidas de la base. Definir conservación y almacenamiento antes de gran volumen; la demo está limitada por la cuota de almacenamiento del navegador.

## Pedidos y atención

Solicitud no equivale a aceptación. Un importe desconocido se muestra como pendiente. Chipería exige productos disponibles y con precio vigente. Una diferencia de cotización registra un aviso y exige volver a confirmar la versión revisada. Los mensajes se muestran en cola/enviados/fallidos/inciertos: no asumir entrega por haberlos encolado.

Buffet requiere tomar conversación, acordar personalmente el importe, registrar monto y confirmar. Al devolver la conversación al asistente, el borrador previo se limpia, pero se conservan pedidos e historial. La IA no cambia catálogos ni realiza administración.

La asociación automática de ubicación ante varios pedidos, ubicaciones antiguas o pedidos aceptados exige revisión humana. La asignación manual usa versión esperada para detectar cambios concurrentes. Pedidos de dos servicios abiertos en la conversación quedan relacionados; el empleado revisa si son una sola entrega. No hay tarifa por kilómetros ni coordinación automática de repartidores.

Los horarios de atención están precargados según el documento. Delivery buffet: 12:00–14:00, lunes–sábado. Delivery chipería permanece sin horario. Las excepciones y solicitudes fuera de horario requieren revisión explícita del encargado. Método de pago no implica dinero recibido; registrar estado de cobro por separado.

## Casa Central

Crear **otro** proyecto Supabase y **otro** sitio Netlify con su número/credenciales, incluso si se reutiliza la misma rama. Aplicar las mismas migraciones, configurar nombre, datos del local, logotipo, horarios y catálogo desde el CRM. No copiar clientes, conversaciones, pedidos, tokens ni secretos de Villeta. No es multitenancy en una base compartida. Revisar condiciones comerciales de esa sucursal en lugar de asumir que coinciden.

## Pendientes para producción

- Logotipo oficial; EV es solo una marca provisional editable, no un diseño oficial recibido.
- Dirección descriptiva exacta y demás datos de contacto no proporcionados.
- Confirmar horarios provisionales de chipería y su delivery. No se cargó un horario inventado.
- Fotografías/menús reales de buffet; no se cargaron platos comerciales ficticios.
- Precios de panes dulces, activación estacional y variantes confirmadas de facturas. Bollo y bollito no se fusionan.
- Procedimiento conjunto de entrega: por ahora exige revisión del personal, sin duplicar tarifas automáticamente.
- Proyectos, dominios, cuentas y autorización para Supabase/Meta/IA; prueba integral de proveedores reales, precisión de visión y despliegue Netlify no ejecutados en esta máquina.
- Política de privacidad, conservación de conversaciones/fotos y copias de seguridad según operación del negocio.
- Paginación de pedidos/conversaciones al superar 500 y clientes al superar 1.000; el historial de mensajes sí permite cargar páginas anteriores. Historial reciente del panel limitado a 2.000 cambios y menús a 90 versiones.
- Sin plantillas WhatsApp fuera de 24 horas, pasarelas, impresión de cocina, facturación ni inventario de ingredientes. Se conservan los límites de transporte del upstream para audio/archivos.

No se hizo push, publicación ni conexión a datos reales. El commit local identifica el resultado revisable.
