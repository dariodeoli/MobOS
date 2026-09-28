# Cierre #285 · Tabla de Unidades: estructura final en una línea

La fila de Unidades quedó en **una sola línea** con la estructura pedida por
Dario: **Selección · Producto · IMEI · Verificación · Ubicación · Estado ·
Costo · Acciones**. El IMEI salió del bloque de producto a su columna,
«Verificado» pasó a **Verificación** (estado + verificador + fecha) y
**Proveedor** se retiró de la fila (el dato sigue en el detalle de la unidad).

## Qué cambió

- `src/components/control/Inventario.jsx`: `UNIDADES_GRID` (una sola constante
  para encabezado, filas y esqueleto), `EncabezadoUnidades` y `FilaUnidad`.
  - **IMEI** columna propia con `SerialTexto` (últimos 4 destacados).
  - **Verificación**: `OK <iniciales> · dd/mm/aaaa` (ej. `OK VPC · 01/09/2026`)
    con el botón de verificación de un clic al costado; «Sin verificar» cuando
    no hay registro. El texto ocupa el ancho libre para que el centro de la fila
    no caiga sobre una acción.
  - **Ubicación**: sucursal y depósito cuando corresponda («Sucursal E2E · D1»,
    el código del depósito si lo tiene; si no, su nombre).
  - **Estado**: Disponible · Reservado · En tránsito · Vendido (el badge del
    estado y sus avisos —garantía, reserva, consignación— siguen en la línea).
  - **Acciones**: 👁 ver detalles + **Editar** + menú `···`; las reservadas
    conservan «Finalizar venta» y las vendidas el **comprobante rápido** (sus
    acciones primarias de siempre).
  - **Proveedor** fuera de la fila (sigue en el detalle; ver handover).
  - `data-testid="inventario-tabla"` en el contenedor (regla de `docs/TABLAS.md`).
- Los porcentajes pedidos (3/28/16/18/9/10/7/9) se tradujeron a `fr` de las
  columnas flexibles con los **mínimos reales de contenido** de la grilla
  (`docs/TABLAS.md`: acciones 8–15 rem, serial 6.75–7.25 rem, etc.). La
  selección conserva los 44 px del target táctil de #249.

## Medición (sin scroll en desktop)

`scrollWidth/clienteWidth` del contenedor y ancho de cada columna
(`despues-mediciones.json`; el «antes» sale del mismo spec con `QA_285_ANTES=1`):

| Vista | Antes (columna) | Contenedor antes | Después | Contenedor después |
|---|---|---|---|---|
| 1280 | 1012 / 978 *(scroll 34 px)* | desbordaba | **978 / 978** | sin scroll |
| 1440 | 1138 / 1138 | sin scroll | **1138 / 1138** | sin scroll |
| 390 | — | — | scroll **dentro** de la caja | página sin desborde |

Anchos finales (1280 → 1440): Selección 44 → 44 · Producto 209 → 272 ·
IMEI 119 → 155 · Verificación 134 → 175 · Ubicación 67 → 87 · Estado 108 → 108 ·
Costo 96 → 96 · Acciones 116 → 116. **Alto de fila: 44 px** (una línea;
antes 46 px) en los cuatro escenarios claro/oscuro.

## Capturas

`docs/qa/285-unidades/` — antes y después en **1280** y **1440**, **claro** y
**oscuro** (`{antes,despues}-unidades-{1280,1440}-{light,dark}.png`) + mobile
390 (`-390-mobile.png`) + `{antes,despues}-mediciones.json`.

## Verificaciones

- `npm run lint` **0 errores** (2 warnings preexistentes: `Precios.jsx` y el
  `eslint-disable` sin uso de `Inventario.jsx`).
- `npm run build` ✓ · `npm --prefix backend run build` ✓ con
  `backend/.next/BUILD_ID` · `prisma:validate` ✓.
- `npm test` **853/853** · `npm --prefix backend run test:unit` **133/133**.
- `rg "<<<<<<<" src backend e2e` sin resultados.
- e2e: `qa-285-unidades` **2/2** (estructura, alto ≤48, sin scroll 1280/1440,
  claro/oscuro, mobile) · `inventario-unidades` **14/14** ·
  `inventario-tabla-encabezado` **4/4** · barrido `admin`, `qa-249-inventario-touch`,
  `qa-257-inventario-pos`, `etiquetas-unidad`, `vendidos-comprobante-rapido`,
  `dsn-responsive-mobile`, `qa-256-composicion`, `qa-140-inventario`,
  `inventario-importacion` y `kardex-producto` → **65 en verde**.
- Ajustes de specs por la estructura nueva: `admin.spec.js` (Verificación +
  IMEI), `inventario-unidades.spec.js` (fecha `dd/mm/aaaa`) y
  `inventario-tabla-encabezado.spec.js` (títulos nuevos y Proveedor fuera).

> Nota: `dsn-responsive-mobile` › «demo: 360/390/414 + tablet» falla en la base
> v1.0.201 por targets < 44 en la cáscara de demo/login (#282, ajena a esta
> tabla); se verificó el mismo fallo con este cambio fuera del árbol.
