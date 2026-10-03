# #332 · Inventario con dos vistas claras y conmutables

**Unidades (IMEI/serial)** y **Productos (stock)**, la misma sección con dos
vistas: se reusa el switch `VistaProductosUnidades` (#287) que ya vivía en cada
pantalla y el menú queda emparejado y evidente.

## Qué cambió (dominio POS)

- **Menú (PanelVendedor)**: las dos entradas del grupo Inventario ahora se leen
  como las dos vistas de la sección: **«Unidades (IMEI)»** → `/inventario/unidades`
  y **«Productos (stock)»** → `/productos` (deep links intactos, `ir()` resuelve
  las pestañas de sección como siempre).
- **Productos (SellerCatalog)**: el switch Productos ⇄ Unidades se muestra solo
  a quien puede abrir Unidades (dueño/gerencia). Antes el vendedor veía
  «Unidades» y al tocarlo la ruta protegida lo devolvía al POS.
- **Unidades (control/Inventario, dominio INV — sin tocar)**: mantiene su switch
  en escritorio. En móvil sigue oculto por diseño (#304) y las dos vistas se
  eligen desde el menú (el drawer muestra el par emparejado).

## Capturas (`docs/qa/332-inventario/`)

- `claro-01-unidades.jpg` / `oscuro-01-unidades.jpg` / `movil-01-unidades.jpg` —
  vista Unidades con IMEI, ubicación, estado y el switch (desktop).
- `claro-02-productos.jpg` / `oscuro-02-productos.jpg` / `movil-02-productos.jpg`
  — vista Productos con stock y el switch.
- `movil-03-menu.jpg` — el menú móvil con **Unidades (IMEI)** / **Productos (stock)**.

## Cómo se probó

- e2e `e2e/qa-332-inventario-vistas.spec.js`:
  1. dueño: `/inventario/unidades` → switch a **Productos** → `/productos` →
     switch a **Unidades** → vuelve; deep links directos siguen abriendo; el
     menú muestra el par emparejado.
  2. vendedor: `/productos` funciona **sin** el switch de Unidades y
     `/inventario/unidades` lo devuelve al POS (permisos intactos).
- Actualizados con los nuevos nombres del menú: `menu-ia`, `permissions` y
  `demo-imei-conciliacion` (este último recibe una unidad desde Inventario).
- Unit/e2e del panel en verde (`npm test` 947/947 · e2e afectado 20/20 · smoke).

Reproducir las capturas (demo del dueño):

```bash
npx vite --port 5216 --strictPort &
QA_BASE_URL=http://localhost:5216 QA_OUT=docs/qa/332-inventario \
  node scripts/qa-332-inventario.mjs
```
