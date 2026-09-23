# Cierre de #221 — [Demo] Clientes y pedidos como la cuenta real

Material listo para el cierre/registro del issue (lo publica el integrador).
**Estado actual: #221 cerrado** (22/9 00:28 UTC) con la verificación del
merge `9d650da` (commits `07fd5d4`/`b4209cb`, v1.0.136). El incremento posterior
de la rama `slot/clientes` quedó integrado por `52836152` (22/9 05:34) y salió en
**v1.0.140**; el issue **no** lleva todavía el addendum con ese incremento (queda
listo para pegar más abajo). Este dossier consolida todo lo entregado.

Incremento posterior de la rama `slot/clientes` (#236/#240): **seguimiento del
informe compartido visto/no visto** — la ficha demo muestra el chip Visto/Sin
ver por equipo y la cronología la apertura del cliente, con la misma semántica
que la cuenta real (`docs/QA-240-informe-visto.md`).

Re-verificado en producción **v1.0.144** (23/9/2026):
`scripts/qa-221-clientes-produccion.mjs` **8/8** y 0 llamadas al API
(`docs/QA-221-236-produccion/`).

## Qué pedía #221 (contra `origin/main`)

| Pedido | Dónde vive | Estado |
|---|---|---|
| Pedidos asociados al cliente en la demo | `src/lib/demoClientes.js` (`demoProfile.orders` + `buildDemoProfile`) | ✅ |
| Lista con total gastado, pedidos, última compra “como la cuenta real” | `src/lib/customerAggregates.js` (`statsDePedidos`) + `CustomerFields` en `SellerCustomers.jsx` (usa `row.stats` del API o los pedidos demo, sin atajos) | ✅ |
| Perfil con últimos pedidos, desde cuándo es cliente, último pedido y promedio mensual, calculados de verdad | `analiticaDePedidos` (misma fórmula que el backend, TZ America/Asuncion) + `buildDemoAnalytics` + la ficha (`Resumen`, `Pedidos`, `Estadísticas`) | ✅ |
| Datos demo enriquecidos (varias compras, fechas repartidas, montos y estados distintos, seriales) | seeds de `demoClientes.js` (+ `historial()` para la cartera ampliada #213) | ✅ |
| Capturas + checks + e2e smoke | `docs/QA-221-demo-clientes.md` + `qa221-*.png` (v1.0.136) y `docs/QA-221-demo-clientes-prod.md` + `docs/QA-221-demo-clientes-prod/` (post-deploy **v1.0.138**, 8/8) | ✅ |

## Incremento posterior (rama `slot/clientes`) que amplía #221

| Commit | Qué agrega |
|---|---|
| `1eed385b` | **La venta del POS demo entra en la ficha del cliente**: la actividad reciente, el total gastado, los pedidos, la deuda, las estadísticas y el portal se recalculan al vender (antes quedaban congelados en el seed) |
| `1d7cd6c2` + `3ea5c250` | Verificación post-deploy del dominio clientes (17/17 + 8/8 sobre **v1.0.138**, 0 llamadas al API real) |
| `fb871412` | **§19 en la demo**: perfil completo y coherente (paga impuestos, tags, direcciones adicionales), avisos corregidos, plantillas demo del cliente y portal **Aurora Móviles** con nota pública |
| (nuevo) | **§19 en cuenta real**: verificación del perfil completo (11 ítems) + seguro con un spec sobre la cuenta real del harness (`e2e/qa-160-perfil.spec.js`) y fix de la antigüedad de clientes creados hoy («—» → «Hoy») |

## Índice de evidencia (consolidado)

| Evidencia | Qué cubre |
|---|---|
| `docs/QA-221-demo-clientes.md` + `qa221-*.png` | Agregados del demo (v1.0.136): lista y ficha con total, pedidos, última compra, ticket, promedio mensual y frecuencia |
| `docs/QA-221-demo-clientes-prod.md` + `docs/QA-221-demo-clientes-prod/` | Post-deploy **v1.0.138**: 8/8 pasos, 0 llamadas al API real, capturas y `resultados.json` |
| `docs/QA-187-clientes-produccion.md` + carpeta | Dominio clientes completo en producción (17/17 sobre v1.0.138), públicos e impresiones |
| `docs/QA-160-demo-crm-actividad.md` + carpeta | La venta del POS demo entra en la ficha + §19 completo en la demo (9 capturas) |
| `docs/QA-160-perfil-produccion.md` + carpeta | §19 en **cuenta real**: los 11 ítems del perfil + seguro (6 capturas) |
| `docs/QA-236-clientes.md` + `docs/QA-236-clientes-demo/` | **Demo verificada del ojito/popup y la vista estilo Pedidos (#236)**: 6/6 pasos, capturas de lista, resumen rápido (con los agregados de #221), detalle completo, editar y mobile; 0 llamadas al API |
| `scripts/qa-236-clientes-demo.mjs` | Verificador reusable (harness o producción) de la demo de Clientes; post-.140 se corre en producción |
| `e2e/demo-crm.spec.js` · `e2e/qa-160-perfil.spec.js` · `e2e/qa-236-clientes.spec.js` · `src/lib/customerAggregates.test.js` · `src/lib/demoClientes.test.js` | Suites que fijan el comportamiento |

## Comentario listo para pegar (cuando se integre la rama)

```md
**Incremento de #221 integrado y verificado** — commits `1eed385b`, `1d7cd6c2`, `3ea5c250` (rama `slot/clientes`).

Además de los agregados (que ya salieron en v1.0.136), la demo ahora se comporta como la cuenta real también al vender:
- el POS busca en **toda** la cartera demo (seeds + creados) y la venta entra en la ficha del cliente;
- el listado lo sube por **actividad reciente** y actualiza total gastado, pedidos y última compra;
- la ficha, la cronología, las estadísticas y el portal muestran el pedido nuevo (número demo `AUR-…`).

Verificado contra producción **v1.0.138** (`docs/QA-221-demo-clientes-prod.md`: 8/8, sin llamadas al API real), con el e2e `e2e/demo-crm.spec.js`, y con el perfil §19 completo corriendo sobre una **cuenta real** (`e2e/qa-160-perfil.spec.js` + `docs/QA-160-perfil-produccion.md`: antigüedad, gastado, órdenes, últimas órdenes, direcciones con adicionales, notas, RUC, tags, minorista/mayorista, paga impuestos y seguro). La demo no toca la tienda real (los datos viven en la pestaña).

**Novedades para el dueño**
- En la demo, venderle a un cliente de la cartera lo sube en la lista y actualiza su ficha al instante (compras, total gastado, última compra).
- El perfil demo queda completo: antigüedad, gastado, órdenes, direcciones (con adicionales), notas, RUC, etiquetas, minorista/mayorista y paga impuestos.
- El portal del cliente de la demo sale con el nombre real de la tienda (Aurora Móviles) y su nota para el cliente.
- Todo sigue siendo demo: nada se guarda en una tienda real y la app lo avisa.
```

## Observaciones abiertas (no bloquean)

- La ficha cuenta el historial de pedidos y el listado cuenta compras válidas
  (documentado; dos criterios distintos).
- Los favoritos de la demo muestran montos por producto en Gs 0 porque los ítems
  de seed no traen importe (las cantidades y el total sí son reales).
- El impacto del seguro en el margen es de FIN (#162, cerrado); el % por empresa
  y por cliente se configura como indica §19.
- «RUC» en el Resumen usa el RUC de facturación: con solo CI cargado muestra
  «—» (el CI está en la cabecera de la ficha). Documentado.
- **Corregido en el incremento**: la antigüedad de un cliente creado hoy
  mostraba «—» (ahora «Hoy»); el % del seguro del resumen rápido mostraba
  «12.5%» (ahora «12,5%»).
