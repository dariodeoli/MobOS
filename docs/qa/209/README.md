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

`main` está en v1.0.131 y la sonda de producción de #171 confirma que la
unificación está desplegada; el **#209 de Finanzas todavía no está integrado**
(la sonda informa que el marcador `fin:gastos-tipo` no aparece en el bundle).
La verificación de este patrón es la local de este documento más el e2e; cuando
el integrador despliegue, se repite `scripts/qa-209-finanzas-ultimo-usado.mjs`
(solo lectura) contra el build publicado.
