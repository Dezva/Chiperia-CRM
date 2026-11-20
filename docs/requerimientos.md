# PROYECTO: EL VIEJO CRM — VILLETTA V1

## 1. Objetivo

Desarrollar un CRM gastronómico para **Buffet El Viejo y Chipería El Viejo**, comenzando por el local de Ruta Villeta–Alberdi, Paraguay.

Repositorio base:

https://github.com/Dezva/Guarnipitan-CRM

Reutilizar todo el código funcional posible del proyecto original, especialmente la integración de WhatsApp, clientes, pedidos, conversaciones, intervención humana y ubicaciones de delivery.

**Reglas fundamentales:**

- No modificar el repositorio original de Guarnipitan.
- Crear un proyecto independiente.
- Un CRM para la sucursal de Villeta.
- Un chatbot de WhatsApp para buffet y chipería.
- Preparar la aplicación para reutilizarla posteriormente en Casa Central, mediante un despliegue independiente.
- No inventar productos, precios ni condiciones comerciales.
- No activar integraciones reales sin autorización.
- Mantener pruebas automatizadas y documentación.

## 2. Arquitectura

El CRM gestionará dos servicios comerciales diferentes:

**Buffet El Viejo**

- Menú variable diariamente.
- Carga del menú mediante fotografías.
- Productos agrupados por categorías.
- Registro automático de solicitudes.
- Precios finales gestionados exclusivamente por empleados.
- Intervención humana para comunicar y acordar importes.

**Chipería El Viejo**

- Catálogo de productos con precios fijos.
- Cálculo automático de subtotales.
- Productos y disponibilidad editables.
- Productos de temporada.
- Registro automático de pedidos.
- Confirmación humana.
- Comunicación automática del total confirmado.

Ambos servicios compartirán clientes, infraestructura y bandeja de conversaciones, pero conservarán sus propios catálogos, pedidos y reglas comerciales.

## 3. Auditoría del repositorio

Inspeccionar los archivos existentes, incluidos:

- `shared/order-engine.js`
- `shared/locations.js`
- `netlify/lib/worker.mjs`
- `netlify/functions/whatsapp.mjs`
- `netlify/functions/api.mjs`
- `database/`
- `public/`
- `tests/`
- `docs/ubicaciones-delivery.md`

Reutilizar las funcionalidades existentes cuando sean compatibles.

Prestar especial atención a la migración `006_ubicaciones_delivery.sql`, que ya incorpora recepción y asociación de ubicaciones de WhatsApp.

Conservar deduplicación, control de concurrencia, validaciones del servidor, autenticación y mecanismos de intervención humana.

## 4. Interfaz del CRM

Crear una interfaz moderna, profesional, adaptable a escritorio y móvil.

Mantener una identidad visual basada en El Viejo, con rojo, amarillo y colores neutros.

Permitir cambiar el logotipo posteriormente sin modificar componentes internos.

Secciones:

1. Resumen.
2. Pedidos.
3. Conversaciones.
4. Clientes.
5. Menú del buffet.
6. Catálogo de chipería.
7. Delivery.
8. Usuarios.
9. Configuración.

Implementar un filtro:

- Todos.
- Buffet.
- Chipería.

Los pedidos deben indicar claramente su servicio y estado.

## 5. Chatbot de WhatsApp

Un único asistente atenderá ambos servicios.

Cuando no esté claro qué necesita el cliente, preguntar:

"¡Buenas! Bienvenido a El Viejo. ¿Querés consultar o hacer un pedido del buffet o de la chipería?"

El chatbot debe:

- Identificar el servicio solicitado.
- Recordar el servicio activo.
- Permitir cambiar de servicio.
- Evitar repetir preguntas innecesariamente.
- Consultar el catálogo correspondiente.
- Registrar solicitudes.
- Respetar horarios y disponibilidad.
- Recopilar datos necesarios del cliente.
- Permitir intervención humana.
- Nunca inventar precios ni productos.

Si el cliente necesita productos de ambos servicios, registrar solicitudes diferenciadas pero relacionadas. Evitar duplicar costos de delivery; cuando el procedimiento conjunto sea ambiguo, solicitar revisión humana.

La IA interpreta el lenguaje natural, pero las operaciones comerciales, los precios y las transiciones de pedidos deben validarse mediante lógica determinista del servidor.

## 6. Buffet — Horarios y menú

### Horarios

- Lunes a sábado.
- Atención: 11:00–15:00.
- Delivery: 12:00–14:00.
- Zona horaria: America/Asuncion.

Los horarios serán editables desde Configuración.

### Menú diario mediante fotografía

Función obligatoria.

El empleado deberá poder:

1. Subir una fotografía.
2. Solicitar reconocimiento mediante IA.
3. Revisar los platos detectados.
4. Corregir nombres y categorías.
5. Agregar o eliminar productos.
6. Confirmar y publicar el menú.

Nunca publicar automáticamente un menú sin revisión humana.

Incluir:

- Fotografía original.
- Menú activo.
- Historial de menús.
- Productos agotados.
- Cambios durante el día.
- Edición manual.
- Reemplazo completo.
- Actualización parcial.
- Estado de borrador y publicado.

Si no hay menú confirmado para ese día, el chatbot debe comunicarlo sin ofrecer como vigente el anterior.

No entrenar modelos diariamente para actualizar productos. Utilizar la información almacenada en la base de datos.

### Precios de referencia

Información recibida:

- Guarniciones: Gs. 40.000/kg.
- Carne: Gs. 80.000/kg.
- Pollo y cerdo: Gs. 75.000/kg.

Estos valores podrán guardarse como referencias configurables.

**IMPORTANTE: NO utilizar automáticamente estas tarifas para calcular ni comunicar el precio final de los pedidos del buffet.**

El personal del negocio determina el importe definitivo.

## 7. Flujo definitivo de pedidos del buffet

1. El cliente solicita el servicio buffet.
2. El chatbot consulta el menú diario publicado.
3. El cliente indica los platos que desea.
4. El chatbot recopila los productos, observaciones y datos necesarios.
5. Pregunta si será retiro o delivery.
6. Para delivery solicita ubicación puntual de WhatsApp y referencia.
7. Registra la solicitud en el CRM.
8. El pedido queda pendiente de revisión, sin precio definitivo.
9. El encargado recibe el pedido y toma control de la conversación.
10. El chatbot pausa sus respuestas.
11. El encargado determina y comunica el importe final al cliente.
12. Si corresponde delivery, también establece el costo de envío.
13. El empleado registra los importes y gestiona la confirmación del pedido.
14. Terminada la atención, puede devolver la conversación al chatbot.

### Restricciones del buffet

- El chatbot no calcula un subtotal comercial definitivo.
- No asigna pesos o porciones inventadas.
- No comunica importes definitivos.
- No acepta pedidos por su cuenta.
- No reemplaza al empleado en la negociación o confirmación de precios.
- Los importes desconocidos deben representarse como pendientes, nunca como cero.
- Mantener el historial de cambios y confirmaciones.

## 8. Chipería — Horario y catálogo

### Horario

- 05:15–18:30.
- Lunes a sábado, provisional y configurable.

Horario específico de delivery pendiente de confirmación. No inventarlo.

### Productos y precios

Todos los importes se almacenarán como números enteros en guaraníes paraguayos.

**Chipas**

- Tradicional: Gs. 3.500.
- Tradicional argolla: Gs. 5.000.
- Tradicional pelotita: Gs. 1.500.

**Chipas rellenas — Gs. 5.000 cada una**

- Extra queso.
- Jamón y queso.
- Pollo catupiry.
- Carne.

**Empanadas — Gs. 6.000 cada una**

- Carne.
- Pollo.
- Jamón y queso.
- Chilena.
- Choclo.

**Tartas — Gs. 8.000 cada una**

- Jamón y queso.
- Pollo.

**Panes**

- Pan de jamón y queso: Gs. 12.000.
- Pan de queso: Gs. 10.000.

**Sándwiches**

- Milanesa de pollo: Gs. 13.000.
- Milanesa de carne: Gs. 12.000.
- Verdura: Gs. 10.000.
- Jamón y queso: Gs. 10.000.

**Otros**

- Villa Roel: Gs. 4.000.
- Croqueta: Gs. 6.000.
- Pepas: Gs. 12.000.
- Marmolada: Gs. 10.000.
- Facturas: Gs. 5.000.
- Pasta frola: Gs. 5.000.
- Pionono: Gs. 10.000.
- Bollito: Gs. 10.000.

Las facturas pueden incluir bollo, medialuna y otras variedades, pero no inventar variantes ni precios que no fueron confirmados.

No asumir que bollo y bollito son el mismo producto.

### Pan dulce de temporada

Crear:

- Pan dulce chico.
- Pan dulce mediano.
- Pan dulce grande.

Los tres deben comenzar inactivos y sin precio.

El empleado podrá establecer sus precios y activarlos cuando estén disponibles.

Un producto sin precio confirmado no debe ofrecerse automáticamente.

### Administración

Permitir modificar:

- Productos.
- Categorías.
- Variantes.
- Precios.
- Disponibilidad.
- Productos de temporada.

Los cambios deben aplicarse al catálogo utilizado por el chatbot.

## 9. Flujo definitivo de pedidos de la chipería

**Los productos de la chipería tienen precios fijos. El encargado NO tiene que introducir manualmente su importe final, excepto el costo adicional de delivery cuando corresponda.**

El proceso será:

1. El cliente elige chipería.
2. El chatbot consulta el catálogo.
3. El cliente selecciona productos y cantidades.
4. El motor de pedidos obtiene los precios desde la base de datos.
5. Calcula automáticamente el subtotal.
6. Solicita modalidad de entrega.
7. Si es delivery, recopila ubicación y referencia.
8. Registra el pedido como pendiente de revisión.
9. El encargado verifica productos, cantidades y disponibilidad.
10. Si es delivery, introduce manualmente el costo del envío.
11. El servidor calcula el total definitivo sumando productos y delivery.
12. El encargado confirma el pedido desde el CRM.
13. El sistema genera y envía automáticamente un resumen al cliente por WhatsApp.
14. El chatbot comunica el total aprobado y el estado real de la solicitud.

### Reglas estrictas de precios de chipería

- No solicitar al empleado que introduzca manualmente el subtotal.
- No permitir que la IA invente o altere precios.
- Los precios de los productos provienen exclusivamente del catálogo.
- Las cantidades se validan antes de calcular.
- El servidor calcula los importes, no la IA.
- Si un producto cambia de precio antes de confirmar el pedido, actualizar la cotización y comunicar la diferencia.
- El único importe adicional manual previsto es el delivery.
- Para retiro, no añadir costo de delivery.
- Si hay delivery, exigir que el empleado establezca explícitamente su costo, incluso si es Gs. 0.
- No permitir confirmación con productos inactivos o sin precios válidos.
- Un empleado autorizado puede cambiar precios desde el módulo Catálogo, pero no modificar arbitrariamente el precio unitario de un pedido individual.

### Ejemplo

Cliente solicita:

- 3 chipas tradicionales: Gs. 10.500.
- Delivery: pendiente.

El empleado revisa el pedido y establece un delivery de Gs. 8.000.

El sistema calcula:

- Subtotal: Gs. 10.500.
- Delivery: Gs. 8.000.
- Total: Gs. 18.500.

Tras la confirmación del encargado, el chatbot envía el resumen con estos importes.

Este ejemplo no establece una tarifa fija de delivery.

No enviar confirmaciones duplicadas y no comunicar una aceptación antes de que el backend registre correctamente el estado correspondiente.

## 10. Delivery y ubicaciones

Reutilizar la funcionalidad de ubicaciones del repositorio original.

Si el cliente elige delivery:

- Solicitar ubicación puntual de WhatsApp.
- Guardar coordenadas.
- Guardar referencias de dirección.
- Asociar correctamente la ubicación al pedido.
- Ofrecer enlace de Google Maps.
- Permitir copiar ubicación desde el CRM.

Si el cliente elige retiro, no solicitar ubicación.

El costo del envío será introducido manualmente por un empleado autorizado.

No desarrollar cálculos automáticos por kilómetros ni rutas.

Si falta información indispensable para un delivery, conservar el pedido como borrador o pendiente de información; no confirmarlo como si estuviera completo.

Mantener validaciones de coordenadas, deduplicación, historial y protección ante ubicaciones antiguas o mal asociadas.

## 11. Métodos de pago

Configurar:

- Efectivo.
- Tarjeta de débito.
- Tarjeta de crédito.
- QR.
- Transferencia.

Guardar el método seleccionado y el estado del pago por separado.

No interpretar la elección del método como confirmación de que se recibió el dinero.

No implementar pasarelas de pago en esta versión.

## 12. Gestión de pedidos

Cada pedido debe contener:

- Número identificador.
- Cliente y contacto.
- Servicio.
- Productos y cantidades.
- Observaciones.
- Modalidad de entrega.
- Ubicación cuando corresponda.
- Método de pago.
- Subtotal calculado o importe pendiente.
- Costo de delivery.
- Total definitivo cuando exista.
- Estado.
- Responsable.
- Historial de cambios.

Distinguir claramente los pedidos de buffet y chipería.

Implementar estados como:

- Borrador.
- Pendiente de información.
- Pendiente de revisión.
- Confirmado.
- En preparación.
- Listo.
- En reparto.
- Entregado o retirado.
- Cancelado.
- Rechazado.

Mantener transiciones seguras y auditables.

## 13. Conversaciones e intervención humana

Reutilizar la bandeja existente de Guarnipitan.

Permitir:

- Ver conversaciones.
- Filtrar por servicio.
- Consultar historial.
- Ver pedidos relacionados.
- Tomar conversación.
- Responder desde el CRM.
- Pausar chatbot.
- Reactivar chatbot.
- Conservar mensajes y pedidos.

En el buffet, la toma humana es parte normal del proceso de comunicación del precio final.

En la chipería, no es necesario que el empleado tome manualmente la conversación para comunicar un total ya confirmado: esa notificación debe poder enviarse automáticamente por el sistema.

Mantener las protecciones para no generar respuestas simultáneas ni duplicadas.

## 14. Seguridad y usuarios

Reutilizar Supabase Auth, políticas RLS y validaciones del backend.

Perfiles iniciales:

- Administrador.
- Empleado autorizado.

El administrador puede gestionar usuarios, catálogo, menús, configuraciones y pedidos.

Los empleados autorizados podrán revisar pedidos, establecer costos de envío y atender conversaciones según sus permisos.

No exponer credenciales ni datos privados en el frontend.

No permitir que el chatbot realice operaciones administrativas sin autorización.

## 15. Configuración

Permitir editar desde el CRM:

- Nombre del negocio.
- Datos del local.
- Horarios de buffet y chipería.
- Horarios y modalidades de delivery.
- Métodos de pago.
- Productos y disponibilidad.
- Menús del buffet.
- Tarifas de referencia.
- Activación del chatbot.
- Identidad visual.

Mantener los valores desconocidos como pendientes y no inventar configuraciones comerciales.

## 16. Optimización de IA

Mantener separados los procesos de:

- Interpretación conversacional.
- Consulta de catálogo.
- Reconocimiento de imágenes.
- Validación de pedidos.
- Cálculo de importes.

Evitar llamadas a IA para cálculos matemáticos simples, consultas deterministas o transiciones de estados.

No enviar fotografías repetidamente si ya fueron procesadas.

El menú diario debe almacenarse en la base de datos.

Los modelos y proveedores deben ser configurables y no depender obligatoriamente de versiones obsoletas.

## 17. Demo y pruebas

Crear una demo funcional sin enviar mensajes reales.

Probar:

1. Selección de buffet o chipería.
2. Cambio de servicio.
3. Catálogos independientes.
4. Cálculo automático de chipería.
5. Buffet sin precios automáticos.
6. Productos agotados.
7. Pan dulce inactivo.
8. Subida y revisión de fotografía de menú.
9. Publicación de menú.
10. Menú diario no confirmado.
11. Delivery con ubicación.
12. Delivery sin ubicación.
13. Retiro sin ubicación.
14. Costo de envío manual.
15. Confirmación humana.
16. Notificación automática de la chipería.
17. Intervención humana del buffet.
18. Cambios de precios antes de confirmar.
19. Prevención de pedidos duplicados.
20. Permisos y seguridad.
21. Migraciones y compatibilidad con la base existente.

Conservar y ejecutar las pruebas originales que sigan siendo aplicables.

No afirmar que una prueba pasó si no fue ejecutada.

## 18. Fases de implementación

### Fase 1 — Auditoría y preparación

Inspeccionar Guarnipitan, identificar componentes reutilizables, preparar proyecto independiente y migraciones.

### Fase 2 — CRM y catálogos

Adaptar interfaz, servicios, productos, pedidos, usuarios y configuración.

### Fase 3 — Menú fotográfico

Implementar reconocimiento, revisión, publicación y administración de menús diarios.

### Fase 4 — Chatbot y pedidos

Integrar selección de servicio, pedidos de chipería con precios fijos, solicitudes de buffet sin precio automático, ubicaciones y confirmación humana.

### Fase 5 — Validación

Completar demo, pruebas, documentación, guías de despliegue y corrección de errores.

Trabajar por etapas verificables, evitando cambios masivos innecesarios.

## 19. Entregables

Entregar:

1. Código completo del proyecto independiente.
2. Rama y commit identificables.
3. Documentación de arquitectura.
4. Migraciones SQL.
5. Instrucciones de instalación para Windows.
6. Variables de entorno sin secretos.
7. Guía de configuración de Supabase, Netlify, WhatsApp e IA.
8. Demo funcional.
9. Resultados reales de pruebas.
10. Limitaciones y datos pendientes para producción.
11. Guía para reutilizar la aplicación en Casa Central.

No modificar Guarnipitan ni sus datos reales.

## 20. Objetivo final

El resultado debe ser un CRM funcional para El Viejo de Villeta con un único chatbot que atienda buffet y chipería.

**La distinción de precios es obligatoria:**

- **CHIPERÍA:** productos con precios fijos. El sistema calcula automáticamente el subtotal y el total, agregando el delivery establecido por el empleado. El chatbot comunica el total confirmado.
- **BUFFET:** el chatbot registra la solicitud, pero los precios finales son responsabilidad del encargado. El empleado toma el chat, acuerda los importes y confirma el pedido.

Ambos servicios deben mantener la intervención humana, el registro de pedidos y las ubicaciones de delivery.

Priorizar seguridad, estabilidad, reutilización del código y facilidad de administración.

Comenzá auditando el repositorio original y avanzá por fases sin inventar información comercial.