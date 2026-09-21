# Auditoría de duplicación del front (MOS-CMP)

Fecha: 21-09-2026 · Rama: `slot/componentes` · Alcance: `src/` (front).

Objetivo: encontrar la **misma cosa implementada varias veces** (componentes,
patrones, estilos y lógica JS), crear o unificar el objeto reutilizable en la
biblioteca compartida, migrar los usos y dejar la regla fijada con un test de
aserción de fuente. Regla madre: buscar antes de crear
(`docs/PLANTILLA-OBJETOS.md`).

## 1. Aplicado en este lote

| Objeto | Dónde vive | Antes (evidencia) | Después |
| --- | --- | --- | --- |
| `Aviso` (banner inline error/ok) | `src/components/ui/index.jsx` | El mismo `<p>` con `rounded-lg border border-bad/30 bg-bad/10 … text-bad` copiado **92 veces en 53 archivos**, en 3 variantes de padding | **92 usos** pasan por `Aviso tono="error\|ok"`; `role` por tono (`alert`/`status`) y `compact` para el tamaño chico |
| `CELDA_ENCABEZADO`, `ROTULO_DATO`, `ROTULO_SECCION` | `src/components/shared/tabla.js` | La clase de encabezado repetida **25 veces en 17 archivos** (como constante local `CELDA_*` en 14 y suelta en 4); el rótulo de sección repetido **49 veces en 20 archivos** | Encabezados y rótulos salen de un solo módulo: `CELDA_ENCABEZADO` en 16 pantallas, `ROTULO_DATO` en 13 y `ROTULO_SECCION` en 21; los alias locales `CELDA_INV/CELDA_CLI/…` desaparecen |
| `fechaHora`, `fechaDia`, `fechaHoraCorta`, `fechaCorta` | `src/utils/fecha.js` | El helper `fechaHora`/`fmt`/`fecha` redefinido con el mismo cuerpo en **12 archivos** (más 3 usos sueltos de `dateStyle: 'short'`); el formato es-PY repetido en 58 lugares | Helpers compartidos con texto de vacío explícito (`'—'` o `''`) y **hora siempre en 24 h** (`hour12: false`), adoptados en **24 archivos** (pantallas + Caja, Reportes, Comisiones, Servicio Técnico y Campañas); el formato de pantalla queda en un solo lugar |
| Tests | `src/utils/fecha.test.js`, `src/lib/objetosReglas.test.js` | — | Fallan si vuelve a aparecer el `<p>` del aviso, la clase de tabla copiada o el formato de fecha duplicado |

Verificación del lote: `npm run lint` (0 errores), `npm test` (433 en verde),
`npm run build`, e2e smoke. Sin cambios de presentación: donde la pantalla
definía un tamaño propio (por ejemplo `p-3`, `rounded-xl`, `px-3.5 py-2.5`) se
conservó tal cual.

Nota de rebase: `main` (v1.0.131) ya había barrido varias pantallas de finanzas
con `hour12: false` y agregado `useUltimoUsado` (#209) y `whatsappUrl` en el
dominio de clientes. El rebase conservó todo eso; el helper compartido adopta la
regla de **24 h** y reemplaza los helpers locales sin revertir el barrido.

### Lote 2 — lógica de navegador compartida (21-09)

| Objeto | Dónde vive | Antes (evidencia) | Después |
| --- | --- | --- | --- |
| `copiarAlPortapapeles` (con respaldo `execCommand`) | `src/utils/portapapeles.js` | `navigator.clipboard` repetido **23 veces en 18 archivos**, con tres estilos de feedback y fallas silenciosas | **23 usos migrados** en 18 archivos; cada pantalla conserva su aviso y ahora distingue el fallo; test unitario del respaldo |
| `descargarArchivo` / `descargarCsvCliente` | `src/utils/descargarArchivo.js` | Blob + `<a download>` + `revokeObjectURL` copiado **11 veces en 10 archivos** (CSV, JSON y comprobantes) | **11 usos migrados** (incluye `utils/descargarCsv.js`); BOM y tipo en un solo lugar; test unitario |
| `useVistaListaGrid` | `src/hooks/useVistaListaGrid.js` | El par `useState(() => localStorage.getItem('mobos:<vista>-vista'))` + `setItem` en el `onChange`, copiado en **3 pantallas / 4 vistas** | Las 4 vistas lo usan; misma clave persistida (cero cambio de comportamiento) |
| `deviceId` | `src/lib/deviceId.js` | El mismo `getItem('mobos:device-id') || crypto.randomUUID()` + `setItem` en **3 archivos (4 usos)** | Un solo generador, tolerante a navegadores sin almacenamiento; test unitario |

Total de duplicación pendiente medida por el script: **60 → 16 usos** (quedan
los pendientes de decisión de DSN: dinero y textareas).

### Lote 3 — estados vacíos, montos y escape de plantillas (21-09)

| Objeto | Dónde vive | Antes (evidencia) | Después |
| --- | --- | --- | --- |
| `EmptyState` (adopción) | `src/components/ui/index.jsx` | **6 cajas de vacío a mano** en 6 pantallas (`SellerData`, `SellerOrders`, `CampanasClientes`, `PanelColaOffline`, `KardexProducto`, `FormularioVenta`), con borde, padding y texto centrado propios | Las 6 usan `EmptyState` (`compact` en paneles y tablas); el vacío con acción (pedido no encontrado) usa `action` |
| `montoGs` / `montoUsd` / `montoTexto` | `src/utils/moneda.js` | `US$ …toLocaleString('en-US')` y `Gs. …` repetidos en `Inventario`, `UnidadDetalle`, `SellerCatalog`, `FilaVenta`, `CheckoutCustomer` y `CampanasClientes` (dos funciones `precio`/`money` duplicadas) | Un solo módulo con la presentación de `ui/Money`; `null`/`''` dejan de mostrarse como `Gs 0`; los montos en USD quedan listos para el fallback del IMEIcheck |
| `escapeHtml` | `src/utils/printHtml.js` | **3 definiciones idénticas** (`OrderReceipt`, `reporteEjecutivo`, `Comisiones`) con 166 usos | Una definición compartida; las plantillas la importan |

Duplicación pendiente medida: **16 → 10 usos**. Quedan los `wa.me` (POS/CRM),
un `Gs.` de impresión (PRN) y los `<textarea>` de DSN.

### Lote 4 — celdas, WhatsApp y estados del cliente (21-09)

| Objeto | Dónde vive | Antes (evidencia) | Después |
| --- | --- | --- | --- |
| `CELDA_DATO` y `CELDA_MONTO` | `src/components/shared/tabla.js` | `truncate text-xs text-mute` copiada **73 veces en 32 archivos** y `text-right tabular-nums` en 12 | **118 usos** por los objetos (con `cn(objeto, extras)` cuando la celda agrega color o `truncate`); cero literales sueltos |
| `whatsappUrl` | `src/utils/telefono.js` | El enlace `wa.me` se armaba en **4 lugares** (uno en `customerMessaging`, dos inline en POS y uno en la página de garantía); el de POS no agregaba el código de país | Un solo armador con número internacional y mensaje escapado; adoptado en 7 archivos (CustomerCommunicationCard, Campañas, SellerCustomers, WhatsAppMenu, PagosPedido, FormularioVenta y Garantía pública) |
| `src/lib/estadosPedido.js` | nuevo | Los mismos tres mapas de estado y dos `tono*` estaban en **4 páginas públicas** (PortalCliente, CuentaPublica, PedidoPublico y Garantía pública) con nombres distintos, más copias en `OrderReceipt` | Los estados de pedido/entrega/garantía del cliente y su tono salen de un módulo; las 4 páginas y el comprobante lo importan |

Duplicación pendiente medida: **10 → 6 usos** (`Gs.` de impresión en PRN y los
5 `<textarea>` de DSN). El resto del tablero quedó en cero.

### Lote 5 — Aviso completo, skeletons y avisos que faltaban (21-09)

| Objeto | Dónde vive | Antes (evidencia) | Después |
| --- | --- | --- | --- |
| `Aviso` (completado) | `src/components/ui/index.jsx` | Faltaba el tono **warn** (30 banners con `border-warn/30 bg-warn/10`, 9 con texto de tono) y el contenedor para el **aviso con estructura** (6 casos con ícono o botón de reintentar que no podían ser un `<p>`) | `tono="warn"` + `como="div"`; 12 sitios migrados (Login, SellerData, Campañas, Kardex, IMEIcheck, Pagos, Paso de cobro, importación CSV, Comprobante, Inventario, Compras, panel y landing); la confirmación post-venta del POS también |
| `Skeleton` (adopción) | `src/components/ui/index.jsx` | **9 placeholders de carga** hechos a mano con `animate-pulse` + fondo propio (SellerData, PortalUI, Campañas, UnidadDetalle, PedidoDetalle) | Todos pasan por `Skeleton` conservando forma y color; quedan solo pulsos decorativos (ícono de éxito, punto de estado) |

Duplicación pendiente medida: **6 usos** sin cambios (PRN + DSN), pero el
tablero quedó sin los avisos y las cargas duplicadas. Los patrones que quedan
para revisar están listados en el script (`bg-warn/5`, notas neutras con borde
warn y la celda de identidad de 13 px que espera a DSN).

### Identidad (#211) — sin duplicar

Tras los últimos merges, la identidad está repartida así: `Avatar` compartido
(14 usos), `PresencePill` del topbar y `PresenciaPedido` (POS) que consumen
`lib/identidad.js`, un adaptador **preparado para el objeto unificado de DSN**.
No hay fotos de persona a mano ni iniciales sueltas (los `charAt(0)` que quedan
son de empresa, no de personas). MOS-CMP no crea el objeto de identidad: queda
para DSN (#211), que ya tiene el inventario y los call sites.

## 2. Backlog priorizado (con evidencia)

### P1 — Decisiones de diseño antes de tocar (DSN)

1. **Formato de dinero — casi resuelto.** El código ya usa la familia de
   `ui/Money` (`Gs 12.500` sin punto y `US$ 1,234.56`): `gs()`/`formatGs`
   (≈495 usos) y ahora `montoGs`/`montoUsd`/`montoTexto`. Los outliers con
   `Gs.`/`US$` a mano se migraron en el lote 3. **Falta que DSN confirme el
   canónico** (los docs muestran `Gs.`; el código usa `Gs`) y decida si
   `formatUsd` (`USD 1.234,56`) converge con `Money` (`US$ 1,234.56`) y si el
   `Gs.` de `lib/servicioImpresion.js` se alinea. Con eso, el cambio queda en
   un archivo (`utils/moneda.js`).
2. **Variantes compactas de fecha.** `fechaHoraCorta` (rendiciones:
   `17-sept., 15:30`) y `fechaCorta` (listas densas: `17-sept. · 15:30`) son
   dos variantes de la misma idea; DSN decide si convergen en una. Las horas ya
   van en 24 h por el helper y por `disenoReglas.test.js`.
3. **Celda de dato e identidad.** `CELDA_DATO` ✅ aplicado en el lote 4.
   Queda **`CELDA_IDENTIDAD`**: `truncate text-[13px] font-semibold` (21 usos en
   14 archivos) y `truncate text-sm font-semibold` (13 usos); `TABLAS.md` habla
   de `text-sm` para el nombre. DSN decide el tamaño y, si corresponde, lo crea
   junto con el objeto de identidad (#211).

### P2 — Objetos de plataforma (PLT) — ✅ resueltos en el lote 2

- **Vista lista/cuadrícula persistida**: ahora `useVistaListaGrid`
  (`src/hooks/useVistaListaGrid.js`), adoptado en Inventario (2 vistas),
  SellerCatalog y SellerCustomers. Misma clave en `localStorage`, mismo
  comportamiento; el patrón de “recordar y avisar” sigue el de
  `lib/ultimoUsado.js` (#209).
- **Copiar al portapapeles**: ahora `copiarAlPortapapeles`
  (`src/utils/portapapeles.js`) con respaldo `execCommand`; 23 usos migrados y
  aviso de fallo explícito donde antes era silencioso.
- **Descargas del navegador**: ahora `descargarArchivo` / `descargarCsvCliente`
  (`src/utils/descargarArchivo.js`); 11 usos migrados (CSV, JSON, comprobantes)
  y un único manejo de BOM/tipo/revocación.
- **`device-id`**: ahora `deviceId()` (`src/lib/deviceId.js`); los 4 usos de
  Login/AceptarInvitación/Config pasan por ahí.

### P2 bis — sigue pendiente

1. ✅ **Enlace de WhatsApp**: ahora `whatsappUrl` vive en `utils/telefono.js`
   (junto a `internationalPhone`) y lo usan los 7 call sites, incluidos
   `PagosPedido`, `FormularioVenta` y `Garantía pública`; el enlace del carrito
   suspendido ahora lleva el código de país.

### P3 — Patrones de UI por pantalla (DSN + slots de dominio)

1. ✅ **Estados de pedido/entrega/garantía del cliente**: los mapas y tonos de
   las páginas públicas viven en `lib/estadosPedido.js` (lote 4). Quedan los
   mapas **internos con badge** (`CustomerProfile.jsx:45/63`, `label` + `color`
   con más estados) y el `FULFILLMENT` de `lib/printing/tickets.js` (PRN).

2. ✅ **Aviso con estructura** (ícono o botón "Reintentar"): resuelto en el lote
   5 con `Aviso como="div"`; los 6 lugares migraron sin cambiar el diseño.
3. **Mapas de estado internos → etiqueta/tono duplicados** (dominio de cada
   slot; las páginas públicas ya se unificaron en `lib/estadosPedido.js`):
    - `lib/servicioChecklist.js` (ESTADOS), `control/ServicioTecnico.jsx:26-37`
      (ESTADOS + ESTADO_LABEL + ESTADO_TONE), `control/Compras.jsx:52`,
      `control/AuditoriaEfectivo.jsx:16`, `control/Conciliacion.jsx:21`,
      `control/Auditoria.jsx:225`, `ventas/venta/entrega.js:18-21` y
      `lib/printing/tickets.js:11` (PRN).
    - Tono de unidad: `control/Inventario.jsx` y `inventory/UnidadDetalle.jsx`
      definen reglas distintas para el mismo dato (una considera
      `condition === 'NEW'`).
    Propuesta: `utils/estados.js` con `{ etiqueta, tono }` por estado y un
    `tonoUnidad(unit)` en `utils/inventario.js`, coordinado con INV/CRM/POS/PRN.
4. **Campos crudos pendientes del barrido de #147** (DSN):
    - `pages/RemitoPublico.jsx:170` y `pages/CotizacionPublica.jsx:148`
      (`<textarea>` con las clases del sistema copiadas), `ventas/PedidoDetalle.jsx:568`
      (comentario del pedido), `shared/WhatsAppMenu.jsx:192` y
      `control/WhatsAppTemplates.jsx:162` (editores de plantilla),
      `control/Vendedores.jsx:372` (rename en línea), `control/Impresoras.jsx:1077`
      (sufijo del papel). Los `<input type="checkbox">` sueltos son la
      selección múltiple permitida; no se tocan.
5. **Tono de badges/chips de estado** repetido como clases
    (`border-bad/30 bg-bad/10`) en `pages/CotizacionPublica.jsx:11`,
    `ventas/SellerOrders.jsx:110/114`, `customers/*`: usar `Badge` con `color`
    del mapa (punto 3).

### P4 — Menores

6. **`escapeHtml` propio** en 3 archivos (`shared/OrderReceipt.jsx`,
    `shared/reporteEjecutivo.js`, `control/Comisiones.jsx`); candidato a
    `utils/printHtml.js`.
7. **Fechas de impresión/reportes**: `lib/printing/reportes.js:9`,
    `lib/printing/tickets.js:13/672`, `lib/imeiComprobante.js:38`,
    `lib/customerReport.js:49` mantienen su propio `fecha` (algunos con vacío
    `''`). Es del dominio de impresión (PRN): adoptar `utils/fecha.js` con el
    fallback vacío.
8. **Montos dentro de frases**: `components/control/Caja.jsx:101`
   (aria-label "…guaraníes"), `delivery/DriverOrders.jsx:103` y
   `delivery/StoreDelivery.jsx:204` arman el número con `toLocaleString` porque
   el texto trae el sufijo; al reescribir esas frases conviene `montoTexto`.

## 3. Fuera de alcance en esta pasada

- `backend/` y `print-agent/`: la auditoría es del front. La regla madre de
  objetos aplica igual (validadores, permisos, migraciones), pero requiere una
  pasada específica con `db:check`.
- Imprimir con `SegmentedField`/`Subtabs` duplicados: los tests existentes de
  `disenoReglas.test.js` ya cubren ese barrido (#147).

## 4. Cómo reproducir las cifras

```bash
node scripts/auditoria-duplicacion.mjs
```

Recorre `src/` (sin tests) y cuenta adopción de los objetos y duplicación
pendiente. Los conteos de este documento salen de ese script; los tests
`src/lib/objetosReglas.test.js` y `src/lib/disenoReglas.test.js` son la versión
ejecutable de las reglas: si la duplicación vuelve, fallan.
