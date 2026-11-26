# Interpretación de productos y delivery exclusivo del buffet

Fecha: 26 de noviembre de 2026. Rama: `fix/tarifas-buffet-sin-regresion-chiperia`.

## Comportamiento

El reconocimiento usa los nombres, variedades y sinónimos del catálogo actual de PostgreSQL o los platos publicados para hoy. No hay una lista de errores o apodos por alimento.

- Conserva las correcciones inequívocas de una letra y las transposiciones. Amplía la búsqueda a dos ediciones en palabras de siete o más letras, con una distancia relativa máxima del 28 %, candidato más cercano único y otra palabra literal del mismo artículo. Así «milanese de pollo», «milanesse de pollo» y «milenesa de pollo» pueden identificar el plato publicado «Milanesa de pollo».
- Reconoce abreviaciones de al menos cinco letras hacia palabras del catálogo de ocho o más letras, con raíz inicial compartida y otra palabra literal del artículo. Por ejemplo «sanwis de verdura» identifica Sándwich · Verdura si la opción es única, conserva la cantidad y usa su precio actual. También se exige candidato más cercano único; no se agregan equivalencias fijas.
- Los nombres y sinónimos exactos tienen prioridad. No resuelve empates por disponibilidad ni precio; tampoco cambia carne por pollo ni bollo por bollito. Un segundo producto desconocido impide guardar parcialmente la lista.
- Las expresiones más amplias siguen pasando por el modelo configurado y por la validación comercial del servidor. Si no se puede validar el pedido, pide repetir la lista completa; un fallo técnico conserva el borrador. No promete comprender cualquier error.
- Cantidades, notas, disponibilidad y precios se validan como antes. Los productos nuevos no requieren cambios de código ni entrenamiento.

La chipería acepta **retiro en el local**. El delivery corresponde exclusivamente al buffet y mantiene su configuración de horarios, punto de WhatsApp y costo manual. Una petición de delivery de chipería conserva los artículos, deja la modalidad por elegir y pide escribir RETIRO. No convierte automáticamente el pedido a retiro. Las consultas no alteran productos ni cantidades.

El CRM ofrece modalidades por servicio en nuevos pedidos y edición. Configuración muestra la chipería como retiro; no permite volver a habilitar su delivery. La demo conserva el mismo comportamiento incluso ante una ubicación enviada por error. La API bloquea crear, convertir o aceptar nuevas entregas de chipería, aun antes de aplicar la migración.

## Actualización de la base

En la base **exclusiva de El Viejo**, si ya está aplicada 017, ejecutar únicamente:

`database/018_delivery_solo_buffet.sql`

Usar el SQL Editor de Supabase o `psql` contra esa instalación. No ejecutar de nuevo las migraciones anteriores ni aplicarlas en Guarnipitan. La aplicación sigue usando los RPC existentes; no necesita credenciales, variables ni servicios adicionales.

018 es transaccional y reejecutable. Guarda la configuración previa en `viejo_settings_ux_backup` versión `018`, deshabilita únicamente el delivery de chipería y agrega defensas SQL para nuevas solicitudes, cambios de modalidad y nuevas aceptaciones. Conserva la función de finalización vigente de 017 y ajusta el aviso de retiro y la limpieza de ubicaciones del borrador.

No actualiza pedidos históricos, importes, productos, identificadores ni carritos existentes en bloque. Las entregas de chipería ya aceptadas pueden terminar su atención y conservar cobros, mapas e historial. Una entrega antigua todavía pendiente debe cambiarse a retiro o rechazarse antes de aceptarse. No se usa una restricción que invalide filas históricas.

Se recomienda aplicar 018 antes del despliegue para contar también con protección contra escrituras SQL directas. El código bloquea las nuevas solicitudes desde el bot y la API aunque 018 aún no esté instalada. Esta revisión no ejecuta SQL en la instalación real.

## Windows: D:\chiperia

```powershell
Set-Location D:\chiperia
git status --short
git fetch origin
git switch fix/tarifas-buffet-sin-regresion-chiperia
git pull --ff-only origin fix/tarifas-buffet-sin-regresion-chiperia
npm ci
npm run build
npm test
npm run dev
```

Si hay modificaciones locales, conservarlas antes de cambiar de rama. Chromium es necesario para las pruebas de navegador; puede indicarse su ejecutable mediante `CHROMIUM_PATH`.

Para una base que ya tiene 017, se puede abrir 018 en el SQL Editor. Alternativamente, con `DATABASE_URL` configurada localmente para El Viejo y `psql` instalado:

```powershell
psql "$env:DATABASE_URL" -v ON_ERROR_STOP=1 -f database/018_delivery_solo_buffet.sql
```

El push a la rama conserva el despliegue automático de Netlify previamente autorizado (`ignore = "exit 1"`, sin marca de omisión). No modifica la rama de producción configurada en Netlify ni permite verificar por sí solo que un despliegue esté publicado.

## Validación

Ejecución final local:

- `npm run build`: aprobado; conserva los 31 registros del catálogo.
- `node --test --test-concurrency=2 tests/*.test.mjs`: 193 pruebas, 191 aprobadas, 0 fallos, 2 omisiones heredadas de contratos de UI anteriores. Incluye pruebas unitarias, PostgreSQL y navegador; duración aproximada de 118 segundos.
- `git diff --check`: aprobado.

La ejecución incluye el caso exacto «2 sanwis de verdura», el producto inventado «Bravolente · Azurina» y su retiro del catálogo, además de comprobaciones con el proveedor simulado. Las capturas usan únicamente datos de demostración.

Cobertura añadida: errores y abreviaciones contra catálogos dinámicos, producto inventado en tiempo de prueba y retirado después, nombres exactos prioritarios, empates, agotados, cantidades, bloqueo de delivery en bot/API/SQL, migración repetida, pedidos históricos intactos y delivery anterior del buffet cuando el servicio activo es chipería. Los recorridos en Chromium comprueban escritorio de 1440 px y móvil de 390 px, formularios de modalidades y configuración. Las pruebas antiguas de delivery se trasladaron al buffet; las que revisan migraciones anteriores a 018 conservan explícitamente su esquema histórico.

Las pruebas usan PostgreSQL embebido mediante PGlite y proveedor de IA simulado. No se hicieron llamadas reales a OpenAI ni se enviaron mensajes de WhatsApp. No se ejecutó la migración sobre Supabase real ni se verificó la interpretación de un modelo real con estos mensajes. No se requiere entrenamiento nuevo.

Capturas de la demo: [escritorio](../capturas/ortografia-retiro-desktop.png) · [móvil](../capturas/ortografia-retiro-mobile.png). Registro completo: [pruebas](ortografia-y-retiro-pruebas.txt).

GitHub Actions: el workflow `Validate El Viejo` ejecuta build y la suite completa en cada push y pull request. Las ejecuciones del commit publicado pueden consultarse en [Actions](https://github.com/Dezva/Chiperia-CRM/actions) y en [las comprobaciones del PR #1](https://github.com/Dezva/Chiperia-CRM/pull/1/checks). El resultado local no acredita por sí solo un despliegue publicado en Netlify.
