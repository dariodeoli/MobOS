# #236 — Clientes estilo Pedidos: ojito con resumen rápido + detalle completo

La lista de Clientes ahora tiene **filas con aire y datos clave** (estilo Pedidos)
y **dos accesos por cliente**: el **ojito** abre un **resumen rápido** (popup
rediseñado) y el ícono de detalle abre el **perfil completo** (CustomerProfile).
Capturas en `docs/QA-236-clientes/` (antes: `01-antes-lista.png`, diseño previo
en producción v1.0.138; después: `02…05`).

## Qué cambió

| Archivo | Cambio |
|---|---|
| `src/components/customers/ClientesTabla.jsx` | Filas con más espacio (dos líneas: nombre + contacto) y columnas: Cliente/contacto · Tipo · Pedidos · Total gastado · **Última compra** · **Deuda** · Acciones. Se mantienen el orden por columnas (se suman última compra y deuda), la selección por lote y el WhatsApp con plantilla |
| `src/components/customers/ClienteResumenPopup.jsx` (nuevo) | **Resumen rápido** por cliente: avatar + tipo + contacto + tags, KPIs (total gastado, pedidos, última compra, deuda, seguro, tipo), **últimas compras** con estado, notas interna/pública y acciones rápidas **WhatsApp** · **Editar** · **Ver detalle completo** |
| `src/components/customers/CustomerProfile.jsx` | Acepta `tabInicial` (el «Editar» del resumen entra por **Datos**); adopta la constante de la plantilla de WhatsApp |
| `src/components/ventas/SellerCustomers.jsx` | Cablea los dos accesos y el popup; la fila sigue abriendo el detalle completo |
| `src/components/customers/customerMessaging.js` | `ULTIMA_PLANTILLA_CLIENTES` (misma plantilla recordada en lista, popup y ficha) |
| `src/lib/customerAggregates.js` + `backend/app/api/customers/route.ts` | La deuda entra en las stats del listado: `pendingPyg` (total − cobrado confirmado, sin cancelados) en la fórmula pura y en la consulta del API |
| `src/components/ui/index.jsx` | `IconAction` suma `size="touch"` (área táctil 36 px) — cambio additivo, **anotado para CMP** |

Objetos de la biblioteca reusados: `Modal`, `Avatar`, `Badge`, `FilaDato`,
`CeldaMoneda`, `IconAction`, `WhatsAppMenu`, `Skeleton`, `BarraLote`,
`ROTULO_DATO`/`CELDA_DATO` (`shared/tabla.js`), estados con
`lib/estadosPedido.js`, fechas con `utils/pedido.js` (compacta/legible) y
`telefonoVisible`. No hizo falta crear objetos nuevos salvo el tamaño táctil de
`IconAction` (coordinación CMP anotada).

## Evidencia

| Captura | Qué muestra |
|---|---|
| `01-antes-lista.png` | Diseño previo (producción v1.0.138): fila compacta de una línea, sin última compra ni deuda |
| `02-despues-lista.png` | Fila nueva en cuenta real: nombre + contacto, tipo, pedidos, **Gs 300.000**, **22 sep · 05:38**, **Deuda Gs 200.000**, ojito + detalle + WhatsApp y la barra de lote activa |
| `03-despues-popup.png` | **Resumen rápido**: avatar, tipo, contacto, tags, KPIs (incluida la deuda), últimas compras con estado y acciones rápidas |
| `04-despues-detalle-completo.png` | «Ver detalle completo» abre el **CustomerProfile** (pestañas Resumen/Estadísticas) |
| `05-despues-editar-datos.png` | «Editar» abre el perfil por la pestaña **Datos** |

## Verificación

- `node --test src/lib/customerAggregates.test.js` ✓ (nuevo test de deuda:
  pendiente guardado y calculado, cancelados excluidos) · `npm test` **517 ✓** ·
  backend `test:unit` **71 ✓** y `tsc` sin errores.
- e2e `e2e/qa-236-clientes.spec.js` (cuenta real del harness): fila con datos
  clave, los tres accesos con aria/tooltip, lote, popup, detalle completo,
  detalle directo y «Editar» por Datos ✓.
- e2e demo (`e2e/demo-crm.spec.js`): el ojito abre el resumen con los datos
  locales y «Ver detalle completo» entra al perfil ✓ (la demo no toca el API).
- Lote afectado (`qa-236`, `demo-crm`, mini CRM, `qa-160-perfil`) ✓ ·
  `test:e2e:smoke` ✓.
- `lint` 0 · builds FE/BE exit 0 con `BUILD_ID` · `prisma:validate` ✓ · sin
  marcadores. (Sin cambios de schema: `db:check` no aplica.)

## Notas

- La fila mantiene el clic como acceso al detalle completo (comportamiento
  previo) y el ojito queda como acceso al resumen (con `stopPropagation`).
- Mobile: los dos accesos usan `IconAction size="touch"` (36 px) con
  `title`/`aria-label`; la ficha del popup apila sus bloques.
