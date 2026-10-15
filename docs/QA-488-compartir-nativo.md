# #488 — Compartir comprobantes en iPhone

La app instalada no dispone de Web Share con archivos. El hook compartido `CompartirImagen` ahora elige la hoja nativa de iOS antes del camino web. Guarda el PNG generado en caché privada mediante Capacitor Filesystem7 y pasa su URI a Share.files. Al cerrar, cancelar o fallar la hoja elimina el temporal. En iOS un fallo se explica y no se convierte silenciosamente en una descarga; cancelar no dispara otro envío.

El navegador conserva Web Share y su respaldo de descarga. No hay cambios de pedidos, importes, permisos del servidor ni subida de documentos. No se habilita Documents/Archivos ni respaldo iCloud. El manifiesto existente ya declara FileTimestamp/C617.1, requerido por Filesystem.

Fuentes oficiales: [Filesystem7](https://capacitorjs.com/docs/v7/apis/filesystem), [Share7](https://capacitorjs.com/docs/v7/apis/share).

Pruebas: compartir URI de caché, orden de limpieza después del diálogo, cancelar, error al escribir/compartir, entradas inválidas/web, temporales distintos y limpieza fallida sin envío duplicado. La validación visual de la hoja nativa en el nuevo binario queda pendiente mientras macOS está bloqueado; AirPrint e impresión física son un recorrido separado, no verificado.

## Novedades para el dueño

- Compartir imagen del comprobante en iPhone usa la hoja de iOS para elegir el destino.
- Cancelar vuelve al comprobante sin descargar otra copia; el archivo temporal se limpia al cerrar.
