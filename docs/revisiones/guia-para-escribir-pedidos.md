# Guía cuando no se interpreta un pedido

Los mensajes que no se entienden ahora incluyen instrucciones concretas: cantidad, nombre completo y variedad de cada producto, uno por línea, en una lista sin otros comentarios. Se ofrece un ejemplo de formato con hasta dos productos disponibles del catálogo vigente del servicio, además de MENÚ y la opción de hablar con el equipo.

Los ejemplos no se agregan al carrito ni se convierten en solicitudes. Se excluyen productos ambiguos, inactivos, agotados, sin precio confirmado y de otro servicio. Para buffet se utiliza el menú publicado de hoy, sin platos pendientes de clasificación. Si no hay opciones válidas, se muestra el formato genérico y se invita a consultar MENÚ. Si aún no se eligió servicio, la guía pide indicar buffet o chipería.

El texto desconocido se describe como una parte del mensaje que no se logró interpretar, sin asumir que expresiones informales sean nombres de alimentos. La guía es común a los mensajes de aclaración y de repetición de un pedido completo; no se agregan reglas para cada expresión, abreviatura o muletilla nueva.

Se conserva la lógica existente: una consulta no borra el pedido; un pedido completo que no pudo validarse pide repetir toda la lista, sin agregar parcialmente ni acumular artículos del intento anterior. Los cambios de precio y disponibilidad continúan validándose en el servidor. Los errores técnicos del proveedor mantienen su aviso de reintento y no culpan al cliente por la redacción.

No requiere otra migración SQL, dependencias ni llamadas adicionales al modelo para redactar la ayuda. Los ejemplos usan los datos ya recuperados por el worker. La revisión no cambia saludos, interpretación de productos, cancelación, confirmación, modalidades ni administración.

Validación ejecutada: pruebas de ejemplos con datos vigentes y exclusiones comerciales; worker con PostgreSQL embebido para comprobar que los ejemplos no se registran y que el siguiente pedido válido se envía una sola vez; Chromium para la guía dentro del editor de conversación y compatibilidad móvil; build y suite de regresión. Los resultados están en `guia-para-escribir-pedidos-pruebas.txt`.

Resultado final: build correcto y 9 pruebas dirigidas aprobadas, sin fallos, incluidas PostgreSQL y Chromium. La suite completa anterior dejó 223 aprobadas, 2 omisiones heredadas y una expectativa de mayúscula; se corrigió el mensaje y se repitieron satisfactoriamente los archivos afectados sobre el código final. El registro conserva ambas ejecuciones.

Rama de entrega: `fix/tarifas-buffet-sin-regresion-chiperia`, con el autodeploy existente.
