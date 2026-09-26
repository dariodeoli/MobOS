# #148 · Cierre de los restos POS (épica «POS completo»)

Fecha: 26/09/2026 · Versión de referencia: producción **v1.0.182** (main `55d5c685` ·
v1.0.183 en main) · Rama de esta entrega: `slot/pos`.

## Verificación final v1.0.182 (POS con v2 por defecto)

| Sonda | Resultado | Evidencia |
|---|---|---|
| Recorrido POS completo (12 pasos, **sin tocar el flag**: `v2 por defecto: true`) | **12/12**, 0 errores de consola y 0 respuestas API ≥400 | `docs/qa/187-1.0.182-produccion/` |
| Carrito (#243) con variantes *v2-default* | **68 px desktop / 84 px mobile**, 0 desbordes y 0 errores | `docs/qa/243/1.0.182-produccion/` |
| Tope de montos (§9) | el campo marca, el guardado **bloquea** y explica el monto; no crea el pedido | `docs/qa/148-9-pos-tope/1.0.182-produccion-postdeploy/` |
| Menú (#251, referencia) | 8 grupos, Taller, `/ops`, `/celulares`, `/comparador` y `/garantias` como pestaña de Taller | `docs/qa/menu-ia/1.0.182-produccion/` |

(La misma pasada sobre v1.0.181 quedó en `docs/qa/*/1.0.181-*`.)

Con esto el flujo de venta completo queda verificado **en la versión publicada y
sobre el diseño v2 real** (por defecto), sin restos abiertos del lado POS.

Complemento local sobre `main` (`55d5c685`): e2e del POS **44/44 en verde** y
`npm test` **789/789**. Nota de entorno: tras subir la biblioteca de componentes
(`owncoding-ui` v0.38.0) hay que correr `npm install` y limpiar la caché de Vite
(`rm -rf node_modules/.vite`) o el dev server queda con los módulos viejos.

## Checklist de la épica (§1–§24) — estado y evidencia

| § | Tema | Estado | Evidencia |
|---|---|---|---|
| §1 | Nombre y alcance (`/pos`, `/ventas` → `/pos`, carrito siempre visible) | ✅ | `docs/qa/187-1.0.181-produccion/` · `e2e/pos-checkout.spec.js` |
| §2 | Limpieza del formulario (vendedor automático, sin «cero ventas», botones de limpieza) | ✅ | `docs/qa/187-1.0.181-produccion/` (descuento/borrar) · `e2e/pos-qa-173.spec.js` |
| §3 | Layout desktop/móvil con el carrito a la vista | ✅ | 187 (medidas + paso móvil 390) |
| §4 | Cliente: búsqueda, pre-clientes, nombres normalizados, correo, facturar a otro titular | ✅ | 187 (cartera demo y alta) · `e2e/admin.spec.js` · `e2e/qa-236-clientes.spec.js` |
| §5 | Carrito: colapso, cantidades, descuentos y totales | ✅ | `docs/qa/243/1.0.181-produccion/` · `e2e/pos-241-carrito-estados.spec.js` |
| §6 | Buscador de productos y escáner con confirmación | ✅ | 187 (catálogo) · `e2e/pos-qa-173.spec.js` · `scripts/qa-148-s6-escaner.mjs` |
| §7 | Vendedor automático y métricas del POS (por orden) | ✅ | 187 (`TU DÍA 3 → 4`) · `src/utils/resumenVentasDia.test.js` |
| §8 | Cuentas de cobro con buscador contextual | ✅ | 187 (split con cuentas y cápsula) · `e2e/pos-qa-173.spec.js` |
| §9 | Montos y monedas (tope almacenable, bloqueo con mensaje) | ✅ | `docs/qa/148-9-pos-tope/1.0.181-produccion-postdeploy/` |
| §10 | Botón principal por estado (verde/naranja/rojo) | ✅ | 187 (naranja → verde) · `e2e/pos-qa-173.spec.js` |
| §11 | Pagos divididos / no pagado | ✅ | 187 · `e2e/pos-qa-173.spec.js` |
| §12 | Entrega separada del pago (retiro no cobra envío) | ✅ | `docs/qa/187-1.0.181-produccion/` · regresión en `pos-qa-173` |
| §13 | Bloqueo de sesión con PIN | ✅ (PLT) | `e2e/sesion-bloqueo.spec.js` |
| §14 | Menú de tres puntos y preferencias | ✅ (PLT) | `e2e/admin.spec.js` (#228) |
| §15 | Staff y PIN | ✅ (#253) | `docs/qa/253-equipo-acceso/` |
| §16 | Comentarios internos y menciones | ✅ (CRM) | `e2e/qa-148-16-menciones.spec.js` |
| §17 | Caja y auditoría de efectivo | ✅ (FIN) | `e2e/finanzas-caja.spec.js` · arnés `cash-sessions` |
| §18 | Analytics del POS | ✅ | 187 (tablero completo en la demo) |
| §19 | Customers y seguro | ✅ (CRM/FIN) | `e2e/qa-236-clientes.spec.js` · `docs/qa/148-19-*.md` |
| §20 | Borradores, enlace y envío | ✅ | `e2e/pos-fulfillment-borradores.spec.js` · 187 |
| §21 | Pedido y detalle (timeline, acciones) | ✅ | `e2e/pos-pedidos.spec.js` · `e2e/admin.spec.js` |
| §22 | Lista de pedidos (estados visuales) | ✅ | `e2e/pos-pedidos.spec.js` |
| §23 | Documentación interna con buscador | ✅ | `e2e/documentacion.spec.js` · Ayuda (#251) |
| §24 | Orden recomendado de implementación | ✅ (seguido) | — |

## Verificación post-.178 en producción (26/09)

Pasada completa sobre **v1.0.178** con las sondas (`qa-243`, `qa-menu-ia` y el
recorrido POS `qa-187`), todo con capturas:

| Resto POS | Verificación en producción .178 | Evidencia |
|---|---|---|
| §5/§7 carrito y métricas | Carrito 68/84 px (6 variantes) y **TU DÍA 3 → 4 ventas · 4 pedidos** para una venta de 3 unidades (cuenta por orden) | `docs/qa/243/1.0.178-produccion/` · `docs/qa/187-1.0.178-produccion/` |
| §11/§12 entrega y split | Split con saldo precargado y **retiro no cobra envío**: el cierre queda en Gs 13.880.000 | `docs/qa/187-1.0.178-produccion/20-venta-antes-de-confirmar.jpg` |
| §9 montos | Bloqueo con mensaje del tope, **re-verificado en .178** | `docs/qa/148-9-pos-tope/1.0.178-produccion-postdeploy/` (y `.172`) |
| §20 borradores | Suspender/listar/recuperar en la demo | `docs/qa/187-1.0.178-produccion/` |
| Menú (#251) | 8 grupos, Taller, `/ops`, `/celulares` y `/comparador` desde el menú | `docs/qa/menu-ia/1.0.178-produccion/` |

Recorrido POS completo en .178: **12/12 pasos, 0 errores de consola, 0 respuestas
API ≥400, 0 pedidos fallidos**.

### Con v2 por defecto (F4)

El mismo recorrido, **sin tocar el flag por dispositivo** (v2 default), dio **12/12
pasos con `v2 por defecto: true` y 0 errores**, y el carrito midió 68/84 px en las
variantes *v2-default*: `docs/qa/187-1.0.178-f4/` · `docs/qa/243/1.0.178-f4/`.
Con esto el flujo de venta completo queda verificado sobre el diseño v2 real.

## Pendientes que NO son del POS (revisados en v1.0.181)

- **§9 BigInt**: los montos siguen en columnas de 32 bits (sin migración a BigInt
  en `backend/prisma`), así que los 10B/99B de producto no se pueden almacenar. El
  POS bloquea con mensaje claro en vez de fallar en silencio: es una unidad
  cross-dominio con `db:check`, fuera del alcance del POS.
- **Gift cards reales**: decisión de producto (hoy el equivalente es el saldo a favor).
- **INV**: el rechazo de precio/stock sigue diciendo «Precio y stock deben ser
  enteros válidos» (`backend/app/api/products/route.ts`), cosmético y del catálogo.
- **Sesión real**: borradores en servidor, analytics real y cierre con comprobante
  quedan listados en `docs/QA-187-pos-demo.md` para cuando haya acceso a una cuenta real.

Con esto el dominio POS de #148 queda sin restos abiertos; el cierre formal del
issue queda para el integrador con esta evidencia.
