# QA #209 — «Último usado como predeterminado» en Finanzas

- **Fecha:** 2026-09-21 · **Rama:** `slot/finanzas`
- **Alcance FIN:** Gastos (tipo, moneda y cuenta), Conciliación (cuenta, medio,
  procesadora y estado) y el período de las vistas de Finanzas/Análisis.
- **API compartida:** la ya integrada en `main` — `leerUltimo`, `recordarUltimo`
  y `useUltimoUsado` en `src/lib/ultimoUsado.js` (namespace
  `mobos:ultimo:<clave>`), con `src/lib/demoStorage.js` para la demo. Este slot
  no define helper propio: `src/lib/finUltimoUsado.js` solo aporta claves y
  validaciones del dominio.

## Qué se recuerda (claves `mobos:fin:*`)

| Pantalla | Selección | Clave | Validación al leer |
| --- | --- | --- | --- |
| Gastos | Tipo de movimiento | `fin:gastos-tipo` | debe existir en el catálogo |
| Gastos | Moneda | `fin:gastos-moneda` | debe ser una moneda ofrecida |
| Gastos | Cuenta | `fin:gastos-cuenta` | existe, activa y de la moneda elegida |
| Conciliación | Cuenta / medio / procesadora | `fin:conciliacion-*` | debe seguir en las facetas del período |
| Conciliación | Estado del listado | `fin:conciliacion-estado` | PENDING/VERIFIED/REJECTED |
| Resumen, Reportes y Conciliación | Preset de período | `fin:rango` | debe existir en los presets |

Reglas del patrón respetadas: solo selecciones, siempre cambiables, la pantalla
avisa cuando recordó algo («Tipo, moneda y cuenta arrancan con tu última
elección…» y «Filtros de tu última visita»), «Limpiar filtros» olvida lo
guardado y ningún valor recordado pisa una elección explícita.

## Verificación

`scripts/qa-209-finanzas-ultimo-usado.mjs` (Playwright con sesión real) — 5/5:

1. Gastos: elegir Cheque + USD → recargar → vuelven; aparece el aviso.
2. Gastos: cambiar a Gasto + PYG → recargar → el cambio explícito manda.
3. Conciliación: elegir 7 días + Estado «Conciliados» → recargar → vuelven.
4. Conciliación: elegir un medio → recargar → vuelve y se muestra el aviso.
5. Conciliación: «Limpiar filtros» → recargar → no queda nada recordado.

Capturas: `gastos-ultimo-usado.jpg`, `conciliacion-ultimo-usado.jpg` ·
Resultados: `resultados.json`.

E2E del patrón: `e2e/finanzas-ultimo-usado.spec.js` (2/2) y la regresión de
finanzas + análisis + demo (13/13) más el smoke de entrega (7/7).

## Estado en producción

El lote todavía **no está integrado** en `main` (`3546121`, notas de v1.0.131)
ni desplegado (producción sigue en v1.0.130): el patrón es de frontend, así que
su verificación es la local de este documento. Cuando el integrador despliegue,
se repite la sonda (y la de #171) contra el demo público; la de #171 ya
documenta el estado desplegado (`docs/qa/171/produccion.json`, 6/6 con las
vistas unificadas).
