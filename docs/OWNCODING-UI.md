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

## Un solo objeto por tipo de dato

Cada dato tiene un único componente en `src/components/shared`; los sitios de uso no arman inputs propios
y un cambio futuro se hace en un solo lugar (lo exige `src/lib/camposReglas.test.js`):

- **Ciudad**: `CityAutocomplete` (adaptador sobre `owncoding-ui/CityAutocomplete`). Se usa en POS/checkout,
  clientes (alta y ficha), proveedores, sucursales, empresa y datos privados. En demo (prop `esDemo` o
  sesión demo) usa el catálogo de ciudades de Paraguay de la biblioteca: sugiere y completa el
  departamento sin llamar al API. En real sigue consultando `/api/geo/cities`. El valor guardado es el
  nombre de la ciudad (string).
- **Teléfono**, **correo**, **búsqueda**, **estado (chip)**: puentes `PhoneField`, `EmailField`,
  `SearchField`, `ChipEstado` que reexportan la biblioteca.
- **RUC/CI**: `RucField` (adaptador: consulta real o simulada en demo, `lookupDemoRuc`) con su consulta
  en `rucLookup.js` y `demoRuc.js`.
- **Medio de pago**: `MedioPago` con `conNombre` muestra logo y nombre (resumen «Cómo te pagaron»).

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
- `Avatar`, `PersonaChip`, `PasosEquipo`, `BancoLogo` (deuda declarada en `camposReglas.test.js`): la
  biblioteca usa `nombre`/`src`/`tamano` y la app resuelve identidad desde un `user`; cambiarlos obliga a
  tocar todos los sitios de uso.
- `StatusChip` (local): resuelve etiqueta y tono desde `lib/estados.js` con familia de texto `*-text`
  (contraste >= 4.5) y sin ícono; `ChipEstado` de la biblioteca usa otro catálogo de estados e ícono.
