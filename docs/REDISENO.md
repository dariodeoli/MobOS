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

### Lote 1 — Shell y topbar (implementado 20-09-2026)

- **Una sola identidad de tienda:** nombre de la tienda en la barra lateral
  (escritorio) y en el encabezado del menú (pantallas chicas); la rama/sucursal
  sigue en el selector del topbar. Se quitó el nombre del producto duplicado en
  la cabecera.
- **Una sola identidad de persona:** el pie de la barra/menú muestra a la
  persona de la sesión con el objeto `Avatar` (foto subida → foto de Google →
  iniciales); la foto de Google se pasa solo cuando quien opera es el dueño.
- **Topbar con miga de sección:** `Subpágina / Pestaña` (p. ej. Inventario /
  Unidades, Configuración / Equipo) y un único `h1` con la vista activa. En las
  subpáginas el título es la pestaña, no el nombre del padre.
- **Acciones importantes a la vista:** la acción primaria de cada vista
  (Cargar venta / Rendir) queda en el topbar; en escritorio se suma un botón de
  búsqueda global (Ctrl+K). En pantallas chicas las acciones secundarias (buscar,
  tema, atajos, salir) encabezan el menú, que ya es el patrón móvil del shell.
- **Densidad por breakpoint:** el topbar no desborda porque prioriza: sucursal y
  acción primaria siempre; búsqueda y presencia desde `lg`; fecha desde `xl`.
  Cada pantalla del lote se midió a 360/768/1024/1440.
- **Estados de la búsqueda global:** pista de mínimo de caracteres y aviso de
  sin conexión con el mismo formato; “Sin resultados” con `EmptyState` y atajos
  de teclado visibles al pie.
- **Sin cambios de lógica:** permisos, datos, navegación y atajos intactos;
  solo presentación y estructura visual. Reglas fijadas por aserción de fuente
  en `src/lib/disenoReglas.test.js`.

Pendientes detectados para lotes siguientes (fuera del Lote 1): `PanelVendedor`
tiene la paleta “Ir a…” sin disparador y que duplica la búsqueda global;
`Celulares`, `Comparador` y `TradeIn` (internas del dueño) conservan cabecera
propia fuera del shell.

> **Resuelto en #179:** `PanelDelivery` ya está ruteado (`/delivery/repartos` y
> `/delivery/rendiciones`), su cuerpo no repite identidad y el repartidor cae en
> su panel (no en el POS).

### Lote 2 — Resumen (implementado 21-09-2026)

- **Jerarquía de métricas:** el facturado del período es el número principal, en
  la tarjeta verde con la estética del total de venta de `/pos/cargar`, con la
  variación contra el período anterior; adentro vive el cobrado vs pendiente con
  su barra y el acceso a los pendientes del detalle.
- **Métricas secundarias** (Ventas, Ticket promedio, Comisiones) en una fila de
  tarjetas, un escalón abajo del facturado.
- **Pendientes de hoy** arriba de todo y en formato accionable: cada pendiente
  lleva a su pantalla (reservas, garantías, cuotas); con todo al día se muestra
  el estado en verde en lugar de desaparecer.
- **Accesos rápidos** en tarjeta propia junto al facturado (Cargar venta, Nueva
  compra, Abrir caja, Ver pedidos); el período queda al lado del encabezado y
  “Imprimir resumen” vive en esa tarjeta.
- Se retira la tarjeta “Cobrado vs pendiente” duplicada (su contenido pasó al
  hero) y el enlace suelto “Ver pedidos”.
- Sin cambios de lógica, permisos ni datos: mismos cálculos (`armarResumenDia`),
  mismas llamadas y mismas rutas; solo presentación.


### Lote 5 — Configuración y Equipo (implementado 21-09-2026)

- **Subpáginas con slug, ordenadas por grupo:** `/configuracion/<slug>` queda
  estable para las 11 pestañas (equipo, identidad, roles, negocio, precios,
  sucursales, seguridad, historial, impresoras, documentación, sistema) y el
  orden de la lista sigue a los grupos visibles (Personas, Negocio, Seguridad,
  Sistema). `/configuracion` entra por Equipo.
- **Formularios en panel derecho (escritorio):** nuevo objeto compartido
  `shared/PanelDerecho` (dos columnas desde `lg`, panel fijo con `sticky`; en
  móvil/tablet el panel se apila debajo). Se aplica en Equipo (alta de
  integrante por correo o directo), Sucursales (alta/edición), Negocio (datos de
  la tienda) e Identidad (nombre del vendedor). Los diálogos por fila (PIN,
  horario, permisos, historial) siguen siendo modales.
- **Densidad y biblioteca (#147):** se usan los objetos canónicos (`FormField`,
  `SearchField` en Documentación, `PhoneField`, `CityAutocomplete`,
  `InstagramField`, `RucField`, `PercentField`, `Toggle`, `Avatar`), se
  etiquetaron los campos que solo tenían placeholder y se unificó el bloque de
  límites de autorización (estaba duplicado).
- **Sin scroll horizontal:** cada subpágina se midió a 360/768/1440
  (`e2e/configuracion-lote5.spec.js`), con el panel del formulario en la mitad
  derecha a 1440 y apilado con botón de acceso a 360.
- **Sin cambios de lógica:** mismos endpoints, validaciones, permisos y datos;
  solo layout, etiquetas y reutilización de objetos.

## F4 · Vista previa v2 (en curso)

El rollout del lenguaje v2 por dominio —shell, pedidos, clientes, finanzas,
servicio, resumen/análisis, compras, configuración, inventario, públicas, el
tablero operativo y el modo taller/rack— está **activo**: el v2 es el diseño por
defecto desde el 24-09 y cada pantalla nueva se entrega con capturas claro/oscuro/mobile y
medición AA. La salida de emergencia por dispositivo sigue siendo
`localStorage['mobos:tema-v2'] = '0'` (`VITE_OPS_V2=0` apaga el tablero). El
paquete de aprobación es [`rediseno/PAQUETE-F4.md`](rediseno/PAQUETE-F4.md) y el
detalle con capturas y medición, [`rediseno/F4-DOMINIOS.md`](rediseno/F4-DOMINIOS.md).

**Actualización 25/09/2026:** el mock navegable `/rediseno-f3` se retiró —el v2
es el diseño real— y el alcance/capturas de F3 quedan en `rediseno/` como
historial.

## Criterios de aceptación por lote
- Sin scroll horizontal en 360px/768px/1440px.
- Sin acciones importantes fuera del viewport inicial.
- Sin diálogos nativos del navegador.
- Tokens de tema (claro/oscuro) respetados en cada pantalla nueva.
- Permisos y datos intactos: cada lote corre lint, tests y el harness completo.
