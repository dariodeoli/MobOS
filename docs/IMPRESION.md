# Reglas de impresión (MobOS)

Regla viva del proyecto, hermana de `docs/TOKENS.md` y `docs/AVATAR.md`. Antes de
tocar impresión (comprobantes, tickets térmicos, QR, puente remoto), seguí estas
reglas. La meta: que imprimir salga bien la primera vez y que, cuando falle, se
sepa **qué mirar en menos de un minuto**.

## 1. Caminos de impresión

| Camino | Cuándo | Qué usa |
| --- | --- | --- |
| **Directa (térmica)** | Preferido con agente/puente | ESC/POS nativo (`src/lib/printing/escpos.js`, `tickets.js`): nítido, rápido, sin diálogo. |
| **Diálogo del navegador** | Respaldo manual (A4 o térmica sin agente) | HTML del comprobante (`OrderReceipt.jsx`) impreso por `printHtml`. |

- La **vista previa del modal mide el ancho real del papel** (80 mm → 302 px,
  58 mm → 219 px). Lo que se ve es lo que sale.
- El HTML de impresión fuerza contraste real: `print-color-adjust: exact` y
  texto negro en `@media print`. Si un comprobante sale clarito, es porque se
  tocó ese bloque.
- El QR del comprobante va con corrección **H** y el módulo térmico en **7**:
  un QR chico o claro es la causa número uno de "no me lee el código".

### Contrato de los códigos QR (regla dura)

Todo QR que imprime MobOS es una **URL absoluta de la app**, nunca un texto
interno tipo `MOBOS:...`: quien lo escanee con el teléfono tiene que abrir una
página. El dueño del contrato es `src/lib/printing/qr.js`; la base sale de
`VITE_APP_URL`, después de `VITE_PUBLIC_TRACKING_URL` y, en su defecto, del
origen donde corre la app (`window.location.origin`). Sin base no se imprime un
QR muerto: se omite el código.

| QR | Ruta | Página |
| --- | --- | --- |
| Comprobante | `/pedidos/<token>` (`/p/<token>` redirige) | Seguimiento del pedido (token de impresión) |
| Etiqueta de unidad | `/u/<serial>` | Ficha de la unidad (pide sesión) |
| Informe de dispositivo (#240) | `/u/<serial>` | Informe público de la unidad (DSN) |
| Etiqueta de precio | `/producto/<sku>` | Ficha del producto (pide sesión) |
| Ticket de prueba | `/prueba?d=&v=&f=&t=` | Verificación física de la impresión |

- La **prueba es local del agente** y no existe en la base: destino, validación,
  fecha y formato viajan en la URL para que la página sea autocontenida.
- Los QR viejos `MOBOS:<serial>`, `MOBOS:PROD:<sku>` y `MOBOS:PRUEBA:...` **ya
  no se imprimen**. El **código de barras** sigue diciendo `MOBOS:` a propósito:
  lo lee el escáner del local (teclado) y los flujos lo normalizan con
  `normalizarSerial`/`normalizeScan`, que también aceptan la URL nueva.
- La etiqueta de **ubicación** sigue con `MOBOS:UBI:<id>` como QR y código de
  barras (el flujo de recepción lo parsea); migrarlo a URL requiere su página.
- Los enlaces públicos que se muestran en pantalla (cotización, cuenta, remito,
  niveles) usan la misma base que los QR: no hay una segunda regla.

### Documentos no fiscales (entrega, cobro y cotización)

| Documento | Se emite desde | Caminos |
| --- | --- | --- |
| **Nota de entrega** | Detalle del pedido (`/pos/pedidos/:id`) | Térmica (agente o puente) y A4 por diálogo |
| **Remisión interna** | Traslados (`/inventario/traslados`) | Térmica y A4, con firma de entrega y recepción |
| **Recibo interno** | Cobro del pedido (Pagos y comprobantes) | Térmica y A4, para un pago puntual |
| **Proforma / presupuesto** | Cotización (Enlace/QR) | Térmica y A4, sin el QR de aceptación |
| **Etiqueta/guía AEX** | Traslados con guía AEX | PDF que emite AEX (`/api/aex/label`), abierto para imprimir |

- Todos llevan la leyenda visible **«Documento no fiscal»** y salen por
  `imprimirDocumentoNoFiscal` (`src/lib/printing/documentos.js`): primero la
  térmica (agente local o puente); el diálogo del navegador es solo el respaldo
  de un fallo claro. Tras encolar o un resultado incierto no se abre el diálogo.
- **Firmas y aclaraciones (#206):** los documentos que se firman reservan
  espacio real para escribir a mano. A4: 18 mm sobre la línea de firma y campos
  de aclaración, CI y fecha debajo. Térmicos (58/80): 3 avances (~12 mm) más la
  línea ancha, con los campos en líneas cortas; el diseño de 58 mm no es el de
  80 escalado. El área de observaciones va con aire, nunca al borde.
- **Comprobante rápido (#215 §10):** en **Vendidos**, el ícono de cada fila
  imprime el comprobante de la venta (nivel Rápido, el mismo comprobante de la
  app) sin abrir la ficha; sale directo por la impresora configurada (80 mm por
  defecto) y, ante un fallo claro, el PDF de respaldo con `OrderReceipt`.
- **Etiquetas del lote (#218):** en **Traslados**, la acción «Etiquetas» de una
  transferencia reimprime todas las unidades del lote y la recepción («Recibir
  lote» o «Recibir en sucursal») permite reimprimir la de una unidad; sale desde
  la sucursal donde está el lote (destino), sin depender del origen.
- Los tickets ESC/POS viven en `src/lib/printing/tickets.js`; los HTML A4, en
  `src/components/shared/OrderReceipt.jsx` (mismo `styles()` que el comprobante).
- La **etiqueta AEX** es la excepción al camino térmico: AEX devuelve un PDF ya
  maquetado (formatos `etiqueta8x6`, `etiqueta8x10`, `etiqueta65x45`, `guia`,
  `guia_A4`, `guia_A5`, `guia_A6`) y no se re-renderiza. Se descarga por
  `GET /api/aex/label?guia=&formato=&partida=` y se abre en una pestaña para el
  diálogo del sistema; sin credenciales de AEX la app ofrece el enlace web.

## 2. Tokens del QR impreso (regla dura)

- El QR del comprobante usa el **token de impresión** del nivel
  (`impreso=true`), pedido por `tokenDeNivel()`.
- El panel **Acceso del cliente** lista y regenera **solo** los enlaces
  compartibles (`impreso=false`). Regenerar un enlace **no invalida el papel**.
- El QR impreso **no vence por fecha**: sigue abriendo mientras nadie lo rote.
  Solo deja de funcionar si se usa **Regenerar acceso QR** (revoca los tokens
  impresos y los enlaces del pedido), si se regenera explícitamente el token
  `impreso=true` de ese nivel o si se revoca el puente en la app.
- **Cómo reimprimir**: abrí el pedido → *Imprimir comprobante*; el comprobante
  reutiliza el token `impreso=true` del nivel elegido y sale con el mismo QR (o
  genera uno nuevo si ese nivel no tenía). Si el papel viejo ya no debe servir,
  usá **Regenerar acceso QR** *antes* de reimprimir: invalida todo lo anterior y
  el comprobante nuevo sale con un código distinto.
- En la base, el token histórico de seguimiento (`Order.publicToken`) ya no se
  guarda en claro: los enlaces viejos se validan por su hash (sha256) y quedan
  invalidados al regenerar el acceso del pedido. El enlace de seguimiento de un
  pedido nuevo es un token de nivel rápido (`impreso=false`), así que el panel
  puede volver a copiarlo, y rota con **Regenerar acceso QR** (junto con el
  papel y los enlaces compartidos).
- Nunca reutilices el token del panel para imprimir ni pases `regenerate` sobre
  un token `impreso=true` (salvo reimpresión explícita): el papel ya entregado
  moriría.
- El `Order.publicToken` histórico sigue funcionando como nivel rápido: es la
  red de seguridad de cualquier QR viejo.

### El QR impreso no vence (#178) y cómo reimprimir

- Los tokens del papel **no vencen**: `OrderAccessToken` no tiene fecha de
  expiración. Un comprobante de hace meses sigue abriendo su vista.
- **Reimprimir el mismo nivel reutiliza el mismo token**: `tokenDeNivel()`
  devuelve el vigente (`impreso=true`, sin `regenerate`), así que el papel nuevo
  trae el mismo QR y el viejo sigue abriendo. Cambiar de nivel emite el token de
  ese nivel; el papel del otro nivel no se toca.
- La única acción que invalida papel es **«Regenerar acceso QR»**
  (`revokeAll=true`, pestaña Acceso del cliente): revoca impresos y compartidos
  a la vez. Se usa solo si un código se filtró; después hay que reimprimir.
- **Cómo reimprimir**: abrí el pedido → «Imprimir comprobante» → elegí nivel y
  formato → «Impresión directa» (o «Imprimir con diálogo» como respaldo). No hay
  que tocar la base ni generar nada a mano.
- **Si un QR impreso dice "Seguimiento no encontrado"**: el token no existe, no
  es de ese pedido o fue revocado. Reimprimí el comprobante (el mismo nivel emite
  un token vigente) y el papel vuelve a abrir. Ver §5.

## 3. Cola honesta (agente y puente)

| Estado | Significado | Acción |
| --- | --- | --- |
| `pendiente` | En cola, la impresora no respondió todavía | Esperar; el agente reintenta solo (el panel puede cancelarlo, §10). |
| `aceptado` | El transporte aceptó (TCP/CUPS), falta papel | Confirmar "Ya salió el papel" cuando salga. |
| `confirmado` | El operador vio el papel | Nada: la cola queda limpia. |
| `incierto` | No se sabe si salió (p. ej. reinicio en medio) | **No reintenta solo**: revisar y reimprimir a mano. |
| `fallido` | Agotó intentos | Revisar impresora en **Configuración → Dispositivos · Impresoras**. |
| `cancelado` | Se canceló antes de salir (nadie lo reclamó) | Nada: **no sale al reconectar**. Lo reclamado/aceptado/incierto no se cancela. |

- Aceptado **no** es confirmado: la UI lo dice y no inventa éxito.
- Con trabajos encolados, abrir el diálogo avisa antes (puede duplicar el
  ticket cuando el reintento llegue).
- El trabajo remoto se confirma desde **Configuración → Dispositivos · Cola e
  historial** (ahí está el número secreto del puente).
- **Cancelar** (individual o en lote): en la cola del monitor
  (**Configuración → Sistema · Estado del sistema**) se cancela lo que sigue `pendiente`, con
  confirmación; solo ADMIN/GERENTE y queda auditado con el usuario real. El
  detalle (API, lote, permisos) está en §10.
- **Anti-duplicados**: un encolado idéntico (mismo documento + tipo +
  impresora) de los últimos **60 s** se bloquea mostrando el pendiente; la app
  ofrece **«Reimprimir igual»** como confirmación explícita. Detalle en §11.
- **Validación en papel (#138)**: el panel conoce el **largo** del sufijo (el
  valor nunca sale del servidor ni se expone en el listado) y valida **solo** al
  completar el código: la prueba (1 dígito) apenas se escribe y un sufijo mayor
  al llegar a su largo, con un debounce corto para poder corregir. El botón
  **Confirmar** y **Enter** quedan como respaldo. **Si el número no coincide**,
  el aviso "No coincide" es claro y se puede reintentar; al confirmar, el input
  se limpia y la fila pasa a «✓ en papel». Un trabajo sin largo conocido
  (anterior a la columna `suffixLength`) se valida con el botón.
- La **prueba física** en la Mac (launchd, IP secundaria, CUPS, USB y corte)
  tiene su checklist en **`docs/IMPRESION-PRUEBA-FISICA.md`** (#170).

## 4. Registro y auditoría de impresión

Todo lo que pasa en el panel de impresoras queda en la auditoría del negocio:
quién tocó qué, cuándo y con qué valores. Se ve en
**Configuración → Seguridad → Auditoría** (`/configuracion/historial`), filtrando
por área en el selector: `Impresión · trabajo`, `Impresión · puente` e
`Impresión · impresora`.

### Eventos que se registran

| Acción | Qué significa |
| --- | --- |
| `PRINT_PRINTER_CREATED` | Se dio de alta una impresora (nombre, conexión, destino con IP enmascarada, ancho, copias). |
| `PRINT_PRINTER_UPDATED` | Se editó una impresora: metadato `changes` con el valor **antes → después** de cada campo. |
| `PRINT_PRINTER_DELETED` | Se eliminó una impresora (queda el resumen de cómo estaba). |
| `PRINT_PRINTER_DISABLED` / `PRINT_PRINTER_ENABLED` | Se desactivó o reactivó la impresora. |
| `PRINT_DEFAULT_PRINTER_CHANGED` | Cambió la impresora predeterminada; queda cuál era la anterior. |
| `PRINT_PRINTERS_IMPORTED` | Importación masiva de la configuración legacy: total, creadas, actualizadas y puentes. |
| `PRINT_BRIDGE_CREATED` / `PRINT_BRIDGE_REVOKED` | Alta y baja (revocación) de un puente. |
| `PRINT_BRIDGE_PAIRED` / `PRINT_BRIDGE_PAIR_FAILED` | Vinculación exitosa o intento fallido (con hash de red, nunca la IP ni el código). |
| `PRINT_JOB_ENQUEUED` | La app encoló un trabajo; queda el camino (remoto/local), tipo, impresora y tamaño. |
| `PRINT_JOB_ACCEPTED` | El agente/puente reportó que el transporte aceptó el envío (TCP/CUPS/USB). |
| `PRINT_JOB_INCIERTO` | No se sabe si salió (reinicio en medio): no reintenta solo. |
| `PRINT_JOB_FAILED` | El trabajo falló o agotó intentos, con el error reportado. |
| `PRINT_JOB_REQUEUED` | Un lease venció y el trabajo volvió a la cola. |
| `PRINT_JOB_CANCELLED` | Se canceló un trabajo `pendiente` (individual o en lote); el metadato dice `via` y el actor real. |
| `PRINT_JOB_CONFIRMED` / `PRINT_JOB_CONFIRM_FAILED` | Confirmación en papel: el operador acertó (o no) el número secreto. |

- **Los tokens nunca se auditan**: ni el token del puente, ni el código de
  vinculación, ni el sufijo de confirmación (solo queda su hash cuando la
  operación lo exige). El destino LAN se guarda con el último octeto
  enmascarado (`lan:192.168.1.x:9100`).
- En la auditoría, los eventos de impresión muestran el nombre de la impresora,
  el id corto del trabajo, el transporte, ancho/copias y el texto del error; no
  se muestra el JSON crudo del backend.

### Prueba física pendiente (#17 launchd/CUPS y #96 USB)

El paso a paso vive en **`docs/IMPRESION-PRUEBA-FISICA.md`** (incluye qué mirar
ante cada error y qué registrar en cada issue). Resumen: la cola CUPS se crea
con `sudo lpadmin -p MOBOS_LAN -E -v socket://192.168.1.23:9100 -m raw`, el
agente tiene que correr **por `launchd`** con permiso de **Red local**, y la
prueba de corte (4 secciones + corte GS V 0) se corre desde
**Configuración → Dispositivos · Impresoras**. El USB directo se enciende con `"usb": true` y su
estado se verifica en `/health.usb`. Salidas esperadas para comparar el papel
(tickets de prueba en PDF): `docs/qa/impresion-fisica/`.

> Nota: `corte()` envía solo GS V más la alimentación de 4 líneas. El `ESC i`
> que se probó al principio se retiró porque en la ZKP8008 ejecutaba un segundo
> corte; si un firmware no cortara con GS V 0, la prueba de corte permite
> comparar las 4 variantes antes de tocar el código.

### Pendientes conocidos

- **USB físico directo (#96)**: la implementación y el empaquetado están
  (node-usb viaja en el tarball del agente; ver `print-agent/USB-DIRECTO.md`);
  solo falta la **prueba física con la ZKP8008** en la Mac (conectar por USB,
  encender `"usb": true` y verificar el ticket y `/health.usb`). Al igual que la
  prueba de agente/CUPS (#17), queda en manos de Dario con el checklist
  `docs/IMPRESION-PRUEBA-FISICA.md`.
- **Multi-puente por sucursal (#95)**: implementado (los puentes y las
  impresoras se asignan por sucursal y la app resuelve el puente por la sucursal
  del trabajo, con fallback al predeterminado de la empresa; ver la cobertura e2e
  «dos sucursales: cada trabajo sale por el puente de su sucursal»).

## 5. Errores frecuentes y qué hacer

| Síntoma | Causa probable | Qué hacer |
| --- | --- | --- |
| Al escanear el QR: "Seguimiento no encontrado" | Token revocado o de otro pedido | Reimprimir el comprobante; el papel viejo sigue sirviendo (el QR impreso no vence). Ver §2. |
| "Imprimir con diálogo" sale clarito o lento | Contraste de impresión perdido o mucho contenido | Usar impresión directa; revisar §1 (color-adjust y texto negro). |
| La vista previa 80 mm tiene franjas blancas | Ancho de vista desalineado | `ANCHO_VISTA` de `ComprobantePreview.jsx` debe ser 302/219 px. |
| La impresora no responde | Apagada, sin red o IP cambiada | **Configuración → Dispositivos · Impresoras** muestra el estado vivo y el motivo. |
| "Sin verificar" en Impresoras | El agente no puede alcanzarla | Revisar Red Local (macOS), misma red que el local, o usar el puente. |
| El puente no reclama trabajos | Token de puente vencido/revocado | Gestionar puentes y revalidar el código de vinculación. |
| Salen dos tickets | Diálogo abierto con cola pendiente | Confirmar el papel y no reabrir el diálogo (el aviso ya existe). |
| El segundo click del mismo comprobante no encola y avisa | Guarda anti-duplicados (60 s) | «Reimprimir igual» si querés otra copia; si no, esperar a que salga el pendiente. Ver §11. |
| Un trabajo quedó en la cola y no sale al reconectar | Está `cancelado` (nadie lo reclamó) | Es lo esperado: el cancelado no sale. Reimprimí si hace falta. Ver §10. |
| El código del papel no valida solo | Trabajo anterior a `suffixLength` (largo desconocido) o el puente no respondió | Escribirlo y usar **Confirmar**; si dice "No coincide", revisar el número del papel (va después del guion). Ver §3. |
| USB no imprime | La cola USB depende de CUPS/driver o falta la bandera | Checklist `docs/IMPRESION-PRUEBA-FISICA.md` §3 (USB con la ZKP8008). |
| Un QR de etiqueta abre "Página no encontrada" | El papel es anterior al cambio a URLs (decía `MOBOS:`) o la base `VITE_APP_URL` quedó mal | Reimprimir la etiqueta; los códigos viejos siguen leyéndose por el código de barras. Ver "Contrato de los códigos QR". |

## 6. Verificación antes de entregar

- La **distribución del agente** (versiones, allow-list, checksum y rollback)
  está en **`docs/IMPRESION-INSTALADOR.md`**.
- `npm test` (unitarios de `src/**` + los del agente: `print-agent/test/**`,
  incluido el instalador y el empaquetado de `usb`).
- `npm run test:e2e` con `e2e/impresion-remota.spec.js`: configuración, cola del
  monitor (cancelación individual y **en lote**, reconexión del puente), **anti-duplicados**
  con «Reimprimir igual» y **validación en papel** (auto con 1 dígito, sufijo
  largo y botón como respaldo). Además `e2e/etiquetas-gondola.spec.js` (etiquetas)
  y `e2e/qr-unificado.spec.js` (QR con URL, `/prueba` y fichas sin sesión).
  Las rutas públicas de esos QR (`/producto/:sku` y `/prueba`) tienen su
  verificación viva en `e2e/ocultos-plataforma.spec.js`.
- `npm run test:e2e:smoke` como gate rápido durante el trabajo (~20 s).
- **Evidencia de imprimibles (#206):** `scripts/qa-206-imprimibles.mjs`
  renderiza cada documento a PDF por tamaño con su captura
  (`docs/qa/206-imprimibles/`); `QA_SOLO=doc1,doc2` regenera solo esos.
  `scripts/qa-206-imprimibles-prod.mjs` repite la verificación contra el demo
  desplegado (`docs/qa/206-imprimibles-prod/`), mide el bloque de firma en el
  layout real del rollo y exige las marcas del rediseño en el bundle.
- `MOBOS_IT_EXECUTE=1 bash backend/tests/integration-http.sh` si se tocó
  backend de impresión (cubre estados de la cola, cancelación, anti-duplicados y
  el claim del puente).
- Si se tocó `print-agent/`: `npm run pack:agent` y commitear
  `backend/public/print-agent/` (`npm run pack:agent:check` es el gate).
- La prueba en la Mac física (launchd/IP secundaria, CUPS, USB, corte) sigue el
  checklist `docs/IMPRESION-PRUEBA-FISICA.md`.

## 7. Etiquetas de producto/góndola (#97)

- Se disparan desde **Productos** (selección múltiple → «Etiquetas», o la ficha
  del producto → «Etiqueta de precio») y desde **Inventario** (botón
  «Etiquetas de góndola», con búsqueda por nombre o SKU).
- En el modal se eligen los productos y la **cantidad de etiquetas por
  producto**. «Imprimir etiquetas» manda el ESC/POS
  (`ticketEtiquetasProducto`) a la impresora configurada y, si no hay agente ni
  impresora remota, cae al diálogo del navegador con el HTML
  (`buildProductLabelsHtml`); «Descargar PDF» abre ese mismo HTML para guardarlo.
- Formato: 58 y 80 mm según el ancho de la impresora predeterminada
  (`configImpresora().ancho`). Cada etiqueta corta al final.
- Contenido: nombre, precio, SKU y **código de barras sobre el SKU**. Si el SKU
  es un EAN-13 válido (12 o 13 dígitos con verificador correcto) se usa
  **EAN-13** nativo (`GS k 67`, la impresora calcula el verificador); si no,
  **CODE128** (`GS k 73`) con módulo 2 y altura 80 puntos. El precio es
  `pricePyg`; si quien llama pasa `precioPyg`/`lista` (lista del cliente o
  escalón por cantidad), ese manda y la etiqueta aclara la lista.
- **Verificación con el lector del local**: escaneá la etiqueta impresa; el
  valor leído debe ser exactamente el SKU (o el EAN-13 con su verificador) y el
  precio del papel debe coincidir con el de la venta. Si el lector no toma,
  revisá el ancho configurado (módulo 1 sale ilegible) y que el papel no haya
  salido corrido.

### Etiquetas de unidades de stock (#220)

- **Contenido** (una definición en `src/lib/printing/etiquetaUnidad.js`, usada
  por el ticket ESC/POS y por el HTML/PDF): **modelo** (con capacidad y color
  cuando no vienen en el nombre), **identificador** corto (últimos 4 del
  serial), **IMEI/serial completo legible**, **código QR** (URL `/u/<serial>`),
  **código de barras** sobre `MOBOS:<serial>` y el código de unidad como texto.
  Cada pieza va en su bloque, separada por líneas/bordes: no se pegan QR y
  barras.
- **Impresión**: desde la ficha de la unidad («Etiqueta»), desde la selección
  múltiple de Inventario («Imprimir etiquetas») o la barra de lote. Sale
  **directo** por el agente o el puente, sin diálogo; el HTML
  (`buildUnitLabelsHtml`) es el respaldo ante un fallo claro y la fuente del
  PDF. El ancho sale de `configImpresora().ancho` (58 u 80 mm).
- **Reimpresión al llegar a otra sucursal**: la recepción en tránsito
  (Inventario → En tránsito → «Recibir en sucursal») trae «Reimprimir etiqueta»
  para que el destino imprima el papel sin depender de la sucursal de origen; el
  lote completo se reimprime desde Traslados → «Etiquetas» de la transferencia
  (#218), resuelto con las unidades que están en la sucursal activa.
- Evidencia: `scripts/qa-220-etiquetas.mjs` genera los PDFs por tamaño con
  captura y valida el contenido (`docs/qa/220-etiquetas/`); el e2e
  `etiquetas-unidad.spec.js` cubre individual, seleccionadas y reimpresión por
  el camino directo.

### Informe de dispositivo (#240, épica PhoneCheck)

- **Qué es**: el informe imprimible de una unidad física, desde la ficha
  (acción «Informe»). Reúne el equipo (modelo, condición, batería, ubicación,
  proveedor), la última **verificación IMEI** (blacklist, Find My/iCloud, SIM
  lock, MDM, garantía del proveedor), la **inspección física** (quién y cuándo
  verificó, cantidad de verificaciones, grado y checklist) y la **garantía de la
  tienda**, con el **QR al informe público**.
- **Formatos**: 80 mm (y 58 mm si así está configurada la impresora) por
  **impresión directa** ESC/POS (`ticketInformeDispositivo`), y **A4** o rollo
  por el diálogo / «Descargar PDF» (`buildInformeDispositivoHtml`). La vista
  previa del modal respeta el ancho real (302/219 px) y el formato elegido.
- **Datos** (una sola definición en `src/lib/printing/informeDispositivo.js`):
  la unidad de INV + `GET /api/imei?imei=<serial>&limit=1`. Contrato con INV
  para cuando aterrice la inspección: `unit.grade` (A/B/C) y `unit.inspection`
  `{ puntaje, aprobados, total }`; sin datos, el informe dice «Sin grado
  asignado» / «Sin verificación física registrada.» en vez de inventar.
- **Privacidad**: la fila del IMEI va **enmascarada** (solo los últimos 4) y un
  serial que es IMEI (15 dígitos con Luhn) no se repite en claro. Sin costos ni
  datos internos; leyenda «Documento informativo · no válido como factura».
- **QR**: `/u/<serial>` (mismo contrato que la etiqueta #220); la página pública
  del informe es de DSN. El enlace también queda impreso como texto.
- Evidencia: `docs/qa/240-informe-dispositivo/` (PDFs A4, 80 mm HTML y ESC/POS
  80/58 + capturas, con `scripts/qa-240-informe-dispositivo.mjs`); el e2e
  `informe-dispositivo.spec.js` cubre la impresión directa por el agente y el
  respaldo A4 para «Guardar como PDF» (capturas en `test-results/`).

## 8. Telemetría y comparativa de impresoras

### Qué mide cada tiempo

| Campo | Cuándo se escribe | Qué significa |
| --- | --- | --- |
| `enqueuedAt` | Al crear el trabajo (`POST /api/print/jobs`) | Instante en que la app encoló el ticket. |
| `claimedAt` | Al reclamarlo el puente (`POST /api/print/bridge/claim`) | Cuándo un puente tomó el trabajo. |
| `confirmedAt` | Al reportar el resultado (ACEPTADO/INCIERTO/FALLIDO) o al vencer el lease | Cierre del trabajo. La confirmación en papel no lo pisa; solo lo completa en espejos locales. |
| `queueMs` | Con el resultado | `claimedAt - enqueuedAt`: lo que esperó en la cola. |
| `durationMs` | Con el resultado | `confirmedAt - enqueuedAt`: el total, de encolado a cierre. |
| `transport` | Lo informa el agente | `directo`, `cups` o `usb`: por dónde salió de verdad. |
| `printerName` | Al encolar | Foto del nombre: sobrevive a renombres y bajas. |

- Los tiempos son enteros `>= 0` (un reloj atrasado no produce negativos) y se
  calculan con el reloj de la app, no con `now()` de la base: las etapas se
  comparan entre sí y no pueden mezclar relojes.
- En Actividad cada trabajo muestra fecha con **hora:minuto:segundo**, el
  transporte y las líneas `en cola N ms` / `total N ms`; el detalle agrega
  encolado, reclamado, ambos tiempos y el transporte. El CSV exporta esas
  columnas.
- `GET /api/print/metrics?desde=&hasta=&printerId=&reference=` (ADMIN/GERENTE;
  por defecto, últimas 24 h; rango máximo 90 días) devuelve totales con tasa de
  éxito, latencia promedio y p95 global y por impresora, serie por hora
  (incluidos los huecos) y los últimos 20 trabajos. `reference` filtra por
  prefijo y es lo que usa la comparativa.

### Comparar hasta tres impresoras

1. En **Configuración → Dispositivos · Impresoras → Comparar impresoras**, elegí entre 2 y 3
   impresoras activas y vinculadas a un puente (si falta el puente, la sección
   avisa el paso que falta y ofrece gestionarlos).
2. **Enviar prueba a todas** encola el **mismo ticket** (marca
   `COMP-…` impresa en el papel y como prefijo de `reference`) a cada impresora
   por el camino remoto, y sondea las métricas hasta que todas reportan.
3. La tabla muestra impresora, ancho, transporte, cola, total, resultado y
   marca **Ganadora** a la de menor tiempo total entre las aceptadas. Un
   trabajo que no llegó a reportar queda en `pendiente` y no puede ganar.

### Panel de gráficos

- **Panel de impresiones** (misma pantalla) dibuja con SVG propio, sin
  librerías: barras de trabajos por hora, barras de latencia promedio por
  impresora e indicador de tasa de éxito, con contadores de total, promedio,
  p95 y fallos.
- Los filtros de rango (24 h / 7 d / 30 d) y de impresora se aplican en el
  servidor; la UI solo reagrupa la serie horaria cuando hay más barras de las
  que se pueden leer (7 y 30 días). Los números no se recalculan en pantalla.

## 9. Reportes imprimibles: cierre de caja y resumen (#98)

- **Cierre de caja**: desde Caja, al cerrar la sesión se abre la vista previa
  del cierre y queda el botón «Imprimir cierre» en la sesión cerrada. Incluye
  apertura, cobros por medio de pago, movimientos de la sesión,
  esperado/contado/diferencia y espacio de firma.
- **Resumen ejecutivo del período (A4, #146)**: desde Resumen, botón
  «Imprimir resumen» con el rango activo. El A4 es una **hoja única** con
  jerarquía ejecutiva: ventas, facturado vs cobrado (barra sólida vs trama),
  pendiente, variación contra el período anterior, ventas por día, cobros por
  medio de pago, productos principales, rentabilidad estimada (facturado −
  costo de mercadería − gastos), descuentos y envíos, stock a reponer y alertas
  de conciliación. Se lee igual en color y en blanco y negro: los bloques
  combinan tramas, bordes y etiquetas además del color. El HTML vive en
  `src/components/shared/reporteEjecutivo.js` (`buildResumenEjecutivoHtml`).
- **Resumen del día (58/80 mm)**: el mismo botón en formato térmico usa el
  ticket ESC/POS (`ticketResumenDia`) y el HTML angosto
  (`buildResumenDiaHtml`): ventas, facturado, ticket promedio, productos más
  vendidos, cobrado, pendiente, comisiones, gastos y medios de pago.
- Formatos: A4, 80 mm y 58 mm (mismo selector y misma vista previa que los
  comprobantes). La impresión directa usa `ticketCierreCaja` y
  `ticketResumenDia` (ESC/POS); el HTML usa `buildCierreCajaHtml`,
  `buildResumenDiaHtml` y `buildResumenEjecutivoHtml`.
- De dónde salen los números: `src/utils/reporteCaja.js` (`armarCierreCaja`) y
  `src/utils/reporteResumen.js` (`armarResumenDia`) son las **mismas funciones**
  que usan las pantallas; el papel no recalcula nada por su cuenta. La
  rentabilidad del ejecutivo sale de `armarResumenDia` (`costoMercaderia`,
  `ganancia`, `descuentos`) con la regla de Ganancias: costo foto de la venta y,
  si falta, costo actual del producto; la publicidad y el detalle quedan en
  Análisis → Ganancias. Los movimientos del cierre se filtran a la ventana de
  la sesión (apertura→cierre) y los cobros por medio de pago salen de
  `GET /api/cash/audit?branchId=&date=` (el día de la apertura; en demo, de los
  pagos locales).

## 10. Cancelar trabajos pendientes (#128)

Resumen operativo en **§3**; acá está el detalle y la API.

La cola del monitor (**Configuración → Sistema · Estado del sistema → Cola de impresión**)
muestra los trabajos remotos de la empresa: tipo, pedido/comprobante
(`reference`), impresora y puente/sucursal, **usuario real** (foto + nombre) que
los mandó, estado, intentos y último error.

- **Solo se cancelan los `PENDIENTE`.** Lo `RECLAMADO` (el puente lo tiene con
  lease) y lo `ACEPTADO`/`INCIERTO` (el transporte pudo haber impreso) **no se
  cancelan**: para eso está la confirmación en papel o la revisión. La API
  responde 409 con el motivo y la UI no ofrece el botón.
- **Un cancelado no sale nunca**: el claim del puente solo toma `PENDIENTE`
  (`reclamarTrabajo`), así que reconectar el puente no lo imprime. Es la
  respuesta al caso real: el puente estuvo caído, alguien apretó Imprimir
  varias veces y quedaron N copias esperando.
- **Al cancelar se borra el ticket** (`payload`): es un estado terminal, no se
  retiene el ESC/POS. La purga de metadatos (180 días) lo alcanza igual que a
  los otros terminales.
- **Auditoría**: `PRINT_JOB_CANCELLED` por trabajo, con el actor real
  (`userId` de la sesión, nunca «Sistema») y `via: individual | lote`. El
  intento rechazado (ya reclamado/aceptado) **no** deja evento de cancelación.
- **Permisos**: ADMIN/GERENTE (los mismos del monitor). Un vendedor recibe 403.
- **En lote**: se puede cancelar una selección o todos los pendientes de la
  impresora filtrada, con confirmación explícita; cada trabajo se audita por
  separado. El lote está acotado (200, el tope de trabajos abiertos).

API: `POST /api/print/jobs/[id]/cancel` (individual) y
`POST /api/print/jobs/cancel` (lote: `{ ids? , printerId?, kind? }`; sin
filtros responde 400). Ambos cancelan condicionado por estado, así que un claim
concurrente gana y ese trabajo no se cancela.

**Cubierto por** (#170): arnés HTTP (cancelación individual y lote, permisos,
claim que saltea cancelados, doble cancelación 409) y e2e del monitor
(individual y en lote).

## 11. Guarda anti-duplicados al encolar (#128)

Resumen operativo en **§3**; acá está el detalle y la API.

**Decisión**: un trabajo idéntico **abierto** (`PENDIENTE`/`RECLAMADO`) del
mismo documento (`reference`), mismo `kind` y misma impresora, encolado dentro
de los últimos **60 segundos**, se bloquea con 409 y `duplicate: true` más el
trabajo existente. El mensaje dice qué documento e impresora ya están en cola.

- **Por qué 60 s y no siempre**: el objetivo es el click repetido («no salía y
  apreté Imprimir 10 veces»), no impedir una reimpresión legítima. Pasada la
  ventana, o si el trabajo previo ya es terminal, el encolado es normal.
- **Quién decide**: la persona. La app ofrece **«Reimprimir igual»**, que
  reenvía con `force: true`; eso crea un trabajo **nuevo** (salteando también
  la `idempotencyKey`, que es permanente), y la auditoría del alta queda con
  `reimpresion: true`. Nunca se bloquea en silencio ni se reimprime solo.
- **Clave del documento**: el front manda `reference` (número de pedido,
  comprobante, remito, liquidación). Sin `reference` no hay guarda: el trabajo
  entra igual (el `idempotencyKey` de los tickets de prueba sigue funcionando
  como siempre).
- **Indicador en el diálogo**: antes de mandar, el diálogo de comprobante
  muestra cuántos trabajos pendientes hay para esa impresora en la cola del
  puente, para no encolar a ciegas (la cola local del agente ya avisaba por su
  lado).

API: `POST /api/print/jobs` responde 409 `{ message, duplicate: true, job }`;
con `force: true` responde 201 y audita `PRINT_JOB_ENQUEUED` con
`reimpresion: true`.

**Cubierto por** (#170): arnés HTTP (bloqueo, trae el pendiente, `force` crea y
audita la reimpresión) y e2e del comprobante repetido («Reimprimir igual» encola
un trabajo nuevo).

## 12. Abastecimiento (#250 §11)

Estado: la **lista de compra · 80 mm** y el **manifiesto** siguen pendientes de
implementar en PRN (fases 1–5 ya en main); la **etiqueta producto/paquete**
(fase 3) y el **comprobante de recepción** (fase 5) ya están implementados —
contratos en [ETIQUETAS-LOTE.md](ETIQUETAS-LOTE.md) y
[COMPROBANTE-RECEPCION.md](COMPROBANTE-RECEPCION.md).

- **Lista de compra · 80 mm** (ESC/POS + respaldo HTML A4/rollo): `code` (`COM-…`),
  recorrido/origen, comprador, proveedor, **productos agrupados con cantidades y
  prioridades**, total de líneas y **QR del panel**.
- **Etiqueta producto/paquete · 80 mm** — implementado: lo devuelve
  `GET /api/supply/purchases/[id]/labels` (`etiquetasPreparacion` en
  `backend/lib/supply.ts`): `{ n, total, producto, capacidad, condicion, imei,
  pendiente, compra, referencia, pedido, destino, lote }` → `PRODUCTO n DE N`,
  variante, **IMEI o «pendiente»**, compra, pedido, destino y lote, con el código
  de barras del IMEI (o del lote/compra si falta). Builders:
  `datosEtiquetaLote` + `ticketEtiquetasLote` (ESC/POS) +
  `buildEtiquetasLoteHtml` (rollo/compartir). Ensayo:
  `docs/etiquetas-lote-ejemplo/`.
- **Comprobante de recepción · 80 mm/A4** (fase 5) — implementado:
  `datosComprobanteRecepcion` (`comprobanteRecepcion.js`) alimenta
  `ticketComprobanteRecepcion` (ESC/POS) y `buildComprobanteRecepcionHtml` /
  `printComprobanteRecepcion` (A4/rollo), con el tipo `comprobante-recepcion`
  para la impresora recordada. Esperado vs recibido por línea, faltantes,
  sobrantes y dañados con serial y nota, depósito destino, usuario y fecha/hora.
  Ensayo imprimible: `docs/comprobante-recepcion-ejemplo/` (A4, 80 mm y ESC/POS).
- **QR**: falta cerrar la **ruta pública del panel/manifiesto** (path + token y si
  abre sin sesión). Candidatas a confirmar con INV/DSN: `/m/<token>` (manifiesto
  de lote) o `/abastecimiento/compras/<id>` (panel, pide sesión). Mientras no esté
  definida, el papel imprime el identificador como barras y el texto
  «Escaneá para abrir el panel de la compra.» (misma regla que el informe). El
  comprobante de recepción respeta la misma regla: el QR solo sale con un
  `enlace` absoluto; el panel lo pasa cuando la ruta esté cerrada.

## 13. Tokens v2 en los impresos (#241 · Lote H)

Los documentos impresos (informe de dispositivo, certificado, constancia,
etiquetas de unidad y del abastecimiento) son parte del rediseño: la tipografía,
los grises y los acentos salen del **lenguaje v2** (`docs/REDISENO.md`, tokens
v2), no de valores sueltos por builder.

Reglas del lote:
- Un solo origen de color/tipografía por documento: los builders de
  `OrderReceipt.jsx` y `tickets.js` toman los tokens v2 (verde de marca, grises
  de texto, bordes) y no declaran hex nuevos.
- Los estados (Bien / Con observación / Falla) usan los tonos semánticos v2
  (`estadoEquipo.js`) también en el papel.
- El rollo (ESC/POS) mantiene su naturaleza: tipografía monoespaciada y negrita
  del equipo; la coherencia con v2 es de **jerarquía y color de marca**, no de
  fuentes.
- Evidencia obligatoria: PDFs de ejemplo A4/80 regenerados + QR decodificado.

## 14. Compartir un documento como imagen (#240/#220)

Además de imprimir o descargar el PDF, los documentos imprimibles (informe,
certificado, constancia y etiquetas) se pueden **compartir como PNG**. La imagen
sale del **mismo HTML** de «Descargar PDF»: no hay un diseño aparte que se
desincronice.

- **Objeto compartido:** `shared/CompartirImagen` +
  `lib/printing/compartirDocumento.js` (`documentoAPng`, `compartirArchivo`,
  `copiarImagen`, `nombreImagenDocumento`). Las pantallas no rasterizan por su
  cuenta (regla en `src/lib/objetosReglas.test.js`).
- **Acciones:** *Compartir imagen* (Web Share; si el navegador no comparte
  archivos, descarga el PNG y lo avisa), *PNG* (descargar) y *Copiar*
  (portapapeles como imagen, `ClipboardItem`).
- **Tamaño real del papel:** el HTML se renderiza en un iframe oculto con el
  ancho del formato (A4 794 px · 80 mm 302 px · 58 mm 219 px) y densidad 2; el
  marco lleva `data-png-documento` para no confundirse con el iframe del
  respaldo de impresión. Sin soporte o sin permiso, la pantalla avisa y ofrece
  el PDF.
- **Dónde está integrado:** certificado/informe/constancia (modal de la unidad),
  etiquetas de góndola y etiquetas del taller («Imprimir en serie»).
- **Evidencia:** `docs/QA-240-compartir-imagen.md` y capturas en
  `docs/qa/240-compartir-imagen/`.

## 15. Dispositivos: dónde vive cada cosa (#253)

La sección **Dispositivos** de Configuración (`/configuracion/dispositivos`)
tiene la pantalla de impresión ordenada en cinco paneles con URL (`?panel=`):

| Sección | Qué resuelve |
| --- | --- |
| **Impresoras** | Alta/edición, predeterminada y **pruebas** de cada impresora; comparativa de impresoras. |
| **Puentes** | Computadoras con el agente: vincular con código, sucursal que sirve, revocar; equipos con acceso. |
| **Formatos** | Qué impresora recuerda cada tipo de documento («Olvidar» vuelve a la predeterminada). |
| **Diagnóstico** | Agente de esta computadora, red (reparar/exportar), cobertura por sucursal y métricas de impresión. |
| **Cola e historial** | Cola de esta computadora (reintentar/limpiar), actividad y confirmación en papel por número secreto. |

**Impresoras vs Estado del sistema (sin duplicar):**

- **Dispositivos** = **configurar, probar y diagnosticar** el papel.
- **Sistema · Estado del sistema** (`/configuracion/sistema`) = **monitoreo
  global de la empresa**: servicios, puentes/impresoras en línea, cola global
  (ver y cancelar), correo saliente, webhooks y errores. Enlaza a Dispositivos
  para configurar; las dos pantallas se referencian y no repiten los controles.
- La cola de la empresa se **cancela** desde Estado del sistema (y su enlace
  desde «Cola e historial» apunta ahí); la cola **local** del agente se resuelve
  en Dispositivos.

Evidencia: `docs/QA-253-dispositivos.md` y capturas antes/después en
`docs/qa/253-dispositivos/`.
