El chatbot podía confundir consultas con compras, perder el borrador ante una interpretación fallida o reemplazar una variedad cuando el cliente quería agregar otra. Este PR estabiliza el recorrido de buffet y chipería, mantiene las tarifas del buffet separadas de los precios individuales y permite corregir errores sin registrar pedidos parciales.

- Interpreta nombres y variantes contra el catálogo vigente, conserva cantidades y notas y permite quitar artículos con aclaración ante ambigüedad.
- Separa consultas, mensajes sociales, modificaciones, confirmación y cancelación. Una consulta de otro servicio informa sin cambiar el borrador activo.
- Reinicia solo una compra comercialmente inválida y pide la lista completa. Ante un fallo técnico, conserva el borrador y el bot activo, con un máximo de dos llamadas al proveedor.
- Valida IDs, disponibilidad, cantidades, notas y campos de entrega en el servidor. El modelo no puede inventar precios, cambiar datos del cliente ni aceptar solicitudes.
- Mantiene el menú diario, tarifas de referencia sin cálculo automático de buffet, precios humanos, delivery con punto válido, pedidos relacionados, stickers, permisos, deduplicación y autenticación ASCII del worker.

Validación: `npm run build` y `npm test`, con **186 pruebas: 184 aprobadas, cero fallos y dos omisiones heredadas**. Incluye conversaciones con PGlite/proveedor simulado y navegador en escritorio/móvil. Resultados y límites en [la guía de revisión](https://github.com/Dezva/Chiperia-CRM/blob/fix/tarifas-buffet-sin-regresion-chiperia/docs/revisiones/pulido-integral.md). No se utilizaron proveedores reales ni se enviaron mensajes a Meta.

Preparación del despliegue final: `[skip netlify]`, sin publicación, sin fusión, sin nuevas dependencias o migraciones y sin cambios de credenciales. La producción se actualizará mediante un único despliegue manual cuando se autorice.
