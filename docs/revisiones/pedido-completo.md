# Repetir el pedido completo e interpretar nombres sin equivalencias fijas

**Actualización posterior:** [pulido integral de conversación](pulido-integral.md) restringe el reinicio a intentos reales de compra y diferencia los errores técnicos, las consultas y los mensajes sociales. Esta página documenta el estado de `e954806`.

Continuación de `1f13cf4` en `fix/tarifas-buffet-sin-regresion-chiperia`. Esta revisión reemplaza la política anterior de conservar el borrador tras un artículo desconocido o no vendible.

## Comportamiento

Si un pedido contiene un producto que no se puede identificar con seguridad, está agotado, inactivo o sin precio individual confirmado, se rechaza el intento completo. No se agregan los productos reconocidos por separado ni se invita a ajustar uno para seguir sumando al borrador.

El bot avisa que reinició el borrador y pide enviar **todo el pedido de nuevo, con productos y cantidades**. El borrador activo queda sin artículos ni cotización; `cart.conversation.retry_order` impide continuar con un resumen viejo. CONFIRMAR PEDIDO no registra nada hasta recibir una nueva lista válida. El siguiente pedido comienza sin los artículos anteriores.

El reinicio afecta el borrador del servicio activo. Se conservan los pedidos registrados, el historial, el borrador separado del otro servicio y los datos logísticos del mismo intento, incluida la ubicación propia si ya estaba adjunta. No se cambia de servicio automáticamente. Una consulta de disponibilidad o de precios conserva su flujo de consulta; no reinicia el borrador por preguntar.

Ejemplo reproducido con un menú de prueba que contiene Milanesa de pollo, Sopa paraguaya y Puré de papas:

```text
Cliente: Milanesa de carne
         Pure de papas
Bot: No pude identificar todos los platos del pedido en el menú del buffet de hoy.
     Reinicié el borrador de este servicio; este intento no se envió al local.
     Volvé a enviar el pedido completo, con todos los productos y cantidades…

Cliente: Milanesa de pollo
         Sopa
Bot: 1 × Milanesa de pollo
     1 × Sopa paraguaya
     Buffet: importe pendiente; el encargado lo acordará con vos.
```

La segunda lista no recupera el puré del intento anterior. El pedido del buffet sigue requiriendo importe y aceptación humanos.

## Interpretación sin listas de alimentos en el código

Se elimina la tabla especial de formas de escribir sándwich. Tampoco se agregan condicionales por los ejemplos del usuario. Las palabras se obtienen del catálogo vigente y del menú publicado de hoy, y se usa el modelo configurado cuando hace falta interpretar una expresión no literal.

- Los nombres y sinónimos exactos tienen prioridad. Los errores pequeños inequívocos se resuelven mediante comparación ortográfica general con el vocabulario actual.
- Un nombre abreviado de buffet se deriva del comienzo de los nombres reales del menú de hoy. «Sopa» identifica Sopa paraguaya solo si no hay otro plato posible. Un nombre exacto Sopa, si existe, gana a las abreviaciones. No se buscan ingredientes sueltos ni se cambia carne por pollo.
- Para expresiones como «sanwich de pollo» o «sangui de pollo», el modelo interpreta el mensaje con los candidatos actuales. El servidor valida adicionalmente la correspondencia: semejanza ortográfica general, fragmentos de variantes derivados del catálogo, al menos una palabra literal del artículo en las correspondencias menos fuertes, IDs y cantidades coincidentes, todos los artículos del mensaje, disponibilidad y precio individual. No se acepta una interpretación solo porque el modelo devolvió un ID.
- Los precios se consultan y calculan en el servidor; el contexto de IA no incluye precios. Dos variantes comercialmente posibles, un producto ausente o información insuficiente exigen repetir el pedido completo. La validación no transforma un producto desconocido en otro por compartir categoría o ingrediente.
- Una respuesta incorrecta del proveedor que intente mostrar horarios o un resumen anterior ante un pedido explícito se rechaza. El bot solicita la lista completa.
- No se guardan equivalencias ni se modifican sinónimos automáticamente. Los sinónimos comerciales administrados en el CRM siguen siendo datos de PostgreSQL y se consultan sin reiniciar el chatbot.

Las correcciones no implican que cualquier expresión desconocida pueda reconocerse. Si el servidor no puede validar la interpretación completa, no registra parcialmente. El cliente revisa siempre el resumen con nombres oficiales antes de CONFIRMAR PEDIDO; la aceptación del local sigue siendo independiente.

## Validación y límites

```sh
npm run build
node --test tests/order-retry.test.mjs tests/natural-catalog.test.mjs
npm test
```

Las regresiones usan el worker real con PostgreSQL PGlite y el proveedor simulado. Incluyen el mensaje original con cuatro líneas y «Sanwi», «sanwich de pollo», «sangui de pollo», un producto nuevo sin modificar el código, variantes ambiguas, producto desconocido, cantidades inventadas, lote incompleto, precios pendientes, borradores descartados y un pedido nuevo con precios modificados. También se comprueba la confirmación única, el buffet sin importes y la independencia de los servicios.

Resultado ejecutado: build correcto; **176 pruebas, 174 aprobadas, cero fallos y dos omisiones heredadas**. Incluye todas las pruebas de PostgreSQL y navegador de la suite. [Salida completa](pedido-completo-pruebas.txt).

La prueba de navegador usa la demo en escritorio y móvil: plato inexistente, solicitud de repetir todo, confirmación bloqueada y una nueva lista sin restos. La demo no llama IA externa: cuando requiere interpretación no literal, pide volver a enviar el pedido con nombres del menú. Las expresiones naturales se comprueban en las pruebas del worker con respuestas simuladas; no se midió la precisión ni el consumo de un proveedor real y no se enviaron mensajes reales.

Capturas con datos ficticios: [escritorio](../capturas/buffet-pedido-nuevo-desktop.png) y [móvil](../capturas/buffet-pedido-nuevo-mobile.png).

## Actualización

No hay migraciones ni dependencias nuevas. Se mantienen el modelo y las credenciales configurados por variables de entorno y el transporte ASCII del worker. Por instrucción del responsable, este trabajo se guarda con `[skip netlify]`, sin activar auto deploy ni forzar builds desde `netlify.toml`. El despliegue final se hará por separado, cuando se autorice, e incluirá tanto las funciones como la demo.

```powershell
Set-Location D:\chiperia
git fetch origin
git switch fix/tarifas-buffet-sin-regresion-chiperia
git pull --ff-only origin fix/tarifas-buffet-sin-regresion-chiperia
npm run build
```

No volver a ejecutar migraciones antiguas. No se modifica `main`, Guarnipitan ni la base de producción desde este entorno.
