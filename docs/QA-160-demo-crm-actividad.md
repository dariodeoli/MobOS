# #160 / #194 — CRM demo vivo: §19 completo en el perfil (y venta del POS)

Brecha de la épica **#148 §19** (Customers) en el dominio CRM, identificada y
cerrada sobre la **demo (#194)** en dos partes. Capturas en
`docs/QA-160-demo-crm-actividad/`.

## Qué faltaba (auditoría)

- **Cuenta real (§19 / #160):** vista por actividad reciente, perfil completo
  (antigüedad, total gastado, órdenes, últimas órdenes, direcciones, notas, RUC,
  tags, minorista/mayorista, paga impuestos) y seguro: desplegado y verificado
  (#160 cerrado en v1.0.121; re-verificado en `docs/QA-187-clientes-produccion.md`).
  El impacto del seguro en el margen es de FIN (#162), también cerrado.
- **Demo (#194), los huecos reales:**
  1. **El POS no veía la cartera demo** (buscaba solo lo creado en la pestaña):
     los clientes sembrados no se podían elegir y la venta no entraba en la ficha
     → la vista por actividad y los agregados (#221) quedaban congelados.
  2. **Datos demo incompletos/incoherentes para §19**: los mayoristas salían
     “No (exento)” de impuestos, 6 clientes sin etiquetas, todos con una sola
     dirección, y nombres con “(demo)”.
  3. **Observaciones de la verificación post-deploy**: la ficha y las
     Estadísticas de demo avisaban cosas desactualizadas, la plantilla demo de
     Clientes dejaba una variable de pedido vacía, el portal decía “Tienda demo”
     (la tienda es **Aurora Móviles**) y la vitrina no mostraba “Nota de la
     tienda” porque ningún cliente demo tenía nota pública.

## Entregado

### 1. La venta del POS entra en la ficha (actividad + agregados vivos)

| Archivo | Cambio |
|---|---|
| `src/lib/demoClientes.js` | `listarClientesDemo()`, `buscarClienteDemo()`, `actualizarClienteDemo()` y `registrarPedidoDemoDeVenta()` (pedido canónico + evento en la cronología) |
| `src/lib/demoTenant.js` | `tomarNumeroPedidoDemo()` → `AUR-#0001` consumido |
| `CheckoutCustomer.jsx` | el POS busca en toda la cartera demo |
| `FormularioVenta.jsx` | la venta demo registra el pedido en la ficha y usa el número demo |

### 2. §19 completo en el perfil demo (datos + avisos + portal)

| Archivo | Cambio |
|---|---|
| `src/lib/demoClientes.js` | `taxExempt` por opción (un mayorista con RUC ya no sale “exento”); etiquetas en los 12 clientes; **direcciones adicionales** (Lucía “Trabajo”, Distribuidora del Este “Sucursal”, Ramiro “Depósito”); nombres sin “(demo)”; **nota pública** sembrada en Lucía; portal demo como **Aurora Móviles** y `notaPublica` en la vitrina |
| `src/components/customers/customerMessaging.js` | `DEMO_CUSTOMER_TEMPLATES` (variables del cliente: nombre, saldo, sucursal) |
| `CustomerProfile.jsx` | plantilla demo del cliente en la ficha; avisos de demo corregidos (la ficha ya no dice que no hay pedidos/deuda/portal; las Estadísticas aclaran que salen de los pedidos demo) |
| `SellerCustomers.jsx` | el listado usa las plantillas demo del cliente |
| `e2e/auth.spec.js` | el portal demo verifica **Aurora Móviles** |

## Evidencia

| Captura | Qué muestra |
|---|---|
| `01-antes-lista.png` | Lucía con **5 compras · Gs 7.750.000** (seed #221) |
| `02-pos-venta.png` | POS demo con Lucía **elegida desde la cartera sembrada** y la venta de Gs 180.000 |
| `03-despues-lista.png` | Lucía **primera por actividad reciente** con **6 compras · Gs 7.930.000** |
| `04-despues-ficha.png` | Ficha: total **7.930.000**, saldo **1.680.000**, órdenes activas 2, última compra hoy |
| `05-perfil-mayorista.png` | §19 en una pantalla: **Mayorista**, **Paga impuestos: Sí**, Antigüedad, RUC, TOTAL GASTADO, PEDIDOS, últimas órdenes, dirección y etiqueta |
| `06-perfil-mayorista-direcciones.png` | Direcciones del mayorista: “Casa” (Predeterminada) + “Depósito” |
| `07-perfil-lucia-direcciones.png` | Direcciones de Lucía: “Casa” + “Trabajo” |
| `08-whatsapp-cliente.png` | Plantilla demo del cliente completa (nombre + saldo, sin variables de pedido) |
| `09-vitrina-nota-tienda.png` | Vitrina **Aurora Móviles** con **Nota de la tienda** y los pedidos del cliente |

## Verificación

- `node --test src/lib/demoClientes.test.js` **6/6** (incluye el test de
  completitud de §19 para **todos** los clientes demo: tipo, impuestos, tags,
  direcciones, antigüedad y gastado/órdenes, y que ningún mayorista esté exento).
- `npx playwright test e2e/demo-crm.spec.js` ✓ (venta → actividad/agregados,
  perfiles §19 con direcciones adicionales, plantilla del cliente y vitrina con
  nota pública), sin llamadas al API real.
- `npm test`, builds FE/BE, `prisma:validate`, `test:e2e:smoke` y el lote
  demo/CRM/POS: ver el handover.

## Observaciones de la verificación (.137/.138) — estado

| Observación | Estado |
|---|---|
| La ficha demo avisaba “No hay pedidos, pagos, deuda, cronología ni portal” | **Corregida** (aviso real) |
| Las Estadísticas demo decían “se calculan con las ventas reales de la tienda” | **Corregida** |
| La plantilla demo de Clientes dejaba “Tu pedido  ya está…” | **Corregida** (`DEMO_CUSTOMER_TEMPLATES`) |
| El portal decía “Tienda demo” | **Corregida** → **Aurora Móviles** |
| La vitrina no mostraba “Nota de la tienda” | **Corregida** (nota pública sembrada + `notaPublica` en la vitrina) |
| La ficha cuenta el historial (7) y el listado compras válidas (6) | **Se mantiene** (dos criterios: historial vs compras; documentado) |
| Los favoritos demo muestran montos por producto en Gs 0 | **Se mantiene** (los ítems demo no traen importe; las cantidades son reales) |
