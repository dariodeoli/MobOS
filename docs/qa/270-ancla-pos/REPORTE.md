# PR #270 · Ancla de POS en las pruebas (#256)

El rediseño compacto (#256, PR #270) reemplaza el `h1` **«Nueva venta»** por la
barra de módulo con **«POS»**. Las pruebas seguían buscando el título viejo
(~56 casos en 25 specs fuera de los 5 que el propio PR ya había actualizado).

## Cambio

`getByRole('heading', { name: 'Nueva venta' })` →
`getByRole('heading', { name: 'POS', level: 1 })`, el mismo ancla que el PR
aplicó en sus specs (`pos-checkout`, `pos-241-v2`, `pos-241-carrito-estados`,
`pos-148-cobro-ux`, `qa-249-pos-touch`). Los rótulos de la ayuda (F1 «Nueva
venta») no cambian: siguen siendo la acción, no el título.

Commit: `4d053dbd` (rama `slot/plataforma`). 25 archivos, 56 casos.

## Verificación (contra la UI del PR)

Rama local de verificación `tmp/270-pruebas` = cabeza del PR (`5c7f1463`) +
el commit de tests. Se corrieron **las 20 specs tocadas** (156 tests):

| Resultado | Detalle |
| --- | --- |
| ✅ **147 passed** | incluidos `qa-256-composicion`, `auth`, `permissions`, `pos-checkout`, `pos-campos`, `pos-pedidos`, `admin`, `precios-listas`, `ruc-*`, `responsive`, `sesion-bloqueo`, `perf-247`, `inventario-unidades`, `ocultos-plataforma`, `demo-anonimo` |
| ❌ 3 · `pos-148-s11-sin-stock` | **regresión del PR** (selector/guía de IMEI): el selector lista una unidad no disponible (`getByTitle('351790478638913')`); la guía no dice «Seleccioná el IMEI/serial exacto»; no aparece el aviso «Falta elegir el IMEI/serial» |
| ❌ 2 · `dsn-responsive-mobile` | `demo · candado del header` y `segunda vuelta: candado…` fallan **solo porque la base del PR es anterior a #266** (no existe `shell-bloquear`): pasan en `main`; se resuelven al rebasar el PR |
| ❌ 2 · `dsn-responsive-mobile` | «Cargar más pedidos/clientes» (34 px) — **preexistente en `main`** (botones de `SellerOrders`/`SellerCustomers`), ajeno a este cambio |

Comando reproducible:

```bash
git checkout -b tmp/270-pruebas origin/codex/ui-composition-clients-pos
git cherry-pick 4d053dbd
MOBOS_E2E_PGDATA=/tmp/mobos-e2e-pg-MOS-PLT MOBOS_E2E_PGPORT=5504 \
MOBOS_E2E_API_PORT=3104 MOBOS_E2E_WEB_PORT=5204 \
npx playwright test $(git diff --name-only origin/codex/ui-composition-clients-pos tmp/270-pruebas -- e2e | grep -v -- '-prod.spec.js' | tr '\n' ' ')
```

## Orden de integración

El commit de tests **asume la UI del PR**: debe entrar junto con (o después de)
#270. Si el PR se rebasa sobre `main` primero, el commit aplica sin conflictos.

## Actualización 27/09 — ancla compatible con las dos UIs

Para que la rama no quede atada al orden de integración, las **56 búsquedas** de
los 25 specs pasaron a `getByRole('heading', { name: /^(POS|Nueva venta)$/, level: 1 })`:
aceptan el título nuevo (UI del PR #270) y el anterior (main), así que la rama
puede mergearse **antes o después** del PR sin rojos por el título. Los 5 specs
del propio PR conservan su ancla estricta (`«POS»`).
