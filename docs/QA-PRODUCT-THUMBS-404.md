# #404 — derivados de fotos generados por el servidor

Base `395fe95b`, rama `codex/product-thumbs404`. Unidad de backend independiente del encuadre interactivo y del candidato230 congelado.

## Contrato y criterios

| Criterio | Estado y evidencia |
| --- | --- |
| No confiar en miniatura ni dimensiones del cliente | PASS: sólo `file` se decodifica como fuente; los campos width/height no se usan. `thumb` sigue opcional y con validación de contrato previa, pero sus píxeles no se guardan |
| Tipo real, dimensiones y compresión | PASS: JPG/PNG/WebP con magic bytes y decodificación real estricta; WebP800×800 y WebP160×160 del mismo resultado. Orientación EXIF aplicada, metadata descartada |
| Límites de recursos | PASS:5MiB por file/256KiB por thumb opcional; límite real de stream multipart =5MiB+128KiB+256KiB incluso sin Content-Length o falso; lado≤8000 y≤16MP antes de conversión; máximo2 conversiones simultáneas por proceso (429 sin cola); animación WebP/APNG/multipágina rechazada |
| Almacenamiento y privacidad | PASS: únicamente dos derivados en volumen tenant/product-images o ambos ByteA sin volumen; original/EXIF/miniatura arbitraria no se persisten ni sirven; DTO sin rutas/bytes |
| Autorización | PASS con sesiones reales: anónimo401, vendedor sin gestión403, empresa ajena404, sucursal ajena403; GET de bytes/grilla conserva autorización actual |
| Contrato API y gestión | PASS: URLs/DTO/variantKey/principal/orden/cache/ETag conservados; borrar oculta y ambos GET dan404; bytes históricos siguen conservados |
| Fotos anteriores | INTACTAS, sin backfill: GETthumb de fila histórica sin miniatura conserva fallback original y no modifica fila |

`sharp@0.35.5` ya existía transitivamente por Next; ahora es dependencia directa fijada en backend. No migración ni frontend modificados. Se conserva encuadre cliente: una imagen cuadrada800 ya recortada pasa por cover800 sin cambiarlo. Entradas rectangulares directas reciben recorte centrado servidor.

## Seguridad y límites del timeout

Se usa `sharp.timeout({seconds:3})` nativo en cada pipeline de píxeles; no hay Promise.race ni liberación temprana del cupo. El finally libera el cupo cuando la promesa nativa finaliza (también en errores). El timeout no es un SLA de3segundos HTTP: excluye cola libuv y lectura de metadata; los dos pipelines tienen su propio límite. Los caps de bytes/píxeles/canales y concurrencia son explícitos e independientes. No se cambian límites globales de sharp de otros consumidores.

Fuentes primarias consultadas: [constructor y límites](https://sharp.pixelplumbing.com/api-constructor/), [resize/cover](https://sharp.pixelplumbing.com/api-resize/), [metadata de salida y timeout](https://sharp.pixelplumbing.com/api-output/). Se espera a la finalización real antes de soltar recursos lógicos.

## Verificación

- RED con los handlers originales de395fe95b y el mismo arnés HTTP/PG final: PNG truncado (sólo cabecera) devuelve201 frente al400 esperado. Carga baseline por loader temporal, sin reemplazar archivos fuente; el arnés temporal fue retirado y PG propio limpiado. Log `/tmp/mobos-thumbs404-route-red.log`.
- GREEN final: `env -u DATABASE_URL -u DIRECT_URL node backend/tests/product-thumbs404-pg.mjs`: **51 HTTP/PG PASS**, API3206/PG5588, cluster/volumen temporal propios eliminados. Dos empresas, sucursales, sesiones reales, derivado rojo frente a thumb cliente verde, metadata falsa ignorada, volumen/ByteA, ETag304, baja lógica y legado intacto.
- `backend/tests/product-images.test.ts`: PASS final con conversión real, PNG/JPEG/WebP, truncado, resolución excesiva, MIME falso, WebP animado/APNG, EXIF eliminado,3 solicitudes→2 conversiones+1rechazo429 y cupo recuperado. Stream sin Content-Length y con valor falso cancelado al superar la cota; multipart válido intacto.
- `npm --prefix backend run test:unit`: **332 PASS/1 skip previo**, única ejecución completa antes del último guard de stream. Después del guard: unitario relacionado y los51HTTP/PG repetidos en verde, además buildBE final. No se afirma fullsuite final repetida.
- `npm test`: **1562/1562 PASS**, una ejecución; sin cambios frontend.
- `npm run lint`:0errores/1warning previo DeliveryOperations.jsx:42. FEbuildPASS; BEbuildfinalPASS/BUILD_ID presente; Prisma validatePASS; diffcheckPASS y sin marcadores de conflicto.
- `backend/tests/product-images.mjs` ya pertenece al arnés HTTP global: sus oráculos se adaptan al nuevo contrato derivado800/160 y rechazan usar el thumb verde del cliente; permisos/reorden/baja siguen exigidos. Ese script con fixtures globales no se ejecutó por separado aquí. El nuevo arnés51checks es autónomo (puertos dedicados), todavía no agregado a CI compartido.

## Novedades para el dueño

- Cada nueva foto genera su miniatura en el servidor, usando la misma imagen que se muestra en la ficha.
- Se rechazan fotos incompletas, animadas o demasiado grandes y se eliminan datos EXIF del archivo publicado.
- Las fotos anteriores siguen disponibles; no se reemplazan automáticamente ni se pierde su historial.

## Pendientes y alcance

Unidad completada; #404 no se cierra globalmente con esta evidencia. Encuadre interactivo, adopción de otros consumidores y futuras regeneraciones de fotos antiguas pertenecen a sus unidades. No consultas ni cambios en producción, fotos reales, permisos públicos, UI, impresión o Apple. Requiere revisión independiente/integración del dueño del release.
