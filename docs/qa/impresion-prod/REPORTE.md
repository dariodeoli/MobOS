# Verificación post-deploy · dominio Impresión · v1.0.136

- Base: https://app.moboss.online
- Fecha: 2026-09-22T00:30:11.936Z

## Resultado

- ✅ **demo: comprobante con 80 mm por defecto e iconos en los niveles** — v1.0.136 · niveles con icono y 80 mm por defecto · capturas: 01-comprobante-modal-pos.jpg, 02-comprobante-demo-80.jpg
- ✅ **demo: «último usado» recordado entre pantallas (#209)** — nivel y formato recordados en otra pantalla · capturas: 03-comprobante-preferencia-guardada.jpg, 04-pedido-comprobante-ultimo-usado.jpg
- ✅ **demo: etiqueta de unidad desde la ficha (#220)** — ficha con acción de etiqueta y aviso de demo · capturas: 05-inventario-demo.jpg, 06-etiqueta-demo-aviso.jpg
- ✅ **producción: contenido del dominio en los assets cargados** — 9 assets · 11 marcas del dominio presentes
- ✅ **el demo no llama al API de impresión** — 0 llamadas a impresión · 0 al API general

## Marcas verificadas en los assets desplegados

- último usado (#209): mobos:impresion:ultimo
- etiqueta de unidad (#220): ETIQUETA DE UNIDAD · IDENTIFICADOR · IMEI / SERIAL · CÓDIGO QR · CÓDIGO DE UNIDAD · class="bloque" · Reimprimir etiqueta
- comprobante/niveles (#206/#208): Recibí conforme (firma) · Aclaración: ______________________________
- IMEI legible (#203): no acredita propiedad ni reemplaza la

## Pendiente en manos de Dario (prueba física)

- #17 (agente launchd/IP secundaria + CUPS) y #96 (USB directo en la ZKP8008): checklist `docs/IMPRESION-PRUEBA-FISICA.md`.

Veredicto: 5/5 pasos OK · 0 llamadas a impresión · 0 errores de consola.

