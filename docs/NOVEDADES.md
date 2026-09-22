# Novedades para el dueño

Registro acumulativo de lo que sale a producción, contado en lenguaje de negocio
(sin jerga técnica). Cada release agrega su sección `## vX — fecha` y los cambios
se agrupan por módulo: **Pedidos · Ventas · Clientes · Inventario · Impresión ·
Finanzas · Portal · Otros**.

**Cómo se mantiene:** el integrador agrega la sección de la versión publicada en
cada integración, y todo handover/cierre de issue incluye un bloque
`Novedades para el dueño` (2-5 bullets) con el resumen de lo entregado.

---

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
