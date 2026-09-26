# Novedades para el dueño

Registro acumulativo de lo que sale a producción, contado en lenguaje de negocio
(sin jerga técnica). Cada release agrega su sección `## vX — fecha` y los cambios
se agrupan por módulo: **Pedidos · Ventas · Clientes · Inventario · Impresión ·
Finanzas · Portal · Otros**.

**Cómo se mantiene:** el integrador agrega la sección de la versión publicada en
cada integración, y todo handover/cierre de issue incluye un bloque
`Novedades para el dueño` (2-5 bullets) con el resumen de lo entregado.

---

## v1.0.184 — 2026-09-26
- **Correos (#255):** **rediseño de los 10 correos transaccionales** (bienvenida, invitación de equipo, recuperación de contraseña, verificación, comprobante, informe de dispositivo, recordatorio de pago, pago vencido, estado de garantía y reserva por vencer): misma identidad que el shell y **enlace de respaldo siempre visible**.
- **Abastecimiento (#250):** **recibir todo el lote de una vez** (frena y avisa si falta algún IMEI, con acceso a prepararlos) y **comprobante de recepción** imprimible.
- **Demo (#213/#187):** **cierre visual** de la demo con capturas en **claro, oscuro y móvil**.
- **POS (#148):** cierre con **checklist por sección** y verificación vigente.

## v1.0.183 — 2026-09-26
- **Abastecimiento F2/F3/F5 (#250):** **compra parcial** (la necesidad conserva lo que falta), **líneas adicionales y reposición libre**, **preparación de compra con escaneo** (valida Luhn, rechaza duplicados y acepta pegado múltiple) y **recepción móvil**.
- **Abastecimiento (#254):** **costo real por proveedor** y **puntualidad del tránsito CDE→ASU**.
- **Impresión (#250 §11):** **etiquetas individuales** de unidad o paquete para reimprimir; impresos F4 con **QR y PNG**.
- **Demo (#213):** el historial de pedidos suma **pagos divididos con medios variados** y **autorizaciones completas**.
- **Diseño (#241):** verificación visual **post-F4** en producción.

## v1.0.182 — 2026-09-26
- **Abastecimiento (#250):** los **mínimos se revisan en cada baja de stock** (no solo al vender) y la demanda se agrupa **por origen**; el panel **«Por comprar»** consume los datos nuevos con **contadores en las pestañas**.
- **Abastecimiento (#254):** la **prioridad** de la demanda ahora pesa la **venta cobrada** y el **margen**.
- **Impresión (#250 §11):** **manifiesto del lote** y etiquetas **«N de M»**.
- **Calidad:** el aviso del portal por vencer usa **reloj fijo** en los tests (no depende del día), se retiró un verificador F1 superseded y quedó la QA final del POS con v2 por defecto.

## v1.0.181 — 2026-09-26
- **Abastecimiento (#254):** al registrar una compra se elige **contado o crédito con vencimiento** y, con el costo cargado, la compra **genera su cuenta a pagar al proveedor** en Finanzas (una compra al contado no engorda el «por pagar»).
- **Abastecimiento (#254):** re-verificado el **costo por línea en la moneda de la compra** con su total derivado.
- **Calidad:** QA de finanzas en producción (caja, conciliación y márgenes) y limpieza de un helper de prioridad que quedó sin uso.

## v1.0.180 — 2026-09-26
- **Abastecimiento (#250/#254):** el panel **«Por comprar»** suma **pestañas por estado**, **contadores** y **prioridad/fecha**; la **consolidación por centro** (CDE · USA · local) no mezcla orígenes y se puede **asignar en bloque**.
- **Abastecimiento (#254):** **costo por línea en la moneda de la compra** con total derivado.
- **Abastecimiento (#250 §11):** **lista de compra imprimible** desde el panel.
- **Impresión (#97/#240):** los **tipos de etiquetas se nombran solos** en Formatos; etiquetas de góndola y hoja de estación con ejemplos y QA.
- **Shell (#241):** **F4 aprobado por Dario y activado** (v2 por defecto) con toggle visible, verificado en producción.
- **Componentes:** objetos F1 alineados al contrato de inventario y adaptadores con la UI en la biblioteca (**v0.35.0**).

## v1.0.179 — 2026-09-26
- **Abastecimiento · Fase 1 (#250/#254):** el **Centro de compra «Por comprar»** ya funciona: las **ventas sin stock**, las **reservas faltantes** y los productos **bajo mínimo** generan necesidades, que se pueden **asignar, priorizar y cerrar** con **costo y margen estimados**.
- **Abastecimiento (#254):** cada necesidad conserva **pedido, línea y cliente** (el nombre solo para quien gestiona clientes) y queda **auditada**; el panel **«Por comprar»** llega también al **móvil** con carga manual.
- **Shell (#241):** el **switch del rediseño v2** se controla por configuración (sigue activado) con **opt-out visible** por dispositivo.
- **Calidad:** recorridos de producción post-.178 en inventario/tránsito, finanzas, POS e impresión, con capturas.

## v1.0.178 — 2026-09-26
- **Mobile (#249):** en la línea del carrito del POS, la **papelera** y el **botón de detalle** quedan con **área táctil exacta de 44 px** (el control automático de mobile vuelve a estar en verde).

## v1.0.177 — 2026-09-26
- **POS (#148/#187):** las **ventas y pedidos del día se cuentan por orden**, no por unidad: los totales de portada y caja vuelven a coincidir con las operaciones reales.
- **Impresión (#240):** **hojas por estación** del taller y **certificados en serie**: se imprimen varios equipos de una sola vez.
- **Demo (#219):** el equipo demo tiene **fotos de perfil ficticias** y datos consistentes en todas las pantallas.
- **Mobile (#249/#245):** las acciones de las **listas de precios** llegan al mínimo táctil de 44 px (cierra el barrido de controles chicos).
- **Componentes:** el **kit de interfaz sale de la biblioteca** (v0.32.0): las piezas compartidas se mantienen en un solo lugar.
- **Diseño (#241):** paquete de **activación de F4** con checklist y capturas finales por dominio.

## v1.0.176 — 2026-09-26
- **Calidad (#148 · #17/#96):** verificaciones en **producción** de finanzas (caja, conciliación y márgenes) e impresión (etiquetas, certificado y `/prueba`), con capturas y **checklist imprimible** del acompañamiento.
- **Diseño (#241):** el interruptor del **rediseño v2** pasa a **configuración por entorno** (sigue activado por defecto y se puede apagar para toda la flota sin tocar cada dispositivo); contraste **AA** cerrado y verificado en local y producción.
- **Componentes (#241):** **10 objetos compartidos más** (campos de correo/teléfono, chips de estado, teclado numérico, barra de lote, pestañas de período, etc.) salen ahora de la **biblioteca** (v0.31.0): se mantienen solos y se ven igual en todas las pantallas.

## v1.0.175 — 2026-09-25
- **Mobile (#249):** los botones **Editar / Desactivar** de Organización → Tiendas y sucursales llegan al **mínimo táctil de 44 px** (control automático de mobile en verde).

## v1.0.174 — 2026-09-25
- **Cuenta del cliente (#240):** el **pedido en detalle** dentro de la cuenta: productos, pagos, entrega y seguimiento en un solo lugar.
- **POS (#187):** el **retiro en tienda** ya no cobra el envío aunque quede un monto pendiente.
- **Caja (#148):** la **diferencia del cierre** ya no anticipa un número cuando todavía no hay arqueo.
- **Mobile (#249):** cerrados los últimos controles por debajo de **44 px** (finanzas, sistema y cuenta) y el **control automático** ahora exige cero targets chicos en mobile.
- **Iconos (#241):** un **set único desde la biblioteca** (v0.30.0) con guía de adopción: los íconos nuevos no se reimplementan.
- **Impresión (#96):** la **prueba física** de la impresora queda acompañada por la página `/prueba` y su modal, verificada en producción.

## v1.0.173 — 2026-09-25
- **Configuración (#253):** la sección se ordena en **siete grupos con navegación propia por iconos** — Mi cuenta · Organización · Equipo y acceso · Comercial · Seguridad y auditoría · Dispositivos · Sistema — sin duplicaciones ni pantallas repetidas.
- **Mi cuenta (#253):** tu **perfil** (nombre, correo y foto), las **preferencias del dispositivo** y tus **sesiones** en una sola pantalla, para todos los roles, entrando desde tu avatar.
- **Organización (#253):** **Tiendas y sucursales unificadas** con archivado en un solo lugar.
- **Equipo y acceso (#253):** **integrantes, metas y comisiones** juntos; **Comercial** reúne seguro, límites, fidelización/mora y las **listas de precios** (una sola pantalla de precios); **Dispositivos** separa impresoras y pruebas del **estado del sistema**.
- **Inventario (#240):** la **ficha del equipo** muestra las **reparaciones del taller** y su costo se suma al **costo real de la unidad**, con la **cronología del serial** y búsqueda en el taller por el IMEI escaneado.
- **Demo/Mobile (#249):** la **demo** entra a la verificación **responsive** y el botón «Cómo funciona» llega a 44 px.

## v1.0.172 — 2026-09-25
- **Velocidad (#247):** el **POS se carga recién cuando lo abrís** y la **búsqueda global baja al abrirla**: el panel arranca más liviano y las pantallas aparecen antes.
- **Velocidad (#247):** con el equipo ocioso se **adelantan las secciones más usadas** en segundo plano (con datos móviles restringidos no se adelanta nada).
- **Calidad (#247/#248):** medición **antes/después** de arranque y navegación, evidencia en producción y verificación del **redireccionamiento al login** desde la raíz.

## v1.0.171 — 2026-09-25
- **Configuración (#251):** la pantalla se ordena en **siete secciones** (Mi cuenta, Organización, Equipo y acceso, Comercial, Seguridad y auditoría, Dispositivos, Sistema) **sin duplicados**; las direcciones viejas redirigen a su sección nueva.
- **Ayuda (#251):** nueva pantalla de **comandos y atajos** con su ubicación, notas para **Mac** y acceso a soporte; se abre desde la Ayuda y desde el menú de tres puntos.
- **Finanzas (#148/#171):** **Ganadores por margen real** del período: el ranking sale del margen, no de la facturación.
- **POS (#148 §9):** un **monto por encima del tope de venta** bloquea el guardado y explica qué precio revisar.
- **Impresión (#250 §11 / #240/#220):** **etiqueta del lote** imprimible (80 mm y ESC/POS) y **comprobante de compra como imagen** para compartir.

## v1.0.170 — 2026-09-25
- **Menú (#251):** nuevo menú principal por flujo de trabajo: **Inicio · Vender · Clientes · Inventario · Operación · Finanzas · Análisis · Configuración**. «Taller» es **una sola sección** con pestañas y **Promociones** y **Precios** viven dentro de Vender e Inventario; se suman **Tablero de operaciones**, **Lista por modelo** y **Comparador**.
- **Inventario (#218):** los **traslados** muestran el **ETA del lote** y quién **despachó** y **recibió** cada envío.
- **Clientes (#240):** el cliente sigue el **estado de su entrega** desde la vitrina de su cuenta.
- **Mobile (#249):** segunda vuelta de la auditoría responsive: los botones y acciones llegan al **mínimo táctil de 44 px** (menú de tres puntos incluido) y el **portal público** entra en la auditoría.
- **Componentes (#241):** el **buscador global** usa la **paleta de comandos** de la biblioteca compartida (**v0.27.0**) con el tema v2 más profundo.

## v1.0.169 — 2026-09-25
- **Clientes (#240):** **«Tus cotizaciones»** en la cuenta del cliente (con su estado y detalle).
- **Configuración (#251):** **Dispositivos** y **Sistema** quedan separados y **Documentación** pasa a la **Ayuda** del shell; los grupos tienen guía por rol.
- **Ayuda y plataforma (#97 #168 #241):** los **QR de producto (`/producto/<sku>`) y de prueba (`/prueba`)** ya abren su ficha, la **Ayuda** enlaza al **estado de los servicios**, el shell muestra el **modo offline del POS** (y abre la cola) y **Preferencias** suma **«Volver al diseño anterior»** (por dispositivo y reversible).
- **Diseño (#241):** **mapa de la app** y de Configuración, **cheat-sheet visual de atajos** para la Ayuda y limpieza de mocks del rediseño.
- **Impresión (#240 #220 #250 §11):** **compartir documentos imprimibles como imagen** y **comprobante de recepción** imprimible del abastecimiento.
- **Componentes (#241):** se retiró el bloque local v2 del shell — todo vive en la biblioteca (**v0.26.0**).

## v1.0.168 — 2026-09-25
- **Tema (#241):** **profundidad del tema v0.25.0** aplicada al **shell, el panel y el carrito** (superficies y contraste más parejos, con capturas antes/después).
- **Calidad:** documentado el cierre de la **racha de 3 corridas verdes consecutivas** con la evidencia local.

## v1.0.167 — 2026-09-25
- **Cobro del POS (#148 §5/§11):** la **cápsula de la cuenta** muestra sus datos y el **saldo pendiente**; el **botón del cobro se ordena por estado** (primero lo que falta) con resumen sólido; el **prefijo del monto** (Gs/USD) ya no se come el ancho del número.
- **Taller (#250):** el **stock del taller** lleva **tenencia y pago** de repuestos, **aparte del stock vendible** (no se mezcla con lo que se puede vender).
- **QA:** e2e, capturas antes/después y documentación del cobro.

## v1.0.166 — 2026-09-25
- **POS (#148 §11):** la **venta sin stock/sin IMEI** queda marcada **«sobre pedido»** con su **guía inline**, traza y kardex por línea; el **carrito dinámico** suma **estados por fila y bloque**, acentos y micro-animaciones (#241).
- **Buscador dependiente (#250):** **modelo → capacidad → color** en **Stock y Compras**, y **recepción de equipos y repuestos** con el mismo buscador.
- **Inventario (#247):** la lista **pinta con una sola consulta** y el resto se **hidrata diferido** (carga más rápida).
- **Finanzas (#250):** **cuenta a pagar al proveedor** por repuestos, con condición y consumo.
- **Configuración (#245):** el **número inicial** se completa antes de guardar y el guardado se reintenta.
- **Componentes:** lotes **30 y 31** de la biblioteca (**v0.24.0 / v0.25.0**): buscador dependiente de dispositivos y profundidad del tema.

## v1.0.165 — 2026-09-24
- **Configuración (#234):** el **guardado es transversal** — seguro, límites y demás grupos guardan **con Enter**, muestran **estado por grupo** y piden **reautenticación en el lugar** cuando corresponde; anchos de datos alineados.
- **Ficha y tile del equipo (#241):** **grado oficial**, **checklist persistido** y **locks reales** con su fuente, ahora también en el **tile del listado**; el **encabezado de la tabla** alinea con las celdas y titula todas las columnas.
- **POS (#148):** el **selector de IMEI** usa los recursos con **rama demo** (la reserva de IMEI de la demo queda cubierta) y el QA v2 del carrito/cobro quedó endurecido con esperas deterministas.
- **Estabilidad:** doble escape corregido en el testMatch (spec que corría en el vacío) y shards al día (**407 tests**).

## v1.0.164 — 2026-09-24
- **Servicio y garantías (#215):** **tablero por etapas** del taller con contadores, avance por orden y contraste AA.
- **Ficha y tile del equipo (#241):** muestran el **grado oficial**, el **checklist persistido** y los **locks reales** (iCloud/MDM/ESN) con su fuente.
- **Configuración (#241):** **un logo por modo** (claro/oscuro) con confirmación y **vista previa fiel**; QA del lote F (Equipo y Roles).
- **POS (#148):** el **selector de IMEI** usa los recursos de la **rama demo** (reservas de demo cubiertas) y el QA v2 del carrito/cobro quedó endurecido con esperas deterministas.
- **Taller (#241):** el **modo taller** estrena los objetos compartidos y la **vista previa del rollo**.
- **Estabilidad (#245):** esperas deterministas y shards al día (**391 tests** en la suite).

## v1.0.163 — 2026-09-24
- **Finanzas (#234):** el **RUC** se carga con el campo compartido (`RucField`) en la **empresa privada**, los **titulares** y las **cuentas** — mismo extractor y validación que el resto de la app.
- **Impresos (#241 lote H):** verificación post-deploy y contrato del **comprobante de remito** con el lenguaje v2.
- **Componentes:** lotes **28 y 29** a la biblioteca (**v0.23.0**) — objetos para taller/rack, servicio y garantías.

## v1.0.162 — 2026-09-24
- **Ficha del equipo (#240):** muestra el **grado oficial**, el **checklist persistido** y los **locks reales** del dispositivo en un solo lugar.
- **Tablero operativo (#241 paso 3):** estrena los **patrones v2** y lee los **locks reales**; el **taller alterna** entre vista y acciones.
- **Finanzas (#241 lote D):** **Cuentas** con tiles y números estilo consola.
- **Clientes (#241 lote B):** tokens v2 aplicados a la lista, el popup y el detalle.
- **Impresos (#241 lote H):** los documentos impresos (remitos, etiquetas y comprobantes) adoptan el lenguaje v2.
- **Estabilidad (#245):** táctil de inventario estabilizado (lote que alterna la selección y abre la ficha por el ícono de categoría) y guardián de specs al día.
- **Componentes:** **lote 28** — objetos para los lotes A/C/E/F/G del rediseño (biblioteca **v0.22.0**).

## v1.0.161 — 2026-09-24
- **Estabilidad de la suite (sin cambios de producto):** se corrigieron tres causas raíz de rojos de CI — la **cuenta USD del POS** se crea antes de que el POS hidrate sus listas, la **ficha de inventario** se abre clickeando la fila (el texto interno podía quedar inestable) y el **listado de specs** no depende del seed del arnés. Mismo producto que la v1.0.160 (v2 por defecto).

## v1.0.160 — 2026-09-24
- **Nuevo look por defecto (#241):** el **lenguaje visual v2 (device ops)** queda **activo por defecto** en toda la app —paleta global desde la biblioteca, shell con más densidad— con accesibilidad AA y opción de volver al tema anterior desde Configuración.
- **POS (#241 paso 5):** el **cobro completo y los modales de venta** ya usan el v2, con contraste AA en claro y oscuro.
- **Abastecimiento (#250 F6 y §11):** **automatización de reposición**, métricas del centro y **AEX**; contrato e **impresiones** del abastecimiento (etiquetas y comprobantes).
- **Caja (#83):** los **KPI de Caja se calculan sobre todo el historial** (ya no solo el período visible).
- **Clientes (#240):** **«Tus pagos»** en la cuenta del cliente (historial de pagos con su estado).
- **Componentes:** **lote 27** — tokens v2 globales (**biblioteca v0.21.0**) y migración coordinada.

## v1.0.159 — 2026-09-24
- **Abastecimiento (#250):** **Fase 5** — la **recepción del envío** da de alta las unidades en **stock** del destino (cierra el ciclo compra → lote → tránsito → góndola).
- **Créditos (#83):** la lista se corta en 200 filas pero los **totales incluyen a todos los deudores** (ya no subestiman la cartera).
- **Clientes (#240):** **«Tus reservas»** en la cuenta del cliente (qué está apartado, con fecha y sucursal).
- **Páginas públicas (#241):** el **pedido público y la landing** usan el lenguaje v2, con el paquete de aprobación **F4** y capturas.
- **POS (#249 #241):** los **modales de venta** quedan medidos con el flag v2 y guarda táctil.
- **Calidad (#245):** se recuperaron **5 specs que corrían en el vacío** por patrones mal escapados (+17 tests reales en el gate) y se documentó el cierre de la racha.
- **Componentes:** **lote 26** (recepción e incidencias) a la biblioteca (v0.20.0).

## v1.0.158 — 2026-09-24
- **Abastecimiento (#250):** el **QR del manifiesto** de un lote abre la **página pública del envío** (sin sesión: código, origen/destino, método, unidades e IMEI; **sin costos, proveedor ni cliente**), con rate limit.

## v1.0.157 — 2026-09-24
- **POS (#148 #249):** el **pie del carrito** muestra **pagado y pendiente**; en la demo el **catálogo completa el SKU** para que el **escáner** encuentre todo.
- **Abastecimiento (#250):** **Fase 4** — **lotes, tránsito y manifiesto con QR** para seguir la mercadería desde la compra hasta la góndola.
- **Caja y auditoría (#148 #244):** el **día operativo usa UTC-3** (se eliminó el último resto de -04), así los cortes coinciden con la operación.
- **Clientes (#240):** **«Tus beneficios»** en la cuenta del cliente (programa de recompra y ventajas).
- **Finanzas (#241):** **tiles de finanzas** y el contador **«x de y»** en la conciliación con el lenguaje v2.
- **Componentes:** **lote 25** (envíos/recepción y banner) a la biblioteca, con QA ampliado.

## v1.0.156 — 2026-09-24
- **Estabilidad del pipeline:** se cierra la erradicación de tests intermitentes con **3 corridas de integración continua verdes consecutivas** y un **verificador de racha**; **0 tests en cuarentena**. No hay cambios visibles para el usuario (mismo producto que la v1.0.155).

## v1.0.155 — 2026-09-24
- **POS (#148 #249):** el **split** muestra el **estado por bloque** de cada parte y suma **«marcar como no pagado»**; el carrito y el cobro tienen **targets táctiles de 44 px** en mobile, y el **barrido responsive** de la suite entra al gate.
- **Abastecimiento (#250):** **Fase 2 y 3** — compra rápida con **IMEI** y stock adicional, y preparación de la compra desde el centro de abastecimiento.
- **Clientes (#240):** **avisos internos** del informe y de los mensajes sin ver en la ficha del cliente.
- **Clientes (#241):** **resumen v2** en la lista y el stepper de entrega expone `aria-current` (accesible), con capturas por tema.
- **Rendimiento (#247):** verificación en producción de las cargas más rápidas, con la **versión medida** registrada y guarda del **día paraguayo**.
- **Componentes (#211):** **lote 24** (abastecimiento y entrega) a la biblioteca (v0.18.0) y QA de identidad.

## v1.0.154 — 2026-09-24
- **Comisiones (#83 #148):** la **liquidación arranca donde terminó el último corte** (no se pisan ni se repiten períodos) y el comprobante queda al día.
- **Clientes (#240):** **mensajes de la tienda al cliente** con visto/no visto, en la cuenta y el portal.
- **Pedidos (#241):** **resumen y stepper de entrega v2** en el detalle del pedido (detrás del flag), con capturas por tema.
- **Verificaciones post-deploy (v1.0.153):** impresión (informe, certificado y constancia) e identidad (#211) con su lote 23 de la biblioteca.

## v1.0.153 — 2026-09-23
- **Informe del equipo (#240):** la página pública abre con el **certificado compartido** (checklist, controles y grado) y se sumó la **constancia de preparación** imprimible en 80 mm y A4.
- **Abastecimiento (#250):** primera fase de **necesidades de compra** con su API «Por comprar» (base para el centro de abastecimiento).
- **Mobile / táctil (#249):** **targets de 44 px** en Inventario y la biblioteca, checklist usable en la ficha, correcciones responsive en Clientes y Finanzas (H2/H3) y gate propio de Clientes.
- **Velocidad (#247):** **arranque instantáneo** y **rutas diferidas** (chunks del panel, finanzas y sync) con evidencia antes/después.
- **Diseño v2 (#241 #211):** **tiles de equipo** en Inventario y la **identidad del usuario unificada** (`PersonaChip`) también en el pie, presencia, bloqueo y pedidos.
- **POS (#148):** los **borradores de la demo** se retoman y se descartan.
- **Componentes:** lotes 20 y 21 a la biblioteca (identidad única y alto táctil de 44 px).

## v1.0.152 — 2026-09-23
- **Estabilidad interna:** la reserva de una unidad desde su ficha queda robusta en la suite automática (mismo cuidado que recepción de traslados y etiquetas), sin cambios visibles para el usuario.

## v1.0.151 — 2026-09-23
- **POS (#243):** la **papelera de cada línea** del carrito queda siempre visible, con confirmación antes de borrar.
- **Informe del equipo (#240):** el informe público suma los **controles del dispositivo** (bloqueos de iCloud/MDM/ESN/OEM) junto al checklist de inspección.
- **Inventario (#246 #239):** la tabla de unidades usa **una sola fila** por equipo (nombre + IMEI) y se quitó la columna de variante duplicada; el bloque de códigos de la ficha reserva su espacio.
- **Clientes (#240):** la **cuenta del cliente** muestra **avisos accionables** (pagos, entregas y garantías por resolver).
- **Configuración (#241):** **tiles de rol y de equipo** con el lenguaje v2 (detrás del flag).
- **Acceso (#248):** sin sesión, la **raíz y las rutas protegidas van a /login** (ya no caen en la demo).
- **CI:** la reimpresión de etiqueta reintenta hasta confirmar el trabajo del agente.

## v1.0.150 — 2026-09-23
- **POS (#243):** la **papelera de cada línea** queda siempre visible, con confirmación antes de borrar (menos toques para corregir el carrito).
- **Finanzas (#148 #122):** las ventas con **costo pendiente** ya no suman ganancia hasta completarlo (reportes y Análisis coherentes con la caja).
- **Clientes (#240):** la **cuenta del cliente sigue la entrega paso a paso** (recepción, preparación, en camino y entrega).
- **Compras (#241):** resumen y **avance de recepción** con el lenguaje v2 (detrás del flag), con capturas por tema.
- **Impresión/CI:** la **reimpresión de etiqueta** reintenta hasta confirmar el trabajo del agente en la suite automática.
- **Componentes:** **lote 20** de objetos de campo y detalle sumado a la biblioteca (v0.15.0).

## v1.0.149 — 2026-09-23
- **Estabilidad interna:** el flujo de recepción de equipos en tránsito (reimprimir etiqueta) queda robusto en la suite automática, sin cambios visibles para el usuario.

## v1.0.148 — 2026-09-23
- **Servicio Técnico:** con la lista vacía había **dos botones «+ Nueva orden»** (el del encabezado y el del estado vacío); queda uno solo, siempre en el encabezado.

## v1.0.147 — 2026-09-23
- **POS (#173):** la **cotización** que escribe el vendedor ya no se pisa con la automática; queda la suya.
- **Inventario (#240):** el **informe público** del equipo ahora muestra el **checklist de la inspección** (con el puntaje y el grado), y la búsqueda de consultas IMEI acepta los seriales de la demo.
- **Clientes (#240):** la **garantía se sigue desde el portal**: el cliente ve el estado y las fechas de su equipo sin escribir a la tienda.
- **Finanzas (#148):** **una sola fórmula de margen por venta** para reportes, comisiones y liquidación (se terminaron las diferencias entre pantallas).
- **Resumen y Análisis (#241):** **tiles de KPI** y números con el lenguaje v2 (detrás del flag).
- **Impresión (#240):** la **cola del agente** es determinista en pruebas (piso de espera configurable) y se verificó la impresión del **certificado final** con sus PDFs de ejemplo.
- **Estabilidad CI:** la suite e2e corre en **3 shards** con **cuarentena explícita** para los specs flaky y artifacts por shard.

## v1.0.146 — 2026-09-23
- **Impresión:** la cola del agente de impresión ya no se traba si un reintento queda varado (tick de seguridad); el agente pasa a **1.7.3** con su instalador actualizado.
- **CI:** el pipeline vuelve a verde de punta a punta (backend, frontend, integración y la suite e2e completa), con reintentos acotados para la variabilidad del runner.

## v1.0.145 — 2026-09-23
- **Carrito del POS (#243 #148):** la línea colapsada muestra solo lo esencial (nombre, estado del IMEI, total y descuento); al desplegarla aparecen cantidad, precio, cupón y stock. El **descuento de la línea** baja también la **ganancia, la comisión y la liquidación** del vendedor. El **split con cuenta en dólares** toma la cotización de su fila.
- **Inventario (#217 #240):** **«Vender todos»** carga el lote elegido en el POS con sus IMEI; la ficha suma el **historial del serial** (verificaciones, consultas IMEI, reparaciones y movimientos) y el **tablero de certificaciones** con filtros y **export CSV**; los **repuestos no-OEM** se registran con nota y **foto de evidencia**.
- **Taller y garantías (#240):** el **cliente ve su equipo en el taller** desde su cuenta, con el **stepper del servicio** y los patrones v2 en Servicio y Garantías.
- **Informe del equipo (#240):** se ve si el cliente **abrió el informe** que le compartiste (visto/no visto, con conteo y fecha); se comparte por **WhatsApp o correo** desde la ficha y el portal, con registro en la cronología.
- **Finanzas (#244 #148):** la **conciliación del día** usa el día paraguayo (los cobros recién hechos ya no quedan fuera de «Hoy»); el **valor del stock** y las comisiones se calculan con el **costo real por unidad** y el **monto del consignador** entra a ese costo.
- **Operaciones (#241):** el **tablero F3** usa datos reales detrás del flag, con **checklist ejecutable de rotación de tokens** para seguridad.
- **Rediseño (#241):** **F4** lleva los patrones v2 a pedidos, clientes, finanzas, servicio y garantías, con el shell v2 **accesible AA** en claro y oscuro (detrás del flag, con capturas por dominio).
- **Impresión (#240):** **hoja de estación** verificada en serie, **certificado pulido** (A4/80 mm) y esperas robustas del agente para CI; verificación post-v1.0.144 del informe y certificado con QR.
- **Estabilidad CI (#244):** se arreglaron los 5 rojos del CI (impresión print-agent, documentos, conciliación FIN, split POS y comprobante rápido) y se estabilizaron los e2e.

## v1.0.144 — 2026-09-22
- **Finanzas / Inventario:** el **costo de repuestos no-OEM** cargado en la inspección entra al **costo real** de la venta por IMEI y a la base del seguro (ej.: costo 800.000 + repuestos 120.000 ⇒ costo real 920.000 y seguro 92.000); antes la ganancia quedaba inflada en silencio. Campo validado en servidor y con test del arnés. (#148 #240)
- **Componentes:** los **tonos de inspección** quedan en una sola forma compartida con la biblioteca (`TONOS.punto/chip/texto`), se publica el lock `oem` (repuesto no OEM) y `VistaPreviaPapel`; contrato verificado por test (lote 16, owncoding-ui v0.14.5). (#240)
- **Diseño:** plan **F4 por dominio** y switch de activación del default v2 (apagado). (#241)
- **QA / cierres:** revisión final de brechas de la épica POS (#148), cierre de Clientes #236 y verificaciones post-v1.0.143 de impresión, taller e impresión en serie, con capturas y resultados en `docs/qa/`. (#148 #236 #240 #241)

## v1.0.143 — 2026-09-22
- **Inventario — IMEI:** nueva **pantalla de consultas IMEI** (ADMIN/GERENTE) para buscar por IMEI, ver estado, costo y fecha, y **conciliar** contra el proveedor (estado, costo real, fecha del panel, orden y nota) desde la UI; el informe de dispositivo suma la **página pública `/u/<serial>`** con endpoint sin datos personales (grado, batería, controles y aviso de blacklist). (#233 #240)
- **AEX:** la cédula viaja como **CIP** y el tipo de documento se normaliza (CI/Cédula/DNI → CIP, Pasaporte → PAS, RUC → RUC) con tests y harness actualizados; la confirmación ambigua queda **fail-closed** y se concilia por referencia (`--consulta`), sin reintentos a ciegas. (#231)
- **Inspección / impresión:** certificado de inspección y **informe del dispositivo con checklist PhoneCheck** (rótulos canónicos, QR verificado y ejemplo publicado), más la **hoja de estación** para imprimir en serie desde el taller. (#240 #241)
- **Clientes / portal:** el informe del equipo se abre desde la ficha y el portal público, se comparte por **WhatsApp o correo** con registro en la cronología. (#240)
- **Taller / F3:** **stepper del flujo** por unidad en el rack (por verificar → verificado → listo) y el **tablero de operaciones F3** detrás del flag de vista previa, con tokens v2 y capturas claro/oscuro/móvil. (#240 #241)
- **Finanzas:** el margen usa el **costo real de la unidad** (IMEI, reparaciones y repuestos) y el equipo de Trade-In llega con su costo al margen y al seguro. (#148)
- **POS:** se puede **eliminar un bloque de pago** del split sin romper el cobro. (#148 §11)
- **Componentes:** lotes 11-15 — categorías con icono, celdas y montos unificados, **QR compartido**, vista previa de papel compartida, una sola regla para el estado de la unidad y el rack con `GradoBadge`/`MedidorBateria`. (#242)

## v1.0.142 — 2026-09-22
- **Inventario — inspección (PhoneCheck):** checklist por unidad con puntaje y **grado A/B/C**, batería (% y ciclos), chips de locks (Find My/MDM/SIM), repuestos no-OEM y **certificado con QR**; informe del dispositivo en 80 mm y A4 con QR al informe público, y tablero de certificaciones. (#240 #242)
- **Inventario — modo taller/rack:** vista de taller con estaciones, filtros y acciones/impresión **en serie** sobre las unidades. (#240 #241)
- **Trade-in:** valuación del equipo con grado y hallazgos al recibirlo. (#240)
- **POS:** iconos por categoría en catálogo y carrito, borradores en la demo con guardado local y la venta demo descuenta stock, marca vendida la unidad y deja cronología. (#148 #227 #242)
- **Diseño:** piloto de **tokens v2** en la tabla de inventario, la ficha de unidad y el carrito POS, con paquete de aprobación y capturas antes/después. (#241)
- **Clientes/comentarios:** menciones en comentarios de pedido con la misma regla que la UI. (#148)
- **Finanzas (demo):** saldo a favor visible en la demo, con la equivalencia con gift cards documentada. (#148)
- **IMEI/conciliación:** el timeout queda "a conciliar" con `resolvedAt`, costo real y campos normalizados en el panel. (#233)
- **Seguridad:** guía de rotación con 2FA y least privilege. (#232)

## v1.0.141 — 2026-09-22
- **Demo:** al vender en el demo, la unidad pasa a **Vendidos**, **baja el stock** del modelo y queda la **cronología** de la unidad (#227, cierra la observación del barrido #195).
- **Notificaciones:** el panel suma **tareas de taller y pedidos asignados** para el equipo (#148 §14).
- **UI:** se consolidan los **anchos de modal por tipo** en todas las pantallas (migración de usos, #237) y el lote 10 de componentes (notas, estados con badge, barras y montos).
- **QA:** recorridos de **Finanzas §17/§18/§19** y de **Clientes demo** sobre producción, más el estado del **§20 de POS** (borradores/envío).

## v1.0.140 — 2026-09-22
- **POS:** el carrito arranca con **líneas colapsadas, IMEI en línea y flecha** para expandir (#225); se quitó el campo **Fecha** (la venta es del día) (#229); la **entrega va antes del cobro** con su costo a la vista (#230); **promociones en grilla** de hasta 4 campos por fila (#238).
- **Inventario:** la tabla de unidades queda en **una sola fila** (producto + IMEI), con **foto del verificador** y **Estado centrado** (#239); la pantalla de **Alertas** vuelve a abrir en producción (#226); si el proveedor de IMEI **no responde**, la consulta queda **«a conciliar»** con su costo estimado (#233) y una confirmación AEX ambigua **se concilia sin reintentar** (#231); los datos del demo ya no dicen "demo" (**Aurora Móviles**, prefijo **AUR**) con guarda automática (#222).
- **Finanzas:** **montos consistentes** con el tope real que el sistema puede guardar (bloqueo y mensaje claros) y **analytics de caja** por turno. (#148)
- **Clientes:** la lista queda **estilo Pedidos**, con **resumen rápido** al pasar por la fila y detalle compacto (#236).
- **Diseño:** **contraste AA** de los tokens de texto en tema claro (#176) y restos del shell ordenados (#180).
- **Plataforma:** el menú de tres puntos ya no permite **eliminar la cuenta de un toque** (va a Configuración con confirmación fuerte) y no repite tema/cerrar sesión (#228); la página `/demo` queda más directa (#235); los **logs de deploy no exponen secretos** con auditoría y checklist (#232).
- **Impresión:** guía de aplicación de impresoras (#17: launchd + IP secundaria) y QA de comprobantes.
- **Componentes:** el **extractor de RUC vive dentro del input** y se ve también en el demo simulado (#234); **anchos de modales** consistentes con auditoría automática (#237) y formularios compartidos (#211).
- **Demo:** verificación de Inventario en demo 8/9 (0 llamadas al API); el hallazgo de **sync con POS** queda trackeado en #227.

## v1.0.139 — 2026-09-21
- **Caja / POS:** **ventas por caja y corte por sesión**: cada turno muestra lo vendido y se cierra con su corte. (#148 §18)
- **Clientes:** la **venta del POS demo entra en la ficha del cliente** y se sumó la evidencia post-deploy del dominio. (#160 #187)
- **Impresión:** **comprobante rápido desde Vendidos** sin salir de la lista, con recorrido de comprobantes/PDFs verificado en producción. (#215 §10 #185)
- **Pantallas / Diseño:** la lista de precios y el comparador viven **dentro del panel** (se retira la página vieja de Trade-In), tooltips de una frase en las acciones y datos de la unidad, y colores a **tokens de tema** con modo oscuro/accesibilidad del POS verificados. (#180 #215 #176)
- **Inventario / Demo:** el demo muestra el **catálogo y las alertas de reposición** al día (umbral simulado, sin API). (#195)
- **Componentes:** **ciudad con departamento automático**, nombres SIFEN y tamaños de campo, con colores de pantalla a tokens. (#176)
- **QA:** demo público consolidado v1.0.137 con dominios y claro/oscuro (#194 #196 #198) y recorridos de Finanzas y Clientes en producción. (#185 #187)

## v1.0.138 — 2026-09-21
- **Tránsito / Inventario:** cada lote muestra cantidad, envío y llegada; se puede **recibir el lote completo** eligiendo el depósito destino (recién ahí suma stock) y **reimprimir las etiquetas del lote** desde la fila. Las **ubicaciones tienen color propio**. (#218)
- **Demo:** Finanzas al día con 9 medios verosímiles, caja con turno del equipo ficticio, conciliación completa y pedidos con el prefijo de la empresa; la tienda demo pasa a **Aurora Móviles** y los datos ya no dicen "demo". (#190)
- **Portal / Cotizaciones:** el logo respeta el tema (claro/oscuro) también con los enlaces nuevos, y la **página pública del pedido muestra quién atendió** sin abrir "Tus datos". (#186)
- **Shell:** se retiró CSS muerto y la paleta "Ir a…" inalcanzable (Ctrl+K sigue abriendo la búsqueda global). (#180)
- **QA:** verificación post-deploy del demo público v1.0.136 (0 llamadas al API real), barrido del demo por dominio y recorridos de Clientes/Inventario en producción. (#194 #196 #198 #187)

## v1.0.137 — 2026-09-21
- **Finanzas y Reportes (Lote 6-C):** tablas y filas compactas alineadas a la biblioteca, **sin scroll horizontal** en las 8 vistas medidas (1280/1440), con estados vacíos coherentes y acciones a la vista. (#169)
- **Inventario:** cada **ubicación tiene su color** (se elige al crearla/editar y se usa en la tabla y las etiquetas) y se puede **recibir un lote completo** de un traslado con depósito destino. (#218)
- **Interfaz:** el interruptor se unifica en el objeto **Switch** (se retira el `Toggle` viejo) y las celdas de dato/monto, avisos y skeletons salen de los objetos compartidos; la auditoría de duplicación queda al día. (#186 #211)
- **QA:** recorrido del POS en producción v1.0.136 (10/12 pasos verdes, con 2 hallazgos de split/cierre documentados para POS), verificación post-deploy de Clientes demo y del dominio Impresión.

## v1.0.136 — 2026-09-21
- **Inventario:** tabla compacta con columnas reordenadas y **costo en USD editable en la fila** (con el formateador canónico), menú de acciones por unidad y estados visuales; **acciones masivas por lote** (verificar, reservar, dar de baja, enviar a revisión, cambiar ubicación, imprimir etiquetas, exportar CSV, copiar IMEIs) y **ordenamiento inteligente** (modelo 17→13, costos, etc.) con pestaña **Vendidos**. (#216 #217)
- **IMEI:** el modo **simulado se avisa antes de confirmar** — la consulta muestra que es simulada y con costo 0 (sin llamadas ni cargos); el flujo real queda igual, con confirmación explícita. Sin LIVE. (#193 #200)
- **Demo:** la verificación de IMEI funciona contra el mock del backend, la tienda ficticia pasa a **Aurora** (con prefijo de pedidos propio), los **pedidos quedan asociados a los clientes** con historial variado y el sweep de la palabra "demo" sigue avanzando. (#213 #215 #219)

## v1.0.135 — 2026-09-21
- **Servicio y Garantías:** un solo módulo con pestañas (Todo/Servicio/Garantías) y etiqueta de tipo por registro; una **garantía puede convertirse en orden de servicio** conservando el historial y se ve en qué orden entró. (#224)
- **Identidad de usuario:** un único objeto (`PersonaChip`) resuelve la foto (subida → Google → iniciales) y el primer nombre, adoptado en presencia, pantalla de bloqueo y pedidos; se suman objetos compartidos de biblioteca (celdas, montos, teléfono/WhatsApp y estados de pedido). (#211)
- **Impresión:** etiquetas de unidad con **QR, IMEI legible y bloques separados**, verificadas en producción con su evidencia por tamaño. (#220)
- **Base de datos:** migración aditiva e idempotente que vincula la orden de servicio con la garantía de origen.
- **QA:** verificaciones post-deploy documentadas de Finanzas (#144 #161 #162 #171 #209), del topbar (#223) y de la demo/POS (acceso anónimo y venta).

## v1.0.134 — 2026-09-21
- **Envíos AEX:** contrato de envíos alineado a la documentación del proveedor (respuestas en array/objeto, destinatario y direcciones) y **confirmación bloqueada** hasta contar con datos reales de remitente y destinatario: se puede **cotizar**, no confirmar envíos con identidades de ejemplo. (#3)
- **POS / Pedidos:** desde Inventario se puede **vender todos** los equipos seleccionados con el carrito precargado (#217); la cronología y los pagos del pedido muestran **foto y primer nombre** de quien actuó (#219).
- **Impresión:** la etiqueta de unidad suma **QR, IMEI legible y bloques separados**, con evidencia por tamaño (#220); el comprobante de IMEI conserva los **últimos 4 dígitos** del equipo (#203).
- **Demo:** los **agregados de clientes** (total gastado, pedidos, últimas compras) se calculan como en la cuenta real (#221 #213).
- **Encabezado:** el topbar muestra solo la marca **MobOS** (#223).
- **Consistencia:** montos de pantalla unificados, escape de textos y estados vacíos con la biblioteca compartida (#211).

## v1.0.133 — 2026-09-21
- **«Último usado» en todo el sistema:** un único helper documentado (namespace `mobos:<área>:<dato>`, con migración del formato anterior) recuerda la última selección en POS (cuenta y entrega), Finanzas (Gastos y Conciliación), Clientes (filtros y plantilla de WhatsApp), Garantías, Inventario (motivos y depósitos), menú/grupos del shell, Auditoría e Historial; siempre visible y cambiable, y en el demo vive solo en la pestaña. (#209)
- **Pantalla de bloqueo:** muestra la foto real del usuario (o iniciales) y los logos de MobOS y de la tienda según el tema. (#210)
- **Actualizaciones:** cuando hay una versión nueva desplegada, la app avisa y permite recargar de forma controlada, sin quedar en una versión vieja por caché y sin romper el modo offline del POS. (#214)

## v1.0.132 — 2026-09-21
- **Impresión:** rediseño integral de los imprimibles (comprobante rápido/completo/detallado en A4 y térmicos 58/80, nota de entrega, remisión, recibo, proforma, reporte y etiquetas) con **espacio real para firmas, aclaración, CI y observaciones**; evidencia por tamaño en `docs/qa/206-imprimibles/`. (#206)
- **POS / Pedidos:** el comprobante vuelve a ofrecer **80 mm y abre en 80 mm por defecto**; el nivel y el formato se eligen con **íconos** (nivel rápido por defecto) y se recuerda la última combinación; el encabezado y la cronología muestran **foto (o iniciales) y solo el primer nombre**. (#207 #208 #212)
- **«Último usado» como predeterminado:** cuenta de cobro y tipo de entrega en el POS, Gastos y Conciliación en Finanzas, e impresora/formato por tipo de documento. (#209)
- **Landing:** rediseño integral con los módulos nuevos, portal, impresión/offline y un **verificador de IMEI simulado** (sin llamadas ni costo, estados honestos). (#202 #203)
- **Demo:** inventario demo con **iPhones serializados, IMEIs ficticios, equipo, clientes y pedidos de ejemplo**, todo en memoria (session-only). (#213)
- **Consistencia visual:** biblioteca de objetos compartidos (avisos, tablas, fechas 24 h, portapapeles y descargas) adoptada en las pantallas, con auditoría de duplicación. (#211)
- **Resumen:** la portada avisa cuando el reporte del servidor llega **truncado**, en vez de mostrar números incompletos como totales. (#171)

## v1.0.131 — 2026-09-21
- **Inventario / IMEIcheck:** la ficha de la unidad suma **Consulta de IMEI** (precheck con costo visible → confirmación explícita → resultado con fuente y hora; "No verificado" ante pendiente o fallo, nunca "Limpio"); en demo se **simula** y queda marcado. Se suma la **matriz completa de mocks** y el documento con el procedimiento de la **única consulta Apple Basic** autorizada. (#193 #200)
- **Herramientas:** harness de **sandbox AEX** para cotizar, generar una guía y consultar seguimiento sin tocar producción. (#3)
- **Demo:** todo funciona con datos ficticios y **solo en memoria de la pestaña** (nada se persiste al recargar), con guía visible de cómo funciona y banner; verificación post-deploy del demo en verde para PLT, PRN, FIN y CRM. (#196 #198 #201 #204)
- **Pedidos / POS:** los métodos de entrega nuevos muestran su nombre y se suma la cobertura e2e de **fulfillment por método**; barrido de accesibilidad y responsive 360/768; bordes de venta en demo (split USD, períodos). (#173 #199 #204 #205)
- **Finanzas:** el seguro queda persistente en la demo, la transferencia ya no ofrece USDT y los lotes de conciliación no se reasignan; e2e de caja y conciliación; pulido de horas 24 h, vacíos y textos. (#204 #205)
- **Impresión:** etiquetas de estado unificadas, vacíos con ayuda, QR del comprobante en demo y bordes de cola (incierto/lote); specs estabilizados. (#199 #204 #205)
- **Clientes / Configuración:** el portal vigente se puede regenerar desde la ficha; ayuda visible al aceptar una invitación; menú de acciones en español sin entrada duplicada; etiquetas y avisos consistentes. (#199 #204 #205)

## v1.0.130 — 2026-09-21
- **IMEIcheck (Fase 1):** el adaptador suma el **catálogo live** del proveedor (IDs reales) y el **mapeo de campos para ambos formatos** con el **costo real informado**; sigue todo en modo mock por defecto, sin cargos automáticos ni llamadas pagas sin configuración explícita. (#193 #200)
- **Clientes:** la ficha del cliente suma el **comprobante de verificación de IMEI** (simulado en demo, con los datos del equipo y la fuente). (#203)
- **Finanzas:** cobertura e2e de **caja y conciliación** y auditoría de efectivo que **no pierde borradores**; corrida post-deploy del demo anónimo documentada. (#196 #199)
- **POS:** barrido **responsivo 360/768** con capturas y caza de flakes. (#199)
- **Arreglo:** el **buscador de vendedores de Comisiones** ahora filtra de verdad al escribir (antes solo mostraba los primeros resultados). (#141 #199)

## v1.0.129 — 2026-09-21
- **Pedidos:** la página pública del pedido pasa a su dirección canónica `clientes.moboss.online/pedidos/<token>`, con redirects que conservan el token (los QR y enlaces viejos siguen abriendo); el QR impreso y los enlaces del comprobante apuntan a la nueva.
- **Demo completa:** POS, Finanzas, Clientes y Servicio Técnico e Impresión funcionan en modo demo con datos ficticios y sin tocar el API real; cada guardado avisa que es simulado. (#194)
- **Facturación/IMEI:** llega **IMEIcheck.net en modo mock** (Fase 1): validación del IMEI (15 dígitos + Luhn), estados honestos (pendiente o sin dato nunca dicen "Limpio"), token solo en el backend y consulta con costo confirmado, idempotencia y registro auditable. Sin llamadas reales salvo configuración explícita. (#193)
- **QA:** scripts y specs reutilizables de verificación del demo público y la página del pedido, con capturas y JSON de resultados. (#196 #198)

## v1.0.128 — 2026-09-21
- **Pedidos / POS:** cada método de entrega (envío, retiro en tienda, retiro en otra sucursal, traslado) tiene su propia máquina de estados (un retiro no pasa por "listo para enviar") y el **seguimiento público** muestra el tipo, el encabezado correcto y la línea de progreso con fechas; «Dividir saldo» ahora precarga el monto en el bloque nuevo. (#187 #191)
- **Demo:** la **demo pública es anónima** y 100 % local con datos ficticios: no consulta el API ni necesita sesión, con banner de datos ficticios y aviso al guardar. (#192)
- **Impresión:** el enlace de instalación del agente que publica el manifest ahora apunta al backend (donde vive el instalador): el `curl | bash` documentado deja de recibir la página de la app. (#185)
- **Navegación / Equipo:** la identidad de la tienda se toma del servidor (no cae en "Mi tienda"), el técnico entra a su taller (sin CTA de POS que lo rebote) y el reparto tiene rutas propias: Repartos y Rendiciones. (#179)
- **Demo (Finanzas):** el seguro de ventas avisa que es modo demo (sin "Falta sesión") y la caja demo muestra su apertura coherente. (#188)
- **Demo (Clientes):** la ficha del cliente abre con datos demo y `?cliente=` ya no llama al API real; los guardados quedan deshabilitados con aviso. (#189)
- **QA:** recorridos funcionales en producción de Finanzas (#185), Clientes/públicos (#187) y POS (#187) documentados con capturas en `docs/qa/`.

## v1.0.127 — 2026-09-21
- **POS:** el catálogo muestra modelo, capacidad y stock de cada equipo, y el código escaneado pide confirmación antes de entrar a la venta; los montos aceptan hasta los límites de venta, el botón principal suma **Guardar pedido** y **Dividir saldo** propone lo que falta en la moneda de la cuenta. (#175)
- **Pedidos:** la confirmación muestra el **número de pedido creado** con acceso directo, el detalle permite **cobrar el saldo** con el mismo modal de cobros y editar la **nota interna** en línea; la lista rotula **Hoy / Ayer / Anteayer**. (#175)
- **POS / Analytics:** el tablero suma **selector de período** (hoy, 7 días, mes) y **cobros por cuenta**; el carrito ya no deja descuentos residuales y muestra cliente, vendedor y tipo de entrega. (#175)
- **Finanzas:** Resumen y Análisis salen de un **backend único de métricas** con indicadores compartidos y portada ejecutiva; Reportes reutiliza los cálculos y el calendario de Ganancias. (#171 #181)
- **Seguridad:** el seguimiento público de pedidos y las garantías/portal ya no guardan tokens en claro (hash con rotación) y suman límite de uso; el reporte de errores tiene cupo diario por IP. (#178)
- **Rendimiento (Inventario):** índices nuevos para las búsquedas del POS, seriales, listado de pedidos y kardex (con volumen: el catálogo pasó de ~1,2 s a ~0,2 s). (#177)
- **Impresión:** checklist de prueba física de la Mac del local y cobertura nueva de cola/cancelación/estado incierto, con flakies del spec estabilizados. (#170 #183)
- **Pulido:** Inventario con un solo título, búsqueda compartida y estados vacíos coherentes; documentación interna de Clientes, Garantías y Servicio Técnico. (#184 #182)

## v1.0.126 — 2026-09-21
- **Configuración y Equipo:** las subpáginas quedaron ordenadas por grupo con enlace estable y los formularios viven en un panel a la derecha en escritorio (apilados en móvil), con más densidad y sin scroll horizontal. (#165)
- **Seguridad:** el enlace público del borrador ahora vence a los 7 días, se puede revocar, tiene límite de uso y el reingreso con PIN del dueño limita intentos; queda el informe de auditoría con los pendientes de otras superficies. (#172)
- **Clientes y Garantías:** ambas pantallas migraron a filas compactas con las acciones a la vista y los objetos compartidos, sin scroll horizontal. (#166)
- **Portal del cliente:** encabezado, secciones y estados unificados, el saldo queda primero, pedidos y comprobantes más legibles y mobile impecable; la nota pública de la tienda aparece cuando existe. (#174)
- **Compras y Proveedores:** filas compactas y acciones a la vista, alineadas con la biblioteca de objetos. (#167)
- **POS offline (Fase 2):** los conflictos al sincronizar se clasifican (stock, precio, cliente, duplicada, permiso o vencida) con sugerencia y acciones Reintentar/Descartar; reporte de lo vendido sin conexión, tasa de éxito y tiempos; tope de 200 ventas en cola y vencimiento a los 7 días sin perder datos. (#168)

## v1.0.125 — 2026-09-21
- **Finanzas:** nueva pantalla de **Conciliación** por cuenta, medio de pago y procesadora: cobros y lotes de acreditación, diferencias y estado (pendiente, conciliado o con diferencia), con la foto del cobro sobre la cuenta usada al momento de cobrar. (#144)
- **Resumen:** se unificó **Análisis con Resumen** sin duplicar métricas: ticket promedio y variación se calculan una sola vez y el panel muestra la vista ejecutiva y la extendida. (#145)
- **Pedidos:** la **entrega queda separada del pago**, con estados propios según el tipo: retiro (pendiente → preparando → listo para retirar → retirado) y reparto (enviado, en camino, no entregado, parcial); la app ofrece solo los pasos válidos y la cronología registra cada cambio. (#152)
- **POS:** los **borradores se comparten con un enlace público del carrito** sin cuenta (copiar, WhatsApp o correo) y el cliente ve el detalle con el botón de checkout que abre el WhatsApp de la tienda; al retomar un borrador, el POS avisa si cambió el stock y permite vender igualmente o volver atrás. (#154)
- **POS:** nuevo **tablero de Analytics del día** (ventas contra ayer, ticket promedio, ítems por pedido, top productos, ventas por vendedor y sucursal, cobros por medio) y **menciones @** en los comentarios internos de los pedidos. (#156)

## v1.0.124 — 2026-09-21
- **Finanzas:** la **caja** se audita por rango: efectivo inicial y recibido por sesión, cada cobro o movimiento con pedido, cliente y vendedor, y el estado **verificado / pendiente / con diferencia** con su observación, quién auditó y un resumen de diferencias y pendientes. (#161)
- **Finanzas:** el **seguro de ventas de la empresa** (% sobre el costo) se configura en Configuración → Negocio y entra en la prioridad del seguro; el **costo real** (costo + seguro) ya baja el margen en Resumen, Análisis, comisiones y reportes. (#162)
- **Finanzas:** **cuentas de cobro** más densas y con **nombre automático**, buscadores de titulares/empresas en tiempo real y **medios de pago configurables**: efectivo multi-moneda, transferencia, tarjeta con procesadoras, Pix, USDT y canje. (#141 #142)
- **Finanzas:** **empresas/personas jurídicas y titulares privados** con buscador por nombre, cédula o RUC; los datos legales quedan separados de la información pública de la tienda. (#143)
- **Resumen:** **reporte ejecutivo A4 de una hoja** con KPIs y variación, cobros por medio de pago, rentabilidad y alertas, legible también en blanco y negro. (#146)
- **Diseño:** **biblioteca de objetos compartidos** (búsquedas, interruptores y segmentados) aplicada en las pantallas prioritarias, con los límites de monto unificados. (#147)
- **Pedidos:** el **seguimiento del cliente** y el **contenedor del pedido** se reordenaron con secciones plegables, avatar en la cronología y más densidad; el **logo ahora sigue al tema** (fondo oscuro → logo claro). (#163 #164)
- **Impresión:** la **confirmación del papel** ya no se pierde si hay otra confirmación en vuelo; la validación automática reintenta en lugar de descartarse. (#138)
- **Facturación (SIFEN):** quedan los **fundamentos de la facturación electrónica** (Fase 1, sin certificado); la emisión real llega en la Fase 2 y por ahora todo sigue como documento no fiscal. (#130)

## v1.0.123 — 2026-09-21
- **POS / Equipo:** **bloqueo de sesión con PIN** por inactividad (la caja queda protegida si te alejás), menú de tres puntos, preferencias y **notificaciones**. (#158)
- **Equipo:** los **PIN del staff ahora aceptan de 4 a 6 dígitos** y se suma la **documentación interna con buscador**. (#159)

## v1.0.122 — 2026-09-21
- **Ventas / POS:** el cliente se busca con **pre-clientes por RUC**, nombres normalizados y correo recordado para la factura. (#150)
- **Ventas / POS:** el **botón principal sigue el estado del pago** y la **cotización de la moneda es automática** al cobrar en dólares. (#151)
- **Ventas / POS:** **cuentas de cobro con buscador contextual** (banco, titular, moneda, logo y estado). (#153)
- **Pedidos:** detalle con **transacciones** y lista con **estados visuales** (timeline y acciones por estado). (#155)

## v1.0.121 — 2026-09-21
- **Ventas / POS:** nueva pantalla de carga de venta: formulario más limpio, **carrito fijo en el panel derecho** y mejor uso del espacio; se adaptan los flujos guiados. (#149)
- **Inventario:** **carga rápida de equipos con costo diferido** (en Gs o USD con cotización) e historial de cambios; **búsqueda de productos** con disponibilidad por sucursal, por modelo/capacidad/color y soporte del **escáner**, integrada Inventario → Productos → POS. (#135 #157)
- **Clientes:** **vista por actividad**, perfil más completo, alta con **dos nombres** y **seguro del cliente** (toggle) con su migración. (#160)

## v1.0.120 — 2026-09-21
- **Ventas / POS:** podés **vender sin internet**: la venta queda guardada en el equipo y se envía sola al reconectar, con el estado de la cola a la vista y la venta marcada para revisión; el catálogo queda disponible sin conexión. (#131)
- **Impresión:** la cola muestra los pendientes con su usuario y permite **cancelarlos de a uno o en lote**, con aviso anti-duplicados ("ya hay una impresión pendiente"); la prueba de impresión se confirma validando el **código del papel**; el instalador del agente ya trae el **USB directo adentro** (sin pasos extra). (#128 #138 #96)
- **Bancos:** catálogo actualizado con logos (se quitan Regional, Visión y BBVA) y el selector ya no se limita a 8 bancos. (#139)
- **Campos:** los últimos campos sueltos de dinero y porcentaje —Caja, límites de Configuración, crédito del cliente y pago al consignador— usan los campos compartidos: separador de miles y coma decimal. (#136)
- **Acceso:** un vendedor **sin sucursal asignada ya puede entrar con su PIN**. (#137)
- **Otros:** pruebas automáticas más estables (impresión e inventario) y, desde ahora, esta sección resume cada entrega en lenguaje de negocio. (#126 #132 #140)

## v1.0.119 — 2026-09-21
- **Otros (Resumen):** el panel de inicio ahora muestra primero lo que hay que
  resolver (pendientes) y los accesos rápidos, con una jerarquía más clara.

## v1.0.118 — 2026-09-21
- **Pedidos:** la lista es una tabla compacta con fecha, nombre y código con
  guion (MOB-#0001); el pedido se abre por su identificador interno, los códigos
  viejos se normalizan y se agrega acceso por QR regenerable, actor, plazo,
  comprobantes en tres modelos (A4 y 58 mm) y búsqueda por modelo del catálogo.
- **Ventas:** cargar venta vuelve a ser **una sola pantalla** (sin pasos
  numerados), con más aire y orden nuevo en pantallas grandes; los combos y los
  puntos de fidelización vuelven a quedar registrados en la venta.
- **Clientes:** mini CRM completo: tabla con búsqueda instantánea, ficha con
  pestañas (Resumen, Pedidos, Cronología, Estadísticas y Datos), deuda desglosada
  por pedido, analítica, informe descargable, WhatsApp con plantillas y vista
  previa, autorizaciones de mayorista/crédito trazables, comentarios internos,
  facturación histórica y direcciones editables.
- **Inventario:** tabla compacta con condición y ubicación por color; cronología
  por unidad con la persona real y verificación con foto; kardex por producto con
  saldo corrido y export CSV; importador CSV/XLSX con validación fila por fila y
  deshacer. En Servicio Técnico: costos desglosados, checklists configurables y
  catálogo con buscador; el resumen muestra el costo pendiente y avisa cuando el
  margen queda incompleto.
- **Impresión:** la auditoría muestra los movimientos de impresoras y puentes en
  español, con búsqueda por IMEI/job/impresora, filtros por persona y fecha,
  export CSV y rastro al cambiar el punto de reorden de un producto.
- **Finanzas:** alta de cuentas de cobro más corta (campos de banco, cuentas
  predeterminadas con logo y descuento) y logo propio por banco del catálogo;
  Caja ya no repite el título de la página.
- **Portal:** la nota pública de la tienda llega al portal del cliente (con el
  contrato de privacidad) y el portal de clientes ya puede llamar al API desde
  `clientes.moboss.online`.
- **Otros:** shell y topbar unificados (Lote 1 del rediseño); PIN enmascarado; en
  Equipo, la ficha del integrante vuelve a mostrar la foto (o iniciales) y la
  sucursal.

## v1.0.117 — 2026-09-21
- **Ventas:** primer reordenamiento de la carga de venta, con resumen fijo en
  pantalla.
- **Otros:** URLs simples y profesionales (`/ventas`, `/pedidos`, `/clientes`,
  `/configuracion/…`) con redirección de los enlaces viejos; se documentó la
  topología de trabajo con el rol Orquestador separado del integrador.

## v1.0.116 — 2026-09-20
- **Impresión:** puentes remotos por sucursal con estado vivo, cola honesta
  (reintentos y aviso de "sin respuesta"), comprobantes nítidos con QR, etiquetas
  de góndola con código de barras, impresión del cierre de caja y del resumen del
  día, y documentos no fiscales (nota de entrega, remisión, recibo y proforma).
- **Portal:** portal público del cliente por QR (cuenta, saldo, pedidos, garantías
  y cuotas) en su propio subdominio.
- **Finanzas:** caja con turnos por usuario y arqueo por denominación;
  conciliación bancaria por importación de extracto; comisiones liquidadas por
  vendedor con comprobante, QR y verificación pública.
- **Clientes:** campañas de recompra y cobranzas/recordatorios por WhatsApp con
  plantillas y mora; alta de clientes en lote.
- **Inventario:** conteos auditables con aprobación; compras con recepción
  parcial y devolución a proveedor; devoluciones con reposición de stock y saldo
  a favor; valuación automática de Trade-In; traslados AEX.
- **Pedidos/Ventas:** ventas suspendidas recuperables y seña/pedido especial
  vinculada al saldo.
- **Otros:** permisos granulares por acción aplicados en el servidor; listas de
  precios completas; búsqueda global; monitor de sincronización y estado de
  dispositivos; instalador del agente de impresión en un solo paso.
