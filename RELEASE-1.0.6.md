# MobOS 1.0.6 — reportes y exportación

**Estado: preparado localmente, sin publicar.** El deploy al Owncoding Hub y el
aumento de versión visible en `src/lib/brand.js` quedan pendientes de autorización
y de acceso al Hub.

## Qué agrega

Reportes reales sobre la base de producción, no sobre la capa JSON local.

- `GET /api/reports?from=YYYY-MM-DD&to=YYYY-MM-DD&groupBy=product|category|seller|day&branchId=…`
- Rol: `ADMIN` y `GERENTE`. Un `VENDEDOR` recibe 403. Siempre dentro de la propia
  empresa; la sucursal opcional debe ser activa y de la misma empresa.
- Fuente: `Order` + `OrderItem` + `Payment`. Usa el costo congelado de cada línea
  (`unitCostPyg`), no el costo actual del producto.
- Apartado nuevo **Reportes** en el Centro de control, entre Resumen y Ganancias,
  con selector de período, agrupación, exportación CSV e impresión.
- En la demo aislada el apartado no consulta la API y explica por qué: la demo es
  una copia local sin datos reales y no se inventan cifras.

## Criterios de cálculo

- Una venta cuenta una sola vez aunque tenga varios pagos o líneas.
- Solo los pagos `CONFIRMED` son cobro. `PENDING` no suma cobrado y queda en saldo.
- Las órdenes `CANCELLED` no suman.
- La ganancia usa solo líneas con costo conocido. Las líneas sin costo se informan
  aparte (`salesWithoutCostPyg`, `linesWithoutCost`) y nunca se asumen como costo 0.
- Producto y categoría agrupan por línea: el descuento global y los cobros
  pertenecen a la orden y no se reparten. Día y vendedor agrupan por orden, con
  totales, cobros y saldo reales.
- El día del negocio usa el desfase configurable (`tzOffset`, por defecto -180 =
  UTC-3, Paraguay). No se deduce del navegador.
- Los importes se acumulan con control de rango entero; un período que excede el
  rango devuelve error en vez de un número silenciosamente incorrecto.

## Evidencia de pruebas

- `node backend/tests/run-reporting.cjs` → **17 pruebas, 17 aprobadas**.
- `node --test src/utils/reportes.test.js` → **8 pruebas, 8 aprobadas**.
- `node backend/tests/run-unit.cjs` → 4 aprobadas (sin regresiones).
- `npm run build` en el backend → compila; `/api/reports` queda registrada.
- `npm run build` en el frontend → compila (1671 módulos).
- `MOBOS_IT_EXECUTE=1 bash backend/tests/integration-http.sh` → **PASS completo**,
  incluido el bloque nuevo: 401 sin sesión, 403 para vendedor, 400 para rango
  invertido, agrupación inválida y fecha imposible, 404 para sucursal de otra
  empresa, y las cuatro agrupaciones reconciliando contra PostgreSQL real
  (13 ventas del arnés, suma de grupos igual al total).

## Pendiente para publicar

1. Autorización de Dario y acceso al Owncoding Hub (sesión o token de API).
2. Publicar el backend primero, después el frontend.
3. Aumentar `APP_VERSION` a `v1.0.6` en `src/lib/brand.js` al publicar.
4. Verificar en producción con datos reales y revisar los estados vacíos.

## Fuera de alcance de esta entrega

Compras/importaciones, garantías/reparaciones e integración RUC siguen pendientes
según `MOBSYS_WORKMAP.md`. Los reportes no exportan PDF todavía: el botón Imprimir
usa el diálogo del navegador.
