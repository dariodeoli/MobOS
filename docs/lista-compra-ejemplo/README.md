# Ejemplo de la lista de compra (#250 · Fase 2 §11)

Muestra imprimible de la lista que el comprador lleva al proveedor: código
`COM-CDE-0048`, recorrido **CDE → Casa Central**, comprador, proveedor,
productos **agrupados con cantidades y prioridades** (Urgente/Alta/Normal, con
su origen: venta sin stock, bajo reposición…), prometidas y pedidos, IMEI
cargados/pendientes y el panel con barras o QR. Los documentos los genera el
mismo código que usará el panel (`src/lib/printing/listaCompra.js`,
`tickets.js` y `OrderReceipt.jsx`).

## Archivos

| Archivo | Qué es |
| --- | --- |
| `lista-compra-a4.pdf` / `.jpg` | La hoja A4: tabla con casillero ☐ por línea, prioridad/contexto, IMEI y totales. |
| `lista-compra-80mm.pdf` / `.jpg` | El mismo documento en rollo de 80 mm (el HTML que usa «Descargar PDF»). |
| `lista-compra-80mm-escpos.pdf` / `.jpg` | Lo que recibe la impresora térmica (ESC/POS, con `[ ]` por línea). |
| `lista-compra-a4-con-enlace.pdf` / `.jpg` | Muestra del contrato **con enlace público**: el QR al panel en lugar del código en barras. |
| `qr-panel.png` | El QR de la variante con enlace (verificado con Vision → `/envio/ENV-CDE-ASU-0021`). |
| `datos-ejemplo.json` | Las líneas, prioridades y totales usados. |

La compra del ejemplo: 2 × iPhone 15 Pro Max seminuevo (**Urgente** · venta sin
stock · pedido PV-000123), 5 × AirPods Pro 2 (**Alta** · reserva sin stock ·
pedido PV-000131), 10 × cable USB-C (reposición libre) y los IMEI ya cargados.
El contrato completo (qué pasa el panel, el pedido a INV y la adopción) está en
[docs/LISTA-COMPRA.md](../LISTA-COMPRA.md).

## Regenerar

```bash
npx vite --port 5279 --strictPort --host 127.0.0.1 &
QA_BASE_URL=http://127.0.0.1:5279 node scripts/ejemplo-lista-compra.mjs
```
