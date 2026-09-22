# Reimpresión de etiquetas del lote (#218) · verificación

- Producción: https://app.moboss.online · versión v1.0.138 · 3/3 pasos OK
- Funcional (e2e con agente falso, `traslados-etiquetas-lote.spec.js`): 4/4
  - Lote completo desde Traslados en el destino: un trabajo `etiquetas-stock` con las dos unidades.
  - Reimpresión individual desde la recepción del destino: trabajo `etiqueta-stock`.
  - Recepción del lote («Recibir todo el lote»): las unidades quedan disponibles en el destino.
  - Sin impresora: respaldo con el PDF de 80 mm del lote (`etiquetas-lote-80.pdf`).

## Pasos en producción

- ✅ **demo: lotes en Traslados y reimpresión en el destino** — v1.0.138 · lotes en demo: 0 (sin transferencias demo) · recepción con reimpresión disponible · capturas: 08-traslados-demo.jpg, 09-transito-demo.jpg, 10-recepcion-destino-demo.jpg
- ✅ **producción: el bundle trae el lote completo (#218)** — 7 assets · 5 marcas del lote presentes
- ✅ **el demo no llama al API real** — 0 llamadas de inventario · 0 al API general del shell

## Notas

- El demo no tiene transferencias (los lotes viven en la base real): la reimpresión masiva se verificó por e2e con el backend del arnés y las marcas del bundle desplegado.
- Individual: la recepción en tránsito del demo ofrece «Reimprimir etiqueta» (mismo camino que #220).
- PDFs: `etiquetas-lote-80.pdf` (lote, e2e) y los de 58/80 en `docs/qa/220-etiquetas/`.

