# Novedades para el dueño

Registro acumulativo de lo que sale a producción, contado en lenguaje de negocio
(sin jerga técnica). Cada release agrega su sección `## vX — fecha` y los cambios
se agrupan por módulo: **Pedidos · Ventas · Clientes · Inventario · Impresión ·
Finanzas · Portal · Otros**.

**Cómo se mantiene:** el integrador agrega la sección de la versión publicada en
cada integración, y todo handover/cierre de issue incluye un bloque
`Novedades para el dueño` (2-5 bullets) con el resumen de lo entregado.

---

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
