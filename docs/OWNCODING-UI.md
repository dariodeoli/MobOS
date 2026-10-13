# owncoding-ui en MobOS

Versión fijada: **v0.68.1** (tarball de GitHub en `package.json`, integridad en `package-lock.json`).
La biblioteca declara `node >=24.15 <25`; con Node 25 la instalación pide `--engine-strict=false`.

## Formularios pro: no activado

Desde v0.68.0 los formularios premium (`FormulariosPro`, `data-oc-formularios="pro"`) son opt-in.
MobOS **no** lo activa: los campos se ven como en la ola 1. Activarlo es una decisión de producto
aparte (cambia `Label`, `Select`, `Checkbox`, `Switch` y `SegmentedField`).

## Adoptado en la actualización

- `imeiValido` (`src/lib/imeiComprobante.js`) delega en `owncoding-ui/utils`. La equivalencia con la
  regla local anterior (15 dígitos + Luhn) está probada en `src/lib/imeiEquivalencia.test.js`.

## Evaluado y no adoptado (la API no encaja)

- `BancoCombobox`: el catálogo de la biblioteca tiene 32 nombres distintos a los 22 de
  `bancos-paraguay.js` (se guardan en cuentas de cobro) y su mapa de logos asigna el de Ueno a
  «Financiera El Comercio» y el de Zeta a «Financiera Finexpar». Cambiarlo altera datos guardados.
- `BuscadorProveedor` (`SupplierCombobox`): no tiene texto libre (`onLibre`), confirmación al salir
  del campo ni `confirmarAlTipear`, que usan Compras, PorComprar y la recepción de Inventario.
  Su alta es `onCreate` asíncrono contra el servidor, no el flujo «proveedor nuevo» de Compras.
- `ConfirmarConPalabra` (`DialogoDestructivo`): es un panel en línea sin `Modal`, sin contraseña de
  empresa y sin la guarda `dirty` que exige `modalReglas.test.js`.
- `ImeiField`: `ImeiVerificacionModal` no captura IMEI (solo valida el recibido). El campo de la
  landing acepta espacios hasta 19 caracteres y valida al enviar con otros mensajes; `ImeiField`
  recorta a 15 dígitos y valida en vivo, lo que cambia el comportamiento.
