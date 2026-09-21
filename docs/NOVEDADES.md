# Novedades para el dueño

Registro acumulativo de lo que sale a producción, contado en lenguaje de negocio
(sin jerga técnica). Cada release agrega su sección `## vX — fecha` y los cambios
se agrupan por módulo: **Pedidos · Ventas · Clientes · Inventario · Impresión ·
Finanzas · Portal · Otros**.

**Cómo se mantiene:** el integrador agrega la sección de la versión publicada en
cada integración, y todo handover/cierre de issue incluye un bloque
`Novedades para el dueño` (2-5 bullets) con el resumen de lo entregado.

---

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
