# #213 · Cierre visual de la demo (experiencia completa)

Verificación de que la demo pública muestra la **experiencia completa** con
datos ficticios, sin tocar la base real y sin llamar al API del dominio.

- **Método:** `node scripts/qa-213-demo-visual.mjs` (Playwright headless; entra
  por `/demo` como dueño y recorre 22 pantallas contando filas/indicadores).
- **Versión de referencia:** producción v1.0.181 (rama local para el fix de
  autorizaciones, que entra en el próximo release).
- **Evidencia:** `docs/qa/213-demo-visual/antes/` (producción, con el gap) y
  `.../despues/` (rama, con el fix) — capturas por pantalla + `resultados.json`.

## Qué muestra la demo hoy

| Pantalla | Datos ficticios | Pantalla | Datos ficticios |
|---|---|---|---|
| Inicio | KPIs y hero con datos | Taller/rack | Carriles con equipos |
| POS | Catálogo y carrito | Compras | 2 compras + proveedores |
| Pedidos | 15 en estados variados | Caja | Movimientos y arqueo |
| Clientes | 12 con deuda/etiquetas | Bancos y cuentas | 9 cuentas |
| Inventario | 23 iPhone con IMEI de prueba | Conciliación | Diferencias y lotes |
| Reservas | 3 con cliente y vencimiento | Autorizaciones | **4 solicitudes** (2 pendientes) |
| Servicio | 4 órdenes del pipeline | Trade-In | 2 cotizaciones |
| Garantías | 2 activas | Equipo | 6 integrantes con roles |
| Dispositivos | 2 impresoras demo + cola | Gastos/Publicidad | Formularios con datos |

## Gap cerrado: Autorizaciones

Antes la demo decía *«La demo no tiene solicitudes reales.»* y no mostraba la
pantalla. Ahora muestra **4 solicitudes ficticias** —crédito y descuento
pendientes; mayorista aprobada; precio bajo lista rechazada— con aviso de datos
ficticios y **resolución simulada** (aprobar/rechazar no llama al API ni cambia
condiciones). Capturas:
`antes/13-autorizaciones-desktop-claro.jpg` → `despues/13-autorizaciones-desktop-claro.jpg`.

Cierre automático: `e2e/demo-autorizaciones.spec.js` (proyecto `core`) exige las
4 filas, el badge de pendientes, la aprobación simulada y **0 llamadas** a
`/api/authorizations`.

## Notas y límites (por diseño)

- **Créditos, Cuotas y Comisiones** (Finanzas) no se montan en la demo: sus
  pantallas necesitan el API real. La demo los representa con la **deuda de los
  clientes**, los tiles «Por cobrar» de Inicio/Clientes y las comisiones de
  Inicio/Equipo.
- Todo es **session-only** (#201): se descarta al recargar; nada toca la base.
- Los IMEIs son ficticios y claramente inválidos; teléfonos `+595 9xx` y montos
  PYG/USD consistentes.
