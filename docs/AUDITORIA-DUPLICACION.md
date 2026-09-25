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
| `CELDA_DATO` y `CELDA_NUMERO` (antes `CELDA_MONTO`) | `src/components/shared/tabla.js` | `truncate text-xs text-mute` copiada **73 veces en 32 archivos** y `text-right tabular-nums` en 12 | **118 usos** por los objetos (con `cn(objeto, extras)` cuando la celda agrega color o `truncate`); cero literales sueltos |
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

### Lote 8 — celdas de identidad y textarea (21-09)

| Objeto | Antes (evidencia) | Después |
| --- | --- | --- |
| `CELDA_IDENTIDAD` / `CELDA_IDENTIDAD_GRANDE` | `truncate text-[13px] font-semibold` **21 usos** y `truncate text-sm font-semibold` **17 usos** copiados en 25 archivos (el nombre de cada fila) | Las dos variantes en `shared/tabla.js`; **38 usos** migrados (incluidas las que estaban dentro de `cn(...)`, como `PersonaChip` y `SellerOrders`); regla nueva en `objetosReglas.test.js` |
| `<Textarea>` | **5 `<textarea>` crudos** con las clases del sistema copiadas (comentario del pedido, mensaje de WhatsApp, plantilla, nota del remito y motivo de la cotización) | Los 5 usan `ui/Textarea` conservando radio/padding por `className`; regla nueva que prohíbe el `<textarea>` suelto |

Duplicación pendiente medida: **6 → 1 usos** (queda solo el `Gs.` de una
plantilla de impresión de PRN, que se coordina con ese slot).

### Lote 21 — alto táctil de 44 px en los controles compartidos (23-09)

| Objeto | Antes (evidencia) | Después |
| --- | --- | --- |
| `SegmentedField` / `Subtabs` (`owncoding-ui`) | 28–36 px de alto: la auditoría responsive de DSN (#249, H3) midió pedidos **28**, inventario **32**, clientes **32** y finanzas **36** | `min-h-11` (44 px) en la biblioteca **v0.15.1**; el dibujo no cambia |
| `ListGridToggle` | Botones de 36×36 | 36 px de dibujo + área de toque de 44 con `.toque-44` |
| `IconAction size="touch"` | 36×36 desde #236, por debajo del criterio nuevo | 36 px de dibujo + `.toque-44` (44 de toque); el default `sm` no cambia |
| Barra inferior (`BarraInferior`) | Ítems ~43 px sin mínimo explícito | `min-h-11` por ítem |
| Utilidad `.toque-44` | El patrón vivía en `src/index.css` de MobOS (DSN lo aplicó al topbar) | Portado a `base.css` de la biblioteca: pseudo-elemento centrado de `max(100%, 44px)`; documentado en `REGLAS.md` §2 y `SHELL.md` §4 para que POS/INV/CRM/FIN lo apliquen con el mismo criterio (H2/H4) |
| `FichaCertificado` (certificado embebible, #240) | El chip de la cabecera estaba fijo en `pass` | Suma `estado` (por defecto `pass`): INV puede embeber la ficha con el estado real del equipo (con el QR de `CodigoQr`, ya portable) |

**Duplicación pendiente: 0 usos.** Biblioteca: **v0.15.1** (tag + CI); la
medición y los hallazgos completos, en `docs/QA-RESPONSIVE-MOBILE.md` de DSN
(#249).

### Lote 20 — paridad de objetos de campo y detalle con la biblioteca (23-09)

| Objeto | Antes (evidencia) | Después |
| --- | --- | --- |
| `shared/ProductCombobox` | Vivía solo en MobOS aunque la biblioteca lo declaraba pendiente (README fase 2); POS, compras, combos y listas de precios lo usan en 6 archivos | Publicado en `owncoding-ui` **v0.15.0** con las mismas props (`products`, `selectedId`, `onSelect`, `onCreate`, `onQueryChange`), sugerencias en flujo y ARIA de combobox |
| `shared/RucField` + `utils/ruc.js` | El campo canónico de `docs/CAMPOS.md` y sus helpers (`extraerRuc`/`esRuc`) no existían en la biblioteca | Publicados en v0.15.0; la consulta entra por `consultar` (async) — la librería no llama APIs — y el resultado se aplica solo al confirmar |
| `shared/SerialTexto` | La regla de «últimos 4 siempre visibles» se repetía en las pantallas (7 archivos) | Publicado con `partirSerial` de la biblioteca (`utils/serial.js`), vacío explícito |
| `shared/EstadoBadge` | Badge de estado por mapa local en 2 archivos | Publicado; un valor fuera del mapa se muestra crudo y el vacío es explícito (nunca un badge en blanco) |
| `shared/SeccionColapsable` | Detalle plegable con memoria propia en `sessionStorage` en 3 archivos | Publicado con `clave` (la app decide la clave) y `aria-expanded`/`aria-controls`; el contenido queda en el DOM con `hidden` |
| `shared/ComprobantePreview` | Estaba en la lista de pendientes de la biblioteca | Se queda en MobOS a propósito: compone la impresión de la app (agente, cola, plantillas y logo); las piezas portables (`VistaPreviaPapel`, `DocumentoImpresion`) ya estaban publicadas |

**Biblioteca:** `owncoding-ui` **v0.15.0** (tag + CI), con tipos y props en su
`docs/REGLAS.md` §1/§3/§4; en la misma ronda quedaron publicados los **dos modos
de deploy y el glosario en simple** (`v0.14.11`, `docs/COMANDOS.md`). La
adopción en MobOS sigue pendiente (paquete + `owncoding-ui/styles.css`); hasta
entonces estas piezas siguen duplicadas por diseño y quedan anotadas para el
lote de adopción.

**Duplicación pendiente: 0 usos.**

### Lote 19 — shell v2: tonos AA y paridad de la biblioteca (23-09)

| Objeto | Antes (evidencia) | Después |
| --- | --- | --- |
| Tonos semánticos del scope `.tema-v2`/`.v2-piloto` (`owncoding-ui`) | La biblioteca tenía los vivos del piloto (`ok` #16A34A, `bad` #DC2626, `warn` #D97706, `info` #4D7CFE); usados como texto sobre las superficies v2 quedaban en 2.89–4.38:1 (DSN midió el shell: rótulos de grupo 3.20:1 e ítem activo 2.91:1 en claro / 3.49:1 en oscuro) | Los tonos de **texto AA** que DSN midió en MobOS (`ok` #166534/#4ADE80, `bad` #B91C1C/#FCA5A5, `warn` #92400E/#FCD34D, `info` #2059BE/#9FB8FF) y el bloque completo por tema (fono, reserved, onbrand e ink-950 dejan de heredarse); los vivos siguen en `--c-pass`/`--c-accion` para relleno e indicadores |
| `IconAction size="touch"` | MobOS lo estrenó en la lista de Clientes (#236) y quedó anotado para CMP/DSN | Paridad en la biblioteca con el mismo contrato (`aria-label`, `title`, tonos); el default `sm` no cambia |
| Docs del shell v2 | No había guía de armado del shell en la biblioteca | `owncoding-ui/docs/SHELL.md` (piezas, props, breakpoints, reglas AA y checklist), más la tabla de tonos de texto AA en su `docs/V2.md` y las referencias en `docs/REGLAS.md` §8/§10 |
| Navegación v2 del shell (`owncoding-ui` v0.14.9/v0.14.10) | Las reglas AA del shell vivían **solo** en el `src/index.css` de MobOS (ítem activo, rótulos, foco por tema, chips de contenido), así que cada app las repetía | Portadas a `base.css` con el scope `tema-v2` y los hooks reales (`nav [aria-current="page"]`, `nav [aria-pressed="true"]`, `nav button[aria-expanded] > span`, `.oc-rotulo-grupo`, `.v2-chip` con sus tonos fono/warn y `.oc-paso-activo` del stepper): MobOS podrá borrar su bloque local sin perder AA; `NavLateral` suma **grupos plegables** (`grupos` + `aria-expanded`) con el activo azul y el rótulo sólido |
| Contador de avisos | `CampanaAvisos` usaba blanco sobre `bg-bad`; en oscuro el rojo es claro y quedaba en ~1.6:1 | `text-white dark:text-onbrand` (la regla de superficies rojas se resuelve en el objeto, no con un override genérico de `.bg-bad`) |
| Guarda de contraste | Sin test | `owncoding-ui/test/contraste-tokens.test.js`: mide los tonos de texto del scope contra sus superficies en claro y oscuro (4.5:1), ítem activo sobre su tinte incluido; `test/shell-v2.test.js` fija que las reglas del shell sigan publicadas |

**Coordinación con DSN (#241):** los números salen de su medición del shell v2
y del pendiente que dejó declarado en `docs/rediseno/PLAN-F4.md` («portar los
tonos AA al scope `tema-v2` de owncoding-ui»). Su revisión cruzada confirmó los
valores («no veo nada que ajustar en números»), pidió que el CSS de navegación
vaya a la biblioteca y advirtió dos cosas que se respetaron: `NavLateral` cambia
ahí (activo azul + grupos) y las superficies rojas se resuelven en los objetos,
no con un override genérico de `.bg-bad`. Quedan publicados **v0.14.8** (tonos),
**v0.14.9** (navegación, `NavLateral`, contador) y **v0.14.10** (chips de tono y
paso activo del stepper, que cerraron la revisión 1:1 del port), con el detalle
de pendientes en `owncoding-ui/docs/SHELL.md` §7.

Lo que sigue del lado de la app (no lo toqué): el bloque local `.v2-piloto` de
`src/index.css` queda como puente hasta que MobOS importe
`owncoding-ui/styles.css` (paso 1 del plan F3/F4); los selectores de markup
propio (chips con `data-testid` de filas, `strong.text-xl.tabular-nums`) y los
objetos de tema/presencia siguen del lado de la app.

**Duplicación pendiente: 0 usos.**

### Lote 18 — etiquetas de entrega con una sola fuente (22-09)

| Objeto | Antes (evidencia) | Después |
| --- | --- | --- |
| `FULFILLMENT_LABELS` (`lib/constants.js`) | Las 11 etiquetas de entrega (`Pendiente`, `Preparando`, `Listo p/ enviar`, `Entregado`, «No entregado»…) estaban **copiadas a mano** y duplicaban `ESTADO_ENTREGA_BADGE` (`lib/estadosPedido.js`) | Se derivan del mapa con badge (label + color) y solo se conserva `CANCELLED` (el único estado sin badge); el flujo de entrega (`venta/entrega.js`), el listado y los impresos dicen exactamente lo mismo |
| Test | — | Aserción de fuente + paridad en runtime: cada clave del badge tiene la misma etiqueta en `FULFILLMENT_LABELS` y `CANCELLED` sigue existiendo |

**Duplicación pendiente: 0 usos.**

### Lote 17 — informe público con los objetos v2 (22-09)

| Objeto | Antes (evidencia) | Después |
| --- | --- | --- |
| `shared/MedidorBateria` en `/u/<serial>` | La página pública dibujaba el `%` y una `BarraProgreso` con **umbral propio** (`>= 85 ? ok : warn`) | `MedidorBateria` con los umbrales canónicos (90/80) y la barra incluida |
| Condición de la unidad | `UnidadPublica` tenía su mapa `CONDICION` local (el mismo de `Inventario`/`UnidadFicha`) | `etiquetaCondicionUnidad` de `utils/inventario` (una sola etiqueta para toda la app) |

**Duplicación pendiente: 0 usos.** Pendiente declarado en la propia página: los
locks y el grado de inspección se completan cuando INV persista el checklist
(ahí entran `ChipsLocks` y `GradoBadge`).

### Lote 16 — paridad de los objetos de inspección con la biblioteca (22-09)

| Objeto | Antes (evidencia) | Después |
| --- | --- | --- |
| `TONOS` (`lib/estadoEquipo.js`) | MobOS exportaba `TONOS_PUNTO` / `TONOS_CHIP` / `TONOS_TEXTO` y la biblioteca `TONOS.punto`/`TONOS.chip`/`TONOS.texto`: el mismo concepto con dos formas de API | Una sola forma (`TONOS.punto/chip/texto`) en las dos casas; los cuatro objetos (`SemaforoItem`, `ChipsLocks`, `ChipEstado`, `MedidorBateria`) la consumen |
| Locks del dispositivo | MobOS tenía 4 (`icloud`/`mdm`/`esn`/`carrier`) y la biblioteca 5: faltaba **`oem`** (repuesto no OEM) | Los 5 en espejo; el test de contrato verifica claves, tonos y umbrales (90/80) contra lo publicado |
| `VistaPreviaPapel` | Estaba en MobOS pero **no** en la biblioteca (`main`) | Publicada en `owncoding-ui` **v0.14.5** junto con el repaso de la línea v0.14 (auto-ht, GradoBadge, MedidorBateria, QR compartido, ficha y preview) |

**Duplicación pendiente: 0 usos.** Test nuevo: «el contrato de inspección
coincide con la biblioteca» (claves/tonos/umbrales).

### Lote 15 — el rack del piloto con los objetos v2 (22-09)

| Objeto | Antes (evidencia) | Después |
| --- | --- | --- |
| `shared/GradoBadge` en el modo taller | `TallerRack` tenía su propio `COLOR_GRADO` (`A` verde, `B` naranja, `C` gris) y un `Badge` armado a mano | `GradoBadge` del objeto; el grado C queda **rojo** como en la ficha y el informe (antes gris en el rack), una sola regla de color |
| `shared/MedidorBateria` en el modo taller | El rack repetía los umbrales inline (`>= 90` verde, `>= 80` naranja, si no gris) | `MedidorBateria` con `variante="chip"` + `mostrarEtiqueta` (muestra «87% batería» como antes) y los umbrales del objeto (< 80 ahora **rojo**, antes gris) |

**Duplicación pendiente: 0 usos.** Biblioteca: `owncoding-ui` **v0.14.4** (prop
`mostrarEtiqueta` del medidor, en espejo).
### Lote 14 — preview del papel compartido (22-09)

| Objeto | Antes (evidencia) | Después |
| --- | --- | --- |
| `shared/VistaPreviaPapel` (+ `ANCHOS_PAPEL`) | El mapa `ANCHO_VISTA` (ancho real del papel: 302/219/208 px) y las clases del `<iframe>` estaban copiados en `ComprobantePreview.jsx` y `ReportePreview.jsx`; el informe de PRN repetía el mismo patrón | Un solo objeto: `formato` → ancho real (mm a 96 dpi) con `a4` incluido, centro automático y alto configurable; las dos vistas previas lo usan y el informe lo puede consumir igual |
| Biblioteca | — | `owncoding-ui` rama **`cmp/preview-v2`**: `VistaPreviaPapel` + `ANCHOS_PAPEL` con props en `docs/REGLAS.md` §8 bis y entradas en CHANGELOG/README (el release lo ordena el integrador) |

**Duplicación pendiente: 0 usos.**

### Lote 13 — estado de la unidad con una sola regla (22-09)

| Objeto | Antes (evidencia) | Después |
| --- | --- | --- |
| `tonoInventario` / `colorInventario` / `estadoInventario` (`utils/inventario.js`) | La lista (`Inventario.jsx`) y la ficha (`UnidadDetalle.jsx`) tenían mapas propios: una unidad **disponible seminuevo** se veía naranja en la lista y verde en la ficha; `statusLabel`/`badgeTone` duplicados | Una sola regla: `AVAILABLE`+`NEW` → ok, `AVAILABLE`+usada → atención, `RESERVED` → atención, `IN_TRANSIT` → info, `DEFECTIVE` → neutro, `SOLD` → falla (y "listo p/ retirar"/"entregado" heredan la entrega del pedido) |
| `CONDICION_UNIDAD`, `etiquetaCondicionUnidad`, `colorCondicionUnidad`, `puntoCondicionUnidad` | La etiqueta de condición estaba copiada en 2 archivos y el punto de la lista tenía la regla inline | Etiqueta, color y punto salen del mismo módulo; el `<Select>` de recepción arma sus opciones con `CONDICION_UNIDAD` |
| `Dot` (ui) | Solo aceptaba `green/red/blue/slate/orange` | Suma los tonos semánticos (`ok/warn/bad/info/mute`) para que los puntos usen el mismo tono que el badge |

**Duplicación pendiente: 0 usos.** Biblioteca: `owncoding-ui` **v0.12.0** +
`docs/V2.md` §4 (ejemplo completo de migración de una pantalla).

### Lote 12 — QR unificado y ficha del informe público (22-09)

| Objeto | Antes (evidencia) | Después |
| --- | --- | --- |
| `lib/qr.js` (`qrDataUrl`, `QR_OPCIONES`) + `shared/CodigoQr` | **16 llamadas a `QRCode.toDataURL`** repetidas en 7 archivos (ficha de cliente, cotizaciones, comprobantes, inventario, unidad, comisiones, cotización pública) con opciones parecidas pero no iguales (nivel M/H, margen 0/1/2, ancho 190/200/220/320) | Todas pasan por `qrDataUrl` (opciones por defecto: nivel M, margen 1, ancho 220; los casos que necesitan otra cosa las pisan explícitamente) y el objeto `CodigoQr` para mostrarlo |
| `shared/FichaCertificado` | No existía: el informe imprimible (PRN) arma su propio layout y la página pública no existía | Tarjeta del informe público que compone `ChipEstado`, `GradoBadge`, `MedidorBateria`, `ChipsLocks` y `CodigoQr`; lista para la página `/u/<serial>` y la vista previa |
| `shared/ChipEstado` + tonos | El chip de estado del equipo no existía en la app (solo en la biblioteca) | `ChipEstado` con `ESTADOS_CHIP`/`TONOS_CHIP` de `lib/estadoEquipo.js` |

**Duplicación pendiente: 0 usos.** Biblioteca: `owncoding-ui` **v0.12.0**
(`FichaCertificado`, `CodigoQr`, `qrDataUrl`).

### Lote 11 — duplicaciones nuevas y categoría en el buscador de productos (22-09)

| Objeto | Antes (evidencia) | Después |
| --- | --- | --- |
| `CELDA_DATO` | 2 usos nuevos de `className="… truncate text-xs text-mute"` (Clientes) y 3 en SellerOrders con `cn('truncate text-xs text-mute', …)` | Los 5 pasan por `CELDA_DATO` (con `cn` para el layout/tachado); el detalle de `SemaforoItem` también |
| `formatGs` | `demoInventory.js` armaba `Gs ${Number(...).toLocaleString('es-PY')}` a mano en el evento de venta demo | Usa `formatGs` compartido (import relativo para `node --test`) |
| `IconoCategoria` en `ProductCombobox` | El buscador de productos mostraba solo el nombre (sin el icono de la categoría) | Cada sugerencia lleva el glifo de `IconoCategoria` (`product.category \|\| nombre`); POS, compras, combos y listas de precios lo heredan |

**Duplicación pendiente: 3 → 0 usos** (las 3 eran nuevas, entradas con los
merges de otros slots). Documentación de la biblioteca: `owncoding-ui/docs/V2.md`
(guía de adopción de los tokens v2 y los iconos publicados en v0.11.0).

### Lote 10 — notas, estados con badge, barras y montos en frases (22-09)

| Objeto | Antes (evidencia) | Después |
| --- | --- | --- |
| `Nota` (`ui/index.jsx`) | El `<p>` de nota con `border-warn/30 bg-warn/10 … text-mute` copiado **8 veces en 4 archivos** (Impresoras ×4, Estado del sistema ×2, Comparativa de impresión, Aceptar invitación) | 0 pendientes: `Nota` (warn/info/neutro, `compact`, `como`) y los tres avisos warn sueltos pasan a `Aviso tono="warn"` |
| `EstadoBadge` + mapas con badge | `ORDER_STATUS`, `FULFILLMENT_STATUS` y `WARRANTY_STATUS` locales en la ficha; `ESTADO_GARANTIA` propio en Servicio y Garantías (**3 mapas en 2 archivos**) | `lib/estadosPedido.js` suma `ESTADO_PEDIDO_BADGE`, `ESTADO_ENTREGA_BADGE` y `ESTADO_GARANTIA_BADGE`; la etiqueta y el color se dibujan con `shared/EstadoBadge` |
| `BarraProgreso` con `pista`/`relleno` | **5 barras armadas a mano** (Analytics del POS, Impresión, Resumen ×3) con `style={{ width: …% }}` y clases de relleno propias | Las 5 pasan por `BarraProgreso` (rol, aria y transición); `pista`/`relleno` cubren las barras de gráfico con tokens del tema y se suma el tono `onbrand` |
| `montoTexto`/`formatGs` en frases | Montos dentro de textos con `toLocaleString('es-PY')` (Caja, cobro en la calle, rendición de reparto) | Los 3 usan el formateador compartido; el hex violeta viejo de SellerOrders pasa a `reserved` y la paleta default de POS/Landing/proveedores a tokens (`info`/`warn`/`bad`) |

**Duplicación pendiente: 0 usos.** Quedan como "patrones a revisar" las
superficies warn de sección (`bg-warn/5`, 20 usos en 10 archivos: bloques de
alerta y tarjetas de deuda/crédito, no son avisos), y sigue pendiente la
decisión de DSN sobre los colores del POS restantes en #176.

### Lote 9 — piezas de formulario e impresos de servicio (21-09)
| Objeto | Antes (evidencia) | Después |
| --- | --- | --- |
| `GRILLA_DOS_COLUMNAS` (+ `_COMPACTA`) | `grid gap-3 sm:grid-cols-2` copiada **48 veces en 24 archivos** (+14 con `gap-2`) | **62 usos** por el objeto; cero literales sueltos |
| `PIE_ACCIONES` / `PIE_ACCIONES_REVERSO` | `flex flex-wrap justify-end gap-2` (**16 usos**) y su variante reversa (**12**) repetidas en 19 archivos | **28 usos** por los objetos |
| `lib/servicioImpresion.js` | Tenía `escapar`, `fecha` y `gs` propios (con `Gs.`, distinto del resto de los impresos) | Usa `escapeHtml`, `fechaDia` y `formatGs` compartidos (imports relativos para poder testearse con `node --test`) |

**Duplicación pendiente medida: 1 → 0 usos.** El tablero quedó en cero para
todos los patrones medidos; lo que sigue son decisiones de diseño (los
`bg-warn/5`, las notas neutras, los mapas de estado por dominio y los colores
del POS en #176), listadas como "patrones a revisar".

### Lote 7 — tokens de tema en pantallas transversales (#176) (21-09)

| Cambio | Antes (evidencia) | Después |
| --- | --- | --- |
| Violeta de reservas → token `reserved` | `#8b5cf6` hardcodeado en `Inventario` (fila y tabla de reservas) y `UnidadDetalle` (ficha), conviviendo con el `text-reserved` del mismo bloque | `border-reserved`/`bg-reserved` en los 3 lugares; en oscuro el token acompaña al tema (antes quedaba fijo) |
| Verde legacy → token `fono` | `accent-[#0c8876]` en los dos checkbox del remito público | `accent-fono` |
| Paleta Tailwind default → tokens | `emerald/red/amber` del calendario de ganancias; `sky/amber/red/slate` de la página de estado; `border-amber-100` en la landing de celulares; `text-red-300` del bloqueo; `sky` de tránsito/AEX en Inventario | `ok/bad/warn/info/mute` según el mapeo (`sky→info`, `amber→warn`, `red→bad`, `emerald→ok`, `violet→reserved`); regla nueva en `objetosReglas.test.js` |

**Para DSN en #176 (pantallas del POS, no las toqué):** `ListaVentasDia`
(`bg-sky-400/15` ×2 → `info`), `SellerOrders` (`sky` del estado enviado → `info`
y `#8b5cf6` de "a crédito" ×3 → `reserved`), `PagosPedido`
(`border-red-400/30` → `bad`), `SellerCustomers` (`amber` → `warn`). Quedan
también los puntos decorativos del mock de navegador en `Landing` (rojo/ámbar
de "semáforo", no son estado) y la paleta gris de `GoogleButton` (marca de
Google), ambos legítimos.

### Lote 6 — reconciliación con los objetos de DSN (#211) (21-09)

- **Rebase sobre la integración pendiente**: los conflictos contra el trabajo de
  DSN (#211: `PersonaChip`, `FilaDato`, `CeldaMoneda`, `BarraProgreso` y sus
  adopciones) se resolvieron conservando ambos lados en `PedidoPublico`,
  la landing (`CapturaModulo`, `ImeiVerificador`) y la biblioteca de objetos.
- **`CELDA_MONTO` → `CELDA_NUMERO`**: mi clase se llamaba como el objeto de DSN
  y podía confundirse. Ahora la clase es solo para números y cantidades
  (8 celdas) y el **dinero** usa `ui/CeldaMoneda` (5 celdas migradas en
  CustomerProfile, ImportarProductos y Reportes).
- **`CELDA_DATO` en `PersonaChip`**: el componente de DSN ahora usa la clase de
  dato secundario en vez de copiarla.
- **Tests**: la regla de celdas exige `CeldaMoneda` para montos; el contador
  separa "mapas de estado con etiquetas propias" (variantes, no copias).
- **`BarraProgreso` (3 adopciones)**: las barras de avance de `PagosPedido`,
  `Creditos` y la garantía pública pasan al objeto de DSN (con su track original
  vía `className`); quedan 5 barras que son gráficos o usan otro color, listadas
  en el contador.

### Lote 37 — set de íconos único y guía de adopción v2 (#253) (25-09)

| Objeto | Antes (evidencia) | Después |
| --- | --- | --- |
| Íconos (`shared/Icon.jsx`) | Dos sets: la app con 57 glifos y la biblioteca con 78; `share` existía solo en la app y `mail` tenía trazos distintos | La biblioteca (**v0.30.0**) suma `share` y adopta el trazo de `mail` de producción; `shared/Icon.jsx` pasa a puente (`Icon` + `ICONOS`): **80 glifos, una sola fuente** |
| Guía de adopción v2 | La biblioteca tenía las piezas por separado (V2, SHELL, REGLAS, MIGRACION) pero no el recorrido práctico completo | **`owncoding-ui/docs/ADOPCION-V2.md`**: de la paleta al shell, contraste AA, retiro del bloque local, puentes de migración, controles, caso real de MobOS (v0.24 → v0.30), checklist y errores comunes; enlazada desde el README |
| Control | `Icon` figuraba en la deuda de duplicados | Pasa a la lista de puentes; la deuda baja a **21 + 32** |

Verificación del lote: `npm run lint` (0 errores), `npm run build` y
`npm --prefix backend run build` (con `BUILD_ID`), `prisma:validate`,
`npm test` (753 en verde), `test:unit` del backend (75),
`npx playwright test e2e/configuracion-lote5.spec.js` (7 en verde) y
`npm run test:e2e:smoke` (19 en verde, 0 flaky); biblioteca `owncoding-ui`
build + 218 tests.

### Lote 36 — estado de guardado y checkbox en la biblioteca (#253) (25-09)

| Objeto | Antes (evidencia) | Después |
| --- | --- | --- |
| Estado de guardado | Vivía en `control/GuardadoCuenta.jsx` (chip verde «Guardado…» o aviso rojo, con `aria-live`): el patrón transversal de guardado de Configuración (#162) | Publicado como **`EstadoGuardado`** (biblioteca **v0.29.0**); la app conserva el hook `useGuardadoCuenta` (API + reautenticación) y re-exporta el objeto sin tocar a los consumidores |
| Checkbox | 41 usos de `<input type="checkbox">` a mano en 25 archivos (config, listas y colas) con tres formas distintas (simple, tarjeta y pelado) | **`Checkbox`** en la biblioteca: `label`/`descripcion`, variantes `simple`/`tarjeta`, `tono="bad"` y `ariaLabel` para el control pelado; `Switch` sigue para booleanos |
| Control | El auditor no medía checkboxes ni el estado de guardado | «checkboxes nativos a mano» entra en patrones a revisar (41 usos · 25 archivos) y la guarda exige el re-export del estado de guardado |
| Docs | — | REGLAS §11 (biblioteca), `CAMPOS.md` §2/§3 y `PLANTILLA-OBJETOS.md` |

Verificación del lote: `npm run lint` (0 errores), `npm run build` y
`npm --prefix backend run build` (con `BUILD_ID`), `prisma:validate`,
`npm test` (753 en verde), `test:unit` del backend (75),
`npx playwright test e2e/configuracion-lote5.spec.js` (7 en verde) y
`npm run test:e2e:smoke` (19 en verde, 0 flaky); biblioteca `owncoding-ui`
build + 217 tests.

### Lote 35 — retiro de 15 duplicados idénticos y paridad de categorías (#241/#253) (25-09)

| Objeto | Antes (evidencia) | Después |
| --- | --- | --- |
| 15 objetos idénticos en `shared/` (`BotonDentroCampo`, `ChipsLocks`, `CodigoQr`, `CurrencySelect`, `EstadoBadge`, `GradoBadge`, `IconoCategoria`, `InstagramField`, `MedidorBateria`, `PercentField`, `SearchField`, `SegmentedField`, `SerialTexto`, `Switch`, `VistaPreviaPapel`) | La app mantenía la copia exacta del objeto publicado (cuerpo idéntico salvo imports/comentarios): 15 de los 37 duplicados del lote 34 | Pasan a **puentes** que re-exportan la biblioteca —incluidos los helpers `GLIFOS_CATEGORIA`, `normalizarInstagram`, `parsePercent`/`formatPercent`/`limpiarPercent` y `ANCHOS_PAPEL`—; los consumidores no cambian de ruta |
| `categorias.js` de la biblioteca | No reconocía «auriculares genéricos» (la app sí): al puentear `IconoCategoria` la categoría cambiaba de accesorios a AirPods | Publicado **v0.28.1** con la palabra restaurada y test de los dos casos («auriculares» = AirPods, «genéricos» = accesorios); la app sube su dependencia |
| Aserciones de fuente | `objetosReglas`/`disenoReglas` leían la implementación local de los objetos | Ahora leen la **biblioteca** como fuente canónica y exigen que el puente no implemente nada |
| Control | Deuda declarada: 37 copias de `shared/` + 32 objetos del kit | **22 + 32**: el auditor y la guarda reflejan los puentes y siguen frenando nombres nuevos |

Verificación del lote: `npm run lint` (0 errores), `npm run build` y
`npm --prefix backend run build` (con `BUILD_ID`), `prisma:validate`,
`npm test` (753 en verde), `test:unit` del backend (75),
`npx playwright test e2e/configuracion-lote5.spec.js` (7 en verde) y
`npm run test:e2e:smoke` (19 en verde, 0 flaky); biblioteca `owncoding-ui`
build + 211 tests.

**Nota:** la paridad de `categorias.js` se detectó justo al preparar los
puentes (comparar dependencias antes de delegar); quedó como changelog y tag de
la biblioteca. Los 22 duplicados restantes son divergentes (no idénticos) y
quedan para un lote de migración con revisión de DSN.

### Lote 34 — objetos de Configuración y control de duplicación con la biblioteca (#253) (25-09)

Contexto: #253 reorganiza Configuración en 7 grupos y reparte la sección entre
los slots pidiendo no duplicar cards, tabs, encabezados ni campos. Este lote
deja los objetos publicados y el control que lo vigila.

| Objeto | Antes (evidencia) | Después |
| --- | --- | --- |
| Tarjeta de ajuste | `TarjetaAjuste` no cubría archivar/eliminar; las secciones repetían el encabezado a mano (`<Card className="space-y-3"><div><h2…`, 2 usos vigentes) | `tono="peligro"` (borde y título rojos) en la biblioteca **v0.28.0**; las secciones usan el objeto (REGLAS §11) |
| Layout y solapas | `PanelDerecho` y `Subtabs` ya estaban publicados, pero la app conservaba su copia local de `PanelDerecho` (idéntica) y dibujaba `role="tab"` a mano (5 usos en 4 archivos) | `components/shared/PanelDerecho.jsx` pasa a **puente** que re-exporta la biblioteca (sin tocar consumidores); las solapas van con `Subtabs` |
| Tipos | `PanelDerecho` declaraba `formulario` (la prop real es `panel`); `TarjetaAjuste` no declaraba `icono`/`id`/`tono` | Tipos al día en `owncoding-ui` |
| Control de campos duplicados | El auditor no medía la copia local de objetos publicados | `scripts/auditoria-duplicacion.mjs` suma el grupo **«duplicados con la biblioteca»** (37 componentes de `shared/` + 32 objetos del kit) y «tarjetas/solapas a mano» en patrones a revisar; la guarda `camposReglas.test.js` congela el inventario y falla si aparece un nombre nuevo duplicado |
| Docs | — | `owncoding-ui/docs/REGLAS.md` §11 (cómo se arma una pantalla de Configuración); `docs/CAMPOS.md` §6 con el control |

Verificación del lote: `npm run lint` (0 errores), `npm run build` y
`npm --prefix backend run build` (con `BUILD_ID`), `prisma:validate`,
`npm test` (753 en verde, rebasado sobre la v1.0.172), `test:unit` del backend
(75), `npx playwright test e2e/configuracion-lote5.spec.js` y
`npm run test:e2e:smoke` (19 en verde, 0 flaky); biblioteca `owncoding-ui`
build + 211 tests.

**Coordinación (#253):** los objetos para los 7 grupos quedan publicados
(`TarjetaAjuste` con tono peligro, `Subtabs`, `PageHeader`/`Eyebrow`,
`PanelDerecho`); el control marca lo pendiente en las secciones (2 encabezados a
mano en `Config.jsx`, 5 solapas a mano) para que cada slot lo resuelva en su
archivo. El inventario congelado (69 objetos) solo puede bajar.

### Lote 33 — buscador global del shell en la biblioteca (#241) (25-09)

| Objeto | Antes (evidencia) | Después |
| --- | --- | --- |
| `GlobalSearch` (`components/app/`) | 342 líneas propias: modal, input combobox, lista agrupada, teclado, debounce, estados y atajo — una reimplementación de `PaletaComandos` | La paleta del shell sale de la biblioteca (**v0.27.0**): la app solo aporta `buscar` (8 grupos de la API en paralelo, 403 silencioso y error únicamente si fallan todos) y `onElegir` (navega con `datos.vista/params`); el atajo Ctrl+K sigue en el shell (`conAtajo={false}`) y el ancho «amplio» del estándar de modales (#237) se conserva con `className="max-w-3xl"` |
| Paridad del objeto | La paleta de la biblioteca no exponía `aria-activedescendant` ni el texto del vacío por props | `PaletaComandos` suma el contrato combobox completo (`aria-activedescendant` con ids por posición), `descripcionVacio` y los tipos de las props de textos; tests nuevos del objeto (agrupación con etiquetas/íconos, estados honestos, combobox y botón con atajo) |
| Docs | — | `owncoding-ui/docs/SHELL.md` §3 con la adopción real; changelog y tag **v0.27.0** |
| Tests | — | Guardas: `objetosReglas.test.js` (la app usa la paleta y no repite lista/teclado/debounce) y `disenoReglas.test.js` (el contrato combobox vive en la biblioteca) |

Verificación del lote: `npm run lint` (0 errores), `npm run build` y
`npm --prefix backend run build` (con `BUILD_ID`), `prisma:validate`,
`npm test` (710 en verde), `test:unit` del backend (75),
`npx playwright test e2e/pos-busqueda-global.spec.js e2e/modales-tamanos.spec.js`
(8 en verde, incluido el ancho de 768 px) y `npm run test:e2e:smoke` (19 en
verde, 0 flaky).

**Coordinación:** la paleta ya estaba publicada desde la v0.13.x; esta ronda la
deja como la única implementación del buscador del shell (SHELL.md §1/§3) y la
ajusta con la paridad que la app había ganado en su versión local.

### Lote 32 — retiro del bloque local v2 del shell (#241) (25-09)

| Objeto | Antes (evidencia) | Después |
| --- | --- | --- |
| Reglas v2 locales (`src/index.css`) | 187 líneas del shell y del contenido v2 (navegación, chips, stepper, números, tiles, medallas, encabezados y degradados), con selectores por `data-testid` para las filas | La biblioteca **v0.26.0** cubre todo eso en `styles.css` para los scopes `tema-v2`/`v2-piloto`; el bloque se retira completo y quedan solo las reglas propias de la app (superficies rojas y área táctil del topbar) |
| Chips de las filas | `[data-testid="pedido-fila"] span.rounded-md.border` y `[data-testid="cliente-fila"] …` les daban el pill y la mayúscula desde el CSS | Las filas ponen la clase **`v2-chip`** (y `uppercase` en clientes), el mismo contrato del mock: sin selectores por markup |
| Paso activo del stepper | `v2-paso-activo`, clase propia de la app | `oc-paso-activo`, el hook que ya emite `Stepper` de la biblioteca (el alias `v2-paso-activo` queda publicado para el código viejo) |
| Foco visible | Regla local por tema en `index.css` | Lo define `base.css` de la biblioteca: verde oscuro en claro y marca en oscuro |
| Docs | — | `owncoding-ui/docs/SHELL.md` §7 (migración cerrada) y nuevo **§8 — Retirar el bloque local**; `V2.md` paso 3; changelog y tag **v0.26.0** |
| Tests | — | Guarda de la app en `contrasteTokens.test.js` (no vuelven las reglas v2 locales) + guarda de la biblioteca `test/shell-v2.test.js` (206 en verde) |

Verificación del lote: `npm run lint` (0 errores), `npm run build` y
`npm --prefix backend run build` (con `BUILD_ID`), `prisma:validate`,
`npm test` (709 en verde), `test:unit` del backend (75) y
`npm run test:e2e:smoke` (19 en verde, 0 flaky).

**Coordinación:** cierra el pendiente declarado tras la revisión CMP ↔ DSN del
shell v2 (`SHELL.md` §7) y deja la app sin reglas v2 propias más allá de las
que le corresponden; la biblioteca queda como única fuente de la capa de
contenido.

### Lote 31 — profundidad del tema en la biblioteca (25-09)

| Objeto | Antes (evidencia) | Después |
| --- | --- | --- |
| Paleta clara (`owncoding-ui` **v0.25.0**) | Quedaba plana: lienzo #F6F8FB casi igual a las tarjetas blancas, un solo `shadow-card` (`0 1px 2px`) y el `Card` con borde verde de marca | **Profundidad por capas**: lienzo **#F1F4F8**, tarjetas blancas, paneles #F8FAFD, hovers #EDF1F6 y bordes #D5DCE6; tinte de marca nuevo `--c-fono-soft` #ECFDF5 |
| Oscuro | Paneles #1F2430 con bordes #373F51 (planos) | Capas #181D27/#1F2430/#242A38, bordes #3E475A y hovers #2D3444; mismo tinte de marca en #062E22 |
| Elevación | Sombras fijas de Tailwind (`shadow-xl`/`shadow-2xl`) que no seguían al tema | `--oc-shadow-card`/`--oc-shadow-float` **por tema**, expuestas como **`shadow-card`**/`shadow-float`; `Card` pasa a borde neutro + `shadow-card` y modales/cajones/popovers a `shadow-float` |
| Estados | Tonos de texto AA | Sin cambios (la guarda de contraste sigue en verde con la paleta nueva) |

**Duplicación pendiente: 0 usos.** Dirección visual propuesta a **DSN** por
herdr (valores exactos); si pide ajustes, se afinan en la ronda siguiente. Se ve
en la app al subir la dependencia a **v0.25.0** (PLT).

### Lote 30 — buscador dependiente de dispositivos (25-09)

| Objeto | Antes (evidencia) | Después |
| --- | --- | --- |
| `BuscadorDispositivo` (`owncoding-ui` **v0.24.0**) | El modelo y su variante se cargaban como texto libre (el nombre del producto arrastra la capacidad, #246) y cada pantalla resolvía a mano capacidad/color; no había dependencia real | Publicado con el patrón «ciudad → departamento»: **el modelo manda** (búsqueda por nombre o **código**, tolerante a acentos) y despliega capacidad, color y conectividad (`mobile`), marca y categoría (`accesorios`) o capacidad y color (`servicio`); con catálogo propio por modelo, `permitirLibre` y limpieza automática de variantes al cambiar de modelo |
| Helpers de catálogo | Sin fuente compartida para normalizar búsquedas | `PERFILES_DISPOSITIVO`, `buscarDispositivo`, `opcionesDependiente`, `limpiarDependientes`, `etiquetaDispositivo` y `normalizarBusqueda` (la usa también el catálogo de productos) |
| Guía de adopción | — | `owncoding-ui/docs/DISPOSITIVOS.md`: quick start, perfiles por tipo de tienda, catálogo con códigos, helpers y recetas para **asistencia** (POS), **stock/recepción** y **compras/abastecimiento** (#250) |

**Duplicación pendiente: 0 usos.** Se adopta al subir la dependencia a
**v0.24.0** (PLT); las pantallas de asistencia (POS), stock (INV) y compras
(INV) lo usan con su `tipo`/perfil.

### Lote 29 — taller/rack y servicio/garantías en la biblioteca (24-09)

| Objeto | Antes (evidencia) | Después |
| --- | --- | --- |
| `ColumnaLote` (`owncoding-ui` **v0.23.0**) | El rack del taller y los tableros repiten el encabezado de columna (chip del estado + conteo + «Seleccionar todos»/«Imprimir (n)») y la lista con su vacío | Publicada: columna con `etiqueta`/`tono`/`contador`, `acciones` y `vacio`; las tarjetas van como children |
| `Vencimiento` (+`estadoVencimiento`) | `Garantias` arma a mano el semáforo de vencimiento («venció» / «en 3 d» / fecha, con urgencia) y cada dominio lo reimplementa | Publicado: el helper devuelve texto/tono/vencido/días y el objeto lo dibuja en texto o chip, con vacío explícito (sirve también a cuotas y cobranzas) |
| `Stepper` `tarjetas` con `detalle` | El pipeline del taller (`ServicioTecnico`, v2) dibuja su propio `<ol>` con el conteo por paso («2 equipos») | El `Stepper` en tarjetas acepta `detalle` por paso: el flujo del taller y el de entrega comparten objeto |
| `PasosEquipo` | Ya publicado en el lote 28 (v0.22.0) | El rack puede reemplazar su copia local (`shared/PasosEquipo`) por el de la biblioteca |

**Duplicación pendiente: 0 usos.** Con el paquete adoptado en MobOS, estos
objetos se usan al subir la dependencia a **v0.23.0** (PLT) y adoptar en el
taller/rack (PLT/INV) y en servicio/garantías (CRM/FIN según pantalla).

### Lote 28 — objetos para los lotes F4 A/C/E/F/G (24-09)

| Objeto | Antes (evidencia) | Después |
| --- | --- | --- |
| `TileRol` (`owncoding-ui` **v0.22.0**) | El lote F arma los tiles de rol/acceso a mano (`RolesPermisos`: título + descripción + «18/32» + chips de dominio) | Publicado: descripción, conteo en número grande y dominios como chips según el acceso; `onAbrir` lo vuelve botón |
| `PasosEquipo` | El indicador compacto del servicio/rack vive solo en MobOS (`shared/PasosEquipo`, 2 usos) | Publicado en la biblioteca (puntos + paso actual, `actual` por id o índice) para el **lote E** y cualquier flujo de una línea |
| `Stat` (lote A) | Los KPIs de consola se armaban a mano (`Resumen`: número `v2-numero` + chip de tendencia o barrita) | `Stat` suma `deltaComo="chip"` y `barra` (y el valor con `.v2-numero`): el mismo objeto para el resumen y el tablero |
| `FichaCertificado` (lote G) | El informe público ya pasaba `puntaje`, `condicion`, `repuestosNoOem` y `repuestosNoOemNota` y el objeto los ignoraba (contrato de #240 pendiente en la biblioteca) | Publicados en v0.22.0: la ficha muestra puntaje, condición y los repuestos no OEM con su nota |

**Duplicación pendiente: 0 usos.** Con el paquete ya adoptado en MobOS
(`owncoding-ui` en `package.json` desde v0.21.0), estos objetos se pueden
adoptar directo: el **informe público** gana la condición y los repuestos no OEM
al subir la dependencia a v0.22.0, y el lote F puede reemplazar su `TilesRoles`
local por `TileRol`.

### Lote 27 — tokens v2 globales en la biblioteca (24-09)

| Objeto | Antes (evidencia) | Después |
| --- | --- | --- |
| Paleta de la biblioteca (`owncoding-ui` **v0.21.0**) | El lenguaje "device ops" vivía en el scope `.tema-v2`/`.v2-piloto`, así que cada app mantenía su bloque local de tokens (MobOS: `src/index.css`) | Promovidos a **paleta global** (`:root`/`html.dark`): claro `#F6F8FB` con tonos de texto AA (`ok #166534`, `bad #B91C1C`, `warn #92400E`, `info #2059BE`) y oscuro `#0E1116`/`#1F2430` (`ok #4ADE80`, `bad #FCA5A5`, `warn #FCD34D`, `info #9FB8FF`); pass `#22C55E` y acción `#4D7CFE` en cualquier tema |
| Scope `.tema-v2`/`.v2-piloto` | Contenía los tokens del piloto | Queda como **alias temporal sin overrides** (ahí viven las reglas del shell y de contenido); se retira cuando las apps terminen la migración |
| Guardas | El contraste se medía en el scope | `test/contraste-tokens.test.js` mide **la paleta global** (claro y oscuro) y `tokens.test.js` fija que el alias no tenga overrides |
| Coordinación | — | Avisados **DSN** (borrar el bloque de tokens del scope en `src/index.css` cuando migre; las reglas quedan) y **PLT** (adopción del paquete + `styles.css`, con el checklist de `docs/ADOPCION.md`) |

**Duplicación pendiente: 0 usos.**

### Lote 26 — recepción e incidencias en la biblioteca (24-09)

| Objeto | Antes (evidencia) | Después |
| --- | --- | --- |
| `FilaRevision` (`owncoding-ui` **v0.20.0**) | La recepción (#250 F5) armaría a mano la fila «esperado vs encontrado» con su chip de estado y acciones | Publicada: lo esperado + serial (últimos 4) o «IMEI pendiente», chip del estado y acciones; las incidencias usan la superficie suave del tono |
| `SelectorIncidencia` | Elegir/quitar el tipo de incidencia por unidad no tenía objeto | Publicado: botones cortos con el tono del tipo (por prop); tocar el activo lo quita |
| `DestinoRecepcion` | «Recibir en depósito predeterminado (un clic) o elegir otro» no tenía objeto | Publicado: depósito por defecto, alternativa en `Select` y aviso de unidades sin IMEI |
| Mapa de revisión | Cada pieza iba a repetir etiquetas y tonos | `utils/revision.js` con `ESTADOS_REVISION`/`INCIDENCIAS` (singular, plural y tono en un solo lugar), compartido por la fila, el selector y `ResumenIncidencias` |
| Verificación en la app | — | QA de producción repetido: **10/10 en v1.0.158** (identidad + stepper v2 con el flag); el hallazgo del estado de demo sigue anotado para POS/DSN |

**Duplicación pendiente: 0 usos.** Los objetos quedan para que INV los adopte
cuando construya la pantalla de recepción (F5); props en
`owncoding-ui/docs/REGLAS.md` §4.

### Lote 25 — envíos, recepción y banner de conexión (24-09)

| Objeto | Antes (evidencia) | Después |
| --- | --- | --- |
| `ContadorLote` (`owncoding-ui` **v0.19.0**) | El «3 de 12» de lotes/etiquetas/recepción (#250 §2) no tenía objeto | Publicado con variantes `texto`/`chip`/`barra` (progressbar accesible), tono por avance y `mostrarFaltan` |
| `ResumenDestinos` | La consolidación de una compra (#250 §5) se mostraría a mano | Publicado: «1 pedido A · 3 stock», conserva los destinos y avisa por callback al elegir |
| `ResumenIncidencias` | La recepción (#250 §9/§10) mostraría los conteos a mano | Publicado: faltantes/sobrantes/dañadas/incorrectas/sin IMEI con conteos reales; sin incidencias lo dice en verde |
| `IndicadorConexion variante="banner"` | El aviso ancho de sin conexión del shell era app-side (pendiente de `SHELL.md` §7) | Franja ancha con la superficie roja y texto legible por tema + `mensaje` propio; el chip de la cola no cambia |
| Verificación en la app (#211/#241) | — | `e2e/prod/211-identidad.mjs` ampliado: **10/10 en v1.0.156**, incluido el stepper v2 del pedido con el flag y la identidad en pedido/bloqueo; **hallazgo**: en los pedidos del demo el stepper no marca el paso actual (el `fulfillmentStatus` de las ventas demo es el texto de `entrega`; reportado para POS/DSN) |

**Duplicación pendiente: 0 usos.** Con el banner, `SHELL.md` §7 solo deja
app-side el alternador de tema (la cosecha del ramal `lib` lo trae).

### Lote 24 — abastecimiento y entrega en la biblioteca (24-09)

| Objeto | Antes (evidencia) | Después |
| --- | --- | --- |
| `Stepper` `variante="tarjetas"` (`owncoding-ui` **v0.18.0**) | DSN armó el stepper de entrega a mano en `PedidoDetalle` (pasos por método, activo azul `v2-paso-activo`, cumplidos verdes, grilla 2/4) | Publicado como variante del `Stepper` único: `pasos` (etiquetas u objetos) + `actual`/`hechos`, `ariaLabel`; el mapeo de estados de `entrega.js` queda en la app |
| `CampoSeriales` + serial utils | El pegado múltiple de IMEI (compra/recepción, #250 F3) y la validación Luhn no tenían objeto: `imeiValido` vivía en `lib/imeiComprobante.js` (app) | `CampoSeriales` (pegar/escanear con conteos de listos/repetidos/inválidos y solo los válidos únicos por callback) + `imeiValido`, `separarSeriales` y `normalizarSeriales` en `utils/serial.js` |
| `MedidorStock` | Las alertas de reposición y el futuro panel de abastecimiento muestran «Stock X de Y» con badge a mano | Objeto con tonos agotado/reponer/en stock en variantes `texto`/`chip`/`barra`; sin dato dice «Sin dato» |
| Verificación post-deploy (#211) | — | `e2e/prod/211-identidad.mjs` repetido con la **v1.0.154**: 8/8 (chips en pedido y bloqueo, sin imágenes rotas ni errores); reporte actualizado |

**Duplicación pendiente: 0 usos.** Los objetos quedan para que DSN (stepper) e INV
(abastecimiento, #250 F3/F5) los adopten cuando importen el paquete; el detalle
de props está en `owncoding-ui/docs/REGLAS.md` §1/§4/§8 bis.

### Lote 23 — pila de personas y miga de sección (24-09)

| Objeto | Antes (evidencia) | Después |
| --- | --- | --- |
| `PilaPersonas` (`owncoding-ui` **v0.17.0**) | La píldora de presencia del shell apilaba avatares y armaba el texto a mano (`PresencePill` de PLT, adopción pendiente) | Publicada como objeto: avatares superpuestos con punto de presencia, contador «+N», `onMas` y `resumenPresencia` («Ana en línea» / «3 en línea»); usa `PersonaChip` y no hace fetch |
| `PageHeader` con migas | La miga de sección («Subpágina / Pestaña») vivía solo en el shell de MobOS | `PageHeader` suma `migas=[{ etiqueta, href? }]` con `aria-current="page"` (v0.17.0) |
| Verificación post-deploy (#211) | — | `e2e/prod/211-identidad.mjs` recorre producción (demo anónimo): versión ≥ v1.0.153, chips en pedido/bloqueo, sin imágenes rotas ni errores — **8/8** con capturas en `docs/qa/211-identidad-prod/` y reporte en `docs/QA-211-identidad-produccion.md` |

**Duplicación pendiente: 0 usos.** Con esto el pendiente de presencia de
`SHELL.md` §7 queda cerrado; siguen app-side el alternador de tema y el banner
ancho de sin conexión.

### Lote 22 — identidad de usuario unificada (#211) (23-09)

| Objeto | Antes (evidencia) | Después |
| --- | --- | --- |
| Identidad de usuario (`owncoding-ui` **v0.16.0**) | La cadena de foto (local → Google → iniciales) vivía repartida entre `Avatar`, el adaptador `lib/identidad.js` y cada pantalla | **`PersonaChip`** publicado como objeto único (envuelve al `Avatar`, resuelve la cadena y cae a la fuente siguiente si una imagen falla) con `user`/`foto`/`picture`/`size` (`xs`…`xl`)/`nombre`/**`nombreCorto`**/**`estado`**/`title`/`children`; más `identidadDeUsuario` y `ESTADOS_PRESENCIA` en el adaptador de la biblioteca |
| `PresencePill` (PLT) | Armaba el avatar + el punto verde a mano, con el adaptador local | Usa `PersonaChip` (`nombre={false}` + `estado="en-linea"`): mismo dibujo, una sola resolución de identidad |
| `PantallaBloqueada` (PLT) | `Avatar` + un párrafo con el nombre completo | `PersonaChip` con `size="xl" nombreCorto` (muestra el primer nombre) y la línea del PIN debajo |
| `PedidoDetalle` (POS) | La cronología dibujaba **dos avatares por evento** (uno suelto y otro junto al nombre); las transacciones usaban `Avatar` a mano | Un solo `PersonaChip` por evento (`nombreCorto` + la fecha como children) y `PersonaChip nombre={false}` en las transacciones; desaparece el avatar duplicado |
| Objetos nuevos del lote | `BarraLote` (4 archivos), `PeriodoTabs` (3) y `NumericKeypad` (2) eran copias locales | Publicados en la biblioteca v0.16.0 (`BarraLote`, `PeriodoTabs`, `NumericKeypad` + el glifo `backspace`) |

**Duplicación pendiente: 0 usos.** El API de presencia sigue sin `picture` por
persona, así que el puente por nombre (dueño → foto de Google) queda anotado en
`PresencePill` hasta que el backend exponga el campo; el contrato del objeto ya
lo cubre (`foto`/`picture`).

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
