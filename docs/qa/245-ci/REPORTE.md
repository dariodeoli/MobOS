# CI estable (#245) — seguimiento 26/09

## Racha en `main`

| Run | Commit | Resultado | Duración |
| --- | --- | --- | --- |
| 36189015489 | `c14f110b` chore(release): v1.0.175 | ✅ success | 13m17 |
| 36187652493 | `66a4cde2` chore(release): v1.0.174 | ❌ failure | 12m45 |
| 36185509950 | `01f232d0` chore(release): v1.0.173 | ❌ failure | 12m46 |
| 36167873829 | `9d750790` test(inventario) | ✅ success | 10m41 |
| 36166303898 | `44a2e82a` chore(release): v1.0.172 | ❌ failure | 13m32 |

**Racha actual: 1 verde consecutivo** (v1.0.175). Los dos rojos quedaron
analizados y corregidos; los siguientes pushes del hd suman corridas.

## Rojos analizados (sin cuarentena ni re-run ciego)

1. **v1.0.174 · `dsn-responsive-mobile` («configuración: los 7 grupos»)** —
   causa **real**: los botones «Editar»/«Desactivar» de *Tiendas y sucursales*
   median 35×16/62×16 px (el gate exige ≥44 en móvil). Corregido en `698c016b`
   (`fix(config): … area tactil de 44 px`) y verde en v1.0.175.
2. **v1.0.173 · `finanzas-comisiones` («Configuración ya no las muestra…»)** —
   timeout de **un solo test** (90 s) que en v1.0.175 pasó en **4.4 s**.
   Re-verificado local **6/6** con `--repeat-each=3`: sin causa reproducible →
   flake por carga del runner; no se tocó el spec ni se agregó reintento.

## Hallazgo de esta ronda y fix

El gate de los 7 grupos **flakeaba 2/5 local** aun con main verde: las filas de
listas de precios (`src/components/control/Precios.jsx`) usaban `IconAction` de
**28×28 px** (21 botones «Editar lista»); el gate exige ≥44 en ≤414 px y el
resultado dependía de si las listas alcanzaban a cargar antes de la medición
(por eso pasaba a veces, incluso en CI).

**Fix**: `size="touch"` (44 px) en las tres acciones de la fila
(`Editar`/`Activar-Desactivar`/`Eliminar`), variante que el objeto compartido ya
tenía. El fix vive en `slot/plataforma` (PLT es el slot que sigue el CI; el
componente es del dominio FIN — avisado en el issue).

## Evidencia local (post-fix)

- `e2e/dsn-responsive-mobile.spec.js -g "los 7 grupos" --repeat-each=5` → **5/5**
  (dos rondas seguidas: **10/10**).
- `e2e/finanzas-comisiones.spec.js --repeat-each=3` → **6/6**.
- Antes del fix, el mismo gate: 3/5 con
  `config-comercial 414: «Editar lista» 28x28 ×21`.

## Actualización 26/09 (tarde)

- Racha en `main`: **1 verde** (v1.0.178, run `36218953912`). Los dos rojos
  previos son de la saga del gate touch: `358635c` (test del gate) y `7d8d241`
  (release .177) → corregidos en los commits siguientes; local se re-verificó
  `qa-249-clientes-touch` **3/3** y el gate de los 7 grupos **3/3**.
- `#245` ya estaba **cerrado** con su racha original (3 verdes con causas raíz
  corregidas, comentario de cierre en el issue). Con el historial de hoy, la
  meta de **3 corridas completas verdes consecutivas** todavía no se repite:
  faltan **2**.

## Actualización 27/09 (madrugada) — recuento oficial

`node scripts/qa-ci-racha.mjs --minimo 3` → **1 corrida completa verde
consecutiva** en `main`:

- ✓ `36283548443` · `5360ecb` · **v1.0.188** (5/5 jobs: Frontend, Backend,
  Integración y los 3 shards E2E).
- ✘ `36282723046` · `b0b1602` · v1.0.187 (corta la racha; causas abajo).
- ✓ `36254718751` · `800199d` (verde previa al rojo).

**Faltan 2 verdes** para repetir la meta de 3 corridas completas consecutivas;
las suman los pushes del integrador a `main` (no vale re-run ciego ni
cuarentena). El issue #245 sigue **cerrado** con su racha original documentada.

### Causas raíz del rojo v1.0.187 (corregidas en v1.0.188, `b05a9e2e`)

1. **E2E 1/3 · `dsn-responsive-mobile`** («demo-pos 390: ningún target < 44»):
   el botón «Elegir unidad (2)» de la guía del POS medía **118×32**; quedó con
   área de 44 en `PasoCobro`.
2. **E2E 3/3 · `demo-anonimo`** («Venta registrada correctamente» no aparecía):
   la guía del demo mostraba el paso del accesorio; spec ajustado en el mismo
   commit.

Con la corrección, la corrida de v1.0.188 quedó **verde completa** (5/5 jobs).

### Verificación de #266 en producción — pendiente de deploy

- Script nuevo: `node scripts/qa-266-header-produccion.mjs` (entra por la demo
  pública). Verifica candado de bloqueo, chip → Mi perfil y ausencia de los
  chips retirados; sale 0 si verifica, **2 si todavía no está desplegado**.
- Resultado de hoy: **PENDIENTE DE DEPLOY** — producción sirve **v1.0.188** con
  el header anterior (`menu-acciones`). Evidencia:
  `docs/qa/266-shell-header/produccion/` (`resultados.json` + captura).
- #266 vive en `slot/plataforma` (aún no mergeado): el script queda listo para
  correr después del release que lo incluya.
