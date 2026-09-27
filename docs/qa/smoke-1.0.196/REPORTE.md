# Smoke de producción — v1.0.196 (27/09)

Pedido de Dario: caminos críticos (login, venta/pedido, inventario, clientes,
impresión) sobre **producción**, con la sesión de QA (demo pública; no toca
datos reales). Salida de los scripts en esta carpeta.

## Resultado

| Camino | Verificación | Resultado |
| --- | --- | --- |
| Versión | `npm run release:smoke` | ✅ v1.0.196 servida + `/api/health` |
| Login/entrada | demo como Dueño/Vendedor (todos los scripts) | ✅ |
| Venta/pedido | `qa-273-275-produccion`: navega al detalle, número visible, carrito vacío | ✅ |
| Venta/pedido | `qa-187-pos-demo`: 11/12 (único fallo: botón «Analytics» con etiqueta vieja) | ✅ (re-verificado) |
| POS Analytics | mini-smoke con selectores actuales: «Analytics del POS» abre | ✅ |
| Inventario | `qa-195` 6/9 (3 fallos por selectores viejos del script) + mini-smoke: «Carga rápida» abre (10 campos), Taller (`barra-taller`) | ✅ |
| Clientes | `qa-221-clientes-produccion`: 8/8, 0 llamadas al API real | ✅ |
| Impresión | `qa-plantilla-prueba`: editor 3/3 en v1.0.196 | ✅ |
| Impresión | `qa-194` 5/10 (fixtures/selectores de #194 ya inexistentes) + mini-smoke: Impresoras demo (banner + lista) | ✅ |

Sin errores de consola ni de red. Las verificaciones de demo hicieron **0
llamadas al API real**.

## Hallazgos

1. **Scripts QA con selectores viejos** (deuda de mantenimiento, no regresiones):
   - `qa-195-demo-inventario`: `#recibir-modelo` (hoy es la carga rápida con otros
     ids), heading `/Servicio/` y el toggle de nav «Inventario».
   - `qa-194-impresion-demo`: fixtures `DEMO-01/02` y botón «Ver cola» (la
     pantalla de impresión cambió con #276/#277).
   - `qa-187-pos-demo`: botón «Analytics» (el flujo abre; el script no llegó a
     clickearlo).
2. **Observaciones de demo (clientes, ficticias):**
   - La ficha cuenta 6 pedidos (incluye la venta cancelada) y el listado/
     estadísticas cuentan 5 compras.
   - Los favoritos de la demo muestran montos en Gs 0 (los ítems demo no traen
     importe).
3. Sin hallazgos funcionales en los caminos críticos.

## Reproducir

- `npm run release:smoke`
- `node scripts/qa-273-275-produccion.mjs` (QA_OUT=<dir>)
- `node scripts/qa-221-clientes-produccion.mjs`
- `node scripts/qa-195-demo-inventario.mjs` (revisar selectores antes)
- `node scripts/qa-194-impresion-demo.mjs` con `QA_BASE_URL=https://app.moboss.online`
- `node scripts/qa-plantilla-prueba.mjs`
