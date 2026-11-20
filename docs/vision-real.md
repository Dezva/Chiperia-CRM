# Prueba de visión real: manual, aislada y con autorización

No se ejecutó esta prueba durante V1.1. Las pruebas automáticas usan respuestas simuladas y no miden precisión de reconocimiento. No hace falta entrenar ni hacer fine-tuning: el bot consulta los platos revisados y publicados en PostgreSQL.

## Preparación

- Elegir un proyecto Supabase y despliegue Netlify de pruebas exclusivos, sin clientes reales ni webhook de producción. Aplicar migraciones hasta 009. Crear una cuenta Auth con permiso `menu_editor` o administrador.
- Mantener `BOT_ENABLED=false` y `WHATSAPP_SEND_ENABLED=false`. No se requiere habilitar WhatsApp para visión.
- En variables seguras de **Functions**, configurar `AI_API_KEY`, `AI_BASE_URL` (HTTPS, por defecto API Responses de OpenAI) y `AI_VISION_MODEL` con un modelo multimodal compatible y vigente para la cuenta. `AI_MODEL` es independiente para conversación. También se aceptan las variables OPENAI_* de compatibilidad. No pegar claves en el navegador, repositorio ni chat.
- La compatibilidad implementada es **API Responses con entrada input_image y salida JSON Schema**. Un proveedor que solo ofrezca Chat Completions necesita otro adaptador; no basta cambiar la URL. Modelo y endpoint no se toman de prompts.
- Autorizar los hosts exactos del Supabase y proveedor en la red del entorno aislado. Esta revisión no amplió la política de red ni pidió secretos reales.
- Activar temporalmente `AI_IMAGE_ENABLED=true` en ese despliegue aislado. Storage es opcional para la inferencia; preparar el bucket privado como indica [actualización](revisiones/v1.1-actualizacion.md) si se probará también el guardado de originales.

## Prueba desde el CRM

1. Iniciar sesión como encargado autorizado; Menú del buffet → Cargar menú.
2. Elegir una foto PNG/JPEG/WebP real del buffet de hasta 3 MB. El archivo se valida por tamaño, Base64 canónico y firma del tipo declarado; el proveedor aún puede rechazar archivos dañados que cumplan esas comprobaciones.
3. Solicitar reconocimiento. La foto se envía solo desde el backend al modelo de visión, con `store:false`. Timeout del proveedor 45 s. No se usa el modelo conversacional para la imagen.
4. Revisar platos y categorías frente al original: fechas, teléfonos, direcciones, logotipos, publicidad y adornos no deberían aparecer como productos. Anotar omisiones, nombres ambiguos e inclusiones incorrectas. La instrucción al modelo ayuda a separar alimentos, pero su precisión y resistencia semántica a instrucciones dentro de fotos requieren esta evaluación real.
5. Comprobar que no se publicó nada por recibir una propuesta. Corregir manualmente. Guardar un borrador o publicar solo tras marcar revisión humana. El servidor vuelve a exigir revisión.
6. Consultar en la misma conversación del simulador/entorno aislado y comprobar menú vigente. Si el bot externo sigue apagado, usar las pruebas de worker locales para esta verificación sin enviar mensajes.
7. Repetir reconocimiento de la misma imagen con igual proveedor/modelo/esquema: debe devolver `cached=true` sin otra inferencia. Cambiar el modelo utiliza otra clave de caché. Un resultado almacenado no mide una inferencia nueva.

El backend devuelve `usage.input_tokens`, `usage.output_tokens`, `usage.total_tokens` solo si el proveedor los informa como enteros válidos. La interfaz muestra el total cuando existe. No se inventan tokens faltantes ni costos monetarios; documentar tarifas y costo aparte desde la cuenta del proveedor. Los resultados de caché incluyen uso de la inferencia original, no consumo nuevo.

## Script opcional de comprobación

`scripts/vision-smoke.mjs` exige activación explícita y **rechaza cualquier ejecución con CI definido**. No está en scripts de test ni workflows. Variables locales seguras:

- `RUN_REAL_VISION_TEST=I_AUTHORIZE_ISOLATED_VISION_TEST`
- `VISION_TEST_BASE_URL=https://tu-despliegue-aislado.example`
- `VISION_TEST_ALLOWED_HOST=tu-despliegue-aislado.example` (coincidencia exacta)
- `VISION_TEST_BEARER`: access token de sesión vigente del encargado, mediante variable segura, nunca como argumento o en un archivo versionado. El token no es la clave del proveedor.

```sh
node scripts/vision-smoke.mjs /ruta/foto.png /ruta/resultado-nuevo.json
```

Requiere Node 22+. El script llama exclusivamente a `/.netlify/functions/menu-recognize`, devuelve propuestas y consumo informado, y nunca llama a publicar ni a WhatsApp. No imprime foto ni credenciales, y no sobrescribe un resultado existente. Guardar el resultado fuera del repositorio; puede contener información del menú. Revisarlo personalmente y registrar métricas de aciertos/errores con la foto original.

## Cierre

Desactivar `AI_IMAGE_ENABLED`, retirar la variable de sesión y revisar consumo de la cuenta. Mantener WhatsApp apagado. Si la foto contiene datos sensibles, aplicar la política de conservación autorizada. Una prueba correcta de visión no demuestra autorización del negocio para producción, precisión sobre todas las fotos, entrega de WhatsApp ni validez de otras credenciales.
