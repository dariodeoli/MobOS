# Recorrido funcional de producción · dominio Impresión · comprobantes y PDFs (#185)

- Base: https://app.moboss.online
- Versión desplegada: v1.0.137
- Fecha: 2026-09-22T01:07:34.958Z
- Método: Playwright headless (chromium) sobre la demo pública de producción.

## Pasos

- ✅ **entrada a la demo como dueño** — versión 1.0.137 · perfiles demo: true · capturas: 01-acceso-demo.jpg, 02-panel-demo.jpg
- ✅ **POS: comprobante con ítems en los 3 niveles × A4/80/58 (PDF por tamaño)** — 9 PDFs (3 niveles × 3 tamaños) con ítems, totales, QR y leyenda · capturas: 03-comprobante-completo-a4.jpg, 04-comprobante-completo-thermal-80.jpg, 05-comprobante-completo-thermal-58.jpg
- ✅ **POS: «Descargar PDF» llega al iframe imprimible (sin diálogo en headless)** — iframe imprimible con MOBOS Comprobante de compra Pedido 21/9/2026, 10:07:08 p. m. Cliente QA Comproba… · capturas: 06-comprobante-descargar-pdf.jpg
- ✅ **pedido: comprobante desde la página del pedido** — pedido con A4/80/58 y PDF 80 mm · capturas: 07-pedido-comprobante-modal.jpg, 08-pedido-comprobante-80.jpg
- ✅ **finanzas: Resumen → Imprimir resumen (A4 ejecutivo + 58/80)** — 3 PDFs del resumen (A4 ejecutivo + 58/80) · capturas: 09-resumen-modal.jpg, 10-resumen-a4.jpg
- ✅ **el demo no llama al API real** — 0 llamadas de impresión/datos · 0 al API general del shell

## Evidencia

- PDFs por tamaño: `comprobante-<nivel>-<a4|thermal-80|thermal-58>.pdf` (9), `pedido-comprobante-80.pdf`, `resumen-<a4|thermal-80|thermal-58>.pdf` (3).
- Capturas del modal, de la vista previa y de «Descargar PDF».

## Fuera de alcance

- Cola/monitor de impresión en la demo: `docs/qa/185-impresion/` (script `scripts/qa-185-impresion-demo.mjs`).
- #17 (launchd/IP secundaria + CUPS) y #96 (USB directo en la ZKP8008): prueba física en manos de Dario (`docs/IMPRESION-PRUEBA-FISICA.md`).

Veredicto: 6/6 pasos OK · 0 errores de consola.

