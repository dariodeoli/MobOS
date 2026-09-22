# Épica #148 §20 — borradores y envío del carrito: estado y próximo paso

## Entregado y verificado (en main, sin cambios pendientes)

- **Borradores**: suspender con etiqueta, listar, retomar (vuelve el carrito completo con
  descuento), vaciar y descartar.
- **Aviso de disponibilidad al retomar** (productos sin stock): `FormularioVenta` L328.
- **Enlace público sin auth** del borrador (token de 64 hex, solo sha256 en la base, se
  muestra una vez) con acciones **Copiar**, **Enviar por WhatsApp** (`wa.me` con el texto
  del cliente y el enlace) y **Enviar por correo** (`mailto:` con asunto y cuerpo).
- **Página pública** `/carrito/<token>`: productos, precios, descuentos, subtotal, total,
  condiciones y botón **«Checkout — [monto]»**.
- **Evidencia**: `e2e/pos-qa-173.spec.js` (3 passed, incluye «el borrador con enlace
  público se abre sin sesión y muestra el carrito») y el pase del carrito (22 passed + smoke 7).

## Próximo paso mínimo (demo): simular borradores

En la demo los borradores se avisan pero no se simulan. Implementación propuesta (aislada,
sin tocar el camino API):

1. `src/lib/borradoresDemo.js`: store en `localStorage` (`listar`, `guardar`, `borrar`) con
   el mismo payload que `suspenderVenta` ya arma (`items`, `customer`, `descuento`, `pagos`,
   `entrega`, `montoDelivery`, `observacion`).
2. `FormularioVenta`:
   - `abrirSuspender` (L1314): quitar el aviso y abrir el diálogo también en demo.
   - `suspenderVenta` (L1325): rama `esDemo` → guardar local + limpiar carrito + `setAvisoSuspension`.
   - `abrirSuspendidas` (L1292) y el listado del modal: rama `esDemo` → `listar()` local.
   - Retomar/descartar del modal: ramas `esDemo` → `borrar()` local (mismo payload de retome).
3. Panel de enlace: en demo, mostrar la nota «En la demo el enlace público no se genera»
   (el resto del panel ya es genérico).
4. e2e: un test en `pos-checkout`/`pos-qa-173` que en demo cree, liste, retome y descarte.

**Riesgo controlado**: los cuatro puntos son ramas `esDemo` sobre código existente; se corre
`npm run build` + `pos-checkout` + smoke antes de commitear.
