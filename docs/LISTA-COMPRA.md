# Lista de compra (#250 §11) — contrato

El papel que el **comprador** lleva al proveedor: código de la compra
(`COM-…`), recorrido/origen, comprador, proveedor y **productos agrupados con
cantidades y prioridades** (con el origen de la necesidad: venta sin stock, bajo
reposición…), más los IMEI cargados/pendientes y el QR (o barras) del panel.
Hermana del comprobante de recepción y de la etiqueta del lote.

## 1. De dónde salen los datos

`GET /api/supply/purchases` (INV, F2) devuelve la compra con sus líneas. **Hoy
el listado no incluye** el nombre del producto ni la prioridad/origen de la
necesidad ni quién compró: quien imprime los pasa desde el panel:

```js
datosListaCompra(compra, {
  productos,    // catálogo por id: { id, name, capacity, color }
  necesidades,  // necesidad por id: { id, priority, source, promisedAt, orderNumber }
  comprador,    // nombre (o `compra.createdBy.name` si la API lo trae)
  origen,       // punto de partida del recorrido (p. ej. 'CDE')
  recorrido,    // recorrido ya armado (p. ej. 'CDE → Asunción')
  emisor, enlace, ahora,
})
```

- **Agrupación**: por producto **y condición** (nunca se mezclan variantes); las
  cantidades se suman, la **prioridad más alta** manda y el orden de la lista es
  Urgente → Alta → Normal → Baja y, a igual prioridad, por cantidad.
- **Prioridades** (`NECESIDAD_PRIORIDADES` de INV): `BAJA · NORMAL · ALTA ·
  URGENTE`. **Orígenes** (`NECESIDAD_ORIGEN_LABEL`): venta sin stock, reserva
  sin stock, cantidad mayor al stock, bajo punto de reposición, pedido
  comprometido, carga manual; una línea sin necesidad es **reposición libre**.
- **IMEI**: por línea, `conImei`/`pendientes` (los seriales cargados hasta ahora).
- **Sin datos no se inventa**: sin prioridad la línea no muestra chip; sin
  catálogo cae al id del producto.

### Pedido a INV (coordinación)

Para que el panel no tenga que cruzar nada, el `GET /api/supply/purchases`
debería sumar en cada línea: `product { name, capacity, color }`,
`priority`, `source`, `promisedAt` y `order { orderNumber }`, más
`createdBy { name }` en la compra. El builder **ya acepta las dos formas** (lo
plano en la línea o el mapa `necesidades`): cuando la API lo traiga, el panel
puede dejar de pasar los mapas sin tocar el impreso.

## 2. Cómo se imprime

| Camino | Función | Salida |
| --- | --- | --- |
| Térmica directa (agente) | `ticketListaCompra(datos, { ancho })` en `tickets.js` | ESC/POS 80/58 mm con casillero `[ ]` por línea |
| Diálogo / PDF | `buildListaCompraHtml(datos, { format })` y `printListaCompra` en `OrderReceipt.jsx` | A4 (tabla con casillero ☐) y rollo 80/58 |
| Compartir imagen | `CompartirImagen` (objeto compartido, `docs/IMPRESION.md` §14) | PNG para WhatsApp/descarga |

- **QR**: solo con un `enlace` absoluto (regla dura: nunca un QR muerto); sin
  ruta pública cerrada el papel imprime el código `COM-…` en **barras** y la
  leyenda «Escaneá para abrir el panel de la compra.».
- Firma del **Compró / control** al pie; «Documento de control interno. No es
  comprobante fiscal.».
- El rollo reemplaza la flecha del recorrido por `->` (CP850 no la tiene).

## 3. Adopción del panel (pendiente de UI)

El panel de abastecimiento (CMP/INV) debe, en la compra:

1. Cargar la compra, el catálogo de productos y las necesidades involucradas.
2. Ofrecer «Imprimir lista» con `ticketListaCompra` (impresora del tipo
   `lista-compra`) y «Descargar PDF»/«Compartir imagen» con
   `buildListaCompraHtml` + `CompartirImagen`.
3. Pasar `enlace` cuando la ruta pública del panel esté disponible.

## 4. Evidencia y tests

- Unit `src/lib/printing/listaCompra.test.js` (6): agrupación por producto y
  condición, prioridad más alta, orígenes, prometida/pedido, IMEI, reposición
  libre, orden por prioridad, prioridad en la línea (API futura), compra vacía y
  ticket ESC/POS (barras sin enlace / QR con enlace).
- Ejemplo imprimible: `docs/lista-compra-ejemplo/` (A4, rollo 80, ESC/POS y la
  variante con QR — decodificado a `/envio/<token>`) y
  `scripts/ejemplo-lista-compra.mjs`.
- Reglas de impresión: `docs/IMPRESION.md` §12.
