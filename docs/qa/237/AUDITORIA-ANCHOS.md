# Auditoría de anchos de modales (#237)

Pedido de Dario: los modales/popups tienen que tener un ancho máximo consistente
en toda la app. Antes cada uso pasaba su propio `max-w-*` y quedaba desparejo
(unos `sm`, otros `2xl`, otros sin ancho con el predeterminado viejo de
`max-w-lg`), con franjas vacías en los anchos grandes.

## Estándar

El ancho vive en el objeto compartido (`src/components/shared/modal.js`) y se
elige con `size`:

| `size` | Ancho | Para qué | Casos |
| --- | --- | --- | --- |
| `corto` | `max-w-md` (28rem) | Avisos, confirmaciones y formularios de un campo | 18 |
| `formulario` (predeterminado) | `max-w-xl` (36rem) | Formularios de una columna | 52 |
| `amplio` | `max-w-3xl` (48rem) | Formularios de dos columnas, tablas y contenido amplio | 25 |
| `completo` | `max-w-5xl` (64rem) | Editores y pantallas grandes | 2 |

Total auditado: **97 modales**. El `ConfirmDialog` compartido usa `corto`.

## Antes → después

- **Antes:** 67 de 97 modales declaraban su ancho a mano (`max-w-sm`, `lg`,
  `xl`, `2xl`, `3xl`, `4xl`, `5xl`) y los 30 sin ancho usaban el
  predeterminado viejo `max-w-lg` (más angosto que un formulario `xl`): la
  misma pantalla podía abrir modales de 24rem a 56rem sin criterio.
- **Después:** 0 anchos sueltos. `node scripts/auditoria-modales.mjs` informa
  `con tamaño estándar: 97 · a migrar: 0` y el test
  `src/lib/modalReglas.test.js` falla si vuelve un `max-w-*` en un `<Modal>`.

## Franjas vacías

- `Nueva lista de precios` (Precios): el nombre quedaba en una columna angosta
  dentro de un modal `amplio`; ahora el nombre y el interruptor "Lista activa"
  van en `GRILLA_DOS_COLUMNAS`.
- Los modales `amplio`/`completo` restantes ya usaban grillas de dos columnas,
  filas de tabla o listas a lo ancho (Proveedores, Crear cliente, Servicios,
  Plantillas de WhatsApp, Combos, Etiquetas de góndola, Kardex, Importar).

## Capturas antes/después

En `docs/qa/237/` (`QA237_FASE=antes|despues`) y sus anchos medidos en
`anchos-antes.json`:

| Caso | Antes | Después |
| --- | --- | --- |
| Búsqueda global | `max-w-2xl` (672) | `amplio` (768) |
| Notificaciones | `max-w-lg` (512) | `formulario` (576) |
| Nuevo conteo | sin ancho (512) | `formulario` (576) |
| Cambiar sucursal | `max-w-md` (448) | `corto` (448) |
| Proveedores | `max-w-2xl` (672) | `amplio` (768) |
| Crear cliente | `max-w-2xl` (672) | `amplio` (768) |
| Ficha del cliente | `max-w-2xl` (672) | `amplio` (768) |

La spec `e2e/modales-tamanos.spec.js` mide el ancho renderizado de cada modal
(1440×900) y exige el ancho del estándar en la fase `despues`.
