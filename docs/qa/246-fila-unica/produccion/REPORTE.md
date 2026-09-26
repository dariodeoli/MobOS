# Verificación en producción · #246 fila única y sin variante duplicada

- Base: https://app.moboss.online
- Versión desplegada: v1.0.178
- Fecha: 2026-09-26T08:21:44.361Z
- Método: Playwright headless (chromium) sobre la demo pública de producción
- Filas medidas: 12 de 23 visibles · alturas: 44, 44, 44, 44, 44, 44, 44, 44, 44, 44, 44, 44 px

## Pasos

- ✅ **entrada a la demo como dueño** — versión 1.0.178 · capturas: 01-acceso-demo.jpg
- ✅ **encabezado sin la columna de variante duplicada** — columnas: PRODUCTO · PROVEEDOR · COSTO · UBICACIÓN · ESTADO · VERIFICADO · ACCIONES · capturas: 02-encabezado-sin-variante.jpg
- ✅ **filas de una sola línea y alto parejo** — 23 filas · 12 medidas: 44–44 px · capturas: 03-inventario-filas.jpg, 04-fila-1.jpg
- ✅ **la variante (capacidad) aparece una sola vez por fila** — 12 filas: capacidad 1 vez y condición presente (p. ej. 256GB · Condición: Nuevo) · capturas: 05-filas-variante-unica.jpg

## Hallazgos

- Sin hallazgos: la tabla cumple los dos criterios de #246 en producción.

