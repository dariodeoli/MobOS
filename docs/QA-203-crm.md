# Cierre #203 — comprobante de verificación de IMEI (punta a punta)

Verificado de punta a punta con e2e headless contra el arnés local (adaptador
IMEIcheck en modo mock: no hay consultas pagas) y en el demo público.

## Recorrido verificado (real)

`e2e/admin.spec.js` → `IMEI: comprobante adjunto al cliente y visible en su portal`

1. Cliente nuevo + **producto con IMEI válido (Luhn)** + unidad de inventario + **venta** con ese IMEI.
2. **Verificación** del IMEI por el adaptador (mock) y apertura de la ficha → Pedidos → **Verificación IMEI**:
   - el modal muestra **“IMEI verificado: sin reportes al <fecha>”**, **fuente IMEIcheck.net** y el IMEI **enmascarado**;
   - **sin** aviso de simulada (consulta real del adaptador); sin costos ni respuesta cruda.
   - Captura: `qa203-modal-real.png`.
3. **Adjuntar**: al **comentario interno** y a la **nota pública** (ambos con confirmación).
   Captura: `qa203-ficha.png`.
4. **Compartir / niveles** (payload público `GET /api/portal/:token`):
   - **nivel completo**: la nota pública lleva el comprobante (`IMEI verificado` + `IMEIcheck.net`) y expone además garantías/direcciones;
   - **nivel rápido**: la nota pública viaja igual (regla #127) y **no** expone direcciones;
   - un **comentario interno** con marca propia (`IMEI-INTERNO-…`) **no aparece en ningún nivel** (privacidad intacta);
   - el costo interno de la venta (`700000`) tampoco viaja.
5. **Página pública** (`/cuenta/<token>`): “Nota de la tienda” con el comprobante visible.
   Captura: `qa203-portal.png`.
6. **Imprimible**: el modal ofrece **Imprimir comprobante** (ticket 80 mm y respaldo A4 por diálogo) con estado, fecha, fuente y la aclaración de comprobante informativo.

## Recorrido verificado (demo)

`e2e/auth.spec.js` → `demo: ficha con deuda, cronología, seguro, portal y servicio`

- La verificación se **simula** y el modal muestra **“Simulada en demo”** + el detalle ficticio.
- **Adjuntar** agrega el comentario local (sin API).
- **Imprimir** avisa: *“Datos ficticios de demostración: la impresión no está disponible en el demo.”*
- Cero llamadas a `/api/imei` durante el recorrido (el e2e lo afirma).
  Captura: `qa203-demo-imei.png`.

## Fixes

Ninguno: el flujo funcionó de punta a punta. Se agregaron las dos regresiones e2e
(real y demo) y sus capturas.
