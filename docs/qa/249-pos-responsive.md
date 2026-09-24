# #249 · POS responsive: segunda vuelta medida (cobros/split, entrega, teclado, menú, bloqueo)

Auditoría del dominio POS de la épica **#249** (auditoría responsive mobile).
Medición con **cajas reales** en mobile (360/390/414) y tablet (768), sobre la
demo pública, con la sonda re-ejecutable `scripts/qa-249-pos-responsive.mjs`:

```bash
# Antes (producción)
QA_BASE_URL=https://app.moboss.online QA_ETIQUETA=1.0.153-produccion node scripts/qa-249-pos-responsive.mjs
# Después (rama / harness)
QA_BASE_URL=http://localhost:5216 QA_ETIQUETA=rama-249 node scripts/qa-249-pos-responsive.mjs
```

Criterio (#249/#246): en mobile el target táctil llega a **44 px**; desde 768
(`md:`) el layout vuelve compacto sin perder densidad de escritorio.

## Hallazgos y fixes POS (mobile)

| Target | Antes (1.0.153) | Después (rama) |
|---|---|---|
| Carrito · chevron de la línea | 32×32 | **44×44** (32 desde 768) |
| Carrito · chip del IMEI | 60–114×20 | **≥44×44** (compacto desde 768) |
| Carrito · papelera de la línea | 28×28 | **44×44** (28 desde 768) |
| Carrito · «Vaciar carrito» | 100×26 | **≥44 alto** (compacto desde 768) |
| Línea · «Aplicar/Cambiar cupón» | 73×20 | **≥44 alto** |
| Línea · «Quitar IMEI» / «Quitar cupón» | 20 alto | **≥44 alto** |
| Carrito · «Borrar descuento» | 123×30 | **≥44 alto** (compacto desde 768) |
| Cobros · papelera de la fila | 36×36 | **44×44** (36 desde 768) |

Sin hallazgos en el POS (ya cumplían): cuenta de cobro, monto original,
cotización, «+ Agregar pago» y «Dividir saldo» (44 en mobile), botón principal
(48), entrega (select 44, monto 44, observación 46) y el campo del PIN del
bloqueo (181×66).

## Hallazgos de otro dominio (reportados)

| Target | Medida | Dueño |
|---|---|---|
| Menú de tres puntos (disparador) | 36×36 en mobile | Shell (DSN/PLT) |
| Menú de tres puntos (ítems) | 230×36 en mobile | Shell (DSN/PLT) |

## Capturas

- **Antes**: `docs/qa/249-pos-responsive/1.0.153-produccion/` (producción
  v1.0.153: `360|390|414|768-carrito-colapsado|cobros-split|entrega|linea-expandida|menu-tres-puntos|bloqueo-pin.jpg`)
  + `resultados-1.0.153-produccion.json`.
- **Después**: `docs/qa/249-pos-responsive/rama-249/` (mismo set sobre la rama)
  + `resultados-rama-249.json`.
- **Alto de la línea colapsada**: 66 px en escritorio; **82 px en mobile** con
  los targets de 44 (sigue siendo 33% del original de 248 px, #243).

## Verificación durable

- **Guarda e2e**: `e2e/qa-249-pos-touch.spec.js` (admin, 2/2) mide cajas reales
  a 390 (todos los targets ≥44) y a 768 (fila colapsada ≤70 px y chevron
  ≤36: el escritorio no pierde compactación).
- **Gate**: el barrido `responsive` entró al smoke (`has no horizontal overflow`):
  el gate corre 19 pruebas (7 de siempre + 12 del barrido a 360/375/768/1024/1280/1440)
  y queda verde en ~43 s.

## Verificación post-deploy de las entregas (#148 §20 y #243) en v1.0.153

- **Borradores demo**: sonda `scripts/qa-249-demo-borradores.mjs` → capturas
  `1.0.153-produccion-demo-borradores/01-suspendido … 05-descartado.jpg`
  (suspender, listar, aviso del enlace, retomar y descartar, sin errores).
- **Carrito #243**: sonda `scripts/qa-243-carrito-colapso.mjs` →
  `1.0.153-produccion/` (66 px por línea, 0 desbordes, 0 errores, con la papelera).

## Modales del POS en pantalla chica

Auditoría de los modales de venta (escáner, selector de IMEI, suspender venta,
ventas suspendidas y analytics) con la sonda `scripts/qa-249-pos-modales.mjs`
(390/768, capturas en `docs/qa/249-pos-responsive/<etiqueta>-modales/`):

| Target | 390 | Resultado |
|---|---|---|
| Escáner · agregar / cancelar | 44 | ✅ |
| IMEI · Listo (+ reservar cuando el demo tiene unidades) | 44 | ✅ |
| Suspender · etiqueta / cancelar / confirmar | 44 | ✅ |
| Suspendidas · enlace / recuperar / descartar / cerrar | 44 | ✅ |
| Analytics · cerrar (botón del pie) | 44 | ✅ |
| **× del Modal compartido** (imei, suspendidas, analytics) | **25×36** | ❌ **dominio CMP** (`ui/Modal`): pendiente de la biblioteca |

- Guarda e2e: tercer caso de `qa-249-pos-touch.spec.js` (390: suspender,
  suspendidas y escáner con targets de 44).
- **v2 (#241 · paso “modales de venta”)**: capturas con el flag prendido en
  claro y oscuro (`rama-249-modales/390|768-*-v2*.jpg`): los modales heredan el
  scope del shell y se ven en la consola oscura sin retoques locales.

## Hallazgo de CI: 5 specs corrían en el vacío

El `testMatch` del proyecto admin tenía **patrones con doble escape**
(`qa-249-pos-touch\.spec\.js` y otros 4): esos archivos no matcheaban ningún
proyecto y no corrían en CI (ni `--list` ni la distribución de shards se
quejaban). Se corrigieron los escapes y se regeneró `e2e/sharding.json`
(338 tests en 3 shards, 113/113/112); los 5 specs (POS, clientes, DSN,
perf y el informe embebible) pasan en verde (9/9). Guarda nueva en
`src/lib/ciHarness.test.js`: todo `.spec.js` tiene que matchear un proyecto
(6 specs históricos quedan en una lista explícita que no puede crecer).
