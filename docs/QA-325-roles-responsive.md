# QA #325 — Responsive móvil y roles secundarios

Origen: auditoría del demo v1.0.209 (issue #325). Este documento registra el
recorrido E2E de los siete puntos pendientes, por rol y con evidencia en
claro, oscuro y móvil, más los fixes de diseño/responsive que salieron de la
medición.

## Método

- **Spec**: `e2e/qa-325-roles-movil.spec.js` (proyecto `admin`, arnés real:
  API + Vite + Postgres sembrado; sin modo demo).
- **Superficies y estados**: 1440×900 (claro), 390×844 (claro) y 390×844
  (oscuro), con el detalle o el modal de cada punto abierto.
- **Medición** (criterio #249): scroll horizontal del documento, elementos
  visibles cortados por el viewport (fuera de contenedores con scroll propio)
  y targets con área táctil efectiva < 44 px. Gate de esta pasada: scroll 0 y
  cortes 0 en todos los anchos; en mobile, además, 0 targets chicos.
- **Evidencia**: `docs/qa/325-roles-responsive/` (capturas por superficie en
  claro/oscuro/móvil + `auditoria-*.json` con la medición cruda).
- **Corrida**:

```bash
MOBOS_E2E_PGDATA=/tmp/mobos-e2e-pg-MOS-DSN MOBOS_E2E_PGPORT=5503 \
  MOBOS_E2E_API_PORT=3103 MOBOS_E2E_WEB_PORT=5203 \
  npx playwright test e2e/qa-325-roles-movil.spec.js --project=admin
```

Resultado final: **6/6 tests en verde** (sin reintentos), con la medición de
todas las superficies en **0 scroll / 0 cortes / 0 targets < 44 en mobile**.

## Punto 6 — Roles secundarios

Cada rol se crea/entra con su propio PIN, aterriza en su puerta, muestra su
menú y sus rutas prohibidas redirigen sin quedar colgado (probado también en
móvil).

| Rol | Puerta | Menú verificado | Límites verificados |
|---|---|---|---|
| **Vendedor** | `/pos` | POS · Mis pedidos · Clientes · Productos · Cotizaciones | `/inventario/unidades` y `/finanzas/caja` redirigen a `/pos` |
| **Gerente** | `/pos` | POS · Mis pedidos · Clientes · Productos · Precios | No ve Inicio/Finanzas/Configuración/Unidades; `/finanzas/caja` y `/configuracion/equipo` redirigen a `/pos` |
| **Técnico** | `/servicio` (Taller) | Taller y garantías | No ve POS ni Clientes; `/pos` y `/clientes` redirigen a `/servicio` |
| **Delivery** | `/delivery/repartos` | Mis repartos · Rendiciones | No ve POS; `/pos` redirige a `/delivery/repartos` |

Capturas: `rol-vendedor-*`, `rol-gerente-*`, `rol-tecnico-*`, `rol-delivery-*`
(entrada y páginas de cada rol, en escritorio, móvil y oscuro).

## Puntos 1–5 — Superficies verificadas

| Punto | Superficie | Ruta / estado | Capturas | Scroll / cortes | Targets < 44 mobile |
|---|---|---|---|---|---|
| 1 | Ficha de cliente | `/clientes` → fila → «Cliente: …» | claro · móvil · oscuro | 0 / 0 | 0 |
| 1 | Detalle de pedido | `/pedidos` → fila → detalle | claro · móvil · oscuro | 0 / 0 | 0 |
| 1 | Detalle de producto + Kardex | `/productos` → fila → «Kardex» | claro · móvil · oscuro | 0 / 0 | 0 |
| 2 | Kardex (movimientos y saldo) | dentro del detalle de producto | claro · móvil · oscuro | 0 / 0 | 0 |
| 2 | Precios | `/precios` | claro · móvil · oscuro | 0 / 0 | 0 |
| 2 | Importación de productos | `/productos` → «Importar productos» | claro · móvil · oscuro | 0 / 0 | 0 |
| 2 | Garantías y taller | `/servicio` | claro · móvil · oscuro | 0 / 0 | 0 |
| 3 | Modal crear | `/clientes` → «+ Crear cliente» | claro · móvil · oscuro | 0 / 0 | 0 |
| 3 | Modal editar | `/productos` → «Editar» | claro · móvil · oscuro | 0 / 0 | 0 |
| 3 | Modal recibir | `/inventario/unidades` → «+ Recibir unidad» | claro · móvil · oscuro | 0 / 0 | 0 |
| 3 | Modal rechazar | `/cotizacion/<token>` → «Rechazar» | claro · móvil · oscuro | 0 / 0 | 0 |
| 4 | Portal público del pedido | `/pedido/<token>` | claro · móvil · oscuro | 0 / 0 | 0 |
| 4 | Cotización compartida | `/cotizacion/<token>` | claro · móvil · oscuro | 0 / 0 | 0 |
| 4 | Cuenta del cliente | `/cuenta/<token>` (cotizaciones y avisos) | claro · móvil · oscuro | 0 / 0 | 0 |
| 5 | Comprobante de impresión | `/pedidos` → «Imprimir comprobante» | claro · móvil · oscuro | 0 / 0 | 0 |
| 5 | Correo de cotización | `/cotizaciones` → «Correo» | claro · móvil · oscuro | 0 / 0 | 0 |
| 5 | Impresoras | `/configuracion/dispositivos` | claro · móvil · oscuro | 0 / 0 | 0 |

Notas de la verificación funcional:

- **Impresión**: el modal «Comprobante» abre con niveles, formatos y la vista
  previa en un iframe, sin desbordes en 390.
- **Correos**: en el camino soportado (cotización con ficha de cliente) el
  envío sin transporte **avisa** («El envío de correo no está configurado…») y
  no miente (`auditoria-correo-resultado.json` → `sin-transporte-avisa`).
  El caso sin ficha se documenta como hallazgo funcional abajo.
- **Títulos repetidos**: Cotizaciones y Precios muestran el título del shell
  (h1) y el del módulo (h2) a la vez; es el hallazgo ya abierto en **#320** y
  queda para esa pasada (no se toca acá para no pisar el sistema visual).

## Fixes de esta pasada (diseño/responsive)

| # | Hallazgo | Fix | Archivo |
|---|---|---|---|
| 1 | El crédito del pie institucional (#292) medía 151×14 y no tenía área de toque en mobile (regresión del pie en todas las superficies, incluidas las públicas) | Área efectiva de 44 con `.toque-44` equivalente en CSS, sin cambiar el dibujo | `src/index.css` |
| 2 | Los filtros de **Cotizaciones** no envolvían y las últimas solapas se cortaban a 390 (3 elementos fuera del viewport) | `flex-wrap` + chips `min-h-11` (mobile) / `md:min-h-0` | `src/components/ventas/SellerQuotes.jsx` |
| 3 | Pestañas del **Taller** («Activos (0)», estados) de 83×28 | `min-h-11` en mobile | `src/components/control/ServicioTecnico.jsx` |
| 4 | Toggle **Compras/Productos** de 71×28 | `min-h-11` en mobile | `src/pages/PanelVendedor.jsx` |
| 5 | «Con stock» (84×34) y botones de la barra de lote en **Productos** | `min-h-11` en mobile | `src/components/ventas/SellerCatalog.jsx` |
| 6 | «Importar productos» de 164×36 pisaba el alto mobile del `Button` | Se quitó el `h-9` fijo (usa `h-11 md:h-9` del objeto) | `src/components/productos/ImportarProductos.jsx` |
| 7 | «Pasar a servicio» (texto) sin área táctil | `.toque-44` | `src/components/control/ServicioGarantias.jsx` |
| 8 | **Reparto**: filtros «A entregar/Entregados» de 81×28 y «Actualizar» de 84×34 | `min-h-11` en mobile | `src/components/delivery/DriverOrders.jsx` |
| 9 | **Reparto**: teléfono del cliente como enlace de 96×16 | `.toque-44` | `src/components/delivery/DriverOrders.jsx` |
| 10 | **Cuenta del cliente**: enlaces de 40 px («Ver cotización» y hermanos) | `min-h-11` en mobile | `src/pages/CuentaPublica.jsx` |
| 11 | **Cotización pública**: «Aceptar» (40), «Rechazar» (42), «Volver»/«Confirmar rechazo» (38) | `min-h-11` | `src/pages/CotizacionPublica.jsx` |

Los arreglos siguen los patrones de #249 (`min-h-11` en mobile + `md:min-h-0`
o `md:min-h-9` según el caso, `.toque-44` para acciones de texto/ícono sin
cambiar el dibujo).

## Hallazgo funcional (otro dominio, propuesto como issue)

**Correo de cotización sin ficha de cliente** — al abrir «Correo» en una
cotización que solo tiene nombre de cliente, el diálogo pide el correo destino
(«indicá a qué correo enviar»), pero la UI **no envía esa casilla al backend**:
llama a `sendEmail(id, {})` y el envío falla con «El cliente todavía no tiene
correo» (400). El backend sí acepta `to` en el cuerpo
(`backend/app/api/quotes/[id]/email/route.ts`), así que el puente queda a
medio camino. Reproducción y captura:
`docs/qa/325-roles-responsive/hallazgo-correo-sin-ficha.png`; el spec crea una
cotización sin `customerId`, escribe el correo y confirma el rechazo.

- **Impacto**: una cotización sin ficha (o enviar a una casilla distinta a la
  de la ficha) no se puede mandar por correo aunque la UI lo prometa.
- **Propuesta**: pasar `{ to }` en `SellerQuotes.enviarCorreo` (y validar el
  caso sin ficha) o, si la decisión es exigir ficha, corregir el texto del
  diálogo y deshabilitar el envío. **No se toca en esta rama** (dominio
  Ventas/Cotizaciones).

## Verificación por punto del issue

1. **Detalle de cliente, pedido y producto** ✅ con capturas y medición en los
   tres estados.
2. **Kardex, precios, importación y garantías** ✅ (kardex dentro del producto;
   Precios; importador; Taller/Garantías).
3. **Modales crear/editar/rechazar/recibir** ✅ los cuatro dentro del viewport
   de 390 sin cortes.
4. **Portal público y cotizaciones compartidas** ✅ portal del pedido, cuenta
   del cliente (con cotizaciones y avisos) y página pública de cotización.
5. **Impresión y correos** ✅ comprobante (vista previa), correo de cotización
   (el envío sin transporte avisa) e impresoras.
6. **Roles Vendedor, Gerente, Técnico y Delivery** ✅ puerta, menú y límites.
7. **Responsive móvil de todas esas páginas** ✅ 0 scroll, 0 cortes y 0 targets
   < 44 en mobile tras los fixes.

## Verificaciones de entrega

- `npm run lint` → 0 errores (2 warnings preexistentes).
- `npm run build` + `npm --prefix backend run build` → exit 0 con
  `backend/.next/BUILD_ID`.
- `npm --prefix backend run prisma:validate` → OK.
- `npm test` + `npm --prefix backend run test:unit` → en verde.
- `rg "<<<<<<<" src backend e2e` → sin resultados.
- `node scripts/e2e-shards.mjs --check` → shards balanceados con el spec nuevo.
