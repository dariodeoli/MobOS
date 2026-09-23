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

## Demo: borradores simulados ✅ (cerrado en rama)

Los borradores de la demo viven en el navegador (`src/lib/borradoresDemo.js`,
`localStorage`), con el mismo payload que arma el POS para el servidor. En la
demo se puede **suspender, listar, retomar y descartar** sin tocar el API:

- `FormularioVenta`: `abrirSuspendidas` lista el store local; `suspenderVenta`
  guarda local (con dueño `userId`), limpia el carrito y avisa; `recuperar` y
  `descartar` trabajan sobre el store; el aviso de "no se simulan" se retiró.
- El panel del enlace público avisa «En la demo el enlace público no se genera».
- Los textos del diálogo y de la lista distinguen demo (navegador) de producción
  (servidor de la sucursal).
- **Evidencia**: e2e `demo-anonimo` «demo: el borrador del POS se suspende, se
  lista, se retoma y se descarta» (sin llamadas al API), corrida completa de
  demo + POS en verde (37) y smoke 7.
