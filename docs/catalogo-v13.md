# Catálogo comercial V1.3

Base: `feat/configuracion-amigable`, commit `0ea4d30dc762357c6a9aae4610dfb1f433fba1c7`. Desarrollo en `feat/catalogo-alertas-v1.3-v1.4`.

Cada registro de `guarni_catalog` representa una opción vendible independiente. Su ID, precio, disponibilidad, estado activo, temporada y sinónimos son propios. La variedad es opcional y tiene su propio registro: cambiar Empanada · Carne no cambia Empanada · Pollo. No hay precios de categoría ni herencia automática.

## Uso desde el CRM

Catálogo de chipería permite buscar nombres y sinónimos, filtrar categoría/estado, crear productos, editar y crear variantes. «Administrar categorías» permite crear, renombrar, ordenar y desactivar. Para eliminar una categoría con productos, seleccionar explícitamente una categoría activa de destino. Moverlos conserva sus identificadores. La desactivación de una categoría suspende nuevas ventas de sus productos sin borrar registros.

El formulario de producto permite confirmar su precio individual, marcar agotado, desactivar, señalar temporada y añadir nombres alternativos, uno por línea. No solicita IDs ni estructuras técnicas. Administradores y empleados con `catalog_editor` pueden modificarlo; frontend, API y SQL verifican el permiso. Los demás empleados solo consultan.

Los sinónimos pertenecen a opciones vendibles específicas. Pasta frola admite «Pastafrola». Los plurales regulares, mayúsculas, tildes y espacios se normalizan. «Media luna» puede añadirse a Medialuna; no equivale a Bollito, Bollo ni a toda la categoría Facturas. La UI avisa cuando coinciden nombres de varios productos; se conserva la información y el asistente pide aclaración. El término genérico «Facturas» no se admite como sinónimo vendible.

Un producto sin precio individual no se ofrece automáticamente. Puede guardarse pendiente y completarse después. No se crean Medialuna ni Bollo con precios inventados: el encargado debe crear y confirmar cada variedad comercial. Los precios introducidos en las pruebas/capturas son **datos ficticios de demo**, no precios oficiales nuevos.

## Migración 012

Aplicar únicamente `database/012_catalogo_individual.sql` después de 011. Es transaccional y reejecutable. No volver a ejecutar 007–011 para actualizar una instalación existente.

- Conserva los 31 IDs iniciales, sus precios y la disponibilidad, salvo la retirada deliberada de Facturas genérica de nuevas ventas.
- Conserva ediciones de empleados; una segunda ejecución no recarga precios ni restablece sinónimos o estados.
- Respalda los registros originales en `viejo_catalog_backup`, protegido con RLS, antes de convertirlos. Los registros preexistentes reciben una fecha de creación de migración; no se inventa su fecha histórica.
- Añade categorías administrables, conserva categorías personalizadas y vincula cada producto con una clave estable. Pasta frola y Bollito pasan de Otros a Facturas únicamente si mantenían la clasificación inicial. «Temporada» pasa a «Productos de temporada».
- Conserva los tres panes dulces sin precio, no disponibles e inactivos. Se pueden completar en temporada.
- `facturas-base` conserva ID y precio anterior, queda `legacy_generic=true`, inactivo y no disponible. No puede reactivarse como artículo genérico; deben crearse variedades individuales. No se duplica ni se divide en ventas nuevas.
- No modifica pedidos, líneas históricas, carritos ni ubicaciones. Los carritos mantienen referencias; si intentan usar un artículo retirado, la validación actual exige revisar su contenido. Los pedidos ya confirmados mantienen importes y pueden continuar su flujo.

PostgreSQL sigue siendo la fuente comercial. El worker consulta catálogo y categorías vigentes en cada interacción relevante; los cambios del CRM no llaman a IA. La cotización SQL valida precio, disponibilidad, estado y categoría antes de registrar y aceptar. Se conserva la recotización al cambiar precios y la revisión humana. Las categorías del buffet son independientes y siguen fijas.

## Evidencia

Las pruebas nuevas cubren migración repetida, 31 registros, precios editados, carritos/pedidos históricos, categorías duplicadas, reasignación, permisos/RLS, precios independientes, sinónimos ambiguos, pendientes y navegador móvil. El registro final de ejecución se documenta en la guía V1.3/V1.4.

- [Catálogo escritorio](capturas/catalogo-v13-desktop.png)
- [Catálogo móvil](capturas/catalogo-v13-mobile.png)
