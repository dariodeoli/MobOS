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

`scripts/qa-209-finanzas-ultimo-usado.mjs` (Playwright con sesión real) — 6/6:

1. Gastos: elegir Cheque + USD → recargar → vuelven; aparece el aviso.
2. Gastos: cambiar a Gasto + PYG → recargar → el cambio explícito manda.
3. Conciliación: elegir 7 días + Estado «Conciliados» → recargar → vuelven.
4. Conciliación: elegir un medio → recargar → vuelve y se muestra el aviso.
5. Conciliación: «Limpiar filtros» → recargar → no queda nada recordado.
6. **Demo**: elegir un tipo en Gastos no escribe `localStorage` y al recargar
   vuelve el default (la preferencia vive en memoria de la pestaña).

Capturas: `gastos-ultimo-usado.jpg`, `conciliacion-ultimo-usado.jpg`,
`demo-sin-persistencia.jpg` · Resultados: `resultados.json`.

E2E del patrón: `e2e/finanzas-ultimo-usado.spec.js` (2/2), más la regresión
`demo-anonimo` + `inventario-unidades` + finanzas/análisis/demo (**30/30**) y el
smoke de entrega (7/7).

### Hallazgo corregido en la pasada final: la demo escribía `localStorage`

El helper integrado de #209 (`src/lib/ultimoUsado.js`) leía/escribía
`localStorage` directo, así que en la demo cualquier selección recordada dejaba
claves `mobos:ultimo:*` — contra la regla de #204 (`e2e/demo-anonimo.spec.js`
solo admite la allow-list de preferencias) y contra la documentación del patrón.
**Fix:** el helper usa `demoStorage` (memoria por pestaña en demo, `localStorage`
fuera), con test propio (`src/lib/ultimoUsadoDemo.test.js`). Es un archivo
compartido: el cambio beneficia a todos los dominios que aplicaron #209 y está
alineado con la auditoría del demo.

## Estado en producción

**Post-deploy verificado el 21-09 (v1.0.132, bundle `index-C6rm8Zvh.js`, con el
lote ya integrado)**: `scripts/qa-209-finanzas-produccion.mjs` corre contra el
demo público y da **6/6** con capturas en `produccion/`:

- El bundle desplegado incluye las claves del patrón (`fin:gastos-tipo`,
  `fin:gastos-moneda`, `fin:gastos-cuenta`, `fin:conciliacion-medio`, `fin:rango`).
- Gastos y Conciliación del demo funcionan, el cambio se puede hacer y **nada
  queda en `localStorage`** (memoria por pestaña).
- El rango vive en la URL (compartible): sobrevive a la recarga por el parámetro
  y al volver sin parámetro manda el default.
- La demo no llama a los endpoints reales de métricas y no hay errores propios.

`npm run release:smoke` confirma la versión publicada. Cuando se publique otra
versión, se repite el mismo comando (solo lectura).
