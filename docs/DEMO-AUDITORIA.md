# Auditoría de la demo completa

Rama `codex/demo-completa` (base `codex/tanda-rediseno-2`). La demo vive en el navegador: no hay API, las fechas son relativas a «hoy» (Paraguay) y todo se reinicia al recargar. Esta auditoría recorrió cada rol (Dueño, Gerente, Vendedor, Caja, Técnico, Delivery y el portal del cliente vía «Ver como») y cada vista de su menú, en escritorio (1280) y celular (375), buscando pantallas vacías, errores de consola, botones que fallan y datos incoherentes.

El recorrido es automático y queda como regresión: `e2e/demo-completa.spec.js` (config frontend `e2e/demo-completa.frontend.config.js`, asignado a un shard en `e2e/sharding.json`).

## Resultado de la auditoría (antes)

| # | Rol / vista | Problema | Arreglo |
|---|---|---|---|
| 1 | Dueño · Inicio de operaciones (`/ops`) | KPIs de pedidos y cobros en cero («en la demo no se leen pedidos reales») y columna «Verificado» vacía | Los KPIs salen de los pedidos ficticios; las unidades con inspección grado B quedan «Verificado» y las de grado A «Listo» |
| 2 | Dueño · Finanzas → Gastos | Libro vacío | 25 movimientos de ~4 meses (gastos, cheques pendientes/cobrado, adelantos, retiro del dueño); cargar un gasto o marcar/anular un cheque actualiza totales |
| 3 | Dueño · Finanzas → Publicidad | Sin inversiones | 15 inversiones en 4 meses y 5 plataformas, sumadas al tablero de ganancias |
| 4 | Dueño · Finanzas → Créditos, Cuotas, Comisiones | Pestañas ocultas en demo | Las tres visibles y funcionales: mora y uso del cupo, cuotas vencidas/próximas con recargo y aviso por WhatsApp registrado, reglas y liquidaciones de comisión (cerrar, pagar, anular) |
| 5 | Dueño/Gerente · Campañas | Ruta desactivada en demo | Habilitada con segmentos calculados sobre la cartera ficticia; cuatro clientes dormidos nuevos (inactivos y mayoristas dormidos) |
| 6 | Pedidos · filtro «A crédito» | Vacío (sin ventas a crédito) | Cuatro ventas a crédito (en mora, próxima a vencer, con seña) coherentes con Créditos y Cuotas; pedidos en preparación, listo para retirar y anulado |
| 7 | Stock → Traslados | «Todavía no hay transferencias» aunque había un equipo en tránsito | Dos traslados sembrados (en camino con guía AEX y recibido) |
| 8 | Stock → Eliminados | Vacío | Dos bajas recuperables |
| 9 | Stock → Verificación | Historial vacío | Dos verificaciones terminadas y una cancelada |
| 10 | Stock → Alertas / Compras → «Sugerir reposición» | Pedían `/api/stock-alerts` | Usan las alertas del catálogo local |
| 11 | Compras y Stock | Cotización USD pedía `/api/fx` | Cotización ficticia fija en demo (sin servicio externo) |
| 12 | Promociones | Un solo cupón con vigencia fija | Cinco cupones con vigencias relativas (activo, de producto, agotado, de quincena, vencido) |
| 13 | Compras | 2 órdenes, saldo por pagar en cero | 5 órdenes: crédito vencido, parcial con saldo, recibidas y borrador |
| 14 | Taller → Garantías | 2 casos | 7 casos en las cuatro etapas, con vencimientos por vencer |
| 15 | Trade-In | 2 equipos y «Todavía no hay valores cargados» | 6 equipos en todas las etapas y tabla de valores de toma editable |
| 16 | Delivery → Viajes y cierres | Solo un aviso («se configura en una empresa real») | Viajes, tarifas, cierre semanal y ajustes con datos de las últimas semanas |
| 17 | Configuración → Seguridad | «Seguridad de la cuenta no está disponible en la demo» | Sesiones activas de ejemplo que se pueden cerrar (solo en la pestaña) |
| 18 | Configuración → Sistema / Mi cuenta | «Todavía no hay conexiones autorizadas» (MCP) | Una conexión de ejemplo revocable |
| 19 | Portal del cliente (Lucía) | «Todavía no tenés saldo a favor» y «No tenés garantías activas», contra su ficha | Saldo a favor, puntos y garantías del portal salen de la ficha |
| 20 | Consola | `validateDOMNesting` (ayuda del flujo de compras) y clave repetida en Ventas del día | Corregidos |

## Fuera de alcance / por diseño

- Precios para Vendedor, Caja y Delivery muestra el aviso «solo administración o gerencia» (permiso real; no se tocan permisos).
- «Eliminar mi cuenta» dice «No disponible en la demo» (acción destructiva real).
- Los QR de liquidaciones de comisión llevan un token ficticio: la verificación pública solo existe en la tienda real.
- Servicios externos: la demo solo habla con la medición anónima (`/api/public/track`, ya existente) y, cuando la persona lo pide, con la consulta pública de RUC. Los envíos por WhatsApp abren el enlace `wa.me` solo por clic del usuario.

## Cobertura del e2e

- Un test por rol recorre todas las vistas de su menú: falla si una queda vacía (menos de 120 caracteres o con un estado vacío en la carga inicial), si redirige, si hay errores de consola o de página, o si se llama a `/api/*` salvo la medición anónima.
- Portal del cliente, 375 px sin scroll horizontal y siete flujos de acciones (gastos, campañas, créditos y cuotas, comisiones, delivery, trade-in, traslados/verificaciones/bajas).

## Historia y cronologías (rama `codex/demo-historial`)

La demo cuenta una historia completa y coherente de ~4 meses, relativa a «hoy» y al momento de carga (hay datos de hace minutos, de hoy, de ayer, de la semana, del mes y de meses anteriores sin importar el día ni la hora). Todo se **deriva** de las mismas ventas, compras, gastos y unidades, así los totales, saldos y stock no se contradicen. Sin llamadas externas.

| Dónde | Qué se ve | Fuente |
|---|---|---|
| Pedido → Cronología | Creación, nota, IMEI vendidos, crédito autorizado, pagos (seña, cuotas), preparación → listo/enviado/en camino → retirado/entregado, avisos por WhatsApp y anulación; ≥3 eventos en todos los estados | `src/lib/demo/historiaPedido.js` |
| Cliente → Cronología | Alta, pedidos, pagos, entregas, cuotas vencidas con mora y aviso, mensajes, garantías, taller por etapa, notas y seguimientos | `historiaCliente.js` |
| Finanzas → Bancos y cuentas → «Movimientos» | Caja (Gs y USD), Itaú, Continental, Ueno ahorro, GNB del dueño, tarjetas (Ueno, Dinelco con comisión y acreditación), Pix, USDT y Canje: día por día con saldo corrido y filtros Hoy, Ayer, 7 días, Mes, Mes anterior | `historiaCuentas.js` + `ventasCobertura.js` |
| Finanzas → Caja → Cronología de la sesión; Ventas por caja | Turnos diarios de 4 meses: apertura, cobros en efectivo, gastos chicos, aportes, depósito del día al banco, arqueo y diferencia; la apertura de cada día es lo contado el anterior | `historiaCuentas.js` |
| Producto → Kardex / Compras; IMEI → Cronología | Compras con proveedor y costo, ventas con su pedido real, ajustes de conteo, traslados, bajas, reservas, devoluciones y cambios por garantía; el saldo cierra contra el stock | `historiaStock.js` |
| Taller → orden → «Historial por etapa» | Recepción, checklist, aviso, diagnóstico, presupuesto, con técnico, repuesto, reparado, listo, entregado | `historiaTaller.js` |
| Finanzas → Cuotas → «Historial» | Plan de crédito, entrega inicial y pagos parciales, vencimiento, mora con recargo y avisos | `historiaCuota.js` |

**Asistencias y turnos del equipo:** la app no tiene esa vista (no hay modelo ni pantalla de asistencia, entradas/salidas ni tardanzas; «turnos» son los turnos de caja). No se inventó: si se agrega el módulo, la demo debe sembrarla con este mismo criterio.

**Auditoría/actividad:** la cronología de cada pedido, cliente, caja, taller y cuota incluye las acciones del equipo (quién y cuándo). La auditoría de medios y efectivo (`demoAuditoria.js`) ya sale de las mismas ventas.

Coherencia verificada en `src/lib/demo/historiaCompleta.test.js` (saldos de caja y bancos, turnos encadenados, transferencias que se anulan, kardex contra stock, períodos no vacíos en 21 instantes de carga) y en `e2e/demo-completa.spec.js` («historia y cronologías»).
