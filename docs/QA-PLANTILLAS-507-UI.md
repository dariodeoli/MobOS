# #507 · Editor de impresos, frontend fase 1

Base fd1135c9, rama codex/plantillas-507-ui. Contrato backend compañero e50274df. Sin publicación, cambios al agente, jobs, API privada, montos de venta ni permisos.

## Unidad utilizable

- Impresoras → Plantillas: tres tipos; crear, editar con revisión, duplicar, restaurar incorporado, eliminar y asignar por empresa o sucursal. ADMIN escribe; los otros roles leen. El servidor conserva la autoridad: una sesión limitada a sucursal recibe 403 si intenta asignar para empresa. La UI no concede permisos.
- Medidas físicas en mm, alto fijo/continuo para comprobante, orientación de contenido sin cambiar papel, márgenes, perfil/DPI/ancho útil/offsets editables. Selección de contenido permitido, posición/tamaño/alineación/rotación, contenido opcional y desplazamiento por controles o flechas (1 mm; Mayús 5 mm).
- Definición cerrada, sin datos reales/HTML/CSS/URLs; protección de bloques requeridos, cajas fuera de área útil, superposiciones, QR/barras pequeños y densidad de barras. Todos los valores de negocio se proyectan al render, no se guardan en la plantilla.
- Preview y PDF consumen el mismo HTML. Una página física por copia, MediaBox exacto, raster DPI del perfil, presupuesto explícito 20M píxeles por página. Datos completos: desborde bloquea PDF con aviso, no trunca ni reduce toda la etiqueta.
- Adopción real **Productos → Etiquetas de góndola**: usa default efectivo al abrir; selección manual entre plantillas y formato habitual; cantidades producen páginas individuales y PDF real. Plantilla activa bloquea impresión directa y acciones PNG incompatibles, muestra PDF manual. Sin custom default, conserva transporte habitual y guardas de resultado incierto.
- Demo usa memoria de la pestaña por empresa y no hace llamadas API/seed/localStorage. Contexto incluye empresa, principal, sucursal, rol/permisos y ciclo de vida; se rechazan respuestas y avisos tardíos A→B, incluso regreso A. Cliente sin caché compartida, revisión optimista y bloqueo síncrono de doble guardado.

## Evidencia ejecutada

- `node --test src/lib/printing/plantillas.test.js`: 19 PASS (presets, protección, geometría/rotación, cantidades, datos permitidos, escape, densidad, delegación premium, MediaBox 110×60 y25×90).
- `node --test src/lib/modalReglas.test.js src/lib/printing/plantillas.test.js`: 28 PASS final. El único fullFE ejecutado dio1540/1541: descubrió tamaño Modal no estándar; corregido a `amplio`, retest de la regla completo PASS. No se repitió la suite global; el integrador debe ejecutar su gate único sobre el conjunto.
- `npx playwright test -c e2e/plantillas507.frontend.config.js`: 9 PASS final; Chromium 360/390 claro y1440 oscuro. CRUD/default, teclado/mm, controles44px, sin overflow horizontal, aislamiento de empresa/rol/revisión/contexto, preview+PDF reales y sin API real. Lote2 copias con MediaBox311.81×170.08pt; Brother25×90 con70.87×255.12pt, una página sin intercambiar dimensiones. Comprobante usa builder premium real en browser; no se ensayan tokens nuevos ni se recomputan importes.
- Lint selectivo y buildFE ejecutados. npmci reporta15 vulnerabilidades existentes (5moderadas,10altas); no se cambian dependencias ni se hace auditfix.
- Tres capturas de desarrollo inspeccionadas, límite agotado: `/tmp/mobos507-editor-{360,390,1440}.png`. Tomadas antes de ajustar el nombre canónico del tamaño Modal; geometría final está validada por browser sin nuevas capturas.

## Pendientes explícitos: #507 permanece parcial

- Plantillas stock/unidad se pueden editar y previsualizar con datos ficticios; falta adopción en impresiónStock y TallerRack. No se afirma uso en esos flujos.
- Comprobante conserva TODOS sus bloques premium (empresa/título/número/fecha/cliente/artículos/pagos/garantía/total/no fiscal/QR) usando buildOrderReceiptHtml; en esta fase solo papel/márgenes y fuente de artículos tienen efecto. Posiciones/rotación/ocultación se bloquean. Falta adoptar su default en la emisión real de Pedidos y demás builders; asignarlo no sustituye todavía ese flujo. PDF de comprobantes con varios altos exige PDFs individuales.
- Salida directa propia por modelo/rollo, #506, offsets medidos/calibración, impresión/escaneo en papel, persistencia API integrada y dispositivos físicos no verificados aquí. Brother25×90/LTT110×60 son propuestas editables, no certificación. No TestFlight/iOS nativo probado.
- PDF raster de texto/QR/barras (sin texto seleccionable). Logo en etiquetas usa nombre; imágenes arbitrarias no admitidas. No arrastre ni redimensionado por puntero; controles y teclado son la alternativa accesible implementada.

## Novedades para el dueño

- Podés crear y guardar tamaños/distribuciones de etiquetas en milímetros, con una vista previa que coincide con el PDF.
- Productos permite usar tu plantilla de empresa/sucursal y descargar un lote con una etiqueta por página; no envía formatos personalizados a una impresora incompatible.
- Si un dato no cabe o un código pierde legibilidad por densidad, el sistema explica el problema antes de exportar.

## Corrección QA · QR canónico de producto y muestras (#507)

- El hallazgo P2 se corrigió en `datosProductoPlantilla`: usa `qrProducto` con `baseDeApp` o base explícita de test. Conserva el SKU completo en barras. Rechaza como base esquemas no HTTP(S), credenciales, fragmentos/consulta y valores inválidos; sin base válida deja `qr:''`, sin fallback ficticio `MOBOS:`.
- El render valida cada QR visible antes de codificar: exige URL absoluta HTTP(S) sin credenciales ni whitespace/backslash. Si falta o es crudo/javascript/capacitor, bloquea con error claro. Un QR opcional no visible no impide una etiqueta sin QR. Ningún dato privado adicional se proyecta ni se persiste en definition.
- Las dos muestras del editor usan los helpers canónicos `qrUnidad`/`qrProducto`, solo con origen de app válido y valores ficticios. No navegan ni consultan esas URLs. Con base capacitor inválida conservan el error honesto; se necesita base web válida, no se inventa soporte nativo.
- `node --test src/lib/modalReglas.test.js src/lib/printing/plantillas.test.js`: 31 PASS; nuevas regresiones URL `/producto/QA%20%2F%23%3F%C3%B1`, barras SKU intactas, whitelist sin datos privados, base ausente/inválida y QR visible, esquemas/credenciales rechazados. Lint selectivo de los tres archivos fuente/test: exit0.
- Chromium focal en5364: QR opcional real de producto + PDF110×60/una página +4bases inválidas +sin datos privados PASS. Imagen QR generada por el render (no captura) decodificada con Vision de macOS: URL exacta `https://app.example.test/producto/QA%20%2F%23%3F%C3%B1`.
- Chromium focal muestra Stock: editor/preview sin error, QR generado decodificado con Vision como `http://127.0.0.1:5364/u/350000000000000`, valor ficticio. Red externa y rutas API bloqueadas; sin DB, capturas, impresión ni suite completa.
- El primer intento del smoke de muestra Stock abortó por error de arnés: interceptaba también módulos Vite `/src/lib/api/*`, dejando la página vacía. Se acotó la interceptación scratch a pathname `/api/`; retest del único caso afectado PASS. No se cambió producto para resolver ese timeout.
- #507 sigue parcial según pendientes anteriores; esta corrección no añade transporte ni publicación229.


## Adopción operativa — 16-10-2026, base origin/main 2def9930

Rama `codex/plantillas-507-api`, rebase sin conflictos. La nueva entrega adopta
las plantillas guardadas mediante el mismo cliente de empresa/sucursal y el
mismo renderer usado por el editor. No cambia backend, agente ni trabajos.

| Criterio | Resultado y evidencia |
| --- | --- |
| Stock individual/lote/preview | Selector previo a la salida; unidades y productos conservan sus tipos/defaults. Selección mixta genera PDFs separados por medio, sin mezclar dimensiones ni cantidades. El formato habitual requiere elección explícita si había custom. |
| Taller individual/estación/lote | Todas las entradas de etiquetas abren el selector común; default de unidades, preview y PDF exacto. Un cambio de empresa/sucursal/usuario/rol reinicia selección/modal. |
| Pedidos: comprobante | Selector en `ComprobantePreview`, que usa PedidoDetalle. El constructor premium conserva pedido, total, pagos, nivel, token y contexto autorizados; no se recalculan importes. La plantilla usa el flujo térmico premium aunque la preferencia habitual sea A4. |
| Identidad unidad | IMEI completo; barcode `MOBOS:<serial>` y QR web canónico `/u/<serial>`. Batería con ciclos cero válida; proveedor solo sigla; no se proyectan costos, cliente, notas internas ni nombre de proveedor. |
| Salida incompatible | Custom bloquea agente, diálogo/PNG habituales. PDF exacto por plantilla; al elegir formato habitual vuelve la salida previa con sus guardas. No se afirma impresión física ni compatibilidad de driver. |
| Contexto | Cliente existente conserva revisiones/permisos/tenancy. Stock cierra selección al cambiar contexto; Taller remonta su selección; generación/PDF tardíos del componente común se invalidan por identidad y epoch. |

### Verificación de esta entrega

- `node --test src/lib/printing/{plantillas,etiquetasStock,etiquetaUnidad}.test.js`: **39/39 PASS**.
- Matriz Chromium dedicada puerto5364: **12/12 PASS** (9 previos + 3 adopción); después de ajustar la base premium A4→térmico y el tamaño estándar del modal, **3/3 adopción PASS** nuevamente. El cuarto caso añadido comprueba invalidación de Taller por cambio de empresa: **1/1 PASS**.
- `npm test` una vez: **1545 PASS / 1 FAIL** de1546, fallo real del tamaño `lg` del nuevo ModalStock. Corregido a `amplio`; `node --test src/lib/modalReglas.test.js src/lib/printing/plantillas.test.js`: **33/33 PASS**. No se repitió la suite completa.
- Entrada real Stock (nav-v2, U3): **1/1 PASS**, seleccionar3filas→selector→habitual conserva aviso demo sin imprimir ni inventar éxito.
- `npm run lint`: exit0, cero errores; un warning preexistente `DeliveryOperations.jsx:42` fuera de alcance. ESLint de fuentes afectadas exit0.
- `npm run build -- --outDir /tmp/mobos507-adopcion-dist`: exit0 (14.35s); artefactos fuera del repositorio.
- Sin DB ni nueva corrida BE: la entrega cambia exclusivamente FE y conserva el contrato backend previamente verificado. Sin red de negocio real, capturas ni impresión física.

### Límites que mantienen #507 parcial

No incorpora todavía plantillas a certificados, hojas de estación, informes,
recepciones, manifiestos, listas de compra ni otros documentos fuera de los tres
kinds contratados. Hoja/certificado del Taller y recibo de regalo conservan su
salida premium propia, explícitamente separada de las etiquetas/comprobante.
No incorpora transporte raster/TSPL/CUPS ni calibración de equipos/rollos.
Los PDFs de comprobantes con distintos altos siguen exportándose individualmente.
Los browser de adopción usan el cliente demo aislado (datos ficticios) y componentes
operativos reales; no constituyen una nueva prueba PG del backend ni una
validación física. Stock prueba el selector operativo mixto con defaults y su entrada real desde
3filas→formato habitual en U3; Taller y Comprobante se recorren completos.
