# Rediseño integral del panel — plan por fases

Autorizado por Dario el 17-09-2026. Base visual: `/pos/cargar`. Referencia:
Google Stitch, proyecto 6933476157035245987. Reglas canónicas: `Reglas de
diseño de aplicaciones` (Segundo Cerebro). El rediseño **no** cambia reglas de
negocio, permisos ni datos; solo presentación, navegación y componentes.

## Fase 0 — Inventario (completado 17-09-2026)

### Roles
`ADMIN` (dueño), `GERENTE`, `VENDEDOR`, `CAJERA`, `TECNICO` (catálogo en
`src/lib/roles.js`, con dominios y descripciones).

### Rutas (16)
Públicas: `/demo`, `/login`, `/restablecer-contrasena`, `/aceptar-invitacion/:token?`,
`/verificar-correo`, `/pedido/:token`, `/p/:token`, `/garantia/:token`, `/trade-in`,
`/comparar`, `/celulares`, `/status`, `/` (landing). Interna: `/pos/*`
(PanelVendedor, con `/:vista` opcional y subpáginas de Configuración con slug).

### Navegación (`src/pages/PanelVendedor.jsx`)
- `OWNER_NAV`: Operación (cargar, pedidos, clientes, promociones, cotizaciones) ·
  Stock y servicio (inventario, productos, compras, trade-in, servicio, garantías,
  autorizaciones) · Negocio (resumen, análisis, finanzas, configuración).
- `SELLER_NAV`: Vender (cargar, pedidos, clientes) · Herramientas (productos,
  promociones, trade-in, cotizaciones).
- `TECNICO_NAV`: Taller (servicio técnico).
- Barras inferiores móvil: `SELLER_BOTTOM` / `OWNER_BOTTOM`.
- Pantalla inicial por rol ya resuelta: dueño → `/pos/resumen`, vendedor → `/pos/cargar`.

### Componentes compartidos (`src/components/ui/index.jsx`)
Shell (AppShell), primitivas (Card, Button, Modal, Input, Select, Badge,
MoneyInput, PinInput, EmptyState, DataTable, Drawer, Subtabs, useToast…),
footer de versión, temas claro/oscuro por tokens CSS (`--c-*`).

### Diagnóstico
- Sin `alert()`/`confirm()` nativos (verificado; ConfirmDialog y toasts propios).
- Menú ya está unificado (POS y control en un solo shell).
- Oportunidades detectadas para los lotes: jerarquía visual del topbar (identidad
  de tienda/persona duplicada entre sidebar y pantallas), espaciado inconsistente
  entre tarjetas (space-y-5 vs space-y-4), tablas que desbordan en tablet
  (min-w-[640px] sin estrategia de tarjeta en todas), y subtabs repetidos en
  Finanzas/Configuración que podrían ser navegación contextual.

## Lotes de migración (cada lote: QA responsive + pruebas por rol)

1. **Shell y topbar**: unificar identidad de tienda/persona, breadcrumb de
   sección, estados vacíos consistentes y atajos visibles.
2. **Resumen (dashboard)**: jerarquía de métricas, pendientes de hoy, accesos
   rápidos — prototipo sobre el diseño actual de `/pos/cargar`.
3. **POS (`/pos/cargar`)**: mantener la base visual (es la referencia), pulir
   pasos y pagos para tablet.
4. **Inventario**: tarjetas por estado en vez de filas anchas, acciones en
   viewport, búsqueda global.
5. **Configuración/Equipo**: subpáginas con slug (ya parcial), formularios en
   panel derecho en escritorio.
6. **Resto de pantallas** (Clientes, Compras, Garantías, Finanzas, Reportes):
   migración por lotes de a dos, usando los componentes centrales.

## Criterios de aceptación por lote
- Sin scroll horizontal en 360px/768px/1440px.
- Sin acciones importantes fuera del viewport inicial.
- Sin diálogos nativos del navegador.
- Tokens de tema (claro/oscuro) respetados en cada pantalla nueva.
- Permisos y datos intactos: cada lote corre lint, tests y el harness completo.
