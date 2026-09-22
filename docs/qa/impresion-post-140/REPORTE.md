# QA post-deploy de impresión · v1.0.140 (#215/#218)

- Base: https://app.moboss.online
- Fecha: 2026-09-22T09:53:03.334Z
- Método: Playwright headless sobre la demo de producción; funcional en los e2e (80 mm + PDF).

## Pasos

- ✅ **demo: comprobante rápido en Vendidos (ícono + tooltip)** — v1.0.140 · tooltip «Imprimir comprobante rápido (nivel Rápido, 80 mm) sin salir de la lista» · aviso honesto del demo · capturas: 01-panel-demo.jpg, 02-vendidos-listado.jpg, 03-comprobante-rapido-aviso.jpg
- ✅ **demo: etiquetas del lote (Traslados + recepción en tránsito)** — lotes en demo: 0 (sin transferencias demo) · recepción con reimpresión · capturas: 04-traslados-listado.jpg, 05-transito-listado.jpg, 06-recepcion-reimprimir.jpg
- ✅ **producción: bundle con comprobante rápido y lote completo** — 6 assets · 7 marcas presentes
- ✅ **el demo no llama al API real** — 0 llamadas de inventario/impresión · 0 al API general del shell

## Marcas verificadas en los assets desplegados

- comprobante rápido (#215): Comprobante rápido · Imprimir comprobante rápido · La unidad no tiene un pedido asociado.
- etiquetas del lote (#218): Reimprimir las etiquetas de todas las unidades del lote · Recibir lote · Recibir todo el lote y elegir depósito destino · No se encontraron las unidades del lote para imprimir.

## Funcional (e2e del arnés)

- `vendidos-comprobante-rapido.spec.js`: ícono → trabajo `comprobante` (80 mm) sin abrir la ficha; sin impresora, PDF de respaldo.
- `traslados-etiquetas-lote.spec.js`: lote completo desde Traslados, individual desde la recepción, recepción del lote y PDF de 80 mm.
- Corrida post-v1.0.140 sobre el código integrado: **6/6** (2 del comprobante rápido + 4 del lote).

Veredicto: 4/4 pasos OK · 0 errores de consola.

