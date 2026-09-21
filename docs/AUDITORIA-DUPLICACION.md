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
3. **Celda de dato e identidad.** `truncate text-xs text-mute` se repite **74
   veces en 32 archivos** y `truncate text-[13px] font-semibold` **21 veces en
   14**; `TABLAS.md` habla de `text-sm` para el nombre. Candidatos:
   `CELDA_DATO` y `CELDA_IDENTIDAD` en `shared/tabla.js`, previa confirmación
   del tamaño.

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

1. **Enlace de WhatsApp**: `main` ya centralizó `whatsappUrl` en
   `components/customers/customerMessaging.js` (Campañas lo usa). Quedan 3
   copias: `ventas/PagosPedido.jsx:40`, `ventas/FormularioVenta.jsx:1917` y
   `pages/GarantiaPublica.jsx:85`. Propuesta: mover `whatsappUrl` a
   `utils/telefono.js` (junto a `internationalPhone`) y adoptarlo en los tres.

### P3 — Patrones de UI por pantalla (DSN + slots de dominio)

2. **Aviso con estructura** (ícono o botón "Reintentar"): 6 lugares repiten el
   mismo contenedor con `role="alert"` y contenido hijo
   (`ventas/SellerData.jsx:68`, `customers/CampanasClientes.jsx:118`,
   `productos/KardexProducto.jsx:131`, `pages/Login.jsx:318/324`,
   `control/DatosPrivados.jsx:84`, `control/PaymentAccounts.jsx:252`). Necesita
   que `Aviso` acepte un elemento contenedor (`como="div"`); quedó fuera del
   lote para no inventar API sin DSN.
3. **Mapas de estado → etiqueta/tono duplicados** (dominio de cada slot):
    - `pages/PortalCliente.jsx:10-15` y `pages/CuentaPublica.jsx:10-17` tienen
      los **mismos tres mapas** (`ORDER_STATUS`, `FULFILLMENT`,
      `WARRANTY_STATUS`) y las mismas `tonoPedido`/`tonoGarantia`.
    - `lib/servicioChecklist.js` (ESTADOS), `control/ServicioTecnico.jsx:26-37`
      (ESTADOS + ESTADO_LABEL + ESTADO_TONE), `control/Compras.jsx:52`,
      `control/AuditoriaEfectivo.jsx:16`, `control/Conciliacion.jsx:21`,
      `control/Auditoria.jsx:225`, `ventas/venta/entrega.js:18-21`.
    - Tono de unidad: `control/Inventario.jsx:57` y
      `inventory/UnidadDetalle.jsx:18` definen reglas distintas para el mismo
      dato (una considera `condition === 'NEW'`).
    Propuesta: `utils/estados.js` con `{ etiqueta, tono }` por estado y un
    `tonoUnidad(unit)` en `utils/inventario.js`, coordinado con INV/CRM/POS.
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
