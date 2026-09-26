# #251 · IA del menú principal nuevo (menú, Taller, entradas ocultas)

## El pedido

- Menú principal: **Inicio · Vender (POS, Pedidos, Cotizaciones) · Clientes ·
  Inventario (Productos, Unidades, Compras, Traslados y tránsito) · Operación
  (Delivery, Taller y garantías, Trade-In) · Finanzas · Análisis · Configuración**.
- **Promociones** y **Precios** dejan de ser entradas principales: viven dentro
  de Vender/Inventario, sin duplicar.
- **Servicio y Garantías** pasa a una sola sección **«Taller»** con pestañas
  internas.
- Rutas viejas y públicas siguen funcionando, pero no se muestran como navegación.
- Sumar las entradas que hoy no se ven: **`/ops`** (tablero real) para el dueño,
  **`/celulares`** y **`/comparador`** (lista por modelo y comparador), y dejar
  **`/garantias`** solo como pestaña de Taller.
- Coordinación con **PLT** (shell) y **DSN** (visual); e2e por rol + capturas.

## Qué cambió

- **`src/pages/PanelVendedor.jsx`**
  - `OWNER_NAV`: los 8 grupos del pedido. Promociones y Plantillas dentro de
    Vender; Precios, Lista por modelo (`celulares`) y Comparador dentro de
    Inventario; Autorizaciones y **Tablero de operaciones** (`ops`, gateado por
    el flag del rollout `VITE_OPS_V2`) dentro de Operación.
  - `SELLER_NAV`: mismo esqueleto con el subconjunto del rol (Vender con
    Promociones/Plantillas, Clientes, Inventario con Productos/Precios, Operación
    con Delivery/Trade-In). `TECNICO_NAV`: Operación → Taller y garantías.
  - `LABELS`: `resumen` → «Inicio», `servicio`/`garantias` → «Taller», `ops` →
    «Tablero de operaciones», `celulares` → «Lista por modelo».
  - `ir(id)`: resuelve un ítem que es pestaña de sección (Unidades/Traslados →
    `/inventario/<pestaña>`) y entra a `/ops` con navegación completa (el tablero
    vive fuera del panel, con su propio shell).
  - `active`: el ítem de menú manda cuando la vista es una de sus pestañas.
  - Configuración pierde la pestaña «Listas de precios» (era el duplicado de
    Precios); `Precios` se renderiza como vista propia y
    `/configuracion/precios` redirige a `/precios`.
- **`src/lib/rutas.js`**: `ops: '/ops'` como vista/ruta; alias `inicio` →
  `/resumen` (`src/App.jsx` monta `/inicio` → redirect).
- **`src/lib/metadataPolicy.js`** (+ test): `/resumen` → «Inicio», `/servicio` y
  `/garantias` → «Taller», `/ops` → «Tablero de operaciones».
- **`src/components/control/ServicioGarantias.jsx`**: la sección se llama
  «Taller» (comentario y nombre accesible de sus pestañas: «Ver taller o
  garantías»). Las pestañas internas quedan como estaban (renombrarlas es
  decisión de producto/DSN, ver #251).
- **`src/components/control/Documentacion.jsx`**: las ubicaciones de la guía
  interna apuntan al menú nuevo (módulos Vender/Taller/Inventario/Operación…).
- **`docs/REDISENO.md`**: la sección de navegación documenta la IA nueva.

## Reglas (para no volver a romperlo)

- **Promociones/Precios/Plantillas/Autorizaciones/Celulares/Comparador no son
  entradas principales**: viven dentro de su sección; su ruta sigue viva.
- **Taller** es una sección con pestañas internas; `/garantias` entra a su
  pestaña y no se muestra como navegación.
- El **tablero** (`/ops`) se abre desde Operación (dueño) con navegación
  completa; si el flag `VITE_OPS_V2=0` está apagado, el ítem no aparece.
- Los ítems del menú con `aria-label` son los que navegan; los toggles de grupo
  llevan `aria-expanded` (los e2e distinguen por eso).

## Evidencia

- e2e **`e2e/menu-ia.spec.js`** (4): los 8 grupos y sus contenidos; el tablero y
  las herramientas de precios desde el menú; Taller con pestañas y `/garantias`;
  rutas heredadas que abren su pantalla sin figurar en el menú.
- e2e por rol actualizados: `permissions` (vendedor: 4 grupos y solo sus
  módulos), `shell-roles` (técnico → «Taller»), `admin`, `auth`,
  `documentacion`, `demo-anonimo`, `demo-crm`, `demo-finanzas(-anonimo)`,
  `precios-listas`, `configuracion-lote5`.
- Capturas antes/después (sonda `scripts/qa-menu-ia.mjs`, 16 por carpeta en
  claro/oscuro y desktop/mobile):
  - `docs/qa/menu-ia/produccion-antes/` — producción v1.0.167: menú de 3 grupos
    (Operación · Stock y servicio · Negocio), «Resumen general» y «Servicio y
    Garantías»; el tablero ya existe por URL pero no en el menú.
  - `docs/qa/menu-ia/rama-menu-ia/` — la rama: los 8 grupos, Taller con
    pestañas (`Todo · Tablero · Servicio · Garantías`), `/ops` y el menú del
    vendedor (Vender · Clientes · Inventario · Operación), 0 errores de página.
  - Cada carpeta incluye `resultados.json` con la estructura leída del menú.

| Medición (sonda, dueño) | Antes (producción v1.0.167) | Después (rama) |
|---|---|---|
| Grupos del menú | Operación · Stock y servicio · Negocio | **Inicio · Vender · Clientes · Inventario · Operación · Finanzas · Análisis · Configuración** |
| Título del inicio | Resumen general | **Inicio** |
| Nav/título del taller | Servicio y Garantías | **Taller y garantías / Taller** |
| Menú del vendedor | Vender · Herramientas | **Vender · Clientes · Inventario · Operación** |
| Promociones y Precios | entradas principales | dentro de **Vender** e **Inventario** (sin duplicar) |
| Ocultos sumados | — | **Tablero de operaciones** (`/ops`, dueño), **Lista por modelo** (`/celulares`), **Comparador** |
| `/garantias` | ítem propio | **pestaña de Taller** (sin entrada de menú) |

## Decisiones y coordinación (#251)

- **PLT (shell)**: los grupos de un solo ítem repiten el texto en la cabecera;
  el toggle y el ítem comparten nombre accesible (dos botones «Clientes»); en
  Inventario una pestaña fuera del menú no resalta ningún ítem; `/ops` vive
  fuera del panel (navegación completa). Todo anotado en el issue para que PLT
  decida; no se tocó `AppShell` en esta entrega.
- **DSN (visual)**: rótulos de las pestañas del taller y la relación «Taller y
  garantías» (ítem) vs «Taller» (título), anotados en el issue.

## Verificación post-deploy en producción v1.0.172

Sonda `scripts/qa-menu-ia.mjs` contra `https://app.moboss.online` (demo pública,
4 variantes: claro/oscuro, desktop 1280 y mobile 390), **0 errores de página**:

| Criterio | Resultado en producción |
|---|---|
| Grupos del menú (dueño) | **Inicio · Vender · Clientes · Inventario · Operación · Finanzas · Análisis · Configuración** |
| Taller | sección «Taller» con pestañas `Todo · Tablero · Servicio · Garantías` |
| Tablero real | `/ops` abre «Tablero de operaciones» |
| Menú del vendedor | `Vender · Clientes · Inventario · Operación` |
| Rutas heredadas | siguen abriendo su pantalla (probadas por el e2e de la rama) |

Capturas y datos crudos: [`1.0.172-produccion/`](1.0.172-produccion/).

## Re-verificación post-.175 (26/09)

Misma sonda contra producción **v1.0.175** (4 variantes), ahora con las **tres
entradas que estaban ocultas**: los 8 grupos, Taller con pestañas, `/ops`
(«Tablero de operaciones»), **`/celulares` («Lista por modelo»)** y
**`/comparador` («Comparador»)** desde el menú, y el menú del vendedor; **0
errores de página**. Capturas y datos crudos:
[`1.0.175-produccion/`](1.0.175-produccion/) (incluye `03-tablero`,
`03b-celulares` y `03c-comparador`).

## Re-verificación post-.178 (26/09)

Producción **v1.0.178**, 4 variantes: los 8 grupos, Taller con pestañas, `/ops`,
`/celulares` y `/comparador` desde el menú, y el menú del vendedor; **0 errores
de página**. Capturas y datos crudos: [`1.0.178-produccion/`](1.0.178-produccion/).

## Cierre del menú en producción v1.0.178 (26/09)

Pasada de cierre con la sonda ampliada: además de los 8 grupos, Taller, `/ops`,
`/celulares` y `/comparador`, se verifica que **`/garantias` entra a Taller con la
pestaña «Garantías» activa** (sin entrada propia de menú), en 4 variantes y con
**0 errores de página**. Capturas y datos crudos:
[`1.0.178-menu/`](1.0.178-menu/) (`03d-garantias-taller`).

## Verificación final — producción v1.0.181

Pasada del **26/09**: los 8 grupos, Taller, `/ops`, `/celulares`, `/comparador` y
`/garantias` con su pestaña activa, en 4 variantes y con **0 errores de página**.
Capturas y datos crudos: [`1.0.181-produccion/`](1.0.181-produccion/).

## Verificación vigente — producción v1.0.182

Los 8 grupos, Taller, `/ops`, `/celulares`, `/comparador` y `/garantias` con su
pestaña activa, en 4 variantes y con **0 errores de página**. Capturas y datos
crudos: [`1.0.182-produccion/`](1.0.182-produccion/).
