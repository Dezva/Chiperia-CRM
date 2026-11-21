# V1.4: avisos de pedidos

La barra superior muestra el número de pedidos `pending`, de ambos servicios. El panel identifica Buffet/Chipería y permite abrir cada pedido. La marca «Nuevo» aparece en el panel y en el listado; abrir el aviso o marcarlo como visto quita esa marca, sin cambiar el estado comercial del pedido. Confirmarlo, rechazarlo o cancelarlo lo retira del contador en la siguiente actualización.

## Actualización y persistencia

Se reutiliza el intervalo de cinco segundos del CRM conectado. Cuando hay un formulario, Configuración o el editor de menú abierto, se consulta solo la lista mínima de pendientes y no se reconstruye la pantalla. La migración `014_avisos_pedidos.sql` añade una RPC de lectura con IDs, números, servicio, estado y fecha. Incluye todos los pendientes, incluso los que quedaron fuera de los 500 pedidos recientes. Requiere sesión integrante en la API; la RPC directa está reservada al backend.

La primera carga establece una línea de base silenciosa. Cada nuevo ID pendiente observado produce como máximo un aviso por actualización. La lista de IDs observados, marcas no leídas y preferencia de sonido se guarda en este navegador y se separa por proyecto/cuenta. Recargar o actualizar no vuelve a sonar por esos IDs. Los pendientes antiguos siguen en el contador. Cambiar un pedido ya observado de estado no lo convierte en una nueva llegada.

Es un registro local de avisos, no una marca de lectura compartida por todo el equipo. Otro dispositivo o perfil tiene su propia línea de base. Borrar los datos del sitio elimina ese registro; la primera carga vuelve a ser silenciosa. Si el navegador impide guardar preferencias, se indica en el panel y la deduplicación solo dura durante esa sesión. No se guardan textos ni datos de clientes en el registro de avisos.

## Sonido opcional

Está desactivado inicialmente. «Activar sonido» requiere un clic y reproduce una muestra breve. Después suena una vez por actualización que contiene pedidos nuevos, sin repetir por los pendientes viejos. «Silenciar» mantiene los avisos visuales. El sonido no se usa para los cambios de estado.

Después de recargar, el navegador puede necesitar «Reactivar sonido» mediante otro gesto; no se intenta saltar sus restricciones de audio. Si no admite AudioContext, los avisos visuales siguen disponibles. No hay permisos de notificación del sistema, servicios externos, audio remoto ni dependencias nuevas. Las pruebas de audio simulan AudioContext para contar reproducciones: no prueban parlantes ni audio físico en móviles reales.

## Capturas y pruebas

- [Alertas en escritorio](capturas/alertas-v14-desktop.png)
- [Alertas en móvil](capturas/alertas-v14-mobile.png)

Los datos son ficticios. Las pruebas comprueban contador, primera carga, duplicados, recarga, estados, silenciamiento, activación por gesto, navegador sin audio, sesión/RLS y un contador de más de 500 pendientes. Un recorrido conectado simulado verifica que llega un aviso mientras se escribe en Configuración, que el texto se conserva y que se puede abrir el pedido mediante el acceso rápido.

Los avisos requieren mantener el CRM abierto. El intervalo puede demorarse si el navegador suspende la pestaña o no hay red. No son notificaciones push ni avisos garantizados cuando el navegador está cerrado. No se habilitaron conexiones reales para probarlos.
