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
| Comprobante | `/p/<token>` | Seguimiento del pedido (token de impresión) |
| Etiqueta de unidad | `/u/<serial>` | Ficha de la unidad (pide sesión) |
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
- Nunca reutilices el token del panel para imprimir ni regeneres un token
  `impreso=true` salvo reimpresión explícita: el papel ya entregado moriría.
- El `Order.publicToken` histórico sigue funcionando como nivel rápido: es la
  red de seguridad de cualquier QR viejo.
- **Si un QR impreso dice "Seguimiento no encontrado"**: el token no existe, no
  es de ese pedido o fue revocado por una reimpresión/regeneración. Se reimprime
  el comprobante (genera token nuevo) y listo; no hay que tocar la base.

## 3. Cola honesta (agente y puente)

| Estado | Significado | Acción |
| --- | --- | --- |
| `pendiente` | En cola, la impresora no respondió todavía | Esperar; el agente reintenta solo. |
| `aceptado` | El transporte aceptó (TCP/CUPS), falta papel | Confirmar "Ya salió el papel" cuando salga. |
| `confirmado` | El operador vio el papel | Nada: la cola queda limpia. |
| `incierto` | No se sabe si salió (p. ej. reinicio en medio) | **No reintenta solo**: revisar y reimprimir a mano. |
| `fallido` | Agotó intentos | Revisar impresora en Configuración → Impresoras. |

- Aceptado **no** es confirmado: la UI lo dice y no inventa éxito.
- Con trabajos encolados, abrir el diálogo avisa antes (puede duplicar el
  ticket cuando el reintento llegue).
- El trabajo remoto se confirma desde Configuración → Impresoras (ahí está el
  número secreto del puente).

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
| `PRINT_JOB_CONFIRMED` / `PRINT_JOB_CONFIRM_FAILED` | Confirmación en papel: el operador acertó (o no) el número secreto. |

- **Los tokens nunca se auditan**: ni el token del puente, ni el código de
  vinculación, ni el sufijo de confirmación (solo queda su hash cuando la
  operación lo exige). El destino LAN se guarda con el último octeto
  enmascarado (`lan:192.168.1.x:9100`).
- En la auditoría, los eventos de impresión muestran el nombre de la impresora,
  el id corto del trabajo, el transporte, ancho/copias y el texto del error; no
  se muestra el JSON crudo del backend.

### Checklist de prueba física pendiente (issue #17)

La prueba de corte por hardware todavía no está cerrada. Para hacerla:

1. Crear la cola CUPS por red en la Mac puente:
   `sudo lpadmin -p MOBOS_LAN -E -v socket://192.168.1.23:9100 -m raw`
   (el `-m raw` es obligatorio: la app manda ESC/POS ya armado).
2. Dar permiso de **Red Local** al proceso de `launchd` (Ajustes del Sistema →
   Privacidad y seguridad → Red Local); sin eso el agente sale por la ruta
   primaria y devuelve `EHOSTUNREACH` aunque desde Terminal funcione.
3. Probar desde `launchd` (no desde Terminal): instalá o actualizá el agente en
   la Mac y ejecutá el test de impresión con el tipo **Prueba de corte** desde
   Configuración → Impresoras.
4. Verificar en `/health` del agente que `red.alias` esté presente y que
   `transporte` informe el camino real (`directo`, `cups` o `usb`).
5. Confirmar en el papel: las 4 secciones de la prueba de corte y que el corte
   GS V 0 seccione el rollo (registrar el resultado en el issue #17).

> Nota: `corte()` envía solo GS V más la alimentación de 4 líneas. El `ESC i`
> que se probó al principio se retiró porque en la ZKP8008 ejecutaba un segundo
> corte; si un firmware no cortara con GS V 0, la prueba de corte permite
> comparar las 4 variantes antes de tocar el código.

### Pendientes conocidos

- **Multi-puente por sucursal (#95)**: hoy el puente es por empresa; falta
  asignarlo por sucursal para que varias cajas impriman en paralelo.
- **USB físico directo (#96)**: la implementación real del USB (sin depender de
  una cola CUPS) sigue pendiente.

## 5. Errores frecuentes y qué hacer

| Síntoma | Causa probable | Qué hacer |
| --- | --- | --- |
| Al escanear el QR: "Seguimiento no encontrado" | Token revocado o de otro pedido | Reimprimir el comprobante (token de impresión nuevo). Ver §2. |
| "Imprimir con diálogo" sale clarito o lento | Contraste de impresión perdido o mucho contenido | Usar impresión directa; revisar §1 (color-adjust y texto negro). |
| La vista previa 80 mm tiene franjas blancas | Ancho de vista desalineado | `ANCHO_VISTA` de `ComprobantePreview.jsx` debe ser 302/219 px. |
| La impresora no responde | Apagada, sin red o IP cambiada | Configuración → Impresoras muestra el estado vivo y el motivo. |
| "Sin verificar" en Impresoras | El agente no puede alcanzarla | Revisar Red Local (macOS), misma red que el local, o usar el puente. |
| El puente no reclama trabajos | Token de puente vencido/revocado | Gestionar puentes y revalidar el código de vinculación. |
| Salen dos tickets | Diálogo abierto con cola pendiente | Confirmar el papel y no reabrir el diálogo (el aviso ya existe). |
| USB no imprime | La cola USB depende de CUPS/driver | Probar el test de impresión de Configuración → Impresoras. |
| Un QR de etiqueta abre "Página no encontrada" | El papel es anterior al cambio a URLs (decía `MOBOS:`) o la base `VITE_APP_URL` quedó mal | Reimprimir la etiqueta; los códigos viejos siguen leyéndose por el código de barras. Ver "Contrato de los códigos QR". |

## 6. Verificación antes de entregar

- `npm test` (incluye `src/lib/printing/*.test.js`, `src/lib/urls.test.js`,
  `src/lib/metadataPolicy.test.js` y `src/lib/printing/qr.test.js`).
- `npm run test:e2e` con `e2e/impresion-remota.spec.js` (puente, cola y UI),
  `e2e/etiquetas-gondola.spec.js` (etiquetas de góndola) y
  `e2e/qr-unificado.spec.js` (QR con URL, `/prueba` y fichas sin sesión).
- `MOBOS_IT_EXECUTE=1 bash backend/tests/integration-http.sh` si se tocó
  backend de impresión.
- Si se tocó `print-agent/`: `npm run pack:agent` y commitear
  `backend/public/print-agent/` (`npm run pack:agent:check` es el gate).

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

1. En **Configuración → Impresoras → Comparar impresoras**, elegí entre 2 y 3
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
- **Resumen del día**: desde Resumen, botón «Imprimir resumen» con el rango
  activo. Incluye ventas, facturado, ticket promedio, productos más vendidos,
  cobrado, pendiente, comisiones, gastos y medios de pago.
- Formatos: A4, 80 mm y 58 mm (mismo selector y misma vista previa que los
  comprobantes). La impresión directa usa `ticketCierreCaja` y
  `ticketResumenDia` (ESC/POS); el HTML usa `buildCierreCajaHtml` y
  `buildResumenDiaHtml`.
- De dónde salen los números: `src/utils/reporteCaja.js` (`armarCierreCaja`) y
  `src/utils/reporteResumen.js` (`armarResumenDia`) son las **mismas funciones**
  que usan las pantallas; el papel no recalcula nada por su cuenta. Los
  movimientos del cierre se filtran a la ventana de la sesión (apertura→cierre)
  y los cobros por medio de pago salen de `GET /api/cash/audit?branchId=&date=`
  (el día de la apertura; en demo, de los pagos locales).
